#!/usr/bin/env node
const { inspectProject, writeProjectInspect } = require('./utils/project-inspect-core');
const { getProjectPaths, parseArgs } = require('./utils/workflow-core');

function usage() {
  return [
    'Usage: npm run project:inspect -- --project <project-id> [--subproject <subproject-id>]',
    '',
    'Read-only scan of an existing project workspace. Writes reports/project-inspect.json and reports/project-inspect.md.',
  ].join('\n');
}

function main() {
  const args = parseArgs();
  if (!args.project) {
    console.error('Missing required argument: --project');
    console.error(usage());
    process.exit(1);
  }

  const projectPaths = getProjectPaths(args.project, undefined, { subprojectId: args.subproject });

  try {
    const summary = inspectProject(projectPaths);
    const result = writeProjectInspect({ projectPaths, summary });
    console.log(`Project inspect written: ${result.markdownPath}`);
    console.log(`Project inspect JSON written: ${result.jsonPath}`);
    console.log(`Active root: ${summary.active_root}`);
    console.log(`HTML entries: ${summary.html_entries.length}`);
    console.log(`Export files: ${summary.export_files.count}`);
    if (summary.active_preview) {
      console.log(`Active preview HTML: ${summary.active_preview.html}`);
      console.log(`Active preview file URL: ${summary.active_preview.file_url}`);
    }
    if (summary.recommended_next_commands.length) {
      console.log(`Recommended next command: ${summary.recommended_next_commands[0]}`);
    }
  } catch (error) {
    console.error(`project:inspect failed: ${error.message}`);
    process.exit(1);
  }
}

main();
