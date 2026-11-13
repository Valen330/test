import { AlertCircle, CheckCircle2, Clock, RefreshCw, RotateCcw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { HttpDiagnostics } from '../lib/http';
import type { ContactRow, SpreadsheetMetadata } from '../types/workbench';
import { HttpDiagnosticsBox } from './HttpDiagnosticsBox';

interface SheetGridPaneProps {
  metadata: SpreadsheetMetadata | null;
  sheetName: string;
  rows: ContactRow[];
  estadoColumnLetter: string;
  referenceDate: string;
  isLoading: boolean;
  error: string | null;
  diagnostics?: HttpDiagnostics | null;
  onRefresh: () => void;
  onRequestToggleStatus: (row: ContactRow) => void;
  onRequestResetRows: () => void;
  onReauth?: () => void;
}

type StatusFilter = 'all' | 'pendiente' | 'hecho';

export function SheetGridPane({
  metadata,
  sheetName,
  rows,
  estadoColumnLetter,
  referenceDate,
  isLoading,
  error,
  diagnostics,
  onRefresh,
  onRequestToggleStatus,
  onRequestResetRows,
  onReauth,
}: SheetGridPaneProps) {
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const statusLower = row.estado.trim().toLowerCase();
      if (filter === 'pendiente' && statusLower !== 'pendiente') return false;
      if (filter === 'hecho' && statusLower !== 'hecho') return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return (
          row.nombre.toLowerCase().includes(q) ||
          row.proximo_seguimiento.toLowerCase().includes(q) ||
          statusLower.includes(q)
        );
      }
      return true;
    });
  }, [rows, filter, search]);

  const counts = useMemo(() => {
    let pending = 0;
    let overdue = 0;
    let dueToday = 0;
    let done = 0;
    for (const row of rows) {
      const statusLower = row.estado.trim().toLowerCase();
      if (statusLower === 'hecho') {
        done++;
      } else if (statusLower === 'pendiente') {
        pending++;
        if (row.proximo_seguimiento < referenceDate) overdue++;
        else if (row.proximo_seguimiento === referenceDate) dueToday++;
      }
    }
    return { pending, overdue, dueToday, done };
  }, [rows, referenceDate]);

  return (
    <section className="bg-white border border-slate-200 rounded-lg flex flex-col min-h-[540px]">
      <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900 truncate">
            {metadata ? metadata.title : 'Contact Sheet'}
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5 tabular-nums">
            <span>Tab: {sheetName || '—'}</span>
            <span aria-hidden="true">·</span>
            <span>{rows.length} rows</span>
            <span aria-hidden="true">·</span>
            <span>{counts.overdue} overdue</span>
            <span aria-hidden="true">·</span>
            <span>{counts.dueToday} due {referenceDate}</span>
            <span aria-hidden="true">·</span>
            <span>{counts.done} hecho</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading || !metadata}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={onRequestResetRows}
            disabled={isLoading || !metadata}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Test Rows
          </button>
        </div>
      </div>

      <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-md">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              filter === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All ({rows.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('pendiente')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              filter === 'pendiente'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Pendiente ({counts.pending})
          </button>
          <button
            type="button"
            onClick={() => setFilter('hecho')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              filter === 'hecho'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Hecho ({counts.done})
          </button>
        </div>

        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter contact or date..."
            aria-label="Filter contacts"
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
          />
        </div>
      </div>

      {error && (
        <div className="mx-5 mt-4">
          <HttpDiagnosticsBox message={error} diagnostics={diagnostics} onReauth={onReauth} />
        </div>
      )}

      <div className="flex-1 overflow-x-auto">
        {isLoading ? (
          <div className="p-5 space-y-2.5">
            {[1, 2, 3].map((idx) => (
              <div
                key={idx}
                className="h-10 rounded bg-slate-100 animate-pulse border border-slate-200/60"
              />
            ))}
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="py-16 px-6 text-center space-y-2">
            <p className="text-sm font-medium text-slate-700">
              {rows.length === 0
                ? 'No contact rows found in this sheet tab.'
                : 'No contacts match the active filter.'}
            </p>
            <p className="text-xs text-slate-500">
              {rows.length === 0
                ? 'Use "Reset Test Rows" to populate Ana, Bruno, and Carla.'
                : 'Try switching back to "All" or clearing your search query.'}
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-500">
                <th className="py-2.5 px-4 w-12 font-mono">Row</th>
                <th className="py-2.5 px-4">nombre</th>
                <th className="py-2.5 px-4">próximo_seguimiento</th>
                <th className="py-2.5 px-4">estado</th>
                <th className="py-2.5 px-4">Urgency vs {referenceDate}</th>
                <th className="py-2.5 px-4 text-right">Sheet Mutation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {filteredRows.map((row) => {
                const statusLower = row.estado.trim().toLowerCase();
                const isDone = statusLower === 'hecho';
                const isOverdue = !isDone && row.proximo_seguimiento < referenceDate;
                const isDueToday = !isDone && row.proximo_seguimiento === referenceDate;

                return (
                  <tr key={row.rowIndex} className="h-11 hover:bg-slate-50 transition-colors">
                    <td className="py-2 px-4 font-mono text-xs text-slate-400 tabular-nums">
                      {row.rowIndex}
                    </td>
                    <td className="py-2 px-4 font-medium text-slate-900">{row.nombre}</td>
                    <td className="py-2 px-4 font-mono text-xs text-slate-700 tabular-nums">
                      {row.proximo_seguimiento}
                    </td>
                    <td className="py-2 px-4 font-mono text-xs">
                      <span className={isDone ? 'text-emerald-700 font-medium' : 'text-slate-800'}>
                        {row.estado}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-xs">
                      {isDone ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Hecho
                        </span>
                      ) : isOverdue ? (
                        <span className="inline-flex items-center gap-1.5 text-red-700 font-medium">
                          <AlertCircle className="w-3.5 h-3.5" />
                          Overdue
                        </span>
                      ) : isDueToday ? (
                        <span className="inline-flex items-center gap-1.5 text-amber-700 font-medium">
                          <Clock className="w-3.5 h-3.5" />
                          Due today
                        </span>
                      ) : (
                        <span className="text-slate-500">Scheduled</span>
                      )}
                    </td>
                    <td className="py-2 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => onRequestToggleStatus(row)}
                        className={`px-3 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 ${
                          isDone
                            ? 'text-slate-700 bg-white border-slate-300 hover:bg-slate-50'
                            : 'text-blue-700 bg-blue-50/60 border-blue-200 hover:bg-blue-100/70'
                        }`}
                      >
                        {isDone ? 'Reopen pendiente' : 'Mark as hecho'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/50 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2">
        <span>
          Status column: <span className="font-mono text-slate-700">{estadoColumnLetter}</span>
        </span>
        <span>Updates require confirmation before writing to Google Sheets.</span>
      </div>
    </section>
  );
}
