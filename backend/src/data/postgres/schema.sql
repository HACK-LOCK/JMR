-- ---------------------------------------------------------------------------
-- Jai Mataji Mobile Repairing - online store.
--
-- One table per entity in backend/src/data/database.ts, so the Postgres store
-- and the local file store describe exactly the same data.
--
-- Choices worth knowing about:
--   * ids are text, not bigint. Bills are numbered ("JMR-2026-00042") and the
--     number is shown on a printed bill, so it is the primary key.
--   * money is numeric(12,2). Never float: a repair shop collects cash in
--     rupees and paise must add up exactly.
--   * times are timestamptz. Every time is stored with its offset so a bill
--     read back in another timezone is still the same moment.
--   * strings are text. A varchar limit is a length trap that only shows up
--     years later, on a customer with a long name.
--   * enums are text with a check constraint. Adding a status later is a
--     one-line change, unlike ALTER TYPE on a Postgres enum.
--
-- Safe to run repeatedly. Every statement is idempotent.
-- ---------------------------------------------------------------------------

-- --- Single row tables -----------------------------------------------------
-- A settings row and a meta row exist from the moment setup finishes, so the
-- app never has to insert its own first row and race with itself.
create table if not exists settings (
  id                  smallint primary key default 1 check (id = 1),
  shop_name           text        not null default '',
  contact1_name       text        not null default '',
  contact1_number     text        not null default '',
  contact2_name       text        not null default '',
  contact2_number     text        not null default '',
  address             text        not null default '',
  service_description text        not null default '',
  upi_id              text        not null default '',
  receipt_information text        not null default '',
  bill_footer         text        not null default '',
  allow_negative_stock boolean   not null default false,
  sheet_name          text        not null default 'ShopData',
  updated_at          timestamptz not null default now()
);

-- order_sequence is one plain integer for the whole shop, not a jsonb map of
-- per-year counters. A single number has no shape to get wrong, and "the next
-- bill number" is then a single number two phones cannot each read as their own.
create table if not exists meta (
  id              smallint primary key default 1 check (id = 1),
  order_sequence  integer     not null default 0,
  last_push_at    timestamptz,
  last_pull_at    timestamptz,
  created_at      timestamptz not null default now()
);

-- An older database may still carry the jsonb counter as {"2026": 41}. The
-- highest value it holds becomes the single integer, so the numbers already
-- printed on bills are not reissued.
--
-- Written as plpgsql rather than one UPDATE because at this point the column is
-- still jsonb: putting it into greatest() next to a bigint has no matching
-- function, and casting a whole {"2026": 41} object straight to integer fails
-- too. So read the number out first, then store it, then change the type.
do $$
declare
  highest bigint := 0;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'meta' and data_type = 'jsonb'
  ) then
    -- A per-year object, a bare number, or something unrecognised all end up as
    -- a sensible starting point rather than stopping the setup.
    select case
             when jsonb_typeof(order_sequence) = 'object' then coalesce((
               select max(value::bigint) from jsonb_each_text(order_sequence)
                where value ~ '^[0-9]+$'
             ), 0)
             when order_sequence::text ~ '^[0-9]+$' then order_sequence::text::bigint
             else 0
           end
      into highest
      from meta
     where id = 1;

    execute $migrate$ update meta set order_sequence = $1::integer where id = 1 $migrate$
      using highest::integer;

    alter table meta alter column order_sequence type integer using order_sequence::integer;
    alter table meta alter column order_sequence set default 0;
  end if;
end $$;

