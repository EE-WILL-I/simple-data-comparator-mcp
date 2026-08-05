# XML Validator (`validate-xml`)

Compare an XML **actual** string against an **expected template** XML string. Uses structural diff with `diff-js-xml` when available, with a JSON-tree fallback.

**MCP tool name:** `validate-xml`

## When to use

- Verify SOAP/REST XML responses
- Compare generated XML config against a reference document
- Check element values, attributes, and structure

## Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `actual` | string | yes | XML string to validate |
| `template` | string | yes | Expected XML template string |

No optional parameters are exposed via MCP.

## Response

**Pass:**
```
Validation passed.
```

**Fail:**
```
Validation failed.
Differences:
[value_mismatch] root.value: expected "99", got "42"
```

**Parse error:**
```
Validation failed.
Differences:
[parse_error] ...
```

## Difference line types

| Tag | Meaning |
|---|---|
| `[value_mismatch]` | Text content or attribute value differs |
| `[missing_element]` | Element expected but not found in actual |
| `[extra_element]` | Unexpected element in actual |
| `[type_mismatch]` | Different node types (object vs array, etc.) |
| `[array_length]` | Repeated elements differ in count |
| `[missing_item]` / `[extra_item]` | Array item missing or extra |
| `[parse_error]` | XML could not be parsed |
| `[diff]` / library-specific types | From `diff-js-xml` when that path is used |

Paths use dot notation for nested elements, e.g. `catalog.book[0].title`.

## Examples for agents

### Identical XML — pass

```json
{
  "name": "validate-xml",
  "arguments": {
    "actual": "<root><value>42</value></root>",
    "template": "<root><value>42</value></root>"
  }
}
```

### Element value mismatch — fail

```json
{
  "name": "validate-xml",
  "arguments": {
    "actual": "<root><value>42</value></root>",
    "template": "<root><value>99</value></root>"
  }
}
```

### Missing child element — fail

```json
{
  "name": "validate-xml",
  "arguments": {
    "actual": "<root></root>",
    "template": "<root><child>x</child></root>"
  }
}
```

### Attribute mismatch — fail

```json
{
  "name": "validate-xml",
  "arguments": {
    "actual": "<item id=\"1\">text</item>",
    "template": "<item id=\"2\">text</item>"
  }
}
```

### Complex document — pass

```json
{
  "name": "validate-xml",
  "arguments": {
    "actual": "<catalog><book id=\"1\"><title>TypeScript Deep Dive</title></book></catalog>",
    "template": "<catalog><book id=\"1\"><title>TypeScript Deep Dive</title></book></catalog>"
  }
}
```

### Multi-line XML (pass as a single string)

```json
{
  "name": "validate-xml",
  "arguments": {
    "actual": "<order>\n  <id>1001</id>\n  <status>shipped</status>\n</order>",
    "template": "<order>\n  <id>1001</id>\n  <status>shipped</status>\n</order>"
  }
}
```

## Agent tips

1. **Whitespace** between tags may affect comparison depending on how the parser normalizes text nodes — prefer consistent formatting in both sides when comparing text-heavy XML.
2. **Attributes** are included in comparison (`ignoreAttributes: false` internally).
3. **DOCTYPE and XML declarations** are ignored during parsing.
4. When a diff line includes a path, use it to pinpoint the failing element in the original XML.
5. For SOAP envelopes: put the full envelope in both `actual` and `template`, or extract the body fragment you care about and compare that fragment only.
