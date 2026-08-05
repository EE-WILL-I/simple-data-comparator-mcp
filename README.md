# Simple Data Comparator MCP

Simple toolset for performing comparison of JSON, XML, XLSX, CSV and text data in Actual-Expected format with different options.

# Documentation

Agent-oriented reference for the **simple-data-comparator-mcp** MCP server. Each comparator compares an **actual** value against an **expected template** and returns pass/fail with structured difference lines on failure.

## Tools

| MCP Tool | Doc | Use when |
|---|---|---|
| `compare-json` | [json-comparator.md](skills/json-comparator/references/json-comparator.md) | Comparing JSON API responses, config objects, or structured data |
| `compare-xml` | [xml-comparator.md](skills/xml-comparator/references/xml-comparator.md) | Comparing XML documents, SOAP payloads, or config files |
| `compare-csv` | [csv-comparator.md](skills/csv-comparator/references/csv-comparator.md) | Comparing tabular CSV exports or reports |
| `compare-xlsx` | [xlsx-comparator.md](skills/xlsx-comparator/references/xlsx-comparator.md) | Comparing Excel workbook sheets |
| `compare-text` | [text-comparator.md](skills/text-comparator/references/text-comparator.md) | Exact line-by-line text comparison (logs, plain output) |

## Common response shape

All tools return MCP content with this structure:

```json
{
  "content": [{ "type": "text", "text": "<result message>" }],
  "isError": true | false
}
```

- **Pass:** `isError: false`, text is `Validation passed.`
- **Fail:** `isError: true`, text includes `Validation failed.` and difference lines (except text comparator, which does not expose diff details via MCP)

## Agent workflow

1. **Choose the tool** that matches the data format you need to compare.
2. **Prepare inputs** — JSON/XML/CSV/text as strings; XLSX as **workspace file paths** (e.g. `Templates/test/1.xlsx`) or base64.
3. **Call the MCP tool** — for Excel use **`compare-xlsx`** with `actual` and `template` file paths.
4. **Read `isError`** — if `true`, parse the difference lines to explain what diverged.
5. **Apply options** when needed (e.g. `strictMode` for JSON, `includeColumns` for CSV, `ignoreRowOrder` for unordered row sets).

## Discovering tools at runtime

Use MCP tool discovery (`tools/list`) to get live schemas. Tool names are stable: `validate-json`, `validate-xml`, `validate-csv`, `validate-xlsx`, `validate-text`.

## Running

Build and start the stdio MCP server:

```bash
npm run build
npm start
```

The server communicates over stdin/stdout. Logs are written to stderr so they do not interfere with MCP protocol messages.

## Cursor configuration

Add this to your Cursor MCP settings (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "simple-data-comparator-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "@ee_will_i/simple-data-comparator-mcp"
      ]
    }
  }
}
```

Replace the path with your local project path. Run `npm run build` before starting the server.
