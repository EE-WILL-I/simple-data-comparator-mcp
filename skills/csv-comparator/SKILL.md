---
name: csv-comparator
description: Compares CSV actual vs expected template via the validate-csv MCP tool. Use when validating CSV exports, tabular reports, database dumps, ETL output, or when the user asks to compare or validate CSV data.
---

# CSV Comparator

Compare **actual** CSV against an **expected template** using the `validate-csv` MCP tool (`simple-data-comparator-mcp` server).

## Workflow

1. **Discover the tool** — call `GetMcpTools` for the comparator MCP server, then invoke `validate-csv`.
2. **Prepare strings** — both sides must include a **header row** plus data rows as a single CSV string.
3. **Choose options** as needed (column filters, row order, row keys, delimiters).
4. **Call the tool** and check `isError`.
5. **Explain failures** by row index and column name from difference lines.

## Parameters

| Parameter | Default | Purpose |
|---|---|---|
| `actual` | required | CSV string to validate |
| `template` | required | Expected CSV template string |
| `includeColumns` | — | Only compare these header names |
| `excludeColumns` | — | Skip these header names |
| `ignoreRowOrder` | `false` | Sort data rows before comparing |
| `rowKey` | — | Header name(s) for row alignment (string or array) |
| `delimiter` | auto | Delimiter for both sides |
| `expectedDelimiter` | auto | Delimiter for template only |
| `actualDelimiter` | auto | Delimiter for actual only |

Delimiter auto-detects `,`, `;`, `\t`, `|` when not set. Each side may use a different delimiter.

## Interpreting results

**Pass:** `Validation passed.`

**Fail:** `[mismatch]`, `[extra_row]`, `[missing_row]`, `[extra_column]`, `[missing_column]`, `[column_filter]`, `[parse_error]`

Header matching is **case-sensitive** (BOM and surrounding whitespace tolerated).

## Example calls

**Basic:**
```json
{
  "actual": "name,age,city\nAlice,30,NYC",
  "template": "name,age,city\nAlice,30,NYC"
}
```

**Row key alignment:**
```json
{
  "actual": "id,name\n1,Alice\n3,Charlie\n2,Bob",
  "template": "id,name\n1,Alice\n2,Bob",
  "rowKey": "id"
}
```

**Different delimiters per side:**
```json
{
  "actual": "name;age\nJohn;30",
  "template": "name,age\nJohn,30",
  "expectedDelimiter": ",",
  "actualDelimiter": ";"
}
```

**Ignore row order:**
```json
{
  "actual": "name,age\nBob,25\nAlice,30",
  "template": "name,age\nAlice,30\nBob,25",
  "ignoreRowOrder": true
}
```

## Rules

- Always include the header row on both sides.
- Use `rowKey` when inserts should produce a single `[extra_row]` instead of shifted-row noise.
- Use `excludeColumns` for timestamps or generated IDs.
- For Excel files, use `validate-xlsx` instead.

## Full reference

See [references/csv-validator.md](references/csv-validator.md) for extended examples.
