import { useState, useRef, useEffect } from "react";
import { MIN_PIN_LENGTH, MAX_PIN_LENGTH, normalizePinInput } from "../api.js";
import { todayStr } from "../utils/loan.js";
import { formatMoney } from "../utils/currency.js";
import Select from "../components/Select.jsx";
import Popup from "../components/Popup.jsx";
import UpdateDialog from "../components/UpdateDialog.jsx";
import { useToast } from "../components/Toast.jsx";
import { Segmented } from "../ui/index.jsx";
import TransactionCard from "../components/TransactionCard.jsx";
import { compareNewestFirst } from "../utils/sortTransactions.js";
import {
  isNativeAndroid,
  getInstalledVersion,
  checkForUpdate,
  downloadUpdate,
  openDownloadedApk,
  openInstallPermissionSettings,
} from "../utils/updater.js";

const DEFAULT_WALLET_KEY = "hisab_default_wallet";

function DefaultAvatarIcon({ className }) {
  return (
    <svg viewBox="0 0 512 512" className={className}>
      <circle cx="256" cy="256" r="246" fill="none" stroke="#9ca3af" strokeWidth="20" />
      <path
        fill="#9ca3af"
        d="M256 96c-52 0-94 42-94 94 0 30 14 57 36 74-56 20-96 60-108 110-3 12 6 24 19 24h294c13 0 22-12 19-24-12-50-52-90-108-110 22-17 36-44 36-74 0-52-42-94-94-94z"
      />
      <path fill="#fff" d="M196 356c14 26 36 42 60 42s46-16 60-42c-18-8-38-12-60-12s-42 4-60 12z" />
    </svg>
  );
}

