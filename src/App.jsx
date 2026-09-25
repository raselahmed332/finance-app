import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  lazy,
  Suspense,
} from "react";
import { api, session } from "./api.js";
import { useToast } from "./components/Toast.jsx";
import { useConfirm } from "./components/ConfirmDialog.jsx";

const LoginScreen = lazy(() => import("./pages/LoginScreen.jsx"));
const DashboardView = lazy(() => import("./pages/DashboardView.jsx"));
const TransactionsView = lazy(() => import("./pages/TransactionsView.jsx"));
const ReportsView = lazy(() => import("./pages/ReportsView.jsx"));
const UserManagementView = lazy(() => import("./pages/UserManagementView.jsx"));
const WalletManagementView = lazy(
  () => import("./pages/WalletManagementView.jsx"),
);
const AuditLogView = lazy(() => import("./pages/AuditLogView.jsx"));
const SettingsView = lazy(() => import("./pages/SettingsView.jsx"));
const BackupRestoreView = lazy(() => import("./pages/BackupRestoreView.jsx"));
const UserProfileView = lazy(() => import("./pages/UserProfileView.jsx"));
const LoanDashboardView = lazy(() => import("./pages/LoanDashboardView.jsx"));
const LoanDetailsView = lazy(() => import("./pages/LoanDetailsView.jsx"));

const BankOperationForm = lazy(
  () => import("./components/BankOperationForm.jsx"),
);
const IncomeForm = lazy(() => import("./components/IncomeForm.jsx"));
const ExpenseForm = lazy(() => import("./components/ExpenseForm.jsx"));
const TransferForm = lazy(() => import("./components/TransferForm.jsx"));
const EditTransactionForm = lazy(
  () => import("./components/EditTransactionForm.jsx"),
);
const EditTransferForm = lazy(
  () => import("./components/EditTransferForm.jsx"),
);
const LoanForm = lazy(() => import("./components/LoanForm.jsx"));

function PageFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem("hisab_user");
    if (!saved) return null;
    try {
      return JSON.parse(saved);
    } catch {
      // Corrupted/truncated stored session — don't white-screen the app.
      localStorage.removeItem("hisab_user");
      session.clear();
      return null;
    }
  });
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem("hisab_dark");
    if (saved !== null) return saved === "true";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const toast = useToast();
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState("home");
  const [transactions, setTransactions] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(false);
  // Session epoch guard. Bumped on every login AND every logout. Each request
  // captures the current epoch when it STARTS and only writes user/session
  // state if the epoch is still current when it RESOLVES. A boolean flag alone
  // was racy: it was re-armed at login, so a pre-logout response could resolve
  // after a new login and resurrect the previous user's session/data.
  const sessionEpoch = useRef(0);
  const [pullRefreshing, setPullRefreshing] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("hisab_dark", darkMode);
  }, [darkMode]);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("All");
  const [filterWallet, setFilterWallet] = useState("All");
  const [filterDate, setFilterDate] = useState("");
  const [filterDescription, setFilterDescription] = useState("");
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
  const canManageSettings = canAny(["BACKUP_RESTORE", "MANAGE_CATEGORIES"]);
  // Loan module: visible to everyone with wallet access (VIEW_LOANS is implied
  // by wallet access); Admins have it via their full effective permission set.
  const canLoan = can("VIEW_LOANS");
  // Loan creation needs an issuing action (not just view); loan editing needs
  // the management grant the backend requires (MANAGE_LOANS is never auto-granted).
  const canAddLoan = canAny(["LOAN_GIVE", "LOAN_TAKE", "MANAGE_LOANS"]);
  const canEditLoan = can("MANAGE_LOANS");

  const showAlert = useCallback((msg, type = "success") => toast(msg, type), [toast]);

  const loadData = useCallback(() => {
    setLoading(true);
    const epoch = sessionEpoch.current;
    api
      .getInitialData(currentUser.username)
      .then((res) => {
        if (sessionEpoch.current !== epoch) return;
        if (res.status === "ERROR") {
          showAlert(res.message, "error");
          if (/session|login/i.test(res.message || "")) {
            setCurrentUser(null);
            session.clear();
            localStorage.removeItem("hisab_user");
          }
          setLoading(false);
          return;
        }
        const data = {
          transactions: res.transactions || [],
          users: res.users || [],
          wallets: res.wallets || [],
          categories: res.categories || [],
        };
        setTransactions(data.transactions);
        setUsersList(data.users);
        setWallets(data.wallets);
        setCategories(data.categories);
        // Stale-response guard: if the user logged out or a different user
        // logged in while this getInitialData was in flight, do NOT resurrect
        // that session here.
        if (sessionEpoch.current !== epoch) return;
        // Keep permissions in sync in case Admin changed them elsewhere.
        if (res.permissions) {
          const updated = { ...currentUser, permissions: res.permissions };
          setCurrentUser(updated);
          localStorage.setItem("hisab_user", JSON.stringify(updated));
        }
        setLoading(false);
      })
      .catch((err) => {
        if (sessionEpoch.current !== epoch) return;
        showAlert("ডেটা লোড করতে ব্যর্থ হয়েছে: " + err, "error");
        setLoading(false);
      });
  }, [currentUser?.username, showAlert]);

  // Load data on mount or when user changes
  useEffect(() => {
    if (!currentUser) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.username]);

  // Clear every user-scoped list and search/filter state so a freshly
  // logged-in user never sees the previous user's data or a stale filter
  // that silently hides rows.
  const resetUiState = () => {
    setTransactions([]);
    setUsersList([]);
    setWallets([]);
    setCategories([]);
    setLoans([]);
    setSearchTerm("");
    setFilterType("All");
    setFilterWallet("All");
    setFilterDate("");
    setFilterDescription("");
    setFilterUser("All");
    setFilterAccount("All");
    setActiveTab("home");
  };

  const handleLogout = useCallback(() => {
    sessionEpoch.current += 1;
    resetUiState();
    api.logout().catch(() => {});
    setCurrentUser(null);
    session.clear();
    localStorage.removeItem("hisab_user");
  }, []);

  // Per-wallet summary, computed from already-authorized transactions.
  // Single pass over all transactions rather than re-filtering the whole
  // array once per wallet — matters once there are more than a couple wallets.
  const walletSummaries = useMemo(() => {
    const summaries = Object.fromEntries(
      wallets.map((w) => [
        w.WalletID,
        {
          totalBalance:
            (parseFloat(w.OpeningCash) || 0) + (parseFloat(w.OpeningBank) || 0),
          cash: parseFloat(w.OpeningCash) || 0,
          bank: parseFloat(w.OpeningBank) || 0,
          income: 0,
          expense: 0,
        },
      ]),
    );
    transactions.forEach((t) => {
      const summary = summaries[t.WalletID];
      if (!summary) return;
      const amt = parseFloat(t.Amount) || 0;
      if (
        t.Type === "Income" ||
        t.Type === "Transfer In" ||
        t.Type === "Loan In" ||
        t.Type === "Loan Repaid"
      ) {
        if (t.Type === "Income") summary.income += amt;
        if (t.Account === "Cash") summary.cash += amt;
        if (t.Account === "Bank") summary.bank += amt;
      } else if (
        t.Type === "Expense" ||
        t.Type === "Transfer Out" ||
        t.Type === "Loan Out" ||
        t.Type === "Loan Payment"
      ) {
        if (t.Type === "Expense") summary.expense += amt;
        if (t.Account === "Cash") summary.cash -= amt;
        if (t.Account === "Bank") summary.bank -= amt;
      }
    });
    Object.values(summaries).forEach((summary) => {
      summary.totalBalance = summary.cash + summary.bank;
    });
    return summaries;
  }, [wallets, transactions]);

  // Merge one or two returned transaction rows into local state directly —
  // replacing a matching ID if it already exists, appending if it's new —
  // instead of re-fetching the entire dataset after every mutation.
  const upsertTxns = (prev, newTxns) => {
    const byId = new Map(prev.map((t) => [t.ID, t]));
    newTxns.forEach((t) => byId.set(t.ID, t));
    return Array.from(byId.values());
  };

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
          setActiveTab("home");
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

  const handleDeleteTxn = async (id, walletId) => {
    const ok = await confirm({ message: "আপনি কি এই লেনদেনটি মুছে ফেলতে চান?" });
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
          // A user who came from the profile swipe-edit may not have
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
        if (res && res.status === "ERROR") throw new Error(res.message || "লোনের আগের রেকর্ড যাচাই করা যায়নি।");
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
      .editLoanAddition({ ...formData, user: currentUser.username }, currentUser.username)
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
          const { currentPin, pin, ...safeData } = data;
          const updatedUser = {
            ...currentUser,
            ...safeData,
            username: res.username || currentUser.username,
          };
          setCurrentUser(updatedUser);
          localStorage.setItem("hisab_user", JSON.stringify(updatedUser));
        }
        setLoading(false);
      })
      .catch((err) => {
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

  if (!currentUser) {
    return (
      <LoginScreen
        onLogin={(user, token) => {
          sessionEpoch.current += 1;
          resetUiState();
          session.save(token);
          localStorage.setItem("hisab_user", JSON.stringify(user));
          setCurrentUser(user);
        }}
      />
    );
  }

  return (
    <div className="mobile-container flex flex-col min-h-screen bg-gray-50 dark:bg-gray-950 border-x border-gray-200 dark:border-gray-800 transition-colors">
      {/* Header */}
      <header className="bg-gray-900 dark:bg-gray-950 text-white px-4 py-4 flex items-center justify-between sticky top-0 z-30 shadow-md">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab("home")}
            className="text-xl text-emerald-400 font-bold flex items-center"
          >
            <i className="fa-solid me-1.5 fa-wallet"></i> মাই হিসাব
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("profile")}
            className="text-xs bg-gray-800 dark:bg-gray-800 px-2.5 py-1 rounded-full text-emerald-300 border border-gray-700 dark:border-gray-700"
          >
            <i className="fa-solid fa-user me-1"></i>{" "}
            {currentUser.fullName || currentUser.username}
          </button>
        </div>
      </header>

      <div className="bg-gray-800 dark:bg-gray-900 text-center py-2 px-3 text-white text-xs font-medium border-b border-gray-700 dark:border-gray-800 flex justify-between items-center">
        <span>মাই পার্সোনাল হিসাব - ওয়েব অ্যাপ</span>
        <span className="text-amber-300 font-semibold">{currentUser.role}</span>
      </div>

      <div className="text-center py-1.5 px-3 text-[11px] text-slate-500 dark:text-gray-400 font-medium">
        {new Date().toLocaleDateString("bn-BD", {
          year: "numeric",
          month: "long",
          day: "numeric",
          weekday: "long",
        })}
      </div>

      {loading && (
        <div className="w-full bg-emerald-100 dark:bg-emerald-900 h-1 overflow-hidden">
          <div className="bg-emerald-600 h-full animate-pulse w-full"></div>
        </div>
      )}

      <main
        className="flex-1 p-3 md:p-6 overflow-y-auto custom-scrollbar"
        onTouchStart={pullTouchStart}
        onTouchMove={pullTouchMove}
        onTouchEnd={pullTouchEnd}
      >
        {pullRefreshing && (
          <div className="text-center py-2 text-xs text-emerald-600 dark:text-emerald-400">
            <i className="fa-solid fa-arrows-rotate me-1 animate-spin"></i>{" "}
            রিফ্রেশ হচ্ছে...
          </div>
        )}
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

          {can("ADD_INCOME") && activeTab === "income" && (
            <IncomeForm
              wallets={wallets}
              categories={categories}
              currentUser={currentUser}
              onSave={handleSaveTransaction}
              onCancel={() => setActiveTab("home")}
            />
          )}

          {can("ADD_EXPENSE") && activeTab === "expense" && (
            <ExpenseForm
              wallets={wallets}
              categories={categories}
              currentUser={currentUser}
              onSave={handleSaveTransaction}
              onCancel={() => setActiveTab("home")}
            />
          )}

          {can("TRANSFER_MONEY") && activeTab === "transfer" && (
            <TransferForm
              wallets={wallets}
              currentUser={currentUser}
              onSave={handleSaveTransaction}
              onCancel={() => setActiveTab("home")}
            />
          )}

          {can("BANK_OPERATIONS") && activeTab === "bank" && (
            <BankOperationForm
              wallets={wallets}
              currentUser={currentUser}
              onSave={handleSaveTransaction}
              onCancel={() => setActiveTab("home")}
            />
          )}

          {can("VIEW_TRANSACTIONS") && activeTab === "transactions" && (
            <TransactionsView
              transactions={transactions}
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
              filterDate={filterDate}
              setFilterDate={setFilterDate}
              filterDescription={filterDescription}
              setFilterDescription={setFilterDescription}
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

          {activeTab.indexOf("edit-") === 0 && !can("MANAGE_TRANSACTIONS") && (
            <div className="text-center py-16 px-4">
              <i className="fa-solid fa-lock text-3xl text-gray-300 dark:text-gray-600 mb-3"></i>
              <div className="text-sm font-semibold text-slate-600 dark:text-gray-300">
                লেনদেন এডিট করার অনুমতি নেই
              </div>
              <button
                onClick={() => setActiveTab("transactions")}
                className="mt-3 bg-slate-800 dark:bg-gray-800 text-white text-xs font-semibold px-4 py-2 rounded-xl"
              >
                লেনদেনে ফিরে যান
              </button>
            </div>
          )}

          {canLoan && activeTab === "loans" && (
            <LoanDashboardView
              loans={loans}
              currentUser={currentUser}
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
              const found = loans.find((l) => String(l.id) === String(loanId));
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
                />
              );
            })()}

          {canEditLoan &&
            activeTab.indexOf("loan-edit-") === 0 &&
            (() => {
              const loanId = activeTab.slice("loan-edit-".length);
              const found = loans.find((l) => String(l.id) === String(loanId));
              if (!found) {
                return (
                  <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 text-center">
                    <div className="text-sm text-gray-500 dark:text-gray-400 py-4">
                      লোন পাওয়া যায়নি।
                    </div>
                    <button
                      onClick={() => setActiveTab("loans")}
                      className="w-full bg-emerald-600 text-white font-bold py-2.5 rounded-xl text-xs"
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
                <i className="fa-solid fa-hand-holding-dollar text-3xl text-gray-300 dark:text-gray-600 mb-3"></i>
                <div className="text-sm font-semibold text-slate-600 dark:text-gray-300">
                  হাওলাত বিভাগ
                </div>
                <button
                  onClick={() => setActiveTab("loans")}
                  className="mt-3 bg-slate-800 dark:bg-gray-800 text-white text-xs font-semibold px-4 py-2 rounded-xl"
                >
                  হাওলাত লিষ্ট
                </button>
              </div>
            )}

          {can("VIEW_REPORTS") && activeTab === "reports" && (
            <ReportsView wallets={wallets} currentUser={currentUser} />
          )}

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
              wallets={wallets}
              darkMode={darkMode}
              onSetDark={setDarkMode}
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
              <i className="fa-solid fa-lock text-3xl text-gray-300 dark:text-gray-600 mb-3"></i>
              <div className="text-sm font-semibold text-slate-600 dark:text-gray-300">
                ড্যাশবোর্ড দেখার অনুমতি নেই
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                নিচের মেনু থেকে আপনার অনুমোদিত পেজ ব্যবহার করুন।
              </div>
            </div>
          )}

          {!currentUser.permissions?.length && activeTab === "home" && (
            <div className="text-center py-16 px-4">
              <i className="fa-solid fa-lock text-3xl text-gray-300 dark:text-gray-600 mb-3"></i>
              <div className="text-sm font-semibold text-slate-600 dark:text-gray-300">
                এখনো কোনো অনুমতি দেওয়া হয়নি
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                আপনার অ্যাকাউন্টে কোনো Permission সেট করা নেই। Admin এর সাথে
                যোগাযোগ করুন।
              </div>
            </div>
          )}
        </Suspense>
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-[480px] md:max-w-[1000px] mx-auto bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 flex justify-around items-center py-2 z-40 shadow-lg">
        <button
          onClick={() => setActiveTab("home")}
          className={`flex flex-col items-center text-xs font-medium ${activeTab === "home" ? "text-emerald-600" : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"}`}
        >
          <i className="fa-solid fa-house text-lg mb-0.5"></i> Home
        </button>
        {can("ADD_INCOME") && (
          <button
            onClick={() => setActiveTab("income")}
            className={`flex flex-col items-center text-xs font-medium ${activeTab === "income" ? "text-emerald-600" : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"}`}
          >
            <i className="fa-solid fa-circle-plus text-lg mb-0.5"></i> Income
          </button>
        )}
        {can("ADD_EXPENSE") && (
          <button
            onClick={() => setActiveTab("expense")}
            className={`flex flex-col items-center text-xs font-medium ${activeTab === "expense" ? "text-emerald-600" : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"}`}
          >
            <i className="fa-solid fa-circle-minus text-lg mb-0.5"></i> Expense
          </button>
        )}
        {can("TRANSFER_MONEY") && (
          <button
            onClick={() => setActiveTab("transfer")}
            className={`flex flex-col items-center text-xs font-medium ${activeTab === "transfer" ? "text-emerald-600" : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"}`}
          >
            <i className="fa-solid fa-right-left text-lg mb-0.5"></i> Transfer
          </button>
        )}
        {can("BANK_OPERATIONS") && (
          <button
            onClick={() => setActiveTab("bank")}
            className={`flex flex-col items-center text-xs font-medium ${activeTab === "bank" ? "text-emerald-600" : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"}`}
          >
            <i className="fa-solid fa-building-columns text-lg mb-0.5"></i> Bank
          </button>
        )}
        {canLoan && (
          <button
            onClick={() => setActiveTab("loans")}
            className={`flex flex-col items-center text-xs font-medium ${activeTab === "loans" ? "text-emerald-600" : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"}`}
          >
            <i className="fa-solid fa-hand-holding-dollar text-lg mb-0.5"></i>{" "}
            Loan
          </button>
        )}
        {can("VIEW_REPORTS") && (
          <button
            onClick={() => setActiveTab("reports")}
            className={`flex flex-col items-center text-xs font-medium ${activeTab === "reports" ? "text-emerald-600" : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"}`}
          >
            <i className="fa-solid fa-chart-pie text-lg mb-0.5"></i> Reports
          </button>
        )}
      </nav>
    </div>
  );
}
