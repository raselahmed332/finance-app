import { useState, memo, useRef } from "react";
import { api, ALL_PERMISSIONS, PERMISSION_LABELS } from "../api.js";
import Select from "../components/Select.jsx";

const CheckboxGrid = memo(function CheckboxGrid({ options, selected, onToggle, labelFn }) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {options.map(opt => (
        <label key={opt} className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800 rounded-lg px-2 py-1.5 text-[11px] text-slate-700 dark:text-gray-200">
          <input type="checkbox" checked={selected.includes(opt)} onChange={() => onToggle(opt)} className="accent-emerald-600" />
          {labelFn ? labelFn(opt) : opt}
        </label>
      ))}
    </div>
  );
});

function SwipeCard({ children, onSwipeLeft, onSwipeRight, swipeLeftLabel, swipeRightLabel }) {
  const ref = useRef(null);
  const startX = useRef(0);
  const currentX = useRef(0);
  const [offset, setOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);

  const handleTouchStart = (e) => { startX.current = e.touches[0].clientX; currentX.current = 0; setSwiping(true); };
  const handleTouchMove = (e) => { if (!swiping) return; currentX.current = e.touches[0].clientX - startX.current; setOffset(currentX.current); };
  const handleTouchEnd = () => { setSwiping(false); if (currentX.current < -80 && onSwipeLeft) onSwipeLeft(); else if (currentX.current > 80 && onSwipeRight) onSwipeRight(); setOffset(0); };

  return (
    <div className="relative overflow-hidden rounded-xl">
      <div className="absolute inset-0 flex">
        <div className="w-1/2 bg-blue-500 flex items-center justify-end pr-4 text-white text-xs font-semibold">
          <i className="fa-solid fa-pen me-1"></i> {swipeRightLabel || "Edit"}
        </div>
        <div className="w-1/2 bg-red-500 flex items-center justify-start pl-4 text-white text-xs font-semibold">
          {swipeLeftLabel || "Delete"} <i className="fa-solid fa-trash-can ms-1"></i>
        </div>
      </div>
      <div ref={ref} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
        style={{ transform: `translateX(${offset}px)`, transition: swiping ? "none" : "transform 0.2s ease" }} className="relative">
        {children}
      </div>
    </div>
  );
}

