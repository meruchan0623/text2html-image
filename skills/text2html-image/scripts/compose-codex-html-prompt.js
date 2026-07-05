#!/usr/bin/env node
const { composeCodexHtmlPrompt } = require('./utils/codex-html-prompt-core');
const { createProjectWorkspace, parseArgs } = require('./utils/workflow-core');

function usage() {
  return [
    'Usage: npm run prompt:compose -- --project <project-id> [--subproject <subproject-id>] [--allow-review]',
    '',
    'Composes prompt-ready artifacts from visual-intake and asset-routing reports.',
    'Required default inputs under reports/: visual-intake-manifest.json, reverse-prompt-brief.md, asset-routing-table.json.',
  ].join('\n');
}

function main() {
  const args = parseArgs();
  if (args.help || !args.project) {
    console.error(usage());
    process.exit(args.help ? 0 : 1);
  }
  const projectPaths = createProjectWorkspace(args.project, { subprojectId: args.subproject });
  try {
    const result = composeCodexHtmlPrompt({
      projectPaths,
      allowReview: Boolean(args['allow-review']),
      visualIntakePath: args['visual-intake'],
      reverseBriefPath: args['reverse-brief'],
      routingPath: args.routing,
      assetPromptsPath: args['asset-prompts'],
      assetProvenancePath: args.provenance,
    });
    console.log(`Reverse visual spec written: ${result.paths.reverseVisualSpec}`);
    console.log(`Visual elements written: ${result.paths.visualElements}`);
    console.log(`First-pass HTML plan written: ${result.paths.firstPassPlan}`);
    console.log(`Codex first-pass HTML prompt written: ${result.paths.prompt}`);
    console.log(`Prompt compose audit written: ${result.paths.audit}`);
    console.log(`Prompt compose status: ${result.audit.status}`);
  } catch (error) {
    console.error(`prompt:compose failed: ${error.message}`);
    process.exit(1);
  }
}

main();
