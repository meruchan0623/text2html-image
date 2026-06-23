const fs = require('fs');
const path = require('path');
const {
  ROOT,
  createProjectWorkspace,
  getProjectPaths,
  getUserDocumentsDir,
  renderRows,
  sanitizeProjectId,
  toFileUrl,
  validateScoreReport,
  validateWorkflow,
} = require('./utils/workflow-core');
const { listHtmlEntries } = require('./utils/html-entries');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

for (const script of [
  'start.js',
  'build.js',
  'quality-check.js',
  'batch-export.js',
  'project-init.js',
  'review-score.js',
  'render-fast.js',
  'test.js',
]) {
  assert(fs.existsSync(path.join(ROOT, 'scripts', script)), `missing package script target scripts/${script}`);
}

const packageJson = JSON.parse(read('package.json'));
assert(packageJson.scripts['render:profile'] === 'node scripts/render-fast.js --profile-only', 'package.json missing render:profile script');
assert(packageJson.scripts['export-fast'] === 'node scripts/render-fast.js', 'package.json missing export-fast script');
for (const dependency of ['@resvg/resvg-js', 'css-tree', 'parse5']) {
  assert(packageJson.dependencies?.[dependency] || packageJson.devDependencies?.[dependency], `package.json missing ${dependency}`);
}

const config = JSON.parse(read('workflow.config.json'));
assert(Array.isArray(config.workflow_phases), 'workflow.config.json missing workflow_phases');
assert(config.workflow_phases.length === 6, 'workflow must have six phases');
assert(config.workspace_root.includes('text2html-image-project'), 'workflow.config.json must set text2html-image-project workspace_root');
assert(config.project_directory_schema?.root_pattern === '<project_id>', 'workflow.config.json should use one folder per image project');
assert(config.project_directory_schema?.subproject_root_pattern === '<project_id>/<subproject_id>', 'workflow.config.json missing shallow subproject root pattern');
assert(!config.project_directory_schema?.manifest_file, 'image project outputs must not create project manifest files');
assert(!config.output_directory, 'workflow.config.json must not keep legacy output_directory');
assert(Array.isArray(config.project_directory_schema?.directories), 'workflow.config.json missing project_directory_schema.directories');
for (const dir of ['source', 'working', 'html', 'screenshots', 'scores', 'exports', 'reports']) {
  assert(config.project_directory_schema.directories.includes(dir), `project directory schema missing ${dir}`);
}
assert(config.copy_image_review?.passing_score === 90, 'copy_image_review passing_score should be 90');
assert(config.copy_image_review?.score_schema?.overall_score === 'number 0-100', 'copy_image_review score schema missing overall_score');
for (const phase of config.workflow_phases) {
  assert(phase.owner_skill === 'text2html-image', `${phase.id} owner_skill must be text2html-image`);
}

