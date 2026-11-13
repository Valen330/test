import { AlertCircle, ChevronDown, ChevronRight, Send, Terminal } from 'lucide-react';
import { useState } from 'react';
import type { ChatMessage } from '../types/workbench';

interface ChatConsolePaneProps {
  referenceDate: string;
  onChangeReferenceDate: (date: string) => void;
  messages: ChatMessage[];
  isSending: boolean;
  hasSheet: boolean;
  onSendMessage: (message: string) => void;
  onClearChat: () => void;
}

const PRESET_PROMPTS = [
  '¿A quién le tengo que escribir hoy?',
  '¿Quién está vencido y quién toca hoy?',
];

export function ChatConsolePane({
  referenceDate,
  onChangeReferenceDate,
  messages,
  isSending,
  hasSheet,
  onSendMessage,
  onClearChat,
}: ChatConsolePaneProps) {
  const [input, setInput] = useState('');
  const [expandedTraceIds, setExpandedTraceIds] = useState<Record<string, boolean>>({});

  const toggleTrace = (id: string) => {
    setExpandedTraceIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isSending || !hasSheet) return;
    setInput('');
    onSendMessage(trimmed);
  };

  return (
    <section className="bg-white border border-slate-200 rounded-lg flex flex-col min-h-[540px]">
      <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">MCP Assistant Test Console</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Calls <span className="font-mono text-slate-700">obtener_seguimientos_pendientes</span>{' '}
            via <span className="font-mono text-slate-700">POST /mcp</span>
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <label htmlFor="ref-date-input" className="text-xs font-medium text-slate-600">
            Reference Date
          </label>
          <input
            id="ref-date-input"
            type="date"
            value={referenceDate}
            onChange={(e) => onChangeReferenceDate(e.target.value)}
            className="px-2.5 py-1 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
          />
        </div>
      </div>

      <div className="px-5 py-2.5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {PRESET_PROMPTS.map((promptText) => (
            <button
              key={promptText}
              type="button"
              disabled={!hasSheet || isSending}
              onClick={() => onSendMessage(promptText)}
              className="px-3 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 hover:border-slate-400 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {promptText}
            </button>
          ))}
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={onClearChat}
            className="text-xs text-slate-500 hover:text-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            Clear
          </button>
        )}
      </div>

      <div className="flex-1 p-5 space-y-4 overflow-y-auto max-h-[440px]">
        {messages.length === 0 ? (
          <div className="py-12 px-4 text-center space-y-2">
            <p className="text-sm font-medium text-slate-700">
              Ready to test the Friday morning check
            </p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              Click <span className="font-medium text-slate-700">“¿A quién le tengo que escribir hoy?”</span>{' '}
              with reference date <span className="font-mono text-slate-700">{referenceDate}</span>.
              Expected first run: Ana (overdue) and Bruno (due today). Then mark Bruno as{' '}
              <span className="font-mono text-slate-700">hecho</span> and ask again to verify only
              Ana returns.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="space-y-2">
              <div
                className={`p-3.5 rounded-md border text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-slate-50 border-slate-200 text-slate-900'
                    : msg.error
                    ? 'bg-red-50 border-red-200 text-red-700'
                    : 'bg-white border-slate-200 text-slate-800'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-1.5">
                  <span className="font-medium text-slate-700">
                    {msg.role === 'user' ? 'You' : 'Assistant'}
                  </span>
                  <span className="font-mono tabular-nums">{msg.timestamp}</span>
                </div>

                {msg.error ? (
                  <div className="flex items-start gap-2 text-xs">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{msg.error}</span>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                )}
              </div>

              {msg.toolTrace && (
                <div className="border border-slate-200 rounded-md bg-slate-50/80 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleTrace(msg.id)}
                    className="w-full px-3.5 py-2 flex items-center justify-between gap-2 text-xs text-slate-700 hover:bg-slate-100/70 transition-colors"
                  >
                    <span className="inline-flex items-center gap-2 font-mono truncate">
                      <Terminal className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>
                        {msg.toolTrace.toolName}({JSON.stringify(msg.toolTrace.arguments)})
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-2 text-slate-500 shrink-0 font-mono tabular-nums">
                      <span>
                        {msg.toolTrace.queryResult
                          ? `${msg.toolTrace.queryResult.total_pendientes} contacts`
                          : 'result'}
                      </span>
                      <span>·</span>
                      <span>{msg.toolTrace.durationMs}ms</span>
                      {expandedTraceIds[msg.id] ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </span>
                  </button>

                  {expandedTraceIds[msg.id] && (
                    <div className="px-3.5 py-3 border-t border-slate-200 bg-white space-y-2.5 text-xs">
                      <div>
                        <p className="text-slate-500 font-medium mb-1">
                          Parsed Tool Result ({msg.toolTrace.queryResult?.contactos.length ?? 0})
                        </p>
                        <pre className="p-2.5 rounded bg-slate-50 border border-slate-200 font-mono text-[11px] text-slate-800 overflow-x-auto">
                          {JSON.stringify(
                            msg.toolTrace.queryResult ?? msg.toolTrace.mcpResponsePayload,
                            null,
                            2
                          )}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}

        {isSending && (
          <div className="p-3.5 rounded-md border border-slate-200 bg-white text-xs text-slate-500">
            Running model tool call against live Google Sheet...
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t border-slate-200 bg-slate-50/50">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!hasSheet || isSending}
            placeholder={
              hasSheet
                ? 'Ask a follow-up question (e.g. ¿A quién le tengo que escribir hoy?)'
                : 'Connect or create a Google Sheet first...'
            }
            className="flex-1 px-3 py-2 text-sm bg-white border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 disabled:bg-slate-100"
          />
          <button
            type="submit"
            disabled={!hasSheet || isSending || !input.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            Send
          </button>
        </div>
      </form>
    </section>
  );
}
