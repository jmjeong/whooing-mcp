import { describe, it, expect } from "vitest";
import {
  formatPL,
  formatEntries,
  filterEntries,
  formatEntryDetail,
  formatMonthlySummary,
  formatReportMonthlySummary,
  findDuplicateCandidates,
  formatDuplicateCandidates,
  formatAccountActivity,
  formatAccountAggregateSummary,
  formatBalance,
  formatAccounts,
  formatSections,
  formatFrequentItems,
  formatLatestItems,
  formatCalendar,
} from "./formatters.js";
import type { AccountInfo } from "./whooing-client.js";

function makeAccounts(
  entries: [string, string, string][]
): Map<string, AccountInfo> {
  const map = new Map<string, AccountInfo>();
  for (const [id, name, type] of entries) {
    map.set(id, { name, type });
  }
  return map;
}

describe("formatFrequentItems", () => {
  const accounts = makeAccounts([
    ["x12", "생활비", "expenses"],
    ["x5", "신한카드", "assets"],
    ["x1", "현금", "assets"],
  ]);

  it("formats items grouped by slot", () => {
    const results = {
      slot1: [
        {
          item_id: "f4",
          item: "생필품",
          money: 40000,
          l_account: "expenses",
          l_account_id: "x12",
          r_account: "assets",
          r_account_id: "x5",
        },
      ],
      slot2: [
        {
          item_id: "f10",
          item: "커피",
          money: 5000,
          l_account: "expenses",
          l_account_id: "x12",
          r_account: "assets",
          r_account_id: "x1",
        },
      ],
    };

    const text = formatFrequentItems(results, accounts);
    expect(text).toContain("자주 쓰는 거래");
    expect(text).toContain("slot1");
    expect(text).toContain("생필품");
    expect(text).toContain("40,000원");
    expect(text).toContain("생활비 ← 신한카드");
    expect(text).toContain("id:f4");
    expect(text).toContain("slot2");
    expect(text).toContain("커피");
    expect(text).toContain("현금");
  });

  it("handles empty results", () => {
    const text = formatFrequentItems({}, accounts);
    expect(text).toContain("등록된 자주 쓰는 거래가 없습니다");
  });
});

describe("formatLatestItems", () => {
  const accounts = makeAccounts([
    ["x12", "생활비", "expenses"],
    ["x5", "신한카드", "assets"],
  ]);

  it("formats latest items", () => {
    const results = [
      {
        item: "점심",
        money: 12000,
        l_account: "expenses",
        l_account_id: "x12",
        r_account: "assets",
        r_account_id: "x5",
      },
    ];

    const text = formatLatestItems(results, accounts);
    expect(text).toContain("최근 거래 항목");
    expect(text).toContain("점심");
    expect(text).toContain("12,000원");
    expect(text).toContain("생활비 ← 신한카드");
  });

  it("handles empty results", () => {
    const text = formatLatestItems([], accounts);
    expect(text).toContain("최근 60일간 거래 항목이 없습니다");
  });
});

describe("formatCalendar", () => {
  it("formats monthly calendar with daily breakdown", () => {
    const results = {
      aggregate: { income: 5000000, expenses: 1200000, etc: 0 },
      rows: {
        "202604": [
          {
            date: "20260401",
            day: 3,
            count: 2,
            income: 0,
            expenses: 50000,
            etc: 0,
          },
          {
            date: "20260402",
            day: 4,
            count: 0,
            income: 0,
            expenses: 0,
            etc: 0,
          },
          {
            date: "20260410",
            day: 5,
            count: 1,
            income: 5000000,
            expenses: 0,
            etc: 0,
          },
        ],
      },
    };

    const text = formatCalendar(results);
    expect(text).toContain("월간 요약");
    expect(text).toContain("수입: 5,000,000원");
    expect(text).toContain("지출: 1,200,000원");
    expect(text).toContain("2026-04");
    expect(text).toContain("2026-04-01(수) 2건");
    expect(text).toContain("지출 50,000원");
    // day with count=0 should be filtered out
    expect(text).not.toContain("2026-04-02");
    expect(text).toContain("2026-04-10(금) 1건");
    expect(text).toContain("수입 5,000,000원");
  });

  it("handles empty results", () => {
    const text = formatCalendar({ rows: {} });
    expect(text).toContain("해당 기간에 데이터가 없습니다");
  });
});

describe("formatPL", () => {
  const accounts = makeAccounts([
    ["x12", "식비", "expenses"],
    ["x13", "교통비", "expenses"],
    ["x20", "급여", "income"],
  ]);

  it("formats profit and loss", () => {
    const results = {
      expenses: {
        total: 150000,
        accounts: [
          { account_id: "x12", money: 100000 },
          { account_id: "x13", money: 50000 },
        ],
      },
      income: {
        total: 3000000,
        accounts: [{ account_id: "x20", money: 3000000 }],
      },
      net_income: { total: 2850000 },
    };

    const text = formatPL(results, accounts, "20260401", "20260422");
    expect(text).toContain("손익");
    expect(text).toContain("식비: 100,000원");
    expect(text).toContain("급여: 3,000,000원");
    expect(text).toContain("순이익: 2,850,000원");
  });
});

