#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const { applyFloodCutout } = require('./utils/flood-cutout-core');
const { parseArgs, writeJson } = require('./utils/workflow-core');

function usage() {
  return [
    'Usage: npm run flood-cutout -- --input <source.png> [--output <clean.png>] [--mask <mask-debug.png>] [--report <report.json>]',
    '',
    'Options:',
    '  --input          Required source PNG.',
    '  --output         Transparent PNG output. Defaults to <input>-transparent.png.',
    '  --mask           Mask debug PNG output. Defaults to <input>-mask-debug.png.',
    '  --report         JSON report output. Defaults to <input>-cutout-report.json.',
    '  --tolerance      Background color distance threshold. Default: 28.',
    '  --glow-tolerance Edge glow color distance threshold. Default: tolerance + 18.',
    '  --edge-cleanup   Cleanup radius in pixels around removed background. Default: 2.',
  ].join('\n');
}

function withSuffix(input, suffix) {
  const ext = path.extname(input);
  return path.join(path.dirname(input), `${path.basename(input, ext)}${suffix}${ext || '.png'}`);
}

function reportPathFor(input) {
  return path.join(path.dirname(input), `${path.basename(input, path.extname(input))}-cutout-report.json`);
}

function main() {
  const args = parseArgs();
  if (!args.input || args.help) {
    console.error(usage());
    process.exit(args.help ? 0 : 1);
  }

  const input = path.resolve(String(args.input));
  if (!fs.existsSync(input)) {
    console.error(`Input image not found: ${input}`);
    process.exit(1);
  }

  const output = path.resolve(String(args.output || withSuffix(input, '-transparent')));
  const mask = path.resolve(String(args.mask || withSuffix(input, '-mask-debug')));
  const reportPath = path.resolve(String(args.report || reportPathFor(input)));
  const png = PNG.sync.read(fs.readFileSync(input));
  const result = applyFloodCutout(png, {
    tolerance: args.tolerance,
    glowTolerance: args['glow-tolerance'],
    edgeCleanup: args['edge-cleanup'],
  });

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.mkdirSync(path.dirname(mask), { recursive: true });
  fs.writeFileSync(output, PNG.sync.write(result.output));
  fs.writeFileSync(mask, PNG.sync.write(result.maskPng));
  writeJson(reportPath, {
    ...result.report,
    input,
    output,
    mask,
  });

  console.log(`Flood cutout completed: ${output}`);
  console.log(`Mask debug: ${mask}`);
  console.log(`Report: ${reportPath}`);
  if (result.report.warnings.length) {
    console.log(`Warnings: ${result.report.warnings.join(', ')}`);
  }
}

main();
