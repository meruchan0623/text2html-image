#!/usr/bin/env node
const path = require('path');
const { checkCopySchema } = require('./utils/copy-schema-core');
const { createProjectWorkspace, loadCopyRows, parseArgs, writeJson } = require('./utils/workflow-core');

function main() {
  const args = parseArgs();
  const projectPaths = createProjectWorkspace(args.project, { subprojectId: args.subproject });
  const report = checkCopySchema({
    rows: loadCopyRows(),
    templateId: args.template,
  });
  const reportPath = path.join(projectPaths.reports, 'copy-schema-report.json');
  writeJson(reportPath, report);
  console.log(`Copy schema check ${report.status} for project ${projectPaths.project_id}.`);
  console.log(`Copy schema report written: ${reportPath}`);
  if (report.status === 'fail') {
    for (const error of report.errors) console.error(`ERROR ${error}`);
    process.exit(1);
  }
}

main();
