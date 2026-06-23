const path = require('path');
const { createProjectWorkspace, parseArgs, writeJson } = require('./utils/workflow-core');
const { listHtmlEntries } = require('./utils/html-entries');
const { inspectRenderProfile } = require('./utils/render-profile');

function main() {
  const args = parseArgs();
  const projectPaths = createProjectWorkspace(args.project, { subprojectId: args.subproject });
  const entries = listHtmlEntries(projectPaths, { group: args.group });
  const profileEntries = entries.map((entry) => ({
    ...entry,
    ...inspectRenderProfile(entry.html),
  }));
  const report = {
    generated_at: new Date().toISOString(),
    project_id: projectPaths.project_id,
    subproject_id: projectPaths.subproject_id,
    mode: args['profile-only'] ? 'profile-only' : 'export-fast',
    status: profileEntries.every((entry) => entry.status === 'pass') ? 'pass' : 'partial',
    entries: profileEntries,
  };
  const reportPath = path.join(projectPaths.reports, 'render-profile-report.json');
  writeJson(reportPath, report);
  console.log(`Render profile report written: ${reportPath}`);
  if (!args['profile-only']) {
    console.error('PNG export is implemented in a later task. Run with --profile-only for now.');
    process.exit(1);
  }
}

main();
