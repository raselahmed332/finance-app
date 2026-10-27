import { useState, useEffect, useMemo } from "react";
import { api } from "../api.js";
import Select from "../components/Select.jsx";
import Popup from "../components/Popup.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { DetailCell } from "../components/FormField.jsx";
import { getActiveCurrencies } from "../utils/currency.js";
import { useBalanceReveal, BalanceRevealToggle, MASK } from "../utils/balanceReveal.jsx";
import { getWalletAccounts, onAccountsChange } from "../utils/accounts.js";
import { parseOpeningBalanceCents } from "../utils/money.js";
import {
  Badge, Button, Card, EmptyState, Input, LoadingState, PageHeader,
} from "../ui/index.jsx";

// The currency dropdown now reads the backend Currencies sheet through the
// registry in utils/currency.js instead of a hardcoded list here, so an Admin
// can add a currency from Settings without a redeploy. Until the first fetch
// resolves, the registry serves the same seven currencies the old array held, so
// this dropdown behaves exactly as before on first paint.
function currencyOptions() {
  return getActiveCurrencies().map((c) => c.code);
}

// Which currency the Add-Wallet form should preselect. The registry is sorted
// by code, so "first option" is AED - a silent behaviour change from the old
// hardcoded list, whose first entry (and therefore the old default) was SAR.
// This is only a *default selection*; which currencies exist still comes from
// the registry. The first entry that is actually active wins, so retiring any of
// them in Settings still leaves the form on a valid choice.
const DEFAULT_CURRENCY_PREFERENCE = ["SAR", "BDT"];

function defaultCurrency() {
  const options = currencyOptions();
  if (options.length === 0) return "BDT";
  for (const code of DEFAULT_CURRENCY_PREFERENCE) {
    if (options.indexOf(code) !== -1) return code;
  }
  return options[0];
}

// Server timestamps are stored as "dd-MMM-yyyy HH:mm" (e.g. "24-Sep-2026 14:30").
function fmtTimestamp(ts) {
  if (!ts) return "—";
  const s = String(ts);
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})/.exec(s);
  if (m) return `${m[1]} ${m[2]} ${m[3]}`;
  return s || "—";
}

