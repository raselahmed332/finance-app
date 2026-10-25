# আমার হিসাব — Personal Finance Web App

A Bengali-language personal finance app for tracking income, expense, transfers, bank operations, and loans across multiple wallets. React + Vite on the front end, Google Apps Script + Google Sheets on the back end, deployed free on GitHub Pages.

**Stack:** React 18, Vite 5, Tailwind CSS 4, Chart.js, Google Apps Script, Google Sheets

---

## Features

**Wallets** — multiple wallets, each with a fixed currency (BDT/SAR/USD/EUR/KWD/GBP/AED) and separate Cash and Bank accounts. Set an opening balance per account. Rename a wallet or deactivate it; a wallet with history is deactivated rather than deleted so old records stay intact.

**Income & expense** — per-wallet, per-account, with category, vendor, description, note, and date. Edit and delete any transaction you have permission to manage.

**Transfers** — move money between any two wallets, with a separate amount for the receiving side so cross-currency transfers work. Written as a matched pair of rows; an incomplete pair is detected and repaired rather than duplicated.

**Bank operations** — Cash ↔ Bank movement inside one wallet as a single action, recorded as a real transfer pair.

**Loans (হাওলাত)** — give and take loans, track repayments and extra additions, and see live remaining balances. A loan's financial state is always derived from its ledger rows, never from a stored total. Statuses: Active, Partial, পরিশোধিত, Overdue. Creating a loan for someone who still has one outstanding requires explicit confirmation. Loans can be filtered by status, date range, currency, and remaining amount. A loan's **wallet is pinned for good once the loan has any money recorded against it** (the initial disbursement, any addition, or any repayment): additions and repayments always move money through the loan's own wallet, and changing the wallet afterwards is refused — cancel the loan and create a new one instead.

**Reports** — daily, weekly, monthly, and yearly charts, plus CSV export per wallet.

**Backup & restore** — download the full dataset as JSON and restore it, with validation before anything is written. A restore that fails mid-write rolls back automatically.

**Audit log** — every mutation is recorded with user, target, and detail. Includes a broken-transfer-pair integrity checker. The log is auto-pruned to a **rolling two-calendar-month window**: a daily trigger deletes anything older than the same day two months back (e.g. on 16-Oct it removes records before 16-Aug). The read endpoint applies the same cutoff, so the screen never shows a record outside the window, and an Admin can run **Cleanup now** by hand. Rows whose date cannot be parsed are always kept, and the window can be widened or narrowed by editing `AUDIT_RETENTION_MONTHS` in `backend/AuditRetention.gs`.

**Roles & permissions** — Admin, Sub-Admin, User. Actions are enforced in this order: **Wallet Access → Permission → Action**. Granting a wallet to a user automatically grants the default actions for that wallet; anything beyond that is an explicit, separately grantable permission. Four actions are Admin-only and can never be granted away: change role, change password, create admin, manage currencies. Separately from permissions, **only an Admin may assign the `Admin` or `Sub-Admin` role** — a non-Admin with `ADD_USER` can create plain users but cannot mint another privileged account, and cannot change an existing Admin.

**Security** — PIN stored as salted SHA-256 with a timing-safe comparison. Legacy plaintext PINs are verified once and migrated on next login. Changing a PIN, changing permissions, or deactivating a user bumps that user's session version, so every existing session dies immediately. Caller identity is bound server-side and can never be spoofed from the client payload. The last active Admin cannot be deleted, deactivated, or demoted. A user with financial history cannot be deleted, only deactivated.

**Duplicate protection** — every financial write carries a client-generated request ID. A retry with the same ID returns the original record instead of creating a second one; the same ID with different data is rejected. The request is fingerprinted on loan, amount, wallet, account, date **and note**, so two genuinely separate repayments of the same amount on the same day are not swallowed as a duplicate. The duplicate check runs *after* shape validation but *before* the already-paid, overpayment and balance checks — those read the very ledger the request changes, so checking them first made a retry of a successful payment come back as a failure.

**Money handling** — all amounts are stored and compared as integer cents. Floats are never used for arithmetic, and an overpayment is rejected rather than silently clamped. Amounts are validated in their raw submitted form, so `"1e3"`, `"0x10"`, `"1,000"` and non-numeric values are rejected instead of being coerced into a number.

---

## Project layout

