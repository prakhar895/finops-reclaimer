import React from 'react';
import { Policy } from '../types';

export interface PolicyRailProps {
  policy: Policy;
  onChange: (policy: Policy) => void;
  seed: number;
  onSeedChange: (seed: number) => void;
  inventoryCount: number;
  selectedRegions: string[];
  onToggleRegion: (region: string) => void;
  selectedResourceTypes: string[];
  onToggleResourceType: (kind: string) => void;
}

const REGIONS = ['us-east-1', 'eu-west-1', 'ap-south-1', 'us-west-2'];
const RESOURCE_TYPES: { id: string; label: string }[] = [
  { id: 'ec2', label: 'EC2 Instances' },
  { id: 'ebs', label: 'EBS Volumes' },
  { id: 'rds', label: 'RDS Databases' },
  { id: 'snapshot', label: 'EBS Snapshots' },
  { id: 'eip', label: 'Elastic IPs' },
  { id: 'alb', label: 'Load Balancers' },
  { id: 'nat', label: 'NAT Gateways' },
];

export const PolicyRail: React.FC<PolicyRailProps> = ({
  policy,
  onChange,
  seed,
  onSeedChange,
  inventoryCount,
  selectedRegions,
  onToggleRegion,
  selectedResourceTypes,
  onToggleResourceType,
}) => {
  // Headroom in policy: 1.5 -> 50%
  const headroomPercent = Math.round((policy.rightsizeHeadroom - 1) * 100);

  const handleSliderChange = (
    key: keyof Pick<
      Policy,
      'idleDayThreshold' | 'cpuIdlePct' | 'snapshotAgeDays' | 'offHoursWeeklyRuntime'
    >,
    val: number
  ) => {
    onChange({
      ...policy,
      [key]: val,
    });
  };

  const handleHeadroomChange = (val: number) => {
    onChange({
      ...policy,
      rightsizeHeadroom: Number((1 + val / 100).toFixed(2)),
    });
  };

  const handleRandomSeed = () => {
    const nextSeed = Math.floor(Math.random() * 90000000) + 10000000;
    onSeedChange(nextSeed);
  };

  return (
    <aside
      aria-label="Policy Controls and Scope Filters"
      className="policy-rail-aside fixed left-0 top-0 h-[calc(100vh-24px)] w-[240px] border-r border-hairline bg-surface-container-low flex flex-col z-10 select-none overflow-hidden"
    >
      {/* Brand Header */}
      <div className="p-gutter border-b border-hairline shrink-0 bg-surface-container-lowest/30">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="material-symbols-outlined text-secondary text-[22px]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            cloud_done
          </span>
          <h1 className="font-headline-md text-headline-md font-bold tracking-tight text-on-surface uppercase">
            RECLAIM.IO
          </h1>
        </div>
        <div className="font-number-md text-[10px] text-outline tracking-widest uppercase">
          RULE ENGINE · SIMULATED FLEET
        </div>
      </div>

      {/* Scrollable Policy and Scope */}
      <div className="flex-1 overflow-y-auto">
        {/* Policy Sliders */}
        <div className="p-gutter border-b border-hairline">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-label-caps text-label-caps text-outline uppercase tracking-wider">
              Policy Thresholds
            </h2>
            <span className="text-[10px] text-secondary font-number-md">ACTIVE</span>
          </div>

          <div className="space-y-5">
            {/* Idle Threshold */}
            <div>
              <div className="flex justify-between mb-1">
                <label htmlFor="idle-threshold-slider" className="font-body-sm text-on-surface-variant">Idle Threshold</label>
                <span className="font-number-md text-[11px] text-secondary">
                  {policy.idleDayThreshold}d
                </span>
              </div>
              <input
                id="idle-threshold-slider"
                type="range"
                min="1"
                max="90"
                aria-label="Idle Day Threshold"
                value={policy.idleDayThreshold}
                onChange={(e) => handleSliderChange('idleDayThreshold', Number(e.target.value))}
              />
            </div>

            {/* CPU Idle */}
            <div>
              <div className="flex justify-between mb-1">
                <label htmlFor="cpu-idle-slider" className="font-body-sm text-on-surface-variant">CPU Idle Cutoff</label>
                <span className="font-number-md text-[11px] text-secondary">
                  {policy.cpuIdlePct}%
                </span>
              </div>
              <input
                id="cpu-idle-slider"
                type="range"
                min="1"
                max="20"
                aria-label="CPU Idle Cutoff Percentage"
                value={policy.cpuIdlePct}
                onChange={(e) => handleSliderChange('cpuIdlePct', Number(e.target.value))}
              />
            </div>

            {/* Rightsize Headroom */}
            <div>
              <div className="flex justify-between mb-1">
                <label htmlFor="rightsize-headroom-slider" className="font-body-sm text-on-surface-variant">Rightsize Headroom</label>
                <span className="font-number-md text-[11px] text-secondary">
                  {headroomPercent}%
                </span>
              </div>
              <input
                id="rightsize-headroom-slider"
                type="range"
                min="10"
                max="100"
                step="5"
                aria-label="Rightsize Headroom Percentage"
                value={headroomPercent}
                onChange={(e) => handleHeadroomChange(Number(e.target.value))}
              />
            </div>

            {/* Snapshot Retention */}
            <div>
              <div className="flex justify-between mb-1">
                <label htmlFor="snapshot-retention-slider" className="font-body-sm text-on-surface-variant">Snapshot Retention</label>
                <span className="font-number-md text-[11px] text-secondary">
                  {policy.snapshotAgeDays}d
                </span>
              </div>
              <input
                id="snapshot-retention-slider"
                type="range"
                min="14"
                max="180"
                aria-label="Snapshot Retention Days"
                value={policy.snapshotAgeDays}
                onChange={(e) => handleSliderChange('snapshotAgeDays', Number(e.target.value))}
              />
            </div>

            {/* Off-hours schedule */}
            <div>
              <div className="flex justify-between mb-1">
                <label htmlFor="off-hours-runtime-slider" className="font-body-sm text-on-surface-variant">Off-Hours Runtime</label>
                <span className="font-number-md text-[11px] text-secondary">
                  {policy.offHoursWeeklyRuntime}h/wk
                </span>
              </div>
              <input
                id="off-hours-runtime-slider"
                type="range"
                min="20"
                max="168"
                step="4"
                aria-label="Off-Hours Weekly Runtime Hours"
                value={policy.offHoursWeeklyRuntime}
                onChange={(e) => handleSliderChange('offHoursWeeklyRuntime', Number(e.target.value))}
              />
            </div>
          </div>
        </div>

        {/* Scope Checkboxes */}
        <div className="p-gutter border-b border-hairline">
          <h2 className="font-label-caps text-label-caps text-outline uppercase mb-3 tracking-wider">
            Scope Filters
          </h2>
          <div className="space-y-4">
            <div>
              <h3 className="font-body-sm text-on-surface-variant mb-2 text-[11px] uppercase tracking-wider text-outline">
                Regions
              </h3>
              <div className="space-y-1.5">
                {REGIONS.map((reg) => {
                  const isChecked = selectedRegions.includes(reg);
                  return (
                    <label
                      key={reg}
                      className={`flex items-center gap-2 hover:text-on-surface cursor-pointer ${
                        isChecked ? 'text-on-surface' : 'text-outline'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        aria-label={`Filter region ${reg}`}
                        onChange={() => onToggleRegion(reg)}
                      />
                      <span className="font-number-md text-[11px]">{reg}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <h3 className="font-body-sm text-on-surface-variant mb-2 text-[11px] uppercase tracking-wider text-outline">
                Resource Types
              </h3>
              <div className="space-y-1.5">
                {RESOURCE_TYPES.map(({ id, label }) => {
                  const isChecked = selectedResourceTypes.includes(id);
                  return (
                    <label
                      key={id}
                      className={`flex items-center gap-2 hover:text-on-surface cursor-pointer ${
                        isChecked ? 'text-on-surface' : 'text-outline'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        aria-label={`Filter resource kind ${label}`}
                        onChange={() => onToggleResourceType(id)}
                      />
                      <span className="text-body-sm">{label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Fleet Seed Controls */}
        <div className="p-gutter">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-label-caps text-label-caps text-outline uppercase tracking-wider">
              Fleet Seed
            </h2>
            <button
              type="button"
              onClick={handleRandomSeed}
              className="text-[10px] uppercase font-label-caps text-tertiary hover:underline cursor-pointer flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[12px]">casino</span>
              Reshuffle
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="fleet-seed-input"
              type="number"
              aria-label="Simulation Fleet Seed"
              value={seed}
              onChange={(e) => onSeedChange(Number(e.target.value) || 0)}
              className="w-full bg-surface-container border border-hairline px-2 py-1 font-number-md text-[11px] text-on-surface focus:outline-none focus:border-secondary"
            />
          </div>
        </div>
      </div>

      {/* Footer / Reshuffle info */}
      <div className="p-4 border-t border-hairline mt-auto shrink-0 bg-surface-container-lowest/50">
        <button
          type="button"
          onClick={handleRandomSeed}
          className="w-full bg-primary-fixed text-on-primary-fixed font-label-caps text-label-caps py-2 hover:bg-white transition-colors cursor-pointer uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm"
        >
          <span className="material-symbols-outlined text-[14px]">refresh</span>
          Reshuffle Fleet
        </button>
        <div className="mt-3 font-number-md text-[10px] text-outline text-center">
          seed {seed} · {inventoryCount} resources
        </div>
      </div>
    </aside>
  );
};
