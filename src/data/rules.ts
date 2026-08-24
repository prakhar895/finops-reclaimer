/**
 * The recommendation engine.
 *
 * Every rule is a pure function: (Resource, Policy) -> Finding | null.
 * Nothing here is a language model. A recommendation is produced when a
 * resource matches a declarative condition, which is how real FinOps tooling
 * (Cloud Custodian, Trusted Advisor, Komiser) actually works.
 *
 * Two properties this file is built to have, because both come up in interviews:
 *   1. Deterministic. Same inventory + same policy => byte-identical findings.
 *   2. Explainable. Every finding carries the evidence it fired on, so the UI
 *      never has to invent a justification.
 */

import {
  EC2_CATALOG,
  HOURLY_SERVICES,
  RDS_CATALOG,
  monthlyFromHourly,
  monthlyFromStorage,
  stepDown,
} from './pricing';
import type { Confidence, Finding, Policy, Resource } from '../types';

// ---------------------------------------------------------------------------
// Guardrails
// ---------------------------------------------------------------------------

/**
 * Returns the human-readable reasons this resource should not be touched
 * automatically. An empty array means nothing tripped.
 */
export function checkGuardrails(resource: Resource, policy: Policy): string[] {
  const tripped: string[] = [];

  for (const [key, values] of Object.entries(policy.protectedTags)) {
    const actual = findTagValue(resource.tags, key);
    if (actual === undefined) continue;
    const matchesAny =
      values.includes('*') ||
      values.some((v) => v.toLowerCase() === actual.toLowerCase());
    if (matchesAny) {
      tripped.push(
        values.includes('*')
          ? `Carries protected tag ${key}`
          : `Tagged ${key}=${actual}`,
      );
    }
  }

  if (resource.ageDays < 7) {
    tripped.push('Created less than 7 days ago');
  }

  return tripped;
}

function findTagValue(
  tags: Record<string, string>,
  key: string,
): string | undefined {
  const hit = Object.keys(tags).find(
    (k) => k.toLowerCase() === key.toLowerCase(),
  );
  return hit ? tags[hit] : undefined;
}

function grade(guardrails: string[], base: Confidence): Confidence {
  return guardrails.length > 0 ? 'risky' : base;
}

