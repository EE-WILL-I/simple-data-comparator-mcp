# Text Validator (`validate-text`)

Compare a plain-text **actual** string against an **expected template** string using exact line-by-line matching.

**MCP tool name:** `validate-text`

## When to use

- Verify log output, CLI stdout, or plain-text file contents
- Compare fixed-format text reports (no structured parsing needed)
- Quick sanity check that two text blobs are identical

## Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `actual` | string | yes | Text to validate |
| `template` | string | yes | Expected text template |

## Response

**Pass:**
```
Validation passed.
```

**Fail:**
```
Validation failed: text does not match template.
```

> **Note:** The MCP tool does **not** return line-level diff details on failure. The underlying validator logs `[extra]` and `[missing]` lines internally, but agents only receive the generic failure message via MCP. For detailed text diffs, compare manually or use a diff tool.

## Comparison behavior

- Comparison is **line-based** (split on newline boundaries).
- Whitespace within lines is significant — leading/trailing spaces matter.
- Line endings: both sides are compared as provided; normalize `\r\n` vs `\n` if your environment mixes them.

## Examples for agents

### Identical text — pass

```json
{
  "name": "validate-text",
  "arguments": {
    "actual": "Hello World",
    "template": "Hello World"
  }
}
```

### Different text — fail

```json
{
  "name": "validate-text",
  "arguments": {
    "actual": "Hello World",
    "template": "Hello Earth"
  }
}
```

### Multi-line text — pass

```json
{
  "name": "validate-text",
  "arguments": {
    "actual": "line1\nline2\nline3",
    "template": "line1\nline2\nline3"
  }
}
```

### Extra line — fail

```json
{
  "name": "validate-text",
  "arguments": {
    "actual": "line1\nline2\nextra line",
    "template": "line1\nline2"
  }
}
```

### Missing line — fail

```json
{
  "name": "validate-text",
  "arguments": {
    "actual": "line1",
    "template": "line1\nline2"
  }
}
```

### Fixed-width report block

```json
{
  "name": "validate-text",
  "arguments": {
    "actual": "ORDER REPORT\n===========\nID: 1001\nStatus: OK",
    "template": "ORDER REPORT\n===========\nID: 1001\nStatus: OK"
  }
}
```

## Agent tips

1. **Normalize line endings** before calling if your source mixes `\n` and `\r\n`.
2. **Trailing newline** differences count — `"a\n"` vs `"a"` fails.
3. Use **`validate-text`** only when you need a binary pass/fail. For structured data, prefer `validate-json`, `validate-xml`, or `validate-csv`.
4. When validation fails, re-read both strings side by side or run a local diff if you need to explain the mismatch to the user.
5. For JSON/XML/CSV content, do not use this tool — use the format-specific validator for meaningful difference output.
