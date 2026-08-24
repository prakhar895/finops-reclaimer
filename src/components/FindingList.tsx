import React from 'react';
import { Finding } from '../types';
import { FindingRow } from './FindingRow';
import { EmptyState } from './EmptyState';

export interface FindingListProps {
  findings: Finding[];
  appliedIds: Set<string>;
  onPlanFinding?: (finding: Finding) => void;
  onResetPolicy?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
}

export const FindingList: React.FC<FindingListProps> = ({
  findings,
  appliedIds,
  onPlanFinding,
  onResetPolicy,
  emptyTitle,
  emptyDescription,
}) => {
  if (findings.length === 0) {
    return (
      <div className="w-full flex-1 min-h-[240px]">
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          onReset={onResetPolicy}
        />
      </div>
    );
  }

  return (
    <div className="w-full">
      <table className="w-full text-left border-collapse">
        <thead className="sticky top-0 bg-surface border-b border-hairline z-10">
          <tr>
            <th className="p-cell-padding font-label-caps text-[10px] text-outline font-normal uppercase">
              Resource Name / ID
            </th>
            <th className="p-cell-padding font-label-caps text-[10px] text-outline font-normal uppercase">
              Signals
            </th>
            <th className="p-cell-padding font-label-caps text-[10px] text-outline font-normal uppercase text-right">
              Savings / Action
            </th>
          </tr>
        </thead>
        <tbody className="font-body-sm">
          {findings.map((finding) => (
            <FindingRow
              key={`${finding.ruleId}-${finding.resource.id}`}
              finding={finding}
              isApplied={appliedIds.has(finding.resource.id)}
              onPlan={onPlanFinding}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
};
