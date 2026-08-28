import { useState, useEffect } from "react";
import { api } from "./api.js";

import LoginScreen from "./pages/LoginScreen.jsx";
import DashboardView from "./pages/DashboardView.jsx";
import TransactionsView from "./pages/TransactionsView.jsx";
import ReportsView from "./pages/ReportsView.jsx";
import UserManagementView from "./pages/UserManagementView.jsx";
import SettingsView from "./pages/SettingsView.jsx";
import UserProfileView from "./pages/UserProfileView.jsx";

import BankOperationForm from "./components/BankOperationForm.jsx";
import IncomeForm from "./components/IncomeForm.jsx";
import ExpenseForm from "./components/ExpenseForm.jsx";
import TransferForm from "./components/TransferForm.jsx";
import EditTransactionForm from "./components/EditTransactionForm.jsx";

export default function App() {
  const [currentUser, setCurrentUser] = useState(JSON.parse(localStorage.getItem('hisab_user')) || null);
  const [activeTab, setActiveTab] = useState('home');
  const [transactions, setTransactions] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [alertMsg, setAlertMsg] = useState(null);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [filterCurrency, setFilterCurrency] = useState('All');
  const [filterDate, setFilterDate] = useState('');
  const [filterDescription, setFilterDescription] = useState('');
  const [filterUser, setFilterUser] = useState('All');
  const isAdmin = currentUser && currentUser.role === 'Admin';

  useEffect(() => {
    if (currentUser) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const showAlert = (msg, type = 'success') => {
    setAlertMsg({ msg, type });
    setTimeout(() => setAlertMsg(null), 3000);
  };

  const loadData = () => {
    setLoading(true);
    api.getInitialData(currentUser.username).then((res) => {
      setTransactions(res.transactions || []);
      setUsersList(res.users || []);
      setLoading(false);
    }).catch((err) => {
      showAlert('ডেটা লোড করতে ব্যর্থ হয়েছে: ' + err, 'error');
      setLoading(false);
    });
  };

  // Fully Dynamic Summary Calculation
  const calcSummary = (curr, ledger, username) => {
    const currTxns = transactions.filter(t => t.Currency === curr && (!ledger || t.Ledger === ledger) && (!username || t.User === username));
    let income = 0, expense = 0;
    let cash = 0, bank = 0;

    currTxns.forEach(t => {
      const amt = parseFloat(t.Amount) || 0;
      if (t.Type === 'Income' || t.Type === 'Transfer In') {
        if (t.Type === 'Income') income += amt;
        if (t.Account === 'Cash') cash += amt;
        if (t.Account === 'Bank') bank += amt;
      } else if (t.Type === 'Expense' || t.Type === 'Transfer Out') {
        if (t.Type === 'Expense') expense += amt;
        if (t.Account === 'Cash') cash -= amt;
        if (t.Account === 'Bank') bank -= amt;
      }
    });

    const totalBalance = cash + bank;
    return { totalBalance, cash, bank, income, expense };
  };

  const sarSummary = calcSummary('SAR', 'SAR_Transactions');
  const bdtSummary = calcSummary('BDT', 'BDT_Family_Transactions');
  const personalBdtSummary = calcSummary('BDT', 'BDT_Personal_Transactions', currentUser && currentUser.username);

  // Add New Transaction
  const handleSaveTransaction = (formData, resetForm) => {
    setLoading(true);
    api.addTransaction({ ...formData, user: currentUser.username }).then((res) => {
      showAlert(res.message);
      loadData();
      if (resetForm) resetForm();
      setActiveTab('home');
    }).catch((err) => {
      showAlert('ত্রুটি: ' + err, 'error');
      setLoading(false);
    });
  };

  // Delete Handler
  const handleDeleteTxn = (id) => {
    if (!confirm('আপনি কি এই লেনদেনটি মুছে ফেলতে চান?')) return;
    setLoading(true);
    api.deleteTransaction(id, currentUser.username).then((res) => {
      showAlert(res.message);
      loadData();
    }).catch((err) => {
      showAlert('ত্রুটি: ' + err, 'error');
      setLoading(false);
    });
  };

  const handleUpdateTransaction = (data) => {
    setLoading(true);
    const done = (res) => { showAlert(res.message, res.status === 'ERROR' ? 'error' : 'success'); if (res.status === 'SUCCESS') { loadData(); setActiveTab('transactions'); } else setLoading(false); };
    api.updateTransaction(data, currentUser.username).then(done).catch((err) => { showAlert('ত্রুটি: ' + err, 'error'); setLoading(false); });
  };

  const handleUserAction = (action, username, value) => {
    setLoading(true);
    const done = (res) => { showAlert(res.message, res.status === 'ERROR' ? 'error' : 'success'); if (res.status === 'SUCCESS') loadData(); else setLoading(false); };
    const onErr = (err) => { showAlert('ত্রুটি: ' + err, 'error'); setLoading(false); };
    if (action === 'delete') api.deleteUser(username, currentUser.username).then(done).catch(onErr);
    else api.setUserStatus(username, value, currentUser.username).then(done).catch(onErr);
  };

  const handleImportBackup = (backup) => {
    setLoading(true);
    api.importBackup(backup, currentUser.username).then((res) => {
      showAlert(res.message, res.status === 'ERROR' ? 'error' : 'success');
      if (res.status === 'SUCCESS') loadData(); else setLoading(false);
    }).catch((err) => { showAlert('ত্রুটি: ' + err, 'error'); setLoading(false); });
  };

  const handleProfileUpdate = (data) => {
    setLoading(true);
    const done = (res) => {
      showAlert(res.message, res.status === 'ERROR' ? 'error' : 'success');
      if (res.status === 'SUCCESS') {
        const updatedUser = { ...currentUser, username: res.username };
        setCurrentUser(updatedUser);
        localStorage.setItem('hisab_user', JSON.stringify(updatedUser));
        loadData();
      } else setLoading(false);
    };
    api.updateUserProfile(currentUser.username, data.username, data.pin).then(done).catch((err) => { showAlert('ত্রুটি: ' + err, 'error'); setLoading(false); });
  };

  if (!currentUser) {
    return <LoginScreen onLogin={(user) => { setCurrentUser(user); localStorage.setItem('hisab_user', JSON.stringify(user)); }} />;
  }
  return (
    <div className="mobile-container flex flex-col min-h-screen bg-slate-50 border-x border-gray-200">

      {/* Header */}
      <header className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-md">
        <div className="flex items-center gap-3">
          <button onClick={() => setActiveTab('home')} className="text-xl text-emerald-400 font-bold flex items-center">
            <i className="fa-solid me-1.5 fa-wallet"></i> মাই হিসাব
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs bg-slate-800 px-2.5 py-1 rounded-full text-emerald-300 border border-slate-700">
            <i className="fa-solid fa-user me-1"></i> {currentUser.username}
          </span>
          <button onClick={() => setActiveTab('profile')} className="text-gray-400 hover:text-emerald-300 text-sm" title="প্রোফাইল">
            <i className="fa-solid fa-user-gear"></i>
          </button>
          <button
            onClick={() => { setCurrentUser(null); localStorage.removeItem('hisab_user'); }}
            className="text-gray-400 hover:text-red-400 text-sm"
            title="লগআউট"
          >
            <i className="fa-solid fa-right-from-bracket"></i>
          </button>
        </div>
      </header>

      <div className="bg-slate-800 text-center py-2 px-3 text-white text-xs font-medium border-b border-slate-700 flex justify-between items-center">
        <span>মাই পার্সোনাল হিসাব - ওয়েব অ্যাপ</span>
        <span className="text-amber-300 font-semibold">SAR & BDT আলাদা হিসাব</span>
      </div>

      {alertMsg && (
        <div className={`p-3 text-center text-sm font-semibold text-white transition-all ${alertMsg.type === 'error' ? 'bg-red-500' : 'bg-emerald-600'}`}>
          {alertMsg.msg}
        </div>
      )}

      {loading && (
        <div className="w-full bg-emerald-100 h-1 overflow-hidden">
          <div className="bg-emerald-600 h-full animate-pulse w-full"></div>
        </div>
      )}

      <main className="flex-1 p-3 md:p-6 overflow-y-auto custom-scrollbar">
        {activeTab === 'home' && (
          <DashboardView
            sar={sarSummary}
            personalBdt={personalBdtSummary}
            bdt={bdtSummary}
            setActiveTab={setActiveTab}
            isAdmin={isAdmin}
          />
        )}

        {isAdmin && activeTab === 'income' && (
          <IncomeForm
            onSave={handleSaveTransaction}
            onCancel={() => setActiveTab('home')}
          />
        )}

        {activeTab === 'expense' && (
          <ExpenseForm
            onSave={handleSaveTransaction}
            onCancel={() => setActiveTab('home')}
            restricted={!isAdmin}
          />
        )}

        {isAdmin && activeTab === 'transfer' && (
          <TransferForm
            onSave={handleSaveTransaction}
            onCancel={() => setActiveTab('home')}
          />
        )}

        {isAdmin && activeTab === 'bank' && (
          <BankOperationForm onSave={handleSaveTransaction} onCancel={() => setActiveTab('home')} />
        )}

        {activeTab === 'transactions' && (
          <TransactionsView
            transactions={transactions}
            onDelete={handleDeleteTxn}
            onEdit={(txn) => setActiveTab('edit-' + txn.ID)}
            canEdit={isAdmin}
            canDelete={isAdmin}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            filterType={filterType}
            setFilterType={setFilterType}
            filterCurrency={filterCurrency}
            setFilterCurrency={setFilterCurrency}
            filterDate={filterDate}
            setFilterDate={setFilterDate}
            filterDescription={filterDescription}
            setFilterDescription={setFilterDescription}
            filterUser={filterUser}
            setFilterUser={setFilterUser}
            isAdmin={isAdmin}
          />
        )}

        {activeTab.indexOf('edit-') === 0 && (
          <EditTransactionForm
            transaction={transactions.find(t => String(t.ID) === activeTab.slice(5))}
            onSave={handleUpdateTransaction}
            onCancel={() => setActiveTab('transactions')}
          />
        )}

        {isAdmin && activeTab === 'reports' && (
          <ReportsView transactions={transactions} />
        )}

        {isAdmin && activeTab === 'users' && (
          <UserManagementView users={usersList} onRefresh={loadData} showAlert={showAlert} currentUser={currentUser} onUserAction={handleUserAction} />
        )}

        {isAdmin && activeTab === 'settings' && (
          <SettingsView showAlert={showAlert} currentUser={currentUser} onImport={handleImportBackup} />
        )}

        {activeTab === 'profile' && (
          <UserProfileView currentUser={currentUser} transactions={transactions} onSave={handleProfileUpdate} onCancel={() => setActiveTab('home')} />
        )}
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-[480px] md:max-w-[1000px] mx-auto bg-white border-t border-gray-200 flex justify-around items-center py-2 z-40 shadow-lg">
        <button onClick={() => setActiveTab('home')} className={`flex flex-col items-center text-xs font-medium ${activeTab === 'home' ? 'text-emerald-600' : 'text-gray-500 hover:text-gray-800'}`}>
          <i className="fa-solid fa-house text-lg mb-0.5"></i> Home
        </button>
        {isAdmin && <button onClick={() => setActiveTab('income')} className={`flex flex-col items-center text-xs font-medium ${activeTab === 'income' ? 'text-emerald-600' : 'text-gray-500 hover:text-gray-800'}`}>
          <i className="fa-solid fa-circle-plus text-lg mb-0.5"></i> Income
        </button>}
        <button onClick={() => setActiveTab('expense')} className={`flex flex-col items-center text-xs font-medium ${activeTab === 'expense' ? 'text-emerald-600' : 'text-gray-500 hover:text-gray-800'}`}>
          <i className="fa-solid fa-circle-minus text-lg mb-0.5"></i> Expense
        </button>
        {isAdmin && <button onClick={() => setActiveTab('transfer')} className={`flex flex-col items-center text-xs font-medium ${activeTab === 'transfer' ? 'text-emerald-600' : 'text-gray-500 hover:text-gray-800'}`}>
          <i className="fa-solid fa-right-left text-lg mb-0.5"></i> Transfer
        </button>}
        {isAdmin && <button onClick={() => setActiveTab('bank')} className={`flex flex-col items-center text-xs font-medium ${activeTab === 'bank' ? 'text-emerald-600' : 'text-gray-500 hover:text-gray-800'}`}>
          <i className="fa-solid fa-building-columns text-lg mb-0.5"></i> Bank
        </button>}
        {isAdmin && <button onClick={() => setActiveTab('reports')} className={`flex flex-col items-center text-xs font-medium ${activeTab === 'reports' ? 'text-emerald-600' : 'text-gray-500 hover:text-gray-800'}`}>
          <i className="fa-solid fa-chart-pie text-lg mb-0.5"></i> Reports
        </button>}
      </nav>

    </div>
  );
}
