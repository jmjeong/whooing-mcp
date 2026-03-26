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
      version: "0.1.0",
    },
    {
      instructions:
        "Whooing (후잉) is a Korean personal finance tracking service. " +
        "This server provides read-only access to financial data: " +
        "spending/income summaries (P&L), transaction lists, balance sheets, " +
        "and account listings. " +
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

  return server;
}
