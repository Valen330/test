import { AlertCircle } from 'lucide-react';
import type { HttpDiagnostics } from '../lib/http';

interface HttpDiagnosticsBoxProps {
  message: string;
  diagnostics?: HttpDiagnostics | null;
  onReauth?: () => void;
}

export function HttpDiagnosticsBox({
  message,
  diagnostics,
  onReauth,
}: HttpDiagnosticsBoxProps) {
  return (
    <div className="p-3.5 rounded-md bg-red-50 border border-red-200 text-xs text-red-800 space-y-2.5 text-left">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
          <span className="font-medium text-red-900">{message}</span>
        </div>
        {(diagnostics?.status === 401 || diagnostics?.status === 403) && onReauth && (
          <button
            type="button"
            onClick={onReauth}
            className="px-2.5 py-1 text-xs font-medium text-red-800 bg-white border border-red-300 rounded hover:bg-red-100/60 transition-colors whitespace-nowrap shrink-0"
          >
            Re-authorize / Switch account
          </button>
        )}
      </div>

      {diagnostics && (
        <div className="bg-white/90 border border-red-200/80 rounded p-2.5 font-mono text-[11px] text-slate-800 space-y-1">
          <div className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1">
            <span className="text-slate-500">Origin</span>
            <span>
              {diagnostics.source === 'google-sheets-upstream'
                ? 'Google Sheets API (upstream)'
                : 'Browser -> App Server response'}
            </span>
            <span className="text-slate-500">HTTP Status</span>
            <span>
              {diagnostics.status}
              {diagnostics.statusText ? ` ${diagnostics.statusText}` : ''}
            </span>
            <span className="text-slate-500">Final URL</span>
            <span className="break-all">{diagnostics.finalUrl}</span>
            <span className="text-slate-500">Redirected</span>
            <span>{diagnostics.redirected ? 'Yes' : 'No'}</span>
            <span className="text-slate-500">Content-Type</span>
            <span className="break-all">{diagnostics.contentType}</span>
            {diagnostics.tokenEmail && (
              <>
                <span className="text-slate-500">Token Account</span>
                <span className="break-all">{diagnostics.tokenEmail}</span>
              </>
            )}
            {diagnostics.grantedScopes && (
              <>
                <span className="text-slate-500">Granted Scopes</span>
                <span className="break-all">{diagnostics.grantedScopes}</span>
              </>
            )}
          </div>
          {diagnostics.bodyPreview && (
            <div className="pt-1.5 mt-1.5 border-t border-red-100">
              <span className="text-slate-500 block mb-0.5">Response Preview</span>
              <div className="text-slate-700 break-all whitespace-pre-wrap">
                {diagnostics.bodyPreview}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