const skillDirs = fs.readdirSync(path.join(ROOT, 'skills'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
assert(skillDirs.length === 1 && skillDirs[0] === 'text2html-image', 'skills/ must contain only text2html-image');

const skillFiles = ['skills/text2html-image/SKILL.md'];
const noDebugBrowserTerms = ['local server', 'localhost', 'CDP', 'DevTools', 'remote-debugging'];

for (const file of skillFiles) {
  const body = read(file);
  const match = body.match(/^---\n([\s\S]*?)\n---/);
  assert(match, `${file} missing YAML frontmatter`);
  assert(/^name:\s*[\w-]+$/m.test(match[1]), `${file} missing valid name`);
  assert(/^name:\s*text2html-image$/m.test(match[1]), `${file} must be named text2html-image`);
  assert(/^description:\s*Use when /m.test(match[1]), `${file} description should start with "Use when"`);
  assert(!/^agent_created:/m.test(match[1]), `${file} frontmatter should not include agent_created`);
  assert(!body.includes('Read `workflow.config.json` before acting'), `${file} must not force workflow.config.json as a default preflight`);
  assert(body.includes('## Fast Path Default'), `${file} must document the fast path default`);
  assert(body.includes('## Escalation Triggers'), `${file} must document escalation triggers`);
  assert(body.includes('## Project Workspace'), `${file} must document the project workspace`);
  assert(body.includes('text2html-image-project'), `${file} must document the image project workspace`);
  assert(body.includes('## HTML Grouping'), `${file} must document html grouping`);
  assert(body.includes('## 抄图复刻流程'), `${file} must document the copy-image workflow`);
  assert(body.includes('多模态读取'), `${file} must document multimodal screenshot review`);
  assert(body.includes('静态 `index.html`'), `${file} must require static HTML output`);
  assert(body.includes('刷新当前 Codex Browser 页面'), `${file} must require refreshing the current Codex Browser page`);
  assert(body.includes('Do not close the debugging preview'), `${file} must keep the debugging preview open until accepted`);
  for (const term of noDebugBrowserTerms) {
    assert(!body.includes(term), `${file} must not mention ${term}`);
  }
}

const readmeBody = read('README.md');
assert(readmeBody.includes('skills/text2html-image/'), 'README must document the text2html-image skill path');
assert(readmeBody.includes('text2html-image-project'), 'README must document the Documents workspace');
assert(readmeBody.includes('index.<lang>.html'), 'README must document localized html variants');
assert(readmeBody.includes('file://'), 'README must document direct file URL preview');
assert(readmeBody.includes('刷新当前 Codex Browser 页面'), 'README must document refreshing the current Codex Browser page');
assert(readmeBody.includes('图片未完成前保持该预览页打开'), 'README must document keeping the preview open until the image is done');
for (const term of noDebugBrowserTerms) {
  assert(!readmeBody.includes(term), `README.md must not mention ${term}`);
}

const startOutput = require('child_process').execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'start.js')], {
  cwd: ROOT,
  encoding: 'utf8',
});
assert(startOutput.includes('text2html-image workflow ready.'), 'start output should use the quick-start summary');
assert(!startOutput.includes('input:'), 'start output should not print full phase inputs by default');
assert(!startOutput.includes('output:'), 'start output should not print full phase outputs by default');

const verboseStartOutput = require('child_process').execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'start.js'), '--verbose'], {
  cwd: ROOT,
  encoding: 'utf8',
});
assert(verboseStartOutput.includes('text2html-image workflow phases:'), 'verbose start output should print phase details');
assert(verboseStartOutput.includes('input:'), 'verbose start output should include phase inputs');

assert(sanitizeProjectId('Travel eSIM Banner For HKMO Long Name') === 'travel-esim-banner', 'project ids should be kebab-case and max 20 chars');
assert(sanitizeProjectId('Page Master A') === 'page-master-a', 'subproject ids should be kebab-case');

const projectId = 'test-default-project';
const projectPaths = createProjectWorkspace(projectId);
for (const dir of ['source', 'working', 'html', 'screenshots', 'scores', 'exports', 'reports']) {
  assert(fs.existsSync(projectPaths[dir]), `project workspace missing ${dir}`);
}
assert(projectPaths.root.endsWith(path.join('text2html-image-project', projectId)), 'project root should be directly under text2html-image-project');

const subprojectPaths = createProjectWorkspace('Travel eSIM Banner For HKMO Long Name', { subprojectId: 'Page Master A' });
assert(subprojectPaths.project_id === 'travel-esim-banner', 'long project name should sanitize to 20 chars');
assert(subprojectPaths.subproject_id === 'page-master-a', 'subproject name should sanitize');
assert(subprojectPaths.root.endsWith(path.join('text2html-image-project', 'travel-esim-banner', 'page-master-a')), 'subproject root should use shallow nesting under project');

const defaultPaths = getProjectPaths();
assert(defaultPaths.project_id === 'default', 'missing project should use default project id');

