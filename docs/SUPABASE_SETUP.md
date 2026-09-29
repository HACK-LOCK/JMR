# Supabase / online database setup

The shop's bills can live in a Supabase Postgres database instead of a file on
one computer. This is what makes the app usable from more than one device at the
same time.

**Read this before running anything.** It creates real tables and a real login.

---

## What changes when you do this

| | Local file mode | Online database mode |
|---|---|---|
| Where bills live | `backend/.data/shop-data.json` on this computer | Supabase Postgres |
| Two devices at once | No - each has its own copy | Yes, they see each other |
| Survives a redeploy | Yes (file is in the repo folder) | Yes |
| Staff logins | `backend/.data/users.json` | The `users` table |
| A database outage | Not applicable | The server stops rather than saving bills somewhere else |
| Google Sheets | The store | A read-only copy, only receives |

Nothing is carried over from the local file. **The database starts empty and is
filled only by real bills.** That is deliberate: a demo or test bill that lands
in the day's takings is not something anybody can spot later, and there is no way
to be sure a hand-typed old file is complete and correct.

`npm run seed` refuses to run while `DATABASE_URL` is set, for the same reason.

---

## 1. Create the project

1. Create a project at supabase.com. Region: pick the one nearest the shop
   (Mumbai / ap-south-1 is the usual choice for India).
2. Note the project URL, the database password, and the region.
3. Keep the project on the free plan to start. A small shop's bills and stock
   movements are a tiny amount of data.

## 2. Put the admin URL in `.env`

In the Supabase dashboard: **Project Settings → Database → Connection string**.

There are several. You want the **Session pooler** one, on port **5432**:

```
postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

Put it in `.env` as `POSTGRES_ADMIN_URL`.

> This is the **superuser** password. It is used once, by the setup script, and
> then you empty it again. It is not the URL the app runs on.

**Session pooler, not transaction pooler.** The app takes a database lock for the
length of a write so two devices cannot allocate the same bill number, and
transaction mode (port 6543) releases the connection between statements, which
would quietly break that.

## 3. Create the tables

```powershell
npm run db:setup
```

This runs against `POSTGRES_ADMIN_URL` and does four things:

1. Creates the login role the app will use, `jmmr_app`, with a generated
   password. It can read and write the shop's tables and nothing else - no
   `CREATE`, no `DROP`, so a compromised server cannot take the tables away.
2. Creates the tables, with Row Level Security on every one of them. Without
   RLS the anonymous Supabase key alone would be enough to read every bill in
   the shop, because the tables are in the public schema.
3. Grants that role access.
4. Creates the first owner login.

It prints the `DATABASE_URL` to use, and the first owner's username and
password. Copy the URL into `.env` as `DATABASE_URL`, then **empty
`POSTGRES_ADMIN_URL`**.

If `OWNER_PASSWORD` was left blank in `.env`, setup generates a password and
prints it once. That is what you want for a real shop: a default password that
reaches a real database is the entire account system for nothing.

Safe to run again - it will not touch an account that already exists, so
re-running to add a table cannot reset a password somebody has changed.

## 4. Check it

```powershell
npm run db:check
```

Should print the shop name, `0` bills, the number of staff accounts, and the
next bill number. If it says the database cannot be reached, `DATABASE_URL` is
wrong or the password was reset in the dashboard.

## 5. Run it

```powershell
npm run dev
```

The banner should say `Online database (Supabase Postgres)`. If it says
`local file`, `DATABASE_URL` is empty or misspelled.

Open the app and log in with the owner account. **Change that password
immediately** from the account screen.

---

## Deploying to Render

Build command `npm ci && npm run build`, start command `npm start`, Node 20 or
newer, health check path `/api/health`.

Environment variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the `jmmr_app` URL printed by `db:setup` |
| `POSTGRES_ADMIN_URL` | **leave unset** |
| `JWT_SECRET` | a long random string |
| `NODE_ENV` | `production` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | the service account JSON, on one line |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | the Drive folder for bill PDFs |
| `DB_REFRESH_MS` | `2000` (optional) |
| `SHEETS_MIRROR` | `true` if a spreadsheet copy is wanted |

No Persistent Disk is needed. Staff logins are in the database, so a deploy that
wipes the filesystem does not lock anybody out - which is exactly the reason
they moved there.

Nothing Supabase-shaped is needed by the app beyond the connection string. There
is no `SUPABASE_URL`, no anon key and no service-role key in the frontend,
because the app talks to Postgres directly from the server and the browser never
holds a database credential.

---

## The Google Sheets copy

If a spreadsheet is connected while the database is in use, it becomes a **copy**:

- Bills are written to the database first, then copied to the spreadsheet by
  stable ID, so the same bill is updated in place and can never appear twice.
- A bill is **never** changed by editing a spreadsheet. A bill amount, a payment
  or a stock figure is not something that should be changeable by editing a cell
  in a browser, so **Pull** and **Import** are off in this mode.
- If Google is unreachable the bill is still saved. The screen says the copy is
  behind, and retries - including a full re-copy whenever the server restarts, so
  a row that a failure missed cannot stay missed.

Set `SHEETS_MIRROR=false` to run with no spreadsheet copy at all.

---

## Bill numbers

One counter for the whole shop, as a single integer in the `meta` table. The
first bill is `JMR-0001` and it never restarts on a new day or a new year.

Two devices saving at the same instant cannot produce the same number: each
write takes a database lock and re-reads the rows it is about to change from
inside its own transaction. The second writer therefore sees the first one's
result rather than whatever copy it happened to be holding.

---

## If something is wrong

**"The database has no staff accounts yet"** - run `npm run db:setup`.

**Server will not start, database cannot be reached** - that is deliberate. The
app refuses to fall back to a local file, because a shop that quietly saves the
day into a file on one PC while everyone else is looking at the database is
worse than a server that is plainly down. Check `DATABASE_URL` and confirm the
project is not paused.

**Reads look stale** - `DB_REFRESH_MS` controls how often a screen re-reads the
shop. Raise it if the counters are busy.

**"Could not reach the database" on login** - the same connection check, and the
shop is asked to log in again rather than being let through unverified. The
health endpoint is what reports the database as down.
