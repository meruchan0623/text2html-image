#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { createProjectWorkspace, parseArgs, writeJson } = require('./utils/workflow-core');
const { finalizeVisualReview, padRound } = require('./utils/visual-review-core');

function usage() {
  return [
    'Usage: npm run visual:review -- --project <project-id> --round <n> --report <json> [--subproject <subproject-id>]',
    '',
    'The report JSON must include all score fields, issues with evidence, and next_action.',
  ].join('\n');
}

function main() {
  const args = parseArgs();
  if (args.help || !args.report) {
    console.error(usage());
    process.exit(args.help ? 0 : 1);
  }
  const projectPaths = createProjectWorkspace(args.project, { subprojectId: args.subproject });
  const round = Number.parseInt(args.round || '1', 10);
  const safeRound = Number.isFinite(round) && round > 0 ? round : 1;
  const input = JSON.parse(fs.readFileSync(path.resolve(String(args.report)), 'utf8'));
  const finalReport = finalizeVisualReview({
    ...input,
    project_id: projectPaths.project_id,
    subproject_id: projectPaths.subproject_id || null,
    round: safeRound,
    generated_at: input.generated_at || new Date().toISOString(),
  }, projectPaths);
  const reportPath = path.join(projectPaths.reports, `visual-review-round-${padRound(safeRound)}.json`);
  writeJson(reportPath, finalReport);
  console.log(`Visual review report written: ${reportPath}`);
  console.log(`Visual review status: ${finalReport.status}`);
  if (finalReport.status === 'fail') process.exit(1);
}

main();
