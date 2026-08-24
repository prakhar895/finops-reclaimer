export type ResourceKind =
  | 'ec2'
  | 'ebs'
  | 'rds'
  | 'eip'
  | 'nat'
  | 'alb'
  | 'snapshot';

export interface ResourceMetrics {
  /** Consecutive days the resource has met its idleness condition. */
  idleDays: number;
  /** 14-day average CPU utilisation, percent. */
  avgCpuPct?: number;
  /** 14-day peak CPU utilisation, percent. */
  peakCpuPct?: number;
  /** Average bytes in+out per day. */
  networkBytesPerDay?: number;
  /** For RDS: peak concurrent connections over the window. */
  peakConnections?: number;
  /** For EBS: average IOPS over the window. */
  avgIops?: number;
  /** For ALB: healthy targets currently registered. */
  healthyTargets?: number;
}

export interface Resource {
  id: string;
  name: string;
  kind: ResourceKind;
  region: string;
  account: string;
  /** EC2 / RDS instance type, e.g. 'm5.xlarge'. */
  instanceType?: string;
  /** EBS volume type, e.g. 'gp3'. */
  volumeType?: string;
  sizeGb?: number;
  attached?: boolean;
  /** Snapshot only: does the volume it was taken from still exist? */
  sourceVolumeExists?: boolean;
  ageDays: number;
  tags: Record<string, string>;
  metrics: ResourceMetrics;
}

export type Action =
  | 'delete-volume'
  | 'terminate-instance'
  | 'rightsize-instance'
  | 'schedule-off-hours'
  | 'stop-database'
  | 'release-address'
  | 'delete-snapshot'
  | 'delete-load-balancer'
  | 'delete-nat-gateway';

/**
 * Confidence is about blast radius, not statistical certainty:
 *   safe   - reversible or provably unused; fine to batch
 *   review - plausible but needs a human to confirm intent
 *   risky  - a guardrail tripped; never auto-apply
 */
export type Confidence = 'safe' | 'review' | 'risky';

export interface Finding {
  ruleId: string;
  resource: Resource;
  action: Action;
  confidence: Confidence;
  /** Current run-rate for this resource, USD/month. */
  monthlyCostUsd: number;
  /** What the action recovers, USD/month. */
  monthlySavingUsd: number;
  /** One line a human can read in a card header. */
  summary: string;
  /** The specific facts the rule fired on. Shown as chips in the UI. */
  evidence: string[];
  /** Reasons this was downgraded from `safe`. Empty when nothing tripped. */
  guardrails: string[];
  /** Steps a real implementation would run, in order. Powers the dry-run modal. */
  plan: string[];
}

export interface Policy {
  /** Days a resource must stay idle before it's eligible. */
  idleDayThreshold: number;
  /** Average CPU below this counts as idle. */
  cpuIdlePct: number;
  /** Peak CPU must fit in the smaller size with this much headroom, e.g. 1.5 = 50%. */
  rightsizeHeadroom: number;
  /** Snapshots older than this with no source volume are eligible. */
  snapshotAgeDays: number;
  /** Findings below this saving are dropped as noise. */
  minMonthlySavingUsd: number;
  /** Tag key -> values that make a resource protected. Case-insensitive. */
  protectedTags: Record<string, string[]>;
  /** Hours per week a scheduled non-prod instance stays on. 168 = always on. */
  offHoursWeeklyRuntime: number;
}

export const DEFAULT_POLICY: Policy = {
  idleDayThreshold: 30,
  cpuIdlePct: 5,
  rightsizeHeadroom: 1.5,
  snapshotAgeDays: 90,
  minMonthlySavingUsd: 1,
  protectedTags: {
    Environment: ['prod', 'production'],
    'aws:cloudformation:stack-name': ['*'],
    DoNotDelete: ['*'],
  },
  offHoursWeeklyRuntime: 60, // 12h x 5 weekdays
};
