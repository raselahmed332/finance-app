import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import Popup from "../components/Popup.jsx";
import Select from "../components/Select.jsx";
import AccountSelect from "../components/AccountSelect.jsx";
import { Field } from "../components/FormField.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { formatMoney, fmtDate, todayStr } from "../utils/loan.js";
import { accountName } from "../utils/accounts.js";

const TYPE_META = {
  GROUP: { label: "গ্রুপ সঞ্চয় (কমিটি)", icon: "fa-people-group" },
  FIXED: { label: "মেয়াদি সঞ্চয়", icon: "fa-calendar-check" },
  FLEXIBLE: { label: "নমনীয় সঞ্চয়", icon: "fa-wallet" },
};

const STATUS_STYLE = {
  PAID: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400",
  PARTIAL: "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-400",
  DUE: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400",
  MISSED: "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400",
  UNPAID: "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400",
  OPEN: "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400",
  UPCOMING: "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400",
};

const STATUS_LABEL = {
  PAID: "পরিশোধিত",
  PARTIAL: "আংশিক",
  DUE: "বাকি (আজ)",
  MISSED: "বকেয়া",
  UNPAID: "অপরিশোধিত",
  OPEN: "চলমান",
  UPCOMING: "আসন্ন",
};

function StatusBadge({ status }) {
  const key = String(status || "").toUpperCase();
  return (
    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[key] || STATUS_STYLE.UNPAID}`}>
      {STATUS_LABEL[key] || key}
    </span>
  );
}

function Tile({ label, value, tone }) {
  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-2.5">
      <div className="text-[9px] uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</div>
      <div className={`text-[13px] font-bold mt-0.5 ${tone || "text-slate-800 dark:text-gray-100"}`}>{value}</div>
    </div>
  );
}

function nextClientId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : "s" + Date.now() + Math.random().toString(36).slice(2);
}

export default function SavingsDetailsView({ planId, currentUser, wallets, can, showAlert, onRefresh, onBack }) {
  const confirm = useConfirm();
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [orderIds, setOrderIds] = useState([]);

  const plan = details?.plan;
  const type = plan ? String(plan.Type).toUpperCase() : "";
  const currency = plan?.Currency || "";
  const closed = plan ? String(plan.Status).toUpperCase() === "CLOSED" : false;

  const canManage = can ? can("MANAGE_SAVINGS") : false;
  const canManageTxn = can ? can("MANAGE_SAVINGS_TRANSACTIONS") : false;
  const typePerm = type === "GROUP" ? "SAVINGS_GROUP" : type === "FIXED" ? "SAVINGS_FIXED" : "SAVINGS_FLEXIBLE";
  const canType = can ? can(typePerm) : false;
  const canTxn = !closed && (canManage || canManageTxn || canType);
  const canAddMember = !closed && (canManage || (type === "GROUP" && canType));

  const load = () => {
    if (!planId || !currentUser) return Promise.resolve();
    setLoading(true);
    setError("");
    return api
      .getSavingsPlanDetails(planId, currentUser.username)
      .then((res) => {
        if (res.status === "ERROR") {
          setError(res.message || "Failed to load savings details");
          setDetails(null);
        } else {
          setDetails(res);
        }
      })
      .catch((err) => {
        setError(String(err));
        setDetails(null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, currentUser?.username]);

  useEffect(() => {
    if (details?.members) {
      const sorted = [...details.members].sort((a, b) => (Number(a.OrderIndex) || 0) - (Number(b.OrderIndex) || 0));
      setOrderIds(sorted.map((m) => m.MemberID));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details]);

  const refresh = () => load().then(() => { if (onRefresh) onRefresh(); });

  const run = (promise) => {
    setBusy(true);
    return promise
      .then((res) => {
        if (res && res.status === "ERROR") {
          if (showAlert) showAlert(res.message || "Failed", "error");
          return res;
        }
        if (showAlert) showAlert((res && res.message) || "সম্পন্ন হয়েছে", "success");
        setModal(null);
        return refresh();
      })
      .catch((err) => {
        if (showAlert) showAlert("ত্রুটি: " + err, "error");
      })
      .finally(() => setBusy(false));
  };

  const membersById = useMemo(() => {
    const map = {};
    (details?.members || []).forEach((m) => { map[String(m.MemberID)] = m; });
    return map;
  }, [details]);

  const alreadyReceived = useMemo(() => {
    const set = {};
    (details?.rounds || []).forEach((r) => {
      if (String(r.Status).toUpperCase() === "PAID" && r.RecipientMemberID) set[String(r.RecipientMemberID)] = true;
    });
    return set;
  }, [details]);

  const openRounds = useMemo(
    () => (details?.rounds || []).filter((r) => String(r.Status).toUpperCase() !== "PAID"),
    [details],
  );

  const openModal = (kind, extra = {}) => {
    const base = { kind, date: todayStr(), account: plan?.Account || "Cash", ...extra };
    if (kind === "contribution") {
      base.memberId = (details?.members || [])[0]?.MemberID || "";
      base.round = String(nextRoundNumber());
      base.amount = plan?.Group?.Contribution ? String(plan.Group.Contribution) : "";
      base.note = "";
    } else if (kind === "payout") {
      const first = openRounds[0];
      base.round = first ? String(first.Round) : "";
      base.recipientMemberId = "";
      base.amount = first ? String(first.CollectedAmount) : "";
    } else if (kind === "pay-installment") {
      const inst = (details?.installments || []).find((i) => i.InstallmentID === extra.installmentId);
      const remaining = inst ? Math.max(0, (Number(inst.RequiredAmount) || 0) - (Number(inst.ActualAmount) || 0)) : 0;
      base.amount = String(remaining);
    } else if (kind === "close-fixed") {
      base.closureDate = todayStr();
      base.closureAmount = "";
      base.closureNote = "";
    } else if (kind === "close-flex") {
      base.closureDate = todayStr();
      base.closureAmount = plan?.Summary?.Balance ? String(plan.Summary.Balance) : "";
      base.closureNote = "";
    } else if (kind === "add-member" || kind === "edit-member") {
      base.memberName = extra.memberName || "";
    } else if (kind === "deposit" || kind === "withdraw") {
      base.amount = "";
      base.description = "";
    }
    setForm(base);
    setModal(base);
  };

  const nextRoundNumber = () => {
    let max = 0;
    (details?.rounds || []).forEach((r) => { max = Math.max(max, Number(r.Round) || 0); });
    (details?.obligations || []).forEach((o) => { max = Math.max(max, Number(o.Round) || 0); });
    return max + 1;
  };

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const submitModal = () => {
    if (busy) return;
    const kind = form.kind;
    const user = currentUser.username;
    if (kind === "add-member") {
      return run(api.addSavingsGroupMember({ user, planId, memberName: form.memberName }));
    }
    if (kind === "edit-member") {
      return run(api.updateSavingsGroupMember({ memberId: form.memberId, memberName: form.memberName }, user));
    }
    if (kind === "contribution") {
      return run(api.recordSavingsGroupContribution({
        user, planId, memberId: form.memberId, amount: form.amount, date: form.date,
        round: form.round, account: form.account, note: form.note, requestId: nextClientId(),
      }));
    }
    if (kind === "payout") {
      return run(api.recordSavingsGroupPayout({
        user, planId, amount: form.amount, date: form.date, round: form.round,
        account: form.account, recipientMemberId: form.recipientMemberId,
      }));
    }
    if (kind === "pay-installment") {
      return run(api.addSavingsFixedPayment({
        user, planId, installmentId: form.installmentId, amount: form.amount, date: form.date,
        account: form.account, requestId: nextClientId(),
      }));
    }
    if (kind === "close-fixed") {
      return run(api.closeSavingsFixedPlan({
        user, planId, closureDate: form.closureDate, closureAmount: form.closureAmount,
        closureNote: form.closureNote, account: form.account,
      }));
    }
    if (kind === "close-flex") {
      return run(api.closeSavingsFlexPlan({
        user, planId, closureDate: form.closureDate, closureAmount: form.closureAmount,
        closureNote: form.closureNote, account: form.account,
      }));
    }
    if (kind === "deposit") {
      return run(api.addSavingsFlexDeposit({
        user, planId, amount: form.amount, date: form.date, account: form.account,
        description: form.description, requestId: nextClientId(),
      }));
    }
    if (kind === "withdraw") {
      return run(api.addSavingsFlexWithdrawal({
        user, planId, amount: form.amount, date: form.date, account: form.account,
        description: form.description, requestId: nextClientId(),
      }));
    }
    return undefined;
  };

  const generateInstallments = async () => {
    const ok = await confirm({
      title: "কিস্তি তৈরি",
      message: "এই পরিকল্পনার সব কিস্তি এখন তৈরি করা হবে?",
      confirmLabel: "তৈরি করুন",
      danger: false,
    });
    if (!ok) return;
    run(api.generateSavingsFixedInstallments({ user: currentUser.username, planId }));
  };

  const removeMember = async (member) => {
    const ok = await confirm({
      title: "সদস্য মুছুন",
      message: `"${member.MemberName}" কে মুছে ফেলবেন?`,
    });
    if (!ok) return;
    run(api.removeSavingsGroupMember(member.MemberID, currentUser.username));
  };

  const saveOrder = () => {
    run(api.setSavingsGroupRecipientOrder({ user: currentUser.username, planId, order: orderIds }));
  };

  const toggleSelf = (member) => {
    run(api.updateSavingsGroupMember({ memberId: member.MemberID, isSelf: !member.IsSelf }, currentUser.username));
  };

  const moveOrder = (idx, dir) => {
    setOrderIds((prev) => {
      const next = prev.slice();
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      const tmp = next[idx];
      next[idx] = next[target];
      next[target] = tmp;
      return next;
    });
  };

  const deleteFlexTxn = async (txn, kind) => {
    const ok = await confirm({
      title: "লেনদেন মুছুন",
      message: "এই লেনদেন মুছে ফেললে ওয়ালেট ব্যালেন্সও সংশোধন হবে। নিশ্চিত?",
    });
    if (!ok) return;
    run(api.deleteSavingsFlexTransaction(txn, kind, currentUser.username));
  };

  const money = (n) => formatMoney(n || 0, currency);
  const meta = TYPE_META[type] || { label: type, icon: "fa-piggy-bank" };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button className="text-sm px-3 py-1.5 rounded-xl border border-gray-300 dark:border-slate-600 text-slate-600 dark:text-gray-300" onClick={onBack}>
          <i className="fa-solid fa-arrow-left me-1"></i> পিছনে
        </button>
        {closed && <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">বন্ধ করা হয়েছে</span>}
      </div>

      {loading && !details && <div className="text-sm text-gray-500 flex items-center gap-2"><i className="fa-solid fa-spinner fa-spin"></i> লোড হচ্ছে...</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}

      {plan && (
        <>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-lg">
              <i className={`fa-solid ${meta.icon}`}></i>
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold text-slate-800 dark:text-gray-100 truncate">{plan.Name}</h1>
              <div className="text-[11px] text-gray-500 dark:text-gray-400">{meta.label} • {plan.WalletName || plan.WalletID} • {accountName(plan.WalletID, plan.Account)} • {currency}</div>
            </div>
          </div>

          {type === "GROUP" && (
            <GroupSection
              plan={plan} details={details} money={money}
              canManage={canManage} canTxn={canTxn} canAddMember={canAddMember} closed={closed}
              orderIds={orderIds} membersById={membersById} alreadyReceived={alreadyReceived} openRounds={openRounds}
              onMoveOrder={moveOrder} onSaveOrder={saveOrder} onOpenModal={openModal}
              onRemoveMember={removeMember} onToggleSelf={toggleSelf}
            />
          )}
          {type === "FIXED" && (
            <FixedSection
              plan={plan} details={details} currency={currency} money={money}
              canManage={canManage} canTxn={canTxn} closed={closed}
              onGenerate={generateInstallments} onOpenModal={openModal}
            />
          )}
          {type === "FLEXIBLE" && (
            <FlexSection
              plan={plan} details={details} currency={currency} money={money}
              canTxn={canTxn} canManage={canManage} canManageTxn={canManageTxn} closed={closed}
              onOpenModal={openModal} onDelete={deleteFlexTxn}
            />
          )}
        </>
      )}

      <ModalPopup
        modal={modal} form={form} set={set} busy={busy}
        currency={currency} account={plan?.Account} walletId={plan?.WalletID} plan={plan}
        members={details?.members || []} openRounds={openRounds} money={money}
        alreadyReceived={alreadyReceived}
        onClose={() => (busy ? null : setModal(null))} onSubmit={submitModal}
      />
    </div>
  );
}

/* ---------------- GROUP ---------------- */

function GroupSection({ plan, details, money, canManage, canTxn, canAddMember, closed, orderIds, membersById, alreadyReceived, openRounds, onMoveOrder, onSaveOrder, onOpenModal, onRemoveMember, onToggleSelf }) {
  const group = plan.Group || {};
  const summary = plan.Summary || {};
  const obligations = details?.obligations || [];
  const rounds = details?.rounds || [];

  const orderedMembers = orderIds.map((id) => membersById[id]).filter(Boolean);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Tile label="মোট জমা" value={money(summary.Collected)} />
        <Tile label="মোট গ্রহণ" value={money(summary.PaidOut)} />
        <Tile label="ব্যালেন্স" value={money(summary.Balance)} />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
        <span>কিস্তি: <b className="text-slate-700 dark:text-gray-200">{money(group.Contribution)}</b></span>
        <span>রাউন্ড: <b className="text-slate-700 dark:text-gray-200">{group.Rounds}</b></span>
        <span>সদস্য: <b className="text-slate-700 dark:text-gray-200">{group.MemberCount}</b></span>
        <span>ফ্রিকোয়েন্সি: <b className="text-slate-700 dark:text-gray-200">{group.Frequency}</b></span>
      </div>

      {canTxn && (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => onOpenModal("contribution")} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs shadow-sm">
            <i className="fa-solid fa-arrow-down me-1"></i> কিস্তি জমা
          </button>
          <button
            onClick={() => onOpenModal("payout")}
            disabled={openRounds.length === 0}
            className="bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-xs shadow-sm"
          >
            <i className="fa-solid fa-arrow-up me-1"></i> পেআউট গ্রহণ
          </button>
        </div>
      )}

      {canManage && !closed && orderedMembers.length > 0 && !orderedMembers.some((m) => m.IsSelf) && (
        <div className="text-[11px] rounded-xl p-2.5 border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 flex items-start gap-2">
          <i className="fa-solid fa-circle-info mt-0.5"></i>
          <span>নিচের তালিকা থেকে একজন সদস্যকে <b>আমি</b> হিসেবে চিহ্নিত করুন। শুধু চিহ্নিত সদস্যের কিস্তি আপনার Wallet থেকে কাটবে এবং তার পেআউট Wallet-এ যোগ হবে।</span>
        </div>
      )}

      {/* Members */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold text-slate-700 dark:text-gray-200">সদস্য ({orderedMembers.length})</h3>
          <div className="flex gap-1.5">
            {canManage && orderedMembers.length > 1 && (
              <button onClick={onSaveOrder} className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-800 dark:bg-gray-700 text-white">ক্রম সংরক্ষণ</button>
            )}
            {canAddMember && (
              <button onClick={() => onOpenModal("add-member")} className="text-[10px] font-bold px-2 py-1 rounded-lg border border-gray-300 dark:border-slate-600 text-slate-600 dark:text-gray-300">
                <i className="fa-solid fa-plus me-0.5"></i> যোগ
              </button>
            )}
          </div>
        </div>
        {orderedMembers.length === 0 ? (
          <div className="text-[11px] text-gray-400 dark:text-gray-500">কোনো সদস্য নেই</div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-slate-700">
            {orderedMembers.map((m, idx) => (
              <li key={m.MemberID} className="py-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-300 text-[10px] font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                  <span className="text-xs font-semibold text-slate-700 dark:text-gray-200 truncate">
                    {m.MemberName}
                    {m.IsSelf && <span className="ms-1.5 text-[9px] font-bold text-sky-600 dark:text-sky-400">আমি</span>}
                    {alreadyReceived[String(m.MemberID)] && <span className="ms-1.5 text-[9px] font-bold text-emerald-600 dark:text-emerald-400">✓ গ্রহণ করেছেন</span>}
                  </span>
                </div>
                {canManage && !closed && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onToggleSelf(m)}
                      title="আমার অ্যাকাউন্ট হিসেবে চিহ্নিত করুন"
                      className={`h-6 px-1.5 rounded border text-[9px] font-bold ${m.IsSelf ? "border-sky-400 text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/30" : "border-gray-200 dark:border-slate-600 text-gray-500"}`}
                    >
                      আমি
                    </button>
                    <button onClick={() => onMoveOrder(idx, -1)} disabled={idx === 0} className="w-6 h-6 rounded border border-gray-200 dark:border-slate-600 text-gray-500 disabled:opacity-30"><i className="fa-solid fa-chevron-up text-[9px]"></i></button>
                    <button onClick={() => onMoveOrder(idx, 1)} disabled={idx === orderedMembers.length - 1} className="w-6 h-6 rounded border border-gray-200 dark:border-slate-600 text-gray-500 disabled:opacity-30"><i className="fa-solid fa-chevron-down text-[9px]"></i></button>
                    <button onClick={() => onOpenModal("edit-member", { memberId: m.MemberID, memberName: m.MemberName })} className="w-6 h-6 rounded border border-gray-200 dark:border-slate-600 text-gray-500"><i className="fa-solid fa-pen text-[9px]"></i></button>
                    <button onClick={() => onRemoveMember(m)} className="w-6 h-6 rounded border border-gray-200 dark:border-slate-600 text-rose-500"><i className="fa-solid fa-trash text-[9px]"></i></button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Obligations */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl p-3">
        <h3 className="text-xs font-bold text-slate-700 dark:text-gray-200 mb-2">কিস্তি রেকর্ড ({obligations.length})</h3>
        {obligations.length === 0 ? (
          <div className="text-[11px] text-gray-400 dark:text-gray-500">এখনো কোনো কিস্তি জমা হয়নি</div>
        ) : (
          <div className="space-y-1.5">
            {[...obligations].sort((a, b) => (Number(a.Round) - Number(b.Round)) || String(a.MemberID).localeCompare(String(b.MemberID))).map((o) => (
              <div key={o.ObligationID} className="flex items-center justify-between text-[11px] py-1.5 border-b border-gray-50 dark:border-slate-700/50 last:border-0">
                <div>
                  <span className="font-semibold text-slate-700 dark:text-gray-200">{membersById[String(o.MemberID)]?.MemberName || "—"}</span>
                  <span className="text-gray-400 dark:text-gray-500"> • রাউন্ড {o.Round}</span>
                  {o.DueDate && <span className="text-gray-400 dark:text-gray-500"> • {fmtDate(o.DueDate)}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-600 dark:text-gray-300">{money(o.PaidAmount)}/{money(o.RequiredAmount)}</span>
                  <StatusBadge status={o.EffectiveStatus || o.Status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rounds */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl p-3">
        <h3 className="text-xs font-bold text-slate-700 dark:text-gray-200 mb-2">রাউন্ড ({rounds.length})</h3>
        {rounds.length === 0 ? (
          <div className="text-[11px] text-gray-400 dark:text-gray-500">এখনো কোনো রাউন্ড শুরু হয়নি</div>
        ) : (
          <div className="space-y-1.5">
            {[...rounds].sort((a, b) => Number(a.Round) - Number(b.Round)).map((r) => (
              <div key={r.RoundID} className="flex items-center justify-between text-[11px] py-1.5 border-b border-gray-50 dark:border-slate-700/50 last:border-0">
                <div>
                  <span className="font-semibold text-slate-700 dark:text-gray-200">রাউন্ড {r.Round}</span>
                  {r.RecipientMemberID && <span className="text-gray-400 dark:text-gray-500"> • {membersById[String(r.RecipientMemberID)]?.MemberName || "—"}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 dark:text-gray-400">জমা {money(r.CollectedAmount)}/{money(r.ExpectedAmount)}</span>
                  <span className="font-semibold text-slate-600 dark:text-gray-300">{money(r.PayoutAmount)}</span>
                  <StatusBadge status={r.Status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- FIXED ---------------- */

function FixedSection({ plan, details, money, canManage, canTxn, closed, onGenerate, onOpenModal }) {
  const fixed = plan.Fixed || {};
  const summary = plan.Summary || {};
  const installments = details?.installments || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Tile label="নির্ধারিত" value={money(summary.Required)} />
        <Tile label="পরিশোধিত" value={money(summary.Paid)} tone="text-emerald-600 dark:text-emerald-400" />
        <Tile label="বাকি" value={money(summary.Balance)} tone="text-rose-600 dark:text-rose-400" />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
        <span>কিস্তি: <b className="text-slate-700 dark:text-gray-200">{money(fixed.Amount)}</b></span>
        <span>মেয়াদ: <b className="text-slate-700 dark:text-gray-200">{fixed.DurationMonths} মাস</b></span>
        {fixed.DueDay ? <span>কিস্তির দিন: <b className="text-slate-700 dark:text-gray-200">{fixed.DueDay}</b></span> : null}
      </div>

      {fixed.ClosedDate && (
        <div className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl p-3 text-[11px] text-gray-600 dark:text-gray-300">
          <div>বন্ধের তারিখ: <b>{fmtDate(fixed.ClosedDate)}</b></div>
          {Number(fixed.ClosureAmount) > 0 && <div>ফেরত/উত্তোলন: <b>{money(fixed.ClosureAmount)}</b></div>}
          {fixed.ClosureNote && <div>নোট: {fixed.ClosureNote}</div>}
        </div>
      )}

      {!closed && (
        <div className="grid grid-cols-2 gap-2">
          {installments.length === 0 && canManage && (
            <button onClick={onGenerate} className="col-span-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs shadow-sm">
              <i className="fa-solid fa-list-check me-1"></i> কিস্তি তৈরি করুন
            </button>
          )}
          {installments.length > 0 && canManage && (
            <button
              onClick={() => onOpenModal("close-fixed")}
              className="col-span-2 bg-slate-800 dark:bg-gray-700 hover:bg-slate-900 text-white font-bold py-2.5 rounded-xl text-xs shadow-sm"
            >
              <i className="fa-solid fa-lock me-1"></i> পরিকল্পনা বন্ধ করুন
            </button>
          )}
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl p-3">
        <h3 className="text-xs font-bold text-slate-700 dark:text-gray-200 mb-2">কিস্তি ({installments.length})</h3>
        {installments.length === 0 ? (
          <div className="text-[11px] text-gray-400 dark:text-gray-500">কোনো কিস্তি তৈরি হয়নি</div>
        ) : (
          <div className="space-y-1.5">
            {[...installments].sort((a, b) => Number(a.InstallmentNo) - Number(b.InstallmentNo)).map((it) => {
              const remaining = Math.max(0, (Number(it.RequiredAmount) || 0) - (Number(it.ActualAmount) || 0));
              return (
                <div key={it.InstallmentID} className="flex items-center justify-between text-[11px] py-1.5 border-b border-gray-50 dark:border-slate-700/50 last:border-0">
                  <div>
                    <span className="font-semibold text-slate-700 dark:text-gray-200">কিস্তি {it.InstallmentNo}</span>
                    {it.DueDate && <span className="text-gray-400 dark:text-gray-500"> • {fmtDate(it.DueDate)}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 dark:text-gray-400">{money(it.ActualAmount)}/{money(it.RequiredAmount)}</span>
                    <StatusBadge status={it.EffectiveStatus || it.Status} />
                    {canTxn && !closed && remaining > 0 && (
                      <button
                        onClick={() => onOpenModal("pay-installment", { installmentId: it.InstallmentID })}
                        className="text-[10px] font-bold px-2 py-1 rounded-lg bg-emerald-600 text-white"
                      >
                        পরিশোধ
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- FLEXIBLE ---------------- */

function FlexSection({ plan, details, money, canTxn, canManage, canManageTxn, closed, onOpenModal, onDelete }) {
  const summary = plan.Summary || {};
  const deposits = (details?.deposits || []).map((d) => ({ ...d, _kind: "deposit", _id: d.DepositID }));
  const withdrawals = (details?.withdrawals || []).map((w) => ({ ...w, _kind: "withdrawal", _id: w.WithdrawalID }));
  const txns = [...deposits, ...withdrawals].sort((a, b) => {
    const da = String(a.Date || ""), db = String(b.Date || "");
    if (db !== da) return db > da ? 1 : -1;
    const ca = String(a.CreatedAt || ""), cb = String(b.CreatedAt || "");
    if (cb !== ca) return cb > ca ? 1 : -1;
    return String(b._id).localeCompare(String(a._id));
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Tile label="মোট জমা" value={money(summary.Deposited)} />
        <Tile label="মোট উত্তোলন" value={money(summary.Withdrawn)} />
        <Tile label="ব্যালেন্স" value={money(summary.Balance)} tone="text-emerald-600 dark:text-emerald-400" />
      </div>

      {canTxn && (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => onOpenModal("deposit")} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs shadow-sm">
            <i className="fa-solid fa-arrow-down me-1"></i> জমা দিন
          </button>
          <button onClick={() => onOpenModal("withdraw")} className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 rounded-xl text-xs shadow-sm">
            <i className="fa-solid fa-arrow-up me-1"></i> উত্তোলন
          </button>
        </div>
      )}

      {canManage && !closed && (
        <button
          onClick={() => onOpenModal("close-flex")}
          className="w-full border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 font-bold py-2.5 rounded-xl text-xs"
        >
          <i className="fa-solid fa-lock me-1"></i> সঞ্চয় বন্ধ করুন
        </button>
      )}

      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl p-3">
        <h3 className="text-xs font-bold text-slate-700 dark:text-gray-200 mb-2">লেনদেন ({txns.length})</h3>
        {txns.length === 0 ? (
          <div className="text-[11px] text-gray-400 dark:text-gray-500">কোনো লেনদেন নেই</div>
        ) : (
          <div className="space-y-1.5">
            {txns.map((t) => (
              <div key={t._kind + t._id} className="flex items-center justify-between text-[11px] py-1.5 border-b border-gray-50 dark:border-slate-700/50 last:border-0">
                <div className="flex items-center gap-2">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center ${t._kind === "deposit" ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400" : "bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400"}`}>
                    <i className={`fa-solid ${t._kind === "deposit" ? "fa-arrow-down" : "fa-arrow-up"} text-[9px]`}></i>
                  </span>
                  <div>
                    <div className="font-semibold text-slate-700 dark:text-gray-200">{t._kind === "deposit" ? "জমা" : "উত্তোলন"}</div>
                    <div className="text-gray-400 dark:text-gray-500">{fmtDate(t.Date)}{t.Description ? ` • ${t.Description}` : ""}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`font-bold ${t._kind === "deposit" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                    {t._kind === "deposit" ? "-" : "+"}{money(t.Amount)}
                  </span>
                  {canManageTxn && !closed && (
                    <button onClick={() => onDelete(t._id, t._kind === "deposit" ? "deposit" : "withdrawal")} className="w-6 h-6 rounded border border-gray-200 dark:border-slate-600 text-rose-500">
                      <i className="fa-solid fa-trash text-[9px]"></i>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- MODAL ---------------- */

function ModalPopup({ modal, form, set, busy, currency, walletId, plan, members, openRounds, money, alreadyReceived, onClose, onSubmit }) {
  if (!modal) return null;
  const kind = modal.kind;

  const titles = {
    "add-member": "সদস্য যোগ করুন",
    "edit-member": "সদস্যের নাম সম্পাদনা",
    contribution: "কিস্তি জমা",
    payout: "পেউআউট / গ্রহণ",
    "pay-installment": "কিস্তি পরিশোধ",
    "close-fixed": "পরিকল্পনা বন্ধ করুন",
    "close-flex": "সঞ্চয় বন্ধ করুন",
    deposit: "সঞ্চয়ে জমা",
    withdraw: "সঞ্চয় উত্তোলন",
  };

  const isAmount = ["contribution", "payout", "pay-installment", "deposit", "withdraw"].includes(kind);
  const showDate = kind !== "add-member" && kind !== "edit-member" && kind !== "close-fixed" && kind !== "close-flex";
  const showAccount = isAmount || kind === "close-flex";

  const availableRecipients = (members || []).filter((m) => !alreadyReceived[String(m.MemberID)] || String(m.MemberID) === String(form.recipientMemberId));
  const selectedMember = (members || []).find((m) => String(m.MemberID) === String(form.memberId));
  const selectedRecipient = (members || []).find((m) => String(m.MemberID) === String(form.recipientMemberId));

  return (
    <Popup open title={titles[kind] || "সঞ্চয়"} onClose={onClose}>
      <div className="space-y-3">
        {(kind === "add-member" || kind === "edit-member") && (
          <Field label="সদস্যের নাম">
            <input
              type="text"
              value={form.memberName || ""}
              onChange={(e) => set({ memberName: e.target.value })}
              placeholder="নাম লিখুন"
              className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100"
            />
          </Field>
        )}

        {kind === "contribution" && (
          <>
            <Field label="সদস্য">
              <Select value={form.memberId} onChange={(v) => set({ memberId: v })}>
                {(members || []).map((m) => <option key={m.MemberID} value={m.MemberID}>{m.MemberName}</option>)}
              </Select>
            </Field>
            <Field label="রাউন্ড">
              <input type="number" min="1" max={members?.length || undefined} value={form.round || ""} onChange={(e) => set({ round: e.target.value })} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100" />
            </Field>
            <div className={`text-[10px] rounded-xl p-2 ${selectedMember?.IsSelf ? "bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-300" : "bg-slate-50 dark:bg-slate-700/40 text-slate-500 dark:text-gray-400"}`}>
              {selectedMember?.IsSelf ? "এই সদস্য 'আমি' — Wallet থেকে টাকা কাটা হবে।" : "এই সদস্য 'আমি' নয় — শুধু রেকর্ড হবে, Wallet থেকে টাকা কাটা হবে না।"}
            </div>
          </>
        )}

        {kind === "payout" && (
          <>
            <Field label="রাউন্ড">
              <Select value={form.round} onChange={(v) => {
                const r = openRounds.find((x) => String(x.Round) === String(v));
                set({ round: v, amount: r ? String(r.CollectedAmount) : form.amount });
              }}>
                {openRounds.length === 0 && <option value="">কোনো খোলা রাউন্ড নেই</option>}
                {openRounds.map((r) => <option key={r.RoundID} value={String(r.Round)}>{`রাউন্ড ${r.Round} (জমা ${money(r.CollectedAmount)})`}</option>)}
              </Select>
            </Field>
            <Field label="গ্রহণকারী সদস্য">
              <Select value={form.recipientMemberId} onChange={(v) => set({ recipientMemberId: v })}>
                <option value="">সদস্য নির্বাচন করুন</option>
                {availableRecipients.map((m) => <option key={m.MemberID} value={m.MemberID}>{m.MemberName}</option>)}
              </Select>
            </Field>
            <div className={`text-[10px] rounded-xl p-2 ${selectedRecipient?.IsSelf ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300" : "bg-slate-50 dark:bg-slate-700/40 text-slate-500 dark:text-gray-400"}`}>
              {selectedRecipient?.IsSelf ? "গ্রহণকারী 'আমি' — টাকা Wallet-এ যোগ হবে।" : "গ্রহণকারী 'আমি' নয় — Wallet-এ টাকা যোগ হবে না, শুধু রেকর্ড হবে।"}
            </div>
          </>
        )}

        {isAmount && (
          <Field label={`পরিমাণ (${currency})`}>
            <input type="number" step="any" min="0.01" value={form.amount || ""} onChange={(e) => set({ amount: e.target.value })} placeholder="0.00" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm font-semibold bg-white dark:bg-gray-900 dark:text-gray-100" />
          </Field>
        )}

        {showDate && (
          <Field label="তারিখ">
            <input type="date" value={form.date || ""} onChange={(e) => set({ date: e.target.value })} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100" />
          </Field>
        )}

        {showAccount && (
          <Field label="Wallet Account">
            <AccountSelect walletId={walletId} value={form.account} onChange={(v) => set({ account: v })} />
          </Field>
        )}

        {kind === "contribution" && (
          <Field label="নোট (ঐচ্ছিক)">
            <input type="text" value={form.note || ""} onChange={(e) => set({ note: e.target.value })} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100" />
          </Field>
        )}

        {(kind === "deposit" || kind === "withdraw") && (
          <Field label="বিবরণ (ঐচ্ছিক)">
            <input type="text" value={form.description || ""} onChange={(e) => set({ description: e.target.value })} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100" />
          </Field>
        )}

        {kind === "close-fixed" && (
          <>
            <Field label="বন্ধের তারিখ">
              <input type="date" value={form.closureDate || ""} onChange={(e) => set({ closureDate: e.target.value })} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100" />
            </Field>
            <Field label={`ফেরত পরিমাণ (ঐচ্ছিক, ${currency})`}>
              <input type="number" step="any" min="0" value={form.closureAmount || ""} onChange={(e) => set({ closureAmount: e.target.value })} placeholder="0.00" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100" />
            </Field>
            <Field label="নোট (ঐচ্ছিক)">
              <input type="text" value={form.closureNote || ""} onChange={(e) => set({ closureNote: e.target.value })} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100" />
            </Field>
          </>
        )}

        {kind === "close-flex" && (
          <>
            <div className="text-[11px] rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 p-2.5">
              বন্ধ করলে অবশিষ্ট সঞ্চয় ব্যালেন্স ({money(plan?.Summary?.Balance || 0)}) ওয়ালেটে ফেরত যাবে।
            </div>
            <Field label="বন্ধের তারিখ">
              <input type="date" value={form.closureDate || ""} onChange={(e) => set({ closureDate: e.target.value })} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100" />
            </Field>
            <Field label={`ফেরত পরিমাণ (${currency})`}>
              <input type="number" step="any" min="0" value={form.closureAmount || ""} readOnly className="w-full border border-gray-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-gray-50 dark:bg-slate-700 text-gray-500 dark:text-gray-400" />
            </Field>
            <Field label="নোট (ঐচ্ছিক)">
              <input type="text" value={form.closureNote || ""} onChange={(e) => set({ closureNote: e.target.value })} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100" />
            </Field>
          </>
        )}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={busy} className="flex-1 border border-gray-300 dark:border-gray-700 text-slate-700 dark:text-gray-200 font-bold py-2.5 rounded-xl text-xs">বাতিল</button>
          <button type="button" onClick={onSubmit} disabled={busy} className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-xs">
            {busy ? <i className="fa-solid fa-spinner fa-spin"></i> : "নিশ্চিত করুন"}
          </button>
        </div>
      </div>
    </Popup>
  );
}
