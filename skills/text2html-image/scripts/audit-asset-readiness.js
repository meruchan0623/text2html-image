#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { parseArgs, writeJson } = require('./utils/workflow-core');
const { auditAssetReadinessContract } = require('./utils/asset-readiness-contract-core');

function usage() {
  return [
    'Usage: npm run audit:asset-readiness -- --expected <expected-contract.json> --provenance <asset-provenance.json> [--routing <asset-routing-table.json>] [--imagegen <imagegen-candidates.json>] [--review-gates <review-gate-contract-audit.json>] [--report <asset-readiness-audit.json>]',
    '',
    'Checks that asset-like expected routes either have final-ready provenance or explicit review-gate coverage.',
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
  if (args.help || !args.expected || !args.provenance) {
    console.error(usage());
    process.exit(args.help ? 0 : 1);
  }

  let expected;
  let provenance;
  let imagegen;
  let reviewGates;
  let routing;
  try {
    expected = readJsonFile(args.expected, 'Expected contract');
    provenance = readJsonFile(args.provenance, 'Asset provenance');
    routing = optionalJsonFile(args.routing);
    imagegen = optionalJsonFile(args.imagegen);
    reviewGates = optionalJsonFile(args['review-gates']);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  const report = {
    expected_contract_path: expected.path,
    provenance_path: provenance.path,
    routing_table_path: routing.path,
    imagegen_candidates_path: imagegen.path,
    review_gate_audit_path: reviewGates.path,
    ...auditAssetReadinessContract({
      expectedContract: expected.json,
      provenance: provenance.json,
      routingTable: routing.json,
      imagegenCandidates: imagegen.json,
      reviewGateAudit: reviewGates.json,
    }),
  };

  const reportPath = args.report
    ? path.resolve(String(args.report))
    : path.join(path.dirname(expected.path), 'asset-readiness-audit.json');
  writeJson(reportPath, report);
  console.log(`Asset readiness audit written: ${reportPath}`);
  console.log(`Asset readiness status: ${report.status}`);
  console.log(`Assets: ${report.summary.checked_count}; review: ${report.summary.review_count}; failures: ${report.summary.failure_count}`);
}

main();
