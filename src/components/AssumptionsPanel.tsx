import React, { useState, useMemo } from 'react';
import { Finding, Policy } from '../types';
import {
  LAST_VERIFIED,
  EC2_CATALOG,
  RDS_CATALOG,
  STORAGE_USD_PER_GB_MONTH,
  HOURLY_SERVICES,
  REGION_MULTIPLIER,
  stepDown,
} from '../data/pricing';

export interface AssumptionsPanelProps {
  policy: Policy;
  visibleFindings: Finding[];
}

interface RateCardItem {
  id: string;
  resourceType: string;
  unitRate: string;
  source: string;
}

export const AssumptionsPanel: React.FC<AssumptionsPanelProps> = ({
  policy,
  visibleFindings,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  // Derive active rate card entries actually used by currently visible findings
  const rateCardRows = useMemo<RateCardItem[]>(() => {
    const rows: RateCardItem[] = [];
    const seen = new Set<string>();

    const addRow = (item: RateCardItem) => {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        rows.push(item);
      }
    };

    if (visibleFindings.length > 0) {
      for (const finding of visibleFindings) {
        const { kind, instanceType, volumeType } = finding.resource;

        if (kind === 'ec2' && instanceType && EC2_CATALOG[instanceType]) {
          const spec = EC2_CATALOG[instanceType];
          addRow({
            id: `ec2-${instanceType}`,
            resourceType: `EC2 Instance (${instanceType})`,
            unitRate: `$${spec.hourlyUsd.toFixed(4)} / hr`,
            source: 'AWS EC2 On-Demand List (us-east-1)',
          });

          // If rightsizing action, also show the target step-down rate
          if (finding.action === 'rightsize-instance') {
            const smaller = stepDown(instanceType, EC2_CATALOG);
            if (smaller && EC2_CATALOG[smaller]) {
              const targetSpec = EC2_CATALOG[smaller];
              addRow({
                id: `ec2-${smaller}`,
                resourceType: `EC2 Target Rightsize (${smaller})`,
                unitRate: `$${targetSpec.hourlyUsd.toFixed(4)} / hr`,
                source: 'AWS EC2 On-Demand List (us-east-1)',
              });
            }
          }
        } else if (kind === 'ebs') {
          const vType = volumeType ?? 'gp3';
          const rate = STORAGE_USD_PER_GB_MONTH[vType] ?? STORAGE_USD_PER_GB_MONTH.gp3;
          addRow({
            id: `ebs-${vType}`,
            resourceType: `EBS Block Storage (${vType})`,
            unitRate: `$${rate.toFixed(4)} / GB-mo`,
            source: 'AWS EBS List Pricing',
          });
        } else if (kind === 'snapshot') {
          addRow({
            id: 'snapshot-tier',
            resourceType: 'EBS Snapshot Archive/Standard',
            unitRate: `$${STORAGE_USD_PER_GB_MONTH.snapshot.toFixed(4)} / GB-mo`,
            source: 'AWS Snapshot Storage Tier',
          });
        } else if (kind === 'rds' && instanceType && RDS_CATALOG[instanceType]) {
          const spec = RDS_CATALOG[instanceType];
          addRow({
            id: `rds-${instanceType}`,
            resourceType: `RDS Database (${instanceType})`,
            unitRate: `$${spec.hourlyUsd.toFixed(4)} / hr`,
            source: 'AWS RDS Single-AZ On-Demand',
          });
        } else if (kind === 'eip') {
          addRow({
            id: 'eip-unattached',
            resourceType: 'Unassociated Elastic IP',
            unitRate: `$${HOURLY_SERVICES.unattachedElasticIp.toFixed(4)} / hr`,
            source: 'AWS VPC Public IPv4 Pricing',
          });
        } else if (kind === 'alb') {
          addRow({
            id: 'alb-hourly',
            resourceType: 'Application Load Balancer',
            unitRate: `$${HOURLY_SERVICES.applicationLoadBalancer.toFixed(4)} / hr`,
            source: 'AWS Elastic Load Balancing Base',
          });
        } else if (kind === 'nat') {
          addRow({
            id: 'nat-hourly',
            resourceType: 'NAT Gateway',
            unitRate: `$${HOURLY_SERVICES.natGateway.toFixed(4)} / hr`,
            source: 'AWS VPC NAT Gateway Base',
          });
        }
      }
    }

    // Default reference catalog if no findings are visible
    if (rows.length === 0) {
      rows.push(
        {
          id: 'ec2-default',
          resourceType: 'EC2 On-Demand Compute (t3/m5/c5/r5)',
          unitRate: '$0.0208 – $0.7680 / hr',
          source: 'AWS EC2 On-Demand List',
        },
        {
          id: 'ebs-default',
          resourceType: 'EBS Volumes (gp3 / gp2 / io1)',
          unitRate: '$0.0450 – $0.1250 / GB-mo',
          source: 'AWS EBS Storage Pricing',
        },
        {
          id: 'snapshot-default',
          resourceType: 'EBS Snapshots',
          unitRate: `$${STORAGE_USD_PER_GB_MONTH.snapshot.toFixed(4)} / GB-mo`,
          source: 'AWS Snapshot Storage Tier',
        },
        {
          id: 'rds-default',
          resourceType: 'RDS Database Instances (db.t3/db.m5/db.r5)',
          unitRate: '$0.0680 – $0.6840 / hr',
          source: 'AWS RDS Single-AZ On-Demand',
        },
        {
          id: 'eip-default',
          resourceType: 'Unassociated Elastic IP',
          unitRate: `$${HOURLY_SERVICES.unattachedElasticIp.toFixed(4)} / hr`,
          source: 'AWS VPC IPv4 List Pricing',
        },
        {
          id: 'alb-default',
          resourceType: 'Application Load Balancer',
          unitRate: `$${HOURLY_SERVICES.applicationLoadBalancer.toFixed(4)} / hr`,
          source: 'AWS Elastic Load Balancing',
        }
      );
    }

    return rows;
  }, [visibleFindings]);

  // Copy policy JSON handler
  const handleCopyPolicy = () => {
    const formatted = JSON.stringify(policy, null, 2);
    navigator.clipboard.writeText(formatted).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Region multiplier summary line
  const regionMultiplierSummary = useMemo(() => {
    return Object.entries(REGION_MULTIPLIER)
      .map(([region, mult]) => `${region}: ${mult.toFixed(2)}x`)
      .join(' · ');
  }, []);

  return (
    <section
      aria-label="Audit Assumptions Panel"
      className="border-t border-hairline bg-[#151A21] shrink-0"
    >
      {/* Collapsible Trigger Header */}
      <button
        type="button"
        id="assumptions-toggle-btn"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-gutter py-2.5 bg-surface-level-1 hover:bg-[#202731] transition-colors cursor-pointer text-left border-b border-hairline"
      >
        <div className="flex items-center gap-2">
          <span className="font-number-md text-[11px] text-outline" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
            {isExpanded ? '[-]' : '[+]'}
          </span>
          <span className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface">
            Assumptions & Audit Baseline
          </span>
          <span className="font-number-md text-[10px] text-outline ml-2" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
            ({rateCardRows.length} {rateCardRows.length === 1 ? 'rate entry' : 'rate entries'} · verified {LAST_VERIFIED})
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-label-caps text-[10px] text-outline uppercase tracking-wider">
            {isExpanded ? 'Hide Reference' : 'Show Reference'}
          </span>
          <span
            className="material-symbols-outlined text-[16px] text-outline transition-transform duration-150"
            style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            expand_more
          </span>
        </div>
      </button>

      {/* Expanded Audit Reference Section */}
      {isExpanded && (
        <div className="p-gutter space-y-5 bg-[#10141a] text-on-surface border-b border-hairline select-text">
          {/* Rate Card Table */}
          <div>
            <div className="flex justify-between items-baseline mb-2">
              <span className="font-label-caps text-label-caps uppercase text-outline tracking-wider">
                Rate Card (Applied to Visible Findings)
              </span>
              <span className="font-number-md text-[10px] text-outline" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                Catalog Last Verified: <span className="text-on-surface font-medium">{LAST_VERIFIED}</span>
              </span>
            </div>

            <div className="border border-hairline overflow-x-auto bg-surface-level-1">
              <table className="w-full text-left border-collapse font-number-md text-[11px]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                <thead className="bg-[#12161d] border-b border-hairline">
                  <tr>
                    <th className="p-2 font-label-caps text-[10px] uppercase text-outline font-normal">
                      Resource Type
                    </th>
                    <th className="p-2 font-label-caps text-[10px] uppercase text-outline font-normal">
                      Unit Rate
                    </th>
                    <th className="p-2 font-label-caps text-[10px] uppercase text-outline font-normal">
                      Source
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {rateCardRows.map((row) => (
                    <tr key={row.id} className="hover:bg-[#1f2530] transition-colors">
                      <td className="p-2 text-on-surface font-normal">{row.resourceType}</td>
                      <td className="p-2 text-secondary font-medium tracking-tight">{row.unitRate}</td>
                      <td className="p-2 text-outline text-[10px]">{row.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Region Multipliers Line */}
            <div className="mt-2.5 p-2 bg-surface-level-1 border border-hairline text-[11px] text-outline leading-relaxed">
              <div className="font-number-md text-[10px] text-on-surface-variant mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                Region Multiplier Applied: <span className="text-outline">{regionMultiplierSummary}</span>
              </div>
              <p className="text-[10px] text-outline italic">
                Note: Region multiplier applied is a documented simplification of real per-SKU regional pricing (730 hours/month basis).
              </p>
            </div>
          </div>

          {/* Active Policy JSON Block */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="font-label-caps text-label-caps uppercase text-outline tracking-wider">
                Active Policy (JSON)
              </span>
              <button
                type="button"
                id="copy-policy-json-btn"
                onClick={handleCopyPolicy}
                className="px-2.5 py-1 border border-hairline bg-surface-level-1 hover:bg-[#202731] hover:border-secondary hover:text-secondary text-on-surface font-label-caps text-[10px] uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[13px] text-outline">
                  {copied ? 'check' : 'content_copy'}
                </span>
                <span>{copied ? 'Copied' : 'Copy Policy JSON'}</span>
              </button>
            </div>

            <div className="border border-hairline bg-[#0c0e12] p-3 overflow-x-auto">
              <pre
                className="text-[11px] text-on-surface-variant leading-relaxed selection:bg-secondary/30 selection:text-on-surface"
                style={{ fontFamily: "'IBM Plex Mono', monospace" }}
              >
                {JSON.stringify(policy, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