function MenuButton({ icon, label, sub, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${danger ? "text-[var(--ah-danger)] hover:bg-[var(--ah-danger-soft)] dark:hover:bg-red-900/20" : "text-ink hover:bg-[var(--ah-surface-2)] dark:hover:bg-[var(--ah-surface-3)]"}`}
    >
      <i className={`fa-solid ${icon} w-4 text-center ${danger ? "" : "text-ink-3 dark:text-ink-3"}`}></i>
      <span className="flex-1 min-w-0">
        <span className="block text-[11px] font-semibold">{label}</span>
        {sub && <span className="block text-[10px] text-ink-3">{sub}</span>}
      </span>
    </button>
  );
}

export default function UserProfileView({ currentUser, transactions, transactionBalances, wallets, darkMode, onSetDark, themeMode, onSetTheme, can, onSave, onCancel, onEditTxn, onDeleteTxn, onLogout, setActiveTab }) {
  const [activeCard, setActiveCard] = useState(null);
  const toast = useToast();
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [editName, setEditName] = useState(currentUser.fullName || currentUser.username || '');
  const [defaultWallet, setDefaultWallet] = useState(() => {
    const saved = localStorage.getItem(`${DEFAULT_WALLET_KEY}_${currentUser.username}`);
    if (saved) return saved;
    return wallets.length === 1 ? String(wallets[0].WalletID) : "";
  });
  const [page, setPage] = useState(1);
  // Which wallet the "আমার Access" pills are currently showing. There is
  // deliberately no "all wallets" option — the screen always scopes to exactly
  // one wallet, defaulting to the user's default so the first thing they see
  // is the wallet they actually use. Empty string means "not yet resolved",
  // which only happens before the effect below picks a real wallet.
  const [walletFilter, setWalletFilter] = useState("");
  const [profilePic, setProfilePic] = useState(currentUser.profilePic || null);
  const [menuOpen, setMenuOpen] = useState(false);
  // Manual self-update flow. A single state machine drives one styled dialog
  // for every phase: idle -> checking -> update-available -> downloading ->
  // download-complete / permission-required / error. `busy` guards against a
  // second check or download starting while one is in flight.
  const [updateState, setUpdateState] = useState("idle");
  const [updateRelease, setUpdateRelease] = useState(null);
  const [updateInstalled, setUpdateInstalled] = useState(null);
  const [updateProgress, setUpdateProgress] = useState(null);
  const [updateMessage, setUpdateMessage] = useState("");
  const [updateBusy, setUpdateBusy] = useState(false);
  const lastDownloadRef = useRef(null);
  const fileInputRef = useRef(null);
  const editFileInputRef = useRef(null);
  const menuRef = useRef(null);
  const PER_PAGE = 10;

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const ownTransactions = transactions.filter(t => t.User === currentUser.username).sort(compareNewestFirst);

  // Resolve the wallet to display: the active filter if it still exists, else
  // the user's default, else the first accessible wallet. This means revoking a
  // user's access to the filtered wallet silently falls back to something valid
  // rather than showing a permanently empty, unclickable screen.
  const walletList = wallets || [];
  const resolvedWalletId = (() => {
    const stillValid = walletList.some(w => String(w.WalletID) === walletFilter);
    if (walletFilter && stillValid) return walletFilter;
    const defaultValid = walletList.some(w => String(w.WalletID) === defaultWallet);
    if (defaultValid) return defaultWallet;
    return walletList.length ? String(walletList[0].WalletID) : "";
  })();
  const selectedWallet = walletList.find(w => String(w.WalletID) === resolvedWalletId) || null;

  // Scopes the entire screen. WalletID is compared as a string on both sides:
  // the pill carries the stringified id while t.WalletID can arrive from the
  // sheet as a number for rows written before ids were normalised.
  const scopedTransactions = resolvedWalletId
    ? ownTransactions.filter(t => String(t.WalletID) === resolvedWalletId)
    : [];

  const thisMonth = todayStr().slice(0, 7);
  const thisMonthCount = scopedTransactions.filter(t => (t.Date || '').startsWith(thisMonth)).length;

  // Lifetime totals for the selected wallet: every Income/Expense row the user
  // recorded there, with no date window. Transfers and loan rows are excluded,
  // matching the dashboard card and the reports sheet, so the same three screens
  // never disagree about what counts as income or expense.
  const lifetimeOf = (type) =>
    scopedTransactions
      .filter(t => t.Type === type)
      .reduce((s, t) => s + (parseFloat(t.Amount) || 0), 0);
  const lifetimeIncome = lifetimeOf('Income');
  const lifetimeExpense = lifetimeOf('Expense');
  const lifetimeNet = lifetimeIncome - lifetimeExpense;

  const fullName = currentUser.fullName || currentUser.username;
  const canEdit = currentUser?.role === 'Admin' || can?.('MANAGE_TRANSACTIONS');
  const canDelete = currentUser?.role === 'Admin' || can?.('MANAGE_TRANSACTIONS');

  const totalPages = Math.max(1, Math.ceil(scopedTransactions.length / PER_PAGE));
  const pageItems = scopedTransactions.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // Picking a wallet must return the reader to page 1, otherwise they stay on
  // (say) page 4 of a now one-page result and see an empty list. The clamp
  // effect below only fixes out-of-range pages after the fact, which would show
  // a blank page for a moment; resetting up front avoids the flash.
  // There is no "off" state — clicking the already-selected wallet is a no-op,
  // so the screen is never left in a state with nothing selected.
  const selectWallet = (id) => {
    setWalletFilter(id);
    setPage(1);
  };

  // Keep the page inside the valid range after a transaction is deleted.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const handlePicChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Stored as base64 in a single Google Sheets cell (~50,000 character limit),
    // and base64 inflates raw bytes by ~1.37x — 30KB is the safe ceiling that
    // actually fits, not the old 1MB figure which would have silently failed.
    if (file.size > 30 * 1024) { toast.error('ছবির সাইজ ৩০ KB এর কম হতে হবে!'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setProfilePic(ev.target.result);
      onSave({ username: currentUser.username, profilePic: ev.target.result });
    };
    reader.readAsDataURL(file);
  };

  const handlePwSave = () => {
    if (!currentPin || !newPin || !confirmPin) { toast.error('সব তিনটি PIN লিখুন!'); return; }
    // Normalize all three with the same helper the Admin reset screen and the
    // create-user form use, so this screen accepts exactly what the server
    // accepts. currentPin matters most: a whitespace-only value is truthy, would
    // be trimmed to "" below, and would otherwise be sent as an empty PIN and
    // come back as a generic server error.
    const normalizedCurrent = normalizePinInput(currentPin);
    if (normalizedCurrent === null) { toast.error('বর্তমান PIN ' + MIN_PIN_LENGTH + '-' + MAX_PIN_LENGTH + ' অক্ষরের হতে হবে!'); return; }
    const normalizedPin = normalizePinInput(newPin);
    if (normalizedPin === null) { toast.error('PIN ' + MIN_PIN_LENGTH + '-' + MAX_PIN_LENGTH + ' অক্ষরের হতে হবে!'); return; }
    // Compare what the server will actually store, not the raw text: the PIN is
    // trimmed on the way in, so "1234 " and "1234" are the same PIN and the
    // confirm box must say so.
    if (normalizePinInput(confirmPin) !== normalizedPin) { toast.error('নতুন PIN ও Confirm PIN মিলছে না!'); return; }
    // The server trims on the way in too (normalizePin_), so sending the
    // normalized form is what it will compare against.
    onSave({ username: currentUser.username, currentPin: normalizedCurrent, pin: normalizedPin });
    setActiveCard(null);
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
  };

  const handleEditSave = () => {
    const name = editName.trim();
    if (!name) { toast.error('Full Name খালি রাখা যাবে না!'); return; }
    localStorage.setItem(`${DEFAULT_WALLET_KEY}_${currentUser.username}`, defaultWallet);
    // The profile is scoped to one wallet, and the default is what the screen
    // opens on. If the user changes their default here, immediately show that
    // wallet's data rather than continuing to display the previous selection.
    if (defaultWallet) selectWallet(String(defaultWallet));
    onSave({ username: currentUser.username, fullName: name });
    setActiveCard(null);
  };

  const handleLogout = () => {
    setMenuOpen(false);
    onLogout();
  };

  // --- Manual self-update ---------------------------------------------------

  const resetUpdate = () => {
    setUpdateState("idle");
    setUpdateProgress(null);
    setUpdateMessage("");
    setUpdateBusy(false);
  };

  // Friendly, non-technical message per failure code. The raw code is kept in
  // the state model (not shown) so the UI can branch without leaking details.
  const failUpdate = (err) => {
    const code = err?.code || "";
    let message;
    switch (code) {
      case "RATE_LIMITED":
        message = "GitHub রেট লিমিট হয়েছে, কিছুক্ষণ পরে আবার চেষ্টা করুন।";
        break;
      case "NETWORK":
      case "OFFLINE":
        message = "ইন্টারনেট সংযোগ নেই অথবা GitHub-এ পৌঁছানো যাচ্ছে না।";
        break;
      case "INCOMPLETE":
      case "EMPTY_FILE":
        message = "ডাউনলোড অসম্পূর্ণ হয়েছে (স্টোরেজ পূর্ণ হতে পারে)। আবার চেষ্টা করুন।";
        break;
      case "CHECKSUM_MISMATCH":
        message = "ডাউনলোড করা ফাইলটি যাচাইয়ের সময় মেলেনি, তাই বাতিল করা হয়েছে।";
        break;
      case "NO_FILE":
      case "FILE_MISSING":
        message = "ডাউনলোড করা ফাইল পাওয়া যায়নি। আবার ডাউনলোড করুন।";
        break;
      case "IN_PROGRESS":
        message = "একটি ডাউনলোড ইতিমধ্যে চলছে।";
        break;
      default:
        message =
          "আপডেট করতে সমস্যা হয়েছে। ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।";
    }
    setUpdateMessage(message);
    setUpdateState("error");
    setUpdateProgress(null);
    setUpdateBusy(false);
  };

  const startCheck = async () => {
    if (updateBusy || !isNativeAndroid()) return;
    setMenuOpen(false);
    setUpdateBusy(true);
    setUpdateState("checking");
    setUpdateProgress(null);
    setUpdateMessage("");
    try {
      const installed = await getInstalledVersion();
      setUpdateInstalled(installed);
      const check = await checkForUpdate();

      if (check.error && check.status === "ERROR") {
        failUpdate(check.error);
        return;
      }
      if (!check.hasUpdate) {
        resetUpdate();
        toast.success(
          installed?.versionName
            ? `আপনি সর্বশেষ ভার্সন ব্যবহার করছেন (${installed.versionName})`
            : "আপনি সর্বশেষ ভার্সন ব্যবহার করছেন",
        );
        return;
      }

      setUpdateRelease(check.release);
      setUpdateState("update-available");
      setUpdateBusy(false);
    } catch (err) {
      failUpdate(err);
    }
  };

  const startDownload = async () => {
    if (updateBusy || !updateRelease) return;
    setUpdateBusy(true);
    setUpdateState("downloading");
    setUpdateProgress({ bytes: 0, contentLength: updateRelease.size || 0, percent: 0 });
    setUpdateMessage("");
    try {
      const result = await downloadUpdate(updateRelease, (p) => {
        // Real progress only; the dialog derives a percentage from
        // bytes/contentLength when the plugin does not supply one.
        setUpdateProgress({
          bytes: p.bytes,
          contentLength: p.contentLength,
          percent: p.percent,
        });
      });
      lastDownloadRef.current = result;
      // Reflect the finished file so a retry can skip re-downloading.
      setUpdateProgress({
        bytes: result.size,
        contentLength: result.size,
        percent: 100,
      });
      setUpdateState("download-complete");
      await launchInstaller(result);
    } catch (err) {
      failUpdate(err);
    }
  };

  const launchInstaller = async (download) => {
    const dl = download || lastDownloadRef.current;
    if (!dl) {
      setUpdateMessage("ডাউনলোড করা ফাইল পাওয়া যায়নি। আবার ডাউনলোড করুন।");
      setUpdateState("error");
      setUpdateBusy(false);
      return;
    }
    setUpdateState("download-complete");
    try {
      await openDownloadedApk(dl.uri, { size: dl.size });
      // Native call succeeded: Android's own install confirmation is now
      // showing. Collapse our dialog so it does not sit behind the installer.
      setUpdateBusy(false);
      resetUpdate();
    } catch (err) {
      if (err?.code === "NEEDS_PERMISSION") {
        setUpdateMessage(
          "Android-এ Amar Hisab থেকে অ্যাপ ইনস্টল করার অনুমতি চালু করুন, তারপর আবার চেষ্টা করুন।",
        );
        setUpdateState("permission-required");
        setUpdateBusy(false);
        return;
      }
      failUpdate(err);
    }
  };

  const handleOpenInstallSettings = async () => {
    await openInstallPermissionSettings();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={onCancel} className="text-ink-3 hover:text-ink dark:hover:text-gray-200">
          <i className="fa-solid fa-arrow-left text-lg"></i>
        </button>
        <h3 className="font-bold text-ink text-base">প্রোফাইল</h3>
        <div ref={menuRef} className="relative">
          <button onClick={() => setMenuOpen(o => !o)} className={`text-lg ${menuOpen ? "text-[var(--ah-success)]" : "text-ink-3 hover:text-ink dark:hover:text-gray-200"}`} title="Profile Settings">
            <i className="fa-solid fa-gear"></i>
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-1 w-60 bg-[var(--ah-surface)] border border-[var(--ah-border)] rounded-xl shadow-lg z-50 overflow-hidden">
              <div className="px-3 pt-2 pb-1 text-[10px] font-bold text-ink-3 uppercase border-b border-[var(--ah-border)]">Profile Settings</div>
              <div className="py-1.5">
                <div className="px-3 pb-1">
                  <div className="text-[10px] font-bold text-ink-3 mb-1">Theme Mode</div>
                  <Segmented
                    className="w-full"
                    value={themeMode || "system"}
                    onChange={(v) => onSetTheme && onSetTheme(v)}
                    options={[
                      { value: "system", label: "সিস্টেম", icon: "fa-circle-half-stroke" },
                      { value: "light", label: "লাইট", icon: "fa-sun" },
                      { value: "dark", label: "ডার্ক", icon: "fa-moon" },
                    ]}
                  />
                </div>
                <div className="border-t border-[var(--ah-border)] my-1"></div>
                <MenuButton icon="fa-user-pen" label="Edit Profile" sub="নাম, ছবি, ডিফল্ট Wallet" onClick={() => { setEditName(currentUser.fullName || currentUser.username || ''); setActiveCard('edit'); setMenuOpen(false); }} />
                <MenuButton icon="fa-key" label="Change Password" sub="PIN পরিবর্তন করুন" onClick={() => { setCurrentPin(''); setNewPin(''); setConfirmPin(''); setActiveCard('password'); setMenuOpen(false); }} />
                {can?.('BACKUP_RESTORE') && <MenuButton icon="fa-download" label="Backup & Restore" sub="ব্যাকআপ ডাউনলোড/রিস্টোর" onClick={() => { setMenuOpen(false); setActiveTab('backup'); }} />}
                {isNativeAndroid() && (
                  <MenuButton
                    icon="fa-rotate"
                    label="Check for updates"
                    sub="নতুন APK আপডেট চেক করুন"
                    onClick={startCheck}
                  />
                )}
                <div className="border-t border-[var(--ah-border)] my-1"></div>
                <MenuButton danger icon="fa-right-from-bracket" label="Log Out" sub="সেশন শেষ করুন" onClick={handleLogout} />
              </div>
            </div>
          )}
        </div>
      </div>

      <Popup open={activeCard === 'edit' || activeCard === 'password'} title={activeCard === 'edit' ? 'Edit Profile' : 'Change Password'} onClose={() => setActiveCard(null)}>
        {activeCard === 'edit' ? (
          <>
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full overflow-hidden bg-[var(--ah-surface-3)] border border-[var(--ah-border)] flex-shrink-0">
                {profilePic ? <img src={profilePic} alt="Profile" className="w-full h-full object-cover" /> : <DefaultAvatarIcon className="w-full h-full" />}
              </div>
              <div className="flex-1">
                <button onClick={() => editFileInputRef.current.click()} className="bg-[var(--ah-header)] text-white text-xs font-bold px-3 py-2 rounded-xl">
                  <i className="fa-solid fa-camera me-1"></i> Change Profile Pic
                </button>
                <div className="text-[10px] text-ink-3 mt-1">ছবির সাইজ ৩০ KB এর কম হতে হবে</div>
                <input ref={editFileInputRef} type="file" accept="image/*" onChange={handlePicChange} className="hidden" />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-ink-2 mb-1 block">Full Name</label>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full border border-[var(--ah-border-strong)] rounded-xl px-3 py-2 text-xs bg-[var(--ah-surface)] text-ink" />
            </div>

            <div>
              <label className="text-[10px] font-bold text-ink-2 mb-1 block">Username</label>
              <div className="w-full border border-[var(--ah-border)] rounded-xl px-3 py-2 text-xs bg-[var(--ah-surface-2)] text-ink-3">@{currentUser.username} — পরিবর্তন করা যাবে না</div>
            </div>

            {wallets.length > 1 ? (
              <div>
                <label className="text-[10px] font-bold text-ink-2 mb-1 block">Default Wallet</label>
                <Select value={defaultWallet} onChange={setDefaultWallet}>
                  <option value="">Select wallet</option>
                  {wallets.map(w => <option key={w.WalletID} value={String(w.WalletID)}>{w.WalletName} ({w.Currency})</option>)}
                </Select>
                <div className="text-[10px] text-ink-3 mt-1">এই Wallet টি নতুন লেনদেনে ডিফল্ট হিসেবে ব্যবহার হবে।</div>
              </div>
            ) : wallets.length === 1 ? (
              <div>
                <label className="text-[10px] font-bold text-ink-2 mb-1 block">Default Wallet</label>
                <div className="w-full border border-[var(--ah-border)] rounded-xl px-3 py-2 text-xs bg-[var(--ah-surface-2)] text-ink">{wallets[0].WalletName} ({wallets[0].Currency})</div>
              </div>
            ) : (
              <div className="text-[10px] text-ink-3">কোনো Wallet এক্সেস নেই, তাই Default Wallet নির্বাচন করা যাবে না।</div>
            )}

            <button onClick={handleEditSave} className="w-full bg-[var(--ah-brand)] hover:bg-[var(--ah-brand-strong)] text-white font-bold py-2.5 rounded-xl text-xs shadow-md">Save Profile</button>
          </>
        ) : (
          <>
            <input type="password" value={currentPin} onChange={(e) => setCurrentPin(e.target.value)} placeholder="Current PIN / Password" className="w-full border border-[var(--ah-border-strong)] rounded-xl px-3 py-2 text-xs focus:ring-[var(--ah-brand-ring)] bg-[var(--ah-surface)] text-ink" />
            <input type="password" value={newPin} onChange={(e) => setNewPin(e.target.value)} placeholder={"New PIN / Password (min " + MIN_PIN_LENGTH + ", max " + MAX_PIN_LENGTH + " characters)"} className="w-full border border-[var(--ah-border-strong)] rounded-xl px-3 py-2 text-xs focus:ring-[var(--ah-brand-ring)] bg-[var(--ah-surface)] text-ink" />
            <input type="password" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} placeholder="Confirm New PIN / Password" className="w-full border border-[var(--ah-border-strong)] rounded-xl px-3 py-2 text-xs focus:ring-[var(--ah-brand-ring)] bg-[var(--ah-surface)] text-ink" />
            <button onClick={handlePwSave} className="w-full bg-[var(--ah-brand)] hover:bg-[var(--ah-brand-strong)] text-white font-bold py-2.5 rounded-xl text-xs shadow-md">Change Password</button>
          </>
        )}
      </Popup>

      <UpdateDialog
        open={updateState !== "idle"}
        state={updateState}
        release={updateRelease}
        installed={updateInstalled}
        progress={updateProgress}
        message={updateMessage}
        onUpdate={startDownload}
        onLater={resetUpdate}
        onClose={resetUpdate}
        onOpenInstaller={() => launchInstaller()}
        onOpenSettings={handleOpenInstallSettings}
      />

      {/* Avatar Card */}
      <div className="bg-[var(--ah-surface)] rounded-2xl overflow-hidden shadow-sm">
        <div className="bg-emerald-700 h-14"></div>
        <div className="text-center pb-5 -mt-10">
          <div className="relative w-20 h-20 mx-auto mb-3">
            <div className="w-20 h-20 rounded-full overflow-hidden bg-[var(--ah-surface-3)] ring-4 ring-white dark:ring-gray-900 shadow-md">
              {profilePic ? (
                <img src={profilePic} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <DefaultAvatarIcon className="w-full h-full" />
              )}
            </div>
            <button onClick={() => fileInputRef.current.click()} className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-[var(--ah-brand)] text-white flex items-center justify-center text-[11px] border-2 border-white dark:border-gray-900 shadow-sm">
              <i className="fa-solid fa-camera"></i>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePicChange} className="hidden" />
          </div>
          <div className="text-ink font-bold text-base">{fullName}</div>
          <div className="inline-flex items-center gap-1.5 mt-1.5">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${currentUser.role === 'Admin' ? 'bg-[var(--ah-success-soft)] text-[var(--ah-success)]' : 'bg-[var(--ah-info-soft)] text-[var(--ah-info)]'}`}>
              {currentUser.role}
            </span>
            <span className="text-ink-3 text-xs">@{currentUser.username}</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-[var(--ah-surface)] border border-[var(--ah-border)] rounded-xl p-3 flex items-center gap-2.5 shadow-2xs">
          <div className="w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-900/40 text-[var(--ah-info)] flex items-center justify-center text-sm flex-shrink-0">
            <i className="fa-solid fa-receipt"></i>
          </div>
          <div>
            <div className="text-sm font-bold text-ink leading-tight">{scopedTransactions.length}</div>
            <div className="text-[10px] text-ink-3">{selectedWallet ? `${selectedWallet.WalletName} লেনদেন` : 'মোট লেনদেন'}</div>
          </div>
        </div>
        <div className="bg-[var(--ah-surface)] border border-[var(--ah-border)] rounded-xl p-3 flex items-center gap-2.5 shadow-2xs">
          <div className="w-9 h-9 rounded-lg bg-[var(--ah-warning-soft)] text-[var(--ah-warning)] flex items-center justify-center text-sm flex-shrink-0">
            <i className="fa-solid fa-calendar-check"></i>
          </div>
          <div>
            <div className="text-sm font-bold text-ink leading-tight">{thisMonthCount}</div>
            <div className="text-[10px] text-ink-3">এই মাসে এন্ট্রি</div>
          </div>
        </div>
      </div>

      {/* Lifetime income/expense for the selected wallet. */}
      <div className="bg-[var(--ah-surface)] border border-[var(--ah-border)] rounded-xl p-3.5 shadow-2xs">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="text-xs font-bold text-ink">মোট আয় ও খরচ</div>
          <div className="text-[10px] text-ink-3">
            {selectedWallet ? `${selectedWallet.WalletName} · সর্বমোট` : 'সর্বমোট'}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg p-2.5 bg-[var(--ah-success-soft)]">
            <div className="text-[10px] text-[var(--ah-success)] font-medium">
              <i className="fa-solid fa-arrow-up text-[9px] me-1"></i>মোট আয়
            </div>
            <div className="text-sm font-bold text-[var(--ah-success)] mt-0.5 break-all tabular-nums">
              {formatMoney(lifetimeIncome, selectedWallet?.Currency)}
            </div>
          </div>
          <div className="rounded-lg p-2.5 bg-[var(--ah-danger-soft)]">
            <div className="text-[10px] text-[var(--ah-danger)] font-medium">
              <i className="fa-solid fa-arrow-down text-[9px] me-1"></i>মোট খরচ
            </div>
            <div className="text-sm font-bold text-[var(--ah-danger)] mt-0.5 break-all tabular-nums">
              {formatMoney(lifetimeExpense, selectedWallet?.Currency)}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-[var(--ah-border)]">
          <span className="text-[10px] text-ink-3">নিট (আয় − খরচ)</span>
          <span className={`text-xs font-bold tabular-nums ${lifetimeNet >= 0 ? 'text-[var(--ah-success)]' : 'text-[var(--ah-danger)]'}`}>
            {formatMoney(lifetimeNet, selectedWallet?.Currency)}
          </span>
        </div>
      </div>

      {/* Access Summary — doubles as the wallet filter for everything below. */}
      <div className="bg-[var(--ah-surface)] border border-[var(--ah-border)] rounded-xl p-3.5 shadow-2xs">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="text-xs font-bold text-ink">আমার Access</div>
          {walletList.length > 0 && (
            <span className="text-[10px] text-ink-3">
              {selectedWallet ? `${selectedWallet.WalletName} দেখানো হচ্ছে` : ''}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {walletList.length === 0 && <span className="text-[11px] text-ink-3">কোনো Wallet এক্সেস নেই</span>}
          {walletList.map(w => {
            const id = String(w.WalletID);
            const active = resolvedWalletId === id;
            const isDefault = id === defaultWallet;
            // Count only this user's own transactions in that wallet, so the
            // badge reflects what the list will actually show.
            const count = ownTransactions.filter(t => String(t.WalletID) === id).length;
            return (
              <button
                key={w.WalletID}
                type="button"
                onClick={() => selectWallet(id)}
                aria-pressed={active}
                className={`text-[10px] font-semibold px-2 py-1 rounded-full transition-colors ${
                  active
                    ? "bg-[var(--ah-brand)] text-white shadow-sm"
                    : isDefault
                    ? "bg-[var(--ah-success-soft)] text-[var(--ah-success)] hover:bg-[var(--ah-success-soft-2)] dark:hover:bg-emerald-900/60"
                    : "bg-[var(--ah-surface-3)] text-ink-2 hover:bg-[var(--ah-surface-3)] dark:hover:bg-[var(--ah-header-2)]"
                }`}
              >
                {w.WalletName} ({w.Currency}){isDefault ? ' • Default' : ''} · {count}
              </button>
            );
          })}
        </div>
      </div>

      {/* Transaction History */}
      <div>
        <div className="text-xs font-bold text-ink mb-2">লেনদেন ইতিহাস</div>
        <div className="space-y-2">
          {pageItems.length === 0 ? (
            <div className="text-center py-8 text-ink-3 text-xs">
              {selectedWallet ? `${selectedWallet.WalletName}-এ কোনো লেনদেন নেই।` : 'কোনো লেনদেন নেই।'}
            </div>
          ) : pageItems.map((t) => (
            <TransactionCard key={t.ID} t={t} balanceAfter={transactionBalances?.get(t)} canEdit={canEdit} canDelete={canDelete} onEdit={onEditTxn} onDelete={onDeleteTxn} />
          ))}
        </div>

        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-1.5 mt-3">
            <button disabled={page === 1} onClick={() => setPage(page - 1)} className="w-7 h-7 rounded-lg text-xs font-semibold text-ink-3 disabled:opacity-30"><i className="fa-solid fa-chevron-left"></i></button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
              <button key={n} onClick={() => setPage(n)} className={`w-7 h-7 rounded-lg text-xs font-semibold ${page === n ? 'bg-[var(--ah-brand)] text-white' : 'bg-[var(--ah-surface-3)] text-ink-2'}`}>{n}</button>
            ))}
            <button disabled={page === totalPages} onClick={() => setPage(page + 1)} className="w-7 h-7 rounded-lg text-xs font-semibold text-ink-3 disabled:opacity-30"><i className="fa-solid fa-chevron-right"></i></button>
          </div>
        )}
      </div>
    </div>
  );
}