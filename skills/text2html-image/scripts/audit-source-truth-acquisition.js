#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { parseArgs, writeJson } = require('./utils/workflow-core');
const { auditSourceTruthAcquisitionPlan } = require('./utils/source-truth-acquisition-core');

function usage() {
  return [
    'Usage: npm run audit:source-truth-acquisition -- --expected <expected-contract.json> --provenance <asset-provenance.json> --plan <source-truth-acquisition-plan.json> [--review-gates <review-gate-contract-audit.json>] [--report <source-truth-acquisition-audit.json>]',
    '',
    'Checks that review-gated QR/barcode/logo/icon/flag assets have source acquisition plans instead of regenerated or approximate substitutes.',
  ].join('\n');
}

function readJsonFile(filePath, label) {
  const resolved = path.resolve(String(filePath || ''));
  if (!filePath || !fs.existsSync(resolved)) {
    throw new Error(`${label} not found: ${resolved}`);
  }
  return { path: resolved, json: JSON.parse(fs.readFileSync(resolved, 'utf8')) };
}

function optionalJsonFile(filePath) {
  if (!filePath) return { path: null, json: null };
  return readJsonFile(filePath, 'Optional audit input');
}

function main() {
  const args = parseArgs();
  if (args.help || !args.expected || !args.provenance || !args.plan) {
    console.error(usage());
    process.exit(args.help ? 0 : 1);
  }

  let expected;
  let provenance;
  let reviewGates;
  let acquisitionPlan;
  try {
    expected = readJsonFile(args.expected, 'Expected contract');
    provenance = readJsonFile(args.provenance, 'Asset provenance');
    reviewGates = optionalJsonFile(args['review-gates']);
    acquisitionPlan = readJsonFile(args.plan, 'Source-truth acquisition plan');
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  const report = {
    expected_contract_path: expected.path,
    provenance_path: provenance.path,
    review_gate_audit_path: reviewGates.path,
    acquisition_plan_path: acquisitionPlan.path,
    ...auditSourceTruthAcquisitionPlan({
      expectedContract: expected.json,
      provenance: provenance.json,
      reviewGateAudit: reviewGates.json,
      acquisitionPlan: acquisitionPlan.json,
    }),
  };

  const reportPath = args.report
    ? path.resolve(String(args.report))
    : path.join(path.dirname(expected.path), 'source-truth-acquisition-audit.json');
  writeJson(reportPath, report);
  console.log(`Source-truth acquisition audit written: ${reportPath}`);
  console.log(`Source-truth acquisition status: ${report.status}`);
  console.log(`Assets: ${report.summary.asset_count}; review: ${report.summary.review_count}; failures: ${report.summary.failure_count}`);
}

main();
