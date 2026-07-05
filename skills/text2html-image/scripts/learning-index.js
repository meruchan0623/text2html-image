#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseArgs, writeJson } = require('./utils/workflow-core');
const { buildNormalizedProjectIndex } = require('./utils/learning-evidence-core');

function usage() {
  return [
    'Usage: npm run learning:index -- --root <text2html-image-project-root> [--report <normalized-project-index.json>]',
    '',
    'Builds a read-only normalized index from existing training projects.',
  ].join('\n');
}

function defaultOutputRoot() {
  return path.join(os.homedir(), 'Documents', 'text2html-image-project');
}

function defaultReportPath(outputRoot) {
  return path.join(outputRoot, 'imagegen-tdd-learning-lab', 'reports', 'normalized-project-index.json');
}

function expandRoot(root) {
  return path.resolve(String(root || defaultOutputRoot()).replace(/^~(?=$|\/)/, os.homedir()));
}

function main() {
  const args = parseArgs();
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }
  const outputRoot = expandRoot(args.root);
  if (!fs.existsSync(outputRoot)) {
    console.error(`Output root not found: ${outputRoot}`);
    process.exit(1);
  }
  const index = buildNormalizedProjectIndex(outputRoot);
  const reportPath = args.report ? path.resolve(String(args.report)) : defaultReportPath(outputRoot);
  writeJson(reportPath, index);
  console.log(`Learning index written: ${reportPath}`);
  console.log(`Projects: ${index.summary.total_projects}`);
  console.log(`Promotion candidates: ${index.summary.promotion_candidate_count}`);
}

main();
