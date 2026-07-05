#!/usr/bin/env node
const path = require('path');
const { runMacPersonCutout } = require('./utils/person-cutout-mac-core');
const { parseArgs } = require('./utils/workflow-core');

function usage() {
  return [
    'Usage: npm run cutout:person-mac -- --input <source.png> [--output <same-canvas.png>] [--crop-output <cropped.png>] [--mask <alpha-mask.png>] [--checker <checker.png>] [--report <report.json>]',
    '',
    'Mac-only semantic person cutout using Apple Vision. Requires macOS and /usr/bin/swift.',
  ].join('\n');
}

function withSuffix(input, suffix) {
  const ext = path.extname(input) || '.png';
  return path.join(path.dirname(input), `${path.basename(input, path.extname(input))}${suffix}${ext}`);
}

function main() {
  const args = parseArgs();
  if (args.help || !args.input) {
    console.error(usage());
    process.exit(args.help ? 0 : 1);
  }

  const input = path.resolve(String(args.input));
  try {
    const result = runMacPersonCutout({
      input,
      output: path.resolve(String(args.output || withSuffix(input, '-person-mac-same-canvas'))),
      cropOutput: path.resolve(String(args['crop-output'] || withSuffix(input, '-person-mac-cropped'))),
      mask: path.resolve(String(args.mask || withSuffix(input, '-person-mac-alpha-mask'))),
      checker: path.resolve(String(args.checker || withSuffix(input, '-person-mac-checker'))),
      report: path.resolve(String(args.report || path.join(path.dirname(input), `${path.basename(input, path.extname(input))}-person-mac-report.json`))),
      swiftPath: args.swift ? path.resolve(String(args.swift)) : undefined,
    });
    console.log(`Mac person cutout completed: ${result.output}`);
    console.log(`Cropped transparent PNG: ${result.cropOutput}`);
    console.log(`Alpha mask: ${result.mask}`);
    console.log(`Checker preview: ${result.checker}`);
    console.log(`Report: ${result.report}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

main();
