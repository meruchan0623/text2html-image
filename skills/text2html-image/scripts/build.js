const { parseArgs, renderRows } = require('./utils/workflow-core');

const args = parseArgs();
const outputs = renderRows(undefined, { projectId: args.project, subprojectId: args.subproject });
const built = outputs.filter((item) => item.status === 'built').length;
const skipped = outputs.length - built;
const projectId = outputs.find((item) => item.project_id)?.project_id || args.project || 'default';
const subprojectId = outputs.find((item) => item.subproject_id)?.subproject_id;
const previewLinksReport = outputs.find((item) => item.preview_links_report)?.preview_links_report;

console.log(`Built ${built} HTML preview(s) for project ${projectId}${subprojectId ? ` / subproject ${subprojectId}` : ''}.`);
for (const output of outputs.filter((item) => item.status === 'built')) {
  console.log(`Local HTML file path: ${output.html}`);
  console.log(`Open or refresh in your browser: ${output.file_url}`);
  console.log(`Markdown preview link: ${output.markdown_link}`);
}
if (previewLinksReport) console.log(`Preview links report: ${previewLinksReport}`);
if (skipped) console.log('Skipped row(s); see the project reports/build-report.json.');