const outputs = renderRows(undefined, { projectId });
assert(outputs.some((item) => item.status === 'built'), 'build did not generate any HTML previews');
const htmlEntries = listHtmlEntries(projectPaths);
assert(htmlEntries.length >= 3, 'html entries should enumerate generated canonical and localized previews');
assert(htmlEntries.some((entry) => entry.variant === 'canonical'), 'html entries should include canonical index.html');
assert(htmlEntries.some((entry) => entry.variant === 'zh-cn'), 'html entries should include zh-cn localized html');
assert(htmlEntries.every((entry) => entry.file_url === toFileUrl(entry.html)), 'html entries should include correct file_url');
const buildOutput = require('child_process').execFileSync(process.execPath, [
  path.join(ROOT, 'scripts', 'build.js'),
  '--project', projectId,
], {
  cwd: ROOT,
  encoding: 'utf8',
});
assert(buildOutput.includes('Local HTML path:'), 'build output should print the local HTML path every round');
assert(buildOutput.includes('Open or refresh in Codex Browser: file://'), 'build output should print the file_url every round');
for (const output of outputs.filter((item) => item.status === 'built')) {
  assert(output.html.startsWith(projectPaths.html), `HTML preview should be written to project html dir: ${output.html}`);
  assert(output.file_url === toFileUrl(output.html), `HTML preview should include file_url: ${output.html}`);
  assert(path.basename(output.html) === `index.${output.lang.toLowerCase()}.html`, `localized HTML should use index.<lang>.html: ${output.html}`);
  assert(fs.existsSync(path.join(path.dirname(output.html), 'index.html')), `canonical index.html should exist beside localized HTML: ${output.html}`);
  assert(fs.existsSync(output.html), `missing generated HTML ${output.html}`);
  const html = fs.readFileSync(output.html, 'utf8');
  assert(!/<script\b/i.test(html), `generated HTML must not include script tags: ${output.html}`);
  assert(html.includes('name="viewport" content="width=device-width, initial-scale=1"'), `generated HTML should not force browser viewport to canvas size: ${output.html}`);
  const cssPath = path.join(path.dirname(output.html), 'master.css');
  if (fs.existsSync(cssPath)) {
    const css = fs.readFileSync(cssPath, 'utf8');
    const bodyBlocks = [...css.matchAll(/(?:^|[}\s])body\s*\{([^}]*)\}/g)].map((match) => match[1]);
    assert(!bodyBlocks.some((block) => /overflow:\s*hidden\s*;/.test(block)), `body must not hide browser scrollbars: ${cssPath}`);
    assert(!bodyBlocks.some((block) => /width:\s*\d+px\s*;/.test(block)), `body must not force canvas width: ${cssPath}`);
    assert(!bodyBlocks.some((block) => /height:\s*\d+px\s*;/.test(block)), `body must not force canvas height: ${cssPath}`);
  }
}
const buildReportPath = path.join(projectPaths.reports, 'build-report.json');
assert(fs.existsSync(buildReportPath), 'build report should be written to project reports dir');
const buildReport = JSON.parse(fs.readFileSync(buildReportPath, 'utf8'));
for (const output of buildReport.outputs.filter((item) => item.status === 'built')) {
  assert(output.file_url === toFileUrl(output.html), `build report output should include file_url: ${output.html}`);
}

const qc = validateWorkflow({ projectId });
assert(qc.errors.length === 0, `quality errors: ${qc.errors.join('; ')}`);

