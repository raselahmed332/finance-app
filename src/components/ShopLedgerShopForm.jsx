import { useState } from "react";
import Select from "./Select.jsx";
import { Button, Input } from "../ui/index.jsx";
import { parseOpeningBalanceCents } from "../utils/money.js";

function requestId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : "shop-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}

export default function ShopLedgerShopForm({ wallets, shop, busy, onCancel, onSave }) {
  const [name, setName] = useState(shop?.Name || "");
  const [address, setAddress] = useState(shop?.Address || "");
  const [mobile, setMobile] = useState(shop?.Mobile || "");
  const [walletId, setWalletId] = useState(shop?.WalletID || "");
  const [openingBalance, setOpeningBalance] = useState(shop ? String(shop.OpeningBalance ?? 0) : "0");
  const [error, setError] = useState("");

  const save = (event) => {
    event.preventDefault();
    setError("");
    if (!name.trim()) return setError("দোকানের নাম লিখুন।");
    if (!address.trim()) return setError("দোকানের ঠিকানা লিখুন।");
    if (!shop && !walletId) return setError("Wallet নির্বাচন করুন।");
    if (parseOpeningBalanceCents(openingBalance) === null) {
      return setError("শুরুর বাকি শূন্য বা সর্বোচ্চ দুই দশমিকসহ বৈধ অঋণাত্মক সংখ্যা দিন।");
    }
    onSave({
      name: name.trim(),
      address: address.trim(),
      mobile: mobile.trim(),
      walletId,
      openingBalance: openingBalance.trim() || "0",
      requestId: requestId(),
    });
  };

  const currency = wallets.find((wallet) => String(wallet.WalletID) === String(walletId))?.Currency || "";

  return (
    <form className="space-y-3" onSubmit={save}>
      <label className="block">
        <span className="label">দোকানের নাম</span>
        <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required />
      </label>
      <label className="block">
        <span className="label">ঠিকানা</span>
        <Input value={address} onChange={(event) => setAddress(event.target.value)} maxLength={200} required />
      </label>
      <label className="block">
        <span className="label">মোবাইল (ঐচ্ছিক)</span>
        <Input type="tel" value={mobile} onChange={(event) => setMobile(event.target.value)} maxLength={30} />
      </label>
      {!shop ? (
        <label className="block">
          <span className="label">Linked Wallet</span>
          <Select value={walletId} onChange={setWalletId}>
            <option value="">Wallet নির্বাচন করুন</option>
            {wallets.map((wallet) => (
              <option key={wallet.WalletID} value={wallet.WalletID}>{wallet.WalletName} ({wallet.Currency})</option>
            ))}
          </Select>
        </label>
      ) : (
        <div className="text-xs text-ink-3">
          Wallet: {shop.WalletName} ({shop.Currency}) — তৈরি করার পর পরিবর্তন করা যাবে।
        </div>
      )}
      {!shop ? (
        <label className="block">
          <span className="label">শুরুর বাকি ({currency})</span>
          <Input type="number" min="0" step="0.01" value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} />
          <span className="hint">এটি আগের বাকি; নতুন বাজার খরচ হিসেবে গণনা হবে না।</span>
        </label>
      ) : null}
      {error ? <div className="err">{error}</div> : null}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>বাতিল</Button>
        <Button type="submit" disabled={busy}>{busy ? "সংরক্ষণ হচ্ছে..." : "সংরক্ষণ"}</Button>
      </div>
    </form>
  );
}
