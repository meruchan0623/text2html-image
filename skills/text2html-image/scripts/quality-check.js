const { createProjectWorkspace, parseArgs, validateWorkflow, writeJson } = require('./utils/workflow-core');

const args = parseArgs();
const projectPaths = createProjectWorkspace(args.project, { subprojectId: args.subproject });
const result = validateWorkflow({ projectId: args.project, subprojectId: args.subproject });
const report = {
  generated_at: new Date().toISOString(),
  project_id: projectPaths.project_id,
  subproject_id: projectPaths.subproject_id,
  status: result.errors.length ? 'fail' : 'pass',
  errors: result.errors,
  warnings: result.warnings,
};

writeJson(`${projectPaths.reports}/qc-report.json`, report);

console.log(`Quality check ${report.status} for project ${projectPaths.project_id}.`);
console.log(`Errors: ${report.errors.length}`);
console.log(`Warnings: ${report.warnings.length}`);

if (report.errors.length) {
  for (const error of report.errors) console.error(`ERROR ${error}`);
  process.exit(1);
}

for (const warning of report.warnings) console.warn(`WARN ${warning}`);
