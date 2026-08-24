/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  PolicyRail,
  KpiStrip,
  FindingList,
  AssumptionsPanel,
  ReclaimTape,
  DryRunModal,
  BatchDryRunModal,
  TapeItem,
} from './components';
import { Policy, DEFAULT_POLICY, Finding } from './types';
import { generateInventory } from './data/inventory';
import { evaluate } from './data/rules';

type TabType = 'all' | 'safe' | 'review' | 'blocked';

const DEFAULT_REGIONS = ['us-east-1', 'eu-west-1', 'ap-south-1', 'us-west-2'];
const DEFAULT_RESOURCE_TYPES = ['ec2', 'ebs', 'rds', 'snapshot', 'eip', 'alb', 'nat'];

export default function App() {
  // Required React State
  const [seed, setSeed] = useState<number>(20260824);
  const [policy, setPolicy] = useState<Policy>(DEFAULT_POLICY);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());

  // Scope filter states
  const [selectedRegions, setSelectedRegions] = useState<string[]>(DEFAULT_REGIONS);
  const [selectedResourceTypes, setSelectedResourceTypes] = useState<string[]>(DEFAULT_RESOURCE_TYPES);

  // UI state
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [activeDryRunFinding, setActiveDryRunFinding] = useState<Finding | null>(null);
  const [batchDryRunFindings, setBatchDryRunFindings] = useState<Finding[] | null>(null);
  const [tapeItems, setTapeItems] = useState<TapeItem[]>([]);

  // 1. Derive inventory deterministically from seed
  const inventory = useMemo(() => {
    return generateInventory({ seed });
  }, [seed]);

  // 2. Derive findings and evaluations deterministically from (inventory, policy)
  const evaluation = useMemo(() => {
    return evaluate(inventory, policy);
  }, [inventory, policy]);

  // Handle region filter toggles
  const handleToggleRegion = useCallback((region: string) => {
    setSelectedRegions((prev) =>
      prev.includes(region) ? prev.filter((r) => r !== region) : [...prev, region]
    );
  }, []);

  // Handle resource kind filter toggles
  const handleToggleResourceType = useCallback((kind: string) => {
    setSelectedResourceTypes((prev) =>
      prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]
    );
  }, []);

  // Filter findings based on active tab and scope filters
  const displayedFindings = useMemo(() => {
    return evaluation.findings.filter((finding) => {
      // Region filter
      if (selectedRegions.length > 0 && !selectedRegions.includes(finding.resource.region)) {
        return false;
      }
      // Resource kind filter
      if (selectedResourceTypes.length > 0 && !selectedResourceTypes.includes(finding.resource.kind)) {
        return false;
      }
      // Tab filter
      const isBlocked = finding.guardrails.length > 0;
      if (activeTab === 'safe') {
        return finding.confidence === 'safe' && !isBlocked;
      }
      if (activeTab === 'review') {
        return finding.confidence === 'review' && !isBlocked;
      }
      if (activeTab === 'blocked') {
        return isBlocked;
      }
      return true;
    });
  }, [evaluation.findings, selectedRegions, selectedResourceTypes, activeTab]);
  // Scope-filtered findings (region + resource type), independent of the active tab.
  const scopedFindings = useMemo(() => {
    return evaluation.findings.filter((finding) => {
      if (selectedRegions.length > 0 && !selectedRegions.includes(finding.resource.region)) {
        return false;
      }
      if (selectedResourceTypes.length > 0 && !selectedResourceTypes.includes(finding.resource.kind)) {
        return false;
      }
      return true;
    });
  }, [evaluation.findings, selectedRegions, selectedResourceTypes]);
  // Calculate total applied savings from active policy findings
  const appliedSavings = useMemo(() => {
    let total = 0;
    for (const finding of scopedFindings) {
      if (appliedIds.has(finding.resource.id)) {
        total += finding.monthlySavingUsd;
      }
    }
    return total;
  }, [scopedFindings, appliedIds]);

  // Recoverable / month: headline figure subtracting applied savings
  const remainingRecoverableMonthlyUsd = useMemo(() => {
      const scopedTotal = scopedFindings.reduce((sum, f) => sum + f.monthlySavingUsd, 0);
    return Math.max(0, scopedTotal - appliedSavings);
  }, [scopedFindings, appliedSavings]);

  // Dynamic fleet efficiency score reflecting reclaimed waste
  const currentEfficiencyScore = useMemo(() => {
    if (evaluation.fleetMonthlySpendUsd <= 0) return 100;
    return Math.min(
      100,
      Math.max(
        0,
        Math.round(
          (1 - remainingRecoverableMonthlyUsd / evaluation.fleetMonthlySpendUsd) * 100
        )
      )
    );
  }, [remainingRecoverableMonthlyUsd, evaluation.fleetMonthlySpendUsd]);

  // Remaining active findings count
  const remainingFindingsCount = useMemo(() => {
    return displayedFindings.filter((f) => !appliedIds.has(f.resource.id)).length;
  }, [displayedFindings, appliedIds]);

  // Action handlers
  const handleOpenPlan = useCallback((finding: Finding) => {
    // Blocked findings cannot be planned
    if (finding.guardrails.length > 0) return;
    setActiveDryRunFinding(finding);
  }, []);

  const handleCloseModal = useCallback(() => {
    setActiveDryRunFinding(null);
  }, []);

  // Applying a single finding via dry-run modal
  const handleApplyFinding = useCallback((finding: Finding) => {
    if (finding.guardrails.length > 0) return;

    setAppliedIds((prev) => {
      const next = new Set(prev);
      next.add(finding.resource.id);
      return next;
    });

    const newTapeItem: TapeItem = {
      id: `tape-${finding.resource.id}-${Date.now()}`,
      resourceId: finding.resource.id,
      resourceName: finding.resource.name,
      action: finding.action,
      amountUsd: finding.monthlySavingUsd,
      timestamp: Date.now(),
      strikethrough: false,
    };

    setTapeItems((prev) => [
      newTapeItem,
      ...prev.filter((item) => item.resourceId !== finding.resource.id),
    ]);
  }, []);

  // Unapplied safe findings eligible for batch dry-run
  const unappliedSafeFindings = useMemo(() => {
    return evaluation.findings.filter(
      (f) => f.confidence === 'safe' && f.guardrails.length === 0 && !appliedIds.has(f.resource.id)
    );
  }, [evaluation.findings, appliedIds]);

  // Clicking "Apply safe (N)" opens the batch dry-run modal without mutating state
  const handleOpenBatchDryRun = useCallback(() => {
    if (unappliedSafeFindings.length === 0) return;
    setBatchDryRunFindings(unappliedSafeFindings);
  }, [unappliedSafeFindings]);

  const handleCloseBatchModal = useCallback(() => {
    setBatchDryRunFindings(null);
  }, []);

  // Confirming the batch dry-run modal applies all staged actions to state and ledger tape
  const handleConfirmBatchApply = useCallback((stagedFindings: Finding[]) => {
    if (stagedFindings.length === 0) return;

    setAppliedIds((prev) => {
      const next = new Set(prev);
      for (const f of stagedFindings) {
        next.add(f.resource.id);
      }
      return next;
    });

    const newItems: TapeItem[] = stagedFindings.map((f, idx) => ({
      id: `tape-${f.resource.id}-${Date.now()}-${idx}`,
      resourceId: f.resource.id,
      resourceName: f.resource.name,
      action: f.action,
      amountUsd: f.monthlySavingUsd,
      timestamp: Date.now(),
      strikethrough: false,
    }));

    setTapeItems((prev) => [...newItems, ...prev]);
    setBatchDryRunFindings(null);
  }, []);

  const handleResetPolicy = useCallback(() => {
    setPolicy(DEFAULT_POLICY);
  }, []);

  const handleClearTape = useCallback(() => {
    setAppliedIds(new Set());
    setTapeItems([]);
  }, []);

  const handleSeedChange = useCallback((newSeed: number) => {
    setSeed(newSeed);
    setAppliedIds(new Set());
    setTapeItems([]);
  }, []);

  return (
    <div className="app-shell-container flex flex-col h-screen overflow-hidden font-body-sm text-on-surface antialiased bg-[#151A21] select-none">
      {/* App Shell with 3-column Ledger layout */}
      <div className="app-layout-wrapper flex flex-1 h-[calc(100vh-24px)] w-full">
        {/* Left Rail: PolicyRail */}
        <PolicyRail
          policy={policy}
          onChange={setPolicy}
          seed={seed}
          onSeedChange={handleSeedChange}
          inventoryCount={inventory.length}
          selectedRegions={selectedRegions}
          onToggleRegion={handleToggleRegion}
          selectedResourceTypes={selectedResourceTypes}
          onToggleResourceType={handleToggleResourceType}
        />

        {/* Main Content Area */}
        <main className="main-content-pane flex-1 flex flex-col ml-[240px] mr-[300px] h-[calc(100vh-24px)] overflow-hidden bg-[#151A21]">
          {/* Top Navigation & Status Bar */}
          <header className="flex justify-between items-center h-[48px] w-full px-gutter border-b border-hairline bg-surface shrink-0">
            <div className="flex items-center gap-4 h-full pt-4">
              <nav className="flex gap-6 h-full font-label-caps text-label-caps uppercase tracking-wider">
                <button
                  type="button"
                  onClick={() => setActiveTab('all')}
                  className={`pb-3 h-full transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'all'
                      ? 'text-secondary border-b-[2px] border-secondary font-bold'
                      : 'text-outline hover:text-on-surface'
                  }`}
                >
                  <span>All Findings</span>
                  <span className="text-[10px] px-1.5 py-0.2 bg-surface-container rounded-sm border border-hairline" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                    {evaluation.findings.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('safe')}
                  className={`pb-3 h-full transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'safe'
                      ? 'text-secondary border-b-[2px] border-secondary font-bold'
                      : 'text-outline hover:text-on-surface'
                  }`}
                >
                  <span>Safe</span>
                  <span className="text-[10px] px-1.5 py-0.2 bg-surface-container rounded-sm border border-hairline text-tertiary" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                    {evaluation.findings.filter((f) => f.confidence === 'safe' && (!f.guardrails || f.guardrails.length === 0)).length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('review')}
                  className={`pb-3 h-full transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'review'
                      ? 'text-secondary border-b-[2px] border-secondary font-bold'
                      : 'text-outline hover:text-on-surface'
                  }`}
                >
                  <span>Needs Review</span>
                  <span className="text-[10px] px-1.5 py-0.2 bg-surface-container rounded-sm border border-hairline text-secondary" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                    {evaluation.findings.filter((f) => f.confidence === 'review' && (!f.guardrails || f.guardrails.length === 0)).length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('blocked')}
                  className={`pb-3 h-full transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'blocked'
                      ? 'text-secondary border-b-[2px] border-secondary font-bold'
                      : 'text-outline hover:text-on-surface'
                  }`}
                >
                  <span>Blocked</span>
                  <span className="text-[10px] px-1.5 py-0.2 bg-surface-container rounded-sm border border-hairline text-error" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                    {evaluation.blockedByGuardrails}
                  </span>
                </button>
              </nav>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                id="apply-safe-batch-btn"
                onClick={handleOpenBatchDryRun}
                disabled={unappliedSafeFindings.length === 0}
                title="Open batched dry-run simulation for safe findings"
                className={`px-2.5 py-1 bg-surface-container border font-label-caps text-[10px] uppercase transition-colors flex items-center gap-1 ${
                  unappliedSafeFindings.length > 0
                    ? 'border-hairline text-on-surface hover:border-secondary hover:text-secondary cursor-pointer'
                    : 'border-hairline/30 text-outline/50 cursor-not-allowed'
                }`}
              >
                <span className="material-symbols-outlined text-[14px] text-tertiary">
                  bolt
                </span>
                Apply Safe ({unappliedSafeFindings.length})
              </button>
              <button
                type="button"
                onClick={handleResetPolicy}
                title="Reset policy thresholds to default"
                className="px-2.5 py-1 bg-surface-container border border-hairline text-outline hover:text-on-surface font-label-caps text-[10px] uppercase transition-colors cursor-pointer"
              >
                Reset Policy
              </button>
            </div>
          </header>

          {/* KPI Strip with Animated Count-up Recoverable Figure & Sensitivity Curve */}
          <KpiStrip
            recoverableMonthlyUsd={remainingRecoverableMonthlyUsd}
            fleetSpendMonthlyUsd={evaluation.fleetMonthlySpendUsd}
            efficiencyScore={currentEfficiencyScore}
            findingsCount={remainingFindingsCount}
            inventory={inventory}
            policy={policy}
          />

          {/* Scrollable Center Pane for Findings and Assumptions Panel */}
          <div className="main-scroll-pane flex-1 overflow-y-auto pb-[24px] flex flex-col">
            {/* Findings Table List / EmptyState */}
            <FindingList
              findings={displayedFindings}
              appliedIds={appliedIds}
              onPlanFinding={handleOpenPlan}
              onResetPolicy={handleResetPolicy}
              emptyTitle="No findings match active policy & filters"
              emptyDescription={`Your idle threshold is ${policy.idleDayThreshold}d and CPU cutoff is ${policy.cpuIdlePct}%. Adjust sliders to broaden the scan.`}
            />

            {/* Collapsible Audit Assumptions Reference Panel */}
            <AssumptionsPanel
              policy={policy}
              visibleFindings={displayedFindings}
            />
          </div>
        </main>

        {/* Right Rail: Reclaim Tape Ledger */}
        <ReclaimTape
          items={tapeItems}
          sessionTotalUsd={appliedSavings}
          onClearTape={handleClearTape}
        />
      </div>

      {/* Footer System Status Bar */}
      <footer className="fixed bottom-0 left-0 w-full h-[24px] z-50 border-t border-hairline bg-surface-container flex justify-between items-center px-4 font-body-sm text-[10px] tracking-wide uppercase text-outline">
        <div className="flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-tertiary"></span>
          <span>Rule engine active · {inventory.length} simulated fleet resources evaluated</span>
        </div>
        <div className="flex items-center gap-4">
          <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>Seed: {seed}</span>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>Catalog: 2026-08-24</span>
          <span>Deterministic simulation</span>
        </div>
      </footer>

      {/* Single Finding Dry Run Simulation Modal */}
      <DryRunModal
        finding={activeDryRunFinding}
        isOpen={Boolean(activeDryRunFinding)}
        onClose={handleCloseModal}
        onApplyPlan={handleApplyFinding}
      />

      {/* Batched Dry Run Simulation Modal */}
      <BatchDryRunModal
        findings={batchDryRunFindings || []}
        isOpen={Boolean(batchDryRunFindings && batchDryRunFindings.length > 0)}
        onClose={handleCloseBatchModal}
        onConfirmBatch={handleConfirmBatchApply}
      />
    </div>
  );
}
