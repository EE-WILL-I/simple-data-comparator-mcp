# Simple Data Comparator MCP

Simple toolset for performing comparison of JSON, XML, XLSX, CSV and text inputs in Actual-Expected format.

# Documentation

Agent-oriented reference for the **simple-data-comparator-mcp** MCP server. Each validator compares an **actual** value against an **expected template** and returns pass/fail with structured difference lines on failure.

## Tools

| MCP Tool | Doc | Use when |
|---|---|---|
| `validate-json` | [json-validator.md](skills\json-comparator\references\json-validator.md) | Comparing JSON API responses, config objects, or structured data |
| `validate-xml` | [xml-validator.md](skills\xml-comparator\references\xml-validator.md) | Comparing XML documents, SOAP payloads, or config files |
| `validate-csv` | [csv-validator.md](skills\csv-comparator\references\csv-validator.md) | Comparing tabular CSV exports or reports |
| `validate-xlsx` | [xlsx-validator.md](skills\xlsx-validator\references\xlsx-validator.md) | Comparing Excel workbook sheets |
| `validate-text` | [text-validator.md](skills\text-validator\references\text-validator.md) | Exact line-by-line text comparison (logs, plain output) |

## Common response shape

All tools return MCP content with this structure:

```json
{
  "content": [{ "type": "text", "text": "<result message>" }],
  "isError": true | false
}
```

- **Pass:** `isError: false`, text is `Validation passed.`
- **Fail:** `isError: true`, text includes `Validation failed.` and difference lines (except text validator, which does not expose diff details via MCP)

## Agent workflow

1. **Choose the tool** that matches the data format you need to compare.
2. **Prepare both sides** as strings — JSON/XML/CSV/text as plain strings; XLSX as base64-encoded file bytes.
3. **Call the MCP tool** with `actual` (what you received) and `template` (what you expected).
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
