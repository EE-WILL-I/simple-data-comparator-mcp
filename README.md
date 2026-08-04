# Simple Comparator MCP Server

Simple toolset for performing comparison of JSON, XML, XLSX, CSV and text inputs in Actual-Expected format.

## Running locally

Build and start the HTTP MCP server:

```bash
npm run build
npm start
```

The server listens on `http://0.0.0.0:3000/mcp` by default. Health check: `GET /health`.

## Kubernetes

See [deployments/README.md](deployments/README.md) for Docker image build and Helm chart installation.

## Cursor configuration

Add this to your Cursor MCP settings (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "simple-data-comparator-mcp": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "env": {
        "LOG_FORMAT": "text",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

For a cluster deployment, use the ingress URL instead of `localhost`.