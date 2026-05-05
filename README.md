# whooing-mcp

[![npm version](https://img.shields.io/npm/v/whooing-mcp.svg)](https://www.npmjs.com/package/whooing-mcp)

MCP server for [Whooing (후잉)](https://whooing.com) personal finance — manage transactions, view spending, balance sheets, budgets, and more.

## Setup

### 1. Get API Credentials

1. Go to [Whooing App Settings](https://whooing.com/#main/setting/app)
2. Note your `app_id`, `token`, and `signature`
3. Find your `section_id` from the API or URL

### 2. Configure Environment

```bash
export WHOOING_APP_ID=3
export WHOOING_TOKEN=your_token
export WHOOING_SIGNATURE=your_signature
export WHOOING_SECTION_ID=your_section_id
```

Or create a `.env` file (see `.env.example`).

## Usage

### stdio mode (Claude Code, Claude Desktop)

```bash
npx whooing-mcp
```

### HTTP mode (daemon)

```bash
npx whooing-mcp --http --port 8182
```

### Claude Code config (`~/.mcp.json`)

```json
{
  "mcpServers": {
    "whooing": {
      "command": "npx",
      "args": ["whooing-mcp"],
      "env": {
        "WHOOING_APP_ID": "3",
        "WHOOING_TOKEN": "...",
        "WHOOING_SIGNATURE": "...",
        "WHOOING_SECTION_ID": "..."
      }
    }
  }
}
```

### Claude Desktop config

```json
{
  "mcpServers": {
    "whooing": {
      "command": "npx",
      "args": ["whooing-mcp"],
      "env": {
        "WHOOING_APP_ID": "3",
        "WHOOING_TOKEN": "...",
        "WHOOING_SIGNATURE": "...",
        "WHOOING_SECTION_ID": "..."
      }
    }
  }
}
```

## Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `whooing_pl` | Profit & loss (spending/income by category) | `start_date?`, `end_date?`, `section_id?` |
| `whooing_entries` | Transaction list with account names; supports client-side filters | `start_date?`, `end_date?`, `limit?`, `account_ids?`, `account_name?`, `l_account_id?`, `r_account_id?`, `min_money?`, `max_money?`, `item_contains?`, `memo_contains?`, `query?`, `keywords?`, `section_id?` |
| `whooing_search_entries` | Search-focused transaction lookup | `start_date?`, `end_date?`, `limit?`, `account_ids?`, `account_name?`, `l_account_id?`, `r_account_id?`, `min_money?`, `max_money?`, `item_contains?`, `memo_contains?`, `query?`, `keywords?`, `section_id?` |
| `whooing_entry_detail` | Single transaction lookup by ID | `entry_id`, `section_id?` |
| `whooing_duplicate_candidates` | Find likely duplicate transactions in a date range | `start_date?`, `end_date?`, `limit?`, `account_ids?`, `account_name?`, `l_account_id?`, `r_account_id?`, `min_money?`, `max_money?`, `item_contains?`, `memo_contains?`, `query?`, `keywords?`, `include_memo?`, `min_group_size?`, `page_limit?`, `max_pages?`, `section_id?` |
| `whooing_account_activity` | Account-focused transaction summary | `start_date?`, `end_date?`, `account_id?`, `account_name?`, `limit?`, `recent_limit?`, `page_limit?`, `max_pages?`, `max_api_calls?`, `section_id?` |
| `whooing_balance` | Balance sheet (assets, liabilities, capital) | `start_date?`, `end_date?`, `section_id?` |
| `whooing_budget` | Budget status | `start_date?`, `end_date?`, `section_id?` |
| `whooing_accounts` | Full account list | `section_id?` |
| `whooing_sections` | List all sections (가계부) | (none) |
| `whooing_calendar` | Daily income/expense overview by month | `start_month?`, `end_month?`, `section_id?` |
| `whooing_monthly_summary` | Month-by-month income, expense, net amount, and transaction count | `start_month?`, `end_month?`, `section_id?` |
| `whooing_frequent_items` | Saved frequent transaction templates | `section_id?` |
| `whooing_latest_items` | Recent unique items for autocomplete (60 days) | `section_id?` |
| `whooing_add_entry` | Create a new transaction entry | `entry_date`, `l_account_id`, `r_account_id`, `item`, `money`, `memo?`, `section_id?` |
| `whooing_bulk_add_entries` | Create multiple transaction entries | `entries[]`, `section_id?` |
| `whooing_update_entry` | Update an existing entry | `entry_id`, `entry_date`, `l_account_id`, `r_account_id`, `item`, `money`, `memo?`, `section_id?` |
| `whooing_delete_entry` | Delete an entry | `entry_id`, `section_id?` |

- Dates use `YYYYMMDD` format. Default: current month (1st to today).
- Calendar months use `YYYYMM` format. Default: current month.
- `whooing_entries` filters are applied after fetching the date-range results from Whooing. Use a larger `limit` when searching busy periods.
- `whooing_search_entries` uses Whooing's server-side filters first (`item`, `memo`, account, amount range) and paginates with the `max` cursor when needed.
- `account_name` matches account titles case-insensitively, so `account_name: "Game"` can narrow results to a game expense category without looking up its account ID first.
- When `account_name` matches multiple accounts, search tools split the query per account so each request can still use Whooing's server-side account filter.
- `min_money` and `max_money` filter `whooing_entries` by amount.
- `query` and `keywords` match against both `item` and `memo`; `item_contains` and `memo_contains` target one field.
- For efficient broad searches, prefer `item_contains`, `memo_contains`, account filters, and amount filters over generic `keywords`; `query` is optimized as server-side item-or-memo search.
- `whooing_duplicate_candidates` groups entries with the same date, amount, accounts, and item; set `include_memo` to make memo part of the duplicate key. Use account/item/amount filters to keep duplicate scans efficient.
- `whooing_account_activity` accepts either `account_id` or `account_name` and summarizes only matching entries.
- Search tools cap internal Whooing requests with `max_api_calls` to stay within API rate guidance.
- `whooing_account_activity` also tries Whooing's account-specific aggregate APIs for daily changes, item totals, and client totals.
- `whooing_monthly_summary` uses `report_summary.json` with `rows_type=month` for direct monthly income/expense totals.
- `whooing_bulk_add_entries` validates account IDs for each row before creating it and reports partial failures.
- `section_id` defaults to `WHOOING_SECTION_ID` env var.
- Write tools resolve account types automatically from the account cache. Use `whooing_accounts` to look up account IDs first.

## Running as a daemon (macOS launchd)

Create `~/Library/LaunchAgents/com.whooing.mcp.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>com.whooing.mcp</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/npx</string>
        <string>whooing-mcp</string>
        <string>--http</string>
        <string>--port</string>
        <string>8182</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>WHOOING_APP_ID</key><string>3</string>
        <key>WHOOING_TOKEN</key><string>YOUR_TOKEN</string>
        <key>WHOOING_SIGNATURE</key><string>YOUR_SIGNATURE</string>
        <key>WHOOING_SECTION_ID</key><string>YOUR_SECTION_ID</string>
        <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>
    <key>KeepAlive</key><true/>
    <key>RunAtLoad</key><true/>
    <key>StandardOutPath</key><string>/tmp/whooing-mcp.log</string>
    <key>StandardErrorPath</key><string>/tmp/whooing-mcp.err</string>
</dict>
</plist>
```

```bash
chmod 600 ~/Library/LaunchAgents/com.whooing.mcp.plist
launchctl load ~/Library/LaunchAgents/com.whooing.mcp.plist
```

## Development

```bash
git clone https://github.com/jmjeong/whooing-mcp.git
cd whooing-mcp
npm install
npm run build
node dist/cli.js
```

## License

MIT