```
amar-hisab-react/
  backend/                  ← Google Apps Script (paste into your Apps Script project)
    Code.gs                   API router, action whitelist, caller identity binding
    Database.gs               sheet schemas, seed data, setup
    Security.gs               PIN hashing, session validation, permission primitives
    Auth.gs                   login, session tokens
    Users.gs                  user lifecycle, permissions, wallet access
    Wallets.gs                wallet CRUD, balances
    Transactions.gs           income, expense, transfer, bank operations
    Loans.gs                  loans, repayments, additions (largest file)
    Backup.gs                 backup export, scoped restore, validation
    Money.gs                  cent-exact amount parsing and arithmetic
    Reports.gs                report aggregation
    Audit.gs                  audit log reads, integrity check
    AuditRetention.gs         audit-log two-calendar-month auto-pruning + trigger
    Cache.gs                  ledger cache invalidation
    tests/                     zero-dependency node:test suite (not deployed)
  finance-app/               ← this repo, the React front end
    src/App.jsx                header, bottom nav, tab routing
    src/api.js                 backend calls, session, permission constants
    src/pages/                 one file per screen
    src/components/            forms and reusable pieces
    src/utils/                 loan math, CSV export
    .github/workflows/deploy.yml   auto-deploys on every push to main
```

---

## Setup

### Step 1 — Deploy the backend

1. Open the Google Apps Script project attached to your Google Sheet.
2. Add the contents of each file in `backend/` as a script file of the same name.
3. **Deploy → New deployment → Web app**.
4. Execute as **Me**, Who has access: **Anyone**.
5. Copy the Web app URL (ends in `/exec`).
6. **(Optional) Turn on audit-log retention cleanup.** Run `installAuditCleanupTrigger_` once from the Apps Script editor (select it in the function dropdown → **Run**; approve the authorization prompt). This installs a daily trigger for `scheduledAuditCleanup`, which deletes audit rows older than two calendar months. It is idempotent — running it again creates no duplicate trigger. Admins can also trigger a one-off cleanup from the Audit Log screen's **Cleanup now** button.

### Step 2 — Point the frontend at the backend

Either edit `DEFAULT_API_URL` in `src/api.js`:

```js
const DEFAULT_API_URL = "https://script.google.com/macros/s/.../exec";
```

or set an override in a `.env.local` file (no file exists by default):

```
VITE_API_URL=https://script.google.com/macros/s/.../exec
```

Vite only exposes variables prefixed `VITE_` to client code. This endpoint is not a secret — the app's security comes from session tokens, not from URL secrecy.

### Step 3 — Set the base path

`vite.config.js` must match your repo name:

```js
base: "/finance-app/",
```

If the repo is named `username.github.io` (a user/org page), set `base: "/"` instead.

### Step 4 — Push and turn on Pages

```bash
cd finance-app
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

Then on GitHub: **Settings → Pages → Build and deployment → Source → GitHub Actions**.

Live at `https://YOUR_USERNAME.github.io/YOUR_REPO/`. Watch the run in the **Actions** tab.

Note: the workflow builds and deploys **only the frontend**. The backend is Google Apps Script and must be deployed by hand from the Apps Script editor. Pushing this repo never publishes backend changes.

---

## Local development

```bash
cd finance-app
npm install     # or: npm ci, to install the exact locked tree
npm run dev     # http://localhost:5173
```

| Script | What it does |
|---|---|
| `npm run dev` | Dev server with HMR |
| `npm run build` | Production build into `dist/` (GitHub Pages base `/finance-app/`) |
| `npm run build:android` | Production build for the Android WebView (relative asset base) |
| `npm run preview` | Serve the built `dist/` locally |
| `npm run analyze` | Build with a bundle-size visualizer |
| `npm run deploy` | Publish `dist/` to the `gh-pages` branch |
| `npm run cap:copy` | Copy the current `dist/` into `android/` without rebuilding |
| `npm run cap:sync` | Build for Android and sync web assets + plugins into `android/` |
| `npm run cap:open:android` | Open the native project in Android Studio |
| `npm run cap:assets` | Regenerate launcher icons + splash from `assets/` |
| `npm run android:debug` | Sync + build an installable debug APK |
| `npm run android:release` | Sync + build a signed release APK (needs `android/keystore.properties`) |
| `npm test` | Run the frontend unit tests (`node --test tests`) |

There is no lint or typecheck script for the frontend.

---

## Android app (Capacitor)

The frontend is packaged for Android with **Capacitor 8**. The web app and the
Android app share exactly the same source; only the Vite asset base path
differs — `npm run build` keeps the GitHub Pages base `/finance-app/`, while
`npm run build:android` uses a relative base so every asset resolves inside the
APK.

- **App ID:** `com.amarhisab.app`
- **App name:** Amar Hisab
- **Current Android release:** versionCode `7`, versionName `1.6`, Git tag `v7`
- **Capacitor config:** `capacitor.config.json`
- **Native project:** `android/`
- **Backend:** unchanged — the app still talks to the same Google Apps Script
  Web App over HTTPS. Android only requests the `INTERNET` permission, and
  cleartext HTTP is disabled (`usesCleartextTraffic="false"`); OS-level app
  backup is also disabled so the session token is never copied off-device.
- **Hardware Back button:** handled in `src/App.jsx` + `src/utils/native.js` —
  it closes an open dialog first, then steps back through the in-app screen
  history, and only minimizes the app from the Home screen.
- **Icons / splash:** generated into `android/app/src/main/res/` from the
  source images in `assets/`.

### Prerequisites

