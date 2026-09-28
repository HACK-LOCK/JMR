# Connecting Google Sheets & Drive — the complete guide

Read this once, follow it in order, and the shop keeps an online copy of every
repair plus a PDF bill in your own Google Drive.

**Time needed:** about 10 minutes, once.

**Nothing here is required to run the shop.** Until it is finished the app saves
everything to a file on the shop computer and carries on working normally.

---

## The two-minute version

| # | Do this | Where |
| --- | --- | --- |
| 1 | Put the downloaded key file in `backend/service-account.json` | Your computer |
| 2 | Create a blank Google Sheet | Google Sheets |
| 3 | Share that sheet with the app's Google address as **Editor** | Google Sheets |
| 4 | Create a folder in your Drive for bills | Google Drive |
| 5 | Share that folder with the same address as **Editor** | Google Drive |
| 6 | Paste both links in the app | App → Sheet Sync → Connect Google |

The app shows a live checklist, so you always know which step you are on.

---

## Step 1 — The key file (already done for you)

The app talks to Google as a **service account**: its own Google account with
no password. The key file is that account's ID card.

- File: `backend/service-account.json`
- Address it signs in as: `jaymataji9974298866@stellar-works-509806-c5.iam.gserviceaccount.com`

You do not have to name the file exactly that. Any `.json` file in the
`backend` folder that really is a service account key is found automatically,
so a file called `service_api key firle.json` works just as well.

**Never** email this file, upload it to Drive, or commit it to Git. It is
already listed in `.gitignore`, so it stays out of version control.

---

## Step 2 — Create the spreadsheet

1. Open <https://sheets.google.com> and click **Blank spreadsheet**.
2. Name it after the shop, for example `Jai Mataji Mobile Repairing`.
3. Click the **Share** button (top right).
4. In *Share with people and groups*, paste:

   ```
   jaymataji9974298866@stellar-works-509806-c5.iam.gserviceaccount.com
   ```

5. Change the role from *Viewer* to **Editor**, then press **Send**.
6. Copy the sheet's web address from the browser bar. It looks like:

   ```
   https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOp/edit
                            └──── this part ────┘
   ```

The app reads the whole link, so you can paste it as it is.

> **Why can't the app create the sheet for me?**
> A service account has 0 GB of Google storage of its own, so Google refuses
> any file it tries to create. It can only open files that already exist in
> *your* account and that you have shared with it. That is why one small step
> is needed here, and it is a one-time step.

---

## Step 3 — Create the folder for bills and photos

Bill PDFs and repair photos are files, so they need storage. The service
account has none, which means they have to live in a folder inside **your**
Drive.

1. Open <https://drive.google.com> and click **New → Folder**.
2. Name it after the shop, for example `Jai Mataji Mobile Repairing`.
3. Right-click the folder → **Share**.
4. Paste the same address, set the role to **Editor**, press **Send**.
5. Copy the folder's web address. It looks like:

   ```
   https://drive.google.com/drive/folders/1XyZwVuTsRq
                                      └──── this part ────┘
   ```

The app then builds the filing structure inside it, automatically:

```
Jai Mataji Mobile Repairing/
├── Bills/
│   ├── 2026/
│   │   ├── January/ORD-2026-00001.pdf
│   │   └── February/ORD-2026-00087.pdf
│   └── 2027/
└── Repair Photos/
    └── ORD-2026-00001/
```

Each bill is named after its Order ID, so re-printing a bill **updates** the
same PDF instead of creating a second copy.

This step is optional. Skip it and everything still works — bill PDFs are then
kept on the shop computer only.

---

## Step 4 — Connect it in the app

1. Start the app and sign in as the owner.
2. Open **Stock & Management → Sheet Sync**.
3. Tap **Connect Sheets**.
4. The **Connect Google** screen opens with a live checklist:
   - tick 1 confirms the key file is loaded,
   - tick 2 turns green once Google can open your sheet,
   - tick 3 turns green once your folder is reachable.
5. Paste the **Google Sheet link** and press **Check this link**.
6. Paste the **Drive folder link** (optional) and your own **Gmail** (optional,
   so bills appear in your Drive and you can open them).
7. Press **Connect Google Sheets**.

The button stays greyed out until Google itself confirms the sheet, so you
cannot connect the wrong thing by accident.

### Doing it from the terminal instead

```bash
npm run google:check
npm run google:check -- "https://docs.google.com/spreadsheets/d/1AbCdEf/edit" \
                      "https://drive.google.com/drive/folders/1XyZwVuTsRq"
npm run google:check -- "https://docs.google.com/spreadsheets/d/1AbCdEf/edit" --connect
```

The first two commands only read and print a report. The third one connects.

---

## Verifying it works

```bash
npm run google:check
```

A finished setup prints:

```
  OK   Service account key loaded
  OK   Spreadsheet shared with the service account
  OK   Drive folder for bills and photos

  Google Sheets and Drive are both connected.
```

`NEED` lines are real problems with a real cause; each one prints the exact
next action underneath it.

The same information is on the app's **Sheet Sync** screen, so you never need
the terminal.

---

## What the app does with each half

**Google Sheets** — one tab per dataset: `Orders`, `Customers`, `Parts`,
`Suppliers`, `Payments`, `Stock Movements`, `Order Parts`, `Status History`,
`Settings`. Headers are written on the first connect, so an empty sheet is
enough. The local file stays the source of truth; the sheet is pushed after
every change. If a push fails, the change is queued on the computer, retried
later, and the app never shows a false "saved".

**Google Drive** — the bill and photo folders described in step 3.

---

## Troubleshooting

| What you see | What it means | What to do |
| --- | --- | --- |
| `Service account key loaded` is `NEED` | No key file found | Put the downloaded JSON in `backend/service-account.json` |
| `Spreadsheet ...` is `NEED`, "not found" | Wrong link, or not shared | Re-check the link; confirm the address is added as **Editor** |
| `Spreadsheet ...` is `NEED`, "does not have permission" | Shared as Viewer | Change the role to **Editor** and re-send the invite |
| Everything `OK` but bills are not in Drive | The app is still on local mode | Open Sheet Sync and press **Connect Google Sheets** |
| "Drive storage quota has been exceeded" | The app tried to create a file itself | Expected. Create the folder in your own Drive and share it (step 3) |
| Bills say "not saved to Drive" | Folder not shared yet | Finish step 3, then press **Retry Pending** |
| Key file name is not `service-account.json` | — | Nothing to do. Any service account `.json` in `backend/` is found |

---

## Keeping it safe

- The key file stays on the shop computer. It is never sent to the browser and
  never leaves the server process.
- The Google connection is changed from the app, by the person who set it up.
- `.gitignore` already excludes the key file, `.env` and the local data folder.
- If the key file ever leaks, delete it in the
  [Google Cloud console](https://console.cloud.google.com/) → **IAM & Admin →
  Service Accounts → Keys** and download a new one.