function usd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function days(n: number): string {
  return `${n} day${n === 1 ? '' : 's'}`;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

type Rule = (r: Resource, p: Policy) => Finding | null;

/** Unattached EBS volumes bill in full while doing nothing. The classic one. */
const unattachedVolume: Rule = (r, p) => {
  if (r.kind !== 'ebs' || r.attached !== false) return null;
  if (r.metrics.idleDays < p.idleDayThreshold) return null;

  const cost = monthlyFromStorage(r.sizeGb ?? 0, r.volumeType ?? 'gp3', r.region);
  const guardrails = checkGuardrails(r, p);

  return {
    ruleId: 'ebs-unattached',
    resource: r,
    action: 'delete-volume',
    confidence: grade(guardrails, 'safe'),
    monthlyCostUsd: cost,
    monthlySavingUsd: cost,
    summary: `Unattached for ${days(r.metrics.idleDays)}, billing at full rate`,
    evidence: [
      'Not attached to any instance',
      `${r.sizeGb} GB ${r.volumeType}`,
      `Idle ${days(r.metrics.idleDays)}`,
      `${r.metrics.avgIops ?? 0} average IOPS`,
    ],
    guardrails,
    plan: [
      'Take a final snapshot and tag it with the deletion ticket',
      'Verify no CloudFormation or Terraform state references the volume',
      'Detach confirmation (no-op — already unattached)',
      'Delete the volume',
      'Retain the snapshot 30 days, then expire via lifecycle policy',
    ],
  };
};

/** Instances that are up but doing nothing. */
const idleInstance: Rule = (r, p) => {
  if (r.kind !== 'ec2' || !r.instanceType) return null;
  const { avgCpuPct = 100, networkBytesPerDay = Infinity, idleDays } = r.metrics;
  if (avgCpuPct >= p.cpuIdlePct) return null;
  if (networkBytesPerDay > 5_000_000) return null; // ~5 MB/day of chatter
  if (idleDays < p.idleDayThreshold) return null;

  const spec = EC2_CATALOG[r.instanceType];
  if (!spec) return null;
  const cost = monthlyFromHourly(spec.hourlyUsd, r.region);
  const guardrails = checkGuardrails(r, p);

  return {
    ruleId: 'ec2-idle',
    resource: r,
    action: 'terminate-instance',
    confidence: grade(guardrails, 'review'),
    monthlyCostUsd: cost,
    monthlySavingUsd: cost,
    summary: `No meaningful CPU or network for ${days(idleDays)}`,
    evidence: [
      `${avgCpuPct.toFixed(1)}% average CPU over 14 days`,
      `${(networkBytesPerDay / 1_000_000).toFixed(2)} MB/day network`,
      `${r.instanceType} — ${spec.vcpu} vCPU, ${spec.memGiB} GiB`,
      `Running ${days(r.ageDays)}`,
    ],
    guardrails,
    plan: [
      'Notify the owner tag and wait 72 hours for objection',
      'Create an AMI so the instance can be rebuilt',
      'Stop the instance and hold for 7 days',
      'Terminate if no one reports an impact',
    ],
  };
};

/** Instances that are used, but sized for a load that never arrived. */
const oversizedInstance: Rule = (r, p) => {
  if (r.kind !== 'ec2' || !r.instanceType) return null;
  const { peakCpuPct, avgCpuPct = 0 } = r.metrics;
  if (peakCpuPct === undefined) return null;
  if (avgCpuPct < p.cpuIdlePct) return null; // idle rule owns this case

  const smaller = stepDown(r.instanceType, EC2_CATALOG);
  if (!smaller) return null;

  const current = EC2_CATALOG[r.instanceType];
  const target = EC2_CATALOG[smaller];
  // Halving vCPU roughly doubles utilisation. Require headroom after the move.
  const projectedPeak = peakCpuPct * (current.vcpu / target.vcpu);
  if (projectedPeak * p.rightsizeHeadroom > 100) return null;

  const currentCost = monthlyFromHourly(current.hourlyUsd, r.region);
  const targetCost = monthlyFromHourly(target.hourlyUsd, r.region);
  const guardrails = checkGuardrails(r, p);

  return {
    ruleId: 'ec2-oversized',
    resource: r,
    action: 'rightsize-instance',
    confidence: grade(guardrails, 'review'),
    monthlyCostUsd: currentCost,
    monthlySavingUsd: currentCost - targetCost,
    summary: `Peak load fits ${smaller} with ${p.rightsizeHeadroom}x headroom`,
    evidence: [
      `${peakCpuPct.toFixed(1)}% peak CPU on ${r.instanceType}`,
      `Projected ${projectedPeak.toFixed(1)}% peak on ${smaller}`,
      `${usd(currentCost)}/mo → ${usd(targetCost)}/mo`,
    ],
    guardrails,
    plan: [
      `Confirm ${smaller} supports the same EBS and network baseline`,
      'Schedule a maintenance window — resize requires a stop/start',
      'Resize and start',
      'Watch CPU and latency for 48 hours; roll back if p99 regresses',
    ],
  };
};

/** Non-production compute billed for 168 h/week when nobody works nights. */
const alwaysOnNonProd: Rule = (r, p) => {
  if (r.kind !== 'ec2' || !r.instanceType) return null;
  if (p.offHoursWeeklyRuntime >= 168) return null;

  const env = findTagValue(r.tags, 'Environment')?.toLowerCase();
  const isNonProd =
    env !== undefined && ['dev', 'development', 'staging', 'test', 'qa'].includes(env);
  if (!isNonProd) return null;
  if (findTagValue(r.tags, 'Schedule') !== undefined) return null; // already handled
  if ((r.metrics.avgCpuPct ?? 0) < p.cpuIdlePct) return null; // idle rule owns it

  const spec = EC2_CATALOG[r.instanceType];
  if (!spec) return null;
  const cost = monthlyFromHourly(spec.hourlyUsd, r.region);
  const reduction = 1 - p.offHoursWeeklyRuntime / 168;
  const guardrails = checkGuardrails(r, p);

  return {
    ruleId: 'ec2-schedule',
    resource: r,
    action: 'schedule-off-hours',
    confidence: grade(guardrails, 'safe'),
    monthlyCostUsd: cost,
    monthlySavingUsd: cost * reduction,
    summary: `${env} instance runs 168 h/week, used ~${p.offHoursWeeklyRuntime} h`,
    evidence: [
      `Tagged Environment=${env}`,
      `No Schedule tag present`,
      `${p.offHoursWeeklyRuntime} h/week target = ${(reduction * 100).toFixed(0)}% reduction`,
    ],
    guardrails,
    plan: [
      'Apply Schedule=weekday-0800-2000 tag',
      'Let the scheduler Lambda pick it up on the next run',
      'Publish the opt-out procedure to the owning team',
    ],
  };
};

/** Databases with no client has ever connected during the window. */
const idleDatabase: Rule = (r, p) => {
  if (r.kind !== 'rds' || !r.instanceType) return null;
  if ((r.metrics.peakConnections ?? 1) > 0) return null;
  if (r.metrics.idleDays < p.idleDayThreshold) return null;

  const spec = RDS_CATALOG[r.instanceType];
  if (!spec) return null;
  const cost = monthlyFromHourly(spec.hourlyUsd, r.region);
  const guardrails = checkGuardrails(r, p);

  return {
    ruleId: 'rds-idle',
    resource: r,
    action: 'stop-database',
    confidence: grade(guardrails, 'review'),
    monthlyCostUsd: cost,
    // RDS keeps billing storage while stopped, and auto-restarts after 7 days.
    // Model the compute recovery only — roughly 70% of the line item.
    monthlySavingUsd: cost * 0.7,
    summary: `Zero connections for ${days(r.metrics.idleDays)}`,
    evidence: [
      'Peak connections: 0 over the window',
      `${r.instanceType} — ${spec.vcpu} vCPU`,
      `Idle ${days(r.metrics.idleDays)}`,
      'Storage continues to bill while stopped',
    ],
    guardrails,
    plan: [
      'Take a manual snapshot outside the automated retention window',
      'Confirm no scheduled job connects monthly or quarterly',
      'Stop the instance (AWS auto-restarts after 7 days — schedule a re-stop)',
      'If still unused after 30 days, delete with final snapshot',
    ],
  };
};

/** Elastic IPs bill only when they are NOT attached. Small, but pure waste. */
const unattachedAddress: Rule = (r, p) => {
  if (r.kind !== 'eip' || r.attached !== false) return null;

  const cost = monthlyFromHourly(HOURLY_SERVICES.unattachedElasticIp, r.region);
  const guardrails = checkGuardrails(r, p);

  return {
    ruleId: 'eip-unattached',
    resource: r,
    action: 'release-address',
    confidence: grade(guardrails, 'safe'),
    monthlyCostUsd: cost,
    monthlySavingUsd: cost,
    summary: `Reserved but unassociated for ${days(r.metrics.idleDays)}`,
    evidence: [
      'Not associated with an instance or NAT gateway',
      `Held ${days(r.metrics.idleDays)}`,
    ],
    guardrails,
    plan: [
      'Check DNS records and firewall allowlists for the address',
      'Release the allocation',
      'Note: the address cannot be reclaimed once released',
    ],
  };
};

/** Snapshots whose source volume is long gone. */
const orphanedSnapshot: Rule = (r, p) => {
  if (r.kind !== 'snapshot') return null;
  if (r.sourceVolumeExists !== false) return null;
  if (r.ageDays < p.snapshotAgeDays) return null;

  const cost = monthlyFromStorage(r.sizeGb ?? 0, 'snapshot', r.region);
  const guardrails = checkGuardrails(r, p);

  return {
    ruleId: 'snapshot-orphaned',
    resource: r,
    action: 'delete-snapshot',
    confidence: grade(guardrails, 'safe'),
    monthlyCostUsd: cost,
    monthlySavingUsd: cost,
    summary: `Source volume deleted, snapshot kept ${days(r.ageDays)}`,
    evidence: [
      'Source volume no longer exists',
      `${r.sizeGb} GB, ${days(r.ageDays)} old`,
      `Past the ${p.snapshotAgeDays}-day retention policy`,
    ],
    guardrails,
    plan: [
      'Confirm the snapshot is not referenced by a registered AMI',
      'Confirm it is not shared to another account',
      'Delete the snapshot',
    ],
  };
};

/** Load balancers with nothing behind them. */
const emptyLoadBalancer: Rule = (r, p) => {
  if (r.kind !== 'alb') return null;
  if ((r.metrics.healthyTargets ?? 1) > 0) return null;
  if (r.metrics.idleDays < p.idleDayThreshold) return null;

  const cost = monthlyFromHourly(
    HOURLY_SERVICES.applicationLoadBalancer,
    r.region,
  );
  const guardrails = checkGuardrails(r, p);

  return {
    ruleId: 'alb-no-targets',
    resource: r,
    action: 'delete-load-balancer',
    confidence: grade(guardrails, 'review'),
    monthlyCostUsd: cost,
    monthlySavingUsd: cost,
    summary: `No healthy targets registered for ${days(r.metrics.idleDays)}`,
    evidence: [
      '0 healthy targets in all target groups',
      `${(r.metrics.networkBytesPerDay ?? 0) / 1000} KB/day processed`,
      `Idle ${days(r.metrics.idleDays)}`,
    ],
    guardrails,
    plan: [
      'Check Route 53 aliases pointing at the load balancer DNS name',
      'Delete listeners, then the load balancer',
      'Delete the orphaned target groups',
    ],
  };
};

export const RULES: Rule[] = [
  unattachedVolume,
  idleInstance,
  oversizedInstance,
  alwaysOnNonProd,
  idleDatabase,
  unattachedAddress,
  orphanedSnapshot,
  emptyLoadBalancer,
];

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/** Run-rate for any resource, whether or not a rule fired on it. */
export function resourceMonthlyCost(r: Resource): number {
  switch (r.kind) {
    case 'ec2': {
      const spec = r.instanceType ? EC2_CATALOG[r.instanceType] : undefined;
      return spec ? monthlyFromHourly(spec.hourlyUsd, r.region) : 0;
    }
    case 'rds': {
      const spec = r.instanceType ? RDS_CATALOG[r.instanceType] : undefined;
      return spec ? monthlyFromHourly(spec.hourlyUsd, r.region) : 0;
    }
    case 'ebs':
      return monthlyFromStorage(r.sizeGb ?? 0, r.volumeType ?? 'gp3', r.region);
    case 'snapshot':
      return monthlyFromStorage(r.sizeGb ?? 0, 'snapshot', r.region);
    case 'eip':
      return r.attached
        ? 0
        : monthlyFromHourly(HOURLY_SERVICES.unattachedElasticIp, r.region);
    case 'nat':
      return monthlyFromHourly(HOURLY_SERVICES.natGateway, r.region);
    case 'alb':
      return monthlyFromHourly(
        HOURLY_SERVICES.applicationLoadBalancer,
        r.region,
      );
    default:
      return 0;
  }
}

export interface EvaluationResult {
  findings: Finding[];
  totalMonthlySavingUsd: number;
  /** Savings available without a human decision. */
  safeMonthlySavingUsd: number;
  blockedByGuardrails: number;
  /** Total run-rate of the whole inventory, USD/month. */
  fleetMonthlySpendUsd: number;
  /**
   * Share of total fleet spend that is NOT flagged as recoverable, 0-100.
   * This is the "efficiency score" — defined, not vibed.
   */
  efficiencyScore: number;
  countsByAction: Record<string, number>;
}

export function evaluate(
  inventory: Resource[],
  policy: Policy,
): EvaluationResult {
  const findings: Finding[] = [];

  for (const resource of inventory) {
    for (const rule of RULES) {
      const finding = rule(resource, policy);
      if (!finding) continue;
      if (finding.monthlySavingUsd < policy.minMonthlySavingUsd) continue;
      findings.push(finding);
      break; // one finding per resource — highest-priority rule wins
    }
  }

  findings.sort((a, b) => b.monthlySavingUsd - a.monthlySavingUsd);

  const totalMonthlySavingUsd = sum(findings.map((f) => f.monthlySavingUsd));
  const safeMonthlySavingUsd = sum(
    findings.filter((f) => f.confidence === 'safe').map((f) => f.monthlySavingUsd),
  );
  const fleetMonthlySpendUsd = sum(inventory.map(resourceMonthlyCost));

  const countsByAction: Record<string, number> = {};
  for (const f of findings) {
    countsByAction[f.action] = (countsByAction[f.action] ?? 0) + 1;
  }

  return {
    findings,
    totalMonthlySavingUsd,
    safeMonthlySavingUsd,
    blockedByGuardrails: findings.filter((f) => f.guardrails.length > 0).length,
    fleetMonthlySpendUsd,
    efficiencyScore:
      fleetMonthlySpendUsd > 0
        ? Math.round(
            (1 - totalMonthlySavingUsd / fleetMonthlySpendUsd) * 100,
          )
        : 100,
    countsByAction,
  };
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}
