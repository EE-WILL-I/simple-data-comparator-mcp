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
| `template` | string | yes | — | Expected JSON template string |
| `strictMode` | boolean | no | `false` | When `true`, fail if `actual` has fields not present in `template` |
| `ignoreArrayOrder` | boolean | no | `false` | Declared in the MCP schema; **not yet implemented** in the validator — array order is always compared |

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

## Agent tips

1. **Serialize consistently** — pass compact or pretty-printed JSON; both parse correctly. Ensure strings are valid JSON (quoted keys, no trailing commas).
2. **Use `strictMode`** when the response must not contain unexpected fields (contract testing).
3. **Read path prefixes** in difference lines to locate nested mismatches quickly (`user.address.city`).
4. **Duplicate keys** in the raw `actual` string always fail, even with `strictMode: false`.
5. For API testing workflows: capture the response body as `actual`, define the contract as `template`, call `validate-json`, then report `isError` and difference lines to the user.

## Advanced features (not exposed via MCP)

The underlying `validateJsonTemplate` function also supports `ignoreProps`, `ignoreSimilar`, and `useJsonSchema` (JSON Schema via Ajv). These are not available as MCP tool parameters today.
