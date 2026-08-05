---
name: json-comparator
description: Compares JSON actual vs expected template via the validate-json MCP tool. Use when validating API responses, JSON configs, nested objects, JSON Schema contracts, or when the user asks to compare, diff, or validate JSON data.
---

# JSON Comparator

Compare **actual** JSON against an **expected template** or **JSON Schema** using the `validate-json` MCP tool (`simple-data-comparator-mcp` server).

## Workflow

1. **Discover the tool** — call `GetMcpTools` for the comparator MCP server, then invoke `validate-json`.
2. **Prepare strings** — both `actual` and `template` must be valid JSON **strings** (serialize objects before calling).
3. **Call the tool** with `actual` (received data) and `template` (expected data or schema).
4. **Check `isError`** in the MCP response:
   - `false` → validation passed
   - `true` → read difference lines and explain mismatches to the user
5. **Retry** with options (`strictMode`, `ignoreProps`, `ignoreSimilar`, etc.) as needed.

## Parameters

| Parameter | Default | Purpose |
|---|---|---|
| `actual` | required | JSON string to validate |
| `template` | required | Expected JSON template, or JSON Schema when `useJsonSchema` is `true` |
| `strictMode` | `false` | `true` = fail on extra fields not in template |
| `ignoreArrayOrder` | `false` | Sort arrays before comparing |
| `ignoreProps` | — | Property names stripped from both sides (e.g. `["timestamp"]`) |
| `ignoreSimilar` | `false` | Pass when values differ but JS types match |
| `useJsonSchema` | `false` | Treat `template` as JSON Schema (Ajv) |

Default (`strictMode: false`) ignores extra fields in `actual`. Use `strictMode: true` for strict contract testing.

## Interpreting results

**Pass:** `Validation passed.`

**Fail:**
```
Validation failed.
Differences:
[mismatch] age expected=30 actual=25
[missing] status expected="active" actual=undefined
[extra] city actual="NYC" expected=undefined
[schema_error] / is missing required property: age
[duplicate_key] "name" appears multiple times in the JSON
```

Paths use dot notation and `[index]` for arrays (e.g. `users[0].email`).

**Parse error:** `JSON parse error: ...` — fix JSON syntax before re-validating.

## Example calls

**Exact match:**
```json
{
  "actual": "{\"name\":\"John\",\"age\":30}",
  "template": "{\"name\":\"John\",\"age\":30}"
}
```

**Ignore volatile timestamp:**
```json
{
  "actual": "{\"name\":\"John\",\"timestamp\":\"2026-01-15T10:00:00Z\"}",
  "template": "{\"name\":\"John\",\"timestamp\":\"2026-01-01T00:00:00Z\"}",
  "ignoreProps": ["timestamp"]
}
```

**JSON Schema validation:**
```json
{
  "actual": "{\"name\":\"Alice\",\"age\":25}",
  "template": "{\"type\":\"object\",\"required\":[\"name\",\"age\"],\"properties\":{\"name\":{\"type\":\"string\"},\"age\":{\"type\":\"number\"}}}",
  "useJsonSchema": true
}
```

**Ignore array order:**
```json
{
  "actual": "{\"tags\":[\"b\",\"a\"]}",
  "template": "{\"tags\":[\"a\",\"b\"]}",
  "ignoreArrayOrder": true
}
```

## Rules

- Always pass JSON as **strings**, not raw objects, in MCP arguments.
- Use `validate-json` for structured JSON — not `validate-text`.
- Template values wrapped in `/.../` are regex patterns, not literal strings.
- Duplicate keys in raw `actual` JSON always fail.
- Set `useJsonSchema: true` when validating against a schema contract, not a literal object.

## Full reference

See [references/json-comparator.md](references/json-comparator.md) for extended examples.
