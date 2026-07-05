#!/usr/bin/env node
const path = require('path');
const { runCutoutDecompose } = require('./utils/cutout-decompose-core');
const { createProjectWorkspace, parseArgs } = require('./utils/workflow-core');

function usage() {
  return [
    'Usage: npm run cutout:decompose -- --project <project-id> --source-image <path> [--mode hybrid] [--response <json>] [--subproject <subproject-id>] [--no-auto-cutout]',
    '',
    'The script writes an Agent cutout request, validates model/tool-authored decomposition JSON, and auto-dispatches supported semantic cutouts.',
  ].join('\n');
}

function main() {
  const args = parseArgs();
  if (args.help || !args['source-image']) {
    console.error(usage());
    process.exit(args.help ? 0 : 1);
  }
  const projectPaths = createProjectWorkspace(args.project, { subprojectId: args.subproject });
  const result = runCutoutDecompose({
    projectPaths,
    sourceImage: path.resolve(String(args['source-image'])),
    mode: args.mode || 'hybrid',
    responsePath: args.response,
    autoCutout: args['no-auto-cutout'] ? false : true,
  });
  console.log(`Agent cutout request written: ${result.requestPath}`);
  console.log(`Element decomposition plan written: ${result.planPath}`);
  console.log(`Agent cutout review written: ${result.reviewPath}`);
  console.log(`Cutout decomposition status: ${result.plan.status}`);
  if (result.plan.status === 'fail') process.exit(1);
}

main();