function fmtMoney(v, cur) {
  const n = Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0;
  return `${cur} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function EditWalletRow({ wallet, walletSummaries, currentUser, can, onRefresh, showAlert, users }) {
  const [editing, setEditing] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const confirm = useConfirm();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(wallet.WalletName);
  const [status, setStatus] = useState(wallet.Status);

  // Masked until revealed, and re-masked BALANCE_REVEAL_SECONDS later. Closing
  // the popup or switching wallet resets it so nothing stays visible.
  const balance = useBalanceReveal(detailsOpen ? wallet.WalletID : null);
  const revealed = balance.revealed;
  const money = (v) => (revealed ? fmtMoney(v, wallet.Currency) : MASK);

  const handleRowClick = () => setDetailsOpen(true);

  const handleSave = () => {
    // Send only the fields that actually changed. The backend treats a
    // non-empty status as a status change requiring MANAGE_WALLET_STATUS, so
    // always sending the current status would block EDIT_WALLET-only renames.
    if (saving) return;
    const nameChanged = name.trim() !== wallet.WalletName;
    const statusChanged = status !== wallet.Status;
    if (!nameChanged && !statusChanged) { showAlert('কোনো পরিবর্তন হয়নি।', 'error'); return; }
    setSaving(true);
    api.updateWallet(
      wallet.WalletID,
      nameChanged ? name.trim() : '',
      statusChanged ? status : '',
      currentUser.username
    ).then((res) => {
      showAlert(res.message, res.status === 'ERROR' ? 'error' : 'success');
      if (res.status === 'SUCCESS') { onRefresh(); setEditing(false); }
    }).catch(() => showAlert('নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।', 'error')).finally(() => setSaving(false));
  };

  // Flips Active <-> Inactive straight from the card's status badge. The
  // backend takes a status-only update (empty name) and authorises it against
  // MANAGE_WALLET_STATUS, which is a different permission from EDIT_WALLET -
  // so this path is gated separately below.
  //
  // Deactivating is reversible and preserves the wallet and all its history;
  // it only blocks new transactions. That is why it needs a confirm step
  // rather than happening on a single tap: an accidental tap here would
  // silently stop the user recording anything in that wallet.
  const handleToggleStatus = async (e) => {
    if (e) e.stopPropagation();
    if (saving) return;
    const next = wallet.Status === 'Active' ? 'Inactive' : 'Active';
    const msg = next === 'Inactive'
      ? `"${wallet.WalletName}" নিষ্ক্রিয় করবেন?\n\nWallet ও তার সব লেনদেন অক্ষত থাকবে, কেবল নতুন লেনদেন যোগ করা যাবে না।`
      : `"${wallet.WalletName}" আবার সক্রিয় করবেন?`;
    const ok = await confirm({ message: msg, confirmLabel: next === 'Inactive' ? 'হ্যাঁ, নিষ্ক্রিয় করুন' : 'হ্যাঁ, সক্রিয় করুন' });
    if (!ok) return;
    setSaving(true);
    api.updateWallet(wallet.WalletID, '', next, currentUser.username)
      .then((res) => {
        showAlert(res.message, res.status === 'ERROR' ? 'error' : 'success');
        if (res.status === 'SUCCESS') onRefresh();
      })
      .catch(() => showAlert('নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।', 'error'))
      .finally(() => setSaving(false));
  };

  const handleDelete = () => {
    api.checkWalletHasTransactions(wallet.WalletID, currentUser.username).then(async (res) => {
      const msg = res.hasTransactions
        ? 'এই Wallet এ লেনদেন আছে।\n\nমুছে ফেললে Wallet নিষ্ক্রিয় (deactivate) হবে — পুরনো লেনদেন সংরক্ষিত থাকবে, শুধু নতুন লেনদেন যোগ করা যাবে না।\n\nআপনি কি নিশ্চিত?'
        : 'এই Wallet মুছে ফেলবেন?';
      const ok = await confirm({ message: msg, confirmLabel: 'হ্যাঁ, মুছুন' });
      if (!ok) return;
      api.deleteWallet(wallet.WalletID, currentUser.username).then((r) => {
        showAlert(r.message, r.status === 'ERROR' ? 'error' : 'success');
        if (r.status === 'SUCCESS') onRefresh();
      }).catch(() => showAlert('নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।', 'error'));
    }).catch(() => showAlert('নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।', 'error'));
  };

  // The backend scopes the wallet list to the caller's access range, so each row
  // can only ever be managed if the caller can actually reach that wallet.
  const canAccess = String(currentUser?.role) === 'Admin' || (currentUser?.walletAccess || []).includes(String(wallet.WalletID));
  const canEdit = canAccess && can('EDIT_WALLET');
  const canDel = canAccess && can('MANAGE_WALLET_STATUS') && wallet.Status === 'Active';
  // Status toggling is gated on MANAGE_WALLET_STATUS alone - it is not an
  // EDIT_WALLET operation, so a user who may rename a wallet cannot flip it.
  const canToggleStatus = canAccess && can('MANAGE_WALLET_STATUS');

  const summary = (walletSummaries || {})[wallet.WalletID];
  const active = wallet.Status === 'Active';

  // Re-render when the account registry changes (new account/rename), since the
  // popup lists this wallet's accounts from the registry.
  const [, force] = useState(0);
  useEffect(() => onAccountsChange(() => force((v) => v + 1)), []);

  const accountIds = useMemo(() => {
    const ids = getWalletAccounts(wallet.WalletID, { activeOnly: false }).map((a) => a.AccountID);
    Object.keys(summary?.accounts || {}).forEach((id) => { if (ids.indexOf(id) === -1) ids.push(id); });
    if (!ids.length) ids.push("Cash", "Bank");
    return ids;
  }, [wallet.WalletID, summary]);

  const accountMeta = (id) => {
    const a = getWalletAccounts(wallet.WalletID, { activeOnly: false }).find((x) => x.AccountID === id);
    const code = a ? a.AccountTypeCode : id;
    const icon = code === "BANK" ? "fa-building-columns" : code === "CASH" ? "fa-money-bill-wave" : "fa-wallet";
    return { name: a ? a.Name : id, icon, opening: a ? Number(a.OpeningBalance) || 0 : (id === "Cash" ? parseFloat(wallet.OpeningCash) || 0 : id === "Bank" ? parseFloat(wallet.OpeningBank) || 0 : 0) };
  };

  // Users holding access to THIS wallet. Only FullName is shown, per the
  // request. The backend already masks out wallet ids the viewer cannot reach
  // (see buildUserListForViewer_ in Users.gs), so a user missing from this list
  // is either not granted access or is out of the viewer's scope - which is
  // exactly the disclosure boundary the rest of the app enforces.
  const walletUsers = (users || []).filter(u =>
    (u.WalletAccess || []).some(id => String(id) === String(wallet.WalletID))
  );

  // Each wallet is its own bordered card with a gap to the next one, so the
  // list reads as separate items rather than divider-separated rows inside one
  // continuous block. The previous border-b/last:border-0 approach left the
  // rows looking like a single table.
  const row = (
    <Card
      as="div"
      onClick={handleRowClick}
      className="p-3 cursor-pointer transition-colors hover:border-[var(--ah-brand)]"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleRowClick(); } }}
    >
      <div className="flex justify-between items-center gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "var(--ah-success-soft)", color: "var(--ah-success)" }}
          >
            <i className="fa-solid fa-vault text-xs" />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-ink truncate">
              {wallet.WalletName}{" "}
              <span className="text-[10px] text-ink-3 font-normal">({wallet.WalletID})</span>
            </div>
            <div className="text-[10px] text-ink-3">
              {wallet.Currency}{wallet.SheetName ? ` • ${wallet.SheetName}` : ''}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canToggleStatus ? (
            <button
              type="button"
              onClick={handleToggleStatus}
              disabled={saving}
              title={active ? 'নিষ্ক্রিয় করতে ক্লিক করুন' : 'সক্রিয় করতে ক্লিক করুন'}
              aria-label={active ? 'নিষ্ক্রিয় করুন' : 'সক্রিয় করুন'}
              className="px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors disabled:opacity-50"
              style={active
                ? { background: "var(--ah-success-soft)", color: "var(--ah-success)", borderColor: "transparent" }
                : { background: "var(--ah-surface-3)", color: "var(--ah-text-2)", borderColor: "var(--ah-border)" }}
            >
              {wallet.Status}
            </button>
          ) : (
            <Badge tone={active ? "success" : "neutral"}>{wallet.Status}</Badge>
          )}
        </div>
      </div>
    </Card>
  );

  return (
    <div>
      {row}

      <Popup open={detailsOpen} title="Wallet Details" onClose={() => setDetailsOpen(false)}>
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "var(--ah-success-soft)", color: "var(--ah-success)" }}
          >
            <i className="fa-solid fa-vault" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-sm text-ink truncate">{wallet.WalletName}</div>
            <div className="text-[11px] text-ink-3">{wallet.WalletID}</div>
          </div>
          <Badge tone={active ? "success" : "neutral"}>{wallet.Status}</Badge>
        </div>

        <div className="card-inset p-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
          <DetailCell label="Currency" value={wallet.Currency} />
          <DetailCell label="Sheet" value={wallet.SheetName || "—"} />
          <DetailCell label="Created" value={fmtTimestamp(wallet.CreatedAt)} />
          <DetailCell label="Last Updated" value={fmtTimestamp(wallet.UpdatedAt)} />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] font-bold uppercase tracking-wide text-ink-3">Balance</div>
          <BalanceRevealToggle
            revealed={balance.revealed}
            secondsLeft={balance.secondsLeft}
            onToggle={balance.toggle}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          {accountIds.map((id) => {
            const m = accountMeta(id);
            return (
              <div key={id} className="rounded-xl p-2.5" style={{ background: "var(--ah-success-soft)" }}>
                <div className="text-[10px] text-ink-2 font-semibold flex items-center gap-1">
                  <i className={`fa-solid ${m.icon}`} style={{ color: "var(--ah-success)" }} /> Current {m.name}
                </div>
                <div className="text-sm font-bold tnum text-ink mt-1">
                  {summary ? money(summary?.accounts?.[id] || 0) : "—"}
                </div>
              </div>
            );
          })}
        </div>

        <div className="card-inset p-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
          <DetailCell label="Total Balance" value={summary ? money(summary.totalBalance) : "—"} />
          {accountIds.map((id) => {
            const m = accountMeta(id);
            return <DetailCell key={id} label={`Opening ${m.name}`} value={money(m.opening)} />;
          })}
          <DetailCell label="Wallet ID" value={String(wallet.WalletID)} />
        </div>

        <div className="card-inset p-3">
          <div className="text-[10px] font-bold uppercase tracking-wide text-ink-3 mb-2">
            <i className="fa-solid fa-users me-1.5" style={{ color: "var(--ah-success)" }} />
            যাদের এই Wallet-এ অ্যাক্সেস আছে
            <span className="text-ink-3 font-normal">({walletUsers.length})</span>
          </div>
          {walletUsers.length === 0 ? (
            <div className="text-[11px] text-ink-3">কোনো ইউজারের অ্যাক্সেস নেই</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {walletUsers.map(u => (
                <span key={u.Username} className="text-[10px] font-semibold bg-[var(--ah-surface)] border border-[var(--ah-border)] px-2 py-1 rounded-full text-ink-2">
                  {u.FullName || u.Username}
                </span>
              ))}
            </div>
          )}
        </div>

        {(canEdit || canDel) ? (
          <div className="grid grid-cols-2 gap-2">
            {canEdit ? (
              <Button
                onClick={() => { setDetailsOpen(false); setEditing(true); setName(wallet.WalletName); setStatus(wallet.Status); }}
              >
                <i className="fa-solid fa-pen" /> Edit Wallet
              </Button>
            ) : null}
            {canDel ? (
              <Button
                variant="danger"
                onClick={() => { setDetailsOpen(false); handleDelete(); }}
              >
                <i className="fa-solid fa-trash-can" /> Delete
              </Button>
            ) : null}
          </div>
        ) : null}
      </Popup>

      <Popup open={editing} title="Edit Wallet" onClose={saving ? undefined : () => setEditing(false)}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Wallet Name" />
        <Select value={status} onChange={setStatus}>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </Select>
        <div className="text-[10px] text-ink-3 px-1">Currency: {wallet.Currency} (তৈরির সময় নির্ধারিত, পরিবর্তনযোগ্য নয়)</div>
        <Button block onClick={handleSave} disabled={saving}>
          {saving ? <><i className="fa-solid fa-spinner fa-spin" />Saving...</> : 'Save'}
        </Button>
      </Popup>
    </div>
  );
}

function AddWalletForm({ currentUser, showAlert, onRefresh, onWalletCreated, onClose }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  // Default to a still-active preferred currency, never to a literal 'BDT' that
  // the registry might no longer offer.
  const [currency, setCurrency] = useState(() => defaultCurrency());
  const [accountTypes, setAccountTypes] = useState([]);
  const [accounts, setAccounts] = useState([{ key: 0, name: '', accountTypeId: '', openingBalance: '' }]);
  const [nextAccountKey, setNextAccountKey] = useState(1);

  // The registry loads asynchronously. If this form was mounted before the fetch
  // resolved, the preselected code may not be in the list that just arrived, and
  // the custom Select renders an empty label and would submit a blank currency.
  const options = currencyOptions();
  useEffect(() => {
    if (options.length && options.indexOf(currency) === -1) setCurrency(defaultCurrency());
  }, [options.join(","), currency]);

  useEffect(() => {
    api.getAccountTypes(currentUser.username).then((res) => {
      if (res.status === 'ERROR') {
        showAlert(res.message || 'Account Type লোড করা যায়নি।', 'error');
        return;
      }
      if (res.status === 'SUCCESS') setAccountTypes(res.accountTypes || []);
    }).catch(() => showAlert('Account Type লোড করা যায়নি।', 'error'));
  }, [currentUser.username, showAlert]);

  const eligibleTypes = accountTypes.filter((type) => {
    if (type.Status !== 'Active') return false;
    const applicable = type.ApplicableCurrencies || [];
    return applicable.length === 0 || applicable.map((code) => String(code).toUpperCase()).includes(currency.toUpperCase());
  });

  useEffect(() => {
    setAccounts((current) => current.map((account) => ({
      ...account,
      accountTypeId: eligibleTypes.some((type) => type.AccountTypeID === account.accountTypeId)
        ? account.accountTypeId
        : (eligibleTypes[0]?.AccountTypeID || ''),
    })));
  }, [currency, accountTypes]);

  const updateAccount = (key, field, value) => {
    setAccounts((current) => current.map((account) => (
      account.key === key ? { ...account, [field]: value } : account
    )));
  };

  const openingTotalCents = accounts.reduce((total, account) => {
    const cents = parseOpeningBalanceCents(account.openingBalance);
    return total + (cents === null ? 0 : cents);
  }, 0);

  const handleAdd = (e) => {
    e.preventDefault();
    if (adding) return;
    if (!name.trim()) { showAlert("Wallet এর নাম দিন!", "error"); return; }
    if (!options.length || options.indexOf(currency) === -1) { showAlert("কারেন্সি নির্বাচন করুন।", "error"); return; }
    if (accounts.length === 0) { showAlert('কমপক্ষে একটি অ্যাকাউন্ট যোগ করুন।', 'error'); return; }

    const seenNames = new Set();
    for (const account of accounts) {
      const trimmedName = account.name.trim();
      if (!trimmedName || trimmedName.length > 60) {
        showAlert('অ্যাকাউন্টের নাম দিন (সর্বোচ্চ ৬০ অক্ষর)।', 'error');
        return;
      }
      const nameKey = trimmedName.toLowerCase();
      if (seenNames.has(nameKey)) {
        showAlert('একই Wallet-এ অ্যাকাউন্টের নাম একাধিকবার ব্যবহার করা যাবে না।', 'error');
        return;
      }
      seenNames.add(nameKey);
      if (!eligibleTypes.some((type) => type.AccountTypeID === account.accountTypeId)) {
        showAlert('প্রতিটি অ্যাকাউন্টের বৈধ Account Type নির্বাচন করুন।', 'error');
        return;
      }
      if (parseOpeningBalanceCents(account.openingBalance) === null) {
        showAlert('Opening balance শূন্য বা সর্বোচ্চ দুই দশমিকসহ বৈধ অঋণাত্মক সংখ্যা দিন।', 'error');
        return;
      }
    }

    setAdding(true);
    const initialAccounts = accounts.map((account) => ({
      name: account.name.trim(),
      accountTypeId: account.accountTypeId,
      openingBalance: account.openingBalance.trim() || '0',
    }));
    api.addWallet(name.trim(), currency, initialAccounts).then((res) => {
      showAlert(res.message, res.status === 'ERROR' ? 'error' : 'success');
      if (res.status === 'SUCCESS') {
        setName('');
        onRefresh();
        if (onWalletCreated) onWalletCreated();
        onClose();
      }
    }).catch(() => showAlert('নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।', 'error')).finally(() => setAdding(false));
  };

  return (
    <form onSubmit={handleAdd} className="space-y-3">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="যেমন: Bangladesh Bank" required />
      <Select value={currency} onChange={setCurrency}>
        {options.map(c => <option key={c} value={c}>{c}</option>)}
      </Select>
      <div
        className="text-[10px] rounded-lg px-2.5 py-1.5"
        style={{ background: "var(--ah-warning-soft)", color: "var(--ah-warning)" }}
      >
        <i className="fa-solid fa-triangle-exclamation me-1" />
        কারেন্সি একবার নির্ধারণ করলে পরে পরিবর্তন করা যাবে না।
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="label mb-0">Accounts</div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              setAccounts((current) => [...current, {
                key: nextAccountKey,
                name: '',
                accountTypeId: eligibleTypes[0]?.AccountTypeID || '',
                openingBalance: '',
              }]);
              setNextAccountKey((key) => key + 1);
            }}
          >
            <i className="fa-solid fa-plus" /> Add account
          </Button>
        </div>
        {accounts.map((account, index) => (
          <div key={account.key} className="card-inset p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-ink">Account {index + 1}</div>
              {accounts.length > 1 ? (
                <button
                  type="button"
                  className="text-xs font-semibold text-[var(--ah-danger)] px-2 py-1"
                  onClick={() => setAccounts((current) => current.filter((item) => item.key !== account.key))}
                  aria-label={`Remove account ${index + 1}`}
                >
                  <i className="fa-solid fa-trash-can me-1" />Remove
                </button>
              ) : null}
            </div>
            <div>
              <label className="label">Account name</label>
              <Input
                value={account.name}
                onChange={(e) => updateAccount(account.key, 'name', e.target.value)}
                placeholder="যেমন: Cash, Al Rajhi Bank, bKash"
                maxLength={60}
              />
            </div>
            <div>
              <label className="label">Account type</label>
              <Select
                value={account.accountTypeId}
                onChange={(value) => updateAccount(account.key, 'accountTypeId', value)}
              >
                {eligibleTypes.map((type) => (
                  <option key={type.AccountTypeID} value={type.AccountTypeID}>{type.Name}</option>
                ))}
              </Select>
              {eligibleTypes.length === 0 ? (
                <div className="text-[10px] text-[var(--ah-danger)] mt-1">এই কারেন্সির জন্য কোনো সক্রিয় Account Type নেই।</div>
              ) : null}
            </div>
            <div>
              <label className="label">Opening balance ({currency})</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={account.openingBalance}
                onChange={(e) => updateAccount(account.key, 'openingBalance', e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
        ))}
        <div className="flex items-center justify-between gap-2 text-sm font-bold text-ink px-1">
          <span>Total opening balance</span>
          <span className="tnum">{fmtMoney(openingTotalCents / 100, currency)}</span>
        </div>
        <div className="text-[10px] text-ink-3 px-1">
          শুরুর ব্যালেন্স প্রতিটি অ্যাকাউন্টে একবারই সংরক্ষিত হবে।
        </div>
      </section>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={adding}>
          {adding ? <><i className="fa-solid fa-spinner fa-spin" />Creating...</> : <><i className="fa-solid fa-plus" /> Create Wallet</>}
        </Button>
      </div>
    </form>
  );
}

export default function WalletManagementView({ currentUser, can, showAlert, walletSummaries, users, onRefresh }) {
  const [allWallets, setAllWallets] = useState(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = () => {
    api.getAllWallets(currentUser.username).then((res) => {
      if (res.status === 'SUCCESS') setAllWallets(res.wallets);
      else showAlert(res.message, 'error');
    }).catch(() => showAlert('ডেটা লোড করতে ব্যর্থ হয়েছে।', 'error'));
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Wallet ম্যানেজমেন্ট"
        icon="fa-vault"
        subtitle="ওয়ালেট তৈরি, নাম পরিবর্তন ও স্ট্যাটাস ব্যবস্থাপনা"
        right={
          can('ADD_WALLET') ? (
            <Button size="sm" icon="fa-plus" onClick={() => setAddOpen(true)}>Add Wallet</Button>
          ) : null
        }
      />

      <Popup open={addOpen} title="নতুন Wallet তৈরি করুন" onClose={() => setAddOpen(false)}>
        <AddWalletForm
          currentUser={currentUser}
          showAlert={showAlert}
          onRefresh={load}
          onWalletCreated={onRefresh}
          onClose={() => setAddOpen(false)}
        />
      </Popup>

      <div>
        <div className="section-title mb-2">
          সব Wallet <span className="text-[10px] text-ink-3 font-normal">({allWallets ? allWallets.length : 0})</span>
        </div>
        {allWallets === null ? <LoadingState label="লোড হচ্ছে..." /> : null}
        {allWallets && allWallets.length === 0 ? (
          <EmptyState icon="fa-vault" title="কোনো Wallet নেই" text="প্রথম Wallet তৈরি করে শুরু করুন।" />
        ) : null}
        {/* space-y separates the per-wallet cards, so each row supplies its own
            border rather than relying on a divider inside a shared container. */}
        {allWallets ? (
          <div className="space-y-2">
            {allWallets.map(w => (
              <EditWalletRow key={w.WalletID} wallet={w} walletSummaries={walletSummaries} currentUser={currentUser} can={can} onRefresh={load} showAlert={showAlert} users={users} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
