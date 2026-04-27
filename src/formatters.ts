import type { AccountInfo } from "./whooing-client.js";

function formatAmount(amount: number): string {
  return amount.toLocaleString("ko-KR") + "원";
}

interface AccountEntry {
  account_id: string;
  money: number;
}

interface CategoryGroup {
  total: number;
  accounts: AccountEntry[];
}

interface PLResults {
  expenses?: CategoryGroup;
  income?: CategoryGroup;
  net_income?: { total: number };
}

export function formatPL(
  results: PLResults,
  accounts: Map<string, AccountInfo>,
  startDate: string,
  endDate: string
): string {
  const lines: string[] = [];
  lines.push(`## 손익 (${startDate} ~ ${endDate})`);
  lines.push("");

  // Expenses
  const expenseAccounts = (results.expenses?.accounts ?? [])
    .filter((item) => item.money > 0)
    .sort((a, b) => b.money - a.money);

  if (expenseAccounts.length > 0) {
    lines.push(`### 지출: ${formatAmount(results.expenses?.total ?? 0)}`);
    for (const item of expenseAccounts) {
      const name = accounts.get(item.account_id)?.name ?? item.account_id;
      lines.push(`- ${name}: ${formatAmount(item.money)}`);
    }
    lines.push("");
  }

  // Income
  const incomeAccounts = (results.income?.accounts ?? [])
    .filter((item) => item.money > 0)
    .sort((a, b) => b.money - a.money);

  if (incomeAccounts.length > 0) {
    lines.push(`### 수입: ${formatAmount(results.income?.total ?? 0)}`);
    for (const item of incomeAccounts) {
      const name = accounts.get(item.account_id)?.name ?? item.account_id;
      lines.push(`- ${name}: ${formatAmount(item.money)}`);
    }
    lines.push("");
  }

  if (results.net_income) {
    lines.push(`### 순이익: ${formatAmount(results.net_income.total)}`);
  }

  if (expenseAccounts.length === 0 && incomeAccounts.length === 0) {
    lines.push("해당 기간에 데이터가 없습니다.");
  }

  return lines.join("\n");
}

interface EntryItem {
  entry_id: number;
  entry_date: string;
  l_account: string;
  l_account_id: string;
  r_account: string;
  r_account_id: string;
  item: string;
  money: number;
  memo: string;
}

interface EntryResults {
  rows?: EntryItem[];
}

export function formatEntries(
  results: EntryResults,
  accounts: Map<string, AccountInfo>
): string {
  const rows = results.rows ?? [];
  if (rows.length === 0) {
    return "해당 기간에 거래 내역이 없습니다.";
  }

  const lines: string[] = [];
  lines.push(`## 거래 내역 (${rows.length}건)`);
  lines.push("");

  for (const row of rows) {
    const date = formatDate(row.entry_date);
    const lName = accounts.get(row.l_account_id)?.name ?? row.l_account_id;
    const rName = accounts.get(row.r_account_id)?.name ?? row.r_account_id;
    const item = row.item || "(항목 없음)";
    const memo = row.memo ? ` — ${row.memo}` : "";
    lines.push(
      `- **${date}** ${item} ${formatAmount(row.money)} [${lName} ← ${rName}]${memo} (id:${row.entry_id})`
    );
  }

  return lines.join("\n");
}

function formatDate(dateStr: string): string {
  // Handle YYYYMMDD or YYYYMMDD.NNNN format
  const base = dateStr.split(".")[0];
  if (base.length === 8) {
    return `${base.slice(0, 4)}-${base.slice(4, 6)}-${base.slice(6, 8)}`;
  }
  return dateStr;
}

interface BSResults {
  assets?: CategoryGroup;
  liabilities?: CategoryGroup;
  capital?: CategoryGroup;
}

