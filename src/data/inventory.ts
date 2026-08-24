/**
 * Deterministic synthetic inventory.
 *
 * A fixed seed means the demo is reproducible — anyone who opens the live URL
 * sees the same numbers you screenshotted — while the generator still produces
 * a realistic spread rather than three hand-written cards. Change the seed in
 * the UI to reshuffle the fleet and watch the recommendations move.
 */

import { EC2_CATALOG, RDS_CATALOG } from './pricing';
import type { Resource, ResourceKind } from '../types';

/** mulberry32 — small, fast, seedable. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REGIONS = ['us-east-1', 'eu-west-1', 'ap-south-1', 'us-west-2'];
const ACCOUNTS = ['platform-prod', 'platform-nonprod', 'data-eng', 'sandbox'];
const TEAMS = ['payments', 'search', 'identity', 'analytics', 'growth'];
const ENVS = ['prod', 'staging', 'dev', 'test'];

const SERVICE_WORDS = [
  'ingest', 'worker', 'gateway', 'indexer', 'batch', 'replica',
  'bastion', 'runner', 'cache', 'etl', 'reporting', 'legacy',
];

export interface GeneratorOptions {
  seed?: number;
  count?: number;
  /** Roughly what fraction of the fleet should be wasteful. */
  wasteRate?: number;
}

export function generateInventory(opts: GeneratorOptions = {}): Resource[] {
  const { seed = 20260824, count = 48, wasteRate = 0.45 } = opts;
  const rand = rng(seed);

  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
  const intBetween = (lo: number, hi: number) => Math.floor(between(lo, hi + 1));
  /**
   * Idle durations in a real fleet are long-tailed: lots of recently-abandoned
   * things, a few ancient ones. Squaring a uniform draw biases low, which also
   * makes the idle-threshold slider responsive across its useful range instead
   * of only at the extremes.
   */
  const skewedDays = (lo: number, hi: number) =>
    Math.floor(lo + Math.pow(rand(), 2) * (hi - lo));
  const hex = (n: number) =>
    Array.from({ length: n }, () => '0123456789abcdef'[intBetween(0, 15)]).join('');

  const kindWeights: [ResourceKind, number][] = [
    ['ec2', 0.34],
    ['ebs', 0.26],
    ['snapshot', 0.13],
    ['rds', 0.11],
    ['eip', 0.08],
    ['alb', 0.05],
    ['nat', 0.03],
  ];

  const pickKind = (): ResourceKind => {
    const roll = rand();
    let acc = 0;
    for (const [kind, w] of kindWeights) {
      acc += w;
      if (roll <= acc) return kind;
    }
    return 'ec2';
  };

  const out: Resource[] = [];

  for (let i = 0; i < count; i++) {
    const kind = pickKind();
    const wasteful = rand() < wasteRate;
    const region = pick(REGIONS);
    const env = pick(ENVS);
    const team = pick(TEAMS);
    const ageDays = intBetween(12, 620);

    const tags: Record<string, string> = {
      Environment: env,
      Team: team,
      Owner: `${team}@example.com`,
    };
    // A minority carry a hard protection tag, so guardrails actually fire.
    if (rand() < 0.12) tags.DoNotDelete = 'true';
    if (rand() < 0.18) tags.CostCenter = `CC-${intBetween(1000, 9999)}`;

    const base = {
      region,
      account: pick(ACCOUNTS),
      ageDays,
      tags,
    };

    switch (kind) {
      case 'ec2': {
        const instanceType = pick(Object.keys(EC2_CATALOG));
        // Three archetypes: idle, oversized, healthy.
        const archetype = wasteful ? (rand() < 0.45 ? 'idle' : 'oversized') : 'healthy';
        const avgCpuPct =
          archetype === 'idle' ? between(0.1, 3.9)
          : archetype === 'oversized' ? between(6, 14)
          : between(28, 62);
        const peakCpuPct =
          archetype === 'idle' ? between(4, 9)
          : archetype === 'oversized' ? between(15, 24)
          : between(65, 94);
        out.push({
          ...base,
          id: `i-0${hex(16)}`,
          name: `${team}-${pick(SERVICE_WORDS)}-${intBetween(1, 9)}`,
          kind,
          instanceType,
          metrics: {
            avgCpuPct,
            peakCpuPct,
            networkBytesPerDay:
              archetype === 'idle' ? between(0, 3_000_000) : between(2e8, 9e9),
            idleDays: archetype === 'idle' ? skewedDays(4, 260) : 0,
          },
        });
        break;
      }

      case 'ebs': {
        const volumeType = pick(['gp3', 'gp3', 'gp2', 'io1', 'st1']);
        const attached = !wasteful;
        out.push({
          ...base,
          id: `vol-0${hex(16)}`,
          name: `${team}-${pick(SERVICE_WORDS)}-data`,
          kind,
          volumeType,
          sizeGb: pick([50, 100, 200, 250, 500, 500, 1000, 2000]),
          attached,
          metrics: {
            avgIops: attached ? intBetween(40, 3200) : 0,
            idleDays: attached ? 0 : skewedDays(3, 420),
          },
        });
        break;
      }

      case 'snapshot': {
        const orphaned = wasteful;
        const snapAge = orphaned ? intBetween(95, 700) : intBetween(3, 80);
        out.push({
          ...base,
          id: `snap-0${hex(16)}`,
          name: `${team}-backup-${intBetween(1, 40)}`,
          kind,
          sizeGb: pick([40, 80, 150, 300, 500, 900]),
          sourceVolumeExists: !orphaned,
          ageDays: snapAge,
          metrics: { idleDays: snapAge },
        });
        break;
      }

      case 'rds': {
        const instanceType = pick(Object.keys(RDS_CATALOG));
        const idle = wasteful && rand() < 0.6;
        out.push({
          ...base,
          id: `db-${hex(10)}`,
          name: `${team}-${pick(['primary', 'replica', 'reporting', 'legacy'])}`,
          kind,
          instanceType,
          metrics: {
            peakConnections: idle ? 0 : intBetween(4, 180),
            idleDays: idle ? skewedDays(5, 300) : 0,
          },
        });
        break;
      }

      case 'eip': {
        const attached = !wasteful;
        out.push({
          ...base,
          id: `eipalloc-0${hex(14)}`,
          name: `${team}-egress-${intBetween(1, 6)}`,
          kind,
          attached,
          metrics: { idleDays: attached ? 0 : skewedDays(2, 320) },
        });
        break;
      }

      case 'alb': {
        const empty = wasteful;
        out.push({
          ...base,
          id: `arn:aws:elb:${region}:alb/${hex(8)}`,
          name: `${team}-${pick(['public', 'internal'])}-lb`,
          kind,
          metrics: {
            healthyTargets: empty ? 0 : intBetween(2, 12),
            networkBytesPerDay: empty ? between(0, 40_000) : between(1e8, 4e10),
            idleDays: empty ? skewedDays(4, 240) : 0,
          },
        });
        break;
      }

      case 'nat': {
        out.push({
          ...base,
          id: `nat-0${hex(14)}`,
          name: `${team}-nat-${pick(['a', 'b', 'c'])}`,
          kind,
          metrics: {
            networkBytesPerDay: wasteful ? between(0, 500_000) : between(1e9, 8e10),
            idleDays: wasteful ? skewedDays(4, 200) : 0,
          },
        });
        break;
      }
    }
  }

  return out;
}
