import { useState } from "react";
import { api } from "../api.js";
import { todayStr } from "../utils/loan.js";
import { Button, PageHeader, SectionCard } from "../ui/index.jsx";

export default function BackupRestoreView({ currentUser, showAlert, onImport, can, onCancel }) {
  const [downloading, setDownloading] = useState(false);

  const handleBackup = () => {
    if (downloading) return;
    setDownloading(true);
    api.getBackupData(currentUser.username).then((res) => {
      if (!res || res.status === 'ERROR') {
        showAlert((res && res.message) || 'Backup download failed.', 'error');
        return;
      }
      // The API envelope (status/message) is response metadata, not backup
      // data — strip it so the downloaded file round-trips cleanly through
      // Import / Restore.
      const backup = { ...res };
      delete backup.status;
      delete backup.message;
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = url;
      downloadAnchor.download = `hisab_backup_${todayStr()}.json`;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      URL.revokeObjectURL(url);
      showAlert('ব্যাকআপ ডাউনলোড সফল হয়েছে!');
    }).catch(() => showAlert('ব্যাকআপ ডাউনলোডে ত্রুটি হয়েছে। আবার চেষ্টা করুন।', 'error')).finally(() => setDownloading(false));
  };

  const handleImport = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => { try { onImport(JSON.parse(e.target.result)); } catch (error) { showAlert('ভুল JSON backup ফাইল!', 'error'); } };
    reader.readAsText(file);
    event.target.value = '';
  };

  const allowed = can('BACKUP_RESTORE');

  return (
    <div className="space-y-4">
      <PageHeader
        title="Backup & Restore"
        subtitle="ব্যাকআপ ও রিস্টোর"
        icon="fa-cloud-arrow-down"
        onBack={onCancel}
      />

      <SectionCard
        title="ডাটাবেজ ও ব্যাকআপ"
        icon="fa-database"
        bodyClassName="p-4 space-y-3"
      >
        <p className="text-xs text-ink-3">
          আপনার সমস্ত হিসাব গুগল সিট (Google Sheets)-এ রিয়েলটাইমে সংরক্ষিত হচ্ছে। চাইলে
          অফলাইন কপি ডাউনলোড করে রাখতে পারেন।
        </p>

        {allowed ? (
          <Button
            block
            icon={downloading ? "fa-spinner fa-spin" : "fa-download"}
            onClick={handleBackup}
            disabled={downloading}
          >
            {downloading ? 'Downloading...' : 'Download Full JSON Backup'}
          </Button>
        ) : (
          <p className="text-[11px] text-ink-3">ব্যাকআপ ডাউনলোড করার অনুমতি আপনার নেই।</p>
        )}

        {allowed ? (
          <label className="btn btn-secondary btn-block cursor-pointer">
            <i className="fa-solid fa-upload" /> Import / Restore JSON
            <input
              type="file"
              accept="application/json,.json"
              onChange={handleImport}
              className="hidden"
            />
          </label>
        ) : (
          <p className="text-[11px] text-ink-3">Backup restore করার অনুমতি আপনার নেই।</p>
        )}
      </SectionCard>

      <div className="card card-warning p-3 flex items-start gap-2">
        <i className="fa-solid fa-triangle-exclamation mt-0.5 text-warning" />
        <span className="text-[11px] text-ink-2">
          Restore করলে বর্তমান ডেটা প্রতিস্থাপিত হতে পারে। নতুন backup download/import
          করার আগে নিশ্চিত হয়ে নিন।
        </span>
      </div>
    </div>
  );
}
