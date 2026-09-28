# আমার হিসাব — Personal Finance Web App

A Bengali-language personal finance app for tracking income, expense, transfers, bank operations, and loans across multiple wallets. React + Vite on the front end, Google Apps Script + Google Sheets on the back end, deployed free on GitHub Pages.

**Stack:** React 18, Vite 5, Tailwind CSS 4, Chart.js, Google Apps Script, Google Sheets

---

## Features

**Wallets** — multiple wallets, each with a fixed currency (BDT/SAR/USD/EUR/KWD/GBP/AED) and separate Cash and Bank accounts. Set an opening balance per account. Rename a wallet or deactivate it; a wallet with history is deactivated rather than deleted so old records stay intact.

**Income & expense** — per-wallet, per-account, with category, vendor, description, note, and date. Edit and delete any transaction you have permission to manage.

**Transfers** — move money between any two wallets, with a separate amount for the receiving side so cross-currency transfers work. Written as a matched pair of rows; an incomplete pair is detected and repaired rather than duplicated.

**Bank operations** — Cash ↔ Bank movement inside one wallet as a single action, recorded as a real transfer pair.

**Loans (হাওলাত)** — give and take loans, track repayments and extra additions, and see live remaining balances. A loan's financial state is always derived from its ledger rows, never from a stored total. Statuses: Active, Partial, পরিশোধিত, Overdue. Creating a loan for someone who still has one outstanding requires explicit confirmation. Loans can be filtered by status, date range, currency, and remaining amount.

**Reports** — daily, weekly, monthly, and yearly charts, plus CSV export per wallet.

**Backup & restore** — download the full dataset as JSON and restore it, with validation before anything is written. A restore that fails mid-write rolls back automatically.

**Audit log** — every mutation is recorded with user, target, and detail. Includes a broken-transfer-pair integrity checker.

**Roles & permissions** — Admin, Sub-Admin, User. Actions are enforced in this order: **Wallet Access → Permission → Action**. Granting a wallet to a user automatically grants the default actions for that wallet; anything beyond that is an explicit, separately grantable permission. Three actions are Admin-only and can never be granted away: change role, change password, create admin.

**Security** — PIN stored as salted SHA-256 with a timing-safe comparison. Legacy plaintext PINs are verified once and migrated on next login. Changing a PIN, changing permissions, or deactivating a user bumps that user's session version, so every existing session dies immediately. Caller identity is bound server-side and can never be spoofed from the client payload. The last active Admin cannot be deleted, deactivated, or demoted. A user with financial history cannot be deleted, only deactivated.

**Duplicate protection** — every financial write carries a client-generated request ID. A retry with the same ID returns the original record instead of creating a second one; the same ID with different data is rejected.

**Money handling** — all amounts are stored and compared as integer cents. Floats are never used for arithmetic, and an overpayment is rejected rather than silently clamped.

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
    Cache.gs                  ledger cache invalidation
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
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the built `dist/` locally |
| `npm run analyze` | Build with a bundle-size visualizer |
| `npm run deploy` | Publish `dist/` to the `gh-pages` branch |

There is no test, lint, or typecheck script configured.

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