export function formatBalance(
  results: BSResults,
  accounts: Map<string, AccountInfo>,
  startDate: string,
  endDate: string
): string {
  const lines: string[] = [];
  lines.push(`## 자산/부채 현황 (${startDate} ~ ${endDate})`);
  lines.push("");

  const sections: [string, CategoryGroup | undefined][] = [
    ["자산", results.assets],
    ["부채", results.liabilities],
    ["자본", results.capital],
  ];

  for (const [title, group] of sections) {
    const filtered = (group?.accounts ?? [])
      .filter((item) => item.money !== 0)
      .sort((a, b) => Math.abs(b.money) - Math.abs(a.money));

    if (filtered.length > 0) {
      lines.push(`### ${title}: ${formatAmount(group?.total ?? 0)}`);
      for (const item of filtered) {
        const name = accounts.get(item.account_id)?.name ?? item.account_id;
        lines.push(`- ${name}: ${formatAmount(item.money)}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

interface BudgetItem {
  account_id: string;
  budget: number;
  money: number;
}

// Budget API returns either { expenses: { accounts: [...] } } or an empty array []
type BudgetResults =
  | { expenses?: { accounts: BudgetItem[] } }
  | BudgetItem[];

export function formatBudget(
  results: BudgetResults,
  accounts: Map<string, AccountInfo>,
  startDate: string,
  endDate: string
): string {
  const lines: string[] = [];
  lines.push(`## 예산 현황 (${startDate} ~ ${endDate})`);
  lines.push("");

  let budgetItems: BudgetItem[] = [];
  if (Array.isArray(results)) {
    // Empty array — no budgets
  } else if (results.expenses?.accounts) {
    budgetItems = results.expenses.accounts;
  }

  const items = budgetItems
    .filter((item) => item.budget > 0 || item.money > 0)
    .sort((a, b) => b.money - a.money);

  if (items.length === 0) {
    lines.push("설정된 예산이 없습니다.");
    return lines.join("\n");
  }

  for (const item of items) {
    const name = accounts.get(item.account_id)?.name ?? item.account_id;
    const pct =
      item.budget > 0 ? Math.round((item.money / item.budget) * 100) : 0;
    const status = pct > 100 ? " (초과!)" : "";
    lines.push(
      `- ${name}: ${formatAmount(item.money)} / ${formatAmount(item.budget)} (${pct}%)${status}`
    );
  }

  return lines.join("\n");
}

interface AccountItem {
  account_id: string;
  title: string;
  type: string;
  memo?: string;
  open_date?: string;
  close_date?: string;
  category?: string;
}

export function formatAccounts(
  results: Record<string, AccountItem[]>
): string {
  const lines: string[] = [];
  lines.push("## 계정 목록");
  lines.push("");

  const typeNames: Record<string, string> = {
    assets: "자산",
    liabilities: "부채",
    capital: "자본",
    income: "수입",
    expenses: "지출",
  };

  for (const [type, accounts] of Object.entries(results)) {
    if (!Array.isArray(accounts) || accounts.length === 0) continue;
    const typeName = typeNames[type] ?? type;
    lines.push(`### ${typeName}`);
    for (const acc of accounts) {
      const memo = acc.memo ? ` (${acc.memo})` : "";
      lines.push(`- ${acc.account_id}: ${acc.title}${memo}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

interface FrequentItem {
  item_id: string;
  item: string;
  money: number;
  l_account: string;
  l_account_id: string;
  r_account: string;
  r_account_id: string;
}

export function formatFrequentItems(
  results: Record<string, FrequentItem[]>,
  accounts: Map<string, AccountInfo>
): string {
  const lines: string[] = [];
  lines.push("## 자주 쓰는 거래");
  lines.push("");

  let hasItems = false;
  for (const [slot, items] of Object.entries(results)) {
    if (!Array.isArray(items) || items.length === 0) continue;
    hasItems = true;
    lines.push(`### ${slot}`);
    for (const item of items) {
      const lName = accounts.get(item.l_account_id)?.name ?? item.l_account_id;
      const rName = accounts.get(item.r_account_id)?.name ?? item.r_account_id;
      lines.push(
        `- **${item.item}** ${formatAmount(item.money)} [${lName} ← ${rName}] (id:${item.item_id})`
      );
    }
    lines.push("");
  }

  if (!hasItems) {
    lines.push("등록된 자주 쓰는 거래가 없습니다.");
  }

  return lines.join("\n");
}

interface LatestItem {
  item: string;
  money: number;
  l_account: string;
  l_account_id: string;
  r_account: string;
  r_account_id: string;
}

export function formatLatestItems(
  results: LatestItem[],
  accounts: Map<string, AccountInfo>
): string {
  const lines: string[] = [];
  lines.push("## 최근 거래 항목 (자동완성용)");
  lines.push("");

  if (!Array.isArray(results) || results.length === 0) {
    lines.push("최근 60일간 거래 항목이 없습니다.");
    return lines.join("\n");
  }

  for (const item of results) {
    const lName = accounts.get(item.l_account_id)?.name ?? item.l_account_id;
    const rName = accounts.get(item.r_account_id)?.name ?? item.r_account_id;
    lines.push(
      `- **${item.item}** ${formatAmount(item.money)} [${lName} ← ${rName}]`
    );
  }

  return lines.join("\n");
}

interface CalendarDay {
  date: string;
  day: number;
  count: number;
  income: number;
  expenses: number;
  etc: number;
}

interface CalendarResults {
  aggregate?: { income: number; expenses: number; etc: number };
  rows?: Record<string, CalendarDay[]>;
}

export function formatCalendar(results: CalendarResults): string {
  const lines: string[] = [];

  const agg = results.aggregate;
  if (agg) {
    lines.push("## 월간 요약");
    lines.push(`- 수입: ${formatAmount(agg.income)}`);
    lines.push(`- 지출: ${formatAmount(agg.expenses)}`);
    if (agg.etc) lines.push(`- 기타: ${formatAmount(agg.etc)}`);
    lines.push("");
  }

  const rows = results.rows ?? {};
  const months = Object.keys(rows).sort();

  if (months.length === 0) {
    lines.push("해당 기간에 데이터가 없습니다.");
    return lines.join("\n");
  }

  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];

  for (const month of months) {
    const days = rows[month].filter((d) => d.count > 0);
    if (days.length === 0) continue;

    const label = `${month.slice(0, 4)}-${month.slice(4, 6)}`;
    lines.push(`### ${label}`);
    for (const d of days) {
      const dateStr = `${String(d.date).slice(0, 4)}-${String(d.date).slice(4, 6)}-${String(d.date).slice(6, 8)}`;
      const dayName = dayNames[d.day] ?? "";
      const parts: string[] = [];
      if (d.income > 0) parts.push(`수입 ${formatAmount(d.income)}`);
      if (d.expenses > 0) parts.push(`지출 ${formatAmount(d.expenses)}`);
      if (d.etc > 0) parts.push(`기타 ${formatAmount(d.etc)}`);
      lines.push(`- ${dateStr}(${dayName}) ${d.count}건: ${parts.join(", ")}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

interface SectionItem {
  section_id: string;
  title: string;
  memo?: string;
  currency?: string;
}

export function formatSections(results: SectionItem[]): string {
  const lines: string[] = [];
  lines.push("## 가계부 (Section) 목록");
  lines.push("");

  if (!Array.isArray(results) || results.length === 0) {
    lines.push("가계부가 없습니다.");
    return lines.join("\n");
  }

  for (const section of results) {
    const currency = section.currency ? ` [${section.currency}]` : "";
    const memo = section.memo ? ` — ${section.memo}` : "";
    lines.push(`- ${section.section_id}: ${section.title}${currency}${memo}`);
  }

  return lines.join("\n");
}
