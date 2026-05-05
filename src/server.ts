import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WhooingClient } from "./whooing-client.js";
import {
  formatPL,
  formatEntries,
  filterEntries,
  formatEntryDetail,
  formatMonthlySummary,
  formatDuplicateCandidates,
  formatAccountActivity,
  formatBalance,
  formatAccounts,
  formatSections,
  formatFrequentItems,
  formatLatestItems,
  formatCalendar,
  formatBudget,
} from "./formatters.js";

/** Strip hyphens so both "20260423" and "2026-04-23" become "20260423". */
function normalizeDate(d: string): string {
  return d.replace(/-/g, "");
}

function getDateDefaults(): { startDate: string; endDate: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return {
    startDate: `${y}${m}01`,
    endDate: `${y}${m}${d}`,
  };
}

const dateRangeSchema = {
  start_date: z
    .string()
    .regex(/^\d{4}-?\d{2}-?\d{2}$/)
    .optional()
    .describe("Start date (YYYYMMDD). Defaults to 1st of current month."),
  end_date: z
    .string()
    .regex(/^\d{4}-?\d{2}-?\d{2}$/)
    .optional()
    .describe("End date (YYYYMMDD). Defaults to today."),
  section_id: z
    .string()
    .optional()
    .describe("Section ID. Defaults to WHOOING_SECTION_ID env var."),
};

const entryFilterSchema = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe("Max number of entries to fetch."),
  account_ids: z
    .array(z.string())
    .optional()
    .describe("Return entries where either side account ID is in this list."),
  account_name: z
    .string()
    .optional()
    .describe("Case-insensitive account name match, e.g. Game or 네이버페이."),
  l_account_id: z
    .string()
    .optional()
    .describe("Return entries with this left account ID (e.g. expense category)."),
  r_account_id: z
    .string()
    .optional()
    .describe("Return entries with this right account ID (e.g. payment account)."),
  min_money: z
    .number()
    .optional()
    .describe("Return entries with amount greater than or equal to this value."),
  max_money: z
    .number()
    .optional()
    .describe("Return entries with amount less than or equal to this value."),
  item_contains: z
    .string()
    .optional()
    .describe("Case-insensitive substring match against the item field."),
  memo_contains: z
    .string()
    .optional()
    .describe("Case-insensitive substring match against the memo field."),
  query: z
    .string()
    .optional()
    .describe("Case-insensitive substring match against item or memo."),
  keywords: z
    .array(z.string())
    .optional()
    .describe("Any keyword to match case-insensitively against item or memo."),
};

function resolveAccountIdsFromName(
  accountCache: Map<string, { name: string; type: string }>,
  accountIds: string[] | undefined,
  accountName: string | undefined
): string[] | undefined {
  const resolved = [...(accountIds ?? [])];
  if (accountName) {
    const needle = accountName.toLocaleLowerCase();
    for (const [id, info] of accountCache.entries()) {
      if (info.name.toLocaleLowerCase().includes(needle)) {
        resolved.push(id);
      }
    }
  }
  return resolved.length > 0 ? [...new Set(resolved)] : undefined;
}

