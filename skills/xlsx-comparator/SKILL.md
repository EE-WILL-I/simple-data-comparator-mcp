---
name: xlsx-comparator
description: Compares XLSX workbooks actual vs expected via the validate-xlsx MCP tool. Use when validating Excel reports, spreadsheet exports, workbook sheets, or when the user asks to compare or validate .xlsx files.
---

# XLSX comparator

Compare **actual** and **expected** Excel workbooks using the **`compare-xlsx`** MCP tool (`simple-data-comparator-mcp` server). Pass **workspace file paths** directly (e.g. `Templates/test/1.xlsx`) or base64-encoded bytes.

## Workflow

1. **Discover the tool** — call `GetMcpTools`, then invoke **`compare-xlsx`** (preferred) or `validate-xlsx`.
2. **Pass file paths** — use workspace-relative paths from the user's request as `actual` and `template`.
3. **Do not** read XLSX binaries yourself or write custom comparison scripts.
4. **Set sheet selection** — `sheet`, or `actualSheet` / `expectedSheet` for different tabs.
5. **Check `isError`** and interpret CSV-style difference lines.

## Encoding (required)

**Node.js:** `fs.readFileSync('file.xlsx').toString('base64')`

**Python:** `base64.b64encode(open('file.xlsx', 'rb').read()).decode()`

**PowerShell:** `[Convert]::ToBase64String([IO.File]::ReadAllBytes('file.xlsx'))`

## Parameters

| Parameter | Default | Purpose |
|---|---|---|
| `actual` | required | File path (e.g. `Templates/test/1.xlsx`) or base64 XLSX |
| `template` | required | File path or base64 expected XLSX |
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

**Compare two files by path:**
```json
{
  "actual": "Templates/test/1.xlsx",
  "template": "Templates/test/2.xlsx"
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

- Prefer **`compare-xlsx`** when the user asks to compare Excel files.
- Pass **file paths** from the user's workspace — base64 is optional.
- Sheet names are **case-sensitive**.
- Default compares first sheet — set `sheet` explicitly for other tabs.
- Difference lines follow CSV format — see [csv-comparator SKILL](../csv-comparator/SKILL.md).

## Full reference

See [references/xlsx-comparator.md](references/xlsx-comparator.md) for extended examples.
