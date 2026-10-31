import { Icon } from "./ui/Icon.jsx";
import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  lazy,
  Suspense,
} from "react";
import { api, session, onAuthFailure, AUTH_FAILURE_CODES } from "./api.js";
import { useToast } from "./components/Toast.jsx";
import { useConfirm } from "./components/ConfirmDialog.jsx";
import Popup from "./components/Popup.jsx";
import { loadCurrencies } from "./utils/currency.js";
import { setAccounts as setAccountsRegistry, resetAccounts } from "./utils/accounts.js";
import { todayStr } from "./utils/loan.js";
import {
  calculateBalancesAfterTransactions,
  transactionBalanceDelta,
} from "./utils/transactionBalance.js";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import {
  hideNativeSplash,
  registerNativeBackButton,
} from "./utils/native.js";
import {
  isNativeAndroid,
  checkForUpdate,
  downloadUpdate,
  openDownloadedApk,
  openInstallPermissionSettings,
} from "./utils/updater.js";
import UpdateDialog from "./components/UpdateDialog.jsx";
import {
  readThemeMode,
  saveThemeMode,
  resolveTheme,
  subscribeTheme,
  THEME_MODES,
} from "./utils/theme.js";

const LoginScreen = lazy(() => import("./pages/LoginScreen.jsx"));
const DashboardView = lazy(() => import("./pages/DashboardView.jsx"));
const TransactionsView = lazy(() => import("./pages/TransactionsView.jsx"));
const ReportsView = lazy(() => import("./pages/ReportsView.jsx"));
const UserManagementView = lazy(() => import("./pages/UserManagementView.jsx"));
const WalletManagementView = lazy(() =>
  import("./pages/WalletManagementView.jsx"),
);
const AuditLogView = lazy(() => import("./pages/AuditLogView.jsx"));
const SettingsView = lazy(() => import("./pages/SettingsView.jsx"));
const BackupRestoreView = lazy(() => import("./pages/BackupRestoreView.jsx"));
const UserProfileView = lazy(() => import("./pages/UserProfileView.jsx"));
const LoanDashboardView = lazy(() => import("./pages/LoanDashboardView.jsx"));
const LoanDetailsView = lazy(() => import("./pages/LoanDetailsView.jsx"));
const SavingsDashboardView = lazy(() =>
  import("./pages/SavingsDashboardView.jsx"),
);
const SavingsDetailsView = lazy(() => import("./pages/SavingsDetailsView.jsx"));
const ShopCreditLedgerDashboardView = lazy(() =>
  import("./pages/ShopCreditLedgerDashboardView.jsx"),
);
const ShopLedgerDetailsView = lazy(() =>
  import("./pages/ShopLedgerDetailsView.jsx"),
);
const ShopLedgerReportView = lazy(() =>
  import("./pages/ShopLedgerReportView.jsx"),
);

const MoveMoneyForm = lazy(() =>
  import("./components/MoveMoneyForm.jsx"),
);
const IncomeForm = lazy(() => import("./components/IncomeForm.jsx"));
const ExpenseForm = lazy(() => import("./components/ExpenseForm.jsx"));
const EditTransactionForm = lazy(() =>
  import("./components/EditTransactionForm.jsx"),
);
const EditTransferForm = lazy(() =>
  import("./components/EditTransferForm.jsx"),
);
const LoanForm = lazy(() => import("./components/LoanForm.jsx"));
const SavingsForm = lazy(() => import("./components/SavingsForm.jsx"));

function PageFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-6 h-6 border-2 border-[var(--ah-brand)] border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
}

