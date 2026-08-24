/**
 * AWS on-demand price catalog (Linux, us-east-1, no commitment).
 *
 * IMPORTANT: These are indicative list rates captured for demo purposes.
 * Before you publish this repo, re-check every number against:
 *   https://aws.amazon.com/ec2/pricing/on-demand/
 *   https://aws.amazon.com/ebs/pricing/
 *   https://aws.amazon.com/rds/mysql/pricing/
 * and update LAST_VERIFIED. A reviewer who spot-checks one rate and finds it
 * stale will assume the rest is invented too. Being able to say "verified on
 * <date> against the public price list" is a large part of this project's value.
 */

export const LAST_VERIFIED = '2026-08-24';
export const HOURS_PER_MONTH = 730;

export interface InstanceSpec {
  family: string;
  size: string;
  vcpu: number;
  memGiB: number;
  hourlyUsd: number;
}

/** Ordered smallest -> largest within each family, so rightsizing can step down. */
export const EC2_CATALOG: Record<string, InstanceSpec> = {
  't3.small':    { family: 't3', size: 'small',   vcpu: 2,  memGiB: 2,   hourlyUsd: 0.0208 },
  't3.medium':   { family: 't3', size: 'medium',  vcpu: 2,  memGiB: 4,   hourlyUsd: 0.0416 },
  't3.large':    { family: 't3', size: 'large',   vcpu: 2,  memGiB: 8,   hourlyUsd: 0.0832 },
  't3.xlarge':   { family: 't3', size: 'xlarge',  vcpu: 4,  memGiB: 16,  hourlyUsd: 0.1664 },
  'm5.large':    { family: 'm5', size: 'large',   vcpu: 2,  memGiB: 8,   hourlyUsd: 0.096  },
  'm5.xlarge':   { family: 'm5', size: 'xlarge',  vcpu: 4,  memGiB: 16,  hourlyUsd: 0.192  },
  'm5.2xlarge':  { family: 'm5', size: '2xlarge', vcpu: 8,  memGiB: 32,  hourlyUsd: 0.384  },
  'm5.4xlarge':  { family: 'm5', size: '4xlarge', vcpu: 16, memGiB: 64,  hourlyUsd: 0.768  },
  'c5.large':    { family: 'c5', size: 'large',   vcpu: 2,  memGiB: 4,   hourlyUsd: 0.085  },
  'c5.xlarge':   { family: 'c5', size: 'xlarge',  vcpu: 4,  memGiB: 8,   hourlyUsd: 0.17   },
  'c5.2xlarge':  { family: 'c5', size: '2xlarge', vcpu: 8,  memGiB: 16,  hourlyUsd: 0.34   },
  'r5.large':    { family: 'r5', size: 'large',   vcpu: 2,  memGiB: 16,  hourlyUsd: 0.126  },
  'r5.xlarge':   { family: 'r5', size: 'xlarge',  vcpu: 4,  memGiB: 32,  hourlyUsd: 0.252  },
  'r5.2xlarge':  { family: 'r5', size: '2xlarge', vcpu: 8,  memGiB: 64,  hourlyUsd: 0.504  },
};

export const RDS_CATALOG: Record<string, InstanceSpec> = {
  'db.t3.medium':  { family: 'db.t3', size: 'medium',  vcpu: 2, memGiB: 4,  hourlyUsd: 0.068 },
  'db.t3.large':   { family: 'db.t3', size: 'large',   vcpu: 2, memGiB: 8,  hourlyUsd: 0.136 },
  'db.m5.large':   { family: 'db.m5', size: 'large',   vcpu: 2, memGiB: 8,  hourlyUsd: 0.171 },
  'db.m5.xlarge':  { family: 'db.m5', size: 'xlarge',  vcpu: 4, memGiB: 16, hourlyUsd: 0.342 },
  'db.m5.2xlarge': { family: 'db.m5', size: '2xlarge', vcpu: 8, memGiB: 32, hourlyUsd: 0.684 },
  'db.r5.large':   { family: 'db.r5', size: 'large',   vcpu: 2, memGiB: 16, hourlyUsd: 0.24  },
  'db.r5.xlarge':  { family: 'db.r5', size: 'xlarge',  vcpu: 4, memGiB: 32, hourlyUsd: 0.48  },
};

/** Storage, per GB-month. */
export const STORAGE_USD_PER_GB_MONTH: Record<string, number> = {
  gp2: 0.10,
  gp3: 0.08,
  io1: 0.125,
  io2: 0.125,
  st1: 0.045,
  sc1: 0.015,
  snapshot: 0.05,
};

/** Flat-rate hourly services. */
export const HOURLY_SERVICES = {
  unattachedElasticIp: 0.005,
  natGateway: 0.045,
  applicationLoadBalancer: 0.0225,
} as const;

/**
 * Rough regional uplift vs us-east-1. Real AWS pricing varies per SKU, not by a
 * single multiplier — this is a documented simplification, and the README says so.
 */
export const REGION_MULTIPLIER: Record<string, number> = {
  'us-east-1': 1.0,
  'us-west-2': 1.0,
  'eu-west-1': 1.09,
  'eu-central-1': 1.13,
  'ap-south-1': 0.94,
  'ap-southeast-1': 1.16,
  'sa-east-1': 1.45,
};

export function monthlyFromHourly(hourlyUsd: number, region: string): number {
  const mult = REGION_MULTIPLIER[region] ?? 1.0;
  return hourlyUsd * HOURS_PER_MONTH * mult;
}

export function monthlyFromStorage(
  gb: number,
  volumeType: string,
  region: string,
): number {
  const rate = STORAGE_USD_PER_GB_MONTH[volumeType] ?? STORAGE_USD_PER_GB_MONTH.gp3;
  const mult = REGION_MULTIPLIER[region] ?? 1.0;
  return gb * rate * mult;
}

/** Next size down in the same family, or null if already smallest. */
export function stepDown(
  instanceType: string,
  catalog: Record<string, InstanceSpec> = EC2_CATALOG,
): string | null {
  const spec = catalog[instanceType];
  if (!spec) return null;
  const siblings = Object.entries(catalog)
    .filter(([, s]) => s.family === spec.family)
    .sort((a, b) => a[1].vcpu - b[1].vcpu);
  const idx = siblings.findIndex(([name]) => name === instanceType);
  return idx > 0 ? siblings[idx - 1][0] : null;
}
