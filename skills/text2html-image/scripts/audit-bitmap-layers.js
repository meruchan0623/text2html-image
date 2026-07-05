#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { parseArgs, writeJson } = require('./utils/workflow-core');
const { auditBitmapLayerContract } = require('./utils/bitmap-layer-contract-core');

function usage() {
  return [
    'Usage: npm run audit:bitmap-layers -- --html <index.html> --provenance <asset-provenance.json> [--report <bitmap-layer-contract-audit.json>]',
    '',
    'Validates that every bitmap layer in HTML has asset id metadata, provenance, final readiness, and css_placement.',
  ].join('\n');
}

function readJson(filePath, label) {
  const resolved = path.resolve(String(filePath || ''));
  if (!filePath || !fs.existsSync(resolved)) {
    throw new Error(`${label} not found: ${resolved}`);
  }
  return { path: resolved, json: JSON.parse(fs.readFileSync(resolved, 'utf8')) };
}

function main() {
  const args = parseArgs();
  if (args.help || !args.html || !args.provenance) {
    console.error(usage());
    process.exit(args.help ? 0 : 1);
  }

  const htmlPath = path.resolve(String(args.html));
  if (!fs.existsSync(htmlPath)) {
    console.error(`HTML not found: ${htmlPath}`);
    process.exit(1);
  }

  let provenance;
  try {
    provenance = readJson(args.provenance, 'Asset provenance');
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  const report = {
    provenance_path: provenance.path,
    ...auditBitmapLayerContract({
      htmlPath,
      provenance: provenance.json,
    }),
  };
  const reportPath = args.report
    ? path.resolve(String(args.report))
    : path.join(path.dirname(provenance.path), 'bitmap-layer-contract-audit.json');
  writeJson(reportPath, report);

  console.log(`Bitmap layer contract audit written: ${reportPath}`);
  console.log(`Bitmap layer contract status: ${report.status}`);
  console.log(`Layers: ${report.summary.layer_count}; failures: ${report.summary.failure_count}`);
}

main();
