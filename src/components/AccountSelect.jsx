import { useEffect, useState } from "react";
import Select from "./Select.jsx";
import { getWalletAccounts, onAccountsChange } from "../utils/accounts.js";

// Wallet-scoped account picker. Renders the real financial accounts of the
// given wallet (Active only by default) and keeps the selection valid as the
// wallet changes or the registry reloads — a stale "Bank" on a wallet that no
// longer has one is auto-corrected to its first account.
//
// A current selection that has since been retired stays selectable (and is NOT
// auto-corrected) so editing an old transaction/loan that still points at it
// does not silently move the money to another account.
export default function AccountSelect({ walletId, value, onChange, includeInactive = false, className = "" }) {
  const [, force] = useState(0);
  useEffect(() => onAccountsChange(() => force((v) => v + 1)), []);

  const all = getWalletAccounts(walletId, { activeOnly: false });
  const active = all.filter((a) => a.Status === "Active");
  const current = all.find((a) => a.AccountID === value);
  let options = includeInactive ? all : active;
  // Preserve the current value even when it is inactive (or when includeInactive
  // is off), so an edit form never rewrites it just by opening.
  if (current && !options.some((a) => a.AccountID === current.AccountID)) {
    options = [...options, current];
  }
  const valid = options.some((a) => a.AccountID === value);

  useEffect(() => {
    if (!options.length) return;
    if (!valid) onChange(options[0].AccountID);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletId, options.map((a) => a.AccountID).join(",")]);

  const shown = valid ? value : options[0]?.AccountID || "";
  return (
    <Select value={shown} onChange={onChange} className={className}>
      {options.length === 0 && <option value="">—</option>}
      {options.map((a) => <option key={a.AccountID} value={a.AccountID}>{a.Name}</option>)}
    </Select>
  );
}
