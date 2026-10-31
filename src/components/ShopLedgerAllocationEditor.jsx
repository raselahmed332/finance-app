import { Icon } from "../ui/Icon.jsx";
import Select from "./Select.jsx";
import { Input } from "../ui/index.jsx";
import { money } from "../utils/shopLedger.js";

function firstUnusedAccount(accounts, rows) {
  const used = new Set(rows.map((row) => String(row.accountId)));
  const account = (accounts || []).find((item) => !used.has(String(item.AccountID)));
  return account ? String(account.AccountID) : "";
}

export default function ShopLedgerAllocationEditor({
  accounts,
  allocations,
  onChange,
  currency,
  maxAmount,
  disabled = false,
}) {
  const rows = allocations?.length ? allocations : [{ accountId: "", amount: "" }];
  const total = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const overLimit = Number.isFinite(Number(maxAmount)) && maxAmount !== null && total > Number(maxAmount) + 0.000001;

  const updateRow = (index, patch) => {
    onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  };

  const addRow = () => {
    onChange([...rows, { accountId: firstUnusedAccount(accounts, rows), amount: "" }]);
  };

  const removeRow = (index) => {
    if (rows.length === 1) {
      onChange([{ accountId: "", amount: "" }]);
      return;
    }
    onChange(rows.filter((_, rowIndex) => rowIndex !== index));
  };

  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={index} className="card-inset p-2">
          <div className="grid grid-cols-[minmax(0,1fr)_96px_28px] items-center gap-1.5">
            <Select
              value={row.accountId}
              onChange={(value) => updateRow(index, { accountId: value })}
              className="min-w-0"
              triggerClassName="px-2 text-[11px]"
              menuClassName="min-w-[10rem] right-0"
              disabled={disabled}
            >
              <option value="">Account নির্বাচন করুন</option>
              {(accounts || []).map((account) => (
                <option key={account.AccountID} value={account.AccountID}>
                  {account.Name}{account.Status && account.Status !== "Active" ? " (নিষ্ক্রিয়)" : ""}
                </option>
              ))}
            </Select>
            <div className="relative min-w-0">
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={row.amount}
                onChange={(event) => updateRow(index, { amount: event.target.value })}
                placeholder="0.00"
                aria-label={`Account ${index + 1} এর পরিমাণ`}
                className="min-w-0 pl-2 pr-8 text-[11px]"
                disabled={disabled}
              />
              <span className="absolute right-1.5 text-[9px] font-bold text-ink-3 pointer-events-none">
                {currency}
              </span>
            </div>
            <button
              type="button"
              className="icon-btn icon-btn-danger shrink-0"
              style={{ width: 28, height: 28 }}
              title="Account বাদ দিন"
              aria-label="Account বাদ দিন"
              disabled={disabled}
              onClick={() => removeRow(index)}
            >
              <Icon name="trash-2" className="text-[10px]" />
            </button>
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={addRow}
          disabled={disabled || rows.length >= (accounts || []).length}
        >
          <Icon name="plus" />
          Account যোগ করুন
        </button>
        <div className="text-right">
          <div className="text-[10px] text-ink-3">মোট পেমেন্ট</div>
          <div className={`text-xs font-bold tnum ${overLimit ? "text-danger" : "text-ink"}`}>
            {money(total, currency)}
          </div>
        </div>
      </div>
      {overLimit ? (
        <div className="text-[10px] font-semibold text-danger">
          <Icon name="triangle-alert" className="me-1" />
          বর্তমান বাকির চেয়ে বেশি পেমেন্ট করা যাবে না।
        </div>
      ) : null}
    </div>
  );
}
