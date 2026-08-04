{{- define "sdcmcp.name" -}}
{{- .Values.simpleDataComparatorMcp.serviceName -}}
{{- end -}}

{{- define "sdcmcp.labels" -}}
app: {{ include "sdcmcp.name" . }}
name: {{ include "sdcmcp.name" . }}
servicetype: {{ .Values.SERVICE_TYPE }}
{{- end -}}

{{- define "sdcmcp.selectorLabels" -}}
name: {{ include "sdcmcp.name" . }}
app: {{ include "sdcmcp.name" . }}
{{- end -}}

{{- define "sdcmcp.podSecurityContext" -}}
runAsNonRoot: true
seccompProfile:
  type: RuntimeDefault
{{- with .Values.simpleDataComparatorMcp.podSecurityContext }}
{{ toYaml . }}
{{- end -}}
{{- end -}}

{{- define "sdcmcp.containerSecurityContext" -}}
allowPrivilegeEscalation: false
capabilities:
  drop: ["ALL"]
{{- with .Values.simpleDataComparatorMcp.containerSecurityContext }}
{{ toYaml . }}
{{- end -}}
{{- end -}}

{{- define "sdcmcp.ingressHost" -}}
{{- if .Values.MCP_INGRESS_HOST -}}
{{- .Values.MCP_INGRESS_HOST -}}
{{- else -}}
{{- printf "%s-%s.%s" .Values.SERVICE_NAME (coalesce .Values.NAMESPACE .Release.Namespace) .Values.CLOUD_PUBLIC_HOST -}}
{{- end -}}
{{- end -}}
