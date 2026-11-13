import type { User } from 'firebase/auth';
import { ExternalLink, FileSpreadsheet, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { AuthGate } from './components/AuthGate';
import { ChatConsolePane } from './components/ChatConsolePane';
import { ConfirmMutationModal } from './components/ConfirmMutationModal';
import { HttpDiagnosticsBox } from './components/HttpDiagnosticsBox';
import { LocalScriptView } from './components/LocalScriptView';
import { McpInspectorView } from './components/McpInspectorView';
import { SheetGridPane } from './components/SheetGridPane';
import { getAccessToken, googleSignIn, initAuth, logout } from './lib/firebase';
import {
  DetailedHttpError,
  fetchJsonWithDiagnostics,
  type HttpDiagnostics,
} from './lib/http';
import {
  createPracticeSpreadsheetClient,
  getSpreadsheetMetadataClient,
  readSheetRowsClient,
  resetTestRowsClient,
  updateRowStatusClient,
} from './lib/sheetsClient';
import type {
  ChatMessage,
  ContactRow,
  McpToolTrace,
  McpTraceHistoryItem,
  PendingMutation,
  SpreadsheetMetadata,
} from './types/workbench';

type ActiveTab = 'workbench' | 'inspector' | 'script';

export default function App() {
  const [needsAuth, setNeedsAuth] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>('workbench');
  const [referenceDate, setReferenceDate] = useState('2026-11-13');

  const [sheetInput, setSheetInput] = useState('');
  const [metadata, setMetadata] = useState<SpreadsheetMetadata | null>(null);
  const [selectedTabName, setSelectedTabName] = useState('');
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [estadoColumnLetter, setEstadoColumnLetter] = useState('C');
  const [isSheetLoading, setIsSheetLoading] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [sheetDiagnostics, setSheetDiagnostics] = useState<HttpDiagnostics | null>(null);

  const [pendingMutation, setPendingMutation] = useState<PendingMutation | null>(null);
  const [isMutating, setIsMutating] = useState(false);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatSending, setIsChatSending] = useState(false);
  const [traceHistory, setTraceHistory] = useState<McpTraceHistoryItem[]>([]);

  useEffect(() => {
    const unsubscribe = initAuth(
      (authedUser) => {
        setUser(authedUser);
        setNeedsAuth(false);
      },
      () => {
        setUser(null);
        setNeedsAuth(true);
      }
    );
    return unsubscribe;
  }, []);

  const requireToken = useCallback(async (): Promise<string | null> => {
    const token = await getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return null;
    }
    return token;
  }, []);

  const captureSheetError = (err: unknown, fallback: string) => {
    if (err instanceof DetailedHttpError) {
      setSheetError(err.message);
      setSheetDiagnostics(err.diagnostics);
    } else {
      setSheetError(err instanceof Error ? err.message : fallback);
      setSheetDiagnostics(null);
    }
  };

  const handleSignIn = async () => {
    setAuthError(null);
    setIsSigningIn(true);
    try {
      const result = await googleSignIn();
      setUser(result.user);
      setNeedsAuth(false);
      setSheetError(null);
      setSheetDiagnostics(null);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
    setUser(null);
    setNeedsAuth(true);
    setMetadata(null);
    setRows([]);
    setSelectedTabName('');
    setChatMessages([]);
    setSheetError(null);
    setSheetDiagnostics(null);
  };

  const loadRows = useCallback(
    async (spreadsheetId: string, tabName: string) => {
      const token = await requireToken();
      if (!token) return;

      setIsSheetLoading(true);
      setSheetError(null);
      setSheetDiagnostics(null);
      try {
        const data = await readSheetRowsClient(token, spreadsheetId, tabName);
        setRows(data.rows || []);
        setEstadoColumnLetter(data.estadoColumnLetter || 'C');
      } catch (err) {
        captureSheetError(err, 'Failed to load spreadsheet rows.');
      } finally {
        setIsSheetLoading(false);
      }
    },
    [requireToken]
  );

  const handleCreateTestSheet = async () => {
    const token = await requireToken();
    if (!token) return;

    setIsSheetLoading(true);
    setSheetError(null);
    setSheetDiagnostics(null);
    try {
      const data = await createPracticeSpreadsheetClient(
        token,
        'Seguimientos Eightx - Practice'
      );
      setMetadata(data.metadata);
      setSelectedTabName(data.sheetName);
      setSheetInput(data.metadata.spreadsheetId);
      setRows(data.rows || []);
      setEstadoColumnLetter(data.estadoColumnLetter || 'C');
    } catch (err) {
      captureSheetError(err, 'Failed to create test sheet.');
    } finally {
      setIsSheetLoading(false);
    }
  };

  const handleLoadExistingSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = sheetInput.trim();
    if (!trimmed) return;

    const token = await requireToken();
    if (!token) return;

    setIsSheetLoading(true);
    setSheetError(null);
    setSheetDiagnostics(null);
    try {
      const meta = await getSpreadsheetMetadataClient(token, trimmed);
      const firstTab = meta.tabs[0]?.title || '';
      setMetadata(meta);
      setSelectedTabName(firstTab);
      if (firstTab) {
        await loadRows(meta.spreadsheetId, firstTab);
      } else {
        setIsSheetLoading(false);
      }
    } catch (err) {
      captureSheetError(err, 'Could not open spreadsheet.');
      setIsSheetLoading(false);
    }
  };

  const handleSelectTab = async (tabTitle: string) => {
    setSelectedTabName(tabTitle);
    if (metadata) {
      await loadRows(metadata.spreadsheetId, tabTitle);
    }
  };

  const handleRequestToggleStatus = (row: ContactRow) => {
    if (!metadata || !selectedTabName) return;
    const isDone = row.estado.trim().toLowerCase() === 'hecho';
    const nextStatus = isDone ? 'pendiente' : 'hecho';

    setPendingMutation({
      type: 'row-status',
      title: `Update ${row.nombre}'s follow-up status?`,
      description: `This will update ${row.nombre}'s status cell directly in your Google Sheet.`,
      spreadsheetId: metadata.spreadsheetId,
      sheetName: selectedTabName,
      targetRange: `${selectedTabName}!${estadoColumnLetter}${row.rowIndex}`,
      currentValue: row.estado,
      newValue: nextStatus,
      rowIndex: row.rowIndex,
      estadoColumnLetter,
    });
  };

  const handleRequestResetRows = () => {
    if (!metadata || !selectedTabName) return;
    setPendingMutation({
      type: 'reset-test',
      title: 'Reset contact tab to 3 practice rows?',
      description:
        'This will clear columns A:C (rows 1–50) in the selected tab and write Ana (2026-11-12, pendiente), Bruno (2026-11-13, pendiente), and Carla (2026-11-13, hecho).',
      spreadsheetId: metadata.spreadsheetId,
      sheetName: selectedTabName,
      targetRange: `${selectedTabName}!A1:C4`,
      currentValue: `${rows.length} existing row(s)`,
      newValue: 'Ana, Bruno, Carla seed rows',
    });
  };

  const handleConfirmMutation = async () => {
    if (!pendingMutation) return;
    const token = await requireToken();
    if (!token) {
      setPendingMutation(null);
      return;
    }

    setIsMutating(true);
    setSheetError(null);
    setSheetDiagnostics(null);
    try {
      if (pendingMutation.type === 'row-status' && pendingMutation.rowIndex) {
        await updateRowStatusClient(
          token,
          pendingMutation.spreadsheetId,
          pendingMutation.sheetName,
          pendingMutation.rowIndex,
          pendingMutation.estadoColumnLetter || estadoColumnLetter,
          pendingMutation.newValue
        );
        await loadRows(pendingMutation.spreadsheetId, pendingMutation.sheetName);
      } else if (pendingMutation.type === 'reset-test') {
        const data = await resetTestRowsClient(
          token,
          pendingMutation.spreadsheetId,
          pendingMutation.sheetName
        );
        setRows(data.rows || []);
        setEstadoColumnLetter(data.estadoColumnLetter || 'C');
      }
      setPendingMutation(null);
    } catch (err) {
      captureSheetError(err, 'Failed to apply sheet mutation.');
      setPendingMutation(null);
    } finally {
      setIsMutating(false);
    }
  };

  const handleSendChatMessage = async (text: string) => {
    if (!metadata || !selectedTabName) return;
    const token = await requireToken();
    if (!token) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text,
      timestamp: new Date().toLocaleTimeString(),
    };

    const historyPayload = chatMessages
      .filter((m) => !m.error)
      .map((m) => ({ role: m.role, text: m.text }));

    setChatMessages((prev) => [...prev, userMsg]);
    setIsChatSending(true);

    try {
      const data = await fetchJsonWithDiagnostics<{
        reply: string;
        toolTrace?: McpToolTrace | null;
      }>('/api/chat', {
        method: 'POST',
        headers: {
          'x-google-access-token': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accessToken: token,
          spreadsheetId: metadata.spreadsheetId,
          sheetName: selectedTabName,
          referenceDate,
          message: text,
          history: historyPayload,
        }),
      });

      const trace = data.toolTrace || null;
      if (trace) {
        setTraceHistory((prev) => [
          {
            id: `chat-trace-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            source: 'chat',
            method: `tools/call (${trace.toolName})`,
            requestPayload: trace.mcpRequestPayload,
            responsePayload: trace.mcpResponsePayload,
            durationMs: trace.durationMs,
          },
          ...prev,
        ]);
      }

      setChatMessages((prev) => [
        ...prev,
        {
          id: `model-${Date.now()}`,
          role: 'model',
          text: data.reply,
          timestamp: new Date().toLocaleTimeString(),
          toolTrace: trace,
        },
      ]);
    } catch (err) {
      const msg =
        err instanceof DetailedHttpError
          ? `${err.message} [${err.diagnostics.source} · HTTP ${err.diagnostics.status} · ${err.diagnostics.contentType}]`
          : err instanceof Error
          ? err.message
          : 'Unexpected error calling MCP chat.';
      setChatMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'model',
          text: '',
          error: msg,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } finally {
      setIsChatSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Three-zone Top Bar Contract */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#workbench"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('workbench');
            }}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            Follow-Up MCP
          </a>

          <nav className="flex items-center gap-6 text-sm font-medium">
            <button
              type="button"
              onClick={() => setActiveTab('workbench')}
              className={`py-5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'workbench'
                  ? 'border-blue-600 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              Workbench
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('inspector')}
              className={`py-5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'inspector'
                  ? 'border-blue-600 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              MCP Inspector
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('script')}
              className={`py-5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'script'
                  ? 'border-blue-600 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              Local Script
            </button>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            {needsAuth ? (
              <button
                type="button"
                onClick={handleSignIn}
                disabled={isSigningIn}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
              >
                {isSigningIn ? 'Signing in...' : 'Connect Google'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSignOut}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                Sign out{user?.email ? ` (${user.email.split('@')[0]})` : ''}
              </button>
            )}
          </div>
        </div>
      </header>

      {needsAuth ? (
        <AuthGate onSignIn={handleSignIn} isSigningIn={isSigningIn} error={authError} />
      ) : (
        <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-6 space-y-6">
          {/* Spreadsheet Connection Toolbar */}
          <section className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
              <button
                type="button"
                onClick={handleCreateTestSheet}
                disabled={isSheetLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                {isSheetLoading && !metadata ? 'Creating Sheet...' : 'Create Practice Sheet'}
              </button>

              <form
                onSubmit={handleLoadExistingSheet}
                className="flex items-center gap-2 flex-1 min-w-[260px] max-w-xl"
              >
                <input
                  type="text"
                  value={sheetInput}
                  onChange={(e) => setSheetInput(e.target.value)}
                  placeholder="Or paste existing Google Sheet URL or ID..."
                  aria-label="Google Sheet URL or ID"
                  className="flex-1 px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-md text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
                <button
                  type="submit"
                  disabled={isSheetLoading || !sheetInput.trim()}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  Load Sheet
                </button>
              </form>
            </div>

            {metadata && (
              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  <label htmlFor="sheet-tab-select" className="text-xs text-slate-500">
                    Tab
                  </label>
                  <select
                    id="sheet-tab-select"
                    value={selectedTabName}
                    onChange={(e) => handleSelectTab(e.target.value)}
                    className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  >
                    {metadata.tabs.map((t) => (
                      <option key={t.sheetId} value={t.title}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </div>

                <a
                  href={metadata.spreadsheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-300 rounded-md hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
                >
                  Open Sheet
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </section>

          {activeTab === 'workbench' && (
            <>
              {!metadata ? (
                <section className="bg-white border border-slate-200 rounded-lg p-10 text-center space-y-5">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto text-slate-600">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div className="space-y-1.5 max-w-md mx-auto">
                    <h1 className="text-lg font-semibold text-slate-900">
                      Create or connect a Google Sheet to begin
                    </h1>
                    <p className="text-sm text-slate-500 leading-relaxed">
                      Click <span className="font-medium text-slate-800">Create Practice Sheet</span>{' '}
                      above to generate a Google Sheet pre-seeded with Ana (2026-11-12, pendiente),
                      Bruno (2026-11-13, pendiente), and Carla (2026-11-13, hecho).
                    </p>
                  </div>
                  {sheetError && (
                    <div className="max-w-xl mx-auto">
                      <HttpDiagnosticsBox
                        message={sheetError}
                        diagnostics={sheetDiagnostics}
                        onReauth={handleSignIn}
                      />
                    </div>
                  )}
                </section>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                  <div className="lg:col-span-7 flex flex-col">
                    <SheetGridPane
                      metadata={metadata}
                      sheetName={selectedTabName}
                      rows={rows}
                      estadoColumnLetter={estadoColumnLetter}
                      referenceDate={referenceDate}
                      isLoading={isSheetLoading}
                      error={sheetError}
                      diagnostics={sheetDiagnostics}
                      onRefresh={() => loadRows(metadata.spreadsheetId, selectedTabName)}
                      onRequestToggleStatus={handleRequestToggleStatus}
                      onRequestResetRows={handleRequestResetRows}
                      onReauth={handleSignIn}
                    />
                  </div>
                  <div className="lg:col-span-5 flex flex-col">
                    <ChatConsolePane
                      referenceDate={referenceDate}
                      onChangeReferenceDate={setReferenceDate}
                      messages={chatMessages}
                      isSending={isChatSending}
                      hasSheet={Boolean(metadata && selectedTabName)}
                      onSendMessage={handleSendChatMessage}
                      onClearChat={() => setChatMessages([])}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'inspector' && (
            <McpInspectorView
              spreadsheetId={metadata?.spreadsheetId || ''}
              sheetName={selectedTabName}
              defaultDate={referenceDate}
              history={traceHistory}
              onRecordTrace={(entry) => setTraceHistory((prev) => [entry, ...prev])}
            />
          )}

          {activeTab === 'script' && (
            <LocalScriptView
              spreadsheetId={metadata?.spreadsheetId || ''}
              sheetName={selectedTabName}
            />
          )}
        </main>
      )}

      <ConfirmMutationModal
        mutation={pendingMutation}
        isSubmitting={isMutating}
        onCancel={() => setPendingMutation(null)}
        onConfirm={handleConfirmMutation}
      />
    </div>
  );
}
