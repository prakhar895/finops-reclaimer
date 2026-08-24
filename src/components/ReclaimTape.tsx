import React from 'react';

export interface TapeItem {
  id: string;
  resourceId: string;
  resourceName?: string;
  action?: string;
  amountUsd: number;
  timestamp?: number;
  strikethrough?: boolean;
}

export interface ReclaimTapeProps {
  items: TapeItem[];
  sessionTotalUsd: number;
  title?: string;
  onClearTape?: () => void;
}

export const ReclaimTape: React.FC<ReclaimTapeProps> = ({
  items,
  sessionTotalUsd,
  title = 'Reclaim Tape',
  onClearTape,
}) => {
  const formattedTotal = `-$${Math.abs(sessionTotalUsd).toFixed(2)}`;

  return (
    <aside
      aria-label="Reclaim Tape Ledger"
      className="reclaim-tape-aside fixed right-0 top-0 h-[calc(100vh-24px)] w-[300px] bg-paper border-l border-hairline flex flex-col z-10 pt-[24px] select-none shadow-xl"
    >
      {/* Torn Edge Effect Header */}
      <div className="torn-edge h-[12px] w-full absolute top-0 left-0" />

      {/* Tape Title & Status */}
      <div className="p-4 border-b border-[#d1d0cb] flex items-center justify-between opacity-80 shrink-0">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] text-[#151A21]">
            receipt_long
          </span>
          <span className="font-label-caps text-label-caps uppercase tracking-widest text-[#151A21]">
            {title}
          </span>
        </div>
        {items.length > 0 && onClearTape && (
          <button
            type="button"
            onClick={onClearTape}
            className="text-[10px] uppercase font-label-caps text-outline hover:text-[#151A21] cursor-pointer"
            title="Reset Tape Ledger"
          >
            Clear
          </button>
        )}
      </div>

      {/* Line Items Container */}
      <div className="flex-1 p-4 overflow-y-auto font-number-md text-number-md text-[#151A21] space-y-2 opacity-90">
        {items.length === 0 ? (
          <div className="text-[12px] text-outline italic py-4 text-center">
            No reclaims applied yet.
            <div className="text-[11px] mt-1 not-italic text-outline/70">
              Click &quot;Plan&quot; on any safe finding to execute dry-run and commit to tape.
            </div>
          </div>
        ) : (
          items.map((item) => {
            const formattedVal = `-$${Math.abs(item.amountUsd).toFixed(2)}`;
            return (
              <div
                key={item.id}
                className="flex justify-between items-center py-1 border-b border-[#e5e4de] last:border-0"
              >
                <div className="flex flex-col">
                  <span className="font-medium text-[#151A21] text-[12px]">
                    {item.resourceId}
                  </span>
                  {item.action && (
                    <span className="text-[10px] text-outline uppercase font-label-caps">
                      {item.action.replace(/-/g, ' ')}
                    </span>
                  )}
                </div>
                <span
                  className={`font-medium ${
                    item.strikethrough
                      ? 'line-through text-outline'
                      : 'text-[#151A21]'
                  }`}
                >
                  {formattedVal}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Session Total Footer */}
      <div className="p-4 border-t-2 border-[#151A21] bg-paper shrink-0">
        <div className="flex justify-between items-end font-number-lg text-number-lg font-semibold text-[#151A21]">
          <div className="flex flex-col">
            <span className="text-[11px] uppercase font-label-caps tracking-widest text-outline">
              Session Ledger
            </span>
            <span className="text-[13px] uppercase font-label-caps tracking-wider text-[#151A21]">
              Total Reclaimed
            </span>
          </div>
          <span className="text-secondary-dark font-number-lg" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{formattedTotal}</span>
        </div>
      </div>
    </aside>
  );
};
