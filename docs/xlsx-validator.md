# XLSX Validator (`validate-xlsx`)

Compare an Excel **actual** workbook against an **expected template** workbook. Both files are provided as **base64-encoded** strings. Internally converts the selected sheet to CSV and delegates to the CSV validator.

**MCP tool name:** `validate-xlsx`

## When to use

- Verify generated Excel reports match a golden template file
- Compare spreadsheet exports from different pipeline runs
- Validate a specific sheet tab in multi-sheet workbooks

## Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `actual` | string | yes | — | Base64-encoded XLSX file bytes to validate |
| `template` | string | yes | — | Base64-encoded expected XLSX template |
| `sheet` | string \| number | no | `0` | Sheet name or 0-based index (applied to both workbooks) |
| `includeColumns` | string[] | no | — | Only compare these column headers |
| `excludeColumns` | string[] | no | — | Skip these columns |

Sheet selection uses the first sheet (`0`) when `sheet` is omitted.

## Response

Same shape as CSV validator (sheet is converted to CSV internally).

**Pass:**
```
Validation passed.
```

**Fail:**
```
Validation failed.
Differences:
[mismatch] row 0, col "price": expected="29.99" actual="34.99"
```

**Missing sheet:**
```
Validation failed.
Differences:
[missing_sheet] actual workbook is missing sheet "Summary"
  available sheets: [Data, Metadata]
```

## Difference line types

All CSV difference types apply (`[mismatch]`, `[extra_row]`, `[missing_row]`, etc.), plus:

| Tag | Meaning |
|---|---|
| `[missing_sheet]` | Requested sheet not found in workbook |
| `[parse_error]` | Workbook could not be read |

## Encoding files as base64

Agents must encode raw XLSX bytes as base64 before calling the tool.

**Node.js:**
```javascript
const base64 = fs.readFileSync('report.xlsx').toString('base64');
```

**Python:**
```python
import base64
base64.b64encode(open('report.xlsx', 'rb').read()).decode()
```

**PowerShell:**
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('report.xlsx'))
```

## Examples for agents

### Compare first sheet — pass

Assume `ACTUAL_BASE64` and `TEMPLATE_BASE64` are base64 strings of the two files:

```json
{
  "name": "validate-xlsx",
  "arguments": {
    "actual": "ACTUAL_BASE64",
    "template": "TEMPLATE_BASE64"
  }
}
```

### Compare sheet by name

```json
{
  "name": "validate-xlsx",
  "arguments": {
    "actual": "ACTUAL_BASE64",
    "template": "TEMPLATE_BASE64",
    "sheet": "Sales Data"
  }
}
```

### Compare sheet by index

```json
{
  "name": "validate-xlsx",
  "arguments": {
    "actual": "ACTUAL_BASE64",
    "template": "TEMPLATE_BASE64",
    "sheet": 1
  }
}
```

### Compare only key columns

```json
{
  "name": "validate-xlsx",
  "arguments": {
    "actual": "ACTUAL_BASE64",
    "template": "TEMPLATE_BASE64",
    "sheet": "Export",
    "includeColumns": ["order_id", "total", "status"]
  }
}
```

### Exclude timestamp column

```json
{
  "name": "validate-xlsx",
  "arguments": {
    "actual": "ACTUAL_BASE64",
    "template": "TEMPLATE_BASE64",
    "excludeColumns": ["generated_at"]
  }
}
```

## Agent workflow

1. Read both XLSX files as binary.
2. Base64-encode each file.
3. Call `validate-xlsx` with `actual` and `template`.
4. If comparing a non-default tab, set `sheet` to the tab name or index.
5. Use `includeColumns` / `excludeColumns` to focus on business-relevant fields.
6. On failure, interpret difference lines using the [CSV validator glossary](./csv-validator.md#difference-line-types).

## Agent tips

1. **Sheet names are case-sensitive** — use exact names from the workbook.
2. If you get `[missing_sheet]`, the response lists `available sheets` — pick the correct name or index.
3. Empty rows are dropped by default during sheet-to-CSV conversion.
4. Numbers are formatted for human-readable comparison (not raw Excel serials).
5. For multi-sheet validation, call the tool once per sheet you need to check.
6. Large files: base64 expands size ~33% — ensure the MCP transport can handle the payload.

## Advanced features (not exposed via MCP)

The underlying `validateXlsx` function also supports `actualSheet`, `expectedSheet`, `ignoreRowOrder`, `rowKey`, `csvDelimiter`, `blankrows`, and `rawNumbers`. These are not MCP parameters today.
