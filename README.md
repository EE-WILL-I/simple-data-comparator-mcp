# Simple Comparator MCP

Simple toolset for performing comparison of JSON, XML, XLSX, CSV and text inputs in Actual-Expected format.

## Running

Build and start the stdio MCP server:

```bash
npm run build
npm start
```

The server communicates over stdin/stdout. Logs are written to stderr so they do not interfere with MCP protocol messages.

## Cursor configuration

Add this to your Cursor MCP settings (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "simple-data-comparator-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "@ee_will_i/simple-data-comparator-mcp"
      ]
    }
  }
}
```

Replace the path with your local project path. Run `npm run build` before starting the server.
