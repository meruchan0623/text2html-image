const path = require('path');
const { createProjectWorkspace, parseArgs, validateScoreReport, writeJson } = require('./utils/workflow-core');

function numberArg(args, name) {
  const value = Number(args[name]);
  return Number.isFinite(value) ? value : NaN;
}

function padRound(round) {
  return String(round).padStart(2, '0');
}

function parseIssues(rawIssue) {
  const values = Array.isArray(rawIssue) ? rawIssue : rawIssue ? [rawIssue] : [];
  return values.map((value) => {
    const [severity, area, observed, expected, fix_hint] = String(value).split('|');
    return { severity, area, observed, expected, fix_hint };
  });
}

const args = parseArgs();
const projectPaths = createProjectWorkspace(args.project, { subprojectId: args.subproject });
const round = Number.parseInt(args.round || '1', 10);
const safeRound = Number.isFinite(round) && round > 0 ? round : 1;

const report = {
  project_id: projectPaths.project_id,
  subproject_id: projectPaths.subproject_id,
  round: safeRound,
  generated_at: new Date().toISOString(),
  source_image: args['source-image'] || path.join(projectPaths.source, 'reference.png'),
  screenshot: args.screenshot || path.join(projectPaths.screenshots, `round-${padRound(safeRound)}.png`),
  overall_score: numberArg(args, 'overall-score'),
  layout_score: numberArg(args, 'layout-score'),
  typography_score: numberArg(args, 'typography-score'),
  color_score: numberArg(args, 'color-score'),
  asset_score: numberArg(args, 'asset-score'),
  issues: parseIssues(args.issue),
};

const validation = validateScoreReport(report);
if (validation.errors.length) {
  for (const error of validation.errors) console.error(`ERROR ${error}`);
  process.exit(1);
}

const target = path.join(projectPaths.scores, `round-${padRound(safeRound)}.json`);
writeJson(target, report);
console.log(`Score report written: ${target}`);
