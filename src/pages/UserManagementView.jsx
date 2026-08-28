import { useState } from "react";
import { api } from "../api.js";

export default function UserManagementView({ users, onRefresh, showAlert, currentUser, onUserAction }) {
  const [newUsername, setNewUsername] = useState('');
  const [newPin, setNewPin] = useState('');
  const [role, setRole] = useState('User');

  const handleAddUser = (e) => {
    e.preventDefault();
    if (!newUsername || !newPin) return alert('সকল তথ্য পূরণ করুন!');
    api.addUser(newUsername, newPin, role, currentUser.username).then((res) => {
      showAlert(res.message);
      setNewUsername('');
      setNewPin('');
      onRefresh();
    });
  };

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-slate-800 text-base">User Access & Management (ইউজার ম্যানেজমেন্ট)</h3>

      {currentUser.role === 'Admin' ? <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-2xs space-y-3">
        <div className="text-xs font-bold text-slate-700">নতুন ইউজার যোগ করুন</div>
        <form onSubmit={handleAddUser} className="space-y-3">
          <input type="text" placeholder="Username" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs" required />
          <input type="password" placeholder="PIN (4 Digits)" value={newPin} onChange={(e) => setNewPin(e.target.value)} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs" required />
          <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs bg-white">
            <option value="User">User (ফ্যামিলি সদস্য)</option>
            <option value="Admin">Admin (এডমিন)</option>
          </select>
          <button type="submit" className="w-full bg-slate-800 text-white font-bold py-2 rounded-xl text-xs">
            + Add User
          </button>
        </form>
      </div> : <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">শুধুমাত্র Admin ইউজার ম্যানেজ করতে পারবেন।</div>}

      <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-2xs space-y-2">
        <div className="text-xs font-bold text-slate-700 mb-2">ইউজার তালিকা</div>
        {users.map((u, i) => (
          <div key={i} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0 text-xs">
            <div>
              <div className="font-bold text-slate-800">{u.Username}</div>
              <div className="text-[10px] text-gray-400">{u.Role} • PIN: ****</div>
            </div>
            <div className="flex items-center gap-1.5"><button disabled={currentUser.role !== 'Admin' || u.Role === 'Admin'} onClick={() => onUserAction('status', u.Username, (u.Status || 'Active') === 'Active' ? 'Inactive' : 'Active')} className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${(u.Status || 'Active') === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>{u.Status || 'Active'}</button>{currentUser.role === 'Admin' && u.Role !== 'Admin' ? <button onClick={() => { if (confirm('এই ইউজার মুছে ফেলবেন?')) onUserAction('delete', u.Username); }} className="text-gray-300 hover:text-red-500" title="Delete user"><i className="fa-solid fa-trash-can"></i></button> : null}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
