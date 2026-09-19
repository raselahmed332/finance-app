import { api } from "../api.js";
import { todayStr } from "../utils/loan.js";

export default function BackupRestoreView({ showAlert, currentUser, onImport, can, onCancel }) {
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
      <div className="flex items-center justify-between">
        <button onClick={onCancel} className="text-gray-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200">
          <i className="fa-solid fa-arrow-left text-lg"></i>
        </button>
        <h3 className="font-bold text-slate-800 dark:text-gray-100 text-base">Backup and Restore (ব্যাকআপ)</h3>
        <div className="w-5"></div>
      </div>

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
    </div>
  );
}