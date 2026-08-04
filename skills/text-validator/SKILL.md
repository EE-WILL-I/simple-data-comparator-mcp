---
name: text-validator
description: Compares plain text actual vs expected via the validate-text MCP tool. Use when validating logs, CLI stdout, fixed-format text reports, or when the user asks for exact line-by-line text comparison.
---

# Text Validator

Compare **actual** text against an **expected template** using the `validate-text` MCP tool (`simple-data-comparator-mcp` server). Comparison is exact, line-by-line.

## Workflow

1. **Discover the tool** — call `GetMcpTools` for the comparator MCP server, then invoke `validate-text`.
2. **Normalize line endings** if sources mix `\n` and `\r\n` (convert to one style on both sides).
3. **Call the tool** with `actual` and `template` strings.
4. **Check `isError`**:
   - `false` → texts match
   - `true` → texts differ (MCP does **not** return line-level diff details)

## Parameters

| Parameter | Required | Purpose |
|---|---|---|
| `actual` | yes | Text to validate |
| `template` | yes | Expected text template |

## Interpreting results

**Pass:** `Validation passed.`

**Fail:** `Validation failed: text does not match template.`

No diff lines are returned via MCP. If the user needs to know *what* differed:
- Compare both strings side by side locally
- Or use a diff tool / `diffLines` in code

## Comparison rules (built into validator)

- Line-based splitting on newlines
- Whitespace within lines is significant (leading/trailing spaces matter)
- Trailing newline differences count (`"a\n"` ≠ `"a"`)

## Example call

```json
{
  "actual": "line1\nline2\nline3",
  "template": "line1\nline2\nline3"
}
```

## When to use vs other tools

| Content type | Use instead |
|---|---|
| JSON | `validate-json` |
| XML | `validate-xml` |
| CSV / tables | `validate-csv` |
| Excel | `validate-xlsx` |
| Plain text / logs | `validate-text` |

## Rules

- Do not use `validate-text` for JSON, XML, or CSV — format-specific tools give actionable diff output.
- Normalize `\r\n` → `\n` before comparing when data comes from Windows and Unix sources.
- For structured pass/fail with diff details, pick the matching format validator.

## Full reference

See [references/text-validator.md](references/text-validator.md) for extended examples.