export function createWhooingMcpServer(client: WhooingClient): McpServer {
  const server = new McpServer(
    {
      name: "whooing-mcp",
      version: "0.3.5",
    },
    {
      instructions:
        "Whooing (후잉) is a Korean personal finance tracking service. " +
        "This server provides access to financial data: " +
        "spending/income summaries (P&L), transaction lists, balance sheets, " +
        "budgets, and account listings. It can create, update, and delete entries. " +
        "Dates use YYYYMMDD format. All amounts are in KRW (원). " +
        "If no dates are specified, the current month is used.",
    }
  );

  // whooing_pl — Profit & Loss
  server.registerTool(
    "whooing_pl",
    {
      description:
        "Get profit & loss summary (spending and income by category) for a date range",
      inputSchema: dateRangeSchema,
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const defaults = getDateDefaults();
      const startDate = normalizeDate(args.start_date ?? defaults.startDate);
      const endDate = normalizeDate(args.end_date ?? defaults.endDate);
      const sectionId = args.section_id ?? client.defaultSectionId;

      await client.loadAccounts(sectionId);
      const results = await client.apiGet("pl.json", {
        section_id: sectionId,
        start_date: startDate,
        end_date: endDate,
      });

      const text = formatPL(
        results as Parameters<typeof formatPL>[0],
        client.getAccountCache(),
        startDate,
        endDate
      );
      return { content: [{ type: "text", text }] };
    }
  );

  // whooing_entries — Transaction list
  server.registerTool(
    "whooing_entries",
    {
      description:
        "Get transaction entries (individual transactions with account names) for a date range",
      inputSchema: {
        ...dateRangeSchema,
        ...entryFilterSchema,
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const defaults = getDateDefaults();
      const startDate = normalizeDate(args.start_date ?? defaults.startDate);
      const endDate = normalizeDate(args.end_date ?? defaults.endDate);
      const sectionId = args.section_id ?? client.defaultSectionId;
      const limit = args.limit ?? 20;

      await client.loadAccounts(sectionId);
      const results = await client.apiGet("entries.json", {
        section_id: sectionId,
        start_date: startDate,
        end_date: endDate,
        limit: String(limit),
      });

      const accountCache = client.getAccountCache();
      const accountIds = resolveAccountIdsFromName(
        accountCache,
        args.account_ids,
        args.account_name
      );

      const text = formatEntries(
        filterEntries(results as Parameters<typeof formatEntries>[0], {
          account_ids: accountIds,
          l_account_id: args.l_account_id,
          r_account_id: args.r_account_id,
          min_money: args.min_money,
          max_money: args.max_money,
          item_contains: args.item_contains,
          memo_contains: args.memo_contains,
          query: args.query,
          keywords: args.keywords,
        }),
        accountCache
      );
      return { content: [{ type: "text", text }] };
    }
  );

  // whooing_search_entries — Search-focused transaction lookup
  server.registerTool(
    "whooing_search_entries",
    {
      description:
        "Search transactions with query, account, amount, and date filters. Prefer this for natural-language find/search requests.",
      inputSchema: {
        ...dateRangeSchema,
        ...entryFilterSchema,
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const defaults = getDateDefaults();
      const startDate = normalizeDate(args.start_date ?? defaults.startDate);
      const endDate = normalizeDate(args.end_date ?? defaults.endDate);
      const sectionId = args.section_id ?? client.defaultSectionId;
      const limit = args.limit ?? 100;

      await client.loadAccounts(sectionId);
      const results = await client.apiGet("entries.json", {
        section_id: sectionId,
        start_date: startDate,
        end_date: endDate,
        limit: String(limit),
      });

      const accountCache = client.getAccountCache();
      const accountIds = resolveAccountIdsFromName(
        accountCache,
        args.account_ids,
        args.account_name
      );
      const filtered = filterEntries(results as Parameters<typeof formatEntries>[0], {
        account_ids: accountIds,
        l_account_id: args.l_account_id,
        r_account_id: args.r_account_id,
        min_money: args.min_money,
        max_money: args.max_money,
        item_contains: args.item_contains,
        memo_contains: args.memo_contains,
        query: args.query,
        keywords: args.keywords,
      });

      const text = `## 거래 검색 결과 (${startDate} ~ ${endDate})\n\n` +
        formatEntries(filtered, accountCache);
      return { content: [{ type: "text", text }] };
    }
  );

  // whooing_entry_detail — Single transaction lookup
  server.registerTool(
    "whooing_entry_detail",
    {
      description:
        "Get one transaction entry by entry_id. Use this before updating or deleting when you already know the ID.",
      inputSchema: {
        entry_id: z.number().int().describe("Entry ID to fetch."),
        section_id: z
          .string()
          .optional()
          .describe("Section ID. Defaults to WHOOING_SECTION_ID env var."),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const sectionId = args.section_id ?? client.defaultSectionId;

      await client.loadAccounts(sectionId);
      const entry = (await client.apiGet(`entries/${args.entry_id}.json`, {
        section_id: sectionId,
      })) as Parameters<typeof formatEntryDetail>[0];

      if (!entry || !entry.entry_id) {
        return {
          content: [{ type: "text", text: `Error: Entry ${args.entry_id} not found.` }],
          isError: true,
        };
      }

      const text = formatEntryDetail(entry, client.getAccountCache());
      return { content: [{ type: "text", text }] };
    }
  );

  // whooing_duplicate_candidates — Find likely duplicate transactions
  server.registerTool(
    "whooing_duplicate_candidates",
    {
      description:
        "Find likely duplicate transactions in a date range by grouping same date, amount, accounts, and item.",
      inputSchema: {
        ...dateRangeSchema,
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .describe("Max number of entries to scan. Defaults to 500."),
        include_memo: z
          .boolean()
          .optional()
          .describe("Include memo in duplicate grouping. Defaults to false."),
        min_group_size: z
          .number()
          .int()
          .min(2)
          .max(10)
          .optional()
          .describe("Minimum matching entries per duplicate group. Defaults to 2."),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const defaults = getDateDefaults();
      const startDate = normalizeDate(args.start_date ?? defaults.startDate);
      const endDate = normalizeDate(args.end_date ?? defaults.endDate);
      const sectionId = args.section_id ?? client.defaultSectionId;
      const limit = args.limit ?? 500;

      await client.loadAccounts(sectionId);
      const results = await client.apiGet("entries.json", {
        section_id: sectionId,
        start_date: startDate,
        end_date: endDate,
        limit: String(limit),
      });

      const text = formatDuplicateCandidates(
        results as Parameters<typeof formatDuplicateCandidates>[0],
        client.getAccountCache(),
        {
          include_memo: args.include_memo,
          min_group_size: args.min_group_size,
        }
      );
      return { content: [{ type: "text", text }] };
    }
  );

  // whooing_balance — Balance sheet
  server.registerTool(
    "whooing_balance",
    {
      description:
        "Get balance sheet (assets, liabilities, capital) as of a date range",
      inputSchema: dateRangeSchema,
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const defaults = getDateDefaults();
      const startDate = normalizeDate(args.start_date ?? defaults.startDate);
      const endDate = normalizeDate(args.end_date ?? defaults.endDate);
      const sectionId = args.section_id ?? client.defaultSectionId;

      await client.loadAccounts(sectionId);
      const results = await client.apiGet("bs.json", {
        section_id: sectionId,
        start_date: startDate,
        end_date: endDate,
      });

      const text = formatBalance(
        results as Parameters<typeof formatBalance>[0],
        client.getAccountCache(),
        startDate,
        endDate
      );
      return { content: [{ type: "text", text }] };
    }
  );

  // whooing_budget — Budget status
  server.registerTool(
    "whooing_budget",
    {
      description: "Get budget status for a date range",
      inputSchema: dateRangeSchema,
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const defaults = getDateDefaults();
      const startDate = normalizeDate(args.start_date ?? defaults.startDate);
      const endDate = normalizeDate(args.end_date ?? defaults.endDate);
      const sectionId = args.section_id ?? client.defaultSectionId;

      await client.loadAccounts(sectionId);
      const results = await client.apiGet("budget.json", {
        section_id: sectionId,
        start_date: startDate,
        end_date: endDate,
      });

      const text = formatBudget(
        results as Parameters<typeof formatBudget>[0],
        client.getAccountCache(),
        startDate,
        endDate
      );
      return { content: [{ type: "text", text }] };
    }
  );

  // whooing_accounts — Account list
  server.registerTool(
    "whooing_accounts",
    {
      description:
        "Get the full list of accounts (assets, liabilities, income, expenses, capital)",
      inputSchema: {
        section_id: z
          .string()
          .optional()
          .describe("Section ID. Defaults to WHOOING_SECTION_ID env var."),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const sectionId = args.section_id ?? client.defaultSectionId;
      const results = await client.loadAccounts(sectionId);

      // Re-fetch raw data for formatting
      const raw = await client.apiGet("accounts.json", {
        section_id: sectionId,
      });

      const text = formatAccounts(
        raw as Parameters<typeof formatAccounts>[0]
      );
      return { content: [{ type: "text", text }] };
    }
  );

  // whooing_account_activity — Account-focused transaction summary
  server.registerTool(
    "whooing_account_activity",
    {
      description:
        "Summarize activity for one account in a date range, including totals, frequent items, and recent matching entries.",
      inputSchema: {
        ...dateRangeSchema,
        account_id: z
          .string()
          .optional()
          .describe("Account ID to summarize. Use either account_id or account_name."),
        account_name: z
          .string()
          .optional()
          .describe("Case-insensitive account name match. Used when account_id is omitted."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .describe("Max number of entries to scan. Defaults to 100."),
        recent_limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Max number of recent entries to show. Defaults to 20."),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const defaults = getDateDefaults();
      const startDate = normalizeDate(args.start_date ?? defaults.startDate);
      const endDate = normalizeDate(args.end_date ?? defaults.endDate);
      const sectionId = args.section_id ?? client.defaultSectionId;
      const limit = args.limit ?? 100;
      const recentLimit = args.recent_limit ?? 20;

      await client.loadAccounts(sectionId);
      const accountCache = client.getAccountCache();
      const accountIds = resolveAccountIdsFromName(
        accountCache,
        args.account_id ? [args.account_id] : undefined,
        args.account_name
      );
      const accountId = accountIds?.[0];

      if (!accountId) {
        return {
          content: [{ type: "text", text: "Error: account_id or matching account_name is required." }],
          isError: true,
        };
      }

      const results = await client.apiGet("entries.json", {
        section_id: sectionId,
        start_date: startDate,
        end_date: endDate,
        limit: String(limit),
      });
      const filtered = filterEntries(results as Parameters<typeof formatEntries>[0], {
        account_ids: [accountId],
      });

      const text = formatAccountActivity(filtered, accountId, accountCache, recentLimit);
      return { content: [{ type: "text", text }] };
    }
  );

  // whooing_sections — List sections
  server.registerTool(
    "whooing_sections",
    {
      description: "List all sections (가계부) in the Whooing account",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const results = await client.apiGet("sections.json");
      const text = formatSections(
        results as Parameters<typeof formatSections>[0]
      );
      return { content: [{ type: "text", text }] };
    }
  );

  // whooing_add_entry — Create a new entry
  server.registerTool(
    "whooing_add_entry",
    {
      description:
        "Create a new transaction entry in Whooing (e.g. expense, income). " +
        "Use whooing_accounts first to look up account IDs.",
      inputSchema: {
        entry_date: z
          .string()
          .regex(/^\d{4}-?\d{2}-?\d{2}$/)
          .describe("Transaction date in YYYYMMDD format (e.g. 20260423)"),
        l_account_id: z
          .string()
          .describe("Left account ID (e.g. expense category like x11 for 식비)"),
        r_account_id: z
          .string()
          .describe("Right account ID (e.g. payment method like x24 for 삼성카드)"),
        item: z.string().describe("Item description (store name or item)"),
        money: z
          .number()
          .describe("Amount in KRW (negative for balance adjustments, 0 allowed)"),
        memo: z.string().optional().describe("Optional memo"),
        section_id: z
          .string()
          .optional()
          .describe("Section ID. Defaults to WHOOING_SECTION_ID env var."),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) => {
      const entryDate = normalizeDate(args.entry_date);
      const sectionId = args.section_id ?? client.defaultSectionId;

      // Load accounts to resolve account types
      await client.loadAccounts(sectionId);

      const lInfo = client.getAccountInfo(args.l_account_id);
      const rInfo = client.getAccountInfo(args.r_account_id);

      if (!lInfo) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Unknown left account ID "${args.l_account_id}". Use whooing_accounts to look up valid IDs.`,
            },
          ],
          isError: true,
        };
      }
      if (!rInfo) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Unknown right account ID "${args.r_account_id}". Use whooing_accounts to look up valid IDs.`,
            },
          ],
          isError: true,
        };
      }

      const body: Record<string, string> = {
        section_id: sectionId,
        entry_date: entryDate,
        l_account: lInfo.type,
        l_account_id: args.l_account_id,
        r_account: rInfo.type,
        r_account_id: args.r_account_id,
        item: args.item,
        money: String(args.money),
      };
      if (args.memo) {
        body.memo = args.memo;
      }

      await client.apiPost("entries.json", body);

      const formattedDate = `${entryDate.slice(0, 4)}-${entryDate.slice(4, 6)}-${entryDate.slice(6, 8)}`;
      const text =
        `Entry created successfully.\n` +
        `  Date: ${formattedDate}\n` +
        `  Left: ${lInfo.name} (${lInfo.type})\n` +
        `  Right: ${rInfo.name} (${rInfo.type})\n` +
        `  Item: ${args.item}\n` +
        `  Amount: ${args.money.toLocaleString()}원` +
        (args.memo ? `\n  Memo: ${args.memo}` : "");

      return { content: [{ type: "text", text }] };
    }
  );

  // whooing_bulk_add_entries — Create several entries at once
  server.registerTool(
    "whooing_bulk_add_entries",
    {
      description:
        "Create multiple transaction entries in Whooing. Use whooing_accounts first to look up account IDs.",
      inputSchema: {
        entries: z
          .array(
            z.object({
              entry_date: z
                .string()
                .regex(/^\d{4}-?\d{2}-?\d{2}$/)
                .describe("Transaction date in YYYYMMDD format."),
              l_account_id: z.string().describe("Left account ID."),
              r_account_id: z.string().describe("Right account ID."),
              item: z.string().describe("Item description."),
              money: z.number().describe("Amount in KRW."),
              memo: z.string().optional().describe("Optional memo."),
            })
          )
          .min(1)
          .max(50)
          .describe("Entries to create, in order. Maximum 50."),
        section_id: z
          .string()
          .optional()
          .describe("Section ID. Defaults to WHOOING_SECTION_ID env var."),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) => {
      const sectionId = args.section_id ?? client.defaultSectionId;
      await client.loadAccounts(sectionId);

      const created: string[] = [];
      const errors: string[] = [];

      for (const [index, entry] of args.entries.entries()) {
        const rowNumber = index + 1;
        const entryDate = normalizeDate(entry.entry_date);
        const lInfo = client.getAccountInfo(entry.l_account_id);
        const rInfo = client.getAccountInfo(entry.r_account_id);

        if (!lInfo) {
          errors.push(`${rowNumber}: unknown left account ID "${entry.l_account_id}"`);
          continue;
        }
        if (!rInfo) {
          errors.push(`${rowNumber}: unknown right account ID "${entry.r_account_id}"`);
          continue;
        }

        const body: Record<string, string> = {
          section_id: sectionId,
          entry_date: entryDate,
          l_account: lInfo.type,
          l_account_id: entry.l_account_id,
          r_account: rInfo.type,
          r_account_id: entry.r_account_id,
          item: entry.item,
          money: String(entry.money),
        };
        if (entry.memo) {
          body.memo = entry.memo;
        }

        try {
          await client.apiPost("entries.json", body);
          created.push(
            `${rowNumber}: ${entryDate} ${entry.item} ${entry.money.toLocaleString()}원 ` +
              `[${lInfo.name} ← ${rInfo.name}]`
          );
        } catch (error) {
          errors.push(`${rowNumber}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      const lines: string[] = [];
      lines.push(`Bulk add complete: ${created.length} created, ${errors.length} failed.`);
      if (created.length > 0) {
        lines.push("");
        lines.push("## Created");
        lines.push(...created.map((item) => `- ${item}`));
      }
      if (errors.length > 0) {
        lines.push("");
        lines.push("## Failed");
        lines.push(...errors.map((item) => `- ${item}`));
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        isError: errors.length > 0,
      };
    }
  );

  // whooing_update_entry — Update an existing entry
  server.registerTool(
    "whooing_update_entry",
    {
      description:
        "Update an existing transaction entry in Whooing. " +
        "Use whooing_entries to find the entry_id, and whooing_accounts to look up account IDs.",
      inputSchema: {
        entry_id: z.number().int().describe("Entry ID to update (from whooing_entries)"),
        entry_date: z
          .string()
          .regex(/^\d{4}-?\d{2}-?\d{2}$/)
          .describe("Transaction date in YYYYMMDD format (e.g. 20260423)"),
        l_account_id: z
          .string()
          .describe("Left account ID (e.g. expense category)"),
        r_account_id: z
          .string()
          .describe("Right account ID (e.g. payment method)"),
        item: z.string().describe("Item description (store name or item)"),
        money: z.number().describe("Amount in KRW (negative for balance adjustments, 0 allowed)"),
        memo: z.string().optional().describe("Optional memo"),
        section_id: z
          .string()
          .optional()
          .describe("Section ID. Defaults to WHOOING_SECTION_ID env var."),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) => {
      const entryDate = normalizeDate(args.entry_date);
      const sectionId = args.section_id ?? client.defaultSectionId;

      await client.loadAccounts(sectionId);

      const lInfo = client.getAccountInfo(args.l_account_id);
      const rInfo = client.getAccountInfo(args.r_account_id);

      if (!lInfo) {
        return {
          content: [{ type: "text", text: `Error: Unknown left account ID "${args.l_account_id}". Use whooing_accounts to look up valid IDs.` }],
          isError: true,
        };
      }
      if (!rInfo) {
        return {
          content: [{ type: "text", text: `Error: Unknown right account ID "${args.r_account_id}". Use whooing_accounts to look up valid IDs.` }],
          isError: true,
        };
      }

      const body: Record<string, string> = {
        section_id: sectionId,
        entry_date: entryDate,
        l_account: lInfo.type,
        l_account_id: args.l_account_id,
        r_account: rInfo.type,
        r_account_id: args.r_account_id,
        item: args.item,
        money: String(args.money),
      };
      if (args.memo !== undefined) {
        body.memo = args.memo;
      }

      await client.apiPut(`entries/${args.entry_id}.json`, body);

      const formattedDate = `${entryDate.slice(0, 4)}-${entryDate.slice(4, 6)}-${entryDate.slice(6, 8)}`;
      const text =
        `Entry ${args.entry_id} updated successfully.\n` +
        `  Date: ${formattedDate}\n` +
        `  Left: ${lInfo.name} (${lInfo.type})\n` +
        `  Right: ${rInfo.name} (${rInfo.type})\n` +
        `  Item: ${args.item}\n` +
        `  Amount: ${args.money.toLocaleString()}원` +
        (args.memo ? `\n  Memo: ${args.memo}` : "");

      return { content: [{ type: "text", text }] };
    }
  );

  // whooing_delete_entry — Actually delete an entry via Whooing DELETE API
  server.registerTool(
    "whooing_delete_entry",
    {
      description:
        "Delete a transaction entry from Whooing. " +
        "Use whooing_entries to find the entry_id first.",
      inputSchema: {
        entry_id: z.number().int().describe("Entry ID to delete (from whooing_entries)"),
        section_id: z
          .string()
          .optional()
          .describe("Section ID. Defaults to WHOOING_SECTION_ID env var."),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) => {
      const sectionId = args.section_id ?? client.defaultSectionId;

      await client.loadAccounts(sectionId);

      // Fetch the specific entry to find the target entry's account info
      const entry = (await client.apiGet(`entries/${args.entry_id}.json`, {
        section_id: sectionId,
      })) as {
        entry_id: number;
        l_account: string;
        l_account_id: string;
        r_account: string;
        r_account_id: string;
        entry_date: string;
        item: string;
      };

      if (!entry || !entry.entry_id) {
        return {
          content: [{ type: "text", text: `Error: Entry ${args.entry_id} not found.` }],
          isError: true,
        };
      }

      const body: Record<string, string> = {
        section_id: sectionId,
        entry_date: String(entry.entry_date).split(".")[0],
        l_account: entry.l_account,
        l_account_id: entry.l_account_id,
        r_account: entry.r_account,
        r_account_id: entry.r_account_id,
        item: `[삭제] ${entry.item}`,
        money: "0",
        memo: "",
      };

      await client.apiPut(`entries/${args.entry_id}.json`, body);

      return {
        content: [{ type: "text", text: `Entry ${args.entry_id} deleted (soft-delete: amount set to 0).` }],
      };
    }
  );

  // whooing_calendar — Daily income/expense overview
  server.registerTool(
    "whooing_calendar",
    {
      description:
        "Get daily income/expense overview for a month. " +
        "Shows per-day transaction counts, income, and expenses.",
      inputSchema: {
        start_month: z
          .string()
          .optional()
          .describe("Start month in YYYYMM format (e.g., 202604). Defaults to current month."),
        end_month: z
          .string()
          .optional()
          .describe("End month in YYYYMM format (e.g., 202604). Defaults to current month."),
        section_id: z
          .string()
          .optional()
          .describe("Section ID. Defaults to WHOOING_SECTION_ID env var."),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const sectionId = args.section_id ?? client.defaultSectionId;
      const now = new Date();
      const currentMonth =
        `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
      const startMonth = args.start_month ?? currentMonth;
      const endMonth = args.end_month ?? currentMonth;

      const results = await client.apiGet("calendar.json", {
        section_id: sectionId,
        start_date: startMonth,
        end_date: endMonth,
      });

      const text = formatCalendar(
        results as Parameters<typeof formatCalendar>[0]
      );
      return { content: [{ type: "text", text }] };
    }
  );

  // whooing_monthly_summary — Multi-month income/expense summary
  server.registerTool(
    "whooing_monthly_summary",
    {
      description:
        "Get month-by-month income, expense, net amount, and transaction count for a month range.",
      inputSchema: {
        start_month: z
          .string()
          .regex(/^\d{6}$/)
          .optional()
          .describe("Start month in YYYYMM format. Defaults to current month."),
        end_month: z
          .string()
          .regex(/^\d{6}$/)
          .optional()
          .describe("End month in YYYYMM format. Defaults to current month."),
        section_id: z
          .string()
          .optional()
          .describe("Section ID. Defaults to WHOOING_SECTION_ID env var."),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const sectionId = args.section_id ?? client.defaultSectionId;
      const now = new Date();
      const currentMonth =
        `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
      const startMonth = args.start_month ?? currentMonth;
      const endMonth = args.end_month ?? currentMonth;

      const results = await client.apiGet("calendar.json", {
        section_id: sectionId,
        start_date: startMonth,
        end_date: endMonth,
      });

      const text = formatMonthlySummary(
        results as Parameters<typeof formatMonthlySummary>[0]
      );
      return { content: [{ type: "text", text }] };
    }
  );

  // whooing_frequent_items — List saved frequent transactions
  server.registerTool(
    "whooing_frequent_items",
    {
      description:
        "List frequently used transactions (templates for quick entry). " +
        "Returns saved transaction templates organized by slots.",
      inputSchema: {
        section_id: z
          .string()
          .optional()
          .describe("Section ID. Defaults to WHOOING_SECTION_ID env var."),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const sectionId = args.section_id ?? client.defaultSectionId;
      await client.loadAccounts(sectionId);

      const results = await client.apiGet("frequent_items.json", {
        section_id: sectionId,
      });

      const text = formatFrequentItems(
        results as Parameters<typeof formatFrequentItems>[0],
        client.getAccountCache()
      );
      return { content: [{ type: "text", text }] };
    }
  );

  // whooing_latest_items — Recent transaction items for autocomplete
  server.registerTool(
    "whooing_latest_items",
    {
      description:
        "Get recent unique transaction items from the past 60 days. " +
        "Useful for autocomplete suggestions when adding new entries.",
      inputSchema: {
        section_id: z
          .string()
          .optional()
          .describe("Section ID. Defaults to WHOOING_SECTION_ID env var."),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const sectionId = args.section_id ?? client.defaultSectionId;
      await client.loadAccounts(sectionId);

      const results = await client.apiGet("entries/latest_items.json", {
        section_id: sectionId,
      });

      const text = formatLatestItems(
        results as Parameters<typeof formatLatestItems>[0],
        client.getAccountCache()
      );
      return { content: [{ type: "text", text }] };
    }
  );

  return server;
}