- Node 20+ and npm
- JDK 21 (required by the Android Gradle Plugin)
- Android SDK with **Platform 36** and **Build-Tools 36.0.0**
- Android Studio (to open the project) and `JAVA_HOME`, `ANDROID_HOME`
  (or `ANDROID_SDK_ROOT`) set.

### Build a debug APK

```bash
npm install
npm run android:debug        # build web + sync + gradle assembleDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`

### Build a signed release APK

Signing credentials are **never committed**. Create
`android/keystore.properties` (git-ignored) and keep the keystore beside it:

```properties
storeFile=amar-hisab-release.keystore
storePassword=YOUR_STORE_PASSWORD
keyAlias=amarhisab
keyPassword=YOUR_KEY_PASSWORD
```

```bash
npm run android:release
```

APK: `android/app/build/outputs/apk/release/app-release.apk`

If `keystore.properties` is absent the release build still runs, but produces
an **unsigned** APK.

### Publish an APK with GitHub Actions

The **Build and publish Android APK** workflow is manually started from the
repository's Actions tab. Select the release tag to build (for example `v7`);
the tag number must match `versionCode` in `android/app/build.gradle`.
The workflow replaces the release APK and checksum for that tag.

Before running it, add these repository Actions secrets. The keystore secret is
the Base64-encoded release keystore; the remaining values must match the local
`android/keystore.properties` file:

- `ANDROID_RELEASE_KEYSTORE_BASE64`
- `ANDROID_RELEASE_STORE_PASSWORD`
- `ANDROID_RELEASE_KEY_ALIAS`
- `ANDROID_RELEASE_KEY_PASSWORD`

Never add the keystore or signing properties to the repository.

### Open in Android Studio

```bash
npm run cap:sync
npm run cap:open:android
```

Then **Build → Build Bundle(s) / APK(s) → Build APK(s)**. Android Studio creates
`android/local.properties` (SDK path) on first open.

### Regenerating icons / splash

Edit the source art (`scripts/generate-assets.mjs`) and run:

```bash
node scripts/generate-assets.mjs   # rebuild assets/*.png
npm run cap:assets                 # regenerate Android mipmaps + splash
```

### Backend tests

The backend has a zero-dependency `node:test` suite (requires Node 18+; it uses
only the standard library) that loads every `.gs` file into one shared VM
context — the way the Apps Script runtime sees them — and drives individual
functions against stubbed sheets:

```bash
cd backend
node --test tests/*.test.js
```

| File | Covers |
|---|---|
| `tests/money.test.js` | strict amount/date parsing, cent-exact arithmetic |
| `tests/users-role.test.js` | Admin-only role assignment |
| `tests/loans-wallet.test.js` | loan wallet lock, addition wallet pinning, detail-row scoping |
| `tests/loans-payment-idempotency.test.js` | payment validation/idempotency ordering |
| `tests/transactions-transfer.test.js` | transfer raw-amount validation |
| `tests/audit-retention.test.js` | two-month cutoff, safe/idempotent deletion, trigger idempotency |
| `tests/loans-sort.test.js` | loan ordering by parsed `updatedAt`, timestamp parsing |

`tests/load-backend.js` and `tests/stubs.js` are the harness, not tests.

### Frontend tests

A small zero-dependency `node:test` suite covers the shared pure date helpers
(`src/utils/timestamps.js`) used by the loan ordering and audit retention:

```bash
cd finance-app
npm test
```

---

## Editing a single page later

| Screen | File |
|---|---|
| Shell, nav, tab routing | `src/App.jsx` |
| Dashboard / home | `src/pages/DashboardView.jsx` |
| Transactions list | `src/pages/TransactionsView.jsx` |
| Reports & chart | `src/pages/ReportsView.jsx` |
| Loan dashboard | `src/pages/LoanDashboardView.jsx` |
| Loan details | `src/pages/LoanDetailsView.jsx` |
| Wallet management | `src/pages/WalletManagementView.jsx` |
| User management | `src/pages/UserManagementView.jsx` |
| Audit log | `src/pages/AuditLogView.jsx` |
| Backup & restore | `src/pages/BackupRestoreView.jsx` |
| Settings & categories | `src/pages/SettingsView.jsx` |
| Profile & PIN change | `src/pages/UserProfileView.jsx` |
| Login | `src/pages/LoginScreen.jsx` |
| Income / Expense / Transfer / Bank / Loan forms | `src/components/` |
| Permission labels & API surface | `src/api.js` |
| Loan display math | `src/utils/loan.js` |

Save, commit, push — GitHub Actions rebuilds and redeploys automatically.

---

## Design notes

The UI is Bengali-first and mobile-first, with a dark mode. Body background and container width are styled inline in `index.html` so there is no white flash before React mounts. Fonts (Hind Siliguri, weights 400/600/700) and icons (FontAwesome) come from npm packages imported in `src/main.jsx` and are bundled by Vite — nothing is fetched from a CDN at runtime.
