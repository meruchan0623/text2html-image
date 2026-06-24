const fs = require('fs');
const path = require('path');
const { ROOT, getWorkspaceRoot, loadConfig, loadCopyRows } = require('./utils/workflow-core');

const config = loadConfig();
const verbose = process.argv.includes('--verbose');

if (verbose) {
  console.log('text2html-image workflow phases:');
  for (const phase of config.workflow_phases || []) {
    console.log(`${phase.order}. ${phase.id} - ${phase.name}`);
    console.log(`   input: ${(phase.inputs || []).join(', ') || '-'}`);
    console.log(`   output: ${(phase.outputs || []).join(', ') || '-'}`);
  }
  process.exit(0);
}

const templateRoot = path.join(ROOT, 'templates');
const templates = fs.existsSync(templateRoot)
  ? fs.readdirSync(templateRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  : [];

console.log('text2html-image workflow ready.');
console.log(`Workspace: ${getWorkspaceRoot(config)}`);
console.log(`Templates: ${templates.join(', ') || 'none'}`);
console.log(`Data rows: ${loadCopyRows().length}`);
console.log('Quick start: edit data/copy_master.json or a template, then run npm run build -- --project default.');
console.log('Commands: npm run project:init -- --project <id> [--subproject <id>], npm run build -- --project <id> [--subproject <id>], npm run quality-check -- --project <id> [--subproject <id>], npm run batch-export -- --project <id> [--subproject <id>], npm test');
