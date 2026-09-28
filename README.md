# Jai Mataji Mobile Repairing — Shop Manager

A simple, mobile-first Progressive Web App for a phone & electronics repair shop.
Runs entirely on your own computer. Works offline. No monthly SaaS bill.

Two things, kept deliberately separate:

- **Google Sheets** — a readable, shareable backup of your records.
- **Google Drive** — one PDF bill per repair, filed by year.

If Google is not connected the shop still works fully; bills are just not uploaded.

---

## What it does

The app has **two separate areas**:

- **JMR — BILLING** — customers, bills and money. No stock numbers anywhere.
- **JMR — STOCK** — items, suppliers and sync. Opens behind its own PIN.

**Billing**

- Home shows Today's Collection, four tappable status cards, the last few bills
  with **Call** and **WhatsApp** buttons on each row
- New bill in four steps: customer → device and problem → amount → save
- Returning customer is found by mobile number while you type
- Date chips: Today, Tomorrow, 2 Days, 3 Days or any custom date
- Bill IDs are one continuous series for the whole shop: `JMR-0001`, `JMR-0002`, …
- All Bills / Orders has a From Date / To Date report — tap Received, Delivered
  or Pending to see exactly those bills
- Status flow: Received → Checking → Waiting for Approval → Approved → Repairing → Waiting for Part → Ready → Delivered
- Every status change is logged with the person and the time
- Search by bill number, name, mobile number or device

**Money**

- Advance at counter, part payment, or full payment
- Balance is always derived, never typed — it cannot drift
- You cannot bill an order for less than the items already fitted to it (use *Discount* instead)
- A device cannot go back to the customer until it is `Ready` and nothing is outstanding

**Stock** (behind the PIN)

- One screen: All Items, Low Stock, Stock In, Stock Out, Suppliers, Sheet Sync, Settings
- Summary cards for item count, units on hand, stock value and low items
- Add an item in one screen — two columns on a desktop, one big Save button
- Two ways an item leaves stock:
  - `PART_USED` — the item leaves **when you take it out in Stock Out** (so a reserved item that is never fitted costs nothing)
  - `CONSUME_ON_DELIVERY` — folders, packaging, sleeves: leave stock on handover
- Stock In, Stock Out, Return and Count Correction, all with reasons
- Full movement history per item
- Low stock warnings

**Bills**

- A5 PDF with your shop name, address, phones and UPI ID
- One file per bill number in `Bills/2026/` — later edits **update** the same file
- Printed straight from the phone
- The WhatsApp bill text is built from your own shop settings, so it never sends a wrong name or number

**Customers & suppliers**

- Customer history with total spent and outstanding balance
- Supplier list, linked to the items they supply

---

## Requirements

- Node.js 20 or newer
- A phone or tablet (optional — it works on a desktop too)

---

## Setup

```bash
npm install
npm run build
npm start
```

Open <http://localhost:4000>.

Sign in with the owner account:

- **Username:** `ashok`
- **Password:** `shop1234`

