// ---------------- REPORTS ----------------

function dateRangeForPeriod_(period, periodValue) {
  function localDateFromParts_(str, fallback) {
    if (!str) return fallback || new Date();
    var parts = String(str).split("-").map(Number);
    if (parts.length === 3) return new Date(parts[0], parts[1] - 1, parts[2]);
    if (parts.length === 2) return new Date(parts[0], parts[1] - 1, 1);
    return fallback || new Date();
  }

  var start, end;
  if (period === "daily") {
    var dd = localDateFromParts_(periodValue);
    start = periodValue || Utilities.formatDate(dd, Session.getScriptTimeZone(), "yyyy-MM-dd");
    end = start;
  } else if (period === "weekly") {
    var d = localDateFromParts_(periodValue);
    var day = d.getDay();
    var monday = new Date(d); monday.setDate(d.getDate() - ((day + 6) % 7));
    var sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    start = Utilities.formatDate(monday, Session.getScriptTimeZone(), "yyyy-MM-dd");
    end = Utilities.formatDate(sunday, Session.getScriptTimeZone(), "yyyy-MM-dd");
  } else if (period === "yearly") {
    var y = periodValue || String(new Date().getFullYear());
    start = y + "-01-01"; end = y + "-12-31";
  } else if (period === "custom") {
    // periodValue carries the range as "yyyy-MM-dd:yyyy-MM-dd". A single date or
    // a malformed half falls back to a one-day window so the report never runs
    // against an unbounded range.
    var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
    var seg = String(periodValue || "").split(":");
    start = /^\d{4}-\d{2}-\d{2}$/.test(seg[0] || "") ? seg[0] : today;
    end = /^\d{4}-\d{2}-\d{2}$/.test(seg[1] || "") ? seg[1] : start;
    if (start > end) { var swap = start; start = end; end = swap; }
  } else {
    var m = periodValue || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM");
    start = m + "-01";
    var lastDay = new Date(Number(m.split("-")[0]), Number(m.split("-")[1]), 0).getDate();
    end = m + "-" + ("0" + lastDay).slice(-2);
  }
  return { start: start, end: end };
}

// Shop market purchases are recorded in ShopMarkets, not as wallet transactions,
// so a normal expense report would silently omit them. Project the active markets
// of every shop linked to this wallet into report-only Expense rows. They carry
// no Account, so they never touch account balances or account-filtered totals;
// they are counted once as an expense when the report covers "All" accounts.
function shopLedgerReportExpenseRows_(walletId, range, currency) {
  var sheets = shopLedgerSheets_();
  var walletKey = String(walletId);
  var shops = {};
  shopLedgerRows_(sheets.shops, SHOP_LEDGER_HEADERS).forEach(function (shop) {
    if (String(shop.WalletID) !== walletKey) return;
    shops[String(shop.ShopID)] = shop;
  });
  if (!Object.keys(shops).length) return [];
  var rows = [];
  shopLedgerRows_(sheets.markets, SHOP_MARKET_HEADERS).forEach(function (market) {
    if (market.Status !== SHOP_LEDGER_ACTIVE) return;
    var shop = shops[String(market.ShopID)];
    if (!shop) return;
    var date = String(market.Date || "");
    if (date < range.start || date > range.end) return;
    rows.push({
      ID: market.MarketID,
      Date: date,
      Type: "Expense",
      Currency: currency,
      Account: "",
      SourceCategory: "Shop Credit",
      WhereVendor: shop.Name,
      Description: "Shop credit purchase: " + shop.Name,
      Amount: amountOf_(centsOf_(market.Total)),
      Note: "",
      User: market.CreatedBy,
      ShopID: shop.ShopID,
      MarketID: market.MarketID,
      ShopMarket: true,
    });
  });
  return rows;
}