describe("formatEntries", () => {
  const accounts = makeAccounts([
    ["x12", "식비", "expenses"],
    ["x5", "신한카드", "assets"],
  ]);

  it("formats entries with entry_id", () => {
    const results = {
      rows: [
        {
          entry_id: 12345,
          entry_date: "20260415.0001",
          l_account: "expenses",
          l_account_id: "x12",
          r_account: "assets",
          r_account_id: "x5",
          item: "점심",
          money: 12000,
          memo: "김밥천국",
        },
      ],
    };

    const text = formatEntries(results, accounts);
    expect(text).toContain("거래 내역 (1건)");
    expect(text).toContain("2026-04-15");
    expect(text).toContain("점심");
    expect(text).toContain("12,000원");
    expect(text).toContain("식비 ← 신한카드");
    expect(text).toContain("김밥천국");
    expect(text).toContain("id:12345");
  });

  it("handles empty entries", () => {
    const text = formatEntries({ rows: [] }, accounts);
    expect(text).toContain("거래 내역이 없습니다");
  });
});

describe("formatEntryDetail", () => {
  const accounts = makeAccounts([
    ["x12", "식비", "expenses"],
    ["x5", "신한카드", "assets"],
  ]);

  it("formats a single entry", () => {
    const text = formatEntryDetail(
      {
        entry_id: 12345,
        entry_date: "20260415.0001",
        l_account: "expenses",
        l_account_id: "x12",
        r_account: "assets",
        r_account_id: "x5",
        item: "점심",
        money: 12000,
        memo: "김밥천국",
      },
      accounts
    );

    expect(text).toContain("거래 상세 (id:12345)");
    expect(text).toContain("날짜: 2026-04-15");
    expect(text).toContain("항목: 점심");
    expect(text).toContain("금액: 12,000원");
    expect(text).toContain("식비");
    expect(text).toContain("김밥천국");
  });
});

describe("filterEntries", () => {
  const results = {
    rows: [
      {
        entry_id: 1,
        entry_date: "20251114.0001",
        l_account: "expenses",
        l_account_id: "x45",
        r_account: "assets",
        r_account_id: "x38",
        item: "Monster Train2(nintendo)",
        money: 21600,
        memo: "Switch deckbuilder",
      },
      {
        entry_id: 2,
        entry_date: "20251120.0001",
        l_account: "expenses",
        l_account_id: "x11",
        r_account: "liabilities",
        r_account_id: "x24",
        item: "점심",
        money: 12000,
        memo: "",
      },
      {
        entry_id: 3,
        entry_date: "20251201.0001",
        l_account: "expenses",
        l_account_id: "x45",
        r_account: "assets",
        r_account_id: "x38",
        item: "Ball X Pit",
        money: 11880,
        memo: "",
      },
    ],
  };

  it("filters by left account id", () => {
    const filtered = filterEntries(results, { l_account_id: "x45" });

    expect(filtered.rows).toHaveLength(2);
    expect(filtered.rows?.map((row) => row.entry_id)).toEqual([1, 3]);
  });

  it("matches keywords case-insensitively across item and memo", () => {
    const filtered = filterEntries(results, { keywords: ["switch"] });

    expect(filtered.rows).toHaveLength(1);
    expect(filtered.rows?.[0]?.entry_id).toBe(1);
  });

  it("combines account and keyword filters", () => {
    const filtered = filterEntries(results, {
      account_ids: ["x45"],
      keywords: ["ball"],
    });

    expect(filtered.rows).toHaveLength(1);
    expect(filtered.rows?.[0]?.entry_id).toBe(3);
  });

  it("filters by amount range", () => {
    const filtered = filterEntries(results, {
      min_money: 12000,
      max_money: 21600,
    });

    expect(filtered.rows?.map((row) => row.entry_id)).toEqual([1, 2]);
  });
});

describe("formatMonthlySummary", () => {
  it("formats month-by-month summaries from calendar rows", () => {
    const text = formatMonthlySummary({
      rows: {
        "202604": [
          { date: "20260401", day: 3, count: 2, income: 0, expenses: 50000, etc: 0 },
          { date: "20260410", day: 5, count: 1, income: 3000000, expenses: 0, etc: 0 },
        ],
        "202605": [
          { date: "20260501", day: 5, count: 1, income: 0, expenses: 15000, etc: 0 },
        ],
      },
    });

    expect(text).toContain("월별 요약");
    expect(text).toContain("2026-04");
    expect(text).toContain("수입 3,000,000원");
    expect(text).toContain("지출 50,000원");
    expect(text).toContain("순액 2,950,000원");
    expect(text).toContain("3건");
    expect(text).toContain("2026-05");
  });
});

