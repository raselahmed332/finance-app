import { useState, memo } from "react";
import { api, GRANTABLE_PERMISSIONS } from "../api.js";
import Select from "../components/Select.jsx";
import SwipeCard from "../components/SwipeCard.jsx";

const ROLE_DISPLAY = {
  ADMIN: "Admin",
  Admin: "Admin",
  SUB_ADMIN: "Sub-Admin",
  "Sub-Admin": "Sub-Admin",
  USER: "User",
  User: "User",
};

const roleLabel = (role) => ROLE_DISPLAY[role] || role || "User";

const DEFAULT_PERMISSION_ITEMS = [
  { key: "VIEW_DASHBOARD", label: "View Dashboard", short: "Dashboard" },
  { key: "ADD_EXPENSE", label: "Add Expense", short: "Expense" },
  { key: "BANK_OPERATIONS", label: "Bank Operations", short: "Bank" },
  { key: "VIEW_TRANSACTIONS", label: "View Transactions", short: "Transactions" },
  { key: "VIEW_REPORTS", label: "View Reports", short: "Reports" },
  { key: "VIEW_LOANS", label: "View Loans", short: "Loans" },
  { key: "LOAN_GIVE", label: "Give Loan", short: "Give" },
  { key: "LOAN_TAKE", label: "Take Loan", short: "Take" },
  { key: "LOAN_PAYMENT", label: "Loan Payment", short: "Payment" },
];

const PERMISSION_GROUPS = [
  {
    title: "Transactions",
    items: [
      { key: "ADD_INCOME", label: "Add Income", desc: "Create income transactions inside accessible wallets." },
      { key: "TRANSFER_MONEY", label: "Transfer Money", desc: "Transfer between wallets the user can access." },
      { key: "MANAGE_TRANSACTIONS", label: "Manage Transactions", sub: "Edit + Delete Transactions", desc: "Edit and delete transactions." },
    ],
  },
  {
    title: "Wallet Management",
    note: "Which wallets the user can create / edit / activate / deactivate. Separately controlled from Wallet Access.",
    items: [
      { key: "ADD_WALLET", label: "Add Wallet" },
      { key: "EDIT_WALLET", label: "Edit Wallet" },
      { key: "MANAGE_WALLET_STATUS", label: "Manage Wallet Status", sub: "Activate + Deactivate Wallet" },
    ],
  },
  {
    title: "Loan Management",
    items: [
      { key: "MANAGE_LOANS", label: "Manage Loans", sub: "Edit + Delete Loans", desc: "Edit and delete loans." },
      { key: "MANAGE_LOAN_TRANSACTIONS", label: "Manage Loan Transactions", sub: "Edit + Delete Loan Transactions", desc: "Edit and delete loan transactions." },
    ],
  },
  {
    title: "User Management",
    note: "Does not grant role change, password change, or admin creation.",
    items: [
      { key: "ADD_USER", label: "Add User" },
      { key: "EDIT_USER", label: "Edit User" },
      { key: "DELETE_USER", label: "Delete User" },
      { key: "MANAGE_USER_PERMISSIONS", label: "Manage User Permissions" },
    ],
  },
  {
    title: "System Management",
    items: [
      { key: "BACKUP_RESTORE", label: "Backup & Restore" },
      { key: "VIEW_AUDIT_LOG", label: "View Audit Log" },
      { key: "MANAGE_CATEGORIES", label: "Manage Categories" },
    ],
  },
];

const ADMIN_FULL_ACCESS = [
  "All Wallets",
  "All Default Actions",
  "All Additional Actions",
  "User Management",
  "Wallet Management",
  "Backup & Restore",
  "Audit Log",
  "Category Management",
  "Role Management",
  "Password Management",
];

const grantablesOf = (user) =>
  (Array.isArray(user.StoredPermissions) ? user.StoredPermissions : (user.Permissions || []))
    .filter((p) => GRANTABLE_PERMISSIONS.includes(p));

