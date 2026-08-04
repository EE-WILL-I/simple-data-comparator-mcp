# CSV Validator (`validate-csv`)

Compare a CSV **actual** string against an **expected template** CSV string. Uses table alignment (`daff`) to produce row- and column-level diffs.

**MCP tool name:** `validate-csv`

## When to use

- Verify exported CSV reports match expected output
- Compare database query exports
- Validate ETL pipeline tabular output (subset of columns, unordered rows)

## Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `actual` | string | yes | — | CSV string to validate |
| `template` | string | yes | — | Expected CSV template string |
| `includeColumns` | string[] | no | — | Only compare these column headers (others stripped) |
| `excludeColumns` | string[] | no | — | Skip these columns during comparison |
| `ignoreRowOrder` | boolean | no | `false` | Sort data rows before comparing (header preserved) |
| `rowKey` | string \| string[] | no | — | Header name(s) that uniquely identify a row for alignment |
| `delimiter` | string | no | auto | CSV field delimiter for both sides |
| `expectedDelimiter` | string | no | auto | Delimiter for the template CSV only |
| `actualDelimiter` | string | no | auto | Delimiter for the actual CSV only |

Delimiter is auto-detected per file from `,`, `;`, `\t`, or `|` when not set. Template and actual may use different delimiters.

## Response

**Pass:**
```
Validation passed.
```

**Fail:**
```
Validation failed.
Differences:
[mismatch] row 1, col "name": expected="Alice" actual="Bob"
[extra_row] row 2: { name="Bob", age="35", city="LA" }
```

## Difference line types

| Tag | Meaning |
|---|---|
| `[mismatch]` | Cell value differs at row/column |
| `[extra_row]` | Row present in actual but not in template |
| `[missing_row]` | Row in template missing from actual |
| `[extra_column]` | Column in actual not in template |
| `[missing_column]` | Column in template missing from actual |
| `[column_renamed]` | Column header renamed between sides |
| `[column_filter]` | `includeColumns`/`excludeColumns` matched no headers |
| `[parse_error]` | CSV could not be parsed |

## Examples for agents

### Identical CSV — pass

```json
{
  "name": "validate-csv",
  "arguments": {
    "actual": "name,age,city\nAlice,30,NYC",
    "template": "name,age,city\nAlice,30,NYC"
  }
}
```

### Cell value mismatch — fail

```json
{
  "name": "validate-csv",
  "arguments": {
    "actual": "name,age,city\nBob,30,NYC",
    "template": "name,age,city\nAlice,30,NYC"
  }
}
```

### Compare only specific columns

Ignore `city` differences by validating `name` and `age` only:

```json
{
  "name": "validate-csv",
  "arguments": {
    "actual": "name,age,city\nAlice,30,LA",
    "template": "name,age,city\nAlice,30,NYC",
    "includeColumns": ["name", "age"]
  }
}
```
→ Passes (city column stripped before comparison).

### Exclude volatile columns

```json
{
  "name": "validate-csv",
  "arguments": {
    "actual": "id,name,created_at\n1,Alice,2026-01-15T10:00:00Z",
    "template": "id,name,created_at\n1,Alice,2026-01-14T08:30:00Z",
    "excludeColumns": ["created_at"]
  }
}
```
→ Passes (`created_at` excluded).

### Ignore row order

Same rows in different order should pass:

```json
{
  "name": "validate-csv",
  "arguments": {
    "actual": "name,age\nBob,25\nAlice,30",
    "template": "name,age\nAlice,30\nBob,25",
    "ignoreRowOrder": true
  }
}
```

### Multi-row export

```json
{
  "name": "validate-csv",
  "arguments": {
    "actual": "sku,product_name,price\nSKU001,Laptop,999.99\nSKU002,Mouse,34.99",
    "template": "sku,product_name,price\nSKU001,Laptop,999.99\nSKU002,Mouse,29.99"
  }
}
```
→ Fails with `[mismatch]` on the `price` column for row 1.

### Semicolon-delimited (auto-detected)

```json
{
  "name": "validate-csv",
  "arguments": {
    "actual": "name;age\nJohn;30",
    "template": "name;age\nJohn;30"
  }
}
```

### Row key alignment

Align rows by primary key instead of position — one inserted row produces one `[extra_row]`:

```json
{
  "name": "validate-csv",
  "arguments": {
    "actual": "id,name\n1,Alice\n3,Charlie\n2,Bob",
    "template": "id,name\n1,Alice\n2,Bob",
    "rowKey": "id"
  }
}
```

### Force delimiter

```json
{
  "name": "validate-csv",
  "arguments": {
    "actual": "name;age\nJohn;30",
    "template": "name,age\nJohn,30",
    "expectedDelimiter": ",",
    "actualDelimiter": ";"
  }
}
```

## Agent tips

1. **Always include the header row** in both `actual` and `template`.
2. **Header matching is case-sensitive** but tolerates BOM and surrounding whitespace.
3. Use **`includeColumns`** when you only care about a subset of a wide export.
4. Use **`ignoreRowOrder`** when row position is not meaningful (e.g. unordered query results).
5. If you get `[column_filter]` errors, compare the listed headers — a typo or wrong delimiter is usually the cause.
6. Use **`rowKey`** when inserts/deletes should align by ID rather than row position.
7. For large CSVs, consider filtering columns first to reduce noise in diff output.
