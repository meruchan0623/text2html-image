#!/usr/bin/env node
const path = require('path');
const { runVisualIntake } = require('./utils/visual-intake-core');
const { createProjectWorkspace, parseArgs } = require('./utils/workflow-core');

function usage() {
  return [
    'Usage: npm run visual:intake -- --project <project-id> --source-image <path> [--response <json>] [--subproject <subproject-id>]',
    '',
    'The script writes a request package and validates a model-authored response when --response is provided.',
  ].join('\n');
}

function main() {
  const args = parseArgs();
  if (args.help || !args['source-image']) {
    console.error(usage());
    process.exit(args.help ? 0 : 1);
  }
  const projectPaths = createProjectWorkspace(args.project, { subprojectId: args.subproject });
  const result = runVisualIntake({
    projectPaths,
    sourceImage: path.resolve(String(args['source-image'])),
    responsePath: args.response,
    taskType: args['task-type'] || 'recreate',
  });
  console.log(`Visual intake request written: ${result.requestPath}`);
  console.log(`Visual intake manifest written: ${result.manifestPath}`);
  console.log(`Visual intake status: ${result.manifest.status}`);
  if (result.manifest.status === 'fail') process.exit(1);
}

main();