function Section({ icon, title, description, children }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-200 dark:border-gray-800 shadow-2xs space-y-3">
      <div>
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-gray-200">
          <span className="w-6 h-6 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 flex items-center justify-center text-[10px] flex-shrink-0">
            <i className={`fa-solid ${icon}`}></i>
          </span>
          <span>{title}</span>
        </div>
        {description && (
          <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">{description}</div>
        )}
      </div>
      {children}
    </div>
  );
}

function CheckboxField({ checked, onChange, label, sub, desc, disabled }) {
  return (
    <label className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-[11px] min-w-0 ${checked ? "bg-emerald-50 dark:bg-emerald-900/20" : "bg-gray-50 dark:bg-gray-800"} ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} className="accent-emerald-600 mt-0.5 flex-shrink-0" />
      <span className="min-w-0 leading-tight">
        <span className="block font-semibold text-slate-700 dark:text-gray-200">{label}</span>
        {sub && <span className="block text-[9px] text-gray-500 dark:text-gray-400">{sub}</span>}
        {desc && <span className="block text-[9px] text-gray-400 dark:text-gray-500 mt-0.5">{desc}</span>}
      </span>
    </label>
  );
}

function AdminAccessPanel() {
  return (
    <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3.5 space-y-3">
      <div className="flex items-center gap-2.5">
        <span className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center flex-shrink-0">
          <i className="fa-solid fa-crown text-sm"></i>
        </span>
        <div>
          <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300">Admin — Full System Access</div>
          <div className="text-[10px] text-emerald-700 dark:text-emerald-400">এই ইউজার সম্পূর্ণ সিস্টেম অ্যাক্সেস পায়।</div>
        </div>
      </div>
      <div>
        {ADMIN_FULL_ACCESS.map((a) => (
          <div key={a} className="flex items-start gap-2 text-[11px] text-emerald-800 dark:text-emerald-300 py-0.5">
            <i className="fa-solid fa-check text-[9px] mt-0.5 text-emerald-600 dark:text-emerald-400"></i>
            <span>{a}</span>
          </div>
        ))}
      </div>
      <div className="text-[10px] text-emerald-700 dark:text-emerald-300 bg-white/70 dark:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-800 rounded-lg px-2.5 py-2 leading-relaxed">
        Admin has full system access. Individual permission assignment is not required.
      </div>
    </div>
  );
}

function NoWalletAccessNotice() {
  return (
    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3.5 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-bold text-red-700 dark:text-red-300">
        <i className="fa-solid fa-triangle-exclamation"></i>
        <span>No Wallet Access</span>
      </div>
      <div className="text-[11px] text-red-700/90 dark:text-red-300/90 leading-relaxed">
        This user currently has no access to any wallet. Financial data and wallet actions are unavailable until wallet access is granted.
      </div>
      <div className="text-[11px] text-red-700/90 dark:text-red-300/90 leading-relaxed">
        Additional permissions are <span className="font-bold">inactive</span> until this user has at least one accessible wallet.
      </div>
    </div>
  );
}

