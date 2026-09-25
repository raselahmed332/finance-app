import { useState, memo } from "react";
import { api, GRANTABLE_PERMISSIONS, PERMISSION_LABELS, DEFAULT_WALLET_ACTIONS } from "../api.js";
import Select from "../components/Select.jsx";
import SwipeCard from "../components/SwipeCard.jsx";
import Popup from "../components/Popup.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";

// ---------- Role handling (friendly labels only, never raw DB keys) ----------

const ROLE_LABELS = { ADMIN: "Admin", SUB_ADMIN: "Sub-Admin", USER: "User" };

function normRole(role) {
  const key = String(role || "").toUpperCase().replace(/[- ]/g, "_").replace(/_+/g, "_");
  return ROLE_LABELS[key] || (String(role || "") ? String(role) : "User");
}

function isAdminRole(role) {
  return normRole(role) === "Admin";
}

const ROLE_BADGE = {
  Admin: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400",
  "Sub-Admin": "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400",
  User: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400",
};

function RoleBadge({ role }) {
  const label = normRole(role);
  return (
    <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold tracking-wide ${ROLE_BADGE[label] || ROLE_BADGE.User}`}>
      {label.toUpperCase()}
    </span>
  );
}

// ---------- Additional permission groups (compact English notes) ----------

const PERMISSION_DESC = {
  ADD_INCOME: "Create income transactions inside accessible wallets",
  TRANSFER_MONEY: "Transfer between wallets the user can access",
  MANAGE_TRANSACTIONS: "Edit + Delete transactions",
  ADD_WALLET: "Create new wallets",
  EDIT_WALLET: "Rename / edit existing wallets",
  MANAGE_WALLET_STATUS: "Activate + Deactivate wallets",
  MANAGE_LOANS: "Edit + Delete loans",
  MANAGE_LOAN_TRANSACTIONS: "Edit + Delete loan transactions",
  ADD_USER: "Create new user accounts",
  EDIT_USER: "Edit user basic information",
  DELETE_USER: "Delete user accounts",
  MANAGE_USER_PERMISSIONS: "Manage wallet access & permissions",
  BACKUP_RESTORE: "Download & restore backups",
  VIEW_AUDIT_LOG: "View the audit log",
  MANAGE_CATEGORIES: "Manage income/expense categories",
};

const ADDITIONAL_GROUPS = [
  {
    title: "Transaction Permissions",
    bn: "লেনদেন",
    items: ["ADD_INCOME", "TRANSFER_MONEY", "MANAGE_TRANSACTIONS"],
  },
  {
    title: "Wallet Management",
    bn: "ওয়ালেট ব্যবস্থাপনা",
    items: ["ADD_WALLET", "EDIT_WALLET", "MANAGE_WALLET_STATUS"],
    note: "Wallet Access ভিন্ন ধারণা — Wallet Access হল কোন ওয়ালেট ইউজার ব্যবহার করতে পারবে, আর Wallet Management হল ইউজার ওয়ালেট তৈরি/এডিট/অ্যাক্টিভেট-ডিঅ্যাক্টিভেট করতে পারবে কিনা। Wallet Access থাকলেই Wallet Management স্বয়ংক্রিয়ভাবে আসে না।",
  },
  {
    title: "Loan Management",
    bn: "হাওলাত ব্যবস্থাপনা",
    items: ["MANAGE_LOANS", "MANAGE_LOAN_TRANSACTIONS"],
  },
  {
    title: "User Management",
    bn: "ইউজার ব্যবস্থাপনা",
    items: ["ADD_USER", "EDIT_USER", "DELETE_USER", "MANAGE_USER_PERMISSIONS"],
    note: "এই অনুমতিগুলো দিয়ে User এর Role পরিবর্তন, PIN রিসেট বা Admin তৈরি করা যায় না — সেগুলো শুধু Admin এর অধিকার।",
  },
  {
    title: "System Management",
    bn: "সিস্টেম ব্যবস্থাপনা",
    items: ["BACKUP_RESTORE", "VIEW_AUDIT_LOG", "MANAGE_CATEGORIES"],
  },
];

function itemKey(item) {
  return Array.isArray(item) ? item[0] : item;
}

// The backend rejects a Sub-Admin granting any permission they don't hold
// ("You cannot grant a permission you do not have"), so only offer the options
// the actor can actually grant. Admins may grant everything.
function grantableFor(currentUser) {
  const perms = Array.isArray(currentUser?.permissions) ? currentUser.permissions : [];
  return isAdminRole(currentUser?.role)
    ? GRANTABLE_PERMISSIONS.slice()
    : GRANTABLE_PERMISSIONS.filter((p) => perms.includes(p));
}

function filterGroups(groups, allowed) {
  const set = new Set(allowed);
  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => set.has(itemKey(i))) }))
    .filter((g) => g.items.length > 0);
}

// ---------- Small presentational pieces ----------

function SectionCard({ icon, title, hint, children, className = "" }) {
  return (
    <div className={`bg-slate-50 dark:bg-gray-950 rounded-xl p-3 border border-gray-200 dark:border-gray-800 space-y-2 ${className}`}>
      <div>
        <div className="text-[11px] font-bold text-slate-700 dark:text-gray-200 flex items-center gap-1.5">
          {icon && <i className={`fa-solid ${icon} text-emerald-600 dark:text-emerald-400 text-[10px]`}></i>}
          {title}
        </div>
        {hint && <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function NoWalletAccessNotice({ showInactiveNote }) {
  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-2.5">
      <div className="text-[11px] font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
        <i className="fa-solid fa-triangle-exclamation"></i> No Wallet Access
      </div>
      <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5 leading-snug">
        এই ইউজারের কোন ওয়ালেটে অ্যাক্সেস নেই, তাই আর্থিক ডেটা ও Wallet অ্যাকশন ব্যবহার করা যাবে না — যতক্ষণ না Wallet Access দেওয়া হয়।
      </p>
      {showInactiveNote && (
        <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-1 leading-snug">
          <i className="fa-solid fa-circle-exclamation me-1"></i>
          নিচে Additional Permission সংরক্ষিত থাকলেও Wallet Access ছাড়া সেগুলো নিষ্ক্রিয় থাকে।
        </p>
      )}
    </div>
  );
}

function DefaultPermissionsList({ active }) {
  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
        {DEFAULT_WALLET_ACTIONS.map((p) => (
          <div key={p} className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-gray-300">
            <i className={`fa-solid fa-circle-check text-xs ${active ? "text-emerald-500 dark:text-emerald-400" : "text-gray-300 dark:text-gray-600"}`}></i>
            <span>{PERMISSION_LABELS[p] || p}</span>
          </div>
        ))}
      </div>
      <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5 flex items-center gap-1">
        <i className="fa-solid fa-lock"></i> Automatically enabled with Wallet Access — read-only, নিষ্ক্রিয় করা যাবে না
      </div>
    </div>
  );
}

function AdminFullAccessCard() {
  const items = [
    "All Wallets", "All Default Actions", "All Additional Actions",
    "User Management", "Wallet Management", "Backup & Restore",
    "Audit Log", "Category Management", "Role Management", "Password Management",
  ];
  return (
    <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 space-y-2">
      <div className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
        <i className="fa-solid fa-shield-halved me-1.5"></i>Admin — Full System Access
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
        {items.map((it) => (
          <div key={it} className="flex items-center gap-1.5 text-[11px] text-emerald-800 dark:text-emerald-300">
            <i className="fa-solid fa-circle-check text-[10px] opacity-70"></i>{it}
          </div>
        ))}
      </div>
      <p className="text-[10px] text-emerald-700 dark:text-emerald-400 leading-snug">
        Admin-এর পূর্ণ সিস্টেম এক্সেস। আলাদা করে Permission অ্যাসাইন করার প্রয়োজন নেই, তাই এখানে কোন permission checkbox দেখানো হয় না।
      </p>
    </div>
  );
}

function AdminOnlyNote() {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-2.5">
      <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
        <i className="fa-solid fa-lock text-amber-500 dark:text-amber-400"></i> Admin Only
      </div>
      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 leading-snug">
        Role পরিবর্তন, Password/PIN পরিবর্তন এবং Admin তৈরি — শুধুমাত্র Admin এর কাজ। এগুলো checkbox হিসেবে দেওয়া হয় না, ফলে Sub-Admin নিজেকে কখনো Admin বানাতে পারবে না।
      </p>
    </div>
  );
}

function WalletChecklist({ wallets, selected, onToggle }) {
  if (!wallets.length) {
    return <div className="text-[11px] text-gray-400 dark:text-gray-500">কোনো Wallet নেই (আগে Wallet তৈরি করুন)।</div>;
  }
  return (
    <div className="space-y-1">
      {wallets.map((w) => {
        const checked = selected.includes(String(w.WalletID));
        return (
          <label key={w.WalletID} className="flex items-center gap-2 cursor-pointer select-none rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-2.5 py-2 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors">
            <input type="checkbox" checked={checked} onChange={() => onToggle(String(w.WalletID))} className="accent-emerald-600" />
            <span className="text-xs font-medium text-slate-700 dark:text-gray-200">
              {w.WalletName} <span className="text-[10px] text-gray-400 dark:text-gray-500">({w.Currency})</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

function PermissionCheckbox({ opt, checked, onToggle, sub }) {
  return (
    <label className="flex items-start gap-2 cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={() => onToggle(opt)} className="mt-0.5 accent-emerald-600" />
      <span className="min-w-0">
        <span className="block text-[11px] font-medium text-slate-700 dark:text-gray-200">{PERMISSION_LABELS[opt] || opt}</span>
        {sub && <span className="block text-[10px] text-gray-400 dark:text-gray-500">{sub}</span>}
      </span>
    </label>
  );
}

function PermissionGroup({ group, selected, onToggle }) {
  const [open, setOpen] = useState(false);
  const selectedCount = (group.items || []).filter((item) => selected.includes(itemKey(item))).length;
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-2.5 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <span className="text-[11px] font-bold text-slate-700 dark:text-gray-200">
          {group.title} <span className="text-[10px] text-gray-400 dark:text-gray-500 font-normal">({group.bn})</span>
        </span>
        <span className="flex items-center gap-1.5">
          {selectedCount > 0 && (
            <span className="text-[9px] font-semibold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded-full min-w-[16px] text-center">
              {selectedCount}
            </span>
          )}
          <i className={`fa-solid fa-chevron-${open ? "up" : "right"} text-[10px] text-gray-400 dark:text-gray-500 transition-transform`}></i>
        </span>
      </button>
      {open && (
        <div className="px-2.5 pb-2.5 pt-1.5 space-y-2 border-t border-gray-100 dark:border-gray-800">
          {group.items.map((item) => {
            const key = itemKey(item);
            return (
              <PermissionCheckbox
                key={key}
                opt={key}
                checked={selected.includes(key)}
                onToggle={onToggle}
                sub={PERMISSION_DESC[key]}
              />
            );
          })}
          {group.note && (
            <div className="text-[10px] text-gray-400 dark:text-gray-500 leading-snug pt-1">
              <i className="fa-solid fa-circle-info me-1"></i>{group.note}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AnyAdditionalGranted({ selected }) {
  const granted = (selected || []).filter((p) => GRANTABLE_PERMISSIONS.includes(p));
  return granted.length > 0;
}

// ---------- Manage / Edit single user ----------

const ManageUserPanel = memo(function ManageUserPanel({ user, wallets, currentUser, can, onRefresh, showAlert, onUserAction, onClose }) {
  const isAdmin = isAdminRole(user.Role);
  const isSelf = String(user.Username).toLowerCase() === String(currentUser.username || "").toLowerCase();
  const knownIds = new Set(wallets.map((w) => String(w.WalletID)));
  const targetAccess = (user.WalletAccess || []).map(String);
  const otherAccess = targetAccess.filter((id) => !knownIds.has(id));
  const storedGrantables = (user.Permissions || []).filter((p) => GRANTABLE_PERMISSIONS.includes(p));
  const outOfScopeWallets = otherAccess;

  const [fullName, setFullName] = useState(user.FullName || "");
  const [role, setRole] = useState(normRole(user.Role));
  const [permissions, setPermissions] = useState(() => (user.Permissions || []).filter((p) => GRANTABLE_PERMISSIONS.includes(p)));
  const [walletAccess, setWalletAccess] = useState(() => targetAccess.filter((id) => knownIds.has(id)));
  const [saving, setSaving] = useState(false);
  const [resettingPin, setResettingPin] = useState(false);

  const hasWallet = walletAccess.length > 0;
  const actorAdmin = isAdminRole(currentUser?.role);
  const canEditName = can("EDIT_USER");
  const canEditRole = can("CHANGE_USER_ROLE") && actorAdmin;
  // Permissions/wallet-access panels are admin-manageable on self, but the
  // backend rejects a Sub-Admin editing their OWN perms/wallets — hide the
  // controls so they can't surface an error that can never succeed.
  const canManagePerms = can("MANAGE_USER_PERMISSIONS") && (actorAdmin || !isSelf);
  const canResetPin = can("CHANGE_USER_PASSWORD") && !isSelf;
  // User status changes are Admin-only on the backend (EDIT_USER alone is not enough).
  const canToggleStatus = actorAdmin && canEditName;
  const active = (user.Status || "Active") === "Active";

  // A Sub-Admin may only grant permissions they hold and wallets they can see.
  // If the target holds grants beyond the actor's scope, editing would either
  // be rejected by the backend or silently revoke those grants — so lock the
  // panels and tell the user why instead of offering a dead-end.
  const actorPerms = grantableFor(currentUser);
  const permLocked = !actorAdmin && storedGrantables.some((p) => !actorPerms.includes(p));
  const walletLocked = !actorAdmin && outOfScopeWallets.length > 0;

  const togglePerm = (p) => setPermissions((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  const toggleWallet = (id) => setWalletAccess((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleResetPin = () => {
    const newPin = window.prompt("নতুন PIN লিখুন (min 4 character):");
    if (!newPin || !newPin.trim()) return;
    setResettingPin(true);
    api.resetPin(user.Username, newPin.trim(), currentUser.username).then((res) => {
      showAlert(res.message, res.status === "ERROR" ? "error" : "success");
    }).catch(() => showAlert("নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।", "error")).finally(() => setResettingPin(false));
  };

  const handleToggleStatus = () => {
    onUserAction("status", user.Username, active ? "Inactive" : "Active");
    onClose();
  };

  const saveAll = () => {
    if (saving) return;
    const storedAccess = targetAccess.filter((id) => knownIds.has(id));
    const nameChanged = canEditName && fullName !== (user.FullName || "");
    const roleChanged = canEditRole && role !== normRole(user.Role);
    const permChanged = canManagePerms && !permLocked &&
      JSON.stringify([...permissions].sort()) !== JSON.stringify([...storedGrantables].sort());
    const walletChanged = canManagePerms && !walletLocked &&
      JSON.stringify([...walletAccess].sort()) !== JSON.stringify([...storedAccess].sort());

    const calls = [];
    if (nameChanged) calls.push(api.updateUser(user.Username, fullName, undefined, currentUser.username).then((r) => ({ ...r, key: "General" })));
    if (roleChanged) calls.push(api.updateUser(user.Username, undefined, role, currentUser.username).then((r) => ({ ...r, key: "Role" })));
    if (permChanged) calls.push(api.updateUserPermissions(user.Username, permissions, currentUser.username).then((r) => ({ ...r, key: "Permissions" })));
    if (walletChanged) calls.push(api.updateUserWalletAccess(user.Username, walletAccess, currentUser.username).then((r) => ({ ...r, key: "WalletAccess" })));

    if (!calls.length) {
      showAlert("কোনো পরিবর্তন হয়নি।", "error");
      return;
    }
    setSaving(true);
    Promise.all(calls).then((results) => {
      const failed = results.find((r) => r.status === "ERROR");
      showAlert(failed ? failed.message : "আপডেট হয়েছে!", failed ? "error" : "success");
      if (!failed) {
        onRefresh();
        onClose();
      }
    }).catch(() => showAlert("নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।", "error")).finally(() => setSaving(false));
  };

  return (
    <div className="bg-slate-50 dark:bg-gray-950 rounded-xl p-3 mb-3 space-y-3 border border-gray-200 dark:border-gray-800">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-bold text-slate-700 dark:text-gray-200">
          Manage User <span className="text-gray-400 dark:text-gray-500 font-normal">— {user.FullName || user.Username}</span>
        </div>
        <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-200"><i className="fa-solid fa-xmark"></i></button>
      </div>

      {isAdmin ? (
        <>
          <AdminFullAccessCard />
          {canResetPin && (
            <SectionCard icon="fa-shield-halved" title="Security" hint="Admin ইউজারের নিরাপত্তা">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] font-bold text-slate-600 dark:text-gray-300">PIN</div>
                  <div className="text-[10px] text-gray-400 dark:text-gray-500 tracking-widest">•••••••••</div>
                </div>
                <button onClick={handleResetPin} disabled={resettingPin} className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg">
                  {resettingPin ? <i className="fa-solid fa-spinner fa-spin"></i> : <><i className="fa-solid fa-key me-1"></i>Reset PIN</>}
                </button>
              </div>
            </SectionCard>
          )}
          <SectionCard icon="fa-circle-dot" title="Account Status">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <i className={`fa-solid fa-circle text-[9px] ${active ? "text-emerald-500" : "text-gray-400"}`}></i>
                <span className={`text-xs font-bold ${active ? "text-emerald-600 dark:text-emerald-400" : "text-gray-500 dark:text-gray-400"}`}>{active ? "Active" : "Inactive"}</span>
              </div>
              <div className="text-[10px] text-gray-400 dark:text-gray-500">Admin-এর Status শুধু Admin পরিবর্তন করতে পারবে।</div>
            </div>
          </SectionCard>
        </>
      ) : (
        <>
          <SectionCard icon="fa-id-card" title="Basic Information" hint="মৌলিক তথ্য">
            <div className="space-y-2">
              {canEditName ? (
                <div>
                  <div className="text-[10px] font-bold text-slate-600 dark:text-gray-300 mb-1">Full Name</div>
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={user.Username}
                    className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-900 dark:text-gray-100" />
                </div>
              ) : (
                <div>
                  <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500 mb-1">Full Name (read-only)</div>
                  <div className="text-xs text-slate-700 dark:text-gray-200">{user.FullName || user.Username}</div>
                </div>
              )}
              <div>
                <div className="text-[10px] font-bold text-slate-600 dark:text-gray-300 mb-1">Username</div>
                <div className="text-xs text-slate-700 dark:text-gray-200">@{user.Username}</div>
              </div>
              {canEditRole ? (
                <div>
                  <div className="text-[10px] font-bold text-slate-600 dark:text-gray-300 mb-1">Role <span className="text-amber-600 dark:text-amber-400">(Admin Only)</span></div>
                  <Select value={role} onChange={setRole}>
                    <option value="User">User</option>
                    <option value="Sub-Admin">Sub-Admin</option>
                    {actorAdmin && <option value="Admin">Admin</option>}
                  </Select>
                </div>
              ) : (
                <div>
                  <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500 mb-1">Role (read-only)</div>
                  <div className="flex items-center gap-1.5"><RoleBadge role={user.Role} /></div>
                </div>
              )}
            </div>
          </SectionCard>

          {canManagePerms && (
            <SectionCard icon="fa-wallet" title="Wallet Access" hint="কোন ওয়ালেটে ইউজার এক্সেস পাবে তা নির্বাচন করুন। Permissions শুধু অ্যাক্সেসযোগ্য ওয়ালেটের ভেতরেই কাজ করে।">
              {walletLocked && !actorAdmin ? (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-2.5 text-[10px] text-amber-700 dark:text-amber-400 leading-snug">
                  <i className="fa-solid fa-triangle-exclamation me-1"></i>
                  এই ইউজারের আরও Wallet Access আছে, কিন্তু সেগুলো আপনার বর্তমান Wallet তালিকার বাইরে ({" "}
                  {outOfScopeWallets.join(", ")} )। এখানে সম্পাদনা করলে সেগুলো হারাবে, তাই Wallet Access
                  এডিট বন্ধ আছে — আগে Admin এর সাথে যোগাযোগ করুন।
                </div>
              ) : (
                <>
                  <WalletChecklist wallets={wallets} selected={walletAccess} onToggle={toggleWallet} />
                  {otherAccess.length > 0 && (
                    <div className="text-[10px] text-gray-400 dark:text-gray-500">
                      এই ইউজারের আরও অ্যাক্সেস আছে, কিন্তু তা আপনার বর্তমান Wallet তালিকায় নেই:{" "}
                      {otherAccess.join(", ")}
                    </div>
                  )}
                  {!hasWallet && <NoWalletAccessNotice showInactiveNote={AnyAdditionalGranted({ selected: permissions })} />}
                  {hasWallet && (
                    <div className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center gap-1">
                      <i className="fa-solid fa-circle-check text-emerald-500"></i>
                      Wallet Access সক্রিয় → Default Wallet Actions + Additional Permissions প্রযোজ্য
                    </div>
                  )}
                </>
              )}
            </SectionCard>
          )}

          <SectionCard icon="fa-list-check" title="Default Wallet Permissions" hint="Wallet Access থাকলে এই অ্যাকশনগুলো স্বয়ংক্রিয়ভাবে সক্রিয় হয়।">
            <DefaultPermissionsList active={hasWallet} />
          </SectionCard>

          {canManagePerms && (
            <SectionCard icon="fa-user-shield" title="Additional Permissions" hint="এই Permissions Admin কে স্পষ্টভাবে দিতে হয়। এগুলো ইউজারের অ্যাক্সেসযোগ্য সব ওয়ালেটে প্রযোজ্য।">
              {permLocked ? (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-2.5 text-[10px] text-amber-700 dark:text-amber-400 leading-snug">
                  <i className="fa-solid fa-triangle-exclamation me-1"></i>
                  এই ইউজারের কিছু Permission আপনার অনুমতির বাইরে, তাই Additional Permissions এডিট বন্ধ
                  আছে — আগে Admin এর সাথে যোগাযোগ করুন।
                </div>
              ) : (
                <>
                  {!hasWallet && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-2.5 text-[10px] text-amber-700 dark:text-amber-400 leading-snug">
                      <i className="fa-solid fa-triangle-exclamation me-1"></i>
                      Add Income ইত্যাদি Permission দেওয়া থাকলেও Wallet Access না থাকায় সেগুলো নিষ্ক্রিয় থাকবে।
                    </div>
                  )}
                  {filterGroups(ADDITIONAL_GROUPS, actorPerms).map((g) => (
                    <PermissionGroup key={g.title} group={g} selected={permissions} onToggle={togglePerm} />
                  ))}
                  <AdminOnlyNote />
                </>
              )}
            </SectionCard>
          )}

          {canResetPin && (
            <SectionCard icon="fa-shield-halved" title="Security" hint="অন্য ইউজারের PIN ম্যানেজ করুন">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] font-bold text-slate-600 dark:text-gray-300">PIN</div>
                  <div className="text-[10px] text-gray-400 dark:text-gray-500 tracking-widest">•••••••••</div>
                </div>
                <button onClick={handleResetPin} disabled={resettingPin} className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg">
                  {resettingPin ? <i className="fa-solid fa-spinner fa-spin"></i> : <><i className="fa-solid fa-key me-1"></i>Reset PIN</>}
                </button>
              </div>
              <div className="text-[10px] text-gray-400 dark:text-gray-500"><i className="fa-solid fa-circle-info me-1"></i>PIN/password কখনো প্লেইন টেক্সটে দেখানো হয় না।</div>
            </SectionCard>
          )}

          <SectionCard icon="fa-circle-dot" title="Account Status">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <i className={`fa-solid fa-circle text-[9px] ${active ? "text-emerald-500" : "text-gray-400"}`}></i>
                <span className={`text-xs font-bold ${active ? "text-emerald-600 dark:text-emerald-400" : "text-gray-500 dark:text-gray-400"}`}>{active ? "Active" : "Inactive"}</span>
              </div>
              {canToggleStatus && (
                <button onClick={handleToggleStatus} className={`text-[11px] font-bold px-3 py-1.5 rounded-lg ${active ? "bg-red-500/90 hover:bg-red-600 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white"}`}>
                  {active ? "Deactivate User" : "Activate User"}
                </button>
              )}
            </div>
          </SectionCard>

          <button onClick={saveAll} disabled={saving} className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-2 rounded-xl text-xs shadow-sm flex items-center justify-center gap-1.5">
            {saving && <i className="fa-solid fa-spinner fa-spin"></i>} {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </>
      )}
    </div>
  );
});

// ---------- User list row ----------

const UserRow = memo(function UserRow({ user, wallets, currentUser, can, onRefresh, showAlert, onUserAction }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const confirm = useConfirm();
  const isAdmin = isAdminRole(user.Role);
  const isSelf = String(user.Username).toLowerCase() === String(currentUser.username || "").toLowerCase();
  const actorAdmin = isAdminRole(currentUser?.role);
  const canResetPin = can("CHANGE_USER_PASSWORD") && !isSelf;
  // Delete is Admin-only on the backend — DELETE_USER alone never succeeds for a Sub-Admin.
  const canDel = actorAdmin && can("DELETE_USER") && !isAdmin;
  const canManageTarget = isAdmin || can("EDIT_USER") || can("CHANGE_USER_ROLE") || can("MANAGE_USER_PERMISSIONS") || canResetPin;
  const active = (user.Status || "Active") === "Active";
  const walletCount = (user.WalletAccess || []).length;

  const openDetails = (e) => {
    if (e) e.stopPropagation();
    setDetailsOpen(true);
  };

  const closeDetails = () => setDetailsOpen(false);

  const row = (
    <div className="border-b border-gray-100 dark:border-gray-800 last:border-0 bg-white dark:bg-gray-900">
      <div className="py-2.5 px-1">
        <div className="flex justify-between items-center text-xs gap-2">
          <button type="button" onClick={openDetails} className="flex items-center gap-2 min-w-0 text-left flex-1">
            <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <i className="fa-solid fa-user text-xs"></i>
            </div>
            <div className="min-w-0">
              <div className="font-bold text-slate-800 dark:text-gray-100 truncate">{user.FullName || user.Username}</div>
              <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">@{user.Username}</div>
            </div>
          </button>
          <div className="flex items-center gap-1.5 shrink-0">
            <RoleBadge role={user.Role} />
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${active ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400" : "bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400"}`}>
              {user.Status || "Active"}
            </span>
            {canResetPin && (
              <button onClick={(e) => {
                e.stopPropagation();
                const newPin = window.prompt("নতুন PIN লিখুন (min 4 character):");
                if (!newPin || !newPin.trim()) return;
                api.resetPin(user.Username, newPin.trim(), currentUser.username).then((res) => {
                  showAlert(res.message, res.status === "ERROR" ? "error" : "success");
                }).catch(() => showAlert("নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।", "error"));
              }} title="Reset PIN" className="text-gray-400 dark:text-gray-500 hover:text-amber-500">
                <i className="fa-solid fa-key"></i>
              </button>
            )}
            <button onClick={openDetails} className="text-gray-400 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-200" title="Details">
              <i className="fa-solid fa-chevron-down"></i>
            </button>
          </div>
        </div>
        <button type="button" onClick={openDetails} className="mt-1.5 flex items-center gap-1.5 text-[10px] pl-10">
          <i className="fa-solid fa-wallet text-gray-300 dark:text-gray-600 text-[9px]"></i>
          {walletCount === 0 ? (
            <span className="text-amber-600 dark:text-amber-400 font-semibold">No Wallet Access</span>
          ) : (
            <span className="text-gray-500 dark:text-gray-400">Wallet Access: {walletCount} {walletCount === 1 ? "Wallet" : "Wallets"}</span>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <div>
      {(canManageTarget || canDel) ? (
        <SwipeCard onSwipeRight={canManageTarget ? () => setDetailsOpen(true) : undefined} onSwipeLeft={canDel ? async () => { const ok = await confirm({ message: "এই ইউজার মুছে ফেলবেন?" }); if (ok) onUserAction("delete", user.Username); } : undefined}>
          {row}
        </SwipeCard>
      ) : row}

      <Popup open={detailsOpen} title="User Details" onClose={closeDetails}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <i className="fa-solid fa-user"></i>
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-sm text-slate-800 dark:text-gray-100 truncate">{user.FullName || user.Username}</div>
            <div className="text-[11px] text-gray-400 dark:text-gray-500 truncate">@{user.Username}</div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <RoleBadge role={user.Role} />
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${active ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400" : "bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400"}`}>
              {user.Status || "Active"}
            </span>
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-gray-950 rounded-xl p-3 border border-gray-200 dark:border-gray-800 space-y-2">
          <div className="text-[11px] font-bold text-slate-700 dark:text-gray-200">
            <i className="fa-solid fa-wallet me-1.5 text-emerald-600 dark:text-emerald-400 text-[10px]"></i>Wallet Access
          </div>
          {walletCount === 0 ? (
            <div className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold">No Wallet Access</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {(user.WalletAccess || []).map((id) => {
                const w = (wallets || []).find((x) => String(x.WalletID) === String(id));
                return (
                  <span key={id} className="text-[10px] font-semibold bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-2 py-1 rounded-full text-slate-600 dark:text-gray-300">
                    {w ? `${w.WalletName} (${w.Currency})` : id}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-slate-50 dark:bg-gray-950 rounded-xl p-3 border border-gray-200 dark:border-gray-800 space-y-1.5">
          <div className="text-[11px] font-bold text-slate-700 dark:text-gray-200">
            <i className="fa-solid fa-list-check me-1.5 text-emerald-600 dark:text-emerald-400 text-[10px]"></i>Permissions
          </div>
          {(user.Permissions || []).length === 0 ? (
            <div className="text-[11px] text-gray-400 dark:text-gray-500">কোনো অতিরিক্ত Permission নেই (Default Wallet Actions স্বয়ংক্রিয়)।</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {(user.Permissions || []).map((p) => (
                <span key={p} className="text-[10px] font-semibold bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-2 py-1 rounded-full text-slate-600 dark:text-gray-300">
                  {PERMISSION_LABELS[p] || p}
                </span>
              ))}
            </div>
          )}
        </div>

        {canDel && (
          <button onClick={async () => {
            const ok = await confirm({ message: "এই ইউজার মুছে ফেলবেন?" });
            if (ok) { closeDetails(); onUserAction("delete", user.Username); }
          }} className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5">
            <i className="fa-solid fa-trash-can"></i> Delete User
          </button>
        )}

        {canManageTarget && (
          <ManageUserPanel user={user} wallets={wallets} currentUser={currentUser} can={can} onRefresh={onRefresh} showAlert={showAlert} onUserAction={onUserAction} onClose={closeDetails} />
        )}

        {!canManageTarget && !canDel && (
          <button onClick={closeDetails} className="w-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold py-2 rounded-xl text-xs">Close</button>
        )}
      </Popup>
    </div>
  );
});

// ---------- Add user form ----------

function AddUserForm({ wallets, currentUser, showAlert, onRefresh, onClose }) {
  const [fullName, setFullName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPin, setNewPin] = useState("");
  const [role, setRole] = useState("User");
  const [permissions, setPermissions] = useState([]);
  const [walletAccess, setWalletAccess] = useState([]);
  const [adding, setAdding] = useState(false);
  const actorAdmin = isAdminRole(currentUser?.role);
  const isAdminNew = isAdminRole(role);
  const hasWallet = walletAccess.length > 0;
  // Sub-Admin can only grant permissions they themselves hold — matching the
  // backend's escalation guard. Admins get the full list.
  const actorPerms = grantableFor(currentUser);

  const togglePerm = (p) => {
    if (!actorPerms.includes(p)) return;
    setPermissions((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  };
  const toggleWallet = (id) => setWalletAccess((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const resetForm = () => {
    setFullName(""); setNewUsername(""); setNewPin(""); setRole("User"); setPermissions([]); setWalletAccess([]);
  };

  const handleAddUser = (e) => {
    e.preventDefault();
    if (adding) return;
    if (!newUsername || !newPin) { showAlert("সকল তথ্য পূরণ করুন!", "error"); return; }
    setAdding(true);
    api.addUser(fullName, newUsername, newPin, role, permissions, walletAccess, currentUser.username).then((res) => {
      showAlert(res.message, res.status === "ERROR" ? "error" : "success");
      if (res.status !== "ERROR") { resetForm(); onRefresh(); onClose(); }
    }).catch(() => showAlert("নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।", "error")).finally(() => setAdding(false));
  };

  return (
    <form onSubmit={handleAddUser} className="space-y-3">
      <div className="bg-slate-50 dark:bg-gray-950 rounded-xl p-3 border border-gray-200 dark:border-gray-800 space-y-2">
        <div className="text-[11px] font-bold text-slate-700 dark:text-gray-200"><i className="fa-solid fa-id-card me-1.5 text-emerald-600 dark:text-emerald-400 text-[10px]"></i>1. Basic Information</div>
        <input type="text" placeholder="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs bg-white dark:bg-gray-900 dark:text-gray-100" />
        <input type="text" placeholder="Username" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs bg-white dark:bg-gray-900 dark:text-gray-100" required />
        <input type="password" placeholder="PIN (min 4 characters)" value={newPin} onChange={(e) => setNewPin(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs bg-white dark:bg-gray-900 dark:text-gray-100" required />
        <Select value={role} onChange={setRole}>
          <option value="User">User (সাধারণ ইউজার)</option>
          <option value="Sub-Admin">Sub-Admin</option>
          {actorAdmin && <option value="Admin">Admin</option>}
        </Select>
      </div>

        {!isAdminNew && (
          <>
            <div className="bg-slate-50 dark:bg-gray-950 rounded-xl p-3 border border-gray-200 dark:border-gray-800 space-y-2">
              <div className="text-[11px] font-bold text-slate-700 dark:text-gray-200"><i className="fa-solid fa-wallet me-1.5 text-emerald-600 dark:text-emerald-400 text-[10px]"></i>2. Wallet Access</div>
              <div className="text-[10px] text-gray-400 dark:text-gray-500">কোন ওয়ালেটে এই ইউজার এক্সেস পাবে তা নির্বাচন করুন। Permissions শুধু অ্যাক্সেসযোগ্য ওয়ালেটের ভেতরেই কাজ করে।</div>
              <WalletChecklist wallets={wallets} selected={walletAccess} onToggle={toggleWallet} />
              {!hasWallet && <NoWalletAccessNotice showInactiveNote={AnyAdditionalGranted({ selected: permissions })} />}
            </div>

            <div className="bg-slate-50 dark:bg-gray-950 rounded-xl p-3 border border-gray-200 dark:border-gray-800 space-y-2">
              <div className="text-[11px] font-bold text-slate-700 dark:text-gray-200"><i className="fa-solid fa-list-check me-1.5 text-emerald-600 dark:text-emerald-400 text-[10px]"></i>3. Default Wallet Permissions</div>
              <div className="text-[10px] text-gray-400 dark:text-gray-500">Wallet Access থাকলে এই অ্যাকশনগুলো স্বয়ংক্রিয়ভাবে সক্রিয় হয়।</div>
              <DefaultPermissionsList active={hasWallet} />
            </div>

            <div className="bg-slate-50 dark:bg-gray-950 rounded-xl p-3 border border-gray-200 dark:border-gray-800 space-y-2">
              <div className="text-[11px] font-bold text-slate-700 dark:text-gray-200"><i className="fa-solid fa-user-shield me-1.5 text-emerald-600 dark:text-emerald-400 text-[10px]"></i>4. Additional Permissions</div>
              <div className="text-[10px] text-gray-400 dark:text-gray-500">এই Permissions Admin কে স্পষ্টভাবে দিতে হয়। এগুলো ইউজারের অ্যাক্সেসযোগ্য সব ওয়ালেটে প্রযোজ্য।</div>
              {!hasWallet && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-2.5 text-[10px] text-amber-700 dark:text-amber-400 leading-snug">
                  <i className="fa-solid fa-triangle-exclamation me-1"></i>
                  Add Income ইত্যাদি Permission দেওয়া থাকলেও Wallet Access না থাকায় সেগুলো নিষ্ক্রিয় থাকবে।
                </div>
              )}
              {filterGroups(ADDITIONAL_GROUPS, actorPerms).map((g) => (
                <PermissionGroup key={g.title} group={g} selected={permissions} onToggle={togglePerm} />
              ))}
              <AdminOnlyNote />
            </div>
          </>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => { resetForm(); onClose(); }} className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold py-2 rounded-xl text-xs">Cancel</button>
          <button type="submit" disabled={adding} className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5">
            {adding && <i className="fa-solid fa-spinner fa-spin"></i>} {adding ? 'Creating...' : 'Create User'}
          </button>
        </div>
      </form>
  );
}

// ---------- Main view ----------

export default function UserManagementView({ users, wallets, onRefresh, showAlert, currentUser, onUserAction, can }) {
  const actorAdmin = isAdminRole(currentUser?.role);
  const [addOpen, setAddOpen] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold text-slate-800 dark:text-gray-100 text-base">User Access & Management (ইউজার ম্যানেজমেন্ট)</h3>
        {can("ADD_USER") && (
          <button onClick={() => setAddOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-2 rounded-xl flex items-center gap-1.5 shadow-sm shrink-0">
            <i className="fa-solid fa-user-plus"></i> Add User
          </button>
        )}
      </div>

      <Popup open={addOpen} title="Add User" onClose={() => setAddOpen(false)}>
        <AddUserForm wallets={wallets} currentUser={currentUser} showAlert={showAlert} onRefresh={onRefresh} onClose={() => setAddOpen(false)} />
      </Popup>

      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-200 dark:border-gray-800 shadow-2xs">
        <div className="text-xs font-bold text-slate-700 dark:text-gray-200 mb-1">ইউজার তালিকা <span className="text-[10px] text-gray-400 font-normal">({users.length})</span></div>
        {(can("DELETE_USER") && actorAdmin) || can("MANAGE_USER_PERMISSIONS") || can("EDIT_USER") ? (
          <div className="text-[10px] text-gray-400 dark:text-gray-500 mb-2 flex items-center gap-1">
            <i className="fa-solid fa-hand-pointer"></i> Swipe right to manage, left to delete
          </div>
        ) : null}
        {users.map((u, i) => (
          <UserRow key={u.Username || i} user={u} wallets={wallets} currentUser={currentUser} can={can} onRefresh={onRefresh} showAlert={showAlert} onUserAction={onUserAction} />
        ))}
      </div>
    </div>
  );
}