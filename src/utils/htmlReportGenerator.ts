import fs from 'fs';
import path from 'path';
import * as Diff2Html from 'diff2html';
import { createTwoFilesPatch } from 'diff';

export type ValidationResult = {
  type: 'json' | 'xml' | 'csv' | 'text';
  passed: boolean;
  timestamp: string;
  traceId: string;
  spanId: string;
  requestId?: string;
  differences?: string[];
  duplicateKeys?: string[];
  expected?: string;
  actual?: string;
  method?: string;
  path?: string;
  delta?: any;
  isSchemaValidation?: boolean; // Flag to indicate schema-based validation
};

export function generateValidationHtml(result: ValidationResult): string {
  const statusClass = result.passed ? 'success' : 'failure';
  const statusIcon = result.passed ? '✅' : '❌';
  const statusText = result.passed ? 'PASSED' : 'FAILED';

  let differencesHtml = '';
  if (!result.passed && result.differences && result.differences.length > 0) {
    differencesHtml = `
      <div class="section">
        <h2>Differences Detected</h2>
        <div class="differences">
          ${result.differences.map(diff => {
            const type = diff.match(/\[(.*?)\]/)?.[1] || 'diff';
            const typeClass = type === 'mismatch' ? 'mismatch' : 
                             type === 'missing' ? 'missing' : 
                             type === 'extra' || type.includes('extra') ? 'extra' : 'other';
            return `<div class="diff-line ${typeClass}">${escapeHtml(diff)}</div>`;
          }).join('')}
        </div>
      </div>
    `;
  }

  let duplicateKeysHtml = '';
  if (!result.passed && result.duplicateKeys && result.duplicateKeys.length > 0) {
    duplicateKeysHtml = `
      <div class="section">
        <h2>Duplicate Keys</h2>
        <div class="duplicate-keys">
          ${result.duplicateKeys.map(key => `<div class="duplicate-key">${escapeHtml(key)}</div>`).join('')}
        </div>
      </div>
    `;
  }

  let comparisonHtml = '';
  if (!result.passed && result.expected && result.actual) {
    // Generate unified diff using diff library
    const unifiedDiff = createTwoFilesPatch(
      'expected',
      'actual',
      result.expected,
      result.actual,
      result.isSchemaValidation ? 'Expected (Schema Example)' : 'Expected',
      'Actual'
    );

    // Convert to HTML using diff2html
    const diff2htmlOutput = Diff2Html.html(unifiedDiff, {
      drawFileList: false,
      matching: 'lines',
      outputFormat: 'side-by-side',
      renderNothingWhenEmpty: false
    });

    const schemaNote = result.isSchemaValidation 
      ? '<p style="color: #6366f1; font-size: 0.95em; margin-bottom: 10px; padding: 10px; background: #eef2ff; border-left: 4px solid #6366f1; border-radius: 4px;">📋 The "Expected" column shows an example JSON generated from the schema for easier comparison.</p>'
      : '';

    comparisonHtml = `
      <div class="section">
        <h2>Expected vs Actual (Diff View)</h2>
        ${schemaNote}
        <div class="diff2html-wrapper">
          ${diff2htmlOutput}
        </div>
      </div>
    `;
  }

  let deltaHtml = '';
  if (!result.passed && result.delta) {
    try {
      deltaHtml = `
        <div class="section collapsible">
          <h2 onclick="toggleSection(this)">Raw Delta <span class="toggle">▼</span></h2>
          <div class="content">
            <pre class="code-block">${escapeHtml(JSON.stringify(result.delta, null, 2))}</pre>
          </div>
        </div>
      `;
    } catch {}
  }

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Validation Report - ${result.type.toUpperCase()}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/diff2html/bundles/css/diff2html.min.css" />
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 20px;
      min-height: 100vh;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      font-size: 2.5em;
      margin-bottom: 10px;
    }
    .status-badge {
      display: inline-block;
      padding: 10px 30px;
      border-radius: 25px;
      font-size: 1.2em;
      font-weight: bold;
      margin-top: 15px;
    }
    .status-badge.success {
      background: #10b981;
      color: white;
    }
    .status-badge.failure {
      background: #ef4444;
      color: white;
    }
    .meta-info {
      background: #f8fafc;
      padding: 20px 30px;
      border-bottom: 1px solid #e2e8f0;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
    }
    .meta-item {
      display: flex;
      flex-direction: column;
    }
    .meta-label {
      font-size: 0.85em;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 5px;
    }
    .meta-value {
      font-size: 0.7em;
      color: #1e293b;
      font-weight: 600;
    }
    .content-area {
      padding: 30px;
    }
    .section {
      margin-bottom: 30px;
    }
    .section h2 {
      color: #1e293b;
      font-size: 1.5em;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 2px solid #e2e8f0;
    }
    .collapsible h2 {
      cursor: pointer;
      user-select: none;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .collapsible h2:hover {
      color: #667eea;
    }
    .collapsible .content {
      max-height: 500px;
      overflow: hidden;
      transition: max-height 0.3s ease;
    }
    .collapsible.collapsed .content {
      max-height: 0;
    }
    .collapsible.collapsed .toggle {
      transform: rotate(-90deg);
    }
    .toggle {
      transition: transform 0.3s ease;
      font-size: 0.8em;
    }
    .differences {
      background: #f8fafc;
      border-radius: 8px;
      padding: 20px;
      font-family: 'Courier New', monospace;
      font-size: 0.9em;
    }
    .diff-line {
      padding: 8px 12px;
      margin: 4px 0;
      border-radius: 4px;
      border-left: 4px solid;
    }
    .diff-line.mismatch {
      background: #fef3c7;
      border-color: #f59e0b;
    }
    .diff-line.missing {
      background: #fee2e2;
      border-color: #ef4444;
    }
    .diff-line.extra {
      background: #dbeafe;
      border-color: #3b82f6;
    }
    .diff-line.other {
      background: #f3f4f6;
      border-color: #9ca3af;
    }
    .duplicate-keys {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .duplicate-key {
      background: #fee2e2;
      color: #991b1b;
      padding: 8px 16px;
      border-radius: 6px;
      font-family: 'Courier New', monospace;
      font-weight: 600;
    }
    .comparison {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    .comparison-column h3 {
      color: #475569;
      margin-bottom: 10px;
      font-size: 1.1em;
    }
    .code-block {
      background: #1e293b;
      color: #e2e8f0;
      padding: 20px;
      border-radius: 8px;
      overflow-x: auto;
      font-family: 'Courier New', monospace;
      font-size: 0.85em;
      line-height: 1.6;
      max-height: 600px;
      overflow-y: auto;
    }
    .diff2html-wrapper {
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .diff2html-wrapper .d2h-file-header {
      background: #667eea !important;
      color: white !important;
    }
    .diff2html-wrapper .d2h-code-side-linenumber {
      background: #f8fafc !important;
    }
    @media (max-width: 768px) {
      .comparison {
        grid-template-columns: 1fr;
      }
      .meta-info {
        grid-template-columns: 1fr;
      }
    }
  </style>
  <script>
    function toggleSection(element) {
      const section = element.parentElement;
      section.classList.toggle('collapsed');
    }
  </script>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${statusIcon} Validation Report</h1>
      <div class="status-badge ${statusClass}">${statusText}</div>
    </div>
    
    <div class="meta-info">
      <div class="meta-item">
        <div class="meta-label">Validation Type</div>
        <div class="meta-value">${result.type.toUpperCase()}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Timestamp</div>
        <div class="meta-value">${result.timestamp}</div>
      </div>
      ${result.requestId ? `
      <div class="meta-item">
        <div class="meta-label">Request ID</div>
        <div class="meta-value">${result.requestId}</div>
      </div>
      ` : ''}
      ${result.traceId ? `
      <div class="meta-item">
        <div class="meta-label">Trace ID</div>
        <div class="meta-value">${result.traceId}</div>
      </div>
      ` : ''}
      ${result.spanId ? `
      <div class="meta-item">
        <div class="meta-label">Span ID</div>
        <div class="meta-value">${result.spanId}</div>
      </div>
      ` : ''}
      ${result.method && result.path ? `
      <div class="meta-item">
        <div class="meta-label">Endpoint</div>
        <div class="meta-value">${result.method} ${result.path}</div>
      </div>
      ` : ''}
    </div>
    
    <div class="content-area">
      ${duplicateKeysHtml}
      ${differencesHtml}
      ${comparisonHtml}
      ${deltaHtml}
      
      ${result.passed ? `
      <div class="section">
        <h2>✅ Validation Successful</h2>
        <p style="color: #059669; font-size: 1.1em; padding: 20px; background: #d1fae5; border-radius: 8px;">
          No differences detected. The ${result.type.toUpperCase()} data matches the expected template.
        </p>
      </div>
      ` : ''}
    </div>
  </div>
</body>
</html>
  `;

  return html;
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDateForPath(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Format time as HH-MM-SS
 */
function formatTimeForPath(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${hh}-${mm}-${ss}`;
}

/**
 * Normalize route path for use in directory name
 */
function normalizeRoutePathForDir(routePath?: string): string {
  if (!routePath) return 'unknown';
  return routePath
    .replace(/^\/+|\/+$/g, '') // Remove leading/trailing slashes
    .replace(/\//g, '_')        // Replace slashes with underscores
    .replace(/[^a-zA-Z0-9_-]/g, '-'); // Replace special chars with dashes
}

/**
 * Save validation report to local "reports" folder
 * Uses date/route-based organization similar to S3 structure
 */
export function saveValidationReport(result: ValidationResult, filename?: string, routePath?: string): string {
  const now = new Date();
  const currentDate = formatDateForPath(now);
  const currentTime = formatTimeForPath(now);
  const normalizedRoute = normalizeRoutePathForDir(routePath || result.path);
  
  // Create organized directory structure: reports/ValidationResults/YYYY-MM-DD/route_path/HH-MM-SS/
  const reportsDir = path.join(__dirname, '..', '..', 'reports', 'ValidationResults', currentDate, normalizedRoute, currentTime);
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const reportFilename = filename || `validation-${result.type}-${result.spanId}-${result.traceId}.html`;
  const reportPath = path.join(reportsDir, reportFilename);
  
  const html = generateValidationHtml(result);
  fs.writeFileSync(reportPath, html, 'utf-8');
  
  return reportPath;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}
