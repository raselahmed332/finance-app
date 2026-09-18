import { useState, useEffect } from "react";
import { api } from "../api.js";
import Select from "../components/Select.jsx";
import { todayStr } from "../utils/loan.js";
import SwipeCard from "../components/SwipeCard.jsx";

function CategoriesManager({ currentUser, can, showAlert }) {
  const [categories, setCategories] = useState(null);
  const [name, setName] = useState('');
  const [type, setType] = useState('Expense');

  const load = () => {
    api.getCategories(currentUser.username).then((res) => {
      if (res.status === 'SUCCESS') setCategories(res.categories);
    });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAdd = (e) => {
    e.preventDefault();
    if (!name.trim()) return alert('ক্যাটাগরির নাম দিন!');
    api.addCategory(name.trim(), type, currentUser.username).then((res) => {
      showAlert(res.message, res.status === 'ERROR' ? 'error' : 'success');
      if (res.status === 'SUCCESS') { setName(''); load(); }
    });
  };

  const handleDelete = (categoryId) => {
    if (!confirm('এই ক্যাটাগরি মুছে ফেলবেন? পুরনো লেনদেনে কোনো প্রভাব পড়বে না।')) return;
    api.deleteCategory(categoryId, currentUser.username).then((res) => {
      showAlert(res.message, res.status === 'ERROR' ? 'error' : 'success');
      if (res.status === 'SUCCESS') load();
    });
  };

  if (!can('MANAGE_CATEGORIES')) return null;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-200 dark:border-gray-800 shadow-2xs space-y-3">
      <div className="text-xs font-bold text-slate-700 dark:text-gray-200">Income/Expense ক্যাটাগরি</div>
      <div className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center gap-1">
        <i className="fa-solid fa-hand-pointer"></i> Swipe left to delete
      </div>
      <form onSubmit={handleAdd} className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="নতুন ক্যাটাগরি" className="flex-1 border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs bg-white dark:bg-gray-900 dark:text-gray-100" />
        <Select value={type} onChange={setType}>
          <option value="Expense">Expense</option>
          <option value="Income">Income</option>
        </Select>
        <button type="submit" className="bg-slate-800 text-white rounded-xl px-3 text-xs font-bold">+</button>
      </form>

      {categories === null && <div className="text-center text-xs text-gray-400 dark:text-gray-500 py-2">লোড হচ্ছে...</div>}
      {categories && (
        <div className="space-y-1">
          {['Expense', 'Income'].map(t => (
            <div key={t}>
              <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase mt-2 mb-1">{t}</div>
              {categories.filter(c => c.Type === t).map(c => (
                <SwipeCard key={c.CategoryID} singleAction onSwipeLeft={() => handleDelete(c.CategoryID)} swipeLeftLabel="Delete">
                  <div className="flex items-center justify-between py-1.5 border-b border-gray-50 dark:border-gray-800 text-xs bg-white dark:bg-gray-900">
                    <span className="text-slate-700 dark:text-gray-200">{c.Name}</span>
                  </div>
                </SwipeCard>
              ))}
              {categories.filter(c => c.Type === t).length === 0 && <div className="text-[11px] text-gray-400 dark:text-gray-500 py-1">কোনো ক্যাটাগরি নেই।</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SettingsView({ showAlert, currentUser, onImport, can }) {
  const handleBackup = () => {
    api.getBackupData(currentUser.username).then((res) => {
      if (!res || res.status === 'ERROR') {
        showAlert((res && res.message) || 'Backup download failed.', 'error');
        return;
      }
      const blob = new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = url;
      downloadAnchor.download = `hisab_backup_${todayStr()}.json`;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      URL.revokeObjectURL(url);
      showAlert('ব্যাকআপ ডাউনলোড সফল হয়েছে!');
    });
  };

  const handleImport = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => { try { onImport(JSON.parse(e.target.result)); } catch (error) { showAlert('ভুল JSON backup ফাইল!', 'error'); } };
    reader.readAsText(file);
    event.target.value = '';
  };

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-slate-800 dark:text-gray-100 text-base">Settings & Backup (সেটিংস)</h3>

      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-200 dark:border-gray-800 shadow-2xs space-y-3">
        <div className="text-xs font-bold text-slate-700 dark:text-gray-200">ডাটাবেজ ও ব্যাকআপ</div>
        <p className="text-xs text-gray-500 dark:text-gray-400">আপনার সমস্ত হিসাব গুগল সিট (Google Sheets)-এ রিয়েলটাইমে সংরক্ষিত হচ্ছে। চাইলে অফলাইন কপি ডাউনলোড করে রাখতে পারেন।</p>

        {can('BACKUP_RESTORE') ? (
          <button onClick={handleBackup} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2">
            <i className="fa-solid fa-download"></i> Download Full JSON Backup
          </button>
        ) : (
          <div className="text-[10px] text-gray-400 dark:text-gray-500">ব্যাকআপ ডাউনলোড করার অনুমতি আপনার নেই।</div>
        )}
        {can('BACKUP_RESTORE') ? <label className="w-full bg-slate-800 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer"><i className="fa-solid fa-upload"></i> Import / Restore JSON<input type="file" accept="application/json,.json" onChange={handleImport} className="hidden" /></label> : <div className="text-[10px] text-gray-400 dark:text-gray-500">Backup restore করার অনুমতি আপনার নেই।</div>}
      </div>

      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 text-xs text-amber-800 dark:text-amber-300 space-y-1.5">
        <div className="font-bold flex items-center gap-1.5 text-amber-900 dark:text-amber-200">
          <i className="fa-solid fa-shield-halved"></i> নিরাপত্তা সংক্রান্ত তথ্য
        </div>
        <p>আপনার ডাটা শুধুমাত্র আপনার নিজস্ব Google Drive এবং Google Sheets-এ সংরক্ষিত। অন্য কেউ আপনার অনুমোদিত PIN ছাড়া এক্সেস করতে পারবে না।</p>
      </div>

      <CategoriesManager currentUser={currentUser} can={can} showAlert={showAlert} />
    </div>
  );
}