function getReport(username, walletId, period, periodValue) {
  setupDatabase();
  var permErr = authorize_(username, "VIEW_REPORTS", [walletId]);
  if (permErr) return permErr;

  var resolved = resolveWalletSheet_(walletId);
  if (!resolved) return err_("Wallet পাওয়া যায়নি!");
  var range = dateRangeForPeriod_(period || "monthly", periodValue);
  var all = readWalletTransactions_(resolved.sheet, resolved.wallet)
    .filter(function (t) { return t.Date >= range.start && t.Date <= range.end; });
  all = all.concat(shopLedgerReportExpenseRows_(walletId, range, resolved.wallet.Currency));

  // Every total, breakdown and net figure is accumulated in integer cents and
  // converted back once at the end: summing raw floats makes a period report
  // drift by fractions of a taka (0.1 + 0.2 !== 0.3), which is exactly the kind
  // of number a user must never be shown for their money.
  var incomeCents = 0, expenseCents = 0;
  var categoryCents = {};
  // The wallet's own accounts seed the breakdown so every account it uses shows
  // a figure (even 0), while the accumulation below still picks up any account
  // id found on a historical row that predates the registry.
  var walletAccounts = financialAccountsForWallet_(walletId, { includeInactive: true });
  var accountCents = {};
  walletAccounts.forEach(function (a) { accountCents[a.AccountID] = 0; });
  all.forEach(function (t) {
    var amt = centsOf_(t.Amount);
    if (t.Type === "Income") incomeCents += amt;
    if (t.Type === "Expense") {
      expenseCents += amt;
      var cat = t.SourceCategory || "Other";
      categoryCents[cat] = (categoryCents[cat] || 0) + amt;
    }
    // Report-only shop market rows have no wallet account: skip them so the
    // per-account movement breakdown never gains an empty "account" entry.
    if (t.ShopMarket) return;
    if (t.Type === "Income" || t.Type === "Transfer In" || t.Type === "Loan In" || t.Type === "Loan Repaid" || t.Type === "Savings Withdrawal" || t.Type === "Savings Payout" || t.Type === "Shop Credit Payment Reversal") {
      accountCents[t.Account] = (accountCents[t.Account] || 0) + amt;
    }
    if (t.Type === "Expense" || t.Type === "Transfer Out" || t.Type === "Loan Out" || t.Type === "Loan Payment" || t.Type === "Savings Deposit" || t.Type === "Savings Contribution" || t.Type === "Savings Payment" || t.Type === "Shop Credit Payment") {
      accountCents[t.Account] = (accountCents[t.Account] || 0) - amt;
    }
  });

  // accountBreakdown is the NET MOVEMENT per account over the selected period
  // (inflows - outflows, including transfers and loan effects). It is NOT the
  // account's current balance: that also depends on the opening balance and
  // every transaction outside this period. The UI labels it accordingly.
  var categoryBreakdown = {};
  Object.keys(categoryCents).forEach(function (cat) { categoryBreakdown[cat] = amountOf_(categoryCents[cat]); });
  var accountBreakdown = {};
  Object.keys(accountCents).forEach(function (id) { accountBreakdown[id] = amountOf_(accountCents[id] || 0); });
  // netChange is Income - Expense ONLY. Transfers and loan movements are money
  // that moved without being earned or spent, so counting them here would make
  // a period with no income/expense look like it had changed the balance.
  var totalIncome = amountOf_(incomeCents);
  var totalExpense = amountOf_(expenseCents);

  return {
    status: "SUCCESS", walletId: walletId, walletName: resolved.wallet.WalletName, currency: resolved.wallet.Currency,
    period: period || "monthly", range: range, totalIncome: totalIncome, totalExpense: totalExpense,
    netChange: amountOf_(incomeCents - expenseCents), transactionCount: all.length,
    categoryBreakdown: categoryBreakdown, accountBreakdown: accountBreakdown,
    accounts: walletAccounts.map(function (a) {
      return { accountId: a.AccountID, name: a.Name, accountTypeId: a.AccountTypeID, icon: a.Icon, status: a.Status };
    }),
    transactions: all,
  };
}
