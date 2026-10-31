import { Icon } from "../ui/Icon.jsx";
import WalletCard from "../components/WalletCard.jsx";
import { EmptyState, SectionCard } from "../ui/index.jsx";

export default function DashboardView({ wallets, walletSummaries, setActiveTab, setFilterWallet, can }) {
  const openWallet = (wallet) => {
    if (!can('VIEW_TRANSACTIONS')) return;
    setFilterWallet(String(wallet.WalletID));
    setActiveTab('transactions');
  };

  const actions = [];
  if (can('ADD_USER') || can('EDIT_USER') || can('DELETE_USER') || can('MANAGE_USER_PERMISSIONS')) {
    actions.push({
      key: 'users',
      label: 'ইউজার ম্যানেজমেন্ট',
      icon: 'users',
      tone: 'var(--ah-info)',
      tint: 'var(--ah-info-soft)',
      onClick: () => setActiveTab('users'),
    });
  }
  if (can('ADD_WALLET') || can('EDIT_WALLET') || can('MANAGE_WALLET_STATUS')) {
    actions.push({
      key: 'wallets',
      label: 'Wallet ম্যানেজমেন্ট',
      icon: 'vault',
      tone: 'var(--ah-brand)',
      tint: 'var(--ah-brand-soft)',
      onClick: () => setActiveTab('wallets'),
    });
  }
  if (can('BACKUP_RESTORE') || can('MANAGE_CATEGORIES')) {
    actions.push({
      key: 'settings',
      label: 'সেটিংস',
      icon: 'settings',
      tone: 'var(--ah-text-2)',
      tint: 'var(--ah-surface-3)',
      onClick: () => setActiveTab('settings'),
    });
  }
  if (can('VIEW_AUDIT_LOG')) {
    actions.push({
      key: 'auditlog',
      label: 'Audit Log',
      icon: 'history',
      tone: 'var(--ah-warning)',
      tint: 'var(--ah-warning-soft)',
      onClick: () => setActiveTab('auditlog'),
    });
  }

  return (
    <div className="space-y-4">
      {wallets.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="vault"
            title="কোনো Wallet পাওয়া যায়নি"
            text="আপনার কোনো Wallet এ এক্সেস নেই। Admin এর সাথে যোগাযোগ করুন।"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {wallets.map((wallet, i) => (
            <WalletCard
              key={wallet.WalletID}
              wallet={wallet}
              summary={walletSummaries[wallet.WalletID]}
              index={i}
              onOpen={can('VIEW_TRANSACTIONS') ? () => openWallet(wallet) : undefined}
            />
          ))}
        </div>
      )}

      {actions.length > 0 && (
        <SectionCard title="দ্রুত অ্যাকশন" icon="zap" bodyClassName="p-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {actions.map((a) => (
              <button
                key={a.key}
                onClick={a.onClick}
                className="flex flex-col items-center justify-center gap-1.5 rounded-xl p-3 text-center transition-transform active:scale-95"
                style={{ background: a.tint, border: '1px solid var(--ah-border)' }}
              >
                <span
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-sm"
                  style={{ background: a.tone, color: '#fff' }}
                >
                  <Icon name={a.icon} />
                </span>
                <span className="text-[10px] font-bold leading-tight text-ink-2 break-words">
                  {a.label}
                </span>
              </button>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
