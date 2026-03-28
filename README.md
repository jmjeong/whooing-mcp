# whooing-mcp

[![npm version](https://img.shields.io/npm/v/whooing-mcp.svg)](https://www.npmjs.com/package/whooing-mcp)

MCP server for [Whooing (후잉)](https://whooing.com) personal finance — read-only queries for spending, transactions, balance sheets, and accounts.

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
| `whooing_entries` | Transaction list with account names | `start_date?`, `end_date?`, `limit?`, `section_id?` |
| `whooing_balance` | Balance sheet (assets, liabilities, capital) | `start_date?`, `end_date?`, `section_id?` |
| `whooing_accounts` | Full account list | `section_id?` |
| `whooing_sections` | List all sections (가계부) | (none) |

- Dates use `YYYYMMDD` format. Default: current month (1st to today).
- `section_id` defaults to `WHOOING_SECTION_ID` env var.
- All tools are read-only.

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
