# JSON Validator (`validate-json`)

Compare a JSON **actual** string against an **expected template** JSON string. Supports exact matching, optional strictness for extra fields, and regex patterns in template string values.

**MCP tool name:** `validate-json`

## When to use

- Verify an API response body matches an expected structure and values
- Check that generated JSON config matches a reference template
- Validate nested objects and arrays with detailed path-level diff output

## Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `actual` | string | yes | — | JSON string to validate (the value you received) |
| `template` | string | yes | — | Expected JSON template string, or JSON Schema when `useJsonSchema` is `true` |
| `strictMode` | boolean | no | `false` | When `true`, fail if `actual` has fields not present in `template` |
| `ignoreArrayOrder` | boolean | no | `false` | Sort arrays before comparing so order differences are ignored |
| `ignoreProps` | string[] | no | — | Property names stripped from both sides before comparing |
| `ignoreSimilar` | boolean | no | `false` | Pass when values differ but JS types match the template types |
| `useJsonSchema` | boolean | no | `false` | Treat `template` as a JSON Schema (Ajv) instead of a literal template |

`strictMode: false` (default) means extra fields in `actual` are ignored. Set `strictMode: true` to treat extra fields as failures.

## Response

**Pass:**
```
Validation passed.
```

**Fail (value mismatch):**
```
Validation failed.
Differences:
[mismatch] age expected=30 actual=25
```

**Fail (JSON parse error):**
```
JSON parse error: Unexpected token ...
```

## Difference line types

| Tag | Meaning |
|---|---|
| `[mismatch]` | Value differs at the given path |
| `[missing]` | Field present in template but absent in actual |
| `[extra]` | Field present in actual but not in template (only when `strictMode: true`) |
| `[moved]` | Array element moved to a different index |
| `[duplicate_key]` | Same key appears more than once in the raw JSON string |

Paths use dot notation for objects and `[index]` for arrays, e.g. `users[0].email`.

## Regex templates

Template string values wrapped in `/pattern/` are treated as regular expressions. The actual value must match the pattern.

Template:
```json
{ "email": "/.*@.*\\.com/" }
```

Actual passes if `email` matches the regex (e.g. `"user@example.com"`).

## Examples for agents

### Exact match — pass

```json
{
  "name": "validate-json",
  "arguments": {
    "actual": "{\"name\":\"John\",\"age\":30}",
    "template": "{\"name\":\"John\",\"age\":30}"
  }
}
```

### Value mismatch — fail

```json
{
  "name": "validate-json",
  "arguments": {
    "actual": "{\"name\":\"John\",\"age\":25}",
    "template": "{\"name\":\"John\",\"age\":30}"
  }
}
```

Expected difference line:
```
[mismatch] age expected=30 actual=25
```

### Extra field ignored (default)

```json
{
  "name": "validate-json",
  "arguments": {
    "actual": "{\"name\":\"John\",\"age\":30,\"city\":\"NYC\"}",
    "template": "{\"name\":\"John\",\"age\":30}"
  }
}
```
→ Passes (`strictMode` defaults to `false`).

### Strict mode — extra field fails

```json
{
  "name": "validate-json",
  "arguments": {
    "actual": "{\"name\":\"John\",\"age\":30,\"city\":\"NYC\"}",
    "template": "{\"name\":\"John\",\"age\":30}",
    "strictMode": true
  }
}
```
→ Fails with `[extra] city ...`

### Missing field — fail

```json
{
  "name": "validate-json",
  "arguments": {
    "actual": "{\"name\":\"John\"}",
    "template": "{\"name\":\"John\",\"age\":30}"
  }
}
```
→ Fails with `[missing] age ...`

### Nested object comparison

```json
{
  "name": "validate-json",
  "arguments": {
    "actual": "{\"user\":{\"name\":\"Alice\",\"roles\":[\"admin\",\"user\"]}}",
    "template": "{\"user\":{\"name\":\"Alice\",\"roles\":[\"admin\",\"user\"]}}"
  }
}
```

### Regex email validation

```json
{
  "name": "validate-json",
  "arguments": {
    "actual": "{\"email\":\"alice@company.com\",\"status\":\"active\"}",
    "template": "{\"email\":\"/.*@.*\\\\.com/\",\"status\":\"active\"}"
  }
}
```

### Ignore volatile properties

```json
{
  "name": "validate-json",
  "arguments": {
    "actual": "{\"name\":\"John\",\"timestamp\":\"2026-01-15T10:00:00Z\"}",
    "template": "{\"name\":\"John\",\"timestamp\":\"2026-01-01T00:00:00Z\"}",
    "ignoreProps": ["timestamp"]
  }
}
```

### Type-only matching (`ignoreSimilar`)

```json
{
  "name": "validate-json",
  "arguments": {
    "actual": "{\"score\":99,\"active\":false}",
    "template": "{\"score\":0,\"active\":true}",
    "ignoreSimilar": true
  }
}
```
→ Passes (types match; values differ).

### JSON Schema validation

```json
{
  "name": "validate-json",
  "arguments": {
    "actual": "{\"name\":\"Alice\",\"age\":25}",
    "template": "{\"type\":\"object\",\"required\":[\"name\",\"age\"],\"properties\":{\"name\":{\"type\":\"string\"},\"age\":{\"type\":\"number\"}}}",
    "useJsonSchema": true
  }
}
```

### Ignore array order

```json
{
  "name": "validate-json",
  "arguments": {
    "actual": "{\"tags\":[\"b\",\"a\",\"c\"]}",
    "template": "{\"tags\":[\"a\",\"b\",\"c\"]}",
    "ignoreArrayOrder": true
  }
}
```
→ Passes (same elements, different order).

## Agent tips

1. **Serialize consistently** — pass compact or pretty-printed JSON; both parse correctly. Ensure strings are valid JSON (quoted keys, no trailing commas).
2. **Use `strictMode`** when the response must not contain unexpected fields (contract testing).
3. **Read path prefixes** in difference lines to locate nested mismatches quickly (`user.address.city`).
4. **Duplicate keys** in the raw `actual` string always fail, even with `strictMode: false`.
5. Use **`ignoreProps`** for timestamps, IDs, or other volatile fields.
6. Use **`useJsonSchema: true`** when you have a schema contract instead of a literal expected object.
7. Use **`ignoreArrayOrder: true`** when array element order is not meaningful.
8. For API testing workflows: capture the response body as `actual`, define the contract as `template`, call `validate-json`, then report `isError` and difference lines to the user.
