import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  ReferenceLine,
  Tooltip,
} from 'recharts';
import type { Policy, Resource } from '../types';
import { evaluate } from '../data/rules';

export interface KpiStripProps {
  recoverableMonthlyUsd: number;
  fleetSpendMonthlyUsd: number;
  efficiencyScore: number;
  findingsCount: number;
  inventory: Resource[];
  policy: Policy;
}

function useAnimatedNumber(targetValue: number, durationMs = 400): number {
  const [displayValue, setDisplayValue] = useState(targetValue);
  const startValRef = useRef(targetValue);
  const targetValRef = useRef(targetValue);
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    targetValRef.current = targetValue;
    startValRef.current = displayValue;
    startTimeRef.current = null;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion || Math.abs(displayValue - targetValue) < 0.01) {
      setDisplayValue(targetValue);
      return;
    }

    const animate = (timestamp: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp;
      }
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(1, elapsed / durationMs);

      // Ease-out cubic
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = startValRef.current + (targetValRef.current - startValRef.current) * easeOut;

      setDisplayValue(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(targetValRef.current);
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [targetValue]);

  return displayValue;
}

export const KpiStrip: React.FC<KpiStripProps> = ({
  recoverableMonthlyUsd,
  fleetSpendMonthlyUsd,
  efficiencyScore,
  findingsCount,
  inventory,
  policy,
}) => {
  const animatedRecoverable = useAnimatedNumber(recoverableMonthlyUsd, 400);

  const formattedRecoverable = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(animatedRecoverable);

  const formattedSpend = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(fleetSpendMonthlyUsd);

  const clampedScore = Math.min(100, Math.max(0, efficiencyScore));

  // Compute sensitivity data across idle threshold range [7, 200]
  const chartData = useMemo(() => {
    const points: Array<{ days: number; savings: number }> = [];
    for (let d = 7; d <= 200; d += 1) {
      const res = evaluate(inventory, {
        ...policy,
        idleDayThreshold: d,
      });
      points.push({
        days: d,
        savings: Math.round(res.totalMonthlySavingUsd),
      });
    }
    return points;
  }, [
    inventory,
    policy.cpuIdlePct,
    policy.rightsizeHeadroom,
    policy.snapshotAgeDays,
    policy.minMonthlySavingUsd,
    policy.protectedTags,
    policy.offHoursWeeklyRuntime,
  ]);

  return (
    <div className="border-b border-hairline bg-surface-level-1 shrink-0 select-none">
      {/* Primary KPI Figure Grid */}
      <div className="grid grid-cols-4 border-b border-hairline">
        <div className="p-4 border-r border-hairline flex flex-col justify-center">
          <div className="font-body-sm text-outline mb-1">Recoverable / month</div>
          <div
            id="recoverable-monthly-figure"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="font-number-lg text-number-lg text-secondary font-medium tracking-tight"
            style={{ fontFamily: "'IBM Plex Mono', monospace" }}
          >
            {formattedRecoverable}
          </div>
        </div>
        <div className="p-4 border-r border-hairline flex flex-col justify-center">
          <div className="font-body-sm text-outline mb-1">Fleet spend</div>
          <div
            className="font-number-lg text-number-lg text-on-surface font-medium tracking-tight"
            style={{ fontFamily: "'IBM Plex Mono', monospace" }}
          >
            {formattedSpend}
          </div>
        </div>
        <div className="p-4 border-r border-hairline flex flex-col justify-center">
          <div className="font-body-sm text-outline mb-1">Efficiency score</div>
          <div
            className="font-number-lg text-number-lg text-[#E0A83B] font-medium tracking-tight"
            style={{ fontFamily: "'IBM Plex Mono', monospace" }}
          >
            {clampedScore}%
          </div>
          <div className="w-full h-[2px] bg-surface mt-1.5 overflow-hidden">
            <div
              className="h-full bg-[#E0A83B] transition-all duration-300"
              style={{ width: `${clampedScore}%` }}
            />
          </div>
        </div>
        <div className="p-4 flex flex-col justify-center">
          <div className="font-body-sm text-outline mb-1">Findings</div>
          <div
            className="font-number-lg text-number-lg text-on-surface font-medium tracking-tight"
            style={{ fontFamily: "'IBM Plex Mono', monospace" }}
          >
            {findingsCount}
          </div>
        </div>
      </div>

      {/* Subordinate Sensitivity Chart */}
      <div className="px-4 py-2 bg-[#12161d]">
        <div className="flex items-center justify-between mb-1">
          <span className="font-label-caps text-[10px] uppercase tracking-wider text-outline">
            Threshold Sensitivity (7–200d)
          </span>
          <span
            className="font-number-md text-[10px] text-outline"
            style={{ fontFamily: "'IBM Plex Mono', monospace" }}
          >
            Marker: <span className="text-secondary font-medium">{policy.idleDayThreshold}d</span>
          </span>
        </div>
        <div className="h-[120px] w-full">
          <ResponsiveContainer width="100%" height={120}>
            <LineChart
              data={chartData}
              margin={{ top: 8, right: 16, left: 4, bottom: 2 }}
            >
              <XAxis
                dataKey="days"
                domain={[7, 200]}
                type="number"
                axisLine={{ stroke: '#2A303C' }}
                tickLine={false}
                tick={{ fill: '#8A8F98', fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' }}
                tickFormatter={(val: number) => `${val}d`}
                ticks={[7, 50, 100, 150, 200]}
              />
              <YAxis
                domain={['dataMin - 100', 'dataMax + 100']}
                tickCount={3}
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#8A8F98', fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' }}
                tickFormatter={(val: number) => `$${(val / 1000).toFixed(1)}k`}
                width={48}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload as { days: number; savings: number };
                    return (
                      <div
                        className="text-[11px] leading-none select-none pointer-events-none"
                        style={{
                          fontFamily: "'IBM Plex Mono', monospace",
                          backgroundColor: 'transparent',
                          padding: 0,
                          margin: 0,
                          boxShadow: 'none',
                          border: 'none',
                        }}
                      >
                        <span className="text-[#8A8F98]">{data.days}d: </span>
                        <span className="text-[#E0A83B] font-medium">${data.savings.toLocaleString()}</span>
                      </div>
                    );
                  }
                  return null;
                }}
                cursor={{ stroke: '#2A303C', strokeWidth: 1 }}
              />
              <ReferenceLine
                x={policy.idleDayThreshold}
                stroke="#E0A83B"
                strokeWidth={1.5}
              />
              <Line
                type="monotone"
                dataKey="savings"
                stroke="#E0A83B"
                strokeWidth={1.5}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