-- --- Users (staff logins) ---------------------------------------------------
-- Staff accounts live here rather than in a file on the server, because Render
-- wipes its filesystem on every deploy: accounts kept in a file would all
-- disappear on the next release and nobody could log in. The password is only
-- ever stored as a bcrypt hash - the plain password is never written down.
create table if not exists users (
  id            text        primary key,
  name          text        not null default '',
  username      text        not null unique,
  password_hash text        not null default '',
  role          text        not null default 'STAFF',
  active        boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_role_check' and conrelid = 'public.users'::regclass) then
    alter table users add constraint users_role_check
      check (role in ('OWNER', 'STAFF'));
  end if;
end $$;

create index if not exists users_username_idx on users (lower(username));

-- --- Customers -------------------------------------------------------------
create table if not exists customers (
  id         text        primary key,
  name       text        not null default '',
  mobile     text        not null default '',
  alt_mobile text        not null default '',
  email      text        not null default '',
  address    text        not null default '',
  notes      text        not null default '',
  created_at timestamptz,
  updated_at timestamptz
);

-- The counter searches by mobile first, then by name.
create index if not exists customers_mobile_idx on customers (mobile);
create index if not exists customers_name_idx on customers (lower(name));

-- --- Orders (the bills) ----------------------------------------------------
create table if not exists orders (
  id                  text        primary key,
  customer_id         text        not null default '',
  -- Name and mobile are copied onto the bill on purpose: a bill must still
  -- print correctly years later even if the customer record is edited, so this
  -- is not a foreign key.
  customer_name       text        not null default '',
  mobile              text        not null default '',
  device_type         text        not null default '',
  brand               text        not null default '',
  model               text        not null default '',
  complaint           text        not null default '',
  imei                text        not null default '',
  device_condition    text        not null default '',
  accessories         text        not null default '',
  expected_delivery   timestamptz,
  technician          text        not null default '',
  notes               text        not null default '',
  photos              text[]      not null default '{}',
  status              text        not null default 'Received',
  received_at         timestamptz,
  delivered_at        timestamptz,
  delivered_to        text        not null default '',
  estimated_amount    numeric(12,2) not null default 0,
  final_amount        numeric(12,2) not null default 0,
  discount            numeric(12,2) not null default 0,
  paid_amount         numeric(12,2) not null default 0,
  payment_status      text        not null default 'Unpaid',
  payment_mode        text        not null default 'Cash',
  bill_drive_file_id  text        not null default '',
  bill_drive_link     text        not null default '',
  bill_printed_at     timestamptz,
  created_by          text        not null default '',
  created_at          timestamptz,
  updated_at          timestamptz,
  -- Always false with Postgres: the write reached the database or the request
  -- failed, so there is never a "saved here, not there" state to retry.
  pending_sync        boolean     not null default false
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_status_check' and conrelid = 'public.orders'::regclass) then
    alter table orders add constraint orders_status_check
      check (status in ('Received', 'Checking', 'Waiting for Approval', 'Approved', 'Repairing',
                        'Waiting for Part', 'Ready', 'Delivered', 'Cancelled', 'Unable to Repair'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_payment_status_check' and conrelid = 'public.orders'::regclass) then
    alter table orders add constraint orders_payment_status_check
      check (payment_status in ('Unpaid', 'Partially Paid', 'Paid'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_payment_mode_check' and conrelid = 'public.orders'::regclass) then
    alter table orders add constraint orders_payment_mode_check
      check (payment_mode in ('Cash', 'UPI', 'Card', 'Bank Transfer', 'Other'));
  end if;
end $$;

-- The dashboard asks "where is my stock today" and the bill list asks "bills
-- between these dates", over and over, so both are indexed.
create index if not exists orders_received_at_idx on orders (received_at desc);
create index if not exists orders_status_idx on orders (status);
create index if not exists orders_mobile_idx on orders (mobile);
create index if not exists orders_payment_status_idx on orders (payment_status);
create index if not exists orders_customer_id_idx on orders (customer_id);

-- --- Payments --------------------------------------------------------------
create table if not exists payments (
  id              text        primary key,
  order_id        text        not null,
  amount          numeric(12,2) not null default 0,
  mode            text        not null default 'Cash',
  status          text        not null default 'Unpaid',
  note            text        not null default '',
  date            timestamptz,
  user_name       text        not null default '',
  -- The app sends the same key when a payment is retried, so a double tap on
  -- a slow connection cannot collect the money twice.
  idempotency_key text        not null default '',
  created_at      timestamptz,
  updated_at      timestamptz,
  foreign key (order_id) references orders (id) on delete cascade
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payments_mode_check' and conrelid = 'public.payments'::regclass) then
    alter table payments add constraint payments_mode_check
      check (mode in ('Cash', 'UPI', 'Card', 'Bank Transfer', 'Other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payments_status_check' and conrelid = 'public.payments'::regclass) then
    alter table payments add constraint payments_status_check
      check (status in ('Unpaid', 'Partially Paid', 'Paid'));
  end if;
end $$;

-- Partial, so the many rows with no key do not collide with each other.
create unique index if not exists payments_idempotency_idx
  on payments (idempotency_key) where idempotency_key <> '';
create index if not exists payments_order_id_idx on payments (order_id);
create index if not exists payments_date_idx on payments (date desc);

-- --- Parts -----------------------------------------------------------------
create table if not exists parts (
  id            text        primary key,
  name          text        not null default '',
  category      text        not null default '',
  brand         text        not null default '',
  model         text        not null default '',
  quantity      integer     not null default 0,
  min_quantity  integer     not null default 0,
  purchase_cost numeric(12,2) not null default 0,
  selling_price numeric(12,2) not null default 0,
  -- supplier_name is copied onto the item, like the name on a bill: deleting a
  -- supplier must not rewrite the history of what was bought from them.
  supplier_id   text        not null default '',
  supplier_name text        not null default '',
  consume_mode  text        not null default 'PART_USED',
  active        boolean     not null default true,
  created_at    timestamptz,
  updated_at    timestamptz
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'parts_consume_mode_check' and conrelid = 'public.parts'::regclass) then
    alter table parts add constraint parts_consume_mode_check
      check (consume_mode in ('PART_USED', 'DELIVERY'));
  end if;
  -- No constraint on quantity on purpose: whether stock may go below zero is a
  -- setting the owner controls in the app (ALLOW_NEGATIVE_STOCK), and a check
  -- constraint here would silently reject a sale the app had already allowed.
end $$;

create index if not exists parts_active_idx on parts (active);
create index if not exists parts_category_idx on parts (category);
create index if not exists parts_name_idx on parts (lower(name));
create index if not exists parts_supplier_id_idx on parts (supplier_id);

-- --- Order parts -----------------------------------------------------------
create table if not exists order_parts (
  id           text        primary key,
  order_id     text        not null,
  -- part_id is deliberately not a foreign key: a bill line must survive the
  -- part being deleted from the shelf six months later.
  part_id      text        not null default '',
  part_name    text        not null default '',
  quantity     integer     not null default 0,
  unit_price   numeric(12,2) not null default 0,
  consumed     boolean     not null default false,
  consumed_at  timestamptz,
  consume_mode text        not null default 'PART_USED',
  created_at   timestamptz,
  updated_at   timestamptz,
  foreign key (order_id) references orders (id) on delete cascade
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'order_parts_consume_mode_check' and conrelid = 'public.order_parts'::regclass) then
    alter table order_parts add constraint order_parts_consume_mode_check
      check (consume_mode in ('PART_USED', 'DELIVERY'));
  end if;
end $$;

create index if not exists order_parts_order_id_idx on order_parts (order_id);
create index if not exists order_parts_part_id_idx on order_parts (part_id);

-- --- Stock movements -------------------------------------------------------
create table if not exists stock_movements (
  id              text        primary key,
  part_id         text        not null default '',
  part_name       text        not null default '',
  order_id        text        not null default '',
  type            text        not null default 'IN',
  quantity        integer     not null default 0,
  reason          text        not null default '',
  -- Stock level right after this movement, so the ledger can be checked.
  balance_after   integer     not null default 0,
  date            timestamptz,
  user_name       text        not null default '',
  idempotency_key text        not null default '',
  created_at      timestamptz
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stock_movements_type_check' and conrelid = 'public.stock_movements'::regclass) then
    alter table stock_movements add constraint stock_movements_type_check
      check (type in ('IN', 'OUT', 'RETURN', 'ADJUST'));
  end if;
end $$;

create unique index if not exists stock_movements_idempotency_idx
  on stock_movements (idempotency_key) where idempotency_key <> '';
create index if not exists stock_movements_part_id_idx on stock_movements (part_id);
create index if not exists stock_movements_order_id_idx on stock_movements (order_id);
create index if not exists stock_movements_date_idx on stock_movements (date desc);

-- --- Suppliers -------------------------------------------------------------
create table if not exists suppliers (
  id         text        primary key,
  name       text        not null default '',
  mobile     text        not null default '',
  notes      text        not null default '',
  created_at timestamptz,
  updated_at timestamptz
);

create index if not exists suppliers_name_idx on suppliers (lower(name));

-- --- Status history --------------------------------------------------------
create table if not exists status_history (
  id          text        primary key,
  order_id    text        not null,
  from_status text        not null default '',
  to_status   text        not null default '',
  at          timestamptz,
  user_name   text        not null default '',
  foreign key (order_id) references orders (id) on delete cascade
);

create index if not exists status_history_order_id_idx on status_history (order_id);
create index if not exists status_history_at_idx on status_history (at desc);

-- --- Security --------------------------------------------------------------
-- Every table is behind Row Level Security. The tables live in the public
-- schema, which Supabase also publishes through its Data API - without RLS the
-- anon key alone would be enough to read every bill in the shop. With RLS on
-- and no policy for anon or authenticated, nothing is readable through the API.
alter table settings            enable row level security;
alter table meta                enable row level security;
alter table customers          enable row level security;
alter table orders             enable row level security;
alter table payments           enable row level security;
alter table parts              enable row level security;
alter table order_parts        enable row level security;
alter table stock_movements    enable row level security;
alter table suppliers          enable row level security;
alter table status_history     enable row level security;
alter table users              enable row level security;

-- Take the defaults back from PUBLIC so a new table is never world readable.
revoke all on schema public from public;
revoke all on all tables in schema public from public;
alter default privileges for role postgres revoke all on tables from public;

insert into settings (id) values (1) on conflict (id) do nothing;
insert into meta (id) values (1) on conflict (id) do nothing;
