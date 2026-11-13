import { Check, Copy, Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  generateClaudeConfigSnippet,
  generateStandaloneMcpScript,
} from '../lib/localScriptTemplate';

interface LocalScriptViewProps {
  spreadsheetId: string;
  sheetName: string;
}

export function LocalScriptView({ spreadsheetId, sheetName }: LocalScriptViewProps) {
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedConfig, setCopiedConfig] = useState(false);

  const scriptText = useMemo(
    () => generateStandaloneMcpScript({ spreadsheetId, sheetName }),
    [spreadsheetId, sheetName]
  );

  const configText = useMemo(
    () => generateClaudeConfigSnippet({ spreadsheetId, sheetName }),
    [spreadsheetId, sheetName]
  );

  const copyText = async (text: string, which: 'script' | 'config') => {
    await navigator.clipboard.writeText(text);
    if (which === 'script') {
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 1800);
    } else {
      setCopiedConfig(true);
      setTimeout(() => setCopiedConfig(false), 1800);
    }
  };

  const downloadScript = () => {
    const blob = new Blob([scriptText], { type: 'text/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mcp-sheets-server.mjs';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900">
              Standalone Node.js MCP Server (stdio)
            </h2>
            <p className="text-xs text-slate-500">
              Pre-configured with your active Spreadsheet ID (
              <span className="font-mono text-slate-700">
                {spreadsheetId || 'not connected yet'}
              </span>
              ) and tab (<span className="font-mono text-slate-700">{sheetName || 'Contactos'}</span>
              ) for Claude Code or Claude Desktop.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => copyText(scriptText, 'script')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              {copiedScript ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              {copiedScript ? 'Copied' : 'Copy Script'}
            </button>
            <button
              type="button"
              onClick={downloadScript}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Download .mjs
            </button>
          </div>
        </div>

        <pre className="p-4 rounded-md bg-slate-50 border border-slate-200 text-xs font-mono text-slate-800 overflow-x-auto max-h-[420px]">
          {scriptText}
        </pre>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Claude Desktop / Claude Code MCP Configuration
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Install dependencies with{' '}
              <span className="font-mono text-slate-700">
                npm install @modelcontextprotocol/sdk zod
              </span>{' '}
              and add this entry to <span className="font-mono text-slate-700">mcpServers</span>.
            </p>
          </div>

          <button
            type="button"
            onClick={() => copyText(configText, 'config')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            {copiedConfig ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            {copiedConfig ? 'Copied' : 'Copy JSON'}
          </button>
        </div>

        <pre className="p-4 rounded-md bg-slate-50 border border-slate-200 text-xs font-mono text-slate-800 overflow-x-auto">
          {configText}
        </pre>
      </div>
    </div>
  );
}