> Change this before real use — see [Configuration](#configuration).

### For development

```bash
npm run dev
```

Runs the API on port 4000 and the Vite dev server on 5173 with hot reload.
Open <http://localhost:5173>.

---

## Using it on your phone

The app is a PWA, so it installs to the home screen and keeps working without
internet.

1. Put the computer and phone on the same Wi-Fi.
2. Find the computer's local IP address (Windows: `ipconfig`).
3. On the phone, open `http://<computer-ip>:4000`.
4. Use the browser menu → **Add to Home Screen**.

Note that `http://` on a local network works for installing, but service workers
and offline caching require HTTPS. For day-to-day use on a shop counter, see
[Putting it online](#putting-it-online).

---

## Configuration

Everything is optional — the app runs with no configuration at all.
Create a `.env` file in the project root to change any of it.

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `4000` | Port the server listens on |
| `JWT_SECRET` | insecure dev value | **Change this.** Signs login tokens |
| `OWNER_NAME` | `Ashok Bhai` | Name printed on bills |
| `OWNER_USERNAME` | `ashok` | First login |
| `OWNER_PASSWORD` | `shop1234` | First login — **change this** |
| `DATA_DIR` | `backend/.data` | Where the local database file lives |
| `ALLOW_NEGATIVE_STOCK` | `false` | Allow stock to go below zero |
| `STOCK_PIN` | — | PIN for JMR — STOCK. If empty, your own account password is accepted |
| `STOCK_PIN_TTL_MINUTES` | `120` | How long the Stock area stays open |
| `STOCK_PIN_MAX_ATTEMPTS` | `5` | Wrong tries before a short cool-down |
| `CORS_ORIGINS` | — | Extra origins allowed to call the API |

The owner account is created on first run only.

**Change the password before real use:** open **JMR — STOCK → Settings →
Accounts → Change my password**. It asks for the current password, so
nobody can take over an account that was left signed in.

Other accounts are added in the same screen.

`OWNER_USERNAME` / `OWNER_PASSWORD` in `.env` only apply when the database is
created for the first time. Changing them later has no effect — use the app.

**The Stock PIN** is checked by the server only — it is never stored in the
browser. Setting `STOCK_PIN` to a short number is the quickest way in; leaving
it empty means the person signs in with their normal password instead.

---

## Google Sheets & Drive (optional)

The shop works fully without this. Add it when you want a spreadsheet backup
and automatic PDF bills in Drive.

**The short version**

1. In the [Google Cloud console](https://console.cloud.google.com/), create a
   project and enable the **Google Sheets** and **Google Drive** APIs.
2. Create a **Service Account** and download its JSON key.
3. Put the key in `backend/service-account.json`. Any service account `.json`
   in that folder is found automatically, whatever it is named.
4. Create a Google Sheet, then **Share** it with the service account's
   `client_email` as **Editor**.
5. Create a folder in your own Drive for bills and share it the same way. A
   service account has no storage of its own, so this is the only way it can
   save PDFs.
6. Open **JMR — STOCK → Sheet Sync → Connect Google** and paste both
   links. The screen shows a live checklist and only unlocks the connect
   button once Google confirms the sheet.

Check the connection at any time, without opening the app:

```bash
npm run google:check
```

**Full walkthrough, with the reasoning behind each step:**
[docs/GOOGLE_SETUP.md](docs/GOOGLE_SETUP.md)

To skip the app screen entirely, set the IDs in `.env`:

```ini
GOOGLE_SHEETS_ID=1AbCdEf...
GOOGLE_DRIVE_ROOT_FOLDER_ID=1XyZwVuTsRq
GOOGLE_SERVICE_ACCOUNT_FILE=backend/service-account.json
```

You can also paste the key inline instead of using a file:

```ini
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account", ...}
```

### How the two are used

- **Sheets** — one tab per dataset (orders, customers, parts, suppliers,
  payments, stock movements). The local database stays the source of truth; the
  sheet is pushed to after each change. If a push fails it is queued and
  retried, and the app carries on working.
- **Drive** — bills are written to `<Your Shop Name>/Bills/<year>/<Month>/<ORDER-ID>.pdf`.
  The first save creates the file; every later edit updates that same file.

If Drive is unreachable, bill generation never blocks the repair workflow — the
API returns a warning and the work continues.

---

## Putting it online

HTTPS is required for installing the PWA and for offline mode. Any of these
work, cheapest first:

- **Cloudflare Tunnel** — free, no port forwarding, gives a real HTTPS address
- **ngrok** — free tier, good for testing
- **Your own domain + Caddy** — Caddy gets you HTTPS automatically

Point whichever you choose at port 4000. Keep the tunnel URL in `CORS_ORIGINS`
if you also serve the frontend separately.

---

## Data & backups

- The local database is a single JSON file: `backend/.data/shop-data.json`
- Writes are atomic (write to a temp file, then rename) so a power cut cannot
  corrupt it
- **Back it up by copying that file.** Sheet Sync is a second copy, not a
  replacement

To wipe test data and start clean:

```bash
rm -rf backend/.data
```

---

## Verifying an install

```bash
npm test              # everything: render check, then both API suites
npm run test:render   # renders every screen and inspects the markup
npm run test:api      # both API suites on a throwaway server
npm run test:smoke    # business rules, against a server you started
npm run test:e2e      # full HTTP workflow + dashboard contract
```

`npm test` needs no running server and is safe to run at any time. It starts
its own server on port 4100 with the data directory in a temp folder, so the
tests never touch `backend/.data`. The runner checks the shop's data file
before and after and fails if anything wrote to it.

`test:smoke` and `test:e2e` on their own do use a server you started (port 4000
by default, or set `API_BASE`). Those create real records, so they will add test
bills and items to whatever data folder that server is using - prefer
`npm run test:api`.

All three must pass. The render check prints
`ALL SCREENS RENDER CLEANLY`, then `ALL CHECKS PASSED` from each API suite.

| Suite | Covers |
| --- | --- |
| `test:render` | Every screen renders without crashing, no broken `<label for>`, no form control without an id or name, no stock numbers in billing, the stock PIN gate locked and unlocked, and the empty first-day screens |
| `test:smoke` | Stock rules, payments, status flow, consumables, bill, sync, search, bill numbering |
| `test:e2e` | Dashboard contract, full repair lifecycle, delivery guards, auth, password change, error handling |

---

## Project layout

```
shared/domain.ts       Types + money/status rules shared by both sides
backend/
  src/domain/          Pure business rules (no I/O) - orderOps, stockOps
  src/data/            Storage: local JSON + Google Sheets adapter
  src/services/        Orchestration per feature
  src/http/routes/     Express routes
  src/pdf/             A5 bill PDF
  src/google/          Sheets + Drive clients
  scripts/             smoke.mjs, e2e.mjs, run-api-tests.mjs
frontend/
  src/pages/           One file per screen (StockDesktop holds every stock job)
  src/components/      Shared UI + app shell
  src/hooks/           API queries and mutations
  src/lib/             API client, auth, formatting
```

The business rules live in `backend/src/domain/` as plain functions over a
database draft, with no I/O. That is what makes them straightforward to test
and impossible to bypass from a route.

---

## Troubleshooting

**Port already in use** — set a different `PORT` in `.env`.

**Login rejected** — the owner account is only seeded on first run. If
`backend/.data` was created before you set `OWNER_PASSWORD`, either use
**Settings → Change my password** (with the seeded password) or delete that
folder to start over.

**"Google Drive is not connected"** — expected when Google is not set up. The
bill still generates; it is just not uploaded. Run `npm run google:check` for a
line-by-line answer, or see [Google Sheets & Drive](#google-sheets--drive-optional).

**Service worker serves an old version** — the app is cached for offline use.
Log out, clear site data for the address, and reload.

**Stock will not go negative** — that is the default and it is deliberate. Set
`ALLOW_NEGATIVE_STOCK=true` if you need it.