const UserRow = memo(function UserRow({ user, wallets, currentUser, can, onRefresh, showAlert, onUserAction }) {
  const [expanded, setExpanded] = useState(false);
  const [fullName, setFullName] = useState(user.FullName || '');
  const [role, setRole] = useState(user.Role);
  const [permissions, setPermissions] = useState(user.Permissions || []);
  const [walletAccess, setWalletAccess] = useState(user.WalletAccess || []);
  const isAdmin = user.Role === 'Admin';
  const canExpand = can('edit_user') || can('change_user_role') || can('manage_user_permissions') || can('manage_user_wallet_access');
  const canDel = can('delete_user') && !isAdmin;

  const togglePerm = (p) => setPermissions(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  const toggleWallet = (id) => setWalletAccess(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const saveAll = () => {
    const roleChanged = can('change_user_role') && role !== user.Role;
    const nameChanged = can('edit_user') && fullName !== (user.FullName || '');
    Promise.all([
      (roleChanged || nameChanged) ? api.updateUser(user.Username, fullName, roleChanged ? role : undefined, currentUser.username) : Promise.resolve({ status: 'SUCCESS' }),
      can('manage_user_permissions') ? api.updateUserPermissions(user.Username, permissions, currentUser.username) : Promise.resolve({ status: 'SUCCESS' }),
      can('manage_user_wallet_access') ? api.updateUserWalletAccess(user.Username, walletAccess, currentUser.username) : Promise.resolve({ status: 'SUCCESS' }),
    ]).then(([r0, r1, r2]) => {
      const results = [r0, r1, r2];
      const failedResult = results.find(r => r.status === 'ERROR');
      showAlert(failedResult ? failedResult.message : (results.map(r => r.message).find(Boolean) || 'আপডেট হয়েছে!'), failedResult ? 'error' : 'success');
      if (!failedResult) { onRefresh(); setExpanded(false); }
    });
  };

  const row = (
    <div className="border-b border-gray-100 dark:border-gray-800 last:border-0 bg-white dark:bg-gray-900">
      <div className="flex justify-between items-center py-2.5 text-xs px-1">
        <div>
          <div className="font-bold text-slate-800 dark:text-gray-100">{user.FullName || user.Username}</div>
          <div className="text-[10px] text-gray-400 dark:text-gray-500">@{user.Username} • {user.Role}</div>
        </div>
        <div className="flex items-center gap-2">
          <button disabled={!can('edit_user') || isAdmin}
            onClick={() => onUserAction('status', user.Username, (user.Status || 'Active') === 'Active' ? 'Inactive' : 'Active')}
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${(user.Status || 'Active') === 'Active' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400' : 'bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>
            {user.Status || 'Active'}
          </button>
          {!isAdmin && canExpand && <button onClick={() => setExpanded(!expanded)} className="text-gray-400 dark:text-gray-500 hover:text-slate-700"><i className={`fa-solid fa-chevron-${expanded ? 'up' : 'down'}`}></i></button>}
        </div>
      </div>
    </div>
  );

  return (
    <div>
      {!isAdmin && (canExpand || canDel) ? (
        <SwipeCard onSwipeRight={canExpand ? () => setExpanded(true) : undefined} onSwipeLeft={canDel ? () => { if (confirm('এই ইউজার মুছে ফেলবেন?')) onUserAction('delete', user.Username); } : undefined}>
          {row}
        </SwipeCard>
      ) : row}

      {expanded && !isAdmin && (
        <div className="bg-slate-50 dark:bg-gray-950 rounded-xl p-3 mb-3 space-y-3 border border-gray-200 dark:border-gray-800">
          {can('edit_user') && (
            <div>
              <div className="text-[11px] font-bold text-slate-600 dark:text-gray-300 mb-1.5">Full Name</div>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={user.Username} className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-900 dark:text-gray-100" />
            </div>
          )}
          {can('change_user_role') && (
            <div>
              <div className="text-[11px] font-bold text-slate-600 dark:text-gray-300 mb-1.5">Role</div>
              <Select value={role} onChange={setRole}>
                <option value="User">User</option>
                <option value="Sub-Admin">Sub-Admin</option>
              </Select>
            </div>
          )}
          <div>
            <div className="text-[11px] font-bold text-slate-600 dark:text-gray-300 mb-1.5">Permissions</div>
            <CheckboxGrid options={ALL_PERMISSIONS} selected={permissions} onToggle={togglePerm} labelFn={(p) => PERMISSION_LABELS[p] || p} />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-600 dark:text-gray-300 mb-1.5">Wallet Access</div>
            <CheckboxGrid options={wallets.map(w => w.WalletID)} selected={walletAccess} onToggle={toggleWallet} labelFn={(id) => { const w = wallets.find(x => x.WalletID === id); return w ? `${w.WalletName} (${w.Currency})` : id; }} />
          </div>
          <button onClick={saveAll} className="w-full bg-slate-800 text-white font-bold py-2 rounded-xl text-xs">Save Changes</button>
        </div>
      )}
    </div>
  );
});

export default function UserManagementView({ users, wallets, onRefresh, showAlert, currentUser, onUserAction, can }) {
  const [fullName, setFullName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPin, setNewPin] = useState('');
  const [role, setRole] = useState('User');
  const [permissions, setPermissions] = useState(['view_dashboard', 'view_transactions']);
  const [walletAccess, setWalletAccess] = useState([]);

  const togglePerm = (p) => setPermissions(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  const toggleWallet = (id) => setWalletAccess(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleAddUser = (e) => {
    e.preventDefault();
    if (!newUsername || !newPin) return alert('সকল তথ্য পূরণ করুন!');
    api.addUser(fullName, newUsername, newPin, role, permissions, walletAccess, currentUser.username).then((res) => {
      showAlert(res.message, res.status === 'ERROR' ? 'error' : 'success');
      if (res.status !== 'ERROR') { setFullName(''); setNewUsername(''); setNewPin(''); setPermissions(['view_dashboard', 'view_transactions']); setWalletAccess([]); onRefresh(); }
    });
  };

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-slate-800 dark:text-gray-100 text-base">User Access & Management (ইউজার ম্যানেজমেন্ট)</h3>

      {can('add_user') ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-200 dark:border-gray-800 shadow-2xs space-y-3">
          <div className="text-xs font-bold text-slate-700 dark:text-gray-200">নতুন ইউজার যোগ করুন</div>
          <form onSubmit={handleAddUser} className="space-y-3">
            <input type="text" placeholder="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs bg-white dark:bg-gray-900 dark:text-gray-100" />
            <input type="text" placeholder="Username" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs bg-white dark:bg-gray-900 dark:text-gray-100" required />
            <input type="password" placeholder="PIN (4 Digits)" value={newPin} onChange={(e) => setNewPin(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs bg-white dark:bg-gray-900 dark:text-gray-100" required />
            <Select value={role} onChange={setRole}>
              <option value="User">User (সাধারণ ইউজার)</option>
              <option value="Sub-Admin">Sub-Admin</option>
              {currentUser?.role === 'Admin' && <option value="Admin">Admin</option>}
            </Select>
            {role !== 'Admin' && (
              <>
                <div>
                  <div className="text-[11px] font-bold text-slate-600 dark:text-gray-300 mb-1.5">Permissions</div>
                  <CheckboxGrid options={ALL_PERMISSIONS} selected={permissions} onToggle={togglePerm} labelFn={(p) => PERMISSION_LABELS[p] || p} />
                </div>
                <div>
                  <div className="text-[11px] font-bold text-slate-600 dark:text-gray-300 mb-1.5">Wallet Access</div>
                  <CheckboxGrid options={wallets.map(w => w.WalletID)} selected={walletAccess} onToggle={toggleWallet} labelFn={(id) => { const w = wallets.find(x => x.WalletID === id); return w ? `${w.WalletName} (${w.Currency})` : id; }} />
                </div>
              </>
            )}
            <button type="submit" className="w-full bg-slate-800 text-white font-bold py-2 rounded-xl text-xs">+ Add User</button>
          </form>
        </div>
      ) : (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-xs text-amber-800 dark:text-amber-300">ইউজার যোগ করার অনুমতি আপনার নেই।</div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-200 dark:border-gray-800 shadow-2xs">
        <div className="text-xs font-bold text-slate-700 dark:text-gray-200 mb-1">ইউজার তালিকা</div>
        {can('delete_user') && (
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
