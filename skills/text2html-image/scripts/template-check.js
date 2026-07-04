#!/usr/bin/env node
const path = require('path');
const { checkTemplates } = require('./utils/template-registry-core');
const { createProjectWorkspace, loadCopyRows, parseArgs, writeJson } = require('./utils/workflow-core');

function main() {
  const args = parseArgs();
  const projectPaths = createProjectWorkspace(args.project, { subprojectId: args.subproject });
  const report = checkTemplates({
    rows: loadCopyRows(),
    templateId: args.template,
  });
  const reportPath = path.join(projectPaths.reports, 'template-check-report.json');
  writeJson(reportPath, report);
  console.log(`Template check ${report.status} for project ${projectPaths.project_id}.`);
  console.log(`Template check report written: ${reportPath}`);
  if (report.status === 'fail') {
    for (const templateId of report.missing_templates) console.error(`ERROR missing template ${templateId}`);
    process.exit(1);
  }
}

main();
