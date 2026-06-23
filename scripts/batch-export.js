const path = require('path');
const { createProjectWorkspace, parseArgs, writeJson } = require('./utils/workflow-core');
const { listHtmlEntries } = require('./utils/html-entries');

const args = parseArgs();
const projectPaths = createProjectWorkspace(args.project, { subprojectId: args.subproject });
const entries = listHtmlEntries(projectPaths, { group: args.group }).map((entry) => ({
  ...entry,
  status: 'ready-for-export-fast-or-browser-fallback',
}));

const manifest = {
  generated_at: new Date().toISOString(),
  project_id: projectPaths.project_id,
  subproject_id: projectPaths.subproject_id,
  mode: 'report-only',
  note: 'This command does not create PNG files. Run npm run export-fast -- --project <project-id> for direct HTML-to-PNG rendering when the profile passes.',
  total: entries.length,
  exports: entries,
};

writeJson(path.join(projectPaths.reports, 'export-report.json'), manifest);
console.log(`Prepared report-only export report for ${entries.length} HTML preview(s) in project ${projectPaths.project_id}.`);
console.log('Run npm run export-fast -- --project <project-id> to create PNG files without browser screenshots when the render profile passes.');
