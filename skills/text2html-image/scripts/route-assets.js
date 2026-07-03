#!/usr/bin/env node
const path = require('path');
const { createProjectWorkspace, parseArgs } = require('./utils/workflow-core');
const { routeAssets } = require('./utils/asset-routing-core');

function usage() {
  return [
    'Usage: npm run route:assets -- --project <project-id> --source-image <path> --elements <json-or-path> [--subproject <subproject-id>]',
    '',
    'Options:',
    '  --project        Project id. Defaults to workflow default.',
    '  --subproject     Optional subproject id.',
    '  --source-image   Required reference image path. PNG and JPEG are supported for dimensions.',
    '  --elements       Required JSON string or path to a JSON file with an elements array.',
  ].join('\n');
}

function main() {
  const args = parseArgs();
  if (args.help || !args['source-image'] || !args.elements) {
    console.error(usage());
    process.exit(args.help ? 0 : 1);
  }

  const projectPaths = createProjectWorkspace(args.project, { subprojectId: args.subproject });
  const result = routeAssets({
    projectPaths,
    sourceImage: path.resolve(String(args['source-image'])),
    elementsInput: args.elements,
  });

  console.log(`Reverse prompt brief written: ${path.join(projectPaths.reports, 'reverse-prompt-brief.md')}`);
  console.log(`Asset routing table written: ${path.join(projectPaths.reports, 'asset-routing-table.json')}`);
  console.log(`Asset generation prompts written: ${path.join(projectPaths.reports, 'asset-generation-prompts.json')}`);
  console.log(`Asset provenance written: ${path.join(projectPaths.reports, 'asset-provenance.json')}`);
  console.log(`Routing status: ${result.routing.status}`);
}

main();
