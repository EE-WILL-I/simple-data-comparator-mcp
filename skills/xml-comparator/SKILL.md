---
name: xml-comparator
description: Compares XML actual vs expected template via the validate-xml MCP tool. Use when validating SOAP/REST XML responses, XML configs, element structure, or when the user asks to compare or validate XML documents.
---

# XML Comparator

Compare **actual** XML against an **expected template** using the `validate-xml` MCP tool (`simple-data-comparator-mcp` server).

## Workflow

1. **Discover the tool** — call `GetMcpTools` for the comparator MCP server, then invoke `validate-xml`.
2. **Prepare strings** — pass full XML documents as plain strings in `actual` and `template`.
3. **Call the tool** — no optional parameters.
4. **Check `isError`**:
   - `false` → validation passed
   - `true` → parse difference lines and map paths back to elements/attributes
5. **Report** element paths, attribute names, and expected vs actual values clearly.

## Parameters

| Parameter | Required | Purpose |
|---|---|---|
| `actual` | yes | XML string to validate |
| `template` | yes | Expected XML template string |

## Interpreting results

**Pass:** `Validation passed.`

**Fail:**
```
Validation failed.
Differences:
[value_mismatch] catalog.book[0].title: expected "A", got "B"
[missing_element] root.child: expected element is missing
[extra_element] root.unexpected: unexpected extra element
[type_mismatch] root: expected array, got object
[array_length] items: expected 2 items, got 3
[parse_error] ...
```

Paths use dot notation; repeated elements use `[index]`. Attributes are included in comparison.

## Example call

```json
{
  "actual": "<root><value>42</value></root>",
  "template": "<root><value>42</value></root>"
}
```

## Rules

- Pass the **full XML fragment** you want compared (envelope, body, or subtree — be consistent on both sides).
- Whitespace inside text nodes may affect comparison — normalize formatting when comparing text-heavy XML.
- Use `validate-xml` for XML — not `validate-text` or `validate-json`.
- DOCTYPE and XML declarations are ignored during parsing.
- On `[parse_error]`, fix malformed XML before retrying.

## Full reference

See [references/xml-validator.md](references/xml-validator.md) for extended examples.
