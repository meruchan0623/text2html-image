#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseArgs, writeJson } = require('./utils/workflow-core');
const { buildNormalizedProjectIndex } = require('./utils/learning-evidence-core');
const {
  buildProductizationReport,
  renderNextTrainingPlan,
  renderProductizationMarkdown,
} = require('./utils/learning-report-core');

function usage() {
  return [
    'Usage: npm run learning:report -- --root <text2html-image-project-root>',
    '',
    'Writes productization JSON, markdown, promotion candidates, and next-training plan reports.',
  ].join('\n');
}

function defaultOutputRoot() {
  return path.join(os.homedir(), 'Documents', 'text2html-image-project');
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
  const reportsDir = path.join(outputRoot, 'imagegen-tdd-learning-lab', 'reports');
  const index = buildNormalizedProjectIndex(outputRoot);
  const report = buildProductizationReport(index);
  const indexPath = path.join(reportsDir, 'normalized-project-index.json');
  const jsonPath = path.join(reportsDir, 'training-productization-report.json');
  const markdownPath = path.join(reportsDir, 'training-productization-report.md');
  const promotionsPath = path.join(reportsDir, 'promotion-candidates.json');
  const nextTrainingPath = path.join(reportsDir, 'next-training-plan.md');
  writeJson(indexPath, index);
  writeJson(jsonPath, report);
  writeJson(promotionsPath, report.promotion_candidates);
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(markdownPath, renderProductizationMarkdown(report), 'utf8');
  fs.writeFileSync(nextTrainingPath, renderNextTrainingPlan(report), 'utf8');
  console.log(`Training productization report written: ${markdownPath}`);
  console.log(`Training productization JSON written: ${jsonPath}`);
  console.log(`Promotion candidates written: ${promotionsPath}`);
  console.log(`Next training plan written: ${nextTrainingPath}`);
}

main();
