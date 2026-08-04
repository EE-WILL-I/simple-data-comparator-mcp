---
name: xlsx-validator
description: Compares XLSX workbooks actual vs expected via the validate-xlsx MCP tool. Use when validating Excel reports, spreadsheet exports, workbook sheets, or when the user asks to compare or validate .xlsx files.
---

# XLSX Validator

Compare **actual** and **expected** Excel workbooks using the `validate-xlsx` MCP tool (`simple-data-comparator-mcp` server). Both files must be **base64-encoded** strings.

## Workflow

1. **Read both XLSX files** as binary.
2. **Base64-encode** each file — the tool does not accept file paths.
3. **Discover the tool** — call `GetMcpTools`, then invoke `validate-xlsx`.
4. **Set sheet selection** — `sheet`, or `actualSheet` / `expectedSheet` for different tabs.
5. **Apply filters** — `includeColumns`, `excludeColumns`, `rowKey`, `ignoreRowOrder`.
6. **Check `isError`** and interpret CSV-style difference lines.

## Encoding (required)

**Node.js:** `fs.readFileSync('file.xlsx').toString('base64')`

**Python:** `base64.b64encode(open('file.xlsx', 'rb').read()).decode()`

**PowerShell:** `[Convert]::ToBase64String([IO.File]::ReadAllBytes('file.xlsx'))`

## Parameters

| Parameter | Default | Purpose |
|---|---|---|
| `actual` | required | Base64-encoded XLSX |
| `template` | required | Base64-encoded expected XLSX |
| `sheet` | `0` | Sheet for both workbooks |
| `actualSheet` | — | Sheet for actual only |
| `expectedSheet` | — | Sheet for template only |
| `includeColumns` | — | Only compare these headers |
| `excludeColumns` | — | Skip these headers |
| `ignoreRowOrder` | `false` | Sort rows before comparing |
| `rowKey` | — | Header name(s) for row alignment |
| `csvDelimiter` | `,` | Separator when converting sheet to CSV |
| `blankrows` | `false` | Include empty rows in conversion |
| `rawNumbers` | `false` | Use raw Excel serials vs formatted numbers |
| `delimiter` | — | CSV delimiter after conversion (both sides) |
| `expectedDelimiter` | — | Delimiter for template side only |
| `actualDelimiter` | — | Delimiter for actual side only |

## Example calls

**Basic with column filter:**
```json
{
  "actual": "<base64>",
  "template": "<base64>",
  "sheet": "Export",
  "excludeColumns": ["generated_at"]
}
```

**Different sheets per workbook:**
```json
{
  "actual": "<base64>",
  "template": "<base64>",
  "actualSheet": "Live Data",
  "expectedSheet": "Golden Copy"
}
```

**Row key + ignore row order:**
```json
{
  "actual": "<base64>",
  "template": "<base64>",
  "rowKey": "id",
  "ignoreRowOrder": true
}
```

## Rules

- Never pass file paths — only base64 strings.
- Sheet names are **case-sensitive**.
- Default compares first sheet — set `sheet` explicitly for other tabs.
- Difference lines follow CSV format — see [csv-comparator SKILL](../csv-comparator/SKILL.md).

## Full reference

See [references/xlsx-validator.md](references/xlsx-validator.md) for extended examples.
