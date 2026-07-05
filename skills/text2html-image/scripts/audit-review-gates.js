#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { parseArgs, writeJson } = require('./utils/workflow-core');
const { auditReviewGateContract } = require('./utils/review-gate-contract-core');

function usage() {
  return [
    'Usage: npm run audit:review-gates -- --html <index.html> [--provenance <asset-provenance.json>] [--report <review-gate-contract-audit.json>]',
    '',
    'Validates that review-gated assets are explicitly non-final, explain why, and do not contain final-looking bitmap placeholders.',
  ].join('\n');
}

function main() {
  const args = parseArgs();
  if (args.help || !args.html) {
    console.error(usage());
    process.exit(args.help ? 0 : 1);
  }

  const htmlPath = path.resolve(String(args.html));
  if (!fs.existsSync(htmlPath)) {
    console.error(`HTML not found: ${htmlPath}`);
    process.exit(1);
  }

  let provenance = null;
  let reviewGatedAssets = [];
  let provenancePath = null;
  if (args.provenance) {
    provenancePath = path.resolve(String(args.provenance));
    if (!fs.existsSync(provenancePath)) {
      console.error(`Asset provenance not found: ${provenancePath}`);
      process.exit(1);
    }
    provenance = JSON.parse(fs.readFileSync(provenancePath, 'utf8'));
    reviewGatedAssets = Array.isArray(provenance.review_gated_assets) ? provenance.review_gated_assets : [];
  }

  const report = {
    provenance_path: provenancePath,
    ...auditReviewGateContract({
      htmlPath,
      reviewGatedAssets,
    }),
  };
  const reportPath = args.report
    ? path.resolve(String(args.report))
    : path.join(path.dirname(provenancePath || htmlPath), 'review-gate-contract-audit.json');
  writeJson(reportPath, report);

  console.log(`Review gate contract audit written: ${reportPath}`);
  console.log(`Review gate contract status: ${report.status}`);
  console.log(`Gates: ${report.summary.gate_count}; failures: ${report.summary.failure_count}`);
}

main();
