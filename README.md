# মাই পার্সোনাল হিসাব — React + GitHub Pages + Google Sheets

Same design, same features — now split into separate files (`src/pages/`, `src/components/`) and buildable with Vite, hosted free on GitHub Pages, still backed by your Google Sheet.

## Project layout

```
finance-app/
  backend/Code.gs        ← paste into your Apps Script project
  src/
    App.jsx               ← header, bottom nav, tab routing
    api.js                 ← all backend calls (edit the URL here)
    pages/                 ← one file per screen
    components/            ← forms & reusable pieces
  index.html
  package.json
  vite.config.js
  .github/workflows/deploy.yml   ← auto-deploys on every push
```

---

## Step 1 — Deploy the backend (Google Apps Script)

1. Open your existing Apps Script project (the one attached to your Google Sheet).
2. Replace the contents of `Code.gs` with `backend/Code.gs` from this project. (All your data logic is unchanged — only a small API router was added at the top.)
3. Click **Deploy → New deployment**.
4. Type: **Web app**.
5. Execute as: **Me**.
6. Who has access: **Anyone**.
7. Click **Deploy**, authorize it, then copy the **Web app URL** (ends in `/exec`).

## Step 2 — Point the frontend at your backend

Open `src/api.js` and replace:

```js
const API_URL = "PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE";
```

with your real `/exec` URL from Step 1.

## Step 3 — Push this project to GitHub

```bash
cd finance-app
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

## Step 4 — Set the correct base path

Open `vite.config.js` and make sure `base` matches your repo name exactly:

```js
base: "/YOUR_REPO_NAME/",
```

(If your repo is literally named `YOUR_USERNAME.github.io`, set `base: "/"` instead.)

Commit and push this change too.

## Step 5 — Turn on GitHub Pages

1. On GitHub, go to your repo → **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. That's it — the included workflow (`.github/workflows/deploy.yml`) builds and deploys automatically every time you push to `main`.

Your site will be live at:
```
https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/
```

Check the **Actions** tab on GitHub to watch the deploy run (takes about a minute).

---

## Editing a single page later

Each screen is its own file — open only the one you need:

| Page | File |
|---|---|
| Dashboard / home | `src/pages/DashboardView.jsx` |
| Transactions list | `src/pages/TransactionsView.jsx` |
| Reports & chart | `src/pages/ReportsView.jsx` |
| User management | `src/pages/UserManagementView.jsx` |
| Settings & backup | `src/pages/SettingsView.jsx` |
| Profile | `src/pages/UserProfileView.jsx` |
| Login | `src/pages/LoginScreen.jsx` |
| Income / Expense / Transfer / Bank forms | `src/components/` |

Save, commit, push — GitHub Actions rebuilds and redeploys automatically.

## Local preview before pushing

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`.
