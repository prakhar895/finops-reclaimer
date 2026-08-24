import React, { useState, useEffect } from 'react';
import { Finding } from '../types';

export interface DryRunModalProps {
  finding: Finding | null;
  isOpen: boolean;
  onClose: () => void;
  onApplyPlan?: (finding: Finding) => void;
}

export const DryRunModal: React.FC<DryRunModalProps> = ({
  finding,
  isOpen,
  onClose,
  onApplyPlan,
}) => {
  const [checkedSteps, setCheckedSteps] = useState<Record<number, boolean>>({});

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

  useEffect(() => {
    if (finding) {
      setCheckedSteps({});
    }
  }, [finding]);

  if (!isOpen || !finding) {
    return null;
  }

  const isBlocked = Boolean(finding.guardrails && finding.guardrails.length > 0);
  const actionVerb = finding.action.replace(/-/g, ' ');
  const title = `Dry run — ${actionVerb} ${finding.resource.id}`;

  const specParts: string[] = [];
  if (finding.resource.sizeGb) {
    specParts.push(`${finding.resource.sizeGb} GB`);
  }
  if (finding.resource.volumeType) {
    specParts.push(finding.resource.volumeType);
  } else if (finding.resource.instanceType) {
    specParts.push(finding.resource.instanceType);
  } else {
    specParts.push(finding.resource.kind.toUpperCase());
  }
  specParts.push(finding.resource.region);
  specParts.push(`$${finding.monthlyCostUsd.toFixed(2)}/mo`);

  const subtitle = specParts.join(' · ');

  const planSteps = (finding.plan || []).map((step, idx) =>
    step.match(/^\d+\./) ? step : `${idx + 1}. ${step}`
  );

  const toggleStep = (idx: number) => {
    setCheckedSteps((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  const handleApply = () => {
    if (isBlocked) {
      return;
    }
    if (onApplyPlan && finding) {
      onApplyPlan(finding);
    }
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dry-run-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 select-none"
    >
      <div className="w-full max-w-[560px] bg-surface-level-1 border border-hairline rounded-lg p-gutter flex flex-col gap-6 shadow-2xl">
        {/* Header */}
        <div className="space-y-1">
          <h2 id="dry-run-modal-title" className="font-headline-md text-headline-md text-on-surface tracking-tight">
            {title}
          </h2>
          <div className="font-number-md text-[11px] text-outline uppercase tracking-wider" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
            {subtitle}
          </div>
        </div>

        {/* Execution Steps */}
        <div className="space-y-4">
          {planSteps.map((stepText, idx) => {
            const isChecked = checkedSteps[idx] ?? false;
            return (
              <label
                key={idx}
                className="flex items-start gap-3 cursor-pointer group select-none"
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleStep(idx)}
                  className="mt-1"
                />
                <div className="text-body-sm text-on-surface-variant group-hover:text-on-surface transition-colors" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                  {stepText}
                </div>
              </label>
            );
          })}
        </div>

        {/* Callout Strip */}
        <div className={`${isBlocked ? 'bg-error-container border border-error/40' : 'bg-surface-container border border-hairline'} p-3 flex items-start gap-3 rounded`}>
          <span
            className={`material-symbols-outlined ${isBlocked ? 'text-error' : 'text-outline'} text-[20px] select-none shrink-0`}
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            {isBlocked ? 'warning' : 'info'}
          </span>
          <div className={`text-[12px] font-medium ${isBlocked ? 'text-on-error-container' : 'text-on-surface-variant'}`}>
            {isBlocked ? (
              <ul className="space-y-1">
                {finding.guardrails.map((guardrail, gIdx) => (
                  <li key={gIdx} className="flex items-start gap-1.5">
                    <span className="text-error select-none">•</span>
                    <span>{guardrail}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <span>Simulated action. No cloud API is called and no resource is modified.</span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-4 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-outline font-label-caps text-label-caps uppercase hover:text-on-surface transition-colors cursor-pointer border border-hairline"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={isBlocked}
            className={`px-6 py-2 font-label-caps text-label-caps uppercase transition-opacity ${
              isBlocked
                ? 'bg-surface-container text-outline cursor-not-allowed border border-hairline'
                : 'bg-[#4B7A5A] text-white hover:opacity-90 cursor-pointer shadow-sm'
            }`}
          >
            {isBlocked ? 'Blocked by Guardrail' : 'Apply to plan'}
          </button>
        </div>
      </div>
    </div>
  );
};

