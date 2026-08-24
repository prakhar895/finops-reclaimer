import React, { useState } from 'react';
import { Finding } from '../types';

export interface FindingRowProps {
  finding: Finding;
  isApplied?: boolean;
  onPlan?: (finding: Finding) => void;
}

export const FindingRow: React.FC<FindingRowProps> = ({
  finding,
  isApplied = false,
  onPlan,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const isBlocked = finding.guardrails && finding.guardrails.length > 0;

  const confidenceClass =
    finding.confidence === 'safe'
      ? 'status-chip-safe'
      : finding.confidence === 'review'
        ? 'status-chip-review'
        : 'status-chip-risky';

  return (
    <tr
      className={`border-b border-hairline hover:bg-surface-level-1 transition-all group h-[40px] ${
        isApplied ? 'opacity-40 bg-surface-container-lowest/50' : ''
      }`}
    >
      <td className="p-cell-padding align-middle">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className={`font-medium ${isApplied ? 'line-through text-outline' : 'text-on-surface'}`}>
              {finding.resource.name}
            </span>
            {isBlocked && (
              <span
                className="material-symbols-outlined text-[14px] text-error cursor-help"
                title={finding.guardrails.join(' • ')}
              >
                gpp_bad
              </span>
            )}
          </div>
          <span className="font-number-md text-[10px] text-outline" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
            {finding.resource.id}
          </span>
        </div>
      </td>
      <td className="p-cell-padding align-middle">
        <div className="flex gap-2 flex-wrap">
          {finding.evidence.map((sig, idx) => (
            <span
              key={idx}
              className="px-2 py-[2px] bg-surface-container border border-hairline text-[10px] text-on-surface-variant whitespace-nowrap"
            >
              {sig}
            </span>
          ))}
        </div>
      </td>
      <td className="p-cell-padding align-middle text-right">
        <div className="flex items-center justify-end gap-4">
          <span
            className={`font-number-md ${isApplied ? 'line-through text-outline' : 'text-secondary font-medium'}`}
            style={{ fontFamily: "'IBM Plex Mono', monospace" }}
          >
            ${finding.monthlySavingUsd.toFixed(2)}
          </span>
          <span
            className={`${confidenceClass} px-2 py-[2px] text-[10px] font-label-caps uppercase tracking-wider`}
          >
            {finding.confidence.toUpperCase()}
          </span>
          {isApplied ? (
            <span className="font-number-md text-[10px] uppercase tracking-wider px-2 py-0.5 border border-[#4B7A5A] text-[#4B7A5A] bg-[#4B7A5A]/10 whitespace-nowrap">
              APPLIED · ON TAPE
            </span>
          ) : isBlocked ? (
            <div className="relative inline-block">
              <button
                type="button"
                disabled
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                className="px-3 py-1 border border-outline/30 text-outline/50 text-[10px] uppercase font-label-caps cursor-not-allowed bg-surface-container-high/30"
              >
                Blocked
              </button>
              {showTooltip && (
                <div className="absolute right-0 bottom-full mb-1 z-30 w-64 p-2 bg-[#1B2028] border border-hairline text-left shadow-xl pointer-events-none rounded">
                  <div className="text-[10px] font-label-caps text-error uppercase mb-1 font-bold flex items-center gap-1">
                    <span className="material-symbols-outlined text-[12px]">security</span>
                    Tripped Guardrail
                  </div>
                  <ul className="text-[11px] text-on-surface-variant space-y-1">
                    {finding.guardrails.map((g, idx) => (
                      <li key={idx} className="leading-tight flex items-start gap-1">
                        <span className="text-error">•</span>
                        <span>{g}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onPlan?.(finding)}
              className="px-3 py-1 border border-hairline text-[10px] uppercase font-label-caps hover:bg-surface-variant hover:border-outline text-on-surface transition-all opacity-60 hover:opacity-100 focus:opacity-100 cursor-pointer"
            >
              Plan
            </button>
          )}
        </div>
      </td>
    </tr>
  );
};
