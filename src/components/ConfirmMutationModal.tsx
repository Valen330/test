import { AlertTriangle, X } from 'lucide-react';
import type { PendingMutation } from '../types/workbench';

interface ConfirmMutationModalProps {
  mutation: PendingMutation | null;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmMutationModal({
  mutation,
  isSubmitting,
  onCancel,
  onConfirm,
}: ConfirmMutationModalProps) {
  if (!mutation) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-mutation-title"
    >
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <h2 id="confirm-mutation-title" className="text-base font-semibold text-slate-900">
              {mutation.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded"
            aria-label="Close confirmation dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-slate-600 leading-relaxed">{mutation.description}</p>

          <div className="border border-slate-200 rounded-md bg-slate-50 p-3.5 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-500">Spreadsheet ID</span>
              <span className="font-mono text-slate-800 truncate max-w-[230px]">
                {mutation.spreadsheetId}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-500">Target Range</span>
              <span className="font-mono text-slate-800">{mutation.targetRange}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-500">Current Value</span>
              <span className="font-mono text-slate-700">{mutation.currentValue}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-500">New Value</span>
              <span className="font-mono font-medium text-blue-700">{mutation.newValue}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-3.5 bg-slate-50 border-t border-slate-200">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
          >
            {isSubmitting ? 'Updating Sheet...' : 'Confirm Update'}
          </button>
        </div>
      </div>
    </div>
  );
}
