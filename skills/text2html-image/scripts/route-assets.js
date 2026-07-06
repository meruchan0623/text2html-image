#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { createProjectWorkspace, parseArgs } = require('./utils/workflow-core');
const { routeAssets } = require('./utils/asset-routing-core');

function usage() {
  return [
    'Usage: npm run route:assets -- --project <project-id> --source-image <path> (--elements <json-or-path> | --from-intake) [--subproject <subproject-id>]',
    '',
    'Options:',
    '  --project        Project id. Defaults to workflow default.',
    '  --subproject     Optional subproject id.',
    '  --source-image   Required reference image path. PNG and JPEG are supported for dimensions.',
    '  --elements       JSON string or path to a JSON file with an elements array.',
    '  --from-intake    Read elements from reports/visual-intake-manifest.json.',
  ].join('\n');
}

function elementsFromIntake(projectPaths) {
  const manifestPath = path.join(projectPaths.reports, 'visual-intake-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing visual intake manifest for --from-intake: ${manifestPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.status !== 'pass') {
    throw new Error(`visual-intake-manifest.json status is ${manifest.status || 'unknown'}; --from-intake requires status "pass".`);
  }
  if (!Array.isArray(manifest.elements) || !manifest.elements.length) {
    throw new Error('visual-intake-manifest.json has no elements for --from-intake.');
  }
  return {
    elements: manifest.elements.map((element) => ({
      ...element,
      suggested_route: element.suggested_route || null,
      route: element.suggested_route || element.route || undefined,
    })),
  };
}

function main() {
  const args = parseArgs();
  const fromIntake = Boolean(args['from-intake']);
  if (args.help || !args['source-image'] || (!args.elements && !fromIntake)) {
    console.error(usage());
    process.exit(args.help ? 0 : 1);
  }

  const projectPaths = createProjectWorkspace(args.project, { subprojectId: args.subproject });
  const elementsInput = fromIntake ? elementsFromIntake(projectPaths) : args.elements;
  const result = routeAssets({
    projectPaths,
    sourceImage: path.resolve(String(args['source-image'])),
    elementsInput,
  });

  console.log(`Reverse prompt brief written: ${path.join(projectPaths.reports, 'reverse-prompt-brief.md')}`);
  console.log(`Asset routing table written: ${path.join(projectPaths.reports, 'asset-routing-table.json')}`);
  console.log(`Asset generation prompts written: ${path.join(projectPaths.reports, 'asset-generation-prompts.json')}`);
  console.log(`Asset provenance written: ${path.join(projectPaths.reports, 'asset-provenance.json')}`);
  console.log(`Routing status: ${result.routing.status}`);
}

main();
