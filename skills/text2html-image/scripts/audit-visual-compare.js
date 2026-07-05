#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { parseArgs, writeJson } = require('./utils/workflow-core');
const { comparePngImages } = require('./utils/visual-compare-core');

function usage() {
  return [
    'Usage: npm run audit:visual-compare -- --reference <reference.png> --render <render.png> [--report <json>] [--summary <md>] [--diff <png>] [--stride <n>]',
    '',
    'Writes a coarse pixel similarity audit for reference-vs-render review evidence.',
  ].join('\n');
}

function writeMarkdown(report, summaryPath) {
  const lines = [
    '# Reference vs Render Pixel Audit',
    '',
    `- Status: \`${report.status}\``,
    `- Similarity score: ${report.similarity_score}`,
    `- Canvas match: \`${report.canvas_match}\``,
    `- Reference: \`${report.reference_path}\``,
    `- Render: \`${report.render_path}\``,
    `- Mean RGB diff ratio: ${report.mean_rgb_diff_ratio}`,
    `- High-diff pixel ratio: ${report.high_diff_pixel_ratio}`,
    `- Sampled pixels: ${report.sampled_pixel_count}`,
    '',
  ];
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, `${lines.join('\n')}\n`, 'utf8');
}

function main() {
  const args = parseArgs();
  if (args.help || !args.reference || !args.render) {
    console.error(usage());
    process.exit(args.help ? 0 : 1);
  }
  const report = comparePngImages({
    referencePath: path.resolve(String(args.reference)),
    renderPath: path.resolve(String(args.render)),
    stride: args.stride,
    diffPath: args.diff ? path.resolve(String(args.diff)) : undefined,
  });
  const reportPath = args.report
    ? path.resolve(String(args.report))
    : path.join(path.dirname(path.resolve(String(args.render))), 'reference-vs-render-pixel-audit.json');
  const summaryPath = args.summary
    ? path.resolve(String(args.summary))
    : reportPath.replace(/\.json$/i, '.md');
  writeJson(reportPath, report);
  writeMarkdown(report, summaryPath);
  console.log(`Visual compare audit written: ${reportPath}`);
  console.log(`Visual compare summary written: ${summaryPath}`);
  console.log(`Visual compare status: ${report.status}; similarity: ${report.similarity_score}`);
}

main();