function DefaultPermissionsPanel() {
  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5 p-2">
        {DEFAULT_PERMISSION_ITEMS.map((item) => (
          <div key={item.key} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] bg-slate-50 dark:bg-gray-800 text-slate-600 dark:text-gray-300">
            <i className="fa-solid fa-circle-check text-emerald-600 dark:text-emerald-400 text-[10px] flex-shrink-0"></i>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
      <div className="bg-amber-50 dark:bg-amber-900/20 border-t border-amber-200 dark:border-amber-800 px-3 py-2 text-[10px] text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
        <i className="fa-solid fa-lock mt-0.5 text-[9px]"></i>
        <span>Automatically enabled with Wallet Access — not individually assignable.</span>
      </div>
    </div>
  );
}

function PermissionGroupList({ groups, selected, onToggle, disabled }) {
  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group.title} className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
          <div className="bg-gray-50 dark:bg-gray-800/60 px-3 py-1.5 border-b border-gray-200 dark:border-gray-800">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-gray-300">{group.title}</div>
            {group.note && <div className="text-[9px] font-normal normal-case text-gray-500 dark:text-gray-400 leading-tight mt-0.5">{group.note}</div>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 p-2">
            {group.items.map((item) => (
              <CheckboxField
                key={item.key}
                checked={selected.includes(item.key)}
                onChange={() => onToggle(item.key)}
                label={item.label}
                sub={item.sub}
                desc={item.desc}
                disabled={disabled}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function WalletAccessMatrix({ wallets, selected, onToggle, disabled }) {
  if (!wallets.length) {
    return <div className="text-[11px] text-gray-400 dark:text-gray-500">কোনো Wallet নেই। প্রথমে Wallet তৈরি করুন।</div>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
      {wallets.map((w) => {
        const id = String(w.WalletID);
        const checked = selected.includes(id);
        return (
          <label key={w.WalletID} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] cursor-pointer ${checked ? "bg-emerald-50 dark:bg-emerald-900/20" : "bg-gray-50 dark:bg-gray-800"} ${disabled ? "opacity-60" : ""}`}>
            <input type="checkbox" checked={checked} onChange={() => onToggle(id)} disabled={disabled} className="accent-emerald-600 flex-shrink-0" />
            <span className="min-w-0 leading-tight">
              <span className={`block font-semibold ${checked ? "text-emerald-800 dark:text-emerald-300" : "text-slate-700 dark:text-gray-200"}`}>{w.WalletName}</span>
              <span className="block text-[9px] text-gray-400 dark:text-gray-500">{w.Currency}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

function EffectiveAccessSummary({ wallets, walletAccess, permissions }) {
  const accessible = wallets.filter((w) => walletAccess.includes(String(w.WalletID)));
  if (!accessible.length) return null;
  const extras = PERMISSION_GROUPS.flatMap((g) => g.items).filter((i) => permissions.includes(i.key));
  return (
    <div className="bg-slate-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl p-3 space-y-2.5">
      <div className="text-[10px] font-bold text-slate-600 dark:text-gray-300">Allowed Actions</div>
      {accessible.map((w) => (
        <div key={w.WalletID} className="text-[10px]">
          <div className="font-semibold text-slate-700 dark:text-gray-200 flex items-center gap-1.5">
            <i className="fa-solid fa-wallet text-emerald-600 dark:text-emerald-400 text-[9px]"></i>
            <span>{w.WalletName} ({w.Currency})</span>
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {DEFAULT_PERMISSION_ITEMS.map((d) => (
              <span key={d.key} className="inline-flex items-center gap-1 rounded bg-emerald-50 dark:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 text-[9px] font-semibold">
                <i className="fa-solid fa-check text-[8px]"></i>
                {d.short}
              </span>
            ))}
            {extras.map((e) => (
              <span key={e.key} className="inline-flex items-center gap-1 rounded bg-blue-50 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 text-[9px] font-semibold">
                <i className="fa-solid fa-plus text-[8px]"></i>
                {e.label}
              </span>
            ))}
          </div>
        </div>
      ))}
      <div className="text-[9px] text-gray-400 dark:text-gray-500">Defaults from Wallet Access + additional permissions granted above.</div>
    </div>
  );
}

function SubSectionHead({ step, title, description }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-[11px] font-bold text-slate-700 dark:text-gray-200">
        {step && (
          <span className="w-5 h-5 rounded-full bg-slate-800 dark:bg-gray-700 text-white text-[9px] flex items-center justify-center flex-shrink-0">{step}</span>
        )}
        <span>{title}</span>
      </div>
      {description && <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{description}</div>}
    </div>
  );
}

const inputCls = "w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs bg-white dark:bg-gray-900 dark:text-gray-100";

const UserRow = memo(function UserRow({ user, wallets, currentUser, can, onRefresh, showAlert, onUserAction }) {
  const [expanded, setExpanded] = useState(false);
  const [fullName, setFullName] = useState(user.FullName || user.Username || '');
  const [role, setRole] = useState(user.Role);
  const [status, setStatus] = useState(user.Status || 'Active');
  const [permissions, setPermissions] = useState(() => grantablesOf(user));
  const [walletAccess, setWalletAccess] = useState(() => (user.WalletAccess || []).map(String));

  const isAdminUser = user.Role === 'Admin';
  const isSelf = String(user.Username).toLowerCase() === String(currentUser.username || '').toLowerCase();
  const isActive = (user.Status || 'Active') === 'Active';
  const hasWallet = walletAccess.length > 0;
  const canExpand = can('EDIT_USER') || can('CHANGE_USER_ROLE') || can('MANAGE_USER_PERMISSIONS') || can('CHANGE_USER_PASSWORD');
  const canDel = can('DELETE_USER') && !isAdminUser;
  const canEditUser = can('EDIT_USER');
  const canChangeRole = can('CHANGE_USER_ROLE');
  const canManagePerms = can('MANAGE_USER_PERMISSIONS');
  const canResetPin = can('CHANGE_USER_PASSWORD') && !isSelf;
  const canSave = isAdminUser ? false : canEditUser || canChangeRole || canManagePerms;

  const togglePerm = (p) => setPermissions((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  const toggleWallet = (id) => setWalletAccess((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleResetPin = () => {
    const newPin = window.prompt('নতুন PIN লিখুন (min 4 character):');
    if (!newPin || !newPin.trim()) return;
    api.resetPin(user.Username, newPin.trim(), currentUser.username).then((res) => {
      showAlert(res.message, res.status === 'ERROR' ? 'error' : 'success');
    }).catch(() => showAlert('নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।', 'error'));
  };

  const saveAll = () => {
    const nameChanged = canEditUser && fullName.trim() !== (user.FullName || '');
    const roleChanged = canChangeRole && !isAdminUser && role !== user.Role;
    const statusChanged = canEditUser && !isAdminUser && status !== (user.Status || 'Active');
    const tasks = [];
    if (nameChanged || roleChanged) {
      tasks.push(api.updateUser(user.Username, fullName.trim(), roleChanged ? role : undefined, currentUser.username).then((res) => ({ status: res.status, message: res.message })));
    }
    if (statusChanged) {
      tasks.push(api.setUserStatus(user.Username, status, currentUser.username).then((res) => ({ status: res.status, message: res.message })));
    }
    if (canManagePerms && !isAdminUser) {
      tasks.push(api.updateUserPermissions(user.Username, permissions, currentUser.username).then((res) => ({ status: res.status, message: res.message })));
      tasks.push(api.updateUserWalletAccess(user.Username, walletAccess, currentUser.username).then((res) => ({ status: res.status, message: res.message })));
    }
    if (!tasks.length) { showAlert('কোনো পরিবর্তন করা হয়নি।', 'error'); return; }
    Promise.all(tasks).then((results) => {
      const failed = results.find((r) => r.status === 'ERROR');
      showAlert(failed ? failed.message : (results.map((r) => r.message).find(Boolean) || 'আপডেট হয়েছে!'), failed ? 'error' : 'success');
      if (!failed) { onRefresh(); setExpanded(false); }
    }).catch(() => showAlert('নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।', 'error'));
  };

  const roleBadge = isAdminUser
    ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400'
    : user.Role === 'Sub-Admin'
      ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400'
      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300';

  const rowWalletCount = isAdminUser ? (wallets.length || 0) : walletAccess.length;

  const row = (
    <div className="border-b border-gray-100 dark:border-gray-800 last:border-0 bg-white dark:bg-gray-900">
      <div className="flex items-start justify-between gap-2 py-2.5 px-1 text-xs">
        <div className="flex items-start gap-2 min-w-0">
          <span className="w-9 h-9 rounded-full bg-slate-100 dark:bg-gray-800 text-slate-400 dark:text-gray-500 flex items-center justify-center flex-shrink-0">
            <i className="fa-solid fa-user text-sm"></i>
          </span>
          <div className="min-w-0">
            <div className="font-bold text-slate-800 dark:text-gray-100 truncate">{user.FullName || user.Username}</div>
            <div className="text-[10px] text-gray-400 dark:text-gray-500">@{user.Username}</div>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold ${roleBadge}`}>{roleLabel(user.Role)}</span>
              <button
                type="button"
                disabled={!canEditUser || isAdminUser}
                onClick={() => onUserAction('status', user.Username, isActive ? 'Inactive' : 'Active')}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${isActive ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400' : 'bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-gray-400'}`}></span>
                {user.Status || 'Active'}
              </button>
            </div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1.5 flex items-center gap-1.5">
              <i className={`fa-solid fa-wallet ${isAdminUser ? 'text-emerald-600 dark:text-emerald-400' : hasWallet ? '' : 'text-red-400 dark:text-red-500'}`}></i>
              {isAdminUser
                ? <span className="text-emerald-700 dark:text-emerald-400 font-semibold">All Wallets</span>
                : (rowWalletCount === 0
                    ? <span className="text-red-500 dark:text-red-400 font-semibold">No Wallet Access</span>
                    : <span>Wallet Access: {rowWalletCount} {rowWalletCount > 1 ? 'Wallets' : 'Wallet'}</span>)}
            </div>
          </div>
        </div>
        {canExpand ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className={`flex items-center gap-1 flex-shrink-0 px-2.5 py-1 rounded-lg border text-[10px] font-bold ${expanded ? 'border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-200 dark:border-gray-700 text-slate-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800'}`}
          >
            {expanded ? 'Close' : 'Manage'}
            <i className={`fa-solid fa-chevron-${expanded ? 'up' : 'down'} text-[8px]`}></i>
          </button>
        ) : (
          <span className="text-gray-300 dark:text-gray-600 text-[10px] flex-shrink-0">—</span>
        )}
      </div>
    </div>
  );

  const basicInfo = (
    <div>
      <div className="text-[11px] font-bold text-slate-600 dark:text-gray-300 mb-1.5">Full Name</div>
      {canEditUser && !isAdminUser ? (
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} />
      ) : (
        <div className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 text-slate-700 dark:text-gray-200">{fullName}</div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
        <div>
          <div className="text-[11px] font-bold text-slate-600 dark:text-gray-300 mb-1.5">Username</div>
          <div className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 text-slate-500 dark:text-gray-400">@{user.Username}</div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-slate-600 dark:text-gray-300 mb-1.5">Role</div>
          {canChangeRole && !isAdminUser ? (
            <Select value={role} onChange={setRole}>
              <option value="User">User</option>
              <option value="Sub-Admin">Sub-Admin</option>
            </Select>
          ) : (
            <div className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 text-slate-500 dark:text-gray-400">{roleLabel(user.Role)}</div>
          )}
        </div>
      </div>
    </div>
  );

  const security = (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[11px] font-bold text-slate-700 dark:text-gray-200">PIN</span>
        <span className="text-xs tracking-widest text-gray-400 dark:text-gray-500">{new Array(8).fill('•').join('')}</span>
      </div>
      <button
        type="button"
        onClick={handleResetPin}
        className="flex-shrink-0 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-[10px] font-bold text-slate-600 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
      >
        <i className="fa-solid fa-key me-1"></i>Reset PIN
      </button>
    </div>
  );

  const accountStatus = (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${status === 'Active' ? 'bg-emerald-500' : 'bg-gray-400'}`}></span>
        <span className="text-xs font-bold text-slate-700 dark:text-gray-200">{status === 'Active' ? 'Active' : 'Inactive'}</span>
      </div>
      <button
        type="button"
        onClick={() => setStatus(status === 'Active' ? 'Inactive' : 'Active')}
        className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-bold ${status === 'Active' ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300' : 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'}`}
      >
        {status === 'Active' ? 'Deactivate User' : 'Activate User'}
      </button>
    </div>
  );

  const editPanel = (
    <div className="bg-slate-50 dark:bg-gray-950 rounded-xl p-3 mb-3 space-y-3 border border-gray-200 dark:border-gray-800">
      {isAdminUser ? (
        <>
          <Section icon="fa-crown" title="Admin Access" description="এই ইউজার সিস্টেমের সম্পূর্ণ অ্যাক্সেস পায়।">
            <AdminAccessPanel />
            {basicInfo}
            {canResetPin && <div className="border-t border-gray-200 dark:border-gray-700 pt-3">{security}</div>}
          </Section>
        </>
      ) : (
        <>
          <Section icon="fa-id-card" title="Basic Information" description="মৌলিক তথ্য — নাম, ইউজারনেম, রোল।">
            {basicInfo}
          </Section>

          <Section icon="fa-wallet" title="Wallet Access" description="Select which wallets this user can access. Permissions only work within accessible wallets.">
            {!hasWallet && <NoWalletAccessNotice />}
            <WalletAccessMatrix wallets={wallets} selected={walletAccess} onToggle={toggleWallet} disabled={!canManagePerms} />
            <div className="text-[9px] text-gray-400 dark:text-gray-500">
              Wallet Access decides which wallets the user can use. It does NOT grant wallet management.
            </div>
            <EffectiveAccessSummary wallets={wallets} walletAccess={walletAccess} permissions={permissions} />
          </Section>

          <Section icon="fa-shield-halved" title="Default Wallet Permissions" description="These actions are automatically available when the user has access to a wallet.">
            <DefaultPermissionsPanel />
          </Section>

          <Section icon="fa-sliders" title="Additional Permissions" description={hasWallet ? "These permissions must be explicitly granted. They apply globally to all wallets the user can access." : "Permissions saved below stay inactive until the user receives Wallet Access."}>
            {!hasWallet && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-2.5 py-2 text-[10px] text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                <i className="fa-solid fa-triangle-exclamation mt-0.5 text-[9px]"></i>
                <span>These permissions are inactive because this user has no Wallet Access.</span>
              </div>
            )}
            <PermissionGroupList groups={PERMISSION_GROUPS} selected={permissions} onToggle={togglePerm} disabled={!canManagePerms} />
          </Section>

          {canResetPin && (
            <Section icon="fa-lock" title="Security" description="Admin-only control for managing this user's PIN. The PIN is never shown.">
              {security}
            </Section>
          )}

          {canEditUser && (
            <Section icon="fa-circle-check" title="Account Status" description="Activate or deactivate this user's access.">
              {accountStatus}
            </Section>
          )}

          {canSave && (
            <div className="flex gap-2">
              <button type="button" onClick={() => { setExpanded(false); }} className="px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 text-xs font-bold text-slate-600 dark:text-gray-200">
                Cancel
              </button>
              <button type="button" onClick={saveAll} className="flex-1 bg-slate-800 text-white font-bold py-2 rounded-xl text-xs">
                Save Changes
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <div>
      {(canExpand || canDel) ? (
        <SwipeCard onSwipeRight={canExpand ? () => setExpanded(true) : undefined} onSwipeLeft={canDel ? () => { if (confirm('এই ইউজার মুছে ফেলবেন?')) onUserAction('delete', user.Username); } : undefined}>
          {row}
        </SwipeCard>
      ) : row}

      {expanded && editPanel}
    </div>
  );
});

function AddUserForm({ wallets, currentUser, onUserCreated, showAlert }) {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState('User');
  const [walletAccess, setWalletAccess] = useState([]);
  const [permissions, setPermissions] = useState([]);

  const isAdminRole = role === 'Admin';
  const canCreateAdmin = currentUser?.role === 'Admin';

  const toggleWallet = (id) => setWalletAccess((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const togglePerm = (p) => setPermissions((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  const reset = () => {
    setFullName(''); setUsername(''); setPin(''); setRole('User'); setWalletAccess([]); setPermissions([]);
  };

  const handleCreate = (e) => {
    e.preventDefault();
    if (!username.trim() || !pin) return alert('সকল তথ্য পূরণ করুন!');
    api.addUser(fullName.trim(), username.trim(), pin, role, isAdminRole ? [] : permissions, isAdminRole ? [] : walletAccess, currentUser.username).then((res) => {
      showAlert(res.message, res.status === 'ERROR' ? 'error' : 'success');
      if (res.status !== 'ERROR') { reset(); onUserCreated(); }
    }).catch(() => showAlert('নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।', 'error'));
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-200 dark:border-gray-800 shadow-2xs">
      <div className="text-xs font-bold text-slate-700 dark:text-gray-200 mb-3">নতুন ইউজার যোগ করুন</div>
      <form onSubmit={handleCreate} className="space-y-4">
        <div className="space-y-2.5">
          <SubSectionHead step="1" title="Basic Information" description="Full Name, Username, PIN এবং Role।" />
          <input type="text" placeholder="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} />
          <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} className={inputCls} required />
          <input type="password" placeholder="PIN (min 4 character)" value={pin} onChange={(e) => setPin(e.target.value)} className={inputCls} required />
          <Select value={role} onChange={setRole}>
            <option value="User">User</option>
            <option value="Sub-Admin">Sub-Admin</option>
            {canCreateAdmin && <option value="Admin">Admin</option>}
          </Select>
        </div>

        {isAdminRole ? (
          <AdminAccessPanel />
        ) : (
          <>
            <div className="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-2.5">
              <SubSectionHead step="2" title="Wallet Access" description="Select which wallets this user can access." />
              <WalletAccessMatrix wallets={wallets} selected={walletAccess} onToggle={toggleWallet} />
              <div className="text-[9px] text-gray-400 dark:text-gray-500">Wallet Access decides where permissions can operate.</div>
            </div>

            <div className="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-2.5">
              <SubSectionHead step="3" title="Default Wallet Permissions" description="Automatically available when the user has access to a wallet." />
              <DefaultPermissionsPanel />
            </div>

            <div className="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-2.5">
              <SubSectionHead step="4" title="Additional Permissions" description="Explicitly granted by Admin. New users start with none." />
              <PermissionGroupList groups={PERMISSION_GROUPS} selected={permissions} onToggle={togglePerm} />
            </div>
          </>
        )}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={reset} className="px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 text-xs font-bold text-slate-600 dark:text-gray-200">
            Cancel
          </button>
          <button type="submit" className="flex-1 bg-emerald-600 text-white font-bold py-2 rounded-xl text-xs">
            <i className="fa-solid fa-user-plus me-1"></i> Create User
          </button>
        </div>
      </form>
    </div>
  );
}

export default function UserManagementView({ users, wallets, onRefresh, showAlert, currentUser, onUserAction, can }) {
  return (
    <div className="space-y-4">
      <h3 className="font-bold text-slate-800 dark:text-gray-100 text-base">User Access & Management (ইউজার ম্যানেজমেন্ট)</h3>

      {can('ADD_USER') ? (
        <AddUserForm wallets={wallets} currentUser={currentUser} onUserCreated={onRefresh} showAlert={showAlert} />
      ) : (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-xs text-amber-800 dark:text-amber-300">ইউজার যোগ করার অনুমতি আপনার নেই।</div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-200 dark:border-gray-800 shadow-2xs">
        <div className="text-xs font-bold text-slate-700 dark:text-gray-200 mb-1">ইউজার তালিকা</div>
        {(can('EDIT_USER') || can('CHANGE_USER_ROLE') || can('MANAGE_USER_PERMISSIONS') || can('DELETE_USER')) && (
          <div className="text-[10px] text-gray-400 dark:text-gray-500 mb-2 flex items-center gap-1">
            <i className="fa-solid fa-hand-pointer"></i> Swipe right to edit, left to delete
          </div>
        )}
        {users.map((u, i) => (
          <UserRow key={u.Username || i} user={u} wallets={wallets} currentUser={currentUser} can={can} onRefresh={onRefresh} showAlert={showAlert} onUserAction={onUserAction} />
        ))}
      </div>
    </div>
  );
}