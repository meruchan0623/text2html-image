#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { parseArgs, writeJson } = require('./utils/workflow-core');
const { comparePngImages } = require('./utils/visual-compare-core');

function usage() {
  return [
    'Usage: npm run audit:visual-compare -- --reference <reference.png> --render <render.png> [--report <json>] [--summary <md>] [--diff <png>] [--overlay <png>] [--heatmap <json>] [--repair-queue <json>] [--repair-summary <md>] [--dom-report <json>] [--stride <n>]',
    '',
    'Writes pixel similarity, overlay, heatmap, and repair-queue evidence for reference-vs-render review.',
  ].join('\n');
}

function readOptionalJson(filePath) {
  if (!filePath) return null;
  return JSON.parse(fs.readFileSync(path.resolve(String(filePath)), 'utf8'));
}

function defaultArtifactPath(reportPath, fileName) {
  return path.join(path.dirname(reportPath), fileName);
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
    `- Diff map: \`${report.diff_path || ''}\``,
    `- Overlay: \`${report.overlay_path || ''}\``,
    `- Heatmap: \`${report.heatmap_path || ''}\``,
    `- Repair queue items: ${report.repair_queue.length}`,
    '',
  ];
  if (report.top_mismatch_regions.length) {
    lines.push('## Top Mismatch Regions', '');
    for (const region of report.top_mismatch_regions) {
      const candidate = region.primary_dom_candidate;
      lines.push(`- \`${region.id}\` ${region.severity}: bbox x=${region.bbox.x} y=${region.bbox.y} w=${region.bbox.width} h=${region.bbox.height}; type=\`${region.likely_issue_type}\`; candidate=\`${candidate?.selector || 'unattributed'}\``);
    }
    lines.push('');
  }
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, `${lines.join('\n')}\n`, 'utf8');
}

function writeRepairMarkdown(report, summaryPath) {
  const lines = [
    '# Reference vs Render Repair Queue',
    '',
    `- Status: \`${report.status}\``,
    `- Similarity score: ${report.similarity_score}`,
    `- Overlay: \`${report.overlay_path || ''}\``,
    `- Diff: \`${report.diff_path || ''}\``,
    `- Heatmap: \`${report.heatmap_path || ''}\``,
    '',
    '## Top Repairs',
    '',
  ];
  if (!report.repair_queue.length) {
    lines.push('- No mismatch regions above the configured threshold.');
  } else {
    for (const item of report.repair_queue) {
      lines.push(`- ${item.priority}. \`${item.issue_type}\` ${item.selector ? `\`${item.selector}\`` : '`unattributed`'}: ${item.evidence}`);
      lines.push(`  - Hint: ${item.fix_hint}`);
    }
  }
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, `${lines.join('\n')}\n`, 'utf8');
}

function main() {
  const args = parseArgs();
  if (args.help || !args.reference || !args.render) {
    console.error(usage());
    process.exit(args.help ? 0 : 1);
  }
  const reportPath = args.report
    ? path.resolve(String(args.report))
    : path.join(path.dirname(path.resolve(String(args.render))), 'reference-vs-render-pixel-audit.json');
  const summaryPath = args.summary
    ? path.resolve(String(args.summary))
    : reportPath.replace(/\.json$/i, '.md');
  const diffPath = args.diff ? path.resolve(String(args.diff)) : defaultArtifactPath(reportPath, 'reference-vs-render-diff.png');
  const overlayPath = args.overlay ? path.resolve(String(args.overlay)) : defaultArtifactPath(reportPath, 'reference-vs-render-overlay.png');
  const heatmapPath = args.heatmap ? path.resolve(String(args.heatmap)) : defaultArtifactPath(reportPath, 'reference-vs-render-heatmap.json');
  const repairQueuePath = args['repair-queue'] ? path.resolve(String(args['repair-queue'])) : defaultArtifactPath(reportPath, 'reference-vs-render-repair-queue.json');
  const repairSummaryPath = args['repair-summary'] ? path.resolve(String(args['repair-summary'])) : defaultArtifactPath(reportPath, 'reference-vs-render-repair-queue.md');
  const report = comparePngImages({
    referencePath: path.resolve(String(args.reference)),
    renderPath: path.resolve(String(args.render)),
    stride: args.stride,
    diffPath,
    overlayPath,
    heatmapPath,
    domEvidence: readOptionalJson(args['dom-report']),
    regionSize: args['region-size'],
    maxRegions: args['max-regions'],
  });
  report.dom_report_path = args['dom-report'] ? path.resolve(String(args['dom-report'])) : null;
  writeJson(reportPath, report);
  writeJson(repairQueuePath, {
    generated_at: report.generated_at,
    reference_path: report.reference_path,
    render_path: report.render_path,
    dom_report_path: report.dom_report_path,
    repair_queue: report.repair_queue,
  });
  writeMarkdown(report, summaryPath);
  writeRepairMarkdown(report, repairSummaryPath);
  console.log(`Visual compare audit written: ${reportPath}`);
  console.log(`Visual compare summary written: ${summaryPath}`);
  console.log(`Visual compare repair queue written: ${repairQueuePath}`);
  console.log(`Visual compare repair summary written: ${repairSummaryPath}`);
  console.log(`Visual compare status: ${report.status}; similarity: ${report.similarity_score}`);
}

main();
