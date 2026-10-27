import { useState, memo } from "react";
import { api, GRANTABLE_PERMISSIONS, PERMISSION_LABELS, DEFAULT_WALLET_ACTIONS, MIN_PIN_LENGTH, MAX_PIN_LENGTH, normalizePinInput } from "../api.js";
import Select from "../components/Select.jsx";
import Popup from "../components/Popup.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { Badge, Button, Card, Input, PageHeader } from "../ui/index.jsx";

// ---------- Role handling (friendly labels only, never raw DB keys) ----------

const ROLE_LABELS = { ADMIN: "Admin", SUB_ADMIN: "Sub-Admin", USER: "User" };

function normRole(role) {
  const key = String(role || "").toUpperCase().replace(/[- ]/g, "_").replace(/_+/g, "_");
  return ROLE_LABELS[key] || (String(role || "") ? String(role) : "User");
}

function isAdminRole(role) {
  return normRole(role) === "Admin";
}

const ROLE_TONE = {
  Admin: "success",
  "Sub-Admin": "info",
  User: "neutral",
};

function RoleBadge({ role }) {
  const label = normRole(role);
  return (
    <Badge tone={ROLE_TONE[label] || ROLE_TONE.User} className="text-[9px] tracking-wide">
      {label.toUpperCase()}
    </Badge>
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
  MANAGE_SHOP_LEDGER: "Create/edit/close shop ledgers",
  ADD_MARKET_RECORD: "Add shop market records",
  EDIT_MARKET_RECORD: "Edit shop market records",
  DELETE_MARKET_RECORD: "Delete shop market records",
  ADD_SHOP_PAYMENT: "Add shop credit payments",
  EDIT_SHOP_PAYMENT: "Edit shop credit payments",
  DELETE_SHOP_PAYMENT: "Delete shop credit payments",
  VIEW_SHOP_REPORTS: "View monthly shop ledger reports",
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
    title: "Shop Credit Ledger",
    bn: "বাকির খাতা",
    items: [
      "MANAGE_SHOP_LEDGER", "ADD_MARKET_RECORD", "EDIT_MARKET_RECORD",
      "DELETE_MARKET_RECORD", "ADD_SHOP_PAYMENT", "EDIT_SHOP_PAYMENT",
      "DELETE_SHOP_PAYMENT", "VIEW_SHOP_REPORTS",
    ],
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

function Panel({ icon, title, hint, children, className = "" }) {
  return (
    <div className={`card-inset p-3 space-y-2 ${className}`}>
      <div>
        <div className="text-[11px] font-bold text-ink flex items-center gap-1.5">
          {icon ? <i className={`fa-solid ${icon} text-[10px]`} style={{ color: "var(--ah-success)" }} /> : null}
          {title}
        </div>
        {hint ? <div className="text-[10px] text-ink-3 mt-0.5">{hint}</div> : null}
      </div>
      {children}
    </div>
  );
}

function NoWalletAccessNotice({ showInactiveNote }) {
  return (
    <div className="card-warning p-2.5">
      <div className="text-[11px] font-bold text-[var(--ah-warning)] flex items-center gap-1.5">
        <i className="fa-solid fa-triangle-exclamation"></i> No Wallet Access
      </div>
      <p className="text-[10px] text-[var(--ah-warning)] mt-0.5 leading-snug">
        এই ইউজারের কোন ওয়ালেটে অ্যাক্সেস নেই, তাই আর্থিক ডেটা ও Wallet অ্যাকশন ব্যবহার করা যাবে না — যতক্ষণ না Wallet Access দেওয়া হয়।
      </p>
      {showInactiveNote && (
        <p className="text-[10px] text-[var(--ah-warning)] mt-1 leading-snug">
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
          <div key={p} className="flex items-center gap-1.5 text-[11px] text-ink-2">
            <i className={`fa-solid fa-circle-check text-xs ${active ? "text-[var(--ah-success)]" : "text-ink-3 dark:text-ink-2"}`}></i>
            <span>{PERMISSION_LABELS[p] || p}</span>
          </div>
        ))}
      </div>
      <div className="text-[10px] text-ink-3 mt-1.5 flex items-center gap-1">
        <i className="fa-solid fa-lock"></i> Automatically enabled with Wallet Access — read-only, নিষ্ক্রিয় করা যাবে না
      </div>
    </div>
  );
}

// Edit / Manage / Delete, always on a single row. The number of columns is
// computed from how many of the three the viewer may actually use, so the
// buttons never wrap to a second line and never sit in a half-empty grid.
function ActionRow({ canEditUser, canManageTarget, canDel, onEdit, onManage, onDelete }) {
  const visible = [canEditUser && "edit", canManageTarget && "manage", canDel && "delete"].filter(Boolean);
  if (visible.length === 0) return null;
  const cols = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3" }[visible.length];

  return (
    <div className={`grid ${cols} gap-2`}>
      {canEditUser ? (
        <Button variant="secondary" icon="fa-pen" onClick={onEdit}>Edit</Button>
      ) : null}
      {canManageTarget ? (
        <Button variant="secondary" icon="fa-user-gear" onClick={onManage}>Manage</Button>
      ) : null}
      {canDel ? (
        <Button variant="danger" icon="fa-trash-can" onClick={onDelete}>Delete</Button>
      ) : null}
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
    <div className="bg-[var(--ah-success-soft)] border border-emerald-200 dark:border-[var(--ah-success-soft)] rounded-xl p-3 space-y-2">
      <div className="text-[11px] font-bold text-[var(--ah-success)]">
        <i className="fa-solid fa-shield-halved me-1.5"></i>Admin — Full System Access
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
        {items.map((it) => (
          <div key={it} className="flex items-center gap-1.5 text-[11px] text-[var(--ah-success)]">
            <i className="fa-solid fa-circle-check text-[10px] opacity-70"></i>{it}
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--ah-success)] leading-snug">
        Admin-এর পূর্ণ সিস্টেম এক্সেস। আলাদা করে Permission অ্যাসাইন করার প্রয়োজন নেই, তাই এখানে কোন permission checkbox দেখানো হয় না।
      </p>
    </div>
  );
}

function AdminOnlyNote() {
  return (
    <div className="bg-[var(--ah-surface)] border border-[var(--ah-border)] rounded-lg p-2.5">
      <div className="text-[10px] font-bold text-ink-3 flex items-center gap-1.5">
        <i className="fa-solid fa-lock text-[var(--ah-warning)]"></i> Admin Only
      </div>
      <p className="text-[10px] text-ink-3 mt-0.5 leading-snug">
        Role পরিবর্তন, Password/PIN পরিবর্তন এবং Admin তৈরি — শুধুমাত্র Admin এর কাজ। এগুলো checkbox হিসেবে দেওয়া হয় না, ফলে Sub-Admin নিজেকে কখনো Admin বানাতে পারবে না।
      </p>
    </div>
  );
}

function WalletChecklist({ wallets, selected, onToggle }) {
  if (!wallets.length) {
    return <div className="text-[11px] text-ink-3">কোনো Wallet নেই (আগে Wallet তৈরি করুন)।</div>;
  }
  return (
    <div className="space-y-1">
      {wallets.map((w) => {
        const checked = selected.includes(String(w.WalletID));
        return (
          <label key={w.WalletID} className="flex items-center gap-2 cursor-pointer select-none rounded-lg bg-[var(--ah-surface)] border border-[var(--ah-border)] px-2.5 py-2 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors">
            <input type="checkbox" checked={checked} onChange={() => onToggle(String(w.WalletID))} className="accent-[var(--ah-brand)]" />
            <span className="text-xs font-medium text-ink">
              {w.WalletName} <span className="text-[10px] text-ink-3">({w.Currency})</span>
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
      <input type="checkbox" checked={checked} onChange={() => onToggle(opt)} className="mt-0.5 accent-[var(--ah-brand)]" />
      <span className="min-w-0">
        <span className="block text-[11px] font-medium text-ink">{PERMISSION_LABELS[opt] || opt}</span>
        {sub && <span className="block text-[10px] text-ink-3">{sub}</span>}
      </span>
    </label>
  );
}

function PermissionGroup({ group, selected, onToggle }) {
  const [open, setOpen] = useState(false);
  const selectedCount = (group.items || []).filter((item) => selected.includes(itemKey(item))).length;
  return (
    <div className="bg-[var(--ah-surface)] border border-[var(--ah-border)] rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-2.5 py-2 text-left hover:bg-[var(--ah-surface-2)] dark:hover:bg-[var(--ah-surface-3)] transition-colors"
      >
        <span className="text-[11px] font-bold text-ink">
          {group.title} <span className="text-[10px] text-ink-3 font-normal">({group.bn})</span>
        </span>
        <span className="flex items-center gap-1.5">
          {selectedCount > 0 && (
            <span className="text-[9px] font-semibold bg-[var(--ah-success-soft)] text-[var(--ah-success)] px-1.5 py-0.5 rounded-full min-w-[16px] text-center">
              {selectedCount}
            </span>
          )}
          <i className={`fa-solid fa-chevron-${open ? "up" : "right"} text-[10px] text-ink-3 transition-transform`}></i>
        </span>
      </button>
      {open && (
        <div className="px-2.5 pb-2.5 pt-1.5 space-y-2 border-t border-[var(--ah-border)]">
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
            <div className="text-[10px] text-ink-3 leading-snug pt-1">
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

// section: "edit"   -> identity only (full name, role)
//          "manage" -> access & security (wallet access, permissions, PIN, status)
//
// The two are split so the common case (fix a typo in someone's name) does not
// require scrolling past the whole permissions editor, and so that "Save" in
// one section can never silently write changes belonging to the other. Each
// section only submits the fields it owns - see saveAll below.
const ManageUserPanel = memo(function ManageUserPanel({ user, wallets, currentUser, can, onRefresh, showAlert, onUserAction, onClose, section = "manage" }) {
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

  const hasWallet = walletAccess.length > 0;
  const actorAdmin = isAdminRole(currentUser?.role);
  const canEditName = can("EDIT_USER");
  const canEditRole = can("CHANGE_USER_ROLE") && actorAdmin;
  // Permissions/wallet-access panels are admin-manageable on self, but the
  // backend rejects a Sub-Admin editing their OWN perms/wallets — hide the
  // controls so they can't surface an error that can never succeed.
  const canManagePerms = can("MANAGE_USER_PERMISSIONS") && (actorAdmin || !isSelf);
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

  // Reset PIN and the status toggle used to live in this panel. Both now live on
  // the user card (the key icon and the status badge respectively), so the
  // handlers are gone from here and there is a single entry point for each.

  const saveAll = () => {
    if (saving) return;
    const storedAccess = targetAccess.filter((id) => knownIds.has(id));
    // Each change is gated on the section that owns it, so saving from the
    // Edit panel can never write permissions and vice versa. The permission
    // booleans are still checked on top: a user who cannot edit a field must
    // not have it submitted even if they somehow mutated the local state.
    const editing = section === "edit";
    const nameChanged = editing && canEditName && fullName !== (user.FullName || "");
    const roleChanged = editing && canEditRole && role !== normRole(user.Role);
    const permChanged = !editing && canManagePerms && !permLocked &&
      JSON.stringify([...permissions].sort()) !== JSON.stringify([...storedGrantables].sort());
    const walletChanged = !editing && canManagePerms && !walletLocked &&
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

  const isEditSection = section === "edit";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-bold text-ink">
          {isEditSection ? "Edit User" : "Manage User"} <span className="text-ink-3 font-normal">— {user.FullName || user.Username}</span>
        </div>
        {/* This closes the editor back to the details view, so it is a back
            arrow rather than an X - an X implies dismissing the whole modal. */}
        <Button variant="ghost" size="sm" icon="fa-arrow-left" onClick={onClose}>Back</Button>
      </div>

      {isEditSection ? (
        /* ---------- Edit: identity only ---------- */
        <>
        <Panel icon="fa-id-card" title="Basic Information" hint="নাম ও ভূমিকা">
          <div className="space-y-2">
            {canEditName ? (
              <div>
                <div className="text-[10px] font-bold text-ink-2 mb-1">Full Name</div>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={user.Username} />
              </div>
            ) : (
              <div>
                <div className="text-[10px] font-bold text-ink-3 mb-1">Full Name (read-only)</div>
                <div className="text-xs text-ink">{user.FullName || user.Username}</div>
              </div>
            )}
            <div>
              <div className="text-[10px] font-bold text-ink-2 mb-1">Username</div>
              <div className="text-xs text-ink">@{user.Username}</div>
            </div>
            {canEditRole ? (
              <div>
                <div className="text-[10px] font-bold text-ink-2 mb-1">Role <span className="text-[var(--ah-warning)]">(Admin Only)</span></div>
                <Select value={role} onChange={setRole}>
                  <option value="User">User</option>
                  <option value="Sub-Admin">Sub-Admin</option>
                  {actorAdmin && <option value="Admin">Admin</option>}
                </Select>
              </div>
            ) : (
                <div>
                  <div className="text-[10px] font-bold text-ink-3 mb-1">Role (read-only)</div>
                  <div className="flex items-center gap-1.5"><RoleBadge role={user.Role} /></div>
                </div>
              )}
            </div>
          </Panel>

          <Button block onClick={saveAll} disabled={saving}>
            {saving ? <><i className="fa-solid fa-spinner fa-spin" /> Saving...</> : 'Save Changes'}
          </Button>
        </>
      ) : isAdmin ? (
        <>
          <AdminFullAccessCard />
          <Panel icon="fa-circle-dot" title="Account Status">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <i className={`fa-solid fa-circle text-[9px] ${active ? "text-[var(--ah-success)]" : "text-ink-3"}`}></i>
                <span className={`text-xs font-bold ${active ? "text-[var(--ah-success)]" : "text-ink-3"}`}>{active ? "Active" : "Inactive"}</span>
              </div>
              <div className="text-[10px] text-ink-3">Admin-এর Status শুধু Admin পরিবর্তন করতে পারবে।</div>
            </div>
          </Panel>
        </>
      ) : (
        <>
          {canManagePerms && (
            <Panel icon="fa-wallet" title="Wallet Access" hint="কোন ওয়ালেটে ইউজার এক্সেস পাবে তা নির্বাচন করুন। Permissions শুধু অ্যাক্সেসযোগ্য ওয়ালেটের ভেতরেই কাজ করে।">
              {walletLocked && !actorAdmin ? (
                <div className="card-warning p-2.5 text-[10px] text-[var(--ah-warning)] leading-snug">
                  <i className="fa-solid fa-triangle-exclamation me-1"></i>
                  এই ইউজারের আরও Wallet Access আছে, কিন্তু সেগুলো আপনার বর্তমান Wallet তালিকার বাইরে ({" "}
                  {outOfScopeWallets.join(", ")} )। এখানে সম্পাদনা করলে সেগুলো হারাবে, তাই Wallet Access
                  এডিট বন্ধ আছে — আগে Admin এর সাথে যোগাযোগ করুন।
                </div>
              ) : (
                <>
                  <WalletChecklist wallets={wallets} selected={walletAccess} onToggle={toggleWallet} />
                  {otherAccess.length > 0 && (
                    <div className="text-[10px] text-ink-3">
                      এই ইউজারের আরও অ্যাক্সেস আছে, কিন্তু তা আপনার বর্তমান Wallet তালিকায় নেই:{" "}
                      {otherAccess.join(", ")}
                    </div>
                  )}
                  {!hasWallet && <NoWalletAccessNotice showInactiveNote={AnyAdditionalGranted({ selected: permissions })} />}
                  {hasWallet && (
                    <div className="text-[10px] text-ink-3 flex items-center gap-1">
                      <i className="fa-solid fa-circle-check text-[var(--ah-success)]"></i>
                      Wallet Access সক্রিয় → Default Wallet Actions + Additional Permissions প্রযোজ্য
                    </div>
                  )}
                </>
              )}
            </Panel>
          )}

          {canManagePerms && (
            <Panel icon="fa-user-shield" title="Additional Permissions" hint="এই Permissions Admin কে স্পষ্টভাবে দিতে হয়। এগুলো ইউজারের অ্যাক্সেসযোগ্য সব ওয়ালেটে প্রযোজ্য। Wallet Access থাকলে Default Wallet Actions স্বয়ংক্রিয়ভাবে প্রযোজ্য হয়।">
              {permLocked ? (
                <div className="card-warning p-2.5 text-[10px] text-[var(--ah-warning)] leading-snug">
                  <i className="fa-solid fa-triangle-exclamation me-1"></i>
                  এই ইউজারের কিছু Permission আপনার অনুমতির বাইরে, তাই Additional Permissions এডিট বন্ধ
                  আছে — আগে Admin এর সাথে যোগাযোগ করুন।
                </div>
              ) : (
                <>
                  {!hasWallet && (
                    <div className="card-warning p-2.5 text-[10px] text-[var(--ah-warning)] leading-snug">
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
            </Panel>
          )}

          {/* Security (Reset PIN) and Account Status used to live here. Both are
              now on the user card itself: the key icon resets the PIN and the
              status badge toggles Active/Inactive. Keeping them in one place
              avoids two entry points for the same action. */}

          <Button block onClick={saveAll} disabled={saving}>
            {saving ? <><i className="fa-solid fa-spinner fa-spin" /> Saving...</> : isEditSection ? 'Save Changes' : 'Save Access & Permissions'}
          </Button>
        </>
      )}
    </div>
  );
});

// ---------- User list row ----------

const UserRow = memo(function UserRow({ user, wallets, currentUser, can, onRefresh, showAlert, onUserAction }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Edit and Manage open as separate views; only one popup is visible at a time.
  const [editorOpen, setEditorOpen] = useState(null);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [savingPin, setSavingPin] = useState(false);
  const confirm = useConfirm();
  const isAdmin = isAdminRole(user.Role);
  const isSelf = String(user.Username).toLowerCase() === String(currentUser.username || "").toLowerCase();
  const actorAdmin = isAdminRole(currentUser?.role);
  const canResetPin = can("CHANGE_USER_PASSWORD") && !isSelf;
  // Delete is Admin-only on the backend — DELETE_USER alone never succeeds for a Sub-Admin.
  const canDel = actorAdmin && can("DELETE_USER") && !isAdmin;
  const canManageTarget = isAdmin || can("EDIT_USER") || can("CHANGE_USER_ROLE") || can("MANAGE_USER_PERMISSIONS") || canResetPin;
  // The Edit button only appears for identity changes the viewer can actually
  // make: EDIT_USER for the name, CHANGE_USER_ROLE for the role, and Admin-only
  // on either field. canManageTarget is broader than that (it also covers
  // permissions and PIN), so it cannot stand in for this check.
  const canEditUser = (actorAdmin && (can("EDIT_USER") || can("CHANGE_USER_ROLE"))) || can("EDIT_USER");
  const active = (user.Status || "Active") === "Active";
  const walletCount = (user.WalletAccess || []).length;

  const openDetails = (e) => {
    if (e) e.stopPropagation();
    setDetailsOpen(true);
  };

  const closeDetails = () => {
    setDetailsOpen(false);
    setEditorOpen(null);
  };

  const openEditor = (section) => setEditorOpen(section);
  const closeEditor = () => setEditorOpen(null);
  const closePinDialog = () => {
    if (savingPin) return;
    setPinDialogOpen(false);
    setNewPin("");
  };

  const handleResetPin = async (event) => {
    event.preventDefault();
    if (savingPin) return;
    const normalized = normalizePinInput(newPin);
    if (normalized === null) {
      showAlert("PIN অবৈধ। " + MIN_PIN_LENGTH + "-" + MAX_PIN_LENGTH + " অক্ষরের হতে হবে।", "error");
      return;
    }

    setSavingPin(true);
    try {
      const res = await api.resetPin(user.Username, normalized, currentUser.username);
      showAlert(res.message, res.status === "ERROR" ? "error" : "success");
      if (res.status !== "ERROR") {
        setPinDialogOpen(false);
        setNewPin("");
      }
    } catch {
      showAlert("নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।", "error");
    } finally {
      setSavingPin(false);
    }
  };

  // Each user is its own bordered card with a gap to the next one, so the list
  // reads as separate items rather than divider-separated rows inside one
  // continuous block.
  const row = (
    <Card className="p-2.5">
      <div>
        <div className="flex justify-between items-center text-xs gap-2">
          <button type="button" onClick={openDetails} className="flex items-center gap-2 min-w-0 text-left flex-1">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "var(--ah-success-soft)", color: "var(--ah-success)" }}
            >
              <i className="fa-solid fa-user text-xs" />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-ink truncate">{user.FullName || user.Username}</div>
              <div className="text-[10px] text-ink-3 truncate">@{user.Username}</div>
            </div>
          </button>
          <div className="flex items-center gap-1.5 shrink-0">
            <RoleBadge role={user.Role} />
            {/* Status is the toggle entry point, replacing the Account Status
                card that used to live in the Manage popup. Gated on the same
                Admin-only rule the backend enforces for status changes. */}
            {actorAdmin && can("EDIT_USER") ? (
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  const next = active ? "Inactive" : "Active";
                  const msg = next === "Inactive"
                    ? `${user.FullName || user.Username} নিষ্ক্রিয় করবেন?\n\nইউজার লগইন করতে পারবে না, তবে তার লেনদেন ও ইতিহাস অক্ষত থাকবে।`
                    : `${user.FullName || user.Username} আবার সক্রিয় করবেন?`;
                  const ok = await confirm({ message: msg, confirmLabel: next === "Inactive" ? "হ্যাঁ, নিষ্ক্রিয় করুন" : "হ্যাঁ, সক্রিয় করুন" });
                  if (!ok) return;
                  onUserAction("status", user.Username, next);
                }}
                title={active ? "নিষ্ক্রিয় করতে ক্লিক করুন" : "সক্রিয় করতে ক্লিক করুন"}
                aria-label={active ? "নিষ্ক্রিয় করুন" : "সক্রিয় করুন"}
                className="px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors"
                style={active
                  ? { background: "var(--ah-success-soft)", color: "var(--ah-success)", borderColor: "transparent" }
                  : { background: "var(--ah-surface-3)", color: "var(--ah-text-2)", borderColor: "var(--ah-border)" }}
              >
                {user.Status || "Active"}
              </button>
            ) : (
              <Badge tone={active ? "success" : "neutral"}>{user.Status || "Active"}</Badge>
            )}
          </div>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <button type="button" onClick={openDetails} className="flex items-center gap-1.5 text-[10px] pl-10 min-w-0 text-left">
            <i className="fa-solid fa-wallet text-ink-3 dark:text-ink-2 text-[9px]"></i>
            {/* Admins reach every wallet by role, so their stored WalletAccess is
                usually empty - showing "No Wallet Access" in amber would be a lie. */}
            {isAdmin ? (
              <span className="text-[var(--ah-success)] font-semibold">All Wallets — Full System Access</span>
            ) : walletCount === 0 ? (
              <span className="text-[var(--ah-warning)] font-semibold">No Wallet Access</span>
            ) : (
              <span className="text-ink-3">Wallet Access: {walletCount} {walletCount === 1 ? "Wallet" : "Wallets"}</span>
            )}
          </button>
          {/* Reset PIN sits on this second line rather than stacked under the
              status pill. A three-line right column against a two-line name
              made the row taller than needed and pushed the role badge up. */}
          {canResetPin && (
            <button onClick={(e) => {
              e.stopPropagation();
              setPinDialogOpen(true);
            }} title="Reset PIN" aria-label="Reset PIN" className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold transition-colors flex items-center gap-1" style={{ background: "var(--ah-warning-soft)", color: "var(--ah-warning)" }}>
              <i className="fa-solid fa-key text-[9px]" /> PIN
            </button>
          )}
        </div>
      </div>
    </Card>
  );

  return (
    <div>
      {row}

      <Popup
        open={detailsOpen && !editorOpen}
        title="User Details"
        onClose={closeDetails}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "var(--ah-success-soft)", color: "var(--ah-success)" }}
          >
            <i className="fa-solid fa-user" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-sm text-ink truncate">{user.FullName || user.Username}</div>
            <div className="text-[11px] text-ink-3 truncate">@{user.Username}</div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <RoleBadge role={user.Role} />
            <Badge tone={active ? "success" : "neutral"}>{user.Status || "Active"}</Badge>
          </div>
        </div>

        {/* An Admin's stored WalletAccess/Permissions are ignored - the backend
            grants full system access by role (see isAdminRecord_ in Database.gs).
            Listing the stored values would be misleading: it would look like the
            Admin is restricted to those wallets when they can reach every one.
            So Admins get the single summary line instead, matching the Manage
            panel. Everyone else sees their real, scoped values. */}
        {isAdmin ? (
          <AdminFullAccessCard />
        ) : (
          <>
            <div className="card-inset p-3 space-y-2">
              <div className="text-[11px] font-bold text-ink">
                <i className="fa-solid fa-wallet me-1.5 text-[var(--ah-success)] text-[10px]"></i>Wallet Access
              </div>
              {walletCount === 0 ? (
                <div className="text-[11px] text-[var(--ah-warning)] font-semibold">No Wallet Access</div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {(user.WalletAccess || []).map((id) => {
                    const w = (wallets || []).find((x) => String(x.WalletID) === String(id));
                    return (
                      <span key={id} className="text-[10px] font-semibold bg-[var(--ah-surface)] border border-[var(--ah-border)] px-2 py-1 rounded-full text-ink-2">
                        {w ? `${w.WalletName} (${w.Currency})` : id}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="card-inset p-3 space-y-1.5">
              <div className="text-[11px] font-bold text-ink">
                <i className="fa-solid fa-list-check me-1.5 text-[var(--ah-success)] text-[10px]"></i>Permissions
              </div>
              {(user.Permissions || []).length === 0 ? (
                <div className="text-[11px] text-ink-3">কোনো অতিরিক্ত Permission নেই (Default Wallet Actions স্বয়ংক্রিয়)।</div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {(user.Permissions || []).map((p) => (
                    <span key={p} className="text-[10px] font-semibold bg-[var(--ah-surface)] border border-[var(--ah-border)] px-2 py-1 rounded-full text-ink-2">
                      {PERMISSION_LABELS[p] || p}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Edit / Manage / Delete as one row. Only the actions the viewer is
            actually allowed to perform are rendered, so an unauthorised viewer
            never sees a control that would only fail server-side. The column
            count is derived from how many buttons actually render - a fixed
            grid-cols-2 pushed Delete onto a second line once all three were
            present. Delete stays the destructive outlier on the right. */}
        <ActionRow
          canEditUser={canEditUser}
          canManageTarget={canManageTarget}
          canDel={canDel}
          onEdit={() => openEditor("edit")}
          onManage={() => openEditor("manage")}
          onDelete={async () => {
            // Deletion is refused by the backend while the user still has
            // financial history, so say up front that deactivation is the way
            // to keep the records (and who made them) intact.
            const ok = await confirm({ message: "এই ইউজার মুছে ফেলবেন?\n\nআর্থিক ইতিহাস থাকলে মুছে ফেলা যাবে না — সেক্ষেত্রে Deactivate করুন, ইতিহাস অক্ষত থাকবে।" });
            if (ok) { closeDetails(); onUserAction("delete", user.Username); }
          }}
        />

        {!canManageTarget && !canDel ? (
          <Button variant="secondary" block onClick={closeDetails}>Close</Button>
        ) : null}
      </Popup>

      <Popup
        open={!!editorOpen}
        title={editorOpen === "edit" ? "Edit User" : "Manage User"}
        onClose={closeEditor}
      >
        <ManageUserPanel
          user={user}
          wallets={wallets}
          currentUser={currentUser}
          can={can}
          onRefresh={onRefresh}
          showAlert={showAlert}
          onUserAction={onUserAction}
          onClose={closeEditor}
          section={editorOpen}
        />
      </Popup>

      <Popup
        open={pinDialogOpen}
        title={`Reset PIN — ${user.FullName || user.Username}`}
        onClose={closePinDialog}
      >
        <form onSubmit={handleResetPin} className="space-y-3">
          <div className="text-xs text-ink-2">
            নতুন PIN লিখুন ({MIN_PIN_LENGTH}-{MAX_PIN_LENGTH} অক্ষর)।
          </div>
          <Input
            type="password"
            value={newPin}
            onChange={(event) => setNewPin(event.target.value)}
            placeholder={`নতুন PIN (${MIN_PIN_LENGTH}-${MAX_PIN_LENGTH} অক্ষর)`}
            minLength={MIN_PIN_LENGTH}
            maxLength={MAX_PIN_LENGTH}
            autoComplete="new-password"
            autoFocus
            required
            disabled={savingPin}
          />
          <div className="flex gap-2">
            <Button type="button" variant="secondary" block onClick={closePinDialog} disabled={savingPin}>
              বাতিল
            </Button>
            <Button type="submit" block disabled={savingPin}>
              {savingPin ? <><i className="fa-solid fa-spinner fa-spin" /> সংরক্ষণ হচ্ছে...</> : "PIN পরিবর্তন"}
            </Button>
          </div>
        </form>
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
    const normalizedPin = normalizePinInput(newPin);
    if (normalizedPin === null) { showAlert("PIN অবৈধ। " + MIN_PIN_LENGTH + "-" + MAX_PIN_LENGTH + " অক্ষরের হতে হবে।", "error"); return; }
    setAdding(true);
    api.addUser(fullName, newUsername, normalizedPin, role, permissions, walletAccess, currentUser.username).then((res) => {
      showAlert(res.message, res.status === "ERROR" ? "error" : "success");
      if (res.status !== "ERROR") { resetForm(); onRefresh(); onClose(); }
    }).catch(() => showAlert("নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।", "error")).finally(() => setAdding(false));
  };

  return (
    <form onSubmit={handleAddUser} className="space-y-3">
      <div className="card-inset p-3 space-y-2">
        <div className="text-[11px] font-bold text-ink"><i className="fa-solid fa-id-card me-1.5 text-[10px]" style={{ color: "var(--ah-success)" }} />1. Basic Information</div>
        <Input type="text" placeholder="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <Input type="text" placeholder="Username" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} required />
        <Input type="password" placeholder={"PIN (min " + MIN_PIN_LENGTH + ", max " + MAX_PIN_LENGTH + " characters)"} value={newPin} onChange={(e) => setNewPin(e.target.value)} required />
        <Select value={role} onChange={setRole}>
          <option value="User">User (সাধারণ ইউজার)</option>
          <option value="Sub-Admin">Sub-Admin</option>
          {actorAdmin && <option value="Admin">Admin</option>}
        </Select>
      </div>

        {!isAdminNew && (
          <>
            <div className="card-inset p-3 space-y-2">
              <div className="text-[11px] font-bold text-ink"><i className="fa-solid fa-wallet me-1.5 text-[var(--ah-success)] text-[10px]"></i>2. Wallet Access</div>
              <div className="text-[10px] text-ink-3">কোন ওয়ালেটে এই ইউজার এক্সেস পাবে তা নির্বাচন করুন। Permissions শুধু অ্যাক্সেসযোগ্য ওয়ালেটের ভেতরেই কাজ করে।</div>
              <WalletChecklist wallets={wallets} selected={walletAccess} onToggle={toggleWallet} />
              {!hasWallet && <NoWalletAccessNotice showInactiveNote={AnyAdditionalGranted({ selected: permissions })} />}
            </div>

            <div className="card-inset p-3 space-y-2">
              <div className="text-[11px] font-bold text-ink"><i className="fa-solid fa-list-check me-1.5 text-[var(--ah-success)] text-[10px]"></i>3. Default Wallet Permissions</div>
              <div className="text-[10px] text-ink-3">Wallet Access থাকলে এই অ্যাকশনগুলো স্বয়ংক্রিয়ভাবে সক্রিয় হয়।</div>
              <DefaultPermissionsList active={hasWallet} />
            </div>

            <div className="card-inset p-3 space-y-2">
              <div className="text-[11px] font-bold text-ink"><i className="fa-solid fa-user-shield me-1.5 text-[var(--ah-success)] text-[10px]"></i>4. Additional Permissions</div>
              <div className="text-[10px] text-ink-3">এই Permissions Admin কে স্পষ্টভাবে দিতে হয়। এগুলো ইউজারের অ্যাক্সেসযোগ্য সব ওয়ালেটে প্রযোজ্য।</div>
              {!hasWallet && (
                <div className="card-warning p-2.5 text-[10px] text-[var(--ah-warning)] leading-snug">
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
          <Button type="button" variant="secondary" onClick={() => { resetForm(); onClose(); }}>Cancel</Button>
          <Button type="submit" disabled={adding}>
            {adding ? <><i className="fa-solid fa-spinner fa-spin" /> Creating...</> : 'Create User'}
          </Button>
        </div>
      </form>
  );
}

// ---------- Main view ----------

export default function UserManagementView({ users, wallets, onRefresh, showAlert, currentUser, onUserAction, can }) {
  const [addOpen, setAddOpen] = useState(false);
  return (
    <div className="space-y-4">
      <PageHeader
        title="User Access & Management"
        subtitle="ইউজার ম্যানেজমেন্ট, ওয়ালেট অ্যাক্সেস ও পারমিশন"
        icon="fa-user-gear"
        right={
          can("ADD_USER") ? (
            <Button size="sm" icon="fa-user-plus" onClick={() => setAddOpen(true)}>Add User</Button>
          ) : null
        }
      />

      <Popup open={addOpen} title="Add User" onClose={() => setAddOpen(false)}>
        <AddUserForm wallets={wallets} currentUser={currentUser} showAlert={showAlert} onRefresh={onRefresh} onClose={() => setAddOpen(false)} />
      </Popup>

      <div>
        <div className="section-title mb-2">
          ইউজার তালিকা <span className="text-[10px] text-ink-3 font-normal">({users.length})</span>
        </div>
        {/* space-y separates the per-user cards, so each row supplies its own
            border rather than relying on a divider inside a shared container. */}
        <div className="space-y-2">
          {users.map((u, i) => (
            <UserRow key={u.Username || i} user={u} wallets={wallets} currentUser={currentUser} can={can} onRefresh={onRefresh} showAlert={showAlert} onUserAction={onUserAction} />
          ))}
        </div>
      </div>
    </div>
  );
}
