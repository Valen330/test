import { Play } from 'lucide-react';
import { useState } from 'react';
import { getAccessToken } from '../lib/firebase';
import type { McpTraceHistoryItem } from '../types/workbench';

interface McpInspectorViewProps {
  spreadsheetId: string;
  sheetName: string;
  defaultDate: string;
  history: McpTraceHistoryItem[];
  onRecordTrace: (entry: McpTraceHistoryItem) => void;
}

export function McpInspectorView({
  spreadsheetId,
  sheetName,
  defaultDate,
  history,
  onRecordTrace,
}: McpInspectorViewProps) {
  const [method, setMethod] = useState<'tools/call' | 'tools/list'>('tools/call');
  const [fecha, setFecha] = useState(defaultDate);
  const [isRunning, setIsRunning] = useState(false);
  const [lastRequest, setLastRequest] = useState<Record<string, unknown> | null>(null);
  const [lastResponse, setLastResponse] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  const runRpcRequest = async () => {
    setError(null);
    const token = await getAccessToken();
    if (!token) {
      setError('Google OAuth session expired. Please sign in again.');
      return;
    }

    const rpcId = `inspect-${Date.now()}`;
    const displayPayload: Record<string, unknown> =
      method === 'tools/list'
        ? {
            jsonrpc: '2.0',
            id: rpcId,
            method: 'tools/list',
            params: {},
          }
        : {
            jsonrpc: '2.0',
            id: rpcId,
            method: 'tools/call',
            params: {
              name: 'obtener_seguimientos_pendientes',
              arguments: {
                fecha,
                spreadsheetId,
                sheetName,
              },
            },
          };

    const requestPayload: Record<string, unknown> =
      method === 'tools/list'
        ? displayPayload
        : {
            ...displayPayload,
            params: {
              ...(displayPayload.params as Record<string, unknown>),
              _meta: {
                googleAccessToken: token,
                spreadsheetId,
                sheetName,
              },
            },
          };

    setLastRequest(displayPayload);
    setIsRunning(true);
    const started = performance.now();

    try {
      const res = await fetch('/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'x-google-access-token': token,
          'x-spreadsheet-id': spreadsheetId,
          'x-sheet-name': sheetName,
        },
        body: JSON.stringify(requestPayload),
      });

      const contentType = res.headers.get('content-type') || '(missing)';
      const text = await res.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        setError(
          `Expected JSON from /mcp but received ${contentType} (HTTP ${res.status}, URL: ${res.url}, redirected: ${res.redirected ? 'Yes' : 'No'}).`
        );
        parsed = { raw: text.slice(0, 400) };
      }

      setLastResponse(parsed);
      const durationMs = Math.round(performance.now() - started);

      onRecordTrace({
        id: `trace-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        source: 'inspector',
        method,
        requestPayload: displayPayload,
        responsePayload: parsed,
        durationMs,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reach /mcp endpoint.');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Live MCP Endpoint Inspector
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Send real JSON-RPC 2.0 requests directly to <span className="font-mono">/mcp</span>{' '}
              running <span className="font-mono">@modelcontextprotocol/sdk</span>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
              <button
                type="button"
                onClick={() => setMethod('tools/call')}
                className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
                  method === 'tools/call'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                tools/call
              </button>
              <button
                type="button"
                onClick={() => setMethod('tools/list')}
                className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
                  method === 'tools/list'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                tools/list
              </button>
            </div>

            {method === 'tools/call' && (
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                aria-label="Target date for MCP tool call"
                className="px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md text-slate-900"
              />
            )}

            <button
              type="button"
              onClick={runRpcRequest}
              disabled={isRunning || (method === 'tools/call' && !spreadsheetId)}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5" />
              {isRunning ? 'Executing...' : 'Send JSON-RPC'}
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="border border-slate-200 rounded-md overflow-hidden">
            <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
              JSON-RPC Request Payload
            </div>
            <pre className="p-3.5 text-xs font-mono text-slate-800 bg-white overflow-x-auto min-h-[220px]">
              {lastRequest
                ? JSON.stringify(lastRequest, null, 2)
                : '// Click "Send JSON-RPC" to dispatch a request to POST /mcp'}
            </pre>
          </div>

          <div className="border border-slate-200 rounded-md overflow-hidden">
            <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
              MCP Server Response
            </div>
            <pre className="p-3.5 text-xs font-mono text-slate-800 bg-white overflow-x-auto min-h-[220px]">
              {lastResponse
                ? JSON.stringify(lastResponse, null, 2)
                : '// Response payload will appear here'}
            </pre>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Session MCP Trace Log</h3>
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            {history.length} calls
          </span>
        </div>
        {history.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No MCP tool calls recorded yet in this session.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {history.map((item) => (
              <div key={item.id} className="px-5 py-3 flex items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-slate-400 tabular-nums shrink-0">
                    {item.timestamp}
                  </span>
                  <span className="font-medium text-slate-700 shrink-0">{item.source}</span>
                  <span className="font-mono text-slate-900 truncate">{item.method}</span>
                </div>
                <span className="font-mono text-slate-500 tabular-nums shrink-0">
                  {item.durationMs}ms
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
