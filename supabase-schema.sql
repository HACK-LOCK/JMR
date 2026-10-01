-- ===========================================================================
-- Supabase Schema for Jai Mataji Mobile Repairing
-- Project: uvyszkdszzadoycbmeiy
-- Run this script in the Supabase Dashboard:
-- https://supabase.com/dashboard/project/uvyszkdszzadoycbmeiy/sql/new
--
-- This creates all tables for storing bills (orders), customers, payments,
-- device repair records, parts, and stock movements, and sets up RLS policies
-- that allow your publishable key (anon role) and authenticated users to
-- store and read bills cleanly.
-- ===========================================================================

-- 1. Customers
create table if not exists public.customers (
  id         text primary key,
  name       text not null default '',
  mobile     text not null default '',
  alt_mobile text not null default '',
  email      text not null default '',
  address    text not null default '',
  notes      text not null default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists customers_mobile_idx on public.customers (mobile);
create index if not exists customers_name_idx on public.customers (lower(name));

-- 2. Orders (The Bills)
create table if not exists public.orders (
  id                  text primary key,
  customer_id         text not null default '',
  customer_name       text not null default '',
  mobile              text not null default '',
  device_type         text not null default 'Mobile',
  brand               text not null default '',
  model               text not null default '',
  complaint           text not null default '',
  imei                text not null default '',
  device_condition    text not null default 'Good',
  accessories         text not null default '',
  expected_delivery   timestamptz,
  technician          text not null default '',
  notes               text not null default '',
  photos              text[] not null default '{}',
  status              text not null default 'Received',
  received_at         timestamptz default now(),
  delivered_at        timestamptz,
  delivered_to        text not null default '',
  estimated_amount    numeric(12,2) not null default 0,
  final_amount        numeric(12,2) not null default 0,
  discount            numeric(12,2) not null default 0,
  paid_amount         numeric(12,2) not null default 0,
  payment_status      text not null default 'Unpaid',
  payment_mode        text not null default 'Cash',
  bill_drive_file_id  text not null default '',
  bill_drive_link     text not null default '',
  bill_printed_at     timestamptz,
  created_by          text not null default '',
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  pending_sync        boolean not null default false
);

create index if not exists orders_received_at_idx on public.orders (received_at desc);
create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_mobile_idx on public.orders (mobile);
create index if not exists orders_payment_status_idx on public.orders (payment_status);
create index if not exists orders_customer_id_idx on public.orders (customer_id);

-- 3. Payments
create table if not exists public.payments (
  id              text primary key,
  order_id        text not null,
  amount          numeric(12,2) not null default 0,
  mode            text not null default 'Cash',
  status          text not null default 'Paid',
  note            text not null default '',
  date            timestamptz default now(),
  user_name       text not null default '',
  idempotency_key text not null default '',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  foreign key (order_id) references public.orders (id) on delete cascade
);

create index if not exists payments_order_id_idx on public.payments (order_id);
create index if not exists payments_date_idx on public.payments (date desc);

-- 4. Order Parts
create table if not exists public.order_parts (
  id           text primary key,
  order_id     text not null,
  part_id      text not null default '',
  part_name    text not null default '',
  quantity     integer not null default 0,
  unit_price   numeric(12,2) not null default 0,
  consumed     boolean not null default false,
  consumed_at  timestamptz,
  consume_mode text not null default 'PART_USED',
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  foreign key (order_id) references public.orders (id) on delete cascade
);

create index if not exists order_parts_order_id_idx on public.order_parts (order_id);
create index if not exists order_parts_part_id_idx on public.order_parts (part_id);

-- 5. Parts Catalog
create table if not exists public.parts (
  id            text primary key,
  name          text not null default '',
  category      text not null default '',
  brand         text not null default '',
  model         text not null default '',
  quantity      integer not null default 0,
  min_quantity  integer not null default 0,
  purchase_cost numeric(12,2) not null default 0,
  selling_price numeric(12,2) not null default 0,
  supplier_id   text not null default '',
  supplier_name text not null default '',
  consume_mode  text not null default 'PART_USED',
  active        boolean not null default true,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 6. Stock Movements
create table if not exists public.stock_movements (
  id              text primary key,
  part_id         text not null default '',
  part_name       text not null default '',
  order_id        text not null default '',
  type            text not null default 'IN',
  quantity        integer not null default 0,
  reason          text not null default '',
  balance_after   integer not null default 0,
  date            timestamptz default now(),
  user_name       text not null default '',
  idempotency_key text not null default '',
  created_at      timestamptz default now()
);

-- 7. Suppliers
create table if not exists public.suppliers (
  id         text primary key,
  name       text not null default '',
  mobile     text not null default '',
  notes      text not null default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 8. Status History
create table if not exists public.status_history (
  id          text primary key,
  order_id    text not null,
  from_status text not null default '',
  to_status   text not null default '',
  at          timestamptz default now(),
  user_name   text not null default '',
  foreign key (order_id) references public.orders (id) on delete cascade
);

-- 9. Settings
create table if not exists public.settings (
  id                  smallint primary key default 1 check (id = 1),
  shop_name           text not null default 'Jai Mataji Mobile Repairing',
  contact1_name       text not null default 'Ashok Bhai',
  contact1_number     text not null default '9974298866',
  contact2_name       text not null default 'Mitesh',
  contact2_number     text not null default '9327394978',
  address             text not null default 'M. Tower Chowk, Opposite Market Yard, Modasa Road, Talod',
  service_description text not null default '',
  upi_id              text not null default '',
  receipt_information text not null default 'Device not collected within 90 days may be disposed off.',
  bill_footer         text not null default 'Thank you! Visit again.',
  allow_negative_stock boolean not null default false,
  sheet_name          text not null default 'ShopData',
  updated_at          timestamptz not null default now()
);

-- 10. Meta / Counter
create table if not exists public.meta (
  id             smallint primary key default 1 check (id = 1),
  order_sequence integer not null default 0,
  last_push_at   timestamptz,
  last_pull_at   timestamptz,
  created_at     timestamptz not null default now()
);

insert into public.settings (id) values (1) on conflict (id) do nothing;
insert into public.meta (id) values (1) on conflict (id) do nothing;

-- 11. View: bills (alias to orders)
create or replace view public.bills as
  select * from public.orders;

-- ===========================================================================
-- Permissions & Row Level Security (RLS)
-- Enables client access using the Publishable Key (anon role) and authenticated users.
-- ===========================================================================

-- Grant schema usage
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines in schema public to anon, authenticated, service_role;

-- Alter default privileges for future tables
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- Enable RLS
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.order_parts enable row level security;
alter table public.parts enable row level security;
alter table public.stock_movements enable row level security;
alter table public.suppliers enable row level security;
alter table public.status_history enable row level security;
alter table public.settings enable row level security;
alter table public.meta enable row level security;

-- Policies for public.customers
drop policy if exists "Enable all for anon and auth on customers" on public.customers;
create policy "Enable all for anon and auth on customers" on public.customers
  for all to anon, authenticated using (true) with check (true);

-- Policies for public.orders
drop policy if exists "Enable all for anon and auth on orders" on public.orders;
create policy "Enable all for anon and auth on orders" on public.orders
  for all to anon, authenticated using (true) with check (true);

-- Policies for public.payments
drop policy if exists "Enable all for anon and auth on payments" on public.payments;
create policy "Enable all for anon and auth on payments" on public.payments
  for all to anon, authenticated using (true) with check (true);

-- Policies for public.order_parts
drop policy if exists "Enable all for anon and auth on order_parts" on public.order_parts;
create policy "Enable all for anon and auth on order_parts" on public.order_parts
  for all to anon, authenticated using (true) with check (true);

-- Policies for public.parts
drop policy if exists "Enable all for anon and auth on parts" on public.parts;
create policy "Enable all for anon and auth on parts" on public.parts
  for all to anon, authenticated using (true) with check (true);

-- Policies for public.stock_movements
drop policy if exists "Enable all for anon and auth on stock_movements" on public.stock_movements;
create policy "Enable all for anon and auth on stock_movements" on public.stock_movements
  for all to anon, authenticated using (true) with check (true);

-- Policies for public.suppliers
drop policy if exists "Enable all for anon and auth on suppliers" on public.suppliers;
create policy "Enable all for anon and auth on suppliers" on public.suppliers
  for all to anon, authenticated using (true) with check (true);

-- Policies for public.status_history
drop policy if exists "Enable all for anon and auth on status_history" on public.status_history;
create policy "Enable all for anon and auth on status_history" on public.status_history
  for all to anon, authenticated using (true) with check (true);

-- Policies for public.settings
drop policy if exists "Enable all for anon and auth on settings" on public.settings;
create policy "Enable all for anon and auth on settings" on public.settings
  for all to anon, authenticated using (true) with check (true);

-- Policies for public.meta
drop policy if exists "Enable all for anon and auth on meta" on public.meta;
create policy "Enable all for anon and auth on meta" on public.meta
  for all to anon, authenticated using (true) with check (true);
