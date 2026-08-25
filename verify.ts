import { generateInventory } from './src/data/inventory';
import { evaluate } from './src/data/rules';
import { DEFAULT_POLICY } from './src/types';

const inv = generateInventory();
const r = evaluate(inv, DEFAULT_POLICY);
console.log(`Inventory:      ${inv.length} resources`);
console.log(`Fleet spend:    $${r.fleetMonthlySpendUsd.toFixed(2)}/mo`);
console.log(`Findings:       ${r.findings.length}`);
console.log(`Recoverable:    $${r.totalMonthlySavingUsd.toFixed(2)}/mo`);
console.log(`Safe-only:      $${r.safeMonthlySavingUsd.toFixed(2)}/mo`);
console.log(`Guardrailed:    ${r.blockedByGuardrails}`);
console.log(`Efficiency:     ${r.efficiencyScore}/100`);
console.log('\nTop 6:');
for (const f of r.findings.slice(0, 6)) {
  console.log(` [${f.confidence.padEnd(6)}] $${f.monthlySavingUsd.toFixed(2).padStart(8)}/mo  ${f.ruleId.padEnd(18)} ${f.resource.name}`);
}
console.log('\n--- idleDayThreshold sensitivity ---');
for (const t of [7, 14, 30, 60, 120, 200]) {
  const res = evaluate(inv, { ...DEFAULT_POLICY, idleDayThreshold: t });
  console.log(`  ${String(t).padStart(3)}d -> ${String(res.findings.length).padStart(2)} findings, $${res.totalMonthlySavingUsd.toFixed(2).padStart(8)}/mo, eff ${res.efficiencyScore}`);
}
console.log('\n--- protectedTags off (guardrails relaxed) ---');
const relaxed = evaluate(inv, { ...DEFAULT_POLICY, protectedTags: {} });
console.log(`  safe-only rises to $${relaxed.safeMonthlySavingUsd.toFixed(2)}/mo, guardrailed ${relaxed.blockedByGuardrails}`);
console.log('\n--- determinism ---');
console.log('  identical:', JSON.stringify(evaluate(generateInventory(), DEFAULT_POLICY)) === JSON.stringify(evaluate(generateInventory(), DEFAULT_POLICY)));
console.log('  seed 7 differs:', JSON.stringify(evaluate(generateInventory({seed:7}), DEFAULT_POLICY)) !== JSON.stringify(r));