export default function App() {
  // Startup never trusts localStorage. The session token is the only
  // credential: it is re-validated against the backend (validateSession) before
  // any user is shown, and the signed-in user comes from that response. The old
  // "hisab_user" cache is not read (or written) any more - nothing in this app
  // may use a locally stored object as proof of identity.
  const [currentUser, setCurrentUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(() => session.exists());
  // Theme: "system" | "light" | "dark". `resolvedTheme` is what is actually on
  // screen, so the header icon always matches reality even when the OS
  // preference changes while the app is open.
  const [themeMode, setThemeMode] = useState(() => readThemeMode());
  const [resolvedTheme, setResolvedTheme] = useState(() =>
    resolveTheme(readThemeMode()),
  );
  const markLoginReady = useCallback(() => {
    void hideNativeSplash();
  }, []);
  const toast = useToast();
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState("home");
  // Income / Expense / Transfer are entered in a popup overlay rather than a
  // full page. null = closed; otherwise the form key.
  const [formModal, setFormModal] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(false);
  // Session epoch guard. Bumped on every login AND every logout. Each request
  // captures the current epoch when it STARTS and only writes user/session
  // state if the epoch is still current when it RESOLVES. A boolean flag alone
  // was racy: it was re-armed at login, so a pre-logout response could resolve
  // after a new login and resurrect the previous user's session/data.
  const sessionEpoch = useRef(0);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const [autoUpdateState, setAutoUpdateState] = useState("idle");
  const [autoUpdateRelease, setAutoUpdateRelease] = useState(null);
  const [autoUpdateInstalled, setAutoUpdateInstalled] = useState(null);
  const [autoUpdateProgress, setAutoUpdateProgress] = useState(null);
  const [autoUpdateMessage, setAutoUpdateMessage] = useState("");
  const [autoUpdateBusy, setAutoUpdateBusy] = useState(false);
  const autoUpdateDownloadRef = useRef(null);
  const resetAutoUpdate = useCallback(() => {
    setAutoUpdateState("idle");
    setAutoUpdateRelease(null);
    setAutoUpdateInstalled(null);
    setAutoUpdateProgress(null);
    setAutoUpdateMessage("");
    setAutoUpdateBusy(false);
    autoUpdateDownloadRef.current = null;
  }, []);

  // Apply + persist the chosen theme. In "system" mode the class follows the
  // OS preference live, so the header icon and the app chrome never disagree.
  useEffect(() => {
    saveThemeMode(themeMode);
  }, [themeMode]);

  useEffect(() => subscribeTheme(setResolvedTheme), []);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("All");
  const [filterWallet, setFilterWallet] = useState("All");
  const [filterUser, setFilterUser] = useState("All");
  const [filterAccount, setFilterAccount] = useState("All");

  const can = useCallback(
    (perm) => !!currentUser?.permissions?.includes(perm),
    [currentUser?.permissions],
  );
  const canAny = useCallback(
    (perms) => (perms || []).some((p) => can(p)),
    [can],
  );

  // Page-level gates: a page is visible when the user has ANY of the actions
  // that page exercises. The backend enforces all of them independently.
  const canManageUsers = canAny([
    "ADD_USER",
    "EDIT_USER",
    "DELETE_USER",
    "MANAGE_USER_PERMISSIONS",
  ]);
  const canManageWallets = canAny([
    "ADD_WALLET",
    "EDIT_WALLET",
    "MANAGE_WALLET_STATUS",
  ]);
  // Settings hosts the currency/category/account managers. Each manager
  // self-gates on its own permission, so the tab is shown to anyone who can
  // manage at least one of them (account management reuses the wallet perms).
  const canManageSettings = canAny([
    "BACKUP_RESTORE",
    "MANAGE_CATEGORIES",
    "MANAGE_CURRENCIES",
    "MANAGE_ACCOUNTS",
    "ADD_WALLET",
    "EDIT_WALLET",
    "MANAGE_WALLET_STATUS",
  ]);
  // Loan module: visible to everyone with wallet access (VIEW_LOANS is implied
  // by wallet access); Admins have it via their full effective permission set.
  const canLoan = can("VIEW_LOANS");
  const canShopLedger = can("VIEW_SHOP_LEDGER");
  const canSavings =
    String(currentUser?.role).toLowerCase() === "admin" ||
    canAny([
      "VIEW_SAVINGS",
      "SAVINGS_GROUP",
      "SAVINGS_FIXED",
      "SAVINGS_FLEXIBLE",
      "MANAGE_SAVINGS",
    ]);
  const canSavingsType = (type) => {
    if (type === "GROUP") return can("SAVINGS_GROUP");
    if (type === "FIXED") return can("SAVINGS_FIXED");
    if (type === "FLEXIBLE") return can("SAVINGS_FLEXIBLE");
    return canSavings;
  };
  // Creating any plan needs the matching SAVINGS_GROUP/FIXED/FLEXIBLE action
  // (auto-granted by wallet access) or the MANAGE_SAVINGS grant the backend
  // also accepts.
  const canCreateSavings = canAny(["SAVINGS_GROUP", "SAVINGS_FIXED", "SAVINGS_FLEXIBLE", "MANAGE_SAVINGS"]);
  // Loan creation needs an issuing action (not just view); loan editing needs
  // the management grant the backend requires (MANAGE_LOANS is never auto-granted).
  const canAddLoan = canAny(["LOAN_GIVE", "LOAN_TAKE", "MANAGE_LOANS"]);
  const canEditLoan = can("MANAGE_LOANS");

  const showAlert = useCallback(
    (msg, type = "success") => toast(msg, type),
    [toast],
  );

  // Clear every user-scoped list and search/filter state so a freshly
  // logged-in user never sees the previous user's data or a stale filter
  // that silently hides rows.
  const resetUiState = useCallback(() => {
    setTransactions([]);
    setUsersList([]);
    setWallets([]);
    setCategories([]);
    setAccounts([]);
    resetAccounts();
    setLoans([]);
    setSearchTerm("");
    setFilterType("All");
    setFilterWallet("All");
    setFilterUser("All");
    setFilterAccount("All");
    setActiveTab("home");
    setFormModal(null);
  }, []);

  useEffect(() => {
    if (!checkingAuth && currentUser) void hideNativeSplash();
  }, [checkingAuth, currentUser]);

  // Hard logout: drops the token and every user-scoped list. Used both for an
  // explicit sign-out and whenever the backend reports the session is no longer
  // valid.
  const forceLogout = useCallback(() => {
    sessionEpoch.current += 1;
    resetUiState();
    resetAutoUpdate();
    setCurrentUser(null);
    session.clear();
  }, [resetUiState, resetAutoUpdate]);

  // Startup handshake. The stored token is the only credential; the signed-in
  // user is whatever the backend says it belongs to.
  useEffect(() => {
    // Scrub the identity cache written by older builds. It is no longer read,
    // but a leftover copy of the signed-in user object is data we should not
    // leave sitting in storage.
    localStorage.removeItem("hisab_user");
    if (!session.exists()) {
      setCheckingAuth(false);
      return;
    }
    let cancelled = false;
    api
      .validateSession()
      .then((res) => {
        if (cancelled) return;
        if (res.status === "SUCCESS" && res.user) {
          setCurrentUser(res.user);
          // Fetch the currency registry once the user is proven. Non-blocking and
          // failure-tolerant: the registry keeps its bundled fallback list, so a
          // slow or failed call never delays or breaks the bootstrap.
          loadCurrencies(res.user.username);
        } else session.clear();
      })
      .catch(() => {
        // Any failure (dead session, network, malformed response) means we
        // cannot prove this browser is authenticated, so start at the login
        // screen rather than showing anything cached.
        if (cancelled) return;
        session.clear();
      })
      .finally(() => {
        if (!cancelled) setCheckingAuth(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Any request that comes back SESSION_EXPIRED / INVALID_SESSION / AUTH_REQUIRED
  // signs the user out immediately, from anywhere in the app.
  useEffect(() => onAuthFailure(() => forceLogout()), [forceLogout]);

  const loadData = useCallback(() => {
    if (!currentUser) return;
    setLoading(true);
    const epoch = sessionEpoch.current;
    api
      .getInitialData(currentUser.username)
      .then((res) => {
        if (sessionEpoch.current !== epoch) return;
        if (res.status === "ERROR") {
          showAlert(res.message, "error");
          if (AUTH_FAILURE_CODES.includes(res.code)) forceLogout();
          setLoading(false);
          return;
        }
        const data = {
          transactions: res.transactions || [],
          users: res.users || [],
          wallets: res.wallets || [],
          categories: res.categories || [],
          accounts: res.accounts || [],
        };
        setTransactions(data.transactions);
        setUsersList(data.users);
        setWallets(data.wallets);
        setCategories(data.categories);
        setAccounts(data.accounts);
        // Mirror the account list into the in-memory registry every account
        // dropdown reads from (mirrors how loadCurrencies seeds currencies).
        setAccountsRegistry(data.accounts);
        // Stale-response guard: if the user logged out or a different user
        // logged in while this getInitialData was in flight, do NOT resurrect
        // that session here.
        if (sessionEpoch.current !== epoch) return;
        // Re-derive the user from the authoritative payload the backend
        // returned - an Admin may have changed its permissions or name.
        const authoritative = res.user || currentUser;
        const updated = {
          ...authoritative,
          permissions: res.permissions || authoritative.permissions,
        };
        setCurrentUser(updated);
        setLoading(false);
      })
      .catch((err) => {
        if (sessionEpoch.current !== epoch) return;
        // api.js already cleared the token for a dead session; the listener
        // above performs the actual sign-out.
        if (err && AUTH_FAILURE_CODES.includes(err.code)) return;
        showAlert("ডেটা লোড করতে ব্যর্থ হয়েছে: " + err, "error");
        setLoading(false);
      });
  }, [currentUser, showAlert, forceLogout]);

  // Load data on mount or when user changes
  useEffect(() => {
    if (!currentUser) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.username]);

  // Automatic update check: runs once per signed-in session, inside the Android
  // shell only. It is deliberately fire-and-forget so login, rendering and the
  // dashboard are never delayed or blocked. Silent on "up to date" and on any
  // check failure (offline, rate limit, malformed release, ...).
  useEffect(() => {
    if (!currentUser) return undefined;
    if (!isNativeAndroid()) return undefined;

    const epoch = sessionEpoch.current;
    let cancelled = false;
    checkForUpdate()
      .then((result) => {
        if (cancelled || sessionEpoch.current !== epoch || !result.hasUpdate) return;
        setAutoUpdateRelease(result.release);
        setAutoUpdateInstalled(result.installed);
        setAutoUpdateState("update-available");
      })
      .catch(() => {
        // Background update checks must not interrupt normal app use.
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.username]);

  const failAutoUpdate = (err) => {
    const messages = {
      RATE_LIMITED: "GitHub রেট লিমিট হয়েছে, কিছুক্ষণ পরে আবার চেষ্টা করুন।",
      NETWORK: "ইন্টারনেট সংযোগ নেই অথবা GitHub-এ পৌঁছানো যাচ্ছে না।",
      OFFLINE: "ইন্টারনেট সংযোগ নেই অথবা GitHub-এ পৌঁছানো যাচ্ছে না।",
      INCOMPLETE: "ডাউনলোড অসম্পূর্ণ হয়েছে (স্টোরেজ পূর্ণ হতে পারে)। আবার চেষ্টা করুন।",
      EMPTY_FILE: "ডাউনলোড অসম্পূর্ণ হয়েছে (স্টোরেজ পূর্ণ হতে পারে)। আবার চেষ্টা করুন।",
      CHECKSUM_MISMATCH: "ডাউনলোড করা ফাইলটি যাচাইয়ের সময় মেলেনি, তাই বাতিল করা হয়েছে।",
      NO_FILE: "ডাউনলোড করা ফাইল পাওয়া যায়নি। আবার ডাউনলোড করুন।",
      FILE_MISSING: "ডাউনলোড করা ফাইল পাওয়া যায়নি। আবার ডাউনলোড করুন।",
      IN_PROGRESS: "একটি ডাউনলোড ইতিমধ্যে চলছে।",
    };
    setAutoUpdateMessage(
      messages[err?.code] ||
        "আপডেট করতে সমস্যা হয়েছে। ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।",
    );
    setAutoUpdateState("error");
    setAutoUpdateProgress(null);
    setAutoUpdateBusy(false);
  };

  const launchAutoUpdateInstaller = async (download) => {
    const file = download || autoUpdateDownloadRef.current;
    const epoch = sessionEpoch.current;
    if (!file) {
      failAutoUpdate({ code: "NO_FILE" });
      return;
    }
    setAutoUpdateState("download-complete");
    try {
      await openDownloadedApk(file.uri, { size: file.size });
      if (sessionEpoch.current === epoch) resetAutoUpdate();
    } catch (err) {
      if (sessionEpoch.current !== epoch) return;
      if (err?.code === "NEEDS_PERMISSION") {
        setAutoUpdateMessage(
          "Android-এ Amar Hisab থেকে অ্যাপ ইনস্টল করার অনুমতি চালু করুন, তারপর আবার চেষ্টা করুন।",
        );
        setAutoUpdateState("permission-required");
        setAutoUpdateBusy(false);
        return;
      }
      failAutoUpdate(err);
    }
  };

  const startAutoUpdateDownload = async () => {
    if (autoUpdateBusy || !autoUpdateRelease) return;
    const epoch = sessionEpoch.current;
    setAutoUpdateBusy(true);
    setAutoUpdateState("downloading");
    setAutoUpdateProgress({
      bytes: 0,
      contentLength: autoUpdateRelease.size || 0,
      percent: 0,
    });
    setAutoUpdateMessage("");
    try {
      const result = await downloadUpdate(autoUpdateRelease, (progress) => {
        if (sessionEpoch.current !== epoch) return;
        setAutoUpdateProgress({
          bytes: progress.bytes,
          contentLength: progress.contentLength,
          percent: progress.percent,
        });
      });
      if (sessionEpoch.current !== epoch) return;
      autoUpdateDownloadRef.current = result;
      setAutoUpdateProgress({
        bytes: result.size,
        contentLength: result.size,
        percent: 100,
      });
      setAutoUpdateState("download-complete");
      await launchAutoUpdateInstaller(result);
    } catch (err) {
      if (sessionEpoch.current === epoch) failAutoUpdate(err);
    }
  };

  const handleLogout = useCallback(() => {
    // Fire-and-forget: the local session is dropped regardless of the response.
    api.logout().catch(() => {});
    forceLogout();
  }, [forceLogout]);

  // Per-wallet summary, computed from already-authorized transactions.
  // Single pass over all transactions rather than re-filtering the whole
  // array once per wallet — matters once there are more than a couple wallets.
  //
  // The cash/bank/totalBalance figures are LIFETIME: they are the wallet's
  // current standing balance and must include every historical movement.
  // income/expense are the current CALENDAR MONTH only — a lifetime "total
  // income" grows without bound and stops being useful as a spending signal.
  // Transaction Date is "YYYY-MM-DD" (see backend/Reports.gs), so the month
  // test is a plain string prefix, same shape the server uses for its ranges.
  const currentMonth = todayStr().slice(0, 7);
  const walletSummaries = useMemo(() => {
    // Per-account balances. Each wallet starts from its accounts' own opening
    // balances (the registry), falling back to the legacy OpeningCash/OpeningBank
    // columns until the account list for that wallet has loaded.
    const summaries = Object.fromEntries(
      wallets.map((w) => {
        const list = (accounts || []).filter(
          (a) => String(a.WalletID) === String(w.WalletID),
        );
        const perAccount = {};
        if (list.length) {
          list.forEach((a) => {
            perAccount[a.AccountID] = Number(a.OpeningBalance) || 0;
          });
        } else {
          perAccount.Cash = parseFloat(w.OpeningCash) || 0;
          perAccount.Bank = parseFloat(w.OpeningBank) || 0;
        }
        return [
          w.WalletID,
          {
            totalBalance: Object.values(perAccount).reduce((s, v) => s + v, 0),
            cash: perAccount.Cash || 0,
            bank: perAccount.Bank || 0,
            accounts: perAccount,
            income: 0,
            expense: 0,
          },
        ];
      }),
    );
    transactions.forEach((t) => {
      const summary = summaries[t.WalletID];
      if (!summary) return;
      const amt = parseFloat(t.Amount) || 0;
      // A row with no parseable date is not "this month", so it contributes to
      // the balance but never to the monthly income/expense figures.
      const inCurrentMonth =
        typeof t.Date === "string" && t.Date.slice(0, 7) === currentMonth;
      // Only attribute the balance when the row names an account; a legacy row
      // with no Account contributes to nothing rather than a phantom key.
      const acct = t.Account ? String(t.Account) : "";
      const balanceDelta = transactionBalanceDelta(t);
      if (t.Type === "Income" && inCurrentMonth) summary.income += amt;
      if (t.Type === "Expense" && inCurrentMonth) summary.expense += amt;
      if (acct && balanceDelta !== null)
        summary.accounts[acct] = (summary.accounts[acct] || 0) + balanceDelta;
    });
    Object.values(summaries).forEach((summary) => {
      summary.totalBalance = Object.values(summary.accounts).reduce(
        (s, v) => s + v,
        0,
      );
      summary.cash = summary.accounts.Cash || 0;
      summary.bank = summary.accounts.Bank || 0;
    });
    return summaries;
    // currentMonth is in the deps so an app left open across a month boundary
    // recomputes the monthly figures on the next render instead of showing
    // last month's numbers.
  }, [wallets, transactions, currentMonth, accounts]);
  const transactionBalances = useMemo(
    () => calculateBalancesAfterTransactions(transactions, wallets, accounts),
    [transactions, wallets, accounts],
  );

  // Merge one or two returned transaction rows into local state directly —
  // replacing a matching ID if it already exists, appending if it's new —
  // instead of re-fetching the entire dataset after every mutation.
  const upsertTxns = (prev, newTxns) => {
    const byId = new Map(prev.map((t) => [t.ID, t]));
    newTxns.forEach((t) => byId.set(t.ID, t));
    return Array.from(byId.values());
  };

  const closeForm = useCallback(() => setFormModal(null), []);

  const handleSaveTransaction = (formData) => {
    setLoading(true);
    return api
      .addTransaction({ ...formData, user: currentUser.username })
      .then((res) => {
        showAlert(res.message, res.status === "ERROR" ? "error" : "success");
        if (res.status === "SUCCESS") {
          const newTxns =
            res.transactions || (res.transaction ? [res.transaction] : []);
          if (newTxns.length)
            setTransactions((prev) => upsertTxns(prev, newTxns));
        }
        setLoading(false);
        return res;
      })
      .catch((err) => {
        showAlert("ত্রুটি: " + err, "error");
        setLoading(false);
        throw err;
      });
  };

  // The modal forms close themselves on a successful save; a failed save stays
  // open so the user can correct the input without retyping it.
  const handleModalSave = (formData) =>
    handleSaveTransaction(formData).then((res) => {
      if (res && res.status === "SUCCESS") setFormModal(null);
      return res;
    });

  const handleDeleteTxn = async (id, walletId) => {
    const ok = await confirm({
      message: "আপনি কি এই লেনদেনটি মুছে ফেলতে চান?",
    });
    if (!ok) return;
    setLoading(true);
    api
      .deleteTransaction(id, walletId, currentUser.username)
      .then((res) => {
        showAlert(res.message, res.status === "ERROR" ? "error" : "success");
        if (res.status === "SUCCESS") {
          const removedIds = res.deletedIds || [id];
          setTransactions((prev) =>
            prev.filter((t) => !removedIds.includes(t.ID)),
          );
        }
        setLoading(false);
      })
      .catch((err) => {
        showAlert("ত্রুটি: " + err, "error");
        setLoading(false);
      });
  };

  const handleUpdateTransaction = (data) => {
    setLoading(true);
    return api
      .updateTransaction(data, currentUser.username)
      .then((res) => {
        showAlert(res.message, res.status === "ERROR" ? "error" : "success");
        if (res.status === "SUCCESS") {
          const updated =
            res.transactions || (res.transaction ? [res.transaction] : []);
          if (updated.length)
            setTransactions((prev) => upsertTxns(prev, updated));
          // A user who came from the profile edit form may not have
          // VIEW_TRANSACTIONS; don't dump them on a gated-off blank tab.
          setActiveTab(can("VIEW_TRANSACTIONS") ? "transactions" : "home");
        }
        setLoading(false);
        return res;
      })
      .catch((err) => {
        showAlert("ত্রুটি: " + err, "error");
        setLoading(false);
        throw err;
      });
  };

  const handleUserAction = (action, username, value) => {
    setLoading(true);
    const done = (res) => {
      showAlert(res.message, res.status === "ERROR" ? "error" : "success");
      if (res.status === "SUCCESS") loadData();
      else setLoading(false);
    };
    const onErr = (err) => {
      showAlert("ত্রুটি: " + err, "error");
      setLoading(false);
    };
    if (action === "delete")
      api.deleteUser(username, currentUser.username).then(done).catch(onErr);
    else
      api
        .setUserStatus(username, value, currentUser.username)
        .then(done)
        .catch(onErr);
  };

  // Merge returned loan rows into local state by id (replace existing, append new).
  const upsertLoans = (prev, newLoans) => {
    const byId = new Map(Array.from(prev, (l) => [String(l.id), l]));
    newLoans.forEach((l) => byId.set(String(l.id), l));
    return Array.from(byId.values());
  };

  const handleCheckActiveLoans = (identity) => {
    // Quiet server-side check used before creating a NEW loan. The server, not
    // the local loan list, decides whether this person has outstanding loans.
    return api
      .getPersonActiveLoans(currentUser.username, identity)
      .then((res) => {
        if (res && res.status === "ERROR")
          throw new Error(res.message || "লোনের আগের রেকর্ড যাচাই করা যায়নি।");
        return res;
      });
  };

  const handleSaveLoan = (formData) => {
    setLoading(true);
    return api
      .addLoan({ ...formData, user: currentUser.username })
      .then((res) => {
        showAlert(res.message, res.status === "ERROR" ? "error" : "success");
        if (res.status === "SUCCESS") {
          if (res.loan) setLoans((prev) => upsertLoans(prev, [res.loan]));
          if (res.transactions?.length)
            setTransactions((prev) => upsertTxns(prev, res.transactions));
        }
        setLoading(false);
        return res;
      })
      .catch((err) => {
        showAlert("ত্রুটি: " + err, "error");
        setLoading(false);
        throw err;
      });
  };

  const handleCreateSavingsPlan = (formData) => {
    setLoading(true);
    return api
      .createSavingsPlan({ ...formData, user: currentUser.username })
      .then((res) => {
        showAlert(res.message, res.status === "ERROR" ? "error" : "success");
        setLoading(false);
        return res;
      })
      .catch((err) => {
        showAlert("ত্রুটি: " + err, "error");
        setLoading(false);
        throw err;
      });
  };

  const handleUpdateLoan = (formData) => {
    setLoading(true);
    return api
      .updateLoan(
        { ...formData, user: currentUser.username },
        currentUser.username,
      )
      .then((res) => {
        showAlert(res.message, res.status === "ERROR" ? "error" : "success");
        if (res.status === "SUCCESS") {
          if (res.loan) setLoans((prev) => upsertLoans(prev, [res.loan]));
        }
        setLoading(false);
        return res;
      })
      .catch((err) => {
        showAlert("ত্রুটি: " + err, "error");
        setLoading(false);
        throw err;
      });
  };

  const handleLoanRepayment = (loanId, formData) => {
    setLoading(true);
    return api
      .addLoanRepayment({ ...formData, loanId, user: currentUser.username })
      .then((res) => {
        showAlert(res.message, res.status === "ERROR" ? "error" : "success");
        if (res.status === "SUCCESS") {
          if (res.loan) setLoans((prev) => upsertLoans(prev, [res.loan]));
          if (res.transactions?.length)
            setTransactions((prev) => upsertTxns(prev, res.transactions));
        }
        setLoading(false);
        return res;
      })
      .catch((err) => {
        showAlert("ত্রুটি: " + err, "error");
        setLoading(false);
        throw err;
      });
  };

  // Cancelling a loan is a SOFT delete: the row stays with status CANCELLED and
  // every wallet effect row it created is reversed. loadData() re-pulls
  // transactions/wallets so no balance card still shows the removed money.
  const handleCancelLoan = (loanId) => {
    setLoading(true);
    return api
      .deleteLoan(loanId, currentUser.username)
      .then((res) => {
        showAlert(res.message, res.status === "ERROR" ? "error" : "success");
        if (res.status === "SUCCESS") {
          if (res.loan) setLoans((prev) => upsertLoans(prev, [res.loan]));
          loadData();
        }
        setLoading(false);
        return res;
      })
      .catch((err) => {
        showAlert("ত্রুটি: " + err, "error");
        setLoading(false);
        throw err;
      });
  };

  const handleEditLoanRepayment = (formData) => {
    setLoading(true);
    return api
      .updateLoanRepayment(
        { ...formData, user: currentUser.username },
        currentUser.username,
      )
      .then((res) => {
        showAlert(res.message, res.status === "ERROR" ? "error" : "success");
        if (res.status === "SUCCESS") {
          if (res.loan) setLoans((prev) => upsertLoans(prev, [res.loan]));
          if (res.transactions?.length)
            setTransactions((prev) => upsertTxns(prev, res.transactions));
          else if (res.loan) loadData();
        }
        setLoading(false);
        return res;
      })
      .catch((err) => {
        showAlert("ত্রুটি: " + err, "error");
        setLoading(false);
        throw err;
      });
  };

  const handleDeleteLoanRepayment = (paymentId) => {
    setLoading(true);
    return api
      .deleteLoanRepayment(paymentId, currentUser.username)
      .then((res) => {
        showAlert(res.message, res.status === "ERROR" ? "error" : "success");
        if (res.status === "SUCCESS") {
          if (res.loan) setLoans((prev) => upsertLoans(prev, [res.loan]));
          if (res.transactions?.length)
            setTransactions((prev) => upsertTxns(prev, res.transactions));
          else if (res.loan) loadData();
        }
        setLoading(false);
        return res;
      })
      .catch((err) => {
        showAlert("ত্রুটি: " + err, "error");
        setLoading(false);
        throw err;
      });
  };

  const handleAddLoanAddition = (loanId, formData) => {
    setLoading(true);
    return api
      .addLoanAddition({ ...formData, loanId, user: currentUser.username })
      .then((res) => {
        showAlert(res.message, res.status === "ERROR" ? "error" : "success");
        if (res.status === "SUCCESS") {
          if (res.loan) setLoans((prev) => upsertLoans(prev, [res.loan]));
          if (res.transactions?.length)
            setTransactions((prev) => upsertTxns(prev, res.transactions));
        }
        setLoading(false);
        return res;
      })
      .catch((err) => {
        showAlert("ত্রুটি: " + err, "error");
        setLoading(false);
        throw err;
      });
  };

  const handleEditLoanAddition = (formData) => {
    setLoading(true);
    return api
      .editLoanAddition(
        { ...formData, user: currentUser.username },
        currentUser.username,
      )
      .then((res) => {
        showAlert(res.message, res.status === "ERROR" ? "error" : "success");
        if (res.status === "SUCCESS") {
          if (res.loan) setLoans((prev) => upsertLoans(prev, [res.loan]));
          if (res.transactions?.length)
            setTransactions((prev) => upsertTxns(prev, res.transactions));
          else if (res.loan)
            // The wallet effect row was updated in place (no new transaction is
            // returned), so re-pull transactions/wallets or balance cards stay stale.
            loadData();
        }
        setLoading(false);
        return res;
      })
      .catch((err) => {
        showAlert("ত্রুটি: " + err, "error");
        setLoading(false);
        throw err;
      });
  };

  const handleDeleteLoanAddition = (additionId) => {
    setLoading(true);
    return api
      .deleteLoanAddition(additionId, currentUser.username)
      .then((res) => {
        showAlert(res.message, res.status === "ERROR" ? "error" : "success");
        if (res.status === "SUCCESS") {
          if (res.loan) setLoans((prev) => upsertLoans(prev, [res.loan]));
          if (res.transactions?.length)
            setTransactions((prev) => upsertTxns(prev, res.transactions));
          else if (res.loan)
            // Deleting an addition reverses the wallet effect row in place, so
            // re-pull transactions/wallets to keep balance cards accurate.
            loadData();
        }
        setLoading(false);
        return res;
      })
      .catch((err) => {
        showAlert("ত্রুটি: " + err, "error");
        setLoading(false);
        throw err;
      });
  };

  const handleImportBackup = (backup) => {
    setLoading(true);
    api
      .importBackup(backup, currentUser.username)
      .then((res) => {
        showAlert(res.message, res.status === "ERROR" ? "error" : "success");
        // Backup restore rewrites transaction data across multiple wallets at
        // once, so a full reload here is the reliable option, unlike the
        // single-transaction mutations above.
        if (res.status === "SUCCESS") loadData();
        else setLoading(false);
      })
      .catch((err) => {
        showAlert("ত্রুটি: " + err, "error");
        setLoading(false);
      });
  };

  const handleProfileUpdate = (data) => {
    setLoading(true);
    api
      .updateUserProfile({ ...data, username: currentUser.username })
      .then((res) => {
        showAlert(res.message, res.status === "ERROR" ? "error" : "success");
        if (res.status === "SUCCESS") {
          // Changing your own PIN invalidates every session for the account on
          // the server, including this one. Sign out locally right away instead
          // of waiting for the next request to fail.
          if (res.sessionInvalidated) {
            api.logout().catch(() => {});
            forceLogout();
            return;
          }
          const { currentPin, pin, ...safeData } = data;
          const updatedUser = {
            ...currentUser,
            ...safeData,
            username: res.username || currentUser.username,
          };
          setCurrentUser(updatedUser);
        }
        setLoading(false);
      })
      .catch((err) => {
        // The token was already cleared by api.js for a dead session; the
        // auth-failure listener performs the sign-out.
        if (err && AUTH_FAILURE_CODES.includes(err.code)) return;
        showAlert("ত্রুটি: " + err, "error");
        setLoading(false);
      });
  };

  // Pull-to-refresh
  const pullTouchStart = useCallback((e) => {
    if (window.scrollY === 0)
      e.currentTarget.dataset.startY = e.touches[0].clientY;
  }, []);

  const pullTouchMove = useCallback(
    (e) => {
      const startY = parseFloat(e.currentTarget.dataset.startY);
      if (!startY) return;
      const diff = e.touches[0].clientY - startY;
      if (diff > 80 && !loading && !pullRefreshing) {
        setPullRefreshing(true);
        loadData();
        e.currentTarget.dataset.startY = "";
      }
    },
    [loading, pullRefreshing, loadData],
  );

  const pullTouchEnd = useCallback(() => {
    setTimeout(() => setPullRefreshing(false), 1000);
  }, []);

  // Android hardware Back button. The app has no URL router - every screen is
  // a value of `activeTab` - so Back walks that tab history backwards and only
  // lets the press fall through to the app root (where it minimizes) once the
  // user is actually on Home. Reads the latest state through refs, so the
  // native listener is registered exactly once and never goes stale.
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const canRef = useRef(can);
  canRef.current = can;

  const handleSystemBack = useCallback(() => {
    const tab = activeTabRef.current;
    if (tab === "home") return false;
    if (tab.indexOf("edit-") === 0) {
      setActiveTab(
        canRef.current("VIEW_TRANSACTIONS") ? "transactions" : "home",
      );
      return true;
    }
    if (tab === "loan-add") {
      setActiveTab("loans");
      return true;
    }
    if (tab.indexOf("loan-details-") === 0) {
      setActiveTab("loans");
      return true;
    }
    if (tab.indexOf("loan-edit-") === 0) {
      setActiveTab("loan-details-" + tab.slice("loan-edit-".length));
      return true;
    }
    if (tab.indexOf("loan-") === 0) {
      setActiveTab("loans");
      return true;
    }
    if (tab.indexOf("savings-details-") === 0) {
      setActiveTab("savings");
      return true;
    }
    if (tab === "savings-add") {
      setActiveTab("savings");
      return true;
    }
    if (tab.indexOf("shop-ledger-report-") === 0) {
      const shopId = tab.slice("shop-ledger-report-".length).split("|")[0];
      setActiveTab("shop-ledger-details-" + shopId);
      return true;
    }
    if (tab.indexOf("shop-ledger-details-") === 0) {
      setActiveTab("shop-ledger");
      return true;
    }
    if (tab === "backup") {
      setActiveTab("profile");
      return true;
    }
    // Every other top-level tab returns to Home.
    setActiveTab("home");
    return true;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let dispose = () => {};
    registerNativeBackButton(() => handleSystemBack()).then((d) => {
      if (cancelled) d();
      else dispose = d;
    });
    return () => {
      cancelled = true;
      dispose();
    };
  }, [handleSystemBack]);

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[var(--ah-header-2)] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <Suspense fallback={<PageFallback />}>
        <LoginScreen
          onReady={markLoginReady}
          onLogin={(user, token) => {
            sessionEpoch.current += 1;
            resetUiState();
            session.save(token);
            setCurrentUser(user);
            // Currency registry for dropdowns and money formatting. Fire-and-forget
            // for the same reason as the session-restore path above.
            loadCurrencies(user.username);
          }}
        />
      </Suspense>
    );
  }

  return (
    <div className="mobile-container flex flex-col min-h-screen border-x border-[var(--ah-border)] transition-colors">
      <UpdateDialog
        open={autoUpdateState !== "idle"}
        state={autoUpdateState}
        release={autoUpdateRelease}
        installed={autoUpdateInstalled}
        progress={autoUpdateProgress}
        message={autoUpdateMessage}
        onUpdate={startAutoUpdateDownload}
        onLater={resetAutoUpdate}
        onClose={resetAutoUpdate}
        onOpenInstaller={() => launchAutoUpdateInstaller()}
        onOpenSettings={openInstallPermissionSettings}
      />
      {/* Header */}
      <header
        className="app-header sticky top-0 z-30 px-4 pb-4 flex items-center justify-between"
        style={{
          background:
            "linear-gradient(135deg, var(--ah-header) 0%, var(--ah-header-2) 100%)",
          boxShadow: "var(--ah-shadow)",
        }}
      >
        <button
          onClick={() => setActiveTab("home")}
          className="flex items-center gap-2.5 min-w-0 text-left"
        >
          <span
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: "rgba(255,255,255,.14)",
              color: "var(--ah-header-text)",
              border: "1px solid rgba(255,255,255,.16)",
            }}
          >
            <Icon name="wallet" />
          </span>
          <span className="min-w-0">
            <span
              className="block text-[15px] font-bold leading-tight truncate"
              style={{ color: "var(--ah-header-text)" }}
            >
              মাই হিসাব
            </span>
            <span
              className="block text-[10px] leading-tight truncate"
              style={{ color: "var(--ah-header-text-2)" }}
            >
              মাই পার্সোনাল হিসাব
            </span>
          </span>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() =>
              setThemeMode((m) => {
                const next = THEME_MODES[(THEME_MODES.indexOf(m) + 1) % THEME_MODES.length];
                return next;
              })
            }
            aria-label="থিম পরিবর্তন"
            title={
              themeMode === "system"
                ? "সিস্টেম থিম"
                : themeMode === "light"
                  ? "লাইট থিম"
                  : "ডার্ক থিম"
            }
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{
              background: "rgba(255,255,255,.12)",
              color: "var(--ah-header-text)",
              border: "1px solid rgba(255,255,255,.14)",
            }}
          >
            <Icon name={themeMode === "system" ? "contrast" : resolvedTheme === "dark" ? "moon" : "sun"} />
          </button>

          <button
            onClick={() => setActiveTab("profile")}
            className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full"
            style={{
              background: "rgba(255,255,255,.12)",
              border: "1px solid rgba(255,255,255,.14)",
            }}
          >
            <span
              className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold"
              style={{ background: "var(--ah-brand)", color: "#fff" }}
            >
              {String(currentUser.fullName || currentUser.username || "U")
                .charAt(0)
                .toUpperCase()}
            </span>
            <span
              className="text-[11px] font-semibold max-w-[90px] truncate"
              style={{ color: "var(--ah-header-text)" }}
            >
              {currentUser.fullName || currentUser.username}
            </span>
          </button>
        </div>
      </header>

      <div
        className="px-3 py-2 flex justify-between items-center"
        style={{
          background: "var(--ah-surface)",
          borderBottom: "1px solid var(--ah-border)",
        }}
      >
        <span className="text-[11px] text-ink-2 font-medium">
          {new Date().toLocaleDateString("bn-BD", {
            year: "numeric",
            month: "long",
            day: "numeric",
            weekday: "long",
          })}
        </span>
        <span
          className="badge"
          style={{
            background: "var(--ah-brand-soft)",
            color: "var(--ah-brand-strong)",
          }}
        >
          <Icon name="shield-half" />
          {currentUser.role}
        </span>
      </div>

      {loading && (
        <div className="w-full h-1 overflow-hidden" style={{ background: "var(--ah-brand-soft)" }}>
          <div
            className="h-full w-full animate-pulse"
            style={{ background: "var(--ah-brand)" }}
          />
        </div>
      )}

      <main
        className="flex-1 p-3 md:p-6 overflow-y-auto custom-scrollbar"
        onTouchStart={pullTouchStart}
        onTouchMove={pullTouchMove}
        onTouchEnd={pullTouchEnd}
      >
        {pullRefreshing && (
          <div className="text-center py-2 text-xs text-[var(--ah-success)]">
            <Icon name="refresh-cw" className="me-1 animate-spin" />{" "}
            রিফ্রেশ হচ্ছে...
          </div>
        )}
        <ErrorBoundary>
          <Suspense fallback={<PageFallback />}>
            {activeTab === "home" && can("VIEW_DASHBOARD") && (
              <DashboardView
                wallets={wallets}
                walletSummaries={walletSummaries}
                setActiveTab={setActiveTab}
                setFilterWallet={setFilterWallet}
                can={can}
              />
            )}

            {can("VIEW_TRANSACTIONS") && activeTab === "transactions" && (
              <TransactionsView
                transactions={transactions}
                transactionBalances={transactionBalances}
                wallets={wallets}
                onDelete={handleDeleteTxn}
                onEdit={(txn) => setActiveTab("edit-" + txn.ID)}
                canEdit={can("MANAGE_TRANSACTIONS")}
                canDelete={can("MANAGE_TRANSACTIONS")}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                filterType={filterType}
                setFilterType={setFilterType}
                filterWallet={filterWallet}
                setFilterWallet={setFilterWallet}
                filterUser={filterUser}
                setFilterUser={setFilterUser}
                filterAccount={filterAccount}
                setFilterAccount={setFilterAccount}
                canViewUsers={canManageUsers}
                users={usersList}
              />
            )}

            {activeTab.indexOf("edit-") === 0 &&
              can("MANAGE_TRANSACTIONS") &&
              (() => {
                const editTxn = transactions.find(
                  (t) => String(t.ID) === activeTab.slice(5),
                );
                const postEdit = () =>
                  setActiveTab(
                    can("VIEW_TRANSACTIONS") ? "transactions" : "home",
                  );
                if (!editTxn)
                  return (
                    <EditTransactionForm
                      transaction={null}
                      onSave={handleUpdateTransaction}
                      onCancel={postEdit}
                    />
                  );
                if (
                  editTxn.Type === "Transfer Out" ||
                  editTxn.Type === "Transfer In"
                ) {
                  return (
                    <EditTransferForm
                      key={editTxn.ID}
                      transaction={editTxn}
                      currentUser={currentUser}
                      onSave={handleUpdateTransaction}
                      onCancel={postEdit}
                    />
                  );
                }
                return (
                  <EditTransactionForm
                    key={editTxn.ID}
                    transaction={editTxn}
                    onSave={handleUpdateTransaction}
                    onCancel={postEdit}
                  />
                );
              })()}

            {activeTab.indexOf("edit-") === 0 &&
              !can("MANAGE_TRANSACTIONS") && (
                <div className="text-center py-16 px-4">
                  <Icon name="lock" className="text-3xl text-ink-3 dark:text-ink-2 mb-3" />
                  <div className="text-sm font-semibold text-ink-2">
                    লেনদেন এডিট করার অনুমতি নেই
                  </div>
                  <button
                    onClick={() => setActiveTab("transactions")}
                    className="mt-3 bg-[var(--ah-header)] text-white text-xs font-semibold px-4 py-2 rounded-xl"
                  >
                    লেনদেনে ফিরে যান
                  </button>
                </div>
              )}

            {canLoan && activeTab === "loans" && (
              <LoanDashboardView
                loans={loans}
                currentUser={currentUser}
                users={usersList}
                can={can}
                onLoansChange={setLoans}
                onAdd={() => setActiveTab("loan-add")}
                onSelect={(loanId) => setActiveTab("loan-details-" + loanId)}
              />
            )}

            {canAddLoan && activeTab === "loan-add" && (
              <LoanForm
                can={can}
                wallets={wallets}
                loans={loans}
                currentUser={currentUser}
                onSave={handleSaveLoan}
                onAddToLoan={handleAddLoanAddition}
                onCheckActive={handleCheckActiveLoans}
                onCancel={() => setActiveTab("loans")}
                onDone={() => setActiveTab("loans")}
                onGoHome={() => setActiveTab("home")}
                onShow={(l) => {
                  if (l?.id) setActiveTab("loan-details-" + l.id);
                }}
              />
            )}

            {canLoan &&
              activeTab.indexOf("loan-details-") === 0 &&
              (() => {
                const loanId = activeTab.slice("loan-details-".length);
                const found = loans.find(
                  (l) => String(l.id) === String(loanId),
                );
                return (
                  <LoanDetailsView
                    key={"details-" + loanId}
                    loan={found || { id: loanId }}
                    wallets={wallets}
                    currentUser={currentUser}
                    can={can}
                    showAlert={showAlert}
                    onBack={() => setActiveTab("loans")}
                    onGoHome={() => setActiveTab("home")}
                    onEdit={() => setActiveTab("loan-edit-" + loanId)}
                    onRepayment={handleLoanRepayment}
                    onAddAddition={handleAddLoanAddition}
                    onEditAddition={handleEditLoanAddition}
                    onDeleteAddition={handleDeleteLoanAddition}
                    onEditRepayment={handleEditLoanRepayment}
                    onDeleteRepayment={handleDeleteLoanRepayment}
                    onCancelLoan={handleCancelLoan}
                  />
                );
              })()}

            {canEditLoan &&
              activeTab.indexOf("loan-edit-") === 0 &&
              (() => {
                const loanId = activeTab.slice("loan-edit-".length);
                const found = loans.find(
                  (l) => String(l.id) === String(loanId),
                );
                if (!found) {
                  return (
                    <div className="bg-[var(--ah-surface)] rounded-2xl border border-[var(--ah-border)] p-4 text-center">
                      <div className="text-sm text-ink-3 py-4">
                        লোন পাওয়া যায়নি।
                      </div>
                      <button
                        onClick={() => setActiveTab("loans")}
                        className="w-full bg-[var(--ah-brand)] text-white font-bold py-2.5 rounded-xl text-xs"
                      >
                        লিষ্টে ফিরে যান
                      </button>
                    </div>
                  );
                }
                return (
                  <LoanForm
                    key={"edit-" + found.id}
                    loan={found}
                    wallets={wallets}
                    loans={loans}
                    currentUser={currentUser}
                    onSave={handleUpdateLoan}
                    onCancel={() => setActiveTab("loan-details-" + loanId)}
                    onDone={() => setActiveTab("loan-details-" + loanId)}
                    onGoHome={() => setActiveTab("home")}
                    onShow={(l) => {
                      if (l?.id) setActiveTab("loan-details-" + l.id);
                    }}
                  />
                );
              })()}

            {canLoan &&
              activeTab.indexOf("loan-") === 0 &&
              activeTab !== "loans" &&
              activeTab !== "loan-add" &&
              activeTab.indexOf("loan-details-") !== 0 &&
              activeTab.indexOf("loan-edit-") !== 0 && (
                <div className="text-center py-16 px-4">
                  <Icon name="hand-coins" className="text-3xl text-ink-3 dark:text-ink-2 mb-3" />
                  <div className="text-sm font-semibold text-ink-2">
                    হাওলাত বিভাগ
                  </div>
                  <button
                    onClick={() => setActiveTab("loans")}
                    className="mt-3 bg-[var(--ah-header)] text-white text-xs font-semibold px-4 py-2 rounded-xl"
                  >
                    হাওলাত লিষ্ট
                  </button>
                </div>
              )}

            {canSavings && activeTab === "savings" && (
              <SavingsDashboardView
                currentUser={currentUser}
                users={usersList}
                canCreate={canCreateSavings}
                onAdd={() => setActiveTab("savings-add")}
                onOpenDetails={(planId) =>
                  setActiveTab("savings-details-" + planId)
                }
              />
            )}

            {canSavings && activeTab === "savings-add" && (
              <SavingsForm
                can={can}
                wallets={wallets}
                currentUser={currentUser}
                onSave={handleCreateSavingsPlan}
                onCancel={() => setActiveTab("savings")}
                onDone={() => setActiveTab("savings")}
                onGoHome={() => setActiveTab("home")}
                onShow={(p) => {
                  if (p?.PlanID) setActiveTab("savings-details-" + p.PlanID);
                  else setActiveTab("savings");
                }}
              />
            )}

            {canSavings &&
              activeTab.indexOf("savings-details-") === 0 &&
              (() => {
                const planId = activeTab.slice("savings-details-".length);
                return (
                  <SavingsDetailsView
                    key={"savings-details-" + planId}
                    planId={planId}
                    currentUser={currentUser}
                    wallets={wallets}
                    can={can}
                    showAlert={showAlert}
                    onRefresh={loadData}
                    onBack={() => setActiveTab("savings")}
                  />
                );
              })()}

            {can("VIEW_REPORTS") && activeTab === "reports" && (
              <ReportsView
                wallets={wallets}
                currentUser={currentUser}
                users={usersList}
              />
            )}

            {canShopLedger && activeTab === "shop-ledger" && (
              <ShopCreditLedgerDashboardView
                wallets={wallets}
                can={can}
                showAlert={showAlert}
                onOpenShop={(shopId, tab, action) => {
                  const suffix = [
                    tab && tab !== "markets" ? tab : "",
                    action || "",
                  ].filter(Boolean).join("|");
                  setActiveTab(
                    "shop-ledger-details-" + shopId + (suffix ? "|" + suffix : ""),
                  );
                }}
              />
            )}

            {canShopLedger &&
              activeTab.indexOf("shop-ledger-details-") === 0 &&
              (() => {
                const [shopId, initialTab, initialAction] = activeTab
                  .slice("shop-ledger-details-".length)
                  .split("|");
                return (
                  <ShopLedgerDetailsView
                    key={"shop-ledger-details-" + shopId}
                    shopId={shopId}
                    can={can}
                    showAlert={showAlert}
                    users={usersList}
                    initialTab={initialTab || "markets"}
                    initialAction={initialAction || ""}
                    onBack={() => setActiveTab("shop-ledger")}
                    onOpenReport={() =>
                      setActiveTab("shop-ledger-report-" + shopId)
                    }
                  />
                );
              })()}

            {canShopLedger &&
              can("VIEW_SHOP_REPORTS") &&
              activeTab.indexOf("shop-ledger-report-") === 0 &&
              (() => {
                const shopId = activeTab
                  .slice("shop-ledger-report-".length)
                  .split("|")[0];
                return (
                  <ShopLedgerReportView
                    key={"shop-ledger-report-" + shopId}
                    shopId={shopId}
                    can={can}
                    showAlert={showAlert}
                    onBack={() =>
                      setActiveTab("shop-ledger-details-" + shopId)
                    }
                  />
                );
              })()}

            {canManageUsers && activeTab === "users" && (
              <UserManagementView
                users={usersList}
                wallets={wallets}
                onRefresh={loadData}
                showAlert={showAlert}
                currentUser={currentUser}
                onUserAction={handleUserAction}
                can={can}
              />
            )}

            {canManageWallets && activeTab === "wallets" && (
              <WalletManagementView
                currentUser={currentUser}
                can={can}
                showAlert={showAlert}
                walletSummaries={walletSummaries}
                users={usersList}
                onRefresh={loadData}
              />
            )}

            {can("VIEW_AUDIT_LOG") && activeTab === "auditlog" && (
              <AuditLogView
                currentUser={currentUser}
                onCancel={() => setActiveTab("home")}
              />
            )}

            {canManageSettings && activeTab === "settings" && (
              <SettingsView
                showAlert={showAlert}
                currentUser={currentUser}
                can={can}
                wallets={wallets}
              />
            )}

            {can("BACKUP_RESTORE") && activeTab === "backup" && (
              <BackupRestoreView
                currentUser={currentUser}
                showAlert={showAlert}
                onImport={handleImportBackup}
                can={can}
                onCancel={() => setActiveTab("profile")}
              />
            )}

            {activeTab === "profile" && (
              <UserProfileView
                currentUser={currentUser}
                transactions={transactions}
                transactionBalances={transactionBalances}
                wallets={wallets}
                darkMode={resolvedTheme === "dark"}
                onSetDark={(v) => setThemeMode(v ? "dark" : "light")}
                themeMode={themeMode}
                onSetTheme={setThemeMode}
                can={can}
                onSave={handleProfileUpdate}
                onCancel={() => setActiveTab("home")}
                onEditTxn={(txn) => setActiveTab("edit-" + txn.ID)}
                onDeleteTxn={handleDeleteTxn}
                onLogout={handleLogout}
                setActiveTab={setActiveTab}
              />
            )}

            {activeTab === "home" && !can("VIEW_DASHBOARD") && (
              <div className="text-center py-16 px-4">
                <Icon name="lock" className="text-3xl text-ink-3 dark:text-ink-2 mb-3" />
                <div className="text-sm font-semibold text-ink-2">
                  ড্যাশবোর্ড দেখার অনুমতি নেই
                </div>
                <div className="text-xs text-ink-3 mt-1">
                  নিচের মেনু থেকে আপনার অনুমোদিত পেজ ব্যবহার করুন।
                </div>
              </div>
            )}

            {!currentUser.permissions?.length && activeTab === "home" && (
              <div className="text-center py-16 px-4">
                <Icon name="lock" className="text-3xl text-ink-3 dark:text-ink-2 mb-3" />
                <div className="text-sm font-semibold text-ink-2">
                  এখনো কোনো অনুমতি দেওয়া হয়নি
                </div>
                <div className="text-xs text-ink-3 mt-1">
                  আপনার অ্যাকাউন্টে কোনো Permission সেট করা নেই। Admin এর সাথে
                  যোগাযোগ করুন।
                </div>
              </div>
            )}
          </Suspense>
        </ErrorBoundary>
      </main>

      {activeTab === "home" && (can("ADD_INCOME") || can("ADD_EXPENSE")) && (
        <div className="fixed bottom-[calc(84px+env(safe-area-inset-bottom,0px))] left-0 right-0 max-w-[480px] md:max-w-[1000px] mx-auto px-4 flex flex-col items-end gap-2.5 z-40 pointer-events-none">
          {can("ADD_INCOME") && (
            <button
              onClick={() => setFormModal("income")}
              aria-label="Income"
              title="Income (আয়)"
              className="fab fab-income pointer-events-auto"
            >
              <Icon name="plus" className="text-lg" />
            </button>
          )}
          {can("ADD_EXPENSE") && (
            <button
              onClick={() => setFormModal("expense")}
              aria-label="Expense"
              title="Expense (খরচ)"
              className="fab fab-expense pointer-events-auto"
            >
              <Icon name="minus" className="text-lg" />
            </button>
          )}
        </div>
      )}

      {/* Income / Expense / Transfer popups */}
      <Suspense fallback={null}>
        {can("ADD_INCOME") && formModal === "income" && (
          <Popup open title="Income (আয় যোগ করুন)" onClose={closeForm} maxWidth="max-w-md">
            <IncomeForm
              embedded
              wallets={wallets}
              categories={categories}
              currentUser={currentUser}
              onSave={handleModalSave}
              onCancel={closeForm}
            />
          </Popup>
        )}
        {can("ADD_EXPENSE") && formModal === "expense" && (
          <Popup open title="Expense (খরচ যোগ করুন)" onClose={closeForm} maxWidth="max-w-md">
            <ExpenseForm
              embedded
              wallets={wallets}
              categories={categories}
              currentUser={currentUser}
              onSave={handleModalSave}
              onCancel={closeForm}
            />
          </Popup>
        )}
        {(can("TRANSFER_MONEY") || can("BANK_OPERATIONS")) && formModal === "transfer" && (
          <Popup open title="Transfer (ট্রান্সফার)" onClose={closeForm} maxWidth="max-w-md">
            <MoveMoneyForm
              embedded
              wallets={wallets}
              currentUser={currentUser}
              can={can}
              onSave={handleModalSave}
              onCancel={closeForm}
            />
          </Popup>
        )}
      </Suspense>

      {/* Bottom Nav */}
      <nav
        className="app-bottom-nav fixed bottom-0 left-0 right-0 max-w-[480px] md:max-w-[1000px] mx-auto flex justify-around items-center pt-2 z-40"
        style={{
          background: "var(--ah-nav)",
          borderTop: "1px solid var(--ah-nav-border)",
          boxShadow: "0 -6px 22px -14px rgba(12,26,20,.35)",
        }}
      >
        <NavItem
          icon="house"
          label="Home"
          active={activeTab === "home"}
          onClick={() => setActiveTab("home")}
        />
        {can("VIEW_TRANSACTIONS") && (
          <NavItem
            icon="list-checks"
            label="Txn"
            active={
              activeTab === "transactions" || activeTab.indexOf("edit-") === 0
            }
            onClick={() => setActiveTab("transactions")}
          />
        )}
        {(can("TRANSFER_MONEY") || can("BANK_OPERATIONS")) && (
          <NavItem
            icon="arrow-left-right"
            label="Transfer"
            active={formModal === "transfer"}
            onClick={() => setFormModal("transfer")}
          />
        )}
        {canLoan && (
          <NavItem
            icon="hand-coins"
            label="Loan"
            active={activeTab === "loans"}
            onClick={() => setActiveTab("loans")}
          />
        )}
        {canSavings && (
          <NavItem
            icon="piggy-bank"
            label="Savings"
            active={
              activeTab === "savings" || activeTab.indexOf("savings-details-") === 0
            }
            onClick={() => setActiveTab("savings")}
          />
        )}
        {canShopLedger && (
          <NavItem
            icon="store"
            label="বাকির খাতা"
            active={activeTab.indexOf("shop-ledger") === 0}
            onClick={() => setActiveTab("shop-ledger")}
          />
        )}
        {can("VIEW_REPORTS") && (
          <NavItem
            icon="chart-pie"
            label="Reports"
            active={activeTab === "reports"}
            onClick={() => setActiveTab("reports")}
          />
        )}
      </nav>
    </div>
  );
}

// One bottom-navigation entry. The active item is marked with a brand pill
// behind the icon, so the current section is obvious at a glance.
function NavItem({ icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 px-2 min-w-[58px]"
      style={{ color: active ? "var(--ah-brand)" : "var(--ah-text-3)" }}
    >
      <span
        className="w-9 h-7 rounded-lg flex items-center justify-center text-[15px] transition-colors"
        style={{ background: active ? "var(--ah-brand-soft)" : "transparent" }}
      >
        <Icon name={icon} />
      </span>
      <span className="text-[10px] font-semibold leading-none">{label}</span>
    </button>
  );
}
