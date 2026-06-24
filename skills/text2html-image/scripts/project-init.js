const { createProjectWorkspace, parseArgs } = require('./utils/workflow-core');

const args = parseArgs();
const paths = createProjectWorkspace(args.project, { refreshManifest: Boolean(args.refresh), subprojectId: args.subproject });

console.log(`Project workspace ready: ${paths.project_id}`);
if (paths.subproject_id) console.log(`Subproject workspace ready: ${paths.subproject_id}`);
console.log(paths.root);
