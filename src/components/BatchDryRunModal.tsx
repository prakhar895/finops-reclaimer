import React, { useEffect } from 'react';
import { Finding } from '../types';

export interface BatchDryRunModalProps {
  findings: Finding[];
  isOpen: boolean;
  onClose: () => void;
  onConfirmBatch: (findings: Finding[]) => void;
}

export const BatchDryRunModal: React.FC<BatchDryRunModalProps> = ({
  findings,
  isOpen,
  onClose,
  onConfirmBatch,
}) => {
  // Escape key handler and focus return
  useEffect(() => {
    if (!isOpen) return;
    const previousActiveElement = document.activeElement as HTMLElement | null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
        previousActiveElement.focus();
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen || findings.length === 0) {
    return null;
  }

  // Strictly enforce guardrails: exclude any findings with non-empty guardrails
  const safeFindings = findings.filter(
    (f) => !f.guardrails || f.guardrails.length === 0
  );

  const totalSavings = safeFindings.reduce((sum, f) => sum + f.monthlySavingUsd, 0);
  const actionCount = safeFindings.length;

  const handleConfirm = () => {
    if (safeFindings.length === 0) return;
    onConfirmBatch(safeFindings);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 select-none"
    >
      <div className="w-full max-w-[720px] max-h-[85vh] bg-surface-level-1 border border-hairline rounded-lg flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-gutter border-b border-hairline bg-surface-container-low shrink-0 flex justify-between items-start">
          <div className="space-y-1">
            <h2
              id="batch-modal-title"
              className="font-headline-md text-headline-md text-on-surface tracking-tight flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-tertiary text-[20px]">
                playlist_play
              </span>
              Dry Run — Batch Reclaim ({actionCount} actions)
            </h2>
            <div className="font-number-md text-[11px] text-outline uppercase tracking-wider">
              Deterministic dry-run simulation · Safe unblocked actions only
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="text-outline hover:text-on-surface transition-colors cursor-pointer p-1 border border-transparent hover:border-hairline"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Scrollable list of findings and execution plans */}
        <div className="flex-1 overflow-y-auto p-gutter space-y-4 divide-y divide-hairline bg-[#10141a]">
          {safeFindings.map((f, idx) => {
            const actionVerb = f.action.replace(/-/g, ' ');
            const planSteps = f.plan || [];

            return (
              <div key={f.resource.id} className={`${idx > 0 ? 'pt-4' : ''} space-y-2`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-label-caps text-[10px] text-tertiary uppercase tracking-wider px-1.5 py-0.5 bg-tertiary/10 border border-tertiary/30">
                        {actionVerb}
                      </span>
                      <span className="font-medium text-[13px] text-on-surface">
                        {f.resource.name}
                      </span>
                    </div>
                    <div className="font-number-md text-[11px] text-outline mt-0.5" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                      {f.resource.id} · {f.resource.region} · {f.resource.instanceType || f.resource.volumeType || f.resource.kind.toUpperCase()}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-number-md text-[13px] text-secondary font-medium" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                      +${f.monthlySavingUsd.toFixed(2)}/mo
                    </span>
                  </div>
                </div>

                {/* Execution Plan preview */}
                <div className="bg-[#151A21] border border-hairline p-2.5 rounded text-[11px] text-on-surface-variant font-number-md space-y-1" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                  <div className="text-[10px] uppercase font-label-caps text-outline mb-1">
                    Execution Plan ({planSteps.length} steps):
                  </div>
                  {planSteps.map((step, stepIdx) => (
                    <div key={stepIdx} className="flex items-start gap-1.5 text-outline text-[10.5px]">
                      <span className="text-tertiary select-none">{stepIdx + 1}.</span>
                      <span className="text-on-surface-variant">{step.replace(/^\d+\.\s*/, '')}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Warning banner */}
        <div className="bg-[#1b222c] border-t border-hairline px-gutter py-2 flex items-center gap-2 text-[11px] text-outline">
          <span className="material-symbols-outlined text-secondary text-[16px]">info</span>
          <span>{actionCount} findings staged. Guardrail-blocked findings are excluded from this batch.</span>
        </div>

        {/* Footer with Total and Confirm Button */}
        <div className="p-gutter border-t border-hairline bg-surface-level-1 shrink-0 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="font-label-caps text-[10px] uppercase tracking-wider text-outline">
              Total Monthly Recovery
            </span>
            <span className="font-number-lg text-[18px] text-secondary font-medium tracking-tight" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
              +${totalSavings.toFixed(2)} / mo
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-hairline text-outline hover:text-on-surface font-label-caps text-label-caps uppercase tracking-wider transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              id="confirm-batch-actions-btn"
              onClick={handleConfirm}
              disabled={actionCount === 0}
              className="px-6 py-2 bg-[#4B7A5A] text-white hover:opacity-90 font-label-caps text-label-caps uppercase tracking-wider transition-opacity cursor-pointer flex items-center gap-2 shadow-sm font-semibold"
            >
              <span className="material-symbols-outlined text-[16px]">check_circle</span>
              Confirm {actionCount} actions
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