const batchOutput = require('child_process').execFileSync(process.execPath, [
  path.join(ROOT, 'scripts', 'batch-export.js'),
  '--project', projectId,
], {
  cwd: ROOT,
  encoding: 'utf8',
});
assert(batchOutput.includes('Prepared report-only export report'), 'batch-export should prepare a report-only export report');
assert(batchOutput.includes('report-only'), 'batch-export should say report-only');
assert(batchOutput.includes('npm run export-fast'), 'batch-export should point to export-fast');
const exportReportPath = path.join(projectPaths.reports, 'export-report.json');
assert(fs.existsSync(exportReportPath), 'batch-export should write reports/export-report.json');
assert(!fs.existsSync(path.join(projectPaths.exports, 'export-manifest.json')), 'batch-export must not write export-manifest.json');
const exportReport = JSON.parse(fs.readFileSync(exportReportPath, 'utf8'));
assert(exportReport.exports.some((entry) => entry.variant === 'canonical'), 'batch-export should include canonical index.html');
assert(exportReport.exports.some((entry) => entry.variant === 'zh-cn'), 'batch-export should include zh-cn localized html');
assert(exportReport.exports.some((entry) => entry.variant === 'en-us'), 'batch-export should include en-us localized html');

const profileOutput = require('child_process').execFileSync(process.execPath, [
  path.join(ROOT, 'scripts', 'render-fast.js'),
  '--project', projectId,
  '--profile-only',
], {
  cwd: ROOT,
  encoding: 'utf8',
});
assert(profileOutput.includes('Render profile report written'), 'render-fast --profile-only should write a report');
const profileReportPath = path.join(projectPaths.reports, 'render-profile-report.json');
assert(fs.existsSync(profileReportPath), 'render-fast should write reports/render-profile-report.json');
const profileReport = JSON.parse(fs.readFileSync(profileReportPath, 'utf8'));
assert(profileReport.entries.length >= 3, 'render profile report should include html entries');
assert(profileReport.entries.some((entry) => entry.html_group === 'europe-esim-map' && entry.status === 'pass'), 'europe map should pass the first render profile');
assert(profileReport.entries.some((entry) => entry.html_group === 'africa-esim-map' && entry.status === 'fail'), 'africa map should fail profile because of grid/filter/blend');
assert(profileReport.entries.some((entry) => entry.unsupported_css.some((item) => item.property === 'mix-blend-mode')), 'profile should report unsupported mix-blend-mode');
const europeEntry = profileReport.entries.find((entry) => entry.html_group === 'europe-esim-map' && entry.status === 'pass');
assert(europeEntry?.ir_path, 'passing render profile entry should include ir_path');
assert(fs.existsSync(europeEntry.ir_path), 'render profile should write render IR for passing entry');
const europeIr = JSON.parse(fs.readFileSync(europeEntry.ir_path, 'utf8'));
assert(europeIr.canvas.width === 1000 && europeIr.canvas.height === 1263, 'europe IR should preserve canvas size');
assert(europeIr.layers.some((layer) => layer.type === 'svg'), 'europe IR should include inline svg layers');
assert(europeIr.layers.some((layer) => layer.type === 'text' && layer.text.includes('歐洲')), 'europe IR should include title text layer');
assert(europeEntry.svg_path, 'passing render profile entry should include svg_path');
assert(fs.existsSync(europeEntry.svg_path), 'render-fast should write SVG for passing entry');
const europeSvg = fs.readFileSync(europeEntry.svg_path, 'utf8');
assert(europeSvg.includes('<svg'), 'compiled SVG should contain svg root');
assert(europeSvg.includes('viewBox="0 0 1000 1263"'), 'compiled SVG should preserve canvas viewBox');
assert(europeSvg.includes('歐洲'), 'compiled SVG should contain editable text content as SVG text');