describe("formatReportMonthlySummary", () => {
  it("formats direct report_summary monthly rows", () => {
    const text = formatReportMonthlySummary({
      rows: {
        "202604": {
          date: "202604",
          income: 3000000,
          expenses: 50000,
          net_income: 2950000,
        },
        "202605": {
          date: "202605",
          income: 0,
          expenses: 15000,
          net_income: -15000,
        },
      },
    });

    expect(text).toContain("월별 요약");
    expect(text).toContain("2026-04");
    expect(text).toContain("수입 3,000,000원");
    expect(text).toContain("지출 50,000원");
    expect(text).toContain("순이익 2,950,000원");
    expect(text).toContain("2026-05");
    expect(text).toContain("순이익 -15,000원");
  });
});

describe("duplicate candidates", () => {
  const accounts = makeAccounts([
    ["x12", "식비", "expenses"],
    ["x5", "신한카드", "assets"],
  ]);

  const results = {
    rows: [
      {
        entry_id: 1,
        entry_date: "20260415.0001",
        l_account: "expenses",
        l_account_id: "x12",
        r_account: "assets",
        r_account_id: "x5",
        item: "점심",
        money: 12000,
        memo: "A",
      },
      {
        entry_id: 2,
        entry_date: "20260415.0002",
        l_account: "expenses",
        l_account_id: "x12",
        r_account: "assets",
        r_account_id: "x5",
        item: "점심",
        money: 12000,
        memo: "B",
      },
      {
        entry_id: 3,
        entry_date: "20260416.0001",
        l_account: "expenses",
        l_account_id: "x12",
        r_account: "assets",
        r_account_id: "x5",
        item: "점심",
        money: 12000,
        memo: "A",
      },
    ],
  };

  it("finds duplicate groups ignoring memo by default", () => {
    const groups = findDuplicateCandidates(results);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.map((row) => row.entry_id)).toEqual([1, 2]);
  });

  it("can include memo in duplicate grouping", () => {
    const groups = findDuplicateCandidates(results, { include_memo: true });

    expect(groups).toHaveLength(0);
  });

  it("formats duplicate groups", () => {
    const text = formatDuplicateCandidates(results, accounts);

    expect(text).toContain("중복 의심 거래 (1그룹)");
    expect(text).toContain("2026-04-15 점심 12,000원");
    expect(text).toContain("식비 ← 신한카드");
    expect(text).toContain("id:1");
    expect(text).toContain("id:2");
  });
});

describe("formatAccountActivity", () => {
  const accounts = makeAccounts([
    ["x12", "식비", "expenses"],
    ["x5", "신한카드", "assets"],
    ["x1", "현금", "assets"],
  ]);

  it("summarizes one account activity", () => {
    const text = formatAccountActivity(
      {
        rows: [
          {
            entry_id: 1,
            entry_date: "20260415.0001",
            l_account: "expenses",
            l_account_id: "x12",
            r_account: "assets",
            r_account_id: "x5",
            item: "점심",
            money: 12000,
            memo: "김밥천국",
          },
          {
            entry_id: 2,
            entry_date: "20260416.0001",
            l_account: "expenses",
            l_account_id: "x12",
            r_account: "assets",
            r_account_id: "x1",
            item: "점심",
            money: 9000,
            memo: "",
          },
        ],
      },
      "x12",
      accounts
    );

    expect(text).toContain("계정 활동: 식비 (x12)");
    expect(text).toContain("거래 수: 2건");
    expect(text).toContain("왼쪽 계정으로 기록: 2건, 21,000원");
    expect(text).toContain("점심: 2건, 21,000원");
    expect(text).toContain("id:1");
    expect(text).toContain("김밥천국");
  });
});

describe("formatAccountAggregateSummary", () => {
  const accounts = makeAccounts([
    ["x12", "식비", "expenses"],
    ["x5", "신한카드", "assets"],
  ]);

  it("formats daily account changes without JSON dumps", () => {
    const text = formatAccountAggregateSummary(
      "일별 변동",
      {
        aggregate: { in: 1010002, out: 298933 },
        rows_type: "day",
        rows: [
          { date: "20260415", money: 12000 },
          { date: "20260416", money: -3000 },
        ],
      },
      accounts
    );

    expect(text).toContain("일별 변동");
    expect(text).toContain("합계: 유입: 1,010,002원, 유출: 298,933원");
    expect(text).toContain("단위: day");
    expect(text).toContain("2026-04-15: 금액: 12,000원");
    expect(text).not.toContain("{");
  });

  it("resolves account ids in keyed aggregate rows", () => {
    const text = formatAccountAggregateSummary(
      "항목별 집계",
      {
        rows: {
          x12: { money: 21000 },
          x5: { money: 9000 },
        },
      },
      accounts
    );

    expect(text).toContain("식비 (x12): 금액: 21,000원");
    expect(text).toContain("신한카드 (x5): 금액: 9,000원");
  });
});

describe("formatSections", () => {
  it("formats sections list", () => {
    const results = [
      { section_id: "s199", title: "가계부", currency: "KRW" },
      { section_id: "s200", title: "사업", memo: "사업용" },
    ];

    const text = formatSections(results);
    expect(text).toContain("가계부 (Section) 목록");
    expect(text).toContain("s199: 가계부 [KRW]");
    expect(text).toContain("s200: 사업 — 사업용");
  });
});
