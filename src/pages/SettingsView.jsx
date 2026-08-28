import { api } from "../api.js";

export default function SettingsView({ showAlert, currentUser, onImport }) {
  const handleBackup = () => {
    api.getBackupData(currentUser.username).then((res) => {
      if (!res || res.status === 'ERROR') {
        showAlert((res && res.message) || 'Backup download failed.', 'error');
        return;
      }
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(res, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `hisab_backup_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showAlert('ব্যাকআপ ডিলিভারি সফল হয়েছে!');
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
      <h3 className="font-bold text-slate-800 text-base">Settings & Backup (সেটিংস)</h3>

      <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-2xs space-y-3">
        <div className="text-xs font-bold text-slate-700">ডাটাবেজ ও ব্যাকআপ</div>
        <p className="text-xs text-gray-500">আপনার সমস্ত হিসাব গুগল সিট (Google Sheets)-এ রিয়েলটাইমে সংরক্ষিত হচ্ছে। চাইলে অফলাইন কপি ডাউনলোড করে রাখতে পারেন।</p>

        <button onClick={handleBackup} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2">
          <i className="fa-solid fa-download"></i> Download Full JSON Backup
        </button>
        {currentUser.role === 'Admin' ? <label className="w-full bg-slate-800 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer"><i className="fa-solid fa-upload"></i> Import / Restore JSON<input type="file" accept="application/json,.json" onChange={handleImport} className="hidden" /></label> : <div className="text-[10px] text-gray-400">Backup restore শুধুমাত্র Admin করতে পারবেন।</div>}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-800 space-y-1.5">
        <div className="font-bold flex items-center gap-1.5 text-amber-900">
          <i className="fa-solid fa-shield-halved"></i> নিরাপত্তা সংক্রান্ত তথ্য
        </div>
        <p>আপনার ডাটা শুধুমাত্র আপনার নিজস্ব Google Drive এবং Google Sheets-এ সংরক্ষিত। অন্য কেউ আপনার অনুমোদিত PIN ছাড়া এক্সেস করতে পারবে না।</p>
      </div>
    </div>
  );
}
