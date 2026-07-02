const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
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
const { inspectHtmlEditability } = require('./utils/dom-editability-core');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function maybeReadAbsolute(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

const testFixturePaths = [];
function writeTestFixture(relativePath, content) {
  const target = path.join(ROOT, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  testFixturePaths.push(target);
}

function cleanupTestFixtures() {
  for (const file of testFixturePaths.reverse()) {
    fs.rmSync(file, { force: true });
  }
  for (const dir of [
    'templates/T01_price_type',
    'templates/banner_zh_hkmo',
    'templates/europe_esim_map',
    'templates/travel_esim_usage_query',
    'templates/africa_esim_map',
    'assets/source',
    'templates',
    'assets',
  ]) {
    try {
      fs.rmdirSync(path.join(ROOT, dir));
    } catch (_error) {
      // Directory may be non-empty with user files; only test-created files are removed above.
    }
  }
}

function prepareTestFixtures() {
  cleanupTestFixtures();
  process.on('exit', cleanupTestFixtures);

  writeTestFixture('assets/source/hong-kong-skyline.jpg', 'fixture skyline');
  writeTestFixture('assets/source/hk-disneyland-castle.jpg', 'fixture castle');
  writeTestFixture('assets/source/xian-city-wall.jpg', 'fixture wall');

  writeTestFixture('templates/T01_price_type/master.html', `<!doctype html>
<html lang="{{lang}}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="master.css">
</head>
<body class="{{lang_class}}">
  <main class="poster" style="width: {{canvas_width}}px; height: {{canvas_height}}px">
    <h1 class="title" data-i18n-key="title">{{title}}</h1>
    <p class="subtitle" data-i18n-key="subtitle">{{subtitle}}</p>
    <div class="price" data-sku="{{sku}}"><span>{{currency}}</span><strong>{{price}}</strong><span>{{unit}}</span></div>
    <a class="cta" data-i18n-key="cta">{{cta}}</a>
    <small class="disclaimer" data-i18n-key="disclaimer">{{disclaimer}}</small>
  </main>
</body>
</html>
`);
  writeTestFixture('templates/T01_price_type/master.css', `body { margin: 0; font-family: Arial, sans-serif; }
.poster { position: relative; background: #f7fbff; overflow: visible; }
.title { position: absolute; left: 64px; top: 80px; font-size: 64px; margin: 0; }
.subtitle { position: absolute; left: 64px; top: 170px; font-size: 32px; margin: 0; }
.price { position: absolute; left: 64px; top: 360px; font-size: 56px; }
.cta { position: absolute; left: 64px; bottom: 140px; font-size: 34px; }
.disclaimer { position: absolute; left: 64px; bottom: 70px; font-size: 18px; }
`);

  writeTestFixture('templates/banner_zh_hkmo/master.html', `<!doctype html>
<html lang="{{lang}}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="master.css">
</head>
<body class="{{lang_class}}">
  <main class="poster" style="width: {{canvas_width}}px; height: {{canvas_height}}px">
    <img class="skyline" src="{{bg_asset}}" data-asset-text-policy="preserve-raster" alt="">
    <section class="center-card">
      <h1 class="title" data-i18n-key="title">{{title}}</h1>
      <p class="subtitle" data-i18n-key="subtitle">{{subtitle}}</p>
      <span class="cta" data-i18n-key="cta">{{cta}}</span>
    </section>
    <figure class="panel panel-castle"><img src="{{patch_asset_1}}" data-asset-text-policy="preserve-raster" alt=""></figure>
    <figure class="panel panel-wall"><img src="{{patch_asset_2}}" data-asset-text-policy="preserve-raster" alt=""></figure>
  </main>
</body>
</html>
`);
  writeTestFixture('templates/banner_zh_hkmo/master.css', `body { margin: 0; font-family: Arial, sans-serif; }
.poster { position: relative; background: #dfeffc; overflow: visible; }
.skyline { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.center-card { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 420px; height: 260px; background: rgba(255,255,255,.9); }
.title { margin: 44px 0 0; text-align: center; font-size: 60px; }
.subtitle, .cta { display: block; text-align: center; font-size: 28px; }
.panel { position: absolute; margin: 0; }
.panel img { width: 180px; height: 120px; object-fit: cover; }
.panel-castle { left: 90px; bottom: 40px; }
.panel-wall { right: 90px; bottom: 40px; }
`);

  writeTestFixture('templates/europe_esim_map/master.html', `<!doctype html>
<html lang="{{lang}}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="master.css">
</head>
<body class="{{lang_class}}">
  <main class="poster" style="width: {{canvas_width}}px; height: {{canvas_height}}px">
    <svg class="map-base" width="1000" height="1263" viewBox="0 0 1000 1263" aria-hidden="true">
      <rect x="120" y="180" width="760" height="760" rx="80" fill="#e8f1ff" stroke="#315ba8" stroke-width="12"/>
      <path d="M240 420 C360 300 510 310 620 440 S720 700 560 780 S260 750 240 580 Z" fill="#5f83d5"/>
    </svg>
    <span class="map-label label-lg" data-country-code="FR" data-i18n-key="country.fr" style="left: 480px; top: 560px;">法國</span>
    <div class="title-pill" data-i18n-key="title">{{title}}</div>
  </main>
</body>
</html>
`);
  writeTestFixture('templates/europe_esim_map/master.css', `body { margin: 0; font-family: Arial, sans-serif; }
.poster { position: relative; background: #ffffff; overflow: visible; }
.map-base { position: absolute; left: 0; top: 0; }
.map-label { position: absolute; color: #fff; font-weight: 700; transform: translate(-50%, -50%); }
.label-lg { font-size: 28px; }
.title-pill { position: absolute; left: 560px; top: 1130px; width: 370px; height: 72px; display: flex; align-items: center; justify-content: center; color: white; background: #415BA8; border-radius: 36px; }
`);

  writeTestFixture('templates/travel_esim_usage_query/master.html', `<!doctype html>
<html lang="{{lang}}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="master.css">
</head>
<body class="{{lang_class}}">
  <main class="poster" style="width: {{canvas_width}}px; height: {{canvas_height}}px">
    <h1 class="title" data-i18n-key="title">{{title}}</h1>
    <p class="subtitle" data-i18n-key="subtitle">{{subtitle}}</p>
    <section class="phone" data-sku="{{sku}}">
      <strong data-i18n-key="remaining_label">{{remaining_label}}</strong>
      <span>{{remaining_value}} {{remaining_unit}}</span>
    </section>
  </main>
</body>
</html>
`);
  writeTestFixture('templates/travel_esim_usage_query/master.css', `body { margin: 0; font-family: Arial, sans-serif; }
.poster { position: relative; background: #f5f8ff; overflow: visible; }
.title { position: absolute; left: 80px; top: 90px; font-size: 72px; }
.subtitle { position: absolute; left: 80px; top: 190px; font-size: 30px; }
.phone { position: absolute; left: 340px; top: 360px; width: 420px; height: 620px; border: 8px solid #222; border-radius: 42px; }
`);

  writeTestFixture('templates/africa_esim_map/master.html', `<!doctype html>
<html lang="{{lang}}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="master.css">
</head>
<body class="{{lang_class}}">
  <main class="poster" style="width: {{canvas_width}}px; height: {{canvas_height}}px">
    <h1 class="title" data-i18n-key="title">{{title}}</h1>
    <img class="map" src="{{hero_asset}}" data-asset-text-policy="preserve-raster" alt="">
    <section class="country-grid" data-sku="{{sku}}">
      <span data-country-code="DZ" data-i18n-key="country.dz">{{country_dz}}</span>
      <span data-country-code="CD" data-i18n-key="country.cd">{{country_cd}}</span>
      <span data-country-code="EG" data-i18n-key="country.eg">{{country_eg}}</span>
    </section>
  </main>
</body>
</html>
`);
  writeTestFixture('templates/africa_esim_map/master.css', `body { margin: 0; font-family: Arial, sans-serif; }
.poster { position: relative; background: #ffffff; overflow: visible; }
.title { position: absolute; left: 80px; top: 70px; font-size: 52px; }
.map { position: absolute; left: 420px; top: 240px; width: 560px; height: 560px; mix-blend-mode: multiply; }
.country-grid { position: absolute; left: 80px; top: 220px; width: 420px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
`);
}

prepareTestFixtures();

for (const script of [
  'start.js',
  'build.js',
  'quality-check.js',
  'batch-export.js',
  'project-init.js',
  'review-score.js',
  'render-fast.js',
  'flood-cutout.js',
  'audit-dom.js',
  'test.js',
]) {
  assert(fs.existsSync(path.join(ROOT, 'scripts', script)), `missing package script target scripts/${script}`);
}

const packageJson = JSON.parse(read('package.json'));
assert(packageJson.scripts['render:profile'] === 'node scripts/render-fast.js --profile-only', 'package.json missing render:profile script');
assert(packageJson.scripts['export-fast'] === 'node scripts/render-fast.js', 'package.json missing export-fast script');
assert(packageJson.scripts['flood-cutout'] === 'node scripts/flood-cutout.js', 'package.json missing flood-cutout script');
assert(packageJson.scripts['audit:dom'] === 'node scripts/audit-dom.js', 'package.json missing audit:dom script');
for (const dependency of ['@resvg/resvg-js', 'css-tree', 'parse5']) {
  assert(packageJson.dependencies?.[dependency] || packageJson.devDependencies?.[dependency], `package.json missing ${dependency}`);
}
assert(packageJson.dependencies?.pngjs || packageJson.devDependencies?.pngjs, 'package.json missing pngjs');

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

const skillFiles = ['SKILL.md'];
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

const repositoryEntry = maybeReadAbsolute(path.resolve(ROOT, '..', '..', 'SKILL.md'));
if (repositoryEntry) {
  assert(repositoryEntry.includes('skills/text2html-image/'), 'root SKILL.md must point to the canonical skill package');
  assert(repositoryEntry.includes('Documents/text2html-image-project'), 'root SKILL.md must document the project workspace');
}

const skillBody = read('SKILL.md');
assert(skillBody.includes('npm run export-fast'), 'skill must document export-fast command');
assert(skillBody.includes('direct HTML-to-SVG-to-PNG'), 'skill must describe direct HTML-to-SVG-to-PNG export');
assert(skillBody.includes('## Self-Contained Skill Package'), 'skill must document self-contained package execution');
assert(skillBody.includes('## Layered PNG + HTML Pitfalls'), 'skill must document layered PNG pitfalls from recent work');
assert(skillBody.includes('same-canvas transparent PNG layers'), 'skill must prefer same-canvas transparent PNG layers');
assert(skillBody.includes('## Flood Cutout Asset Cleanup'), 'skill must document flood cutout asset cleanup');
assert(skillBody.includes('npm run flood-cutout'), 'skill must document flood-cutout command');
assert(skillBody.includes('*-mask-debug.png'), 'skill must require mask debug output');
assert(skillBody.includes('*-cutout-report.json'), 'skill must require cutout report output');
assert(skillBody.includes('PNG layers must not contain poster-level title'), 'skill must forbid localized poster text in PNG layers');
assert(skillBody.includes('data-i18n-key'), 'skill must require i18n metadata for editable text');
assert(skillBody.includes('## Phone Poster Layering Pitfalls'), 'skill must document phone poster layering pitfalls');
assert(skillBody.includes('same-canvas layer touches the canvas edge'), 'skill must document same-canvas edge flood-cutout risk');
assert(skillBody.includes('Partial alpha that is not removed can become a dark opaque seam'), 'skill must document partial-alpha seam risk');
assert(skillBody.includes('the airplane in a `Travel eSIM` pill'), 'skill must prefer SVG/CSS for small UI art assets');
assert(skillBody.includes('QR codes and scannable codes are bitmap truth assets'), 'skill must require QR/scannable codes as cropped bitmap assets');
assert(skillBody.includes('phone safe-area'), 'skill must document phone safe-area layering checks');
assert(skillBody.includes('overflow-wrap: anywhere'), 'skill must document translation-resilient enlarged layouts');
assert(skillBody.includes('outputs/<deliverable>/html/index.html'), 'skill must document detached deliverable path depth checks');
assert(skillBody.includes('Resolved local image paths from the active HTML path'), 'completion contract must verify image paths from active HTML');
assert(skillBody.includes('QR/scannable-code crop path'), 'completion contract must include QR crop verification');
assert(skillBody.includes('## Draw/Edit Rework Guard'), 'skill must document draw/edit rework guard');
assert(skillBody.includes('prompt_only is not a finished transparent asset'), 'skill must block prompt-only transparent layers from final HTML');
assert(skillBody.includes('flood-cutout is not semantic segmentation'), 'skill must document flood-cutout semantic boundary');
assert(skillBody.includes('current preview edit'), 'skill must document current preview edit guard');
assert(skillBody.includes('resolved from the delivered HTML path'), 'skill must require delivered HTML asset path checks');
assert(skillBody.includes('QR/barcode assets are bitmap truth assets'), 'skill must preserve scannable bitmap assets');
assert(skillBody.includes('The preferred future layout is adaptive'), 'skill must document the preferred adaptive layout');
assert(skillBody.includes('Current runtime truth'), 'skill must document current runtime truth');
assert(skillBody.includes('Future target'), 'skill must document future target state');
assert(skillBody.includes('Before creating or editing output files'), 'skill must document output file precedence');
assert(skillBody.includes('If both html/index.html and html/<html-group>/index.html exist'), 'skill must document grouped evidence preference');
assert(skillBody.includes('Run evidence activation'), 'skill must document run evidence activation');
assert(skillBody.includes('Do not migrate or delete old folders unless the user explicitly requests a migration task.'), 'skill must avoid undocumented legacy evidence migration');
assert(skillBody.includes('One durable summary file'), 'skill must define one durable summary artifact');
assert(skillBody.includes('Two durable project-level report files'), 'skill must define two durable project-level reports');
assert(skillBody.includes('Three or more durable project-level reports'), 'skill must define three-or-more durable project-level report behavior');
assert(skillBody.includes('runs/latest/scores/round-NN.json'), 'skill must document run-level score path');
assert(skillBody.includes('Existing historical and current runtime folders'), 'skill must preserve legacy runtime folders unless requested');
assert(skillBody.includes('Device screen UI is partially hidden'), 'stop conditions must catch phone UI occlusion');
assert(skillBody.includes('npm run audit:dom'), 'skill must document audit:dom command');
assert(skillBody.includes('DOM editability report path'), 'completion contract must include DOM editability report');
assert(skillBody.includes('dom-editability-report.json'), 'skill must mention dom-editability-report.json');
const executionFlow = read('references/execution-flow.md');
assert(executionFlow.includes('dom-editability-report.json'), 'execution flow must include DOM editability report');
assert(executionFlow.includes('dom-editability-summary.md'), 'execution flow must include DOM editability summary');
assert(executionFlow.includes('Stable project-level examples'), 'execution flow must document stable project-level example artifacts');
assert(executionFlow.includes('Run-level examples'), 'execution flow must document run-level example artifacts');
assert(executionFlow.includes('generated `html/index*.html` or `html/<html-group>/index*.html`'), 'execution flow must document adaptive workspace-html paths');
assert(executionFlow.includes('active single-group `html/` path or active `html_group`'), 'execution flow must document single-group and grouped patch scope');
assert(executionFlow.includes('record the affected variants under `runs/latest/reports/` when run evidence is active'), 'execution flow must document adaptive patch report paths');
assert(executionFlow.includes('two durable project-level report files may also stay at root'), 'execution flow must document two-report root threshold');
assert(executionFlow.includes('three or more durable reports'), 'execution flow must document report-set threshold');
assert(executionFlow.includes('Promote `runs/latest/` to a named run only when'), 'execution flow must document run promotion rule');
assert(executionFlow.includes('runs/latest/reports/intake-report.json'), 'execution flow must document intake run report');
assert(executionFlow.includes('Do not promote a micro-adjustment into a full regeneration'), 'execution flow must block broad regeneration for micro-edits');
assert(executionFlow.includes('sync-back decision'), 'execution flow must record deliverable-copy sync-back decisions');
const stageGuides = read('references/stage-guides.md');
assert(stageGuides.includes('reports/export-report.json'), 'stage-guides must mention export-report.json');
assert(stageGuides.includes('Current `npm run batch-export` is report-only'), 'stage-guides must mention batch-export report-only mode');
assert(stageGuides.includes('One HTML group -> direct `html/index.html`'), 'stage-guides must document single-group html output path');
assert(stageGuides.includes('Multiple HTML groups -> `html/<html-group>/`.'), 'stage-guides must document multi-group html output path');
assert(stageGuides.includes('One export group -> direct `exports/`'), 'stage-guides must document single export-group path');
assert(stageGuides.includes('Multiple delivery/export packs -> `exports/<delivery-id-or-group>/`'), 'stage-guides must document multi-delivery export path');
assert(stageGuides.includes('Iterative screenshots/scores/masks/temp export diagnostics -> `runs/latest/`'), 'stage-guides must document run-level iterative diagnostics path');
assert(stageGuides.includes('Prompt package is not an asset'), 'stage guides must separate prompt packages from usable assets');
assert(stageGuides.includes('Current preview edit checklist'), 'stage guides must document current preview edits');
assert(stageGuides.includes('Detached outputs path checklist'), 'stage guides must document detached output path checks');
assert(!stageGuides.includes('exports/export-manifest.json'), 'stage-guides should not require export manifest path');

const rootReadmePath = path.join(ROOT, '..', '..', 'README.md');
if (fs.existsSync(rootReadmePath)) {
  const rootReadmeBody = fs.readFileSync(rootReadmePath, 'utf8');
  assert(rootReadmeBody.includes('抄图、拆图、生成 HTML'), 'root README must explain the core workflow');
  assert(rootReadmeBody.includes('prompt_only 不是资产'), 'root README must explain prompt-only asset status');
  assert(rootReadmeBody.includes('当前预览微调'), 'root README must explain current preview edits');
  assert(rootReadmeBody.includes('outputs 路径检查'), 'root README must explain detached output path checks');
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

const firstHtmlOutput = outputs.find((item) => item.status === 'built');
const firstHtmlAudit = inspectHtmlEditability(firstHtmlOutput.html);
assert(firstHtmlAudit.status !== 'fail', `generated HTML should not fail DOM audit: ${firstHtmlOutput.html}`);
assert(firstHtmlAudit.metrics.script_count === 0, 'generated HTML should not contain script tags');
assert(firstHtmlAudit.metrics.editable_text_node_count > 0, 'generated HTML should expose editable DOM text nodes');
assert(firstHtmlAudit.metrics.image_count >= 0, 'DOM audit should report image count');
assert(Array.isArray(firstHtmlAudit.risks), 'DOM audit should report risk array');

const qc = validateWorkflow({ projectId });
assert(qc.errors.length === 0, `quality errors: ${qc.errors.join('; ')}`);

const domAuditOutput = require('child_process').execFileSync(process.execPath, [
  path.join(ROOT, 'scripts', 'audit-dom.js'),
  '--project', projectId,
], {
  cwd: ROOT,
  encoding: 'utf8',
});
assert(domAuditOutput.includes('DOM editability audit written'), 'audit-dom should print report path');
const domAuditReportPath = path.join(projectPaths.reports, 'dom-editability-report.json');
const domAuditSummaryPath = path.join(projectPaths.reports, 'dom-editability-summary.md');
assert(fs.existsSync(domAuditReportPath), 'audit-dom should write reports/dom-editability-report.json');
assert(fs.existsSync(domAuditSummaryPath), 'audit-dom should write reports/dom-editability-summary.md');
const domAuditReport = JSON.parse(fs.readFileSync(domAuditReportPath, 'utf8'));
assert(domAuditReport.project_id === projectPaths.project_id, 'DOM audit report should include project id');
assert(domAuditReport.summary.entry_count >= 3, 'DOM audit should include generated HTML entries');
assert(domAuditReport.summary.script_count === 0, 'DOM audit should count zero scripts for generated previews');
assert(domAuditReport.entries.every((entry) => entry.html.startsWith(projectPaths.html)), 'DOM audit entries should stay inside project html dir');

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

const fastExportOutput = require('child_process').execFileSync(process.execPath, [
  path.join(ROOT, 'scripts', 'render-fast.js'),
  '--project', projectId,
  '--group', 'europe-esim-map',
  '--scale', '2',
], {
  cwd: ROOT,
  encoding: 'utf8',
});
assert(fastExportOutput.includes('Direct PNG export completed'), 'export-fast should complete for supported html group');
const pngReportPath = path.join(projectPaths.reports, 'png-export-report.json');
assert(fs.existsSync(pngReportPath), 'export-fast should write reports/png-export-report.json');
const pngReport = JSON.parse(fs.readFileSync(pngReportPath, 'utf8'));
assert(pngReport.status === 'pass', 'png export report should pass for europe group');
assert(pngReport.exports.every((entry) => entry.scale === 2), 'png export report should preserve scale');
assert(pngReport.exports.every((entry) => fs.existsSync(entry.png)), 'png export report should point to existing PNG files');
assert(pngReport.exports.some((entry) => /europe-esim-map-canonical\.png$/.test(entry.png)), 'png export should include canonical output');

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

const floodInputPath = path.join(projectPaths.working, 'flood-cutout-input.png');
const floodOutputPath = path.join(projectPaths.working, 'flood-cutout-output.png');
const floodMaskPath = path.join(projectPaths.working, 'flood-cutout-mask-debug.png');
const floodReportPath = path.join(projectPaths.reports, 'flood-cutout-report.json');
const floodPng = new PNG({ width: 12, height: 12 });
function setPixel(png, x, y, rgba) {
  const offset = (png.width * y + x) << 2;
  png.data[offset] = rgba[0];
  png.data[offset + 1] = rgba[1];
  png.data[offset + 2] = rgba[2];
  png.data[offset + 3] = rgba[3];
}
function getPixel(png, x, y) {
  const offset = (png.width * y + x) << 2;
  return [png.data[offset], png.data[offset + 1], png.data[offset + 2], png.data[offset + 3]];
}
for (let y = 0; y < floodPng.height; y += 1) {
  for (let x = 0; x < floodPng.width; x += 1) {
    setPixel(floodPng, x, y, [245, 242, 238, 255]);
  }
}
for (let y = 3; y <= 8; y += 1) {
  for (let x = 3; x <= 8; x += 1) {
    setPixel(floodPng, x, y, [20, 90, 150, 255]);
  }
}
for (let y = 4; y <= 7; y += 1) {
  for (let x = 4; x <= 7; x += 1) {
    setPixel(floodPng, x, y, [245, 242, 238, 255]);
  }
}
for (let x = 2; x <= 9; x += 1) {
  setPixel(floodPng, x, 2, [223, 220, 216, 255]);
  setPixel(floodPng, x, 9, [223, 220, 216, 255]);
}
for (let y = 2; y <= 9; y += 1) {
  setPixel(floodPng, 2, y, [223, 220, 216, 255]);
  setPixel(floodPng, 9, y, [223, 220, 216, 255]);
}
fs.writeFileSync(floodInputPath, PNG.sync.write(floodPng));

const floodOutput = require('child_process').execFileSync(process.execPath, [
  path.join(ROOT, 'scripts', 'flood-cutout.js'),
  '--input', floodInputPath,
  '--output', floodOutputPath,
  '--mask', floodMaskPath,
  '--report', floodReportPath,
  '--tolerance', '24',
  '--edge-cleanup', '2',
], {
  cwd: ROOT,
  encoding: 'utf8',
});
assert(floodOutput.includes('Flood cutout completed'), 'flood-cutout should report completion');
assert(fs.existsSync(floodOutputPath), 'flood-cutout should write transparent PNG');
assert(fs.existsSync(floodMaskPath), 'flood-cutout should write mask debug PNG');
assert(fs.existsSync(floodReportPath), 'flood-cutout should write JSON report');
const floodResult = PNG.sync.read(fs.readFileSync(floodOutputPath));
assert(getPixel(floodResult, 0, 0)[3] === 0, 'external background should become fully transparent');
assert(getPixel(floodResult, 5, 5)[3] === 255, 'internal background-colored hole should be preserved because it is not edge-connected');
assert(getPixel(floodResult, 2, 2)[3] === 0, 'edge glow ring should be removed');
assert(getPixel(floodResult, 3, 3)[3] === 255, 'foreground body should remain opaque');
const floodReport = JSON.parse(fs.readFileSync(floodReportPath, 'utf8'));
assert(floodReport.mode === 'edge-flood', 'flood report should name edge-flood mode');
assert(floodReport.removed_pixels > 0, 'flood report should count removed pixels');
assert(floodReport.edge_cleanup_pixels > 0, 'flood report should count edge cleanup pixels');
assert(floodReport.warnings.length === 0, `flood report should not warn for fixture: ${floodReport.warnings.join('; ')}`);

console.log(`Tests passed. Generated ${outputs.filter((item) => item.status === 'built').length} preview(s).`);
