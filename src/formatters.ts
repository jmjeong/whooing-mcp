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

export interface EntryItem {
  entry_id: number;
  entry_date: string;
  l_account: string;
  l_account_id: string;
  r_account: string;
  r_account_id: string;
  item: string;
  money: number;
  total?: number;
  memo: string;
}

export interface EntryResults {
  rows?: EntryItem[];
}

export interface EntryFilterOptions {
  account_ids?: string[];
  l_account_id?: string;
  r_account_id?: string;
  min_money?: number;
  max_money?: number;
  item_contains?: string;
  memo_contains?: string;
  query?: string;
  keywords?: string[];
}

export interface AccountAggregateResults {
  aggregate?: Record<string, number>;
  rows_type?: string;
  rows?: unknown;
}

function includesCaseInsensitive(value: string | undefined, needle: string): boolean {
  return (value ?? "").toLocaleLowerCase().includes(needle.toLocaleLowerCase());
}

export function filterEntries(
  results: EntryResults,
  filters: EntryFilterOptions
): EntryResults {
  const rows = results.rows ?? [];
  const keywords = [
    ...(filters.query ? [filters.query] : []),
    ...(filters.keywords ?? []),
  ].filter((keyword) => keyword.trim().length > 0);

  const filteredRows = rows.filter((row) => {
    if (filters.l_account_id && row.l_account_id !== filters.l_account_id) {
      return false;
    }
    if (filters.r_account_id && row.r_account_id !== filters.r_account_id) {
      return false;
    }
    if (
      filters.account_ids?.length &&
      !filters.account_ids.includes(row.l_account_id) &&
      !filters.account_ids.includes(row.r_account_id)
    ) {
      return false;
    }
    if (filters.min_money !== undefined && row.money < filters.min_money) {
      return false;
    }
    if (filters.max_money !== undefined && row.money > filters.max_money) {
      return false;
    }
    if (
      filters.item_contains &&
      !includesCaseInsensitive(row.item, filters.item_contains)
    ) {
      return false;
    }
    if (
      filters.memo_contains &&
      !includesCaseInsensitive(row.memo, filters.memo_contains)
    ) {
      return false;
    }
    if (
      keywords.length > 0 &&
      !keywords.some((keyword) =>
        includesCaseInsensitive(`${row.item}\n${row.memo}`, keyword)
      )
    ) {
      return false;
    }
    return true;
  });

  return { ...results, rows: filteredRows };
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

export function formatEntryDetail(
  entry: EntryItem,
  accounts: Map<string, AccountInfo>
): string {
  const lName = accounts.get(entry.l_account_id)?.name ?? entry.l_account_id;
  const rName = accounts.get(entry.r_account_id)?.name ?? entry.r_account_id;
  const item = entry.item || "(항목 없음)";
  const memo = entry.memo ? `\n- 메모: ${entry.memo}` : "";

  return [
    `## 거래 상세 (id:${entry.entry_id})`,
    "",
    `- 날짜: ${formatDate(String(entry.entry_date))}`,
    `- 항목: ${item}`,
    `- 금액: ${formatAmount(Number(entry.money))}`,
    `- 왼쪽 계정: ${lName} (${entry.l_account_id}, ${entry.l_account})`,
    `- 오른쪽 계정: ${rName} (${entry.r_account_id}, ${entry.r_account})`,
    memo,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export interface MonthlySummary {
  month: string;
  income: number;
  expenses: number;
  etc: number;
  count: number;
}

export function summarizeCalendarByMonth(results: CalendarResults): MonthlySummary[] {
  const rows = results.rows ?? {};
  return Object.keys(rows)
    .sort()
    .map((month) => {
      const days = normalizeCalendarDays(rows[month]);
      return {
        month,
        income: days.reduce((sum, day) => sum + Number(day.income ?? 0), 0),
        expenses: days.reduce((sum, day) => sum + Number(day.expenses ?? 0), 0),
        etc: days.reduce((sum, day) => sum + Number(day.etc ?? 0), 0),
        count: days.reduce((sum, day) => sum + Number(day.count ?? 0), 0),
      };
    });
}

export function formatMonthlySummary(results: CalendarResults): string {
  const summaries = summarizeCalendarByMonth(results).filter(
    (item) => item.count > 0 || item.income !== 0 || item.expenses !== 0 || item.etc !== 0
  );

  if (summaries.length === 0) {
    return "해당 기간에 월별 요약 데이터가 없습니다.";
  }

  const lines: string[] = [];
  lines.push("## 월별 요약");
  lines.push("");

  for (const item of summaries) {
    const net = item.income - item.expenses + item.etc;
    lines.push(
      `- ${item.month.slice(0, 4)}-${item.month.slice(4, 6)}: ` +
        `수입 ${formatAmount(item.income)}, ` +
        `지출 ${formatAmount(item.expenses)}, ` +
        `순액 ${formatAmount(net)}, ` +
        `${item.count}건`
    );
  }

  return lines.join("\n");
}

interface ReportSummaryRow {
  date?: string;
  income?: number;
  expenses?: number;
  net_income?: number;
}

interface ReportSummaryResults {
  rows?: Record<string, ReportSummaryRow>;
}

export function formatReportMonthlySummary(results: ReportSummaryResults): string {
  const rows = results.rows ?? {};
  const months = Object.keys(rows).sort();

  if (months.length === 0) {
    return "해당 기간에 월별 요약 데이터가 없습니다.";
  }

  const lines: string[] = [];
  lines.push("## 월별 요약");
  lines.push("");

  for (const month of months) {
    const row = rows[month] ?? {};
    const income = Number(row.income ?? 0);
    const expenses = Number(row.expenses ?? 0);
    const netIncome = Number(row.net_income ?? income - expenses);
    const label = `${month.slice(0, 4)}-${month.slice(4, 6)}`;
    lines.push(
      `- ${label}: ` +
        `수입 ${formatAmount(income)}, ` +
        `지출 ${formatAmount(expenses)}, ` +
        `순이익 ${formatAmount(netIncome)}`
    );
  }

  return lines.join("\n");
}

export interface DuplicateCandidateOptions {
  include_memo?: boolean;
  min_group_size?: number;
}

export function findDuplicateCandidates(
  results: EntryResults,
  options: DuplicateCandidateOptions = {}
): EntryItem[][] {
  const includeMemo = options.include_memo ?? false;
  const minGroupSize = options.min_group_size ?? 2;
  const groups = new Map<string, EntryItem[]>();

  for (const row of results.rows ?? []) {
    const parts = [
      String(row.entry_date).split(".")[0],
      String(row.money),
      row.l_account_id,
      row.r_account_id,
      row.item.trim().toLocaleLowerCase(),
    ];
    if (includeMemo) {
      parts.push((row.memo ?? "").trim().toLocaleLowerCase());
    }

    const key = parts.join("\u0000");
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return [...groups.values()]
    .filter((group) => group.length >= minGroupSize)
    .sort((a, b) => b.length - a.length || String(a[0]?.entry_date).localeCompare(String(b[0]?.entry_date)));
}

export function formatDuplicateCandidates(
  results: EntryResults,
  accounts: Map<string, AccountInfo>,
  options: DuplicateCandidateOptions = {}
): string {
  const groups = findDuplicateCandidates(results, options);
  if (groups.length === 0) {
    return "중복 의심 거래가 없습니다.";
  }

  const lines: string[] = [];
  lines.push(`## 중복 의심 거래 (${groups.length}그룹)`);
  lines.push("");

  for (const group of groups) {
    const first = group[0];
    if (!first) continue;
    const lName = accounts.get(first.l_account_id)?.name ?? first.l_account_id;
    const rName = accounts.get(first.r_account_id)?.name ?? first.r_account_id;
    lines.push(
      `### ${formatDate(String(first.entry_date))} ${first.item || "(항목 없음)"} ` +
        `${formatAmount(Number(first.money))} [${lName} ← ${rName}]`
    );
    for (const row of group) {
      const memo = row.memo ? ` — ${row.memo}` : "";
      lines.push(`- id:${row.entry_id}${memo}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function formatAccountActivity(
  results: EntryResults,
  accountId: string,
  accounts: Map<string, AccountInfo>,
  limit = 20
): string {
  const rows = (results.rows ?? []).filter(
    (row) => row.l_account_id === accountId || row.r_account_id === accountId
  );
  const accountName = accounts.get(accountId)?.name ?? accountId;

  if (rows.length === 0) {
    return `${accountName} 계정의 거래 내역이 없습니다.`;
  }

  const asLeft = rows.filter((row) => row.l_account_id === accountId);
  const asRight = rows.filter((row) => row.r_account_id === accountId);
  const leftTotal = asLeft.reduce((sum, row) => sum + Number(row.money), 0);
  const rightTotal = asRight.reduce((sum, row) => sum + Number(row.money), 0);
  const itemTotals = new Map<string, { count: number; total: number }>();

  for (const row of rows) {
    const key = row.item || "(항목 없음)";
    const current = itemTotals.get(key) ?? { count: 0, total: 0 };
    itemTotals.set(key, {
      count: current.count + 1,
      total: current.total + Number(row.money),
    });
  }

  const topItems = [...itemTotals.entries()]
    .sort((a, b) => b[1].total - a[1].total || b[1].count - a[1].count)
    .slice(0, 5);

  const lines: string[] = [];
  lines.push(`## 계정 활동: ${accountName} (${accountId})`);
  lines.push("");
  lines.push(`- 거래 수: ${rows.length}건`);
  lines.push(`- 왼쪽 계정으로 기록: ${asLeft.length}건, ${formatAmount(leftTotal)}`);
  lines.push(`- 오른쪽 계정으로 기록: ${asRight.length}건, ${formatAmount(rightTotal)}`);
  lines.push("");

  if (topItems.length > 0) {
    lines.push("### 많이 나온 항목");
    for (const [item, summary] of topItems) {
      lines.push(`- ${item}: ${summary.count}건, ${formatAmount(summary.total)}`);
    }
    lines.push("");
  }

  lines.push("### 최근 거래");
  for (const row of rows.slice(0, limit)) {
    const lName = accounts.get(row.l_account_id)?.name ?? row.l_account_id;
    const rName = accounts.get(row.r_account_id)?.name ?? row.r_account_id;
    const memo = row.memo ? ` — ${row.memo}` : "";
    lines.push(
      `- **${formatDate(String(row.entry_date))}** ${row.item || "(항목 없음)"} ` +
        `${formatAmount(Number(row.money))} [${lName} ← ${rName}]${memo} (id:${row.entry_id})`
    );
  }

  return lines.join("\n");
}

function formatAggregateValue(key: string, value: number): string {
  const labels: Record<string, string> = {
    in: "유입",
    out: "유출",
    money: "금액",
    total: "합계",
  };
  return `${labels[key] ?? key}: ${formatAmount(value)}`;
}

function formatAggregateRows(rows: unknown, accounts: Map<string, AccountInfo>): string[] {
  const normalizedRows = Array.isArray(rows)
    ? rows
    : rows && typeof rows === "object"
      ? Object.entries(rows).map(([key, value]) =>
          value && typeof value === "object" ? { key, ...value } : { key, money: value }
        )
      : [];

  return normalizedRows.slice(0, 10).map((item) => {
    if (!item || typeof item !== "object") {
      return `- ${String(item)}`;
    }

    const row = item as Record<string, unknown>;
    const rawLabel =
      row.date ??
      row.item ??
      row.client ??
      row.account_id ??
      row.key ??
      "(이름 없음)";
    const label =
      typeof rawLabel === "string" && accounts.has(rawLabel)
        ? `${accounts.get(rawLabel)?.name ?? rawLabel} (${rawLabel})`
        : String(rawLabel);

    const amounts = Object.entries(row)
      .filter(([, value]) => typeof value === "number")
      .map(([key, value]) => formatAggregateValue(key, value as number));

    const formattedLabel = /^\d{8}(?:\.\d+)?$/.test(label) ? formatDate(label) : label;
    return `- ${formattedLabel}${amounts.length > 0 ? `: ${amounts.join(", ")}` : ""}`;
  });
}

export function formatAccountAggregateSummary(
  title: string,
  results: AccountAggregateResults,
  accounts: Map<string, AccountInfo>
): string {
  const lines: string[] = [];
  lines.push(`### ${title}`);

  const aggregate = results.aggregate ?? {};
  const aggregateText = Object.entries(aggregate)
    .filter(([, value]) => typeof value === "number")
    .map(([key, value]) => formatAggregateValue(key, value));
  if (aggregateText.length > 0) {
    lines.push(`- 합계: ${aggregateText.join(", ")}`);
  }
  if (results.rows_type) {
    lines.push(`- 단위: ${results.rows_type}`);
  }

  const rowLines = formatAggregateRows(results.rows, accounts);
  if (rowLines.length > 0) {
    lines.push(...rowLines);
  }
  if (aggregateText.length === 0 && rowLines.length === 0) {
    lines.push("- 데이터가 없습니다.");
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

type CalendarDayRows = CalendarDay[] | Record<string, CalendarDay>;

interface CalendarResults {
  aggregate?: { income: number; expenses: number; etc: number };
  rows?: Record<string, CalendarDayRows>;
}

function normalizeCalendarDays(days: CalendarDayRows | undefined): CalendarDay[] {
  if (Array.isArray(days)) {
    return days;
  }
  if (days && typeof days === "object") {
    return Object.entries(days).map(([date, value]) => ({
      ...value,
      date: value.date ?? date,
    }));
  }
  return [];
}

export function formatCalendar(results: CalendarResults): string {
  const lines: string[] = [];
  let hasDailyRows = false;

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
    const days = normalizeCalendarDays(rows[month]).filter(
      (d) => Number(d.count ?? 0) > 0
    );
    if (days.length === 0) continue;

    const label = `${month.slice(0, 4)}-${month.slice(4, 6)}`;
    lines.push(`### ${label}`);
    for (const d of days) {
      const dateStr = `${String(d.date).slice(0, 4)}-${String(d.date).slice(4, 6)}-${String(d.date).slice(6, 8)}`;
      const dayName = dayNames[Number(d.day)] ?? "";
      const parts: string[] = [];
      if (Number(d.income) > 0) parts.push(`수입 ${formatAmount(Number(d.income))}`);
      if (Number(d.expenses) > 0) parts.push(`지출 ${formatAmount(Number(d.expenses))}`);
      if (Number(d.etc) > 0) parts.push(`기타 ${formatAmount(Number(d.etc))}`);
      lines.push(`- ${dateStr}(${dayName}) ${d.count}건: ${parts.join(", ")}`);
      hasDailyRows = true;
    }
    lines.push("");
  }

  if (!hasDailyRows && !agg) {
    lines.push("해당 기간에 데이터가 없습니다.");
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
