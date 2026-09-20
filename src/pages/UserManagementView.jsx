import { useState, memo } from "react";
import { api, GRANTABLE_PERMISSIONS, PERMISSION_LABELS } from "../api.js";
import Select from "../components/Select.jsx";
import SwipeCard from "../components/SwipeCard.jsx";

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

const UserRow = memo(function UserRow({ user, wallets, currentUser, can, onRefresh, showAlert, onUserAction }) {
  const [expanded, setExpanded] = useState(false);
  const [fullName, setFullName] = useState(user.FullName || '');
  const [role, setRole] = useState(user.Role);
  const [permissions, setPermissions] = useState(user.Permissions || []);
  const [walletAccess, setWalletAccess] = useState(user.WalletAccess || []);
  const isAdmin = user.Role === 'Admin';
  const canExpand = can('EDIT_USER') || can('CHANGE_USER_ROLE') || can('MANAGE_USER_PERMISSIONS');
  const canDel = can('DELETE_USER') && !isAdmin;
  const canResetPin = can('CHANGE_USER_PASSWORD') && String(user.Username).toLowerCase() !== String(currentUser.username || '').toLowerCase();

  const handleResetPin = () => {
    const newPin = window.prompt('নতুন PIN লিখুন (min 4 character):');
    if (!newPin || !newPin.trim()) return;
    api.resetPin(user.Username, newPin.trim(), currentUser.username).then((res) => {
      showAlert(res.message, res.status === 'ERROR' ? 'error' : 'success');
    }).catch(() => showAlert('নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।', 'error'));
  };

  const togglePerm = (p) => setPermissions(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  const toggleWallet = (id) => setWalletAccess(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const saveAll = () => {
    const roleChanged = can('CHANGE_USER_ROLE') && role !== user.Role;
    const nameChanged = can('EDIT_USER') && fullName !== (user.FullName || '');
    Promise.all([
      (roleChanged || nameChanged) ? api.updateUser(user.Username, fullName, roleChanged ? role : undefined, currentUser.username) : Promise.resolve({ status: 'SUCCESS' }),
      can('MANAGE_USER_PERMISSIONS') ? api.updateUserPermissions(user.Username, permissions, currentUser.username) : Promise.resolve({ status: 'SUCCESS' }),
      can('MANAGE_USER_PERMISSIONS') ? api.updateUserWalletAccess(user.Username, walletAccess, currentUser.username) : Promise.resolve({ status: 'SUCCESS' }),
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
          <button disabled={!can('EDIT_USER') || isAdmin}
            onClick={() => onUserAction('status', user.Username, (user.Status || 'Active') === 'Active' ? 'Inactive' : 'Active')}
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${(user.Status || 'Active') === 'Active' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400' : 'bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>
            {user.Status || 'Active'}
          </button>
          {canResetPin && (
            <button onClick={handleResetPin} title="Reset PIN" className="text-gray-400 dark:text-gray-500 hover:text-emerald-600">
              <i className="fa-solid fa-key"></i>
            </button>
          )}
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
          {can('EDIT_USER') && (
            <div>
              <div className="text-[11px] font-bold text-slate-600 dark:text-gray-300 mb-1.5">Full Name</div>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={user.Username} className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-900 dark:text-gray-100" />
            </div>
          )}
          {can('CHANGE_USER_ROLE') && (
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
            <CheckboxGrid options={GRANTABLE_PERMISSIONS} selected={permissions} onToggle={togglePerm} labelFn={(p) => PERMISSION_LABELS[p] || p} />
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
  const [permissions, setPermissions] = useState([]);
  const [walletAccess, setWalletAccess] = useState([]);

  const togglePerm = (p) => setPermissions(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  const toggleWallet = (id) => setWalletAccess(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleAddUser = (e) => {
    e.preventDefault();
    if (!newUsername || !newPin) return alert('সকল তথ্য পূরণ করুন!');
    api.addUser(fullName, newUsername, newPin, role, permissions, walletAccess, currentUser.username).then((res) => {
      showAlert(res.message, res.status === 'ERROR' ? 'error' : 'success');
      if (res.status !== 'ERROR') { setFullName(''); setNewUsername(''); setNewPin(''); setPermissions([]); setWalletAccess([]); onRefresh(); }
    });
  };

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-slate-800 dark:text-gray-100 text-base">User Access & Management (ইউজার ম্যানেজমেন্ট)</h3>

      {can('ADD_USER') ? (
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
                  <CheckboxGrid options={GRANTABLE_PERMISSIONS} selected={permissions} onToggle={togglePerm} labelFn={(p) => PERMISSION_LABELS[p] || p} />
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
        {can('DELETE_USER') && (
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
