import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WhooingClient } from "./whooing-client.js";
import {
  formatPL,
  formatEntries,
  formatBalance,
  formatAccounts,
  formatSections,
} from "./formatters.js";

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
    .regex(/^\d{8}$/)
    .optional()
    .describe("Start date (YYYYMMDD). Defaults to 1st of current month."),
  end_date: z
    .string()
    .regex(/^\d{8}$/)
    .optional()
    .describe("End date (YYYYMMDD). Defaults to today."),
  section_id: z
    .string()
    .optional()
    .describe("Section ID. Defaults to WHOOING_SECTION_ID env var."),
};

export function createWhooingMcpServer(client: WhooingClient): McpServer {
  const server = new McpServer(
    {
      name: "whooing-mcp",
      version: "0.3.2",
    },
    {
      instructions:
        "Whooing (후잉) is a Korean personal finance tracking service. " +
        "This server provides access to financial data: " +
        "spending/income summaries (P&L), transaction lists, balance sheets, " +
        "and account listings. It can create, update, and delete entries. " +
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
      const startDate = args.start_date ?? defaults.startDate;
      const endDate = args.end_date ?? defaults.endDate;
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
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .describe("Max number of entries to return. Defaults to 20."),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const defaults = getDateDefaults();
      const startDate = args.start_date ?? defaults.startDate;
      const endDate = args.end_date ?? defaults.endDate;
      const sectionId = args.section_id ?? client.defaultSectionId;
      const limit = args.limit ?? 20;

      await client.loadAccounts(sectionId);
      const results = await client.apiGet("entries.json", {
        section_id: sectionId,
        start_date: startDate,
        end_date: endDate,
        limit: String(limit),
      });

      const text = formatEntries(
        results as Parameters<typeof formatEntries>[0],
        client.getAccountCache()
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
      const startDate = args.start_date ?? defaults.startDate;
      const endDate = args.end_date ?? defaults.endDate;
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
          .regex(/^\d{8}$/)
          .describe("Transaction date in YYYYMMDD format"),
        l_account_id: z
          .string()
          .describe("Left account ID (e.g. expense category like x11 for 식비)"),
        r_account_id: z
          .string()
          .describe("Right account ID (e.g. payment method like x24 for 삼성카드)"),
        item: z.string().describe("Item description (store name or item)"),
        money: z
          .number()
          .refine((n) => n !== 0, { message: "Amount must not be zero" })
          .describe("Amount in KRW (negative for balance adjustments)"),
        memo: z.string().optional().describe("Optional memo"),
        section_id: z
          .string()
          .optional()
          .describe("Section ID. Defaults to WHOOING_SECTION_ID env var."),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) => {
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
        entry_date: args.entry_date,
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

      const formattedDate = `${args.entry_date.slice(0, 4)}-${args.entry_date.slice(4, 6)}-${args.entry_date.slice(6, 8)}`;
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
          .regex(/^\d{8}$/)
          .describe("Transaction date in YYYYMMDD format"),
        l_account_id: z
          .string()
          .describe("Left account ID (e.g. expense category)"),
        r_account_id: z
          .string()
          .describe("Right account ID (e.g. payment method)"),
        item: z.string().describe("Item description (store name or item)"),
        money: z.number().min(0).describe("Amount in KRW"),
        memo: z.string().optional().describe("Optional memo"),
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
        entry_date: args.entry_date,
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

      const formattedDate = `${args.entry_date.slice(0, 4)}-${args.entry_date.slice(4, 6)}-${args.entry_date.slice(6, 8)}`;
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

      await client.apiDelete(`entries/${args.entry_id}/${sectionId}.json`);

      return {
        content: [{ type: "text", text: `Entry ${args.entry_id} deleted successfully.` }],
      };
    }
  );

  return server;
}
