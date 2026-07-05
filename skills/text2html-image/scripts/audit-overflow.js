const fs = require('fs');
const path = require('path');
const { createProjectWorkspace, parseArgs, writeJson } = require('./utils/workflow-core');
const { listHtmlEntries } = require('./utils/html-entries');
const { auditOverflowEntries } = require('./utils/overflow-audit-core');

function parseSelectors(value) {
  return String(value || '')
    .split(',')
    .map((selector) => selector.trim())
    .filter(Boolean);
}

function writeMarkdownSummary(report, summaryPath) {
  const lines = [
    '# Cell Overflow Audit',
    '',
    `- Status: \`${report.status}\``,
    `- Project: \`${report.project_id}\``,
    `- Subproject: \`${report.subproject_id || ''}\``,
    `- Browser backed: \`${report.browser_backed}\``,
    `- HTML entries: ${report.summary.entry_count}`,
    `- Measured cells: ${report.summary.measured_cell_count}`,
    `- Overflow cells: ${report.summary.overflow_cell_count}`,
    `- Page overflows: ${report.summary.page_overflow_count}`,
    '',
    '## Entries',
    '',
  ];
  for (const entry of report.entries) {
    lines.push(`### ${entry.html_group} / ${entry.variant}`);
    lines.push('');
    lines.push(`- Status: \`${entry.status}\``);
    lines.push(`- Local HTML file path: \`${entry.html}\``);
    lines.push(`- File URL: \`${entry.file_url}\``);
    lines.push(`- Page overflow: x=\`${entry.page.overflow_x}\`, y=\`${entry.page.overflow_y}\``);
    lines.push(`- Measured cells: ${entry.measured_cell_count}`);
    lines.push(`- Overflow cells: ${entry.overflow_cell_count}`);
    const overflowing = entry.cells.filter((cell) => cell.overflow).slice(0, 12);
    if (!overflowing.length) {
      lines.push('- Cell risks: none detected');
    } else {
      lines.push('- Cell risks:');
      for (const cell of overflowing) {
        lines.push(`  - \`${cell.path}\`: ${cell.text || '(empty)'} (scroll ${cell.scroll_width}x${cell.scroll_height}, client ${cell.client_width}x${cell.client_height}, range rects ${cell.range_rect_count})`);
      }
    }
    lines.push('');
  }
  fs.writeFileSync(summaryPath, `${lines.join('\n')}\n`, 'utf8');
}

async function main() {
  const args = parseArgs();
  const projectPaths = createProjectWorkspace(args.project, { subprojectId: args.subproject });
  const entries = listHtmlEntries(projectPaths, { group: args.group });
  const selectors = parseSelectors(args.selectors);
  const result = await auditOverflowEntries(entries, {
    chromePath: args.chrome,
    selectors: selectors.length ? selectors : undefined,
    viewportWidth: args.viewport_width || args.width,
    viewportHeight: args.viewport_height || args.height,
    settleMs: args.settle_ms,
  });
  const report = {
    generated_at: new Date().toISOString(),
    project_id: projectPaths.project_id,
    subproject_id: projectPaths.subproject_id,
    browser_backed: true,
    selectors: selectors.length ? selectors : undefined,
    ...result,
  };
  const reportPath = path.join(projectPaths.reports, 'cell-overflow-report.json');
  const summaryPath = path.join(projectPaths.reports, 'cell-overflow-summary.md');
  writeJson(reportPath, report);
  writeMarkdownSummary(report, summaryPath);
  console.log(`Cell overflow audit written: ${reportPath}`);
  console.log(`Cell overflow summary written: ${summaryPath}`);
  if (report.status === 'fail' && !args['no-fail']) process.exit(1);
}

main().catch((error) => {
  console.error(`Cell overflow audit failed: ${error.message}`);
  process.exit(1);
});
