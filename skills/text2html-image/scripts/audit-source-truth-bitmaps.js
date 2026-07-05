#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { parseArgs, writeJson } = require('./utils/workflow-core');
const { auditSourceTruthBitmaps } = require('./utils/source-truth-bitmap-core');

function usage() {
  return [
    'Usage: npm run audit:source-truth -- --assets <asset-provenance.json> [--report <source-truth-bitmap-audit.json>]',
    '',
    'The assets JSON may be an asset-provenance report with an assets array or a direct asset list.',
  ].join('\n');
}

function main() {
  const args = parseArgs();
  if (args.help || !args.assets) {
    console.error(usage());
    process.exit(args.help ? 0 : 1);
  }

  const assetsPath = path.resolve(String(args.assets));
  if (!fs.existsSync(assetsPath)) {
    console.error(`Assets input not found: ${assetsPath}`);
    process.exit(1);
  }
  const input = JSON.parse(fs.readFileSync(assetsPath, 'utf8'));
  const assets = Array.isArray(input) ? input : input.assets;
  if (!Array.isArray(assets)) {
    console.error('Assets input must include an assets array.');
    process.exit(1);
  }

  const report = {
    input_path: assetsPath,
    case_id: input.case_id || input.subproject_id || null,
    project_id: input.project_id || null,
    ...auditSourceTruthBitmaps({
      assets,
      baseDir: path.dirname(assetsPath),
    }),
  };
  const reportPath = args.report
    ? path.resolve(String(args.report))
    : path.join(path.dirname(assetsPath), 'source-truth-bitmap-audit.json');
  writeJson(reportPath, report);

  console.log(`Source-truth bitmap audit written: ${reportPath}`);
  console.log(`Source-truth bitmap status: ${report.status}`);
  console.log(`Assets: ${report.summary.asset_count}; failures: ${report.summary.failure_count}`);
}

main();
