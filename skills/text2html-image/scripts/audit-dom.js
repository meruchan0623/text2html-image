const fs = require('fs');
const path = require('path');
const { createProjectWorkspace, parseArgs, writeJson } = require('./utils/workflow-core');
const { listHtmlEntries } = require('./utils/html-entries');
const { inspectHtmlEditability, summarizeReports } = require('./utils/dom-editability-core');

function writeMarkdownSummary(report, summaryPath) {
  const lines = [
    '# DOM Editability Audit',
    '',
    `- Status: \`${report.status}\``,
    `- Project: \`${report.project_id}\``,
    `- Subproject: \`${report.subproject_id || ''}\``,
    `- HTML entries: ${report.summary.entry_count}`,
    `- Pass: ${report.summary.pass_count}`,
    `- Review: ${report.summary.review_count}`,
    `- Fail: ${report.summary.fail_count}`,
    `- Editable text nodes: ${report.summary.editable_text_node_count}`,
    `- i18n keys: ${report.summary.i18n_key_count}`,
    `- Business keys: ${report.summary.business_key_count}`,
    `- Images: ${report.summary.image_count}`,
    `- Script tags: ${report.summary.script_count}`,
    `- Asset text risks: ${report.summary.asset_text_risk_count}`,
    '',
    '## Entries',
    '',
  ];
  for (const entry of report.entries) {
    lines.push(`### ${entry.html_group} / ${entry.variant}`);
    lines.push('');
    lines.push(`- Status: \`${entry.status}\``);
    lines.push(`- HTML: \`${entry.html}\``);
    lines.push(`- Canvas: ${entry.canvas ? `${entry.canvas.width} x ${entry.canvas.height}` : 'missing'}`);
    lines.push(`- Editable text nodes: ${entry.metrics.editable_text_node_count}`);
    lines.push(`- i18n keys: ${entry.metrics.i18n_key_count}`);
    lines.push(`- Business keys: ${entry.metrics.business_key_count}`);
    lines.push(`- Images: ${entry.metrics.image_count}`);
    lines.push(`- Scripts: ${entry.metrics.script_count}`);
    if (!entry.risks.length) {
      lines.push('- Risks: none detected');
    } else {
      lines.push('- Risks:');
      for (const risk of entry.risks) {
        lines.push(`  - \`${risk.severity}\` \`${risk.code}\`: ${risk.message}`);
      }
    }
    lines.push('');
  }
  fs.writeFileSync(summaryPath, `${lines.join('\n')}\n`, 'utf8');
}

function main() {
  const args = parseArgs();
  const projectPaths = createProjectWorkspace(args.project, { subprojectId: args.subproject });
  const entries = listHtmlEntries(projectPaths, { group: args.group });
  const auditedEntries = entries.map((entry) => {
    const audit = inspectHtmlEditability(entry.html);
    return {
      html_group: entry.html_group,
      variant: entry.variant,
      html: entry.html,
      file_url: entry.file_url,
      status: audit.status,
      canvas: audit.canvas,
      metrics: audit.metrics,
      risks: audit.risks,
      samples: audit.samples,
      images: audit.images,
    };
  });
  const summary = summarizeReports(auditedEntries);
  const status = summary.fail_count ? 'fail' : summary.review_count ? 'review' : 'pass';
  const report = {
    generated_at: new Date().toISOString(),
    project_id: projectPaths.project_id,
    subproject_id: projectPaths.subproject_id,
    status,
    summary,
    entries: auditedEntries,
  };
  const reportPath = path.join(projectPaths.reports, 'dom-editability-report.json');
  const summaryPath = path.join(projectPaths.reports, 'dom-editability-summary.md');
  writeJson(reportPath, report);
  writeMarkdownSummary(report, summaryPath);
  console.log(`DOM editability audit written: ${reportPath}`);
  console.log(`DOM editability summary written: ${summaryPath}`);
  if (status === 'fail') process.exit(1);
}

main();