const bannerOutput = outputs.find((item) => item.export_name === 'banner_zh-CN_ESIM-HKMO-CN_1536x500');
assert(bannerOutput, 'banner output should be generated');
const bannerHtml = fs.readFileSync(bannerOutput.html, 'utf8');
const bannerRealDir = path.dirname(fs.realpathSync(bannerOutput.html));
for (const srcMatch of bannerHtml.matchAll(/<img src="([^"]+)"/g)) {
  const src = srcMatch[1];
  if (src.startsWith('data:')) continue;
  assert(src.startsWith('../../source/'), `generated image src should use project source assets: ${src}`);
  assert(fs.existsSync(path.resolve(path.dirname(bannerOutput.html), src)), `image path should resolve via Documents symlink: ${src}`);
  assert(fs.existsSync(path.resolve(bannerRealDir, src)), `image path should resolve via real OneDrive path: ${src}`);
}
for (const panelClass of ['panel-castle', 'panel-wall']) {
  const srcMatch = bannerHtml.match(new RegExp(`<figure class="panel ${panelClass}">[\\s\\S]*?<img src="([^"]+)"`));
  assert(srcMatch, `${panelClass} should render an image src`);
  assert(!srcMatch[1].startsWith('../../../../assets/'), `${panelClass} should not use hard-coded repo-relative asset paths`);
  assert(fs.existsSync(path.resolve(path.dirname(bannerOutput.html), srcMatch[1])), `${panelClass} image path should resolve to an existing file`);
}
const bannerCss = fs.readFileSync(path.join(path.dirname(bannerOutput.html), 'master.css'), 'utf8');
assert(/\.center-card\s*\{[\s\S]*left:\s*50%;[\s\S]*top:\s*50%;[\s\S]*transform:\s*translate\(-50%, -50%\);/.test(bannerCss), 'center-card should be strictly centered with 50% translate');
assert(!/\.center-card\s*\{[\s\S]*left:\s*462px;[\s\S]*top:\s*52px;/.test(bannerCss), 'center-card should not use fixed offset positioning');

const validScoreReport = {
  project_id: projectId,
  subproject_id: 'page-master-a',
  round: 1,
  generated_at: new Date().toISOString(),
  source_image: path.join(projectPaths.source, 'reference.png'),
  screenshot: path.join(projectPaths.screenshots, 'round-01.png'),
  overall_score: 91,
  layout_score: 92,
  typography_score: 90,
  color_score: 91,
  asset_score: 90,
  issues: [
    {
      severity: 'medium',
      area: 'layout',
      observed: 'hero is 20px too low',
      expected: 'hero center aligns with reference',
      fix_hint: 'move .hero-layer up by 20px',
    },
  ],
};
const scoreValidation = validateScoreReport(validScoreReport);
assert(scoreValidation.errors.length === 0, `valid score report should pass: ${scoreValidation.errors.join('; ')}`);
const invalidScoreValidation = validateScoreReport({ overall_score: 101, issues: [{ severity: 'low' }] });
assert(invalidScoreValidation.errors.length >= 6, 'invalid score report should report missing fields and invalid score');

const scoreOutput = require('child_process').execFileSync(process.execPath, [
  path.join(ROOT, 'scripts', 'review-score.js'),
  '--project', projectId,
  '--subproject', 'Page Master A',
  '--round', '1',
  '--source-image', path.join(projectPaths.source, 'reference.png'),
  '--screenshot', path.join(projectPaths.screenshots, 'round-01.png'),
  '--overall-score', '91',
  '--layout-score', '92',
  '--typography-score', '90',
  '--color-score', '91',
  '--asset-score', '90',
  '--issue', 'medium|layout|hero is low|hero should align|move hero up',
], {
  cwd: ROOT,
  encoding: 'utf8',
});
assert(scoreOutput.includes('Score report written:'), 'review-score should write a score report');
const subprojectScoreReportPath = path.join(getProjectPaths(projectId, config, { subprojectId: 'Page Master A' }).scores, 'round-01.json');
assert(fs.existsSync(subprojectScoreReportPath), 'review-score should create subproject round-01.json');
const savedScoreReport = JSON.parse(fs.readFileSync(subprojectScoreReportPath, 'utf8'));
assert(savedScoreReport.overall_score === 91, 'review-score should preserve overall score');
assert(savedScoreReport.subproject_id === 'page-master-a', 'review-score should preserve subproject id');
assert(savedScoreReport.issues[0].fix_hint === 'move hero up', 'review-score should parse issue fix hint');

console.log(`Tests passed. Generated ${outputs.filter((item) => item.status === 'built').length} preview(s).`);
