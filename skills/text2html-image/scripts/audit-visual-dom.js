#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { createProjectWorkspace, parseArgs, writeJson } = require('./utils/workflow-core');
const { listHtmlEntries } = require('./utils/html-entries');
const {
  auditVisualDomEntries,
  renderVisualDomOverlaySvg,
  renderVisualDomSummaryMarkdown,
} = require('./utils/visual-dom-audit-core');

async function main() {
  const args = parseArgs();
  const projectPaths = createProjectWorkspace(args.project, { subprojectId: args.subproject });
  const entries = listHtmlEntries(projectPaths, { group: args.group });
  const result = await auditVisualDomEntries(entries, {
    chromePath: args.chrome,
    viewportWidth: args.viewport_width || args.width,
    viewportHeight: args.viewport_height || args.height,
    settleMs: args.settle_ms,
  });
  const report = {
    generated_at: new Date().toISOString(),
    project_id: projectPaths.project_id,
    subproject_id: projectPaths.subproject_id,
    browser_backed: true,
    ...result,
  };
  const reportPath = path.join(projectPaths.reports, 'visual-dom-audit.json');
  const summaryPath = path.join(projectPaths.reports, 'visual-dom-summary.md');
  const overlayPath = path.join(projectPaths.reports, 'visual-dom-overlay.svg');
  writeJson(reportPath, report);
  fs.writeFileSync(summaryPath, renderVisualDomSummaryMarkdown(report), 'utf8');
  fs.writeFileSync(overlayPath, renderVisualDomOverlaySvg(report.entries[0] || { canvas: { width: 1200, height: 800 }, failures: [] }), 'utf8');
  console.log(`Visual DOM audit written: ${reportPath}`);
  console.log(`Visual DOM summary written: ${summaryPath}`);
  console.log(`Visual DOM overlay written: ${overlayPath}`);
  if (report.status === 'fail' && !args['no-fail']) process.exit(1);
}

main().catch((error) => {
  console.error(`Visual DOM audit failed: ${error.message}`);
  process.exit(1);
});
