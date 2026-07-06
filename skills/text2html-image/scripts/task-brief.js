#!/usr/bin/env node
const {
  buildTaskBrief,
  writeTaskBrief,
} = require('./utils/task-brief-core');
const {
  createProjectWorkspace,
  parseArgs,
} = require('./utils/workflow-core');

function usage() {
  return [
    'Usage: npm run task:brief -- --project <project-id> [--subproject <subproject-id>] [--mode preview-overwrite] [--source-image <path>]',
    '  [--html <path>] [--preview-name <name>] [--locale <code> | --locales <code>] [--constraint <text> | --constraints <text>]',
    '',
    'Writes reports/task-brief.json and reports/task-brief.md.',
  ].join('\n');
}

function collectRepeatedArgs(argv, names) {
  const values = [];
  const hasValue = (value) => value && !value.startsWith('--');

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!names.includes(token)) continue;
    const next = argv[index + 1];
    if (hasValue(next)) {
      values.push(String(next));
      index += 1;
    }
  }

  return values;
}

function toList(rawArgs, aliases, parsedValue) {
  const explicit = collectRepeatedArgs(process.argv.slice(2), aliases);
  if (explicit.length) return explicit;
  if (Array.isArray(parsedValue)) return parsedValue;
  return parsedValue == null ? [] : [String(parsedValue)];
}

function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);

  if (!args.project) {
    console.error('Missing required argument: --project');
    console.error(usage());
    process.exit(1);
  }

  const projectPaths = createProjectWorkspace(args.project, { subprojectId: args.subproject });
  const locales = toList(argv, ['--locale', '--locales'], args.locales || args.locale);
  const constraints = toList(argv, ['--constraint', '--constraints'], args.constraint || args.constraints);

  try {
    const brief = buildTaskBrief({
      projectPaths,
      mode: args.mode,
      sourceImage: args['source-image'],
      htmlPath: args.html,
      previewName: args['preview-name'],
      locales,
      constraints,
    });

    const result = writeTaskBrief({ projectPaths, brief });

    console.log(`Task brief written: ${result.markdownPath}`);
    console.log(`Task brief JSON written: ${result.jsonPath}`);
    console.log(`Active preview HTML: ${brief.active_html}`);
    console.log(`Active preview markdown link: ${brief.active_html_markdown_link}`);
    console.log(`Active preview file URL: ${brief.active_html_file_url}`);
    console.log(`Formal export allowed: ${brief.export_allowed}`);
    if (!brief.export_allowed) {
      console.log('Formal export skipped: formal export is not allowed in this mode unless explicitly requested later.');
    }
    if (brief.preview_files.length) {
      console.log('Preview file handoff:');
      brief.preview_files.forEach((previewFile, index) => {
        console.log(`  ${index + 1}) path: ${previewFile}`);
        console.log(`     markdown: ${brief.preview_markdown_links[index]}`);
        console.log(`     file URL: ${brief.preview_file_urls[index]}`);
      });
    }
  } catch (error) {
    console.error(`task:brief failed: ${error.message}`);
    process.exit(1);
  }
}

main();
