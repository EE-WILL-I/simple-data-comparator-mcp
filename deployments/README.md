# Kubernetes deployment

Deploy the Simple Data Comparator MCP HTTP server to Kubernetes.

## Prerequisites

- Docker
- kubectl configured for your cluster
- Helm 3

## Build the image

From the repository root:

```bash
docker build -t simple-data-comparator-mcp:local .
```

Push to your registry and set `DOCKER_TAG` to the full image reference when installing the chart.

## Install with Helm

```bash
helm upgrade --install sdcmcp ./deployments/charts/sdcmcp \
  --namespace sdcmcp --create-namespace \
  --set DOCKER_TAG=your-registry/simple-data-comparator-mcp:0.0.1 \
  --set CLOUD_PUBLIC_HOST=example.com \
  -f ./deployments/charts/sdcmcp/resource-profiles/dev.yaml
```

### Important values

| Value | Description |
|-------|-------------|
| `DOCKER_TAG` | **Required.** Container image reference |
| `REPLICAS` | Keep at `1` unless you configure session affinity (MCP sessions are in-memory) |
| `MCP_INGRESS_HOST` | Ingress hostname; auto-generated from `SERVICE_NAME`, namespace, and `CLOUD_PUBLIC_HOST` when empty |
| `SERVICE_PORT_TYPE` | `ClusterIP` (default) or `NodePort` |
| `simpleDataComparatorMcp.mcpPort` | HTTP port (default `3000`) |
| `simpleDataComparatorMcp.logLevel` | `debug`, `info`, `warn`, `error` |

## Endpoints

| Path | Purpose |
|------|---------|
| `/mcp` | MCP Streamable HTTP transport (POST initialize, GET SSE, DELETE session) |
| `/health` | Liveness/readiness probe |

## Cursor MCP client configuration

Point the HTTP MCP client at the ingress URL:

```json
{
  "mcpServers": {
    "simple-data-comparator-mcp": {
      "type": "http",
      "url": "https://simple-data-comparator-mcp-sdcmcp.example.com/mcp"
    }
  }
}
```

## Notes

- Ingress annotations include long timeouts for MCP SSE connections.
- The Service uses `sessionAffinity: ClientIP` so clients stay on the same pod when scaling beyond one replica.
- Probes use `GET /health`.
