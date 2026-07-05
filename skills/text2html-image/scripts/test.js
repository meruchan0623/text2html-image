const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const {
  ROOT,
  createProjectWorkspace,
  getProjectPaths,
  getUserDocumentsDir,
  getWorkspaceRoot,
  renderRows,
  sanitizeProjectFolderName,
  sanitizeProjectId,
  toFileUrl,
  validateScoreReport,
  validateWorkflow,
} = require('./utils/workflow-core');
const { listHtmlEntries } = require('./utils/html-entries');
const { inspectHtmlEditability } = require('./utils/dom-editability-core');
const { compilePosterIr } = require('./utils/poster-ir');
const { compileSvg } = require('./utils/svg-compiler');
const { routeAssets } = require('./utils/asset-routing-core');
const { checkTemplates } = require('./utils/template-registry-core');
const { checkCopySchema } = require('./utils/copy-schema-core');
const { runVisualIntake } = require('./utils/visual-intake-core');
const { composeCodexHtmlPrompt } = require('./utils/codex-html-prompt-core');
const { runCutoutDecompose, shouldAutoSemanticCutout } = require('./utils/cutout-decompose-core');
const { validateVisualReviewReport } = require('./utils/visual-review-core');
const { auditImagegenCandidate } = require('./utils/imagegen-candidate-core');
const { auditLayoutContract } = require('./utils/layout-contract-core');
const {
  auditVisualDomSnapshot,
  renderVisualDomOverlaySvg,
  renderVisualDomSummaryMarkdown,
} = require('./utils/visual-dom-audit-core');
const { auditExpectedRouteContract } = require('./utils/expected-route-contract-core');
const { auditSourceTruthBitmaps } = require('./utils/source-truth-bitmap-core');
const { auditBitmapLayerContract } = require('./utils/bitmap-layer-contract-core');
const { auditReviewGateContract } = require('./utils/review-gate-contract-core');
const { auditAssetReadinessContract } = require('./utils/asset-readiness-contract-core');
const { auditSourceTruthAcquisitionPlan } = require('./utils/source-truth-acquisition-core');
const { buildOverflowEvaluationScript, removeTemporaryDirectory } = require('./utils/overflow-audit-core');
const { comparePngImages } = require('./utils/visual-compare-core');
const { assertMacPersonCutoutAvailable } = require('./utils/person-cutout-mac-core');
const {
  buildNormalizedProjectIndex,
  buildPromotionCandidates,
  extractScore,
  normalizeProjectEvidence,
  normalizeStatus,
  safeReadJson,
  scanProjectRoots,
} = require('./utils/learning-evidence-core');
const {
  buildProductizationReport,
  renderNextTrainingPlan,
  renderProductizationMarkdown,
} = require('./utils/learning-report-core');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertThrows(fn, pattern, message) {
  try {
    fn();
  } catch (error) {
    if (!pattern.test(String(error.message || error))) {
      throw new Error(`${message}: unexpected error ${error.message || error}`);
    }
    return error;
  }
  throw new Error(`${message}: expected an error`);
}

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function maybeReadAbsolute(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function assertReadableProjectName(projectName, label) {
  assert(!/(^|[-_])(test|case|tmp|temp|random|fixture)([-_]|$)|^test-p\d+$/i.test(projectName), `${label} must use a readable non-test-like project folder name`);
}

const testFixturePaths = [];
const testFixtureOriginals = new Map();
function writeTestFixture(relativePath, content) {
  const target = path.join(ROOT, relativePath);
  if (!testFixtureOriginals.has(target)) {
    testFixtureOriginals.set(target, fs.existsSync(target) ? fs.readFileSync(target) : null);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  if (!testFixturePaths.includes(target)) testFixturePaths.push(target);
}

function cleanupTestFixtures() {
  for (const file of testFixturePaths.reverse()) {
    const original = testFixtureOriginals.get(file);
    if (original === null) {
      fs.rmSync(file, { force: true });
    } else if (original !== undefined) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, original);
    }
  }
  for (const dir of [
    'templates/copy_basic_poster',
    'templates/copy_layered_banner',
    'templates/copy_vector_poster',
    'templates/copy_phone_poster',
    'templates/copy_complex_poster',
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

  writeTestFixture('assets/source/sample-background.jpg', 'fixture background');
  writeTestFixture('assets/source/sample-panel-left.jpg', 'fixture left panel');
  writeTestFixture('assets/source/sample-panel-right.jpg', 'fixture right panel');

  writeTestFixture('templates/copy_basic_poster/master.html', `<!doctype html>
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
  writeTestFixture('templates/copy_basic_poster/master.css', `body { margin: 0; font-family: Arial, sans-serif; }
.poster { position: relative; background: #f7fbff; overflow: visible; }
.title { position: absolute; left: 64px; top: 80px; font-size: 64px; margin: 0; }
.subtitle { position: absolute; left: 64px; top: 170px; font-size: 32px; margin: 0; }
.price { position: absolute; left: 64px; top: 360px; font-size: 56px; }
.cta { position: absolute; left: 64px; bottom: 140px; font-size: 34px; }
.disclaimer { position: absolute; left: 64px; bottom: 70px; font-size: 18px; }
`);

  writeTestFixture('templates/copy_layered_banner/master.html', `<!doctype html>
<html lang="{{lang}}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="master.css">
</head>
<body class="{{lang_class}}">
  <main class="poster" style="width: {{canvas_width}}px; height: {{canvas_height}}px">
    <img class="background-art" src="{{bg_asset}}" data-asset-text-policy="preserve-raster" alt="">
    <section class="center-card">
      <h1 class="title" data-i18n-key="title">{{title}}</h1>
      <p class="subtitle" data-i18n-key="subtitle">{{subtitle}}</p>
      <span class="cta" data-i18n-key="cta">{{cta}}</span>
    </section>
    <figure class="panel panel-left"><img src="{{patch_asset_1}}" data-asset-text-policy="preserve-raster" alt=""></figure>
    <figure class="panel panel-right"><img src="{{patch_asset_2}}" data-asset-text-policy="preserve-raster" alt=""></figure>
  </main>
</body>
</html>
`);
  writeTestFixture('templates/copy_layered_banner/master.css', `body { margin: 0; font-family: Arial, sans-serif; }
.poster { position: relative; background: #dfeffc; overflow: visible; }
.background-art { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.center-card { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 420px; height: 260px; background: rgba(255,255,255,.9); }
.title { margin: 44px 0 0; text-align: center; font-size: 60px; }
.subtitle, .cta { display: block; text-align: center; font-size: 28px; }
.panel { position: absolute; margin: 0; }
.panel img { width: 180px; height: 120px; object-fit: cover; }
.panel-left { left: 90px; bottom: 40px; }
.panel-right { right: 90px; bottom: 40px; }
`);

  writeTestFixture('templates/copy_vector_poster/master.html', `<!doctype html>
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
  writeTestFixture('templates/copy_vector_poster/master.css', `body { margin: 0; font-family: Arial, sans-serif; }
.poster { position: relative; background: #ffffff; overflow: visible; }
.map-base { position: absolute; left: 0; top: 0; }
.map-label { position: absolute; color: #fff; font-weight: 700; transform: translate(-50%, -50%); }
.label-lg { font-size: 28px; }
.title-pill { position: absolute; left: 560px; top: 1130px; width: 370px; height: 72px; display: flex; align-items: center; justify-content: center; color: white; background: #415BA8; border-radius: 36px; }
`);

  writeTestFixture('templates/copy_phone_poster/master.html', `<!doctype html>
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
  writeTestFixture('templates/copy_phone_poster/master.css', `body { margin: 0; font-family: Arial, sans-serif; }
.poster { position: relative; background: #f5f8ff; overflow: visible; }
.title { position: absolute; left: 80px; top: 90px; font-size: 72px; }
.subtitle { position: absolute; left: 80px; top: 190px; font-size: 30px; }
.phone { position: absolute; left: 340px; top: 360px; width: 420px; height: 620px; border: 8px solid #222; border-radius: 42px; }
`);

  writeTestFixture('templates/copy_complex_poster/master.html', `<!doctype html>
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
  writeTestFixture('templates/copy_complex_poster/master.css', `body { margin: 0; font-family: Arial, sans-serif; }
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
  'person-cutout-mac.js',
  'audit-dom.js',
  'route-assets.js',
  'template-check.js',
  'copy-schema.js',
  'visual-intake.js',
  'cutout-decompose.js',
  'compose-codex-html-prompt.js',
  'visual-review.js',
  'audit-imagegen-candidates.js',
  'audit-expected-routes.js',
  'audit-source-truth-bitmaps.js',
  'audit-bitmap-layers.js',
  'audit-review-gates.js',
  'audit-asset-readiness.js',
  'audit-source-truth-acquisition.js',
  'audit-overflow.js',
  'audit-visual-compare.js',
  'audit-visual-dom.js',
  'learning-index.js',
  'learning-report.js',
  'test.js',
]) {
  assert(fs.existsSync(path.join(ROOT, 'scripts', script)), `missing package script target scripts/${script}`);
}

const packageJson = JSON.parse(read('package.json'));
assert(packageJson.scripts['render:profile'] === 'node scripts/render-fast.js --profile-only', 'package.json missing render:profile script');
assert(packageJson.scripts['export-fast'] === 'node scripts/render-fast.js', 'package.json missing export-fast script');
assert(packageJson.scripts['flood-cutout'] === 'node scripts/flood-cutout.js', 'package.json missing flood-cutout script');
assert(packageJson.scripts['cutout:person-mac'] === 'node scripts/person-cutout-mac.js', 'package.json missing cutout:person-mac script');
assert(packageJson.scripts['audit:dom'] === 'node scripts/audit-dom.js', 'package.json missing audit:dom script');
assert(packageJson.scripts['route:assets'] === 'node scripts/route-assets.js', 'package.json missing route:assets script');
assert(packageJson.scripts['template:check'] === 'node scripts/template-check.js', 'package.json missing template:check script');
assert(packageJson.scripts['copy-schema'] === 'node scripts/copy-schema.js', 'package.json missing copy-schema script');
assert(packageJson.scripts['visual:intake'] === 'node scripts/visual-intake.js', 'package.json missing visual:intake script');
assert(packageJson.scripts['prompt:compose'] === 'node scripts/compose-codex-html-prompt.js', 'package.json missing prompt:compose script');
assert(packageJson.scripts['cutout:decompose'] === 'node scripts/cutout-decompose.js', 'package.json missing cutout:decompose script');
assert(packageJson.scripts['visual:review'] === 'node scripts/visual-review.js', 'package.json missing visual:review script');
assert(packageJson.scripts['audit:imagegen'] === 'node scripts/audit-imagegen-candidates.js', 'package.json missing audit:imagegen script');
assert(packageJson.scripts['audit:routes'] === 'node scripts/audit-expected-routes.js', 'package.json missing audit:routes script');
assert(packageJson.scripts['audit:source-truth'] === 'node scripts/audit-source-truth-bitmaps.js', 'package.json missing audit:source-truth script');
assert(packageJson.scripts['audit:bitmap-layers'] === 'node scripts/audit-bitmap-layers.js', 'package.json missing audit:bitmap-layers script');
assert(packageJson.scripts['audit:review-gates'] === 'node scripts/audit-review-gates.js', 'package.json missing audit:review-gates script');
assert(packageJson.scripts['audit:asset-readiness'] === 'node scripts/audit-asset-readiness.js', 'package.json missing audit:asset-readiness script');
assert(packageJson.scripts['audit:source-truth-acquisition'] === 'node scripts/audit-source-truth-acquisition.js', 'package.json missing audit:source-truth-acquisition script');
assert(packageJson.scripts['audit:overflow'] === 'node scripts/audit-overflow.js', 'package.json missing audit:overflow script');
assert(packageJson.scripts['audit:visual-compare'] === 'node scripts/audit-visual-compare.js', 'package.json missing audit:visual-compare script');
assert(packageJson.scripts['audit:visual-dom'] === 'node scripts/audit-visual-dom.js', 'package.json missing audit:visual-dom script');
assert(packageJson.scripts['learning:index'] === 'node scripts/learning-index.js', 'package.json missing learning:index script');
assert(packageJson.scripts['learning:report'] === 'node scripts/learning-report.js', 'package.json missing learning:report script');
for (const dependency of ['@resvg/resvg-js', 'css-tree', 'parse5']) {
  assert(packageJson.dependencies?.[dependency] || packageJson.devDependencies?.[dependency], `package.json missing ${dependency}`);
}
assert(packageJson.dependencies?.pngjs || packageJson.devDependencies?.pngjs, 'package.json missing pngjs');

const config = JSON.parse(read('workflow.config.json'));
const copyRows = JSON.parse(read('data/copy_master.json')).data;
const preflightRows = copyRows.length ? copyRows : [{
  source_row_id: 'PREFLIGHT_ROW',
  template_id: 'T01_price_type',
  platform: 'test',
  canvas_w: 1024,
  canvas_h: 1280,
  lang: 'en-US',
  sku: 'PREFLIGHT',
  title: 'Preflight poster',
  subtitle: 'Contract row',
  cta: 'Open',
  disclaimer: 'Fixture row',
  price: '1',
  currency: '$',
  unit: '',
}];
const templatePreflight = checkTemplates({ rows: preflightRows });
assert(templatePreflight.status === 'pass', `template preflight should pass after test fixtures are prepared: ${templatePreflight.missing_templates.join(', ')}`);
assert(templatePreflight.templates.some((item) => item.template_id === preflightRows[0].template_id), 'template preflight should include the active preflight template');
const missingTemplatePreflight = checkTemplates({
  rows: [{ source_row_id: 'missing-row', template_id: 'missing-template-id' }],
});
assert(missingTemplatePreflight.status === 'fail', 'template preflight should fail for a missing template');
assert(missingTemplatePreflight.missing_templates.includes('missing-template-id'), 'template preflight should report the missing template id');
const copySchemaPass = checkCopySchema({ rows: preflightRows });
assert(copySchemaPass.status === 'pass', `copy schema should pass for test fixtures: ${copySchemaPass.errors.join('; ')}`);
const brokenCopyRows = preflightRows.map((row, index) => {
  if (index !== 0) return row;
  const next = { ...row };
  delete next.title;
  return next;
});
const copySchemaFail = checkCopySchema({ rows: brokenCopyRows });
assert(copySchemaFail.status === 'fail', 'copy schema should fail when a required token source field is missing');
assert(copySchemaFail.errors.some((error) => error.includes('missing title')), 'copy schema should name the missing title field');

assert(Array.isArray(config.workflow_phases), 'workflow.config.json missing workflow_phases');
assert(config.workflow_phases.length === 6, 'workflow must have six phases');
assert(config.workspace_root === '$DOCUMENTS/text2html-image-project', 'workflow.config.json must use the system Documents text2html-image-project workspace_root');
assert(!/CloudStorage|OneDrive|文档/.test(config.workspace_root), 'workflow.config.json must not point output projects at cloud/localized document folders');
assert(getWorkspaceRoot(config) === path.join(getUserDocumentsDir(), 'text2html-image-project'), 'workspace_root must resolve to the system Documents text2html-image-project folder');
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
  assert(body.includes('~/Documents/text2html-image-project'), `${file} must explicitly document the system Documents output root`);
  assert(body.includes('Do not use CloudStorage, OneDrive, or localized `文档` paths'), `${file} must forbid cloud/localized document output roots`);
  assert(body.includes('## HTML Grouping'), `${file} must document html grouping`);
  assert(body.includes('## 抄图复刻流程'), `${file} must document the copy-image workflow`);
  assert(body.includes('Multimodal image reading'), `${file} must document multimodal screenshot review`);
  assert(body.includes('静态 `index.html`'), `${file} must require static HTML output`);
  assert(body.includes('refresh the browser preview'), `${file} must require refreshing the browser preview`);
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
assert(skillBody.includes('## Complex Art Asset Split Contract'), 'skill must document complex art asset splitting');
assert(skillBody.includes('reports/split-art-assets.json'), 'skill must require split art asset reporting');
assert(skillBody.includes('asset_source_type'), 'skill must require complex art asset provenance');
assert(skillBody.includes('old_geometric_css=false'), 'skill must require stale geometric CSS checks');
assert(skillBody.includes('人物、地图、云和天际线，应用程序图标这些难以用 SVG 或图形线条复刻的部分'), 'skill must include the fixed complex asset routing prompt');
assert(skillBody.includes('application_icon'), 'skill must document application_icon routing');
assert(skillBody.includes('app_icon'), 'skill must document app_icon routing');
assert(skillBody.includes('complex_icon'), 'skill must document complex_icon routing');
assert(skillBody.includes('simple_icon'), 'skill must keep simple_icon as vector-editable');
assert(skillBody.includes('## Reverse Prompt Asset Routing'), 'skill must document reverse prompt asset routing');
assert(skillBody.includes('reports/reverse-prompt-brief.md'), 'skill must require reverse prompt brief output');
assert(skillBody.includes('reports/asset-routing-table.json'), 'skill must require asset routing table output');
assert(skillBody.includes('route": "regenerated_image"'), 'skill must document regenerated image routing');
assert(skillBody.includes('cutout_feasibility'), 'skill must document cutout feasibility scoring');
assert(skillBody.includes('regeneration_fit'), 'skill must document regeneration fit scoring');
assert(skillBody.includes('asset-generation-prompts.json'), 'skill must document image generation prompt package');
assert(skillBody.includes('npm run template:check'), 'skill must document template:check command');
assert(skillBody.includes('npm run copy-schema'), 'skill must document copy-schema command');
assert(skillBody.includes('npm run visual:intake'), 'skill must document visual:intake command');
assert(skillBody.includes('## Codex First-Pass HTML Prompt Bundle'), 'skill must document Codex first-pass prompt bundle');
assert(skillBody.includes('reports/codex-first-pass-html-prompt.md'), 'skill must document codex first-pass prompt output');
assert(skillBody.includes('npm run prompt:compose'), 'skill must document prompt:compose command');
assert(skillBody.includes('npm run cutout:decompose'), 'skill must document cutout:decompose command');
assert(skillBody.includes('npm run visual:review'), 'skill must document visual:review command');
assert(skillBody.includes('element-decomposition-plan.json'), 'skill must document element decomposition plan output');
assert(skillBody.includes('mask-quality-report.json'), 'skill must document mask quality report output');
assert(skillBody.includes('cutout-layer-package.json'), 'skill must document cutout layer package output');
assert(skillBody.includes('PNG output with a real alpha channel'), 'skill must require ImageGen PNG assets with real alpha channel');
assert(skillBody.includes('green screen, green background, chroma key background'), 'skill must forbid green/chroma-key ImageGen backgrounds');
assert(skillBody.includes('transparent PNG with alpha channel'), 'skill must require transparent PNG with alpha channel in regenerated prompts');
assert(skillBody.includes('## Flood Cutout Asset Cleanup'), 'skill must document flood cutout asset cleanup');
assert(skillBody.includes('npm run flood-cutout'), 'skill must document flood-cutout command');
assert(skillBody.includes('## Mac-only Person Vision Cutout'), 'skill must document Mac-only person cutout');
assert(skillBody.includes('macOS only'), 'skill must explicitly say Mac person cutout is macOS only');
assert(skillBody.includes('Apple Vision'), 'skill must name Apple Vision for Mac person cutout');
assert(skillBody.includes('VNGeneratePersonSegmentationRequest'), 'skill must document Vision person segmentation request');
assert(skillBody.includes('VNGenerateForegroundInstanceMaskRequest'), 'skill must document Vision foreground instance request');
assert(skillBody.includes('same-canvas transparent PNG'), 'skill must require same-canvas transparent PNG output');
assert(skillBody.includes('cropped transparent PNG'), 'skill must require cropped transparent PNG output');
assert(skillBody.includes('alpha mask'), 'skill must require alpha mask output');
assert(skillBody.includes('cutout:person-mac requires macOS with Apple Vision and swift'), 'skill must document non-mac failure message');
assert(skillBody.includes('Auto Semantic Cutout Dispatch'), 'skill must document automatic semantic cutout dispatch');
assert(skillBody.includes('cutout:decompose auto-dispatches'), 'skill must document cutout:decompose auto-dispatch behavior');
assert(skillBody.includes('provide_external_semantic_mask_or_regenerated_asset'), 'skill must document unsupported semantic cutout next action');
assert(skillBody.includes('npm run audit:imagegen'), 'skill must document audit:imagegen command');
assert(skillBody.includes('npm run audit:asset-readiness'), 'skill must document audit:asset-readiness command');
assert(skillBody.includes('npm run audit:source-truth-acquisition'), 'skill must document audit:source-truth-acquisition command');
assert(skillBody.includes('npm run learning:index'), 'skill must document learning:index command');
assert(skillBody.includes('npm run learning:report'), 'skill must document learning:report command');
assert(skillBody.includes('Do not resume broad ImageGen training until the learning report exists'), 'skill must block broad training before productization report');
assert(skillBody.includes('promotion-candidates.json'), 'skill must document promotion candidates output');
assert(skillBody.includes('training-productization-report.md'), 'skill must document training productization report output');
assert(skillBody.includes('Mini-batch productization review'), 'skill must document mini-batch productization review');
assert(skillBody.includes('do not treat the candidate as eliminated'), 'skill must keep historical failure candidates until tests or reports prove elimination');
assert(skillBody.includes('hard-gated success only promotes rules that all hard gates prove'), 'skill must restrict skill-rule promotion to hard-gated evidence');
assert(skillBody.includes('--routing <asset-routing-table.json>'), 'skill must document asset-readiness routing input');
assert(skillBody.includes('requires_independent_children'), 'skill must document independent child asset contract field');
assert(skillBody.includes('source type or route, source/output path, dimensions, checksum, and license/source scope'), 'skill must document final source-truth metadata requirements');
assert(skillBody.includes('blocking_condition') && skillBody.includes('evidence_required'), 'skill must document source-truth acquisition blocker metadata requirements');
assert(skillBody.includes('reports/imagegen-candidates.json'), 'skill must document imagegen candidate audit report');
assert(skillBody.includes('transparency_method'), 'skill must document ImageGen transparency provenance metadata');
assert(skillBody.includes('*-mask-debug.png'), 'skill must require mask debug output');
assert(skillBody.includes('*-cutout-report.json'), 'skill must require cutout report output');
assert(skillBody.includes('PNG layers must not contain poster-level title'), 'skill must forbid localized poster text in PNG layers');
assert(skillBody.includes('data-i18n-key'), 'skill must require i18n metadata for editable text');
assert(skillBody.includes('## Phone Poster Layering Pitfalls'), 'skill must document phone poster layering pitfalls');
assert(skillBody.includes('same-canvas layer touches the canvas edge'), 'skill must document same-canvas edge flood-cutout risk');
assert(skillBody.includes('Partial alpha that is not removed can become a dark opaque seam'), 'skill must document partial-alpha seam risk');
assert(skillBody.includes('a small plane icon in a product pill'), 'skill must prefer SVG/CSS for small UI art assets');
assert(skillBody.includes('QR codes and scannable codes are bitmap truth assets'), 'skill must require QR/scannable codes as cropped bitmap assets');
assert(skillBody.includes('phone safe-area'), 'skill must document phone safe-area layering checks');
assert(skillBody.includes('overflow-wrap: anywhere'), 'skill must document translation-resilient enlarged layouts');
assert(skillBody.includes('outputs/<deliverable>/html/index.html'), 'skill must document detached deliverable path depth checks');
assert(skillBody.includes('Resolved local image paths from the active HTML path'), 'completion contract must verify image paths from active HTML');
assert(skillBody.includes('QR/scannable-code crop path'), 'completion contract must include QR crop verification');
assert(skillBody.includes('final-ready `<img>` layers with explicit pixel `left`, `top`, `width`, and `height`'), 'skill must document export-safe final-ready bitmap image placement');
assert(skillBody.includes('png-export-report.json` image-layer visibility evidence'), 'skill must document final PNG bitmap layer visibility evidence');
assert(skillBody.includes('source-alpha-aware'), 'skill must document source-alpha-aware bitmap visibility sampling');
assert(skillBody.includes('## Draw/Edit Rework Guard'), 'skill must document draw/edit rework guard');
assert(skillBody.includes('prompt_only is not a finished transparent asset'), 'skill must block prompt-only transparent layers from final HTML');
assert(skillBody.includes('flood-cutout is not semantic segmentation'), 'skill must document flood-cutout semantic boundary');
assert(skillBody.includes('rectangular mask is not semantic cutout proof'), 'skill must document rectangular mask semantic cutout limitation');
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
assert(skillBody.includes('npm run audit:overflow'), 'skill must document audit:overflow command');
assert(skillBody.includes('cell-overflow-report.json'), 'skill must mention cell-overflow-report.json');
assert(skillBody.includes('DOM editability report path'), 'completion contract must include DOM editability report');
assert(skillBody.includes('dom-editability-report.json'), 'skill must mention dom-editability-report.json');
assert(skillBody.includes('## Final Preview Links'), 'skill must document final preview links');
assert(skillBody.includes('preview-links.md'), 'skill must require a preview links report');
assert(skillBody.includes('Every plain-text report or final response that references an HTML preview must include the local HTML file path'), 'skill must require local HTML file paths in plain-text reports');
assert(skillBody.includes('required handoff for every image-edit round'), 'skill must require HTML preview links every image-edit round');
assert(skillBody.includes('Browser annotation capability is optional'), 'skill must document optional browser annotation capability');
assert(skillBody.includes('Do not claim browser annotation was used unless the current session probe succeeds'), 'skill must forbid unverified annotation claims');
assert(skillBody.includes('## Reference-vs-Render Hard Gate'), 'skill must document reference-vs-render hard gate');
assert(skillBody.includes('reports/reference-vs-render-review.json'), 'skill must require reference-vs-render review JSON before completion');
assert(skillBody.includes('reports/reference-vs-render-review.md'), 'skill must require reference-vs-render review markdown before completion');
assert(skillBody.includes('npm run audit:visual-compare'), 'skill must document audit:visual-compare command');
assert(skillBody.includes('audit:visual-dom'), 'SKILL.md must document audit:visual-dom command');
assert(skillBody.includes('visual-dom-audit.json'), 'SKILL.md must treat visual DOM failures as completion blockers');
assert(skillBody.includes('reference-vs-render-pixel-audit.json'), 'skill must document pixel audit output for reference-vs-render evidence');
assert(skillBody.includes('reference-vs-render-diff.png'), 'skill must document visual compare diff map output');
assert(skillBody.includes('reference-vs-render-overlay.png'), 'skill must document visual compare overlay output');
assert(skillBody.includes('reference-vs-render-heatmap.json'), 'skill must document visual compare heatmap output');
assert(skillBody.includes('reference-vs-render-repair-queue.json'), 'skill must document visual compare repair queue output');
assert(skillBody.includes('baked raster text conflicts with DOM overlays'), 'skill must document baked raster text and DOM overlay conflicts');
assert(skillBody.includes('clean no-text base'), 'skill must require clean no-text base layers before DOM overlays are considered visually clean');
const executionFlow = read('references/execution-flow.md');
assert(executionFlow.includes('Reference Image Asset Routing'), 'execution flow must document reference image asset routing');
assert(executionFlow.includes('asset-routing-table.json'), 'execution flow must include asset routing table evidence');
assert(executionFlow.includes('npm run audit:routes'), 'execution flow must include expected route contract audit command');
assert(executionFlow.includes('route-contract-audit.json'), 'execution flow must include expected route contract audit evidence');
assert(executionFlow.includes('npm run audit:source-truth'), 'execution flow must include source-truth bitmap audit command');
assert(executionFlow.includes('source-truth-bitmap-audit.json'), 'execution flow must include source-truth bitmap audit evidence');
assert(executionFlow.includes('npm run audit:bitmap-layers'), 'execution flow must include bitmap layer contract audit command');
assert(executionFlow.includes('bitmap-layer-contract-audit.json'), 'execution flow must include bitmap layer contract audit evidence');
assert(executionFlow.includes('npm run audit:review-gates'), 'execution flow must include review-gate audit command');
assert(executionFlow.includes('review-gate-contract-audit.json'), 'execution flow must include review-gate audit evidence');
assert(executionFlow.includes('npm run audit:asset-readiness'), 'execution flow must include asset readiness audit command');
assert(executionFlow.includes('asset-readiness-audit.json'), 'execution flow must include asset readiness audit evidence');
assert(executionFlow.includes('npm run audit:source-truth-acquisition'), 'execution flow must include source-truth acquisition audit command');
assert(executionFlow.includes('source-truth-acquisition-audit.json'), 'execution flow must include source-truth acquisition audit evidence');
assert(executionFlow.includes('--routing <asset-routing-table.json>'), 'execution flow must document asset readiness routing input');
assert(executionFlow.includes('asset-provenance.json'), 'execution flow must include asset provenance evidence');
assert(executionFlow.includes('split-art-assets.json'), 'execution flow must include split art assets evidence');
assert(executionFlow.includes('asset-generation-prompts.json'), 'execution flow must include generated prompt package evidence');
assert(executionFlow.includes('codex-first-pass-html-prompt.md'), 'execution flow must include codex prompt bundle evidence');
assert(executionFlow.includes('transparent PNG with alpha channel'), 'execution flow must require transparent PNG ImageGen prompts');
assert(executionFlow.includes('npm run audit:imagegen'), 'execution flow must include ImageGen candidate audit command');
assert(executionFlow.includes('reports/imagegen-candidates.json'), 'execution flow must include ImageGen candidate report');
assert(executionFlow.includes('transparency_method'), 'execution flow must document ImageGen transparency provenance metadata');
assert(executionFlow.includes('green-background channel images'), 'execution flow must reject green-background channel images');
assert(executionFlow.includes('人物、地图、云和天际线，应用程序图标这些难以用 SVG 或图形线条复刻的部分'), 'execution flow must include the fixed complex asset routing prompt');
assert(executionFlow.includes('visual-intake-manifest.json'), 'execution flow must document visual intake manifest');
assert(executionFlow.includes('element-decomposition-plan.json'), 'execution flow must document element decomposition plan');
assert(executionFlow.includes('mask-quality-report.json'), 'execution flow must document mask quality report');
assert(executionFlow.includes('cutout-layer-package.json'), 'execution flow must document cutout layer package');
assert(executionFlow.includes('visual-review-round-NN.json'), 'execution flow must document visual review rounds');
assert(executionFlow.includes('layout-contract-audit.json'), 'execution flow must include key-region layout contract evidence');
assert(executionFlow.includes('key-region overlap'), 'execution flow must require key-region overlap checks');
assert(executionFlow.includes('Visual-DOM preview gate'), 'execution flow must include the Visual-DOM preview gate');
assert(executionFlow.includes('visual-dom-audit.json'), 'execution flow must name the visual DOM report artifact');
assert(executionFlow.includes('reference-vs-render-overlay.png'), 'execution flow must name the visual compare overlay artifact');
assert(executionFlow.includes('reference-vs-render-repair-queue.json'), 'execution flow must name the visual compare repair queue artifact');
assert(executionFlow.includes('dom-editability-report.json'), 'execution flow must include DOM editability report');
assert(executionFlow.includes('dom-editability-summary.md'), 'execution flow must include DOM editability summary');
assert(executionFlow.includes('plain-text reports must include local HTML file paths'), 'execution flow must require local HTML file paths in plain-text reports');
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
assert(executionFlow.includes('reports/reference-vs-render-review.json'), 'execution flow must include reference-vs-render review JSON gate');
assert(executionFlow.includes('reports/reference-vs-render-review.md'), 'execution flow must include reference-vs-render review markdown gate');
assert(executionFlow.includes('visual similarity cannot override DOM or asset-route failure'), 'execution flow must state visual similarity cannot override DOM or asset route failure');
assert(executionFlow.includes('Mini-batch productization review'), 'execution flow must document mini-batch productization review');
assert(executionFlow.includes('missing_review_gate, prompt_only_not_review_gated, or no_accepted_imagegen_candidate'), 'execution flow must name high-confidence failure candidates for productization review');
const stageGuides = read('references/stage-guides.md');
assert(stageGuides.includes('Complex art source types'), 'stage guides must document complex art source types');
assert(stageGuides.includes('reference_cutout'), 'stage guides must document reference cutout routing');
assert(stageGuides.includes('regenerated_image'), 'stage guides must document regenerated image routing');
assert(stageGuides.includes('prompt-only visual brief'), 'stage guides must keep visual briefs separate from assets');
assert(stageGuides.includes('cutout_feasibility'), 'stage guides must document cutout feasibility');
assert(stageGuides.includes('人物、地图、云和天际线，应用程序图标这些难以用 SVG 或图形线条复刻的部分'), 'stage guides must include the fixed complex asset routing prompt');
assert(stageGuides.includes('reports/export-report.json'), 'stage-guides must mention export-report.json');
assert(stageGuides.includes('Current `npm run batch-export` is report-only'), 'stage-guides must mention batch-export report-only mode');
assert(stageGuides.includes('Local HTML file path'), 'stage-guides must require local HTML file paths in final reports');
assert(stageGuides.includes('One HTML group -> direct `html/index.html`'), 'stage-guides must document single-group html output path');
assert(stageGuides.includes('Multiple HTML groups -> `html/<html-group>/`.'), 'stage-guides must document multi-group html output path');
assert(stageGuides.includes('One export group -> direct `exports/`'), 'stage-guides must document single export-group path');
assert(stageGuides.includes('Multiple delivery/export packs -> `exports/<delivery-id-or-group>/`'), 'stage-guides must document multi-delivery export path');
assert(stageGuides.includes('Iterative screenshots/scores/masks/temp export diagnostics -> `runs/latest/`'), 'stage-guides must document run-level iterative diagnostics path');
assert(stageGuides.includes('Prompt package is not an asset'), 'stage guides must separate prompt packages from usable assets');
assert(stageGuides.includes('npm run prompt:compose'), 'stage guides must require prompt:compose before first-pass HTML');
assert(stageGuides.includes('Visual intake is a hypothesis package'), 'stage guides must document visual intake hypothesis status');
assert(stageGuides.includes('Cutout decomposition is not a provider client'), 'stage guides must document provider-neutral cutout decomposition');
assert(stageGuides.includes('Mask quality requires alpha evidence'), 'stage guides must document alpha evidence for masks');
assert(stageGuides.includes('ImageGen / Codex image generation must request transparent PNG with alpha channel'), 'stage guides must require alpha PNG ImageGen assets');
assert(stageGuides.includes('npm run audit:imagegen'), 'stage guides must require ImageGen candidate audit command');
assert(stageGuides.includes('green screen, green background, chroma key background'), 'stage guides must forbid green/chroma-key ImageGen backgrounds');
assert(stageGuides.includes('edge_fringe_green_ratio'), 'stage guide must preserve explicit fringe ratio evidence');
assert(stageGuides.includes('explicit fringe evidence blocks final HTML'), 'stage guide must state that explicit fringe evidence blocks final HTML');
assert(stageGuides.includes('real PNG with alpha channel'), 'stage guides must keep regenerated_image prompt-only until real alpha PNG exists');
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
  assert(rootReadmeBody.includes('人物、地图、云和天际线，应用程序图标这些难以用 SVG 或图形线条复刻的部分'), 'root README must explain fixed complex asset routing');
  assert(rootReadmeBody.includes('平文本报告必须包含本地 HTML 文件路径'), 'root README must document local HTML paths in plain-text reports');
  assert(rootReadmeBody.includes('带 alpha 透明通道的 PNG'), 'root README must tell users to request alpha PNG assets');
  assert(rootReadmeBody.includes('不要绿幕、绿色背景'), 'root README must forbid green-screen generated assets');
  assert(rootReadmeBody.includes('~/Documents/text2html-image-project'), 'root README must explicitly document the system Documents output root');
  assert(rootReadmeBody.includes('不要使用 CloudStorage、OneDrive 或本地化 `文档` 路径'), 'root README must forbid cloud/localized document output roots');
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

assert(sanitizeProjectId('Copy Image Poster With Long Name') === 'copy-image-poster', 'project ids should be kebab-case and max 20 chars');
assert(sanitizeProjectId('Page Master A') === 'page-master-a', 'subproject ids should be kebab-case');
assert(sanitizeProjectFolderName('商品主图复刻-价格促销海报-清爽商务风') === '商品主图复刻-价格促销海报-清爽商务风', 'project folder names should preserve Chinese title and notes');
assert(sanitizeProjectFolderName('Product Poster Recreation / Price Promo / Clean Business Style') === 'Product-Poster-Recreation-Price-Promo-Clean-Business-Style', 'project folder names should keep readable English notes');
assert(sanitizeProjectFolderName('  :::  ') === 'default', 'empty project folder names should fall back to default');

const projectId = 'workflow-preview-validation-recreation';
assertReadableProjectName(projectId, 'test harness project id');
const projectPaths = createProjectWorkspace(projectId);
for (const dir of ['source', 'working', 'html', 'screenshots', 'scores', 'exports', 'reports']) {
  assert(fs.existsSync(projectPaths[dir]), `project workspace missing ${dir}`);
}
assert(projectPaths.workspace_root === path.join(getUserDocumentsDir(), 'text2html-image-project'), 'project workspace root must be under the system Documents text2html-image-project folder');
assert(projectPaths.root.startsWith(`${path.join(getUserDocumentsDir(), 'text2html-image-project')}${path.sep}`), `project root must be under system Documents text2html-image-project: ${projectPaths.root}`);
assert(!/CloudStorage|OneDrive|文档/.test(projectPaths.root), `project root must not use cloud/localized document folders: ${projectPaths.root}`);
assert(projectPaths.root.endsWith(path.join('text2html-image-project', projectId)), 'project root should be directly under text2html-image-project');

const subprojectPaths = createProjectWorkspace('Copy Image Poster With Long Name', { subprojectId: 'Page Master A' });
assert(subprojectPaths.project_id === 'Copy-Image-Poster-With-Long-Name', 'project folder name should preserve readable title words');
assert(subprojectPaths.subproject_id === 'Page-Master-A', 'subproject folder name should preserve readable title words');
assert(subprojectPaths.root.startsWith(`${path.join(getUserDocumentsDir(), 'text2html-image-project')}${path.sep}`), `subproject root must be under system Documents text2html-image-project: ${subprojectPaths.root}`);
assert(subprojectPaths.root.endsWith(path.join('text2html-image-project', 'Copy-Image-Poster-With-Long-Name', 'Page-Master-A')), 'subproject root should use shallow nesting under readable project folder');

const chineseProjectPaths = createProjectWorkspace('商品主图复刻-价格促销海报-清爽商务风');
assert(chineseProjectPaths.project_id === '商品主图复刻-价格促销海报-清爽商务风', 'Chinese project title and inferred image type/style notes should become the folder name');
assert(chineseProjectPaths.root.endsWith(path.join('text2html-image-project', '商品主图复刻-价格促销海报-清爽商务风')), 'Chinese project root should stay readable under text2html-image-project');

const defaultPaths = getProjectPaths();
assert(defaultPaths.project_id === 'default', 'missing project should use default project id');
assert(defaultPaths.root.startsWith(`${path.join(getUserDocumentsDir(), 'text2html-image-project')}${path.sep}`), `default project root must be under system Documents text2html-image-project: ${defaultPaths.root}`);

const learningFixtureRoot = path.join(projectPaths.root, 'learning-productization-fixtures');
fs.rmSync(learningFixtureRoot, { recursive: true, force: true });
fs.mkdirSync(learningFixtureRoot, { recursive: true });

const learningSuccessProject = path.join(learningFixtureRoot, 'airport-pricing-source-truth-success');
fs.mkdirSync(path.join(learningSuccessProject, 'source'), { recursive: true });
fs.mkdirSync(path.join(learningSuccessProject, 'html'), { recursive: true });
fs.mkdirSync(path.join(learningSuccessProject, 'exports'), { recursive: true });
fs.mkdirSync(path.join(learningSuccessProject, 'reports'), { recursive: true });
fs.writeFileSync(path.join(learningSuccessProject, 'source', 'reference.png'), 'reference');
fs.writeFileSync(path.join(learningSuccessProject, 'html', 'index.html'), '<!doctype html><main></main>');
fs.writeFileSync(path.join(learningSuccessProject, 'exports', 'index.png'), 'export');
fs.writeFileSync(path.join(learningSuccessProject, 'reports', 'project-summary.json'), JSON.stringify({
  status: 'complete',
  similarity_score: 89,
}, null, 2));
fs.writeFileSync(path.join(learningSuccessProject, 'reports', 'reference-vs-render-review.json'), JSON.stringify({
  status: 'pass',
  visual_similarity_score: 89,
}, null, 2));
fs.writeFileSync(path.join(learningSuccessProject, 'reports', 'dom-editability-report.json'), JSON.stringify({ status: 'pass' }, null, 2));
fs.writeFileSync(path.join(learningSuccessProject, 'reports', 'cell-overflow-report.json'), JSON.stringify({ status: 'pass' }, null, 2));
fs.writeFileSync(path.join(learningSuccessProject, 'reports', 'asset-readiness-audit.json'), JSON.stringify({ status: 'pass' }, null, 2));
fs.writeFileSync(path.join(learningSuccessProject, 'reports', 'source-truth-acquisition-audit.json'), JSON.stringify({ status: 'pass' }, null, 2));
fs.writeFileSync(path.join(learningSuccessProject, 'reports', 'route-contract-audit.json'), JSON.stringify({ status: 'pass' }, null, 2));
fs.writeFileSync(path.join(learningSuccessProject, 'reports', 'reference-vs-render-pixel-audit.json'), JSON.stringify({ status: 'pass', similarity_score: 88 }, null, 2));

assert(safeReadJson(path.join(learningSuccessProject, 'reports', 'project-summary.json')).status === 'complete', 'learning safeReadJson should read valid JSON');
assert(safeReadJson(path.join(learningSuccessProject, 'reports', 'missing.json')) === null, 'learning safeReadJson should return null for missing JSON');
assert(normalizeStatus('PASS') === 'pass', 'learning normalizeStatus should lowercase pass');
assert(normalizeStatus('partial_pass_with_review_gaps') === 'review', 'learning normalizeStatus should map partial pass to review');
assert(normalizeStatus('not_applicable') === 'not_applicable', 'learning normalizeStatus should preserve not_applicable');
assert(normalizeStatus(undefined) === 'missing', 'learning normalizeStatus should map empty values to missing');
assert(extractScore({ visual_score: 77 }, { similarity_score: 88 }) === 77, 'learning extractScore should use first available score');
assert(extractScore({ status: 'pass' }) === null, 'learning extractScore should return null when no score exists');

const normalizedSuccess = normalizeProjectEvidence(learningSuccessProject);
assert(normalizedSuccess.project_id === 'airport-pricing-source-truth-success', 'learning normalizer should use folder name as project id');
assert(normalizedSuccess.classification === 'success', `learning success project should classify as success, got ${normalizedSuccess.classification}`);
assert(normalizedSuccess.visual.score === 89, 'learning normalizer should capture visual score');
assert(normalizedSuccess.visual.pixel_score === 88, 'learning normalizer should capture pixel score');
assert(normalizedSuccess.gates.dom_editability === 'pass', 'learning normalizer should capture DOM gate');
assert(normalizedSuccess.gates.source_truth === 'pass', 'learning normalizer should capture source-truth gate');
assert(normalizedSuccess.paths.reference.endsWith('source/reference.png'), 'learning normalizer should preserve reference path');

const learningReviewProject = path.join(learningFixtureRoot, 'logo-review-gap-project');
fs.mkdirSync(path.join(learningReviewProject, 'source'), { recursive: true });
fs.mkdirSync(path.join(learningReviewProject, 'html'), { recursive: true });
fs.mkdirSync(path.join(learningReviewProject, 'exports'), { recursive: true });
fs.mkdirSync(path.join(learningReviewProject, 'reports'), { recursive: true });
fs.writeFileSync(path.join(learningReviewProject, 'source', 'reference.png'), 'reference');
fs.writeFileSync(path.join(learningReviewProject, 'html', 'index.html'), '<!doctype html><main></main>');
fs.writeFileSync(path.join(learningReviewProject, 'exports', 'index.png'), 'export');
fs.writeFileSync(path.join(learningReviewProject, 'reports', 'project-summary.json'), JSON.stringify({ status: 'complete', similarity_score: 82 }, null, 2));
fs.writeFileSync(path.join(learningReviewProject, 'reports', 'reference-vs-render-review.json'), JSON.stringify({ status: 'pass', visual_similarity_score: 82 }, null, 2));
fs.writeFileSync(path.join(learningReviewProject, 'reports', 'dom-editability-report.json'), JSON.stringify({ status: 'pass' }, null, 2));
fs.writeFileSync(path.join(learningReviewProject, 'reports', 'cell-overflow-report.json'), JSON.stringify({ status: 'pass' }, null, 2));
fs.writeFileSync(path.join(learningReviewProject, 'reports', 'asset-readiness-audit.json'), JSON.stringify({
  status: 'fail',
  failures: [
    { code: 'missing_review_gate' },
    { code: 'prompt_only_not_review_gated' },
    { code: 'no_accepted_imagegen_candidate' },
  ],
}, null, 2));
fs.writeFileSync(path.join(learningReviewProject, 'reports', 'source-truth-acquisition-audit.json'), JSON.stringify({ status: 'review' }, null, 2));
fs.writeFileSync(path.join(learningReviewProject, 'reports', 'route-contract-audit.json'), JSON.stringify({ status: 'pass' }, null, 2));

const learningSecondReviewProject = path.join(learningFixtureRoot, 'logo-review-gap-repeat-project');
fs.cpSync(learningReviewProject, learningSecondReviewProject, { recursive: true });

const learningInvalidProject = path.join(learningFixtureRoot, 'missing-export-project');
fs.mkdirSync(path.join(learningInvalidProject, 'reports'), { recursive: true });
fs.writeFileSync(path.join(learningInvalidProject, 'reports', 'project-summary.json'), JSON.stringify({ status: 'complete' }, null, 2));

const learningFixtureProject = path.join(learningFixtureRoot, 'test-p12345');
fs.mkdirSync(path.join(learningFixtureProject, 'reports'), { recursive: true });
fs.writeFileSync(path.join(learningFixtureProject, 'reports', 'project-summary.json'), JSON.stringify({ status: 'fixture' }, null, 2));

const scannedLearningRoots = scanProjectRoots(learningFixtureRoot);
assert(scannedLearningRoots.includes(learningSuccessProject), 'learning scanner should include project folders with reports');
assert(scannedLearningRoots.includes(learningInvalidProject), 'learning scanner should include invalid samples for reporting');

const learningIndex = buildNormalizedProjectIndex(learningFixtureRoot);
assert(learningIndex.output_root === learningFixtureRoot, 'learning index should record output root');
assert(learningIndex.summary.total_projects === 5, `learning index should count 5 fixture projects, got ${learningIndex.summary.total_projects}`);
assert(learningIndex.summary.classification_counts.success === 1, 'learning index should count one success');
assert(learningIndex.summary.classification_counts.blocker === 2, 'learning index should count two blocker projects');
assert(learningIndex.summary.classification_counts.invalid_sample === 1, 'learning index should count one invalid sample');
assert(learningIndex.summary.classification_counts.exploration === 1, 'learning index should count one random exploration project');
assert(learningIndex.summary.score_stats.median === 82, 'learning index should compute score median from scored projects');

const learningPromotions = buildPromotionCandidates(learningIndex.projects);
assert(learningPromotions.some((candidate) => candidate.type === 'promote_to_test' && candidate.id === 'failure-missing-review-gate'), 'repeated missing_review_gate should promote to test');
assert(learningPromotions.some((candidate) => candidate.type === 'promote_to_test' && candidate.id === 'failure-prompt-only-not-review-gated'), 'repeated prompt_only_not_review_gated should promote to test');
assert(learningPromotions.some((candidate) => candidate.type === 'promote_to_test' && candidate.id === 'failure-no-accepted-imagegen-candidate'), 'repeated no_accepted_imagegen_candidate should promote to test');
assert(learningPromotions.some((candidate) => candidate.type === 'keep_as_review_gap' && candidate.id === 'review-source-truth'), 'repeated source-truth review should stay review gap');
assert(learningPromotions.some((candidate) => candidate.type === 'needs_more_training' && candidate.id === 'visual-success-pattern'), 'successful project pattern should request more training before rule promotion');

const learningIndexCliOutput = require('child_process').execFileSync(process.execPath, [
  path.join(ROOT, 'scripts', 'learning-index.js'),
  '--root', learningFixtureRoot,
], {
  cwd: ROOT,
  encoding: 'utf8',
});
assert(learningIndexCliOutput.includes('Learning index written:'), 'learning index CLI should report output path');
const learningIndexReportPath = path.join(learningFixtureRoot, 'imagegen-tdd-learning-lab', 'reports', 'normalized-project-index.json');
const learningIndexReport = JSON.parse(fs.readFileSync(learningIndexReportPath, 'utf8'));
assert(learningIndexReport.summary.total_projects === 5, 'learning index CLI should write normalized project index');
assert(learningIndexReport.promotion_candidates.length >= 2, 'learning index CLI should include promotion candidates');

const productizationReport = buildProductizationReport(learningIndexReport);
assert(productizationReport.summary.total_projects === 5, 'productization report should preserve total project count');
assert(productizationReport.assessment.has_clear_progress === true, 'productization report should identify progress when success projects exist');
assert(productizationReport.shortfalls.some((item) => item.includes('asset_readiness')), 'productization report should list asset readiness shortfall');
assert(productizationReport.next_actions[0].includes('Implement'), 'productization report should start with implementation action');

const productizationMarkdown = renderProductizationMarkdown(productizationReport);
assert(productizationMarkdown.includes('# Training Productization Report'), 'productization markdown should have title');
assert(productizationMarkdown.includes('## What To Do Next'), 'productization markdown should include next action section');
assert(productizationMarkdown.includes('Do not resume broad training'), 'productization markdown should stop broad training');

const nextTrainingPlan = renderNextTrainingPlan(productizationReport);
assert(nextTrainingPlan.includes('# Next Training Plan'), 'next training plan should have title');
assert(nextTrainingPlan.includes('Regression case'), 'next training plan should name regression case');

const learningReportCliOutput = require('child_process').execFileSync(process.execPath, [
  path.join(ROOT, 'scripts', 'learning-report.js'),
  '--root', learningFixtureRoot,
], {
  cwd: ROOT,
  encoding: 'utf8',
});
assert(learningReportCliOutput.includes('Training productization report written:'), 'learning report CLI should write markdown report');
const productizationReportPath = path.join(learningFixtureRoot, 'imagegen-tdd-learning-lab', 'reports', 'training-productization-report.json');
const productizationMarkdownPath = path.join(learningFixtureRoot, 'imagegen-tdd-learning-lab', 'reports', 'training-productization-report.md');
const promotionCandidatesPath = path.join(learningFixtureRoot, 'imagegen-tdd-learning-lab', 'reports', 'promotion-candidates.json');
const nextTrainingPlanPath = path.join(learningFixtureRoot, 'imagegen-tdd-learning-lab', 'reports', 'next-training-plan.md');
assert(fs.existsSync(productizationReportPath), 'learning report CLI should write JSON report');
assert(fs.existsSync(productizationMarkdownPath), 'learning report CLI should write markdown report');
assert(fs.existsSync(promotionCandidatesPath), 'learning report CLI should write promotion candidates');
assert(fs.existsSync(nextTrainingPlanPath), 'learning report CLI should write next training plan');

const fixtureCopyRows = [
  {
    source_row_id: 'COPY_BASIC_ZH_CN',
    template_id: 'copy_basic_poster',
    platform: 'custom_poster',
    canvas_w: 1024,
    canvas_h: 1280,
    lang: 'zh-cn',
    sku: 'COPY-BASIC',
    title: '基础抄图海报',
    subtitle: '可编辑文案层',
    cta: '立即查看',
    disclaimer: '示例文案仅用于测试',
    price: '29.99',
    currency: '$',
    unit: '',
    html_group: 'copy-basic-poster',
    export_name: 'copy-basic-poster-zh-cn-1024x1280',
  },
  {
    source_row_id: 'COPY_LAYERED_ZH_CN',
    template_id: 'copy_layered_banner',
    platform: 'custom_banner',
    canvas_w: 1536,
    canvas_h: 500,
    lang: 'zh-cn',
    sku: 'COPY-LAYERED',
    title: '分层抄图横幅',
    subtitle: '图片资产进入 source',
    cta: '24H 支持',
    bg_asset: 'assets/source/sample-background.jpg',
    patch_assets: 'assets/source/sample-panel-left.jpg;assets/source/sample-panel-right.jpg',
    html_group: 'copy-layered-banner',
    export_name: 'copy-layered-banner-zh-cn-1536x500',
  },
  {
    source_row_id: 'COPY_VECTOR_ZH_TW',
    template_id: 'copy_vector_poster',
    platform: 'custom_poster',
    canvas_w: 1000,
    canvas_h: 1263,
    lang: 'zh-tw',
    sku: 'COPY-VECTOR',
    title: '向量抄圖海報',
    cta: 'coverage',
    html_group: 'copy-vector-poster',
    export_name: 'copy-vector-poster-zh-tw-1000x1263',
  },
  {
    source_row_id: 'COPY_PHONE_EN_US',
    template_id: 'copy_phone_poster',
    platform: 'custom_poster',
    canvas_w: 1086,
    canvas_h: 1448,
    lang: 'en-us',
    sku: 'COPY-PHONE',
    title: 'Phone Poster',
    subtitle: 'Editable phone UI',
    remaining_label: 'Remaining data',
    remaining_value: '1.25',
    remaining_unit: 'GB',
    html_group: 'copy-phone-poster',
    export_name: 'copy-phone-poster-en-us-1086x1448',
  },
  {
    source_row_id: 'COPY_COMPLEX_ZH_CN',
    template_id: 'copy_complex_poster',
    platform: 'custom_poster',
    canvas_w: 1404,
    canvas_h: 1120,
    lang: 'zh-cn',
    sku: 'COPY-COMPLEX',
    title: '复杂资产抄图海报',
    hero_asset: 'source/complex-layer.png',
    country_dz: '区域 A',
    country_cd: '区域 B',
    country_eg: '区域 C',
    html_group: 'copy-complex-poster',
    export_name: 'copy-complex-poster-zh-cn-1404x1120',
  },
];
const fixtureCopyDataPath = path.join(projectPaths.working, 'copy-master-fixture.json');
fs.writeFileSync(fixtureCopyDataPath, `${JSON.stringify({ data: fixtureCopyRows }, null, 2)}\n`);

const outputs = renderRows(fixtureCopyRows, { projectId });
assert(outputs.some((item) => item.status === 'built'), 'build did not generate any HTML previews');
const htmlEntries = listHtmlEntries(projectPaths);
assert(htmlEntries.length >= 3, 'html entries should enumerate generated canonical and localized previews');
assert(htmlEntries.some((entry) => entry.variant === 'canonical'), 'html entries should include canonical index.html');
assert(htmlEntries.some((entry) => entry.variant === 'zh-cn'), 'html entries should include zh-cn localized html');
assert(htmlEntries.every((entry) => entry.file_url === toFileUrl(entry.html)), 'html entries should include correct file_url');
const shallowProjectId = 'shallow-html-entry-validation-recreation';
assertReadableProjectName(shallowProjectId, 'shallow html entry fixture project id');
const shallowProjectPaths = createProjectWorkspace(shallowProjectId);
fs.writeFileSync(path.join(shallowProjectPaths.html, 'index.html'), `<!doctype html>
<html>
<head><meta charset="utf-8"><link rel="stylesheet" href="master.css"></head>
<body><main class="poster" style="width: 320px; height: 180px"><h1 data-i18n-key="title">Shallow Preview</h1></main></body>
</html>
`);
fs.writeFileSync(path.join(shallowProjectPaths.html, 'master.css'), 'body { margin: 0; }\n');
const shallowHtmlEntries = listHtmlEntries(shallowProjectPaths);
assert(shallowHtmlEntries.length === 1, 'html entries should include shallow single-group html/index.html');
assert(shallowHtmlEntries[0].html_group === 'default', 'shallow html entry should use default html_group');
assert(shallowHtmlEntries[0].variant === 'canonical', 'shallow html/index.html should be canonical variant');
assert(shallowHtmlEntries[0].html === path.join(shallowProjectPaths.html, 'index.html'), 'shallow html entry should point at html/index.html');
const overflowEvaluationScript = buildOverflowEvaluationScript();
assert(overflowEvaluationScript.includes('document.createRange()'), 'overflow audit must use browser Range geometry');
assert(overflowEvaluationScript.includes('range.getClientRects()'), 'overflow audit must use Range.getClientRects for wrapped text');
assert(overflowEvaluationScript.includes('scrollWidth') && overflowEvaluationScript.includes('clientWidth'), 'overflow audit must compare scroll and client widths');
assert(overflowEvaluationScript.includes('data-overflow-check'), 'overflow audit must support explicit data-overflow-check selectors');
assert(typeof removeTemporaryDirectory === 'function', 'overflow audit must expose retrying temporary profile cleanup');
const overflowCleanupDir = path.join(projectPaths.working, 'overflow-cleanup-validation');
fs.mkdirSync(overflowCleanupDir, { recursive: true });
fs.writeFileSync(path.join(overflowCleanupDir, 'profile-file'), 'pending chrome profile file');
removeTemporaryDirectory(overflowCleanupDir);
assert(!fs.existsSync(overflowCleanupDir), 'overflow audit temporary profile cleanup should remove nested profile files');
const buildOutput = require('child_process').execFileSync(process.execPath, [
  path.join(ROOT, 'scripts', 'build.js'),
  '--project', projectId,
  '--copy-data', fixtureCopyDataPath,
], {
  cwd: ROOT,
  encoding: 'utf8',
});
assert(buildOutput.includes('Local HTML file path:'), 'build output should print the local HTML file path every round');
assert(buildOutput.includes('Open or refresh in your browser: file://'), 'build output should print the file_url every round');
assert(buildOutput.includes('Markdown preview link: ['), 'build output should print a markdown preview link every round');
assert(buildOutput.includes('Preview links report:'), 'build output should print the preview links report path');
assert(buildOutput.includes('Required HTML preview handoff for this image-edit round:'), 'build output should label HTML preview handoff as required every round');
assert(buildOutput.includes('Final response must include the Markdown preview link, the plain local HTML file path, and this preview links report path.'), 'build output should instruct final responses to include all preview handoff fields');
for (const output of outputs.filter((item) => item.status === 'built')) {
  assert(output.html.startsWith(projectPaths.html), `HTML preview should be written to project html dir: ${output.html}`);
  assert(output.file_url === toFileUrl(output.html), `HTML preview should include file_url: ${output.html}`);
  assert(output.markdown_link === `[${path.basename(output.html)}](${output.file_url})`, `HTML preview should include markdown_link: ${output.html}`);
  assert(output.browser_hint === 'open_or_refresh_file_url', `HTML preview should include browser hint: ${output.html}`);
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
assert(buildReport.preview_links_report === path.join(projectPaths.reports, 'preview-links.md'), 'build report should point to preview-links.md');
assert(buildReport.annotation_capability?.status === 'probe-required', 'build report should mark annotation as probe-required');
for (const output of buildReport.outputs.filter((item) => item.status === 'built')) {
  assert(output.file_url === toFileUrl(output.html), `build report output should include file_url: ${output.html}`);
  assert(output.markdown_link === `[${path.basename(output.html)}](${output.file_url})`, `build report output should include markdown_link: ${output.html}`);
}
const previewLinksPath = path.join(projectPaths.reports, 'preview-links.md');
assert(fs.existsSync(previewLinksPath), 'build should write reports/preview-links.md');
const previewLinks = fs.readFileSync(previewLinksPath, 'utf8');
assert(previewLinks.includes('# HTML Preview Links'), 'preview-links.md should have a clear heading');
assert(previewLinks.includes('Browser annotation capability is optional'), 'preview-links.md should explain optional annotation support');
assert(previewLinks.includes('Do not claim annotation usage unless a session probe succeeds.'), 'preview-links.md should forbid unverified annotation claims');
assert(previewLinks.includes('Required final-response handoff for every image-edit round'), 'preview-links.md should require preview handoff every image-edit round');
for (const output of outputs.filter((item) => item.status === 'built')) {
  assert(previewLinks.includes(output.markdown_link), `preview-links.md should include markdown link for ${output.html}`);
  assert(previewLinks.includes('- Local HTML file path:'), `preview-links.md should label local HTML file path for ${output.html}`);
  assert(previewLinks.includes(output.html), `preview-links.md should include local path for ${output.html}`);
}

const firstHtmlOutput = outputs.find((item) => item.status === 'built');
const firstHtmlAudit = inspectHtmlEditability(firstHtmlOutput.html);
assert(firstHtmlAudit.status !== 'fail', `generated HTML should not fail DOM audit: ${firstHtmlOutput.html}`);
assert(firstHtmlAudit.metrics.script_count === 0, 'generated HTML should not contain script tags');
assert(firstHtmlAudit.metrics.editable_text_node_count > 0, 'generated HTML should expose editable DOM text nodes');
assert(firstHtmlAudit.metrics.image_count >= 0, 'DOM audit should report image count');
assert(Array.isArray(firstHtmlAudit.risks), 'DOM audit should report risk array');

const qc = validateWorkflow({ projectId, rows: fixtureCopyRows });
assert(qc.errors.length === 0, `quality errors: ${qc.errors.join('; ')}`);

const templateCheckOutput = require('child_process').execFileSync(process.execPath, [
  path.join(ROOT, 'scripts', 'template-check.js'),
  '--project', projectId,
  '--copy-data', fixtureCopyDataPath,
], {
  cwd: ROOT,
  encoding: 'utf8',
});
assert(templateCheckOutput.includes('Template check pass'), 'template-check should report pass for test fixtures');
const templateCheckReportPath = path.join(projectPaths.reports, 'template-check-report.json');
assert(fs.existsSync(templateCheckReportPath), 'template-check should write reports/template-check-report.json');
const templateCheckReport = JSON.parse(fs.readFileSync(templateCheckReportPath, 'utf8'));
assert(templateCheckReport.status === 'pass', 'template-check report should pass for test fixtures');
assert(templateCheckReport.templates.every((item) => item.template_id && typeof item.exists === 'boolean'), 'template-check report should include template status rows');

const copySchemaOutput = require('child_process').execFileSync(process.execPath, [
  path.join(ROOT, 'scripts', 'copy-schema.js'),
  '--project', projectId,
  '--copy-data', fixtureCopyDataPath,
], {
  cwd: ROOT,
  encoding: 'utf8',
});
assert(copySchemaOutput.includes('Copy schema check pass'), 'copy-schema should report pass for test fixtures');
const copySchemaReportPath = path.join(projectPaths.reports, 'copy-schema-report.json');
assert(fs.existsSync(copySchemaReportPath), 'copy-schema should write reports/copy-schema-report.json');
const copySchemaReport = JSON.parse(fs.readFileSync(copySchemaReportPath, 'utf8'));
assert(copySchemaReport.status === 'pass', 'copy-schema report should pass for test fixtures');
assert(Object.keys(copySchemaReport.template_fields).includes('copy_basic_poster'), 'copy-schema report should include fixture template fields');

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
const domAuditSummary = fs.readFileSync(domAuditSummaryPath, 'utf8');
assert(domAuditSummary.includes('- Local HTML file path:'), 'DOM audit summary should label local HTML file paths');
for (const entry of domAuditReport.entries) {
  assert(domAuditSummary.includes(entry.html), `DOM audit summary should include local HTML file path for ${entry.html}`);
}

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
assert(profileReport.entries.some((entry) => entry.html_group === 'copy-vector-poster' && entry.status === 'pass'), 'vector poster should pass the first render profile');
assert(profileReport.entries.some((entry) => entry.html_group === 'copy-complex-poster' && entry.status === 'fail'), 'complex poster should fail profile because of grid/filter/blend');
assert(profileReport.entries.some((entry) => entry.unsupported_css.some((item) => item.property === 'mix-blend-mode')), 'profile should report unsupported mix-blend-mode');
const vectorEntry = profileReport.entries.find((entry) => entry.html_group === 'copy-vector-poster' && entry.status === 'pass');
assert(vectorEntry?.ir_path, 'passing render profile entry should include ir_path');
assert(fs.existsSync(vectorEntry.ir_path), 'render profile should write render IR for passing entry');
const vectorIr = JSON.parse(fs.readFileSync(vectorEntry.ir_path, 'utf8'));
assert(vectorIr.canvas.width === 1000 && vectorIr.canvas.height === 1263, 'vector poster IR should preserve canvas size');
assert(vectorIr.layers.some((layer) => layer.type === 'svg'), 'vector poster IR should include inline svg layers');
assert(vectorIr.layers.some((layer) => layer.type === 'text' && layer.text.includes('向量')), 'vector poster IR should include title text layer');
assert(vectorEntry.svg_path, 'passing render profile entry should include svg_path');
assert(fs.existsSync(vectorEntry.svg_path), 'render-fast should write SVG for passing entry');
const vectorSvg = fs.readFileSync(vectorEntry.svg_path, 'utf8');
assert(vectorSvg.includes('<svg'), 'compiled SVG should contain svg root');
assert(vectorSvg.includes('viewBox="0 0 1000 1263"'), 'compiled SVG should preserve canvas viewBox');
assert(vectorSvg.includes('向量'), 'compiled SVG should contain editable text content as SVG text');

const bitmapTruthPng = new PNG({ width: 24, height: 24 });
for (let y = 0; y < bitmapTruthPng.height; y += 1) {
  for (let x = 0; x < bitmapTruthPng.width; x += 1) {
    const offset = (bitmapTruthPng.width * y + x) * 4;
    const dark = (x + y) % 2 === 0;
    bitmapTruthPng.data[offset] = dark ? 0 : 255;
    bitmapTruthPng.data[offset + 1] = dark ? 0 : 255;
    bitmapTruthPng.data[offset + 2] = dark ? 0 : 255;
    bitmapTruthPng.data[offset + 3] = 255;
  }
}
const bitmapTruthPath = path.join(projectPaths.source, 'bitmap-truth-render-fixture.png');
fs.writeFileSync(bitmapTruthPath, PNG.sync.write(bitmapTruthPng));
const bitmapTruthHtmlPath = path.join(projectPaths.html, 'bitmap-truth-render-fixture.html');
fs.writeFileSync(bitmapTruthHtmlPath, `<!doctype html>
<html>
<head><meta charset="utf-8"><link rel="stylesheet" href="master.css"></head>
<body>
  <main class="poster" style="width: 240px; height: 160px">
    <img class="qr-layer" src="../source/bitmap-truth-render-fixture.png" data-asset-id="qr_truth_fixture" data-route="locked_base_layer" data-final-asset-ready="true" data-asset-text-policy="no-text" style="position: absolute; left: 32px; top: 44px; width: 72px; height: 72px; z-index: 4;">
    <span class="map-label" data-i18n-key="label.qr" style="left: 148px; top: 86px;">QR truth</span>
  </main>
</body>
</html>
`);
const bitmapTruthIr = compilePosterIr(bitmapTruthHtmlPath);
const bitmapTruthImageLayer = bitmapTruthIr.layers.find((layer) => layer.type === 'image' && layer.id === 'qr_truth_fixture');
assert(bitmapTruthImageLayer, 'poster IR should include final-ready bitmap truth img layers');
assert(bitmapTruthImageLayer.href === path.resolve(path.dirname(bitmapTruthHtmlPath), '../source/bitmap-truth-render-fixture.png'), 'image layer href should resolve from the HTML path');
assert(bitmapTruthImageLayer.x === 32 && bitmapTruthImageLayer.y === 44 && bitmapTruthImageLayer.width === 72 && bitmapTruthImageLayer.height === 72, 'image layer should preserve inline pixel placement');
const bitmapTruthSvg = compileSvg(bitmapTruthIr);
assert(bitmapTruthSvg.includes('<image'), 'compiled SVG should contain bitmap image layers');
assert(bitmapTruthSvg.includes('data-layer-id="qr_truth_fixture"'), 'compiled SVG image should preserve asset id');
assert(bitmapTruthSvg.includes('href="data:image/png;base64,'), 'compiled SVG image should embed local bitmap layers for reliable PNG export');
const bitmapVisibilityProjectId = 'bitmap-layer-visibility-validation-recreation';
assertReadableProjectName(bitmapVisibilityProjectId, 'bitmap visibility fixture project id');
const bitmapVisibilityPaths = createProjectWorkspace(bitmapVisibilityProjectId);
const bitmapVisibilitySourcePath = path.join(bitmapVisibilityPaths.source, 'checker-bitmap-layer.png');
fs.copyFileSync(bitmapTruthPath, bitmapVisibilitySourcePath);
fs.writeFileSync(path.join(bitmapVisibilityPaths.html, 'index.html'), `<!doctype html>
<html>
<head><meta charset="utf-8"><link rel="stylesheet" href="master.css"></head>
<body>
  <main class="poster" style="width: 160px; height: 120px">
    <img class="checker-layer" src="../source/checker-bitmap-layer.png" data-asset-id="checker_bitmap_layer" data-route="locked_base_layer" data-final-asset-ready="true" data-asset-text-policy="no-text" style="position: absolute; left: 20px; top: 24px; width: 96px; height: 72px; z-index: 3;">
    <span class="map-label" data-i18n-key="label.bitmap" style="left: 132px; top: 62px;">OK</span>
  </main>
</body>
</html>
`);
fs.writeFileSync(path.join(bitmapVisibilityPaths.html, 'master.css'), 'body { margin: 0; }\n.poster { position: relative; }\n');
require('child_process').execFileSync(process.execPath, [
  path.join(ROOT, 'scripts', 'render-fast.js'),
  '--project', bitmapVisibilityProjectId,
  '--scale', '1',
], {
  cwd: ROOT,
  encoding: 'utf8',
});
const bitmapVisibilityReport = JSON.parse(fs.readFileSync(path.join(bitmapVisibilityPaths.reports, 'png-export-report.json'), 'utf8'));
const bitmapVisibilityExport = bitmapVisibilityReport.exports.find((entry) => entry.variant === 'canonical');
assert(bitmapVisibilityExport?.image_layer_evidence, 'png export report should include image layer visibility evidence');
assert(bitmapVisibilityExport.image_layer_evidence.image_layer_count === 1, 'image layer evidence should count exported bitmap layers');
assert(bitmapVisibilityExport.image_layer_evidence.visible_image_layer_count === 1, 'image layer evidence should prove bitmap layer pixels are visible in the exported PNG');
assert(bitmapVisibilityExport.image_layer_evidence.layers[0].status === 'visible', 'bitmap layer visibility evidence should mark checker layer visible');

const transparentLayerProjectId = 'transparent-layer-visibility-validation-recreation';
assertReadableProjectName(transparentLayerProjectId, 'transparent visibility fixture project id');
const transparentLayerPaths = createProjectWorkspace(transparentLayerProjectId);
const transparentLayerSourcePath = path.join(transparentLayerPaths.source, 'transparent-bitmap-layer.png');
const transparentLayerPng = new PNG({ width: 32, height: 32 });
for (let y = 0; y < transparentLayerPng.height; y += 1) {
  for (let x = 0; x < transparentLayerPng.width; x += 1) {
    const offset = (transparentLayerPng.width * y + x) << 2;
    transparentLayerPng.data[offset] = 255;
    transparentLayerPng.data[offset + 1] = 0;
    transparentLayerPng.data[offset + 2] = 0;
    transparentLayerPng.data[offset + 3] = 0;
  }
}
fs.writeFileSync(transparentLayerSourcePath, PNG.sync.write(transparentLayerPng));
fs.writeFileSync(path.join(transparentLayerPaths.html, 'index.html'), `<!doctype html>
<html>
<head><meta charset="utf-8"><link rel="stylesheet" href="master.css"></head>
<body>
  <main class="poster" style="width: 160px; height: 120px">
    <svg width="160" height="120" viewBox="0 0 160 120">
      <rect width="160" height="120" fill="#111827"/>
      <rect x="20" y="20" width="100" height="80" fill="#facc15"/>
      <rect x="48" y="42" width="48" height="36" fill="#38bdf8"/>
    </svg>
    <img class="transparent-layer" src="../source/transparent-bitmap-layer.png" data-asset-id="transparent_bitmap_layer" data-route="regenerated_image" data-final-asset-ready="true" data-asset-text-policy="no-text" style="position: absolute; left: 20px; top: 24px; width: 96px; height: 72px; z-index: 3;">
  </main>
</body>
</html>
`);
fs.writeFileSync(path.join(transparentLayerPaths.html, 'master.css'), 'body { margin: 0; }\n.poster { position: relative; }\n');
require('child_process').execFileSync(process.execPath, [
  path.join(ROOT, 'scripts', 'render-fast.js'),
  '--project', transparentLayerProjectId,
  '--scale', '1',
], {
  cwd: ROOT,
  encoding: 'utf8',
});
const transparentLayerReport = JSON.parse(fs.readFileSync(path.join(transparentLayerPaths.reports, 'png-export-report.json'), 'utf8'));
const transparentLayerExport = transparentLayerReport.exports.find((entry) => entry.variant === 'canonical');
assert(transparentLayerExport.image_layer_evidence.image_layer_count === 1, 'transparent layer evidence should count image layer');
assert(transparentLayerExport.image_layer_evidence.visible_image_layer_count === 0, 'transparent bitmap layer must not be counted visible because of varied background pixels');
assert(transparentLayerExport.image_layer_evidence.layers[0].status === 'review', 'transparent bitmap layer should stay review');
assert(transparentLayerExport.image_layer_evidence.layers[0].source_opaque_sample_count === 0, 'transparent bitmap evidence should report zero source opaque samples');

const visualCompareReferencePath = path.join(projectPaths.working, 'visual-compare-reference.png');
const visualCompareDifferentPath = path.join(projectPaths.working, 'visual-compare-different.png');
const visualCompareReferencePng = new PNG({ width: 48, height: 32 });
const visualCompareDifferentPng = new PNG({ width: 48, height: 32 });
for (let y = 0; y < 32; y += 1) {
  for (let x = 0; x < 48; x += 1) {
    const offset = (48 * y + x) << 2;
    const value = x < 24 ? 20 : 230;
    visualCompareReferencePng.data[offset] = value;
    visualCompareReferencePng.data[offset + 1] = value;
    visualCompareReferencePng.data[offset + 2] = value;
    visualCompareReferencePng.data[offset + 3] = 255;
    visualCompareDifferentPng.data[offset] = 255 - value;
    visualCompareDifferentPng.data[offset + 1] = 255 - value;
    visualCompareDifferentPng.data[offset + 2] = 255 - value;
    visualCompareDifferentPng.data[offset + 3] = 255;
  }
}
fs.writeFileSync(visualCompareReferencePath, PNG.sync.write(visualCompareReferencePng));
fs.writeFileSync(visualCompareDifferentPath, PNG.sync.write(visualCompareDifferentPng));
const identicalVisualCompare = comparePngImages({
  referencePath: visualCompareReferencePath,
  renderPath: visualCompareReferencePath,
  stride: 1,
});
assert(identicalVisualCompare.status === 'pass', 'visual compare should pass identical PNGs');
assert(identicalVisualCompare.similarity_score === 100, 'visual compare should score identical PNGs as 100');
assert(identicalVisualCompare.top_mismatch_regions.length === 0, 'visual compare should not create mismatch regions for identical PNGs');
assert(identicalVisualCompare.repair_queue.length === 0, 'visual compare should not create repair items for identical PNGs');
const differentVisualCompare = comparePngImages({
  referencePath: visualCompareReferencePath,
  renderPath: visualCompareDifferentPath,
  stride: 1,
  diffPath: path.join(projectPaths.working, 'visual-compare-diff.png'),
});
assert(differentVisualCompare.status === 'review', 'visual compare should review very different PNGs');
assert(differentVisualCompare.similarity_score < 40, 'visual compare should give low score to inverted PNGs');
assert(differentVisualCompare.diff_path && fs.existsSync(differentVisualCompare.diff_path), 'visual compare should write a diff map PNG when diffPath is provided');
assert(differentVisualCompare.diff_dimensions.width === 48 && differentVisualCompare.diff_dimensions.height === 32, 'visual compare diff map should preserve compared dimensions');

const visualCompareTargetedPath = path.join(projectPaths.working, 'visual-compare-targeted.png');
const visualCompareTargetedPng = PNG.sync.read(fs.readFileSync(visualCompareReferencePath));
for (let y = 8; y < 24; y += 1) {
  for (let x = 16; x < 32; x += 1) {
    const offset = (48 * y + x) << 2;
    visualCompareTargetedPng.data[offset] = 250;
    visualCompareTargetedPng.data[offset + 1] = 20;
    visualCompareTargetedPng.data[offset + 2] = 20;
    visualCompareTargetedPng.data[offset + 3] = 255;
  }
}
fs.writeFileSync(visualCompareTargetedPath, PNG.sync.write(visualCompareTargetedPng));
const targetedVisualCompare = comparePngImages({
  referencePath: visualCompareReferencePath,
  renderPath: visualCompareTargetedPath,
  stride: 1,
  regionSize: 8,
  maxRegions: 4,
  overlayPath: path.join(projectPaths.working, 'visual-compare-overlay.png'),
  heatmapPath: path.join(projectPaths.working, 'visual-compare-heatmap.json'),
  domEvidence: {
    entries: [{
      elements: [{
        selector: '.hero-phone',
        tag: 'img',
        visible: true,
        display: 'block',
        data_asset_id: 'phone-hero',
        data_route: 'reference_cutout',
        rect: { x: 16, y: 8, width: 16, height: 16, left: 16, top: 8, right: 32, bottom: 24 },
      }],
      text_boxes: [{
        selector: '.headline',
        text: 'Travel eSIM',
        i18n_key: 'headline.title',
        rect: { x: 0, y: 0, width: 12, height: 8, left: 0, top: 0, right: 12, bottom: 8 },
      }],
    }],
  },
});
assert(targetedVisualCompare.overlay_path && fs.existsSync(targetedVisualCompare.overlay_path), 'visual compare should write an overlay PNG');
assert(targetedVisualCompare.heatmap_path && fs.existsSync(targetedVisualCompare.heatmap_path), 'visual compare should write heatmap JSON');
assert(targetedVisualCompare.top_mismatch_regions.length > 0, 'visual compare should extract top mismatch regions');
assert(targetedVisualCompare.top_mismatch_regions[0].primary_dom_candidate.selector === '.hero-phone', 'visual compare should attribute mismatch regions to DOM candidates');
assert(targetedVisualCompare.top_mismatch_regions[0].candidate_elements.some((candidate) => candidate.asset_id === 'phone-hero'), 'visual compare should preserve attributed asset ids');
assert(targetedVisualCompare.top_mismatch_regions[0].likely_issue_type === 'missing_asset', 'visual compare should classify routed asset mismatches');
assert(targetedVisualCompare.repair_queue.length > 0, 'visual compare should build a repair queue from mismatch regions');
assert(targetedVisualCompare.repair_queue[0].selector === '.hero-phone', 'visual compare repair queue should include attributed selectors');

const fastExportOutput = require('child_process').execFileSync(process.execPath, [
  path.join(ROOT, 'scripts', 'render-fast.js'),
  '--project', projectId,
  '--group', 'copy-vector-poster',
  '--scale', '2',
], {
  cwd: ROOT,
  encoding: 'utf8',
});
assert(fastExportOutput.includes('Direct PNG export completed'), 'export-fast should complete for supported html group');
const pngReportPath = path.join(projectPaths.reports, 'png-export-report.json');
assert(fs.existsSync(pngReportPath), 'export-fast should write reports/png-export-report.json');
const pngReport = JSON.parse(fs.readFileSync(pngReportPath, 'utf8'));
assert(pngReport.status === 'pass', 'png export report should pass for vector poster group');
assert(pngReport.exports.every((entry) => entry.scale === 2), 'png export report should preserve scale');
assert(pngReport.exports.every((entry) => fs.existsSync(entry.png)), 'png export report should point to existing PNG files');
assert(pngReport.exports.some((entry) => /copy-vector-poster-canonical\.png$/.test(entry.png)), 'png export should include canonical output');

const bannerOutput = outputs.find((item) => item.export_name === 'copy-layered-banner-zh-cn-1536x500');
assert(bannerOutput, 'banner output should be generated');
const bannerHtml = fs.readFileSync(bannerOutput.html, 'utf8');
const bannerRealDir = path.dirname(fs.realpathSync(bannerOutput.html));
for (const srcMatch of bannerHtml.matchAll(/<img src="([^"]+)"/g)) {
  const src = srcMatch[1];
  if (src.startsWith('data:')) continue;
  assert(src.startsWith('../../source/'), `generated image src should use project source assets: ${src}`);
  assert(fs.existsSync(path.resolve(path.dirname(bannerOutput.html), src)), `image path should resolve via Documents symlink: ${src}`);
  assert(fs.existsSync(path.resolve(bannerRealDir, src)), `image path should resolve via real filesystem path: ${src}`);
}
for (const panelClass of ['panel-left', 'panel-right']) {
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
const validVisualReview = {
  project_id: projectId,
  subproject_id: null,
  round: 1,
  generated_at: new Date().toISOString(),
  source_image: path.join(projectPaths.source, 'reference.png'),
  screenshot: path.join(projectPaths.screenshots, 'round-01.png'),
  overall_score: 91,
  layout_score: 92,
  typography_score: 90,
  color_score: 91,
  asset_score: 90,
  text_legibility_score: 93,
  issues: [
    {
      severity: 'medium',
      area: 'asset',
      observed: 'phone layer edge is too harsh',
      expected: 'phone edge matches the reference softness',
      evidence: 'x=520,y=300,w=260,h=520',
      fix_hint: 'rerun matting for phone layer',
    },
  ],
  next_action: 'Refine phone layer edge.',
};
const validVisualReviewResult = validateVisualReviewReport(validVisualReview);
assert(validVisualReviewResult.errors.length === 0, `valid visual review should pass: ${validVisualReviewResult.errors.join('; ')}`);
const invalidVisualReviewResult = validateVisualReviewReport({ overall_score: 91, issues: [{}] });
assert(invalidVisualReviewResult.errors.some((error) => error.includes('text_legibility_score')), 'visual review validation should require text_legibility_score');
assert(invalidVisualReviewResult.errors.some((error) => error.includes('issues[0].evidence')), 'visual review validation should require issue evidence');

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
assert(savedScoreReport.subproject_id === 'Page-Master-A', 'review-score should preserve readable subproject folder id');
assert(savedScoreReport.issues[0].fix_hint === 'move hero up', 'review-score should parse issue fix hint');

const visualReviewInputPath = path.join(projectPaths.working, 'visual-review-input.json');
fs.writeFileSync(visualReviewInputPath, JSON.stringify(validVisualReview, null, 2));
const visualReviewOutput = require('child_process').execFileSync(process.execPath, [
  path.join(ROOT, 'scripts', 'visual-review.js'),
  '--project', projectId,
  '--round', '1',
  '--report', visualReviewInputPath,
], {
  cwd: ROOT,
  encoding: 'utf8',
});
assert(visualReviewOutput.includes('Visual review report written'), 'visual-review should print report path');
const visualReviewReportPath = path.join(projectPaths.reports, 'visual-review-round-01.json');
assert(fs.existsSync(visualReviewReportPath), 'visual-review should write reports/visual-review-round-01.json');
const savedVisualReview = JSON.parse(fs.readFileSync(visualReviewReportPath, 'utf8'));
assert(savedVisualReview.status === 'review', 'visual review with issues should remain review');
assert(savedVisualReview.issues[0].evidence.includes('x=520'), 'visual review should preserve evidence');

const routeSourcePath = path.join(projectPaths.source, 'asset-routing-reference.png');
const routeSourcePng = new PNG({ width: 900, height: 1200 });
for (let y = 0; y < routeSourcePng.height; y += 1) {
  for (let x = 0; x < routeSourcePng.width; x += 1) {
    setPixel(routeSourcePng, x, y, [245, 238, 226, 255]);
  }
}
fs.writeFileSync(routeSourcePath, PNG.sync.write(routeSourcePng));
const visualIntakeNoResponse = runVisualIntake({
  projectPaths,
  sourceImage: routeSourcePath,
  targetCanvas: { width: 900, height: 1200 },
  taskType: 'recreate',
});
assert(visualIntakeNoResponse.manifest.status === 'review', 'visual intake without model response should remain review');
assert(fs.existsSync(path.join(projectPaths.reports, 'visual-intake-request.json')), 'visual intake should write request package');
assert(fs.existsSync(path.join(projectPaths.reports, 'visual-intake-manifest.json')), 'visual intake should write manifest');
const visualIntakeResponsePath = path.join(projectPaths.working, 'visual-intake-response.json');
fs.writeFileSync(visualIntakeResponsePath, JSON.stringify({
  visual_hierarchy: ['headline', 'phone mockup', 'cloud background'],
  elements: [
    {
      id: 'phone-mockup',
      kind: 'complex_art',
      description: 'large phone mockup on the right',
      bbox: { x: 520, y: 300, w: 260, h: 520 },
      suggested_route: 'reference_cutout',
      confidence: 0.86,
      evidence: ['right side rectangular phone body'],
      uncertainty_reason: '',
    },
  ],
  business_text_candidates: ['Travel eSIM'],
  unknowns_requiring_user_or_agent_review: [],
}, null, 2));
const visualIntakeWithResponse = runVisualIntake({
  projectPaths,
  sourceImage: routeSourcePath,
  responsePath: visualIntakeResponsePath,
  targetCanvas: { width: 900, height: 1200 },
  taskType: 'recreate',
});
assert(visualIntakeWithResponse.manifest.status === 'pass', 'visual intake with confident response should pass');
assert(visualIntakeWithResponse.manifest.elements[0].id === 'phone-mockup', 'visual intake should preserve element id');
const visualIntakeCliOutput = require('child_process').execFileSync(process.execPath, [
  path.join(ROOT, 'scripts', 'visual-intake.js'),
  '--project', projectId,
  '--source-image', routeSourcePath,
  '--response', visualIntakeResponsePath,
], {
  cwd: ROOT,
  encoding: 'utf8',
});
assert(visualIntakeCliOutput.includes('Visual intake manifest written'), 'visual-intake should print manifest path');
const visualIntakeManifest = JSON.parse(fs.readFileSync(path.join(projectPaths.reports, 'visual-intake-manifest.json'), 'utf8'));
assert(visualIntakeManifest.elements[0].suggested_route === 'reference_cutout', 'visual intake manifest should preserve suggested route');

const cutoutNoResponse = runCutoutDecompose({
  projectPaths,
  sourceImage: routeSourcePath,
  mode: 'hybrid',
});
assert(cutoutNoResponse.plan.status === 'review', 'cutout decomposition without response should remain review');
assert(fs.existsSync(path.join(projectPaths.reports, 'agent-cutout-request.json')), 'cutout decomposition should write agent request package');
assert(fs.existsSync(path.join(projectPaths.reports, 'element-decomposition-plan.json')), 'cutout decomposition should write element-decomposition-plan.json');
assert(fs.existsSync(path.join(projectPaths.reports, 'agent-cutout-review.json')), 'cutout decomposition should write agent-cutout-review.json');
const cutoutResponsePath = path.join(projectPaths.working, 'cutout-response.json');
fs.writeFileSync(cutoutResponsePath, JSON.stringify({
  elements: [
    {
      id: 'phone-mockup',
      label: 'phone mockup',
      prompt: 'phone mockup',
      kind: 'product',
      bbox: { x: 520, y: 300, w: 260, h: 520 },
      bbox_source: 'grounding',
      route: 'reference_cutout',
      confidence: 0.88,
      uncertainty_reason: '',
    },
  ],
  merge_candidates: [],
  split_candidates: [],
}, null, 2));
const cutoutWithResponse = runCutoutDecompose({
  projectPaths,
  sourceImage: routeSourcePath,
  mode: 'hybrid',
  responsePath: cutoutResponsePath,
});
assert(cutoutWithResponse.plan.status === 'review', 'cutout plan without layer files should stay review');
assert(cutoutWithResponse.plan.elements[0].bbox_source === 'grounding', 'cutout plan should preserve bbox source');
assert(shouldAutoSemanticCutout({
  id: 'traveler',
  kind: 'person',
  route: 'reference_cutout',
  mask_path: null,
  layer_path: null,
}), 'person reference_cutout without mask/layer should auto-dispatch semantic cutout');
assert(!shouldAutoSemanticCutout({
  id: 'kyoto-landmark',
  kind: 'landmark',
  route: 'reference_cutout',
  mask_path: null,
  layer_path: null,
}), 'non-person semantic cutout should not auto-dispatch to Mac person Vision');
const autoPersonResponsePath = path.join(projectPaths.working, 'auto-person-cutout-response.json');
fs.writeFileSync(autoPersonResponsePath, JSON.stringify({
  elements: [
    {
      id: 'traveler',
      label: 'traveler person',
      prompt: 'traveler person',
      kind: 'person',
      bbox: { x: 520, y: 300, w: 260, h: 520 },
      bbox_source: 'grounding',
      route: 'reference_cutout',
      confidence: 0.93,
      uncertainty_reason: '',
    },
  ],
  merge_candidates: [],
  split_candidates: [],
}, null, 2));
let autoPersonProviderCalls = 0;
const autoPersonCutout = runCutoutDecompose({
  projectPaths,
  sourceImage: routeSourcePath,
  mode: 'hybrid',
  responsePath: autoPersonResponsePath,
  semanticCutoutProvider: ({ output, cropOutput, mask, checker, report }) => {
    autoPersonProviderCalls += 1;
    const sameCanvas = new PNG({ width: 900, height: 1200 });
    const cropped = new PNG({ width: 260, height: 520 });
    const alphaMask = new PNG({ width: 900, height: 1200 });
    const checkerPreview = new PNG({ width: 260, height: 520 });
    for (let y = 0; y < sameCanvas.height; y += 1) {
      for (let x = 0; x < sameCanvas.width; x += 1) {
        const nx = (x - 650) / 130;
        const ny = (y - 560) / 260;
        const inside = (nx * nx) + (ny * ny) <= 1;
        setPixel(sameCanvas, x, y, inside ? [200, 120, 80, 255] : [0, 0, 0, 0]);
        setPixel(alphaMask, x, y, inside ? [255, 255, 255, 255] : [0, 0, 0, 0]);
      }
    }
    for (let y = 0; y < cropped.height; y += 1) {
      for (let x = 0; x < cropped.width; x += 1) {
        setPixel(cropped, x, y, [200, 120, 80, 255]);
        setPixel(checkerPreview, x, y, [200, 120, 80, 255]);
      }
    }
    fs.writeFileSync(output, PNG.sync.write(sameCanvas));
    fs.writeFileSync(cropOutput, PNG.sync.write(cropped));
    fs.writeFileSync(mask, PNG.sync.write(alphaMask));
    fs.writeFileSync(checker, PNG.sync.write(checkerPreview));
    fs.writeFileSync(report, JSON.stringify({
      transparency_method: 'macos_vision_person_segmentation',
      alpha_bbox_xyxy: [520, 300, 780, 820],
      cropped_dimensions: [260, 520],
    }, null, 2));
    return { output, cropOutput, mask, checker, report };
  },
});
assert(autoPersonProviderCalls === 1, 'cutout decomposition should call semantic cutout provider once for person reference_cutout');
assert(autoPersonCutout.plan.status === 'pass', `auto person cutout should make decomposition pass: ${autoPersonCutout.plan.blocking_errors.join('; ')}`);
assert(autoPersonCutout.plan.auto_cutout_dispatches.length === 1, 'auto person cutout should record a dispatch');
assert(autoPersonCutout.plan.auto_cutout_dispatches[0].provider === 'macos_vision_person', 'auto person cutout should record macos vision provider');
assert(autoPersonCutout.plan.elements[0].auto_cutout.status === 'pass', 'auto person element should record passing auto_cutout status');
assert(autoPersonCutout.plan.elements[0].transparency_method === 'macos_vision_person_segmentation', 'auto person element should record transparency method');
assert(fs.existsSync(autoPersonCutout.plan.elements[0].mask_path), 'auto person cutout should write mask path');
assert(fs.existsSync(autoPersonCutout.plan.elements[0].layer_path), 'auto person cutout should write same-canvas layer path');
const autoPersonLayerPackage = JSON.parse(fs.readFileSync(path.join(projectPaths.reports, 'cutout-layer-package.json'), 'utf8'));
assert(autoPersonLayerPackage.layers[0].placement.left === 0 && autoPersonLayerPackage.layers[0].placement.top === 0, 'same-canvas auto cutout layer should be placed at origin');
assert(autoPersonLayerPackage.layers[0].placement.width === 900 && autoPersonLayerPackage.layers[0].placement.height === 1200, 'same-canvas auto cutout layer should use source canvas dimensions');
const autoLandmarkResponsePath = path.join(projectPaths.working, 'auto-landmark-cutout-response.json');
fs.writeFileSync(autoLandmarkResponsePath, JSON.stringify({
  elements: [
    {
      id: 'kyoto-landmark',
      label: 'temple landmark',
      prompt: 'temple landmark',
      kind: 'landmark',
      bbox: { x: 120, y: 160, w: 300, h: 260 },
      bbox_source: 'grounding',
      route: 'reference_cutout',
      confidence: 0.9,
      uncertainty_reason: '',
    },
  ],
  merge_candidates: [],
  split_candidates: [],
}, null, 2));
let autoLandmarkProviderCalls = 0;
const autoLandmarkCutout = runCutoutDecompose({
  projectPaths,
  sourceImage: routeSourcePath,
  mode: 'hybrid',
  responsePath: autoLandmarkResponsePath,
  semanticCutoutProvider: () => {
    autoLandmarkProviderCalls += 1;
    throw new Error('landmark must not use mac person cutout');
  },
});
assert(autoLandmarkProviderCalls === 0, 'non-person semantic cutout should not call Mac person provider');
assert(autoLandmarkCutout.plan.status === 'review', 'unsupported semantic cutout should remain review');
assert(autoLandmarkCutout.plan.elements[0].auto_cutout.status === 'review', 'unsupported semantic cutout should record review status');
assert(autoLandmarkCutout.plan.elements[0].auto_cutout.next_action === 'provide_external_semantic_mask_or_regenerated_asset', 'unsupported semantic cutout should ask for external semantic mask or regenerated asset');
const maskPath = path.join(projectPaths.working, 'phone-mask.png');
const layerPath = path.join(projectPaths.source, 'phone-layer.png');
const maskPng = new PNG({ width: 900, height: 1200 });
const layerPng = new PNG({ width: 260, height: 520 });
for (let y = 0; y < maskPng.height; y += 1) {
  for (let x = 0; x < maskPng.width; x += 1) {
    const cx = 650;
    const cy = 560;
    const nx = (x - cx) / 130;
    const ny = (y - cy) / 260;
    const inside = (nx * nx) + (ny * ny) <= 1;
    setPixel(maskPng, x, y, inside ? [255, 255, 255, 255] : [0, 0, 0, 0]);
  }
}
for (let y = 0; y < layerPng.height; y += 1) {
  for (let x = 0; x < layerPng.width; x += 1) {
    setPixel(layerPng, x, y, [30, 80, 160, 255]);
  }
}
fs.writeFileSync(maskPath, PNG.sync.write(maskPng));
fs.writeFileSync(layerPath, PNG.sync.write(layerPng));
const cutoutReadyResponsePath = path.join(projectPaths.working, 'cutout-ready-response.json');
fs.writeFileSync(cutoutReadyResponsePath, JSON.stringify({
  elements: [
    {
      id: 'phone-mockup',
      label: 'phone mockup',
      prompt: 'phone mockup',
      kind: 'product',
      bbox: { x: 520, y: 300, w: 260, h: 520 },
      bbox_source: 'grounding',
      mask_path: maskPath,
      layer_path: layerPath,
      route: 'reference_cutout',
      confidence: 0.91,
      uncertainty_reason: '',
    },
  ],
  merge_candidates: [],
  split_candidates: [],
}, null, 2));
const cutoutReady = runCutoutDecompose({
  projectPaths,
  sourceImage: routeSourcePath,
  mode: 'hybrid',
  responsePath: cutoutReadyResponsePath,
});
assert(cutoutReady.plan.status === 'pass', `cutout plan with mask and layer should pass: ${cutoutReady.plan.blocking_errors.join('; ')}`);
assert(fs.existsSync(path.join(projectPaths.reports, 'mask-quality-report.json')), 'cutout decomposition should write mask-quality-report.json');
assert(fs.existsSync(path.join(projectPaths.reports, 'cutout-layer-package.json')), 'cutout decomposition should write cutout-layer-package.json');
const maskQualityReport = JSON.parse(fs.readFileSync(path.join(projectPaths.reports, 'mask-quality-report.json'), 'utf8'));
assert(maskQualityReport.status === 'pass', 'mask quality report should pass for valid mask and layer');
assert(maskQualityReport.checks[0].alpha_min === 0, 'mask quality should record alpha_min');
assert(maskQualityReport.checks[0].alpha_max === 255, 'mask quality should record alpha_max');
assert(fs.existsSync(maskQualityReport.checks[0].overlay_path), 'mask quality should write overlay image');
const layerPackageReport = JSON.parse(fs.readFileSync(path.join(projectPaths.reports, 'cutout-layer-package.json'), 'utf8'));
assert(layerPackageReport.status === 'pass', 'layer package report should pass for valid layer');
assert(layerPackageReport.layers[0].placement.left === 520, 'layer package should preserve placement left');

const rectangularMaskPath = path.join(projectPaths.working, 'phone-rectangular-mask.png');
const rectangularMaskPng = new PNG({ width: 900, height: 1200 });
for (let y = 0; y < rectangularMaskPng.height; y += 1) {
  for (let x = 0; x < rectangularMaskPng.width; x += 1) {
    setPixel(rectangularMaskPng, x, y, x >= 520 && x < 780 && y >= 300 && y < 820 ? [255, 255, 255, 255] : [0, 0, 0, 0]);
  }
}
fs.writeFileSync(rectangularMaskPath, PNG.sync.write(rectangularMaskPng));
const rectangularCutoutResponsePath = path.join(projectPaths.working, 'cutout-rectangular-response.json');
fs.writeFileSync(rectangularCutoutResponsePath, JSON.stringify({
  elements: [
    {
      id: 'phone-rectangular-crop',
      label: 'phone rectangular crop',
      prompt: 'phone crop',
      kind: 'phone_device',
      bbox: { x: 520, y: 300, w: 260, h: 520 },
      bbox_source: 'manual_crop',
      mask_path: rectangularMaskPath,
      layer_path: layerPath,
      route: 'reference_cutout',
      confidence: 0.82,
      uncertainty_reason: '',
    },
  ],
  merge_candidates: [],
  split_candidates: [],
}, null, 2));
const rectangularCutout = runCutoutDecompose({
  projectPaths,
  sourceImage: routeSourcePath,
  mode: 'hybrid',
  responsePath: rectangularCutoutResponsePath,
});
assert(rectangularCutout.plan.status === 'review', 'rectangular reference cutout mask should remain review');
assert(rectangularCutout.maskQualityReport.checks[0].issues.some((issue) => /rectangular/.test(issue)), 'rectangular cutout should report rectangular mask issue');
const cutoutCliOutput = require('child_process').execFileSync(process.execPath, [
  path.join(ROOT, 'scripts', 'cutout-decompose.js'),
  '--project', projectId,
  '--source-image', routeSourcePath,
  '--mode', 'hybrid',
  '--response', cutoutReadyResponsePath,
], {
  cwd: ROOT,
  encoding: 'utf8',
});
assert(cutoutCliOutput.includes('Element decomposition plan written'), 'cutout-decompose should print plan path');

const routeElements = {
  elements: [
    {
      id: 'app-icon',
      kind: 'app_icon',
      description: 'clear square app icon with hard boundary',
      bbox: { x: 160, y: 220, w: 96, h: 96 },
      overlaps_text: false,
      needs_independent_adjustment: true,
    },
    {
      id: 'soft-app-icon',
      kind: 'application_icon',
      description: 'soft gradient app icon with 3D illustrated symbol and style consistency needed',
      bbox: { x: 320, y: 220, w: 48, h: 48 },
      soft_edges: true,
      needs_style_consistency: true,
      needs_independent_adjustment: true,
    },
    {
      id: 'mono-tool-icon',
      kind: 'simple_icon',
      description: 'single color airplane glyph that can be recreated as inline SVG',
      bbox: { x: 500, y: 220, w: 40, h: 40 },
    },
    {
      id: 'activation-qr',
      kind: 'qr',
      route: 'editable_vector',
      description: 'high contrast scannable QR code block for activation',
      bbox: { x: 700, y: 120, w: 112, h: 112 },
    },
    {
      id: 'ticket-barcode',
      kind: 'barcode',
      route: 'editable_vector',
      description: 'high contrast scannable barcode strip',
      bbox: { x: 650, y: 260, w: 180, h: 48 },
    },
    {
      id: 'wallet-payment-logo',
      kind: 'payment_logo',
      route: 'editable_vector',
      description: 'brand-like payment logo mark that must remain source-accurate',
      bbox: { x: 710, y: 340, w: 96, h: 42 },
    },
    {
      id: 'country-flag-jp',
      kind: 'country_flag',
      route: 'regenerated_image',
      description: 'Japan country flag with semantic identity requirement',
      bbox: { x: 720, y: 410, w: 54, h: 36 },
    },
    {
      id: 'airline-route-lines',
      kind: 'route_lines',
      description: 'dozens of airline route curves clipped inside the map card',
      bbox: { x: 140, y: 520, w: 520, h: 280 },
      container_id: 'route-map',
      clip_to_container: true,
    },
    {
      id: 'map-route-points',
      kind: 'route_points',
      description: 'simple glowing map connection points clipped inside the map card',
      bbox: { x: 180, y: 560, w: 430, h: 210 },
      container_id: 'route-map',
      clip_to_container: true,
    },
    {
      id: 'route-map',
      kind: 'map',
      description: 'decorative map background that is hard to recreate with geometry',
      bbox: { x: 100, y: 500, w: 300, h: 220 },
      needs_independent_adjustment: true,
    },
    {
      id: 'cloud-layer',
      kind: 'cloud',
      description: 'soft cloud layer with translucent edge',
      bbox: { x: 50, y: 40, w: 240, h: 96 },
      soft_edges: true,
      needs_independent_adjustment: true,
    },
    {
      id: 'skyline-layer',
      kind: 'skyline',
      description: 'detailed skyline silhouette with many buildings',
      bbox: { x: 0, y: 1040, w: 900, h: 160 },
      needs_independent_adjustment: true,
    },
    {
      id: 'traveler',
      kind: 'person',
      description: 'partly occluded soft 3D traveler illustration',
      bbox: { x: 650, y: 890, w: 170, h: 260 },
      overlaps_text: true,
      needs_independent_adjustment: true,
    },
    {
      id: 'headline',
      kind: 'text',
      description: 'main headline text',
      bbox: { x: 260, y: 80, w: 340, h: 64 },
    },
    {
      id: 'pricing-table',
      kind: 'table',
      description: 'pricing comparison table with selectable plan names prices and feature cells',
      bbox: { x: 160, y: 760, w: 520, h: 260 },
    },
    {
      id: 'feature-matrix',
      kind: 'feature_matrix',
      description: 'feature matrix with checkmarks plan names and multilingual values',
      bbox: { x: 160, y: 820, w: 520, h: 190 },
    },
    {
      id: 'language-tabs',
      kind: 'multilingual_copy',
      description: 'Japanese Traditional Chinese and English language selector copy',
      bbox: { x: 690, y: 80, w: 160, h: 130 },
    },
    {
      id: 'airport-photo-bg',
      kind: 'photo_background',
      description: 'airport terminal photography background that should remain locked visual context',
      bbox: { x: 0, y: 0, w: 900, h: 460 },
    },
    {
      id: 'airport-photo-with-flattened-copy',
      kind: 'photo_background',
      description: 'airport terminal photo crop that still contains flattened headline text behind required DOM copy',
      bbox: { x: 0, y: 0, w: 900, h: 460 },
      contains_flattened_text: true,
      requires_dom_overlay: true,
    },
    {
      id: 'marketing-copy-layer',
      kind: 'editable_text',
      description: 'marketing headline and subtitle that must remain selectable DOM text',
      bbox: { x: 60, y: 70, w: 520, h: 130 },
    },
    {
      id: 'card-grid',
      kind: 'card',
      description: 'regular rounded app icon card grid',
      bbox: { x: 140, y: 190, w: 540, h: 660 },
    },
    {
      id: 'glass-dashboard',
      kind: 'dashboard_widget',
      description: 'glassmorphism SaaS dashboard card with chart and data labels',
      bbox: { x: 540, y: 520, w: 300, h: 220 },
    },
    {
      id: 'volumetric-glow',
      kind: 'complex_gradient',
      description: 'soft volumetric lighting glow and particles over the poster background',
      bbox: { x: 0, y: 0, w: 900, h: 1200 },
      soft_edges: true,
      needs_style_consistency: true,
    },
    {
      id: 'decorative-particles',
      kind: 'particle',
      description: 'tiny decorative floating particles that may be omitted for readability',
      bbox: { x: 0, y: 0, w: 900, h: 1200 },
      omit: true,
    },
    {
      id: 'card-shadow',
      kind: 'shadow',
      description: 'simple layered card shadow that should be simplified as CSS effect',
      bbox: { x: 90, y: 460, w: 620, h: 260 },
      simplify: true,
    },
    {
      id: 'unknown-art',
      kind: 'illustration',
      description: '',
    },
  ],
};
const routeReport = routeAssets({
  projectPaths,
  sourceImage: routeSourcePath,
  elementsInput: routeElements,
});
const appIconRoute = routeReport.routing.elements.find((item) => item.id === 'app-icon');
const softAppIconRoute = routeReport.routing.elements.find((item) => item.id === 'soft-app-icon');
const monoToolIconRoute = routeReport.routing.elements.find((item) => item.id === 'mono-tool-icon');
const activationQrRoute = routeReport.routing.elements.find((item) => item.id === 'activation-qr');
const ticketBarcodeRoute = routeReport.routing.elements.find((item) => item.id === 'ticket-barcode');
const walletPaymentLogoRoute = routeReport.routing.elements.find((item) => item.id === 'wallet-payment-logo');
const countryFlagRoute = routeReport.routing.elements.find((item) => item.id === 'country-flag-jp');
const airlineRouteLinesRoute = routeReport.routing.elements.find((item) => item.id === 'airline-route-lines');
const mapRoutePointsRoute = routeReport.routing.elements.find((item) => item.id === 'map-route-points');
const mapRoute = routeReport.routing.elements.find((item) => item.id === 'route-map');
const cloudRoute = routeReport.routing.elements.find((item) => item.id === 'cloud-layer');
const skylineRoute = routeReport.routing.elements.find((item) => item.id === 'skyline-layer');
const travelerRoute = routeReport.routing.elements.find((item) => item.id === 'traveler');
const headlineRoute = routeReport.routing.elements.find((item) => item.id === 'headline');
const pricingTableRoute = routeReport.routing.elements.find((item) => item.id === 'pricing-table');
const featureMatrixRoute = routeReport.routing.elements.find((item) => item.id === 'feature-matrix');
const languageTabsRoute = routeReport.routing.elements.find((item) => item.id === 'language-tabs');
const airportPhotoBgRoute = routeReport.routing.elements.find((item) => item.id === 'airport-photo-bg');
const airportPhotoWithFlattenedCopyRoute = routeReport.routing.elements.find((item) => item.id === 'airport-photo-with-flattened-copy');
const marketingCopyLayerRoute = routeReport.routing.elements.find((item) => item.id === 'marketing-copy-layer');
const cardRoute = routeReport.routing.elements.find((item) => item.id === 'card-grid');
const glassDashboardRoute = routeReport.routing.elements.find((item) => item.id === 'glass-dashboard');
const volumetricGlowRoute = routeReport.routing.elements.find((item) => item.id === 'volumetric-glow');
const decorativeParticlesRoute = routeReport.routing.elements.find((item) => item.id === 'decorative-particles');
const cardShadowRoute = routeReport.routing.elements.find((item) => item.id === 'card-shadow');
const unknownRoute = routeReport.routing.elements.find((item) => item.id === 'unknown-art');
assert(appIconRoute.route === 'reference_cutout', 'clear hard-boundary icon should route to reference_cutout');
assert(appIconRoute.cutout_feasibility === 'high', 'clear icon should have high cutout feasibility');
assert(softAppIconRoute.route === 'regenerated_image', 'soft complex app icon should route to regenerated_image');
assert(softAppIconRoute.requires_imagegen_prompt === true, 'soft complex app icon should require ImageGen prompt');
assert(monoToolIconRoute.route === 'editable_vector', 'simple_icon should remain editable_vector');
for (const mapOverlayRoute of [airlineRouteLinesRoute, mapRoutePointsRoute]) {
  assert(mapOverlayRoute.route === 'editable_vector', `${mapOverlayRoute.id} should route to editable_vector`);
  assert(mapOverlayRoute.clip_to_container === true, `${mapOverlayRoute.id} should preserve clip_to_container`);
  assert(mapOverlayRoute.container_id === 'route-map', `${mapOverlayRoute.id} should preserve container_id`);
}
for (const bitmapTruthRoute of [activationQrRoute, ticketBarcodeRoute, walletPaymentLogoRoute, countryFlagRoute]) {
  assert(bitmapTruthRoute.route !== 'editable_vector', `${bitmapTruthRoute.id} must not accept requested editable_vector route`);
  assert(bitmapTruthRoute.route !== 'editable_text', `${bitmapTruthRoute.id} must not route to editable_text`);
  assert(bitmapTruthRoute.route !== 'regenerated_image', `${bitmapTruthRoute.id} must not route to regenerated_image`);
  assert(['reference_cutout', 'locked_base_layer', 'review'].includes(bitmapTruthRoute.route), `${bitmapTruthRoute.id} must preserve bitmap/source truth or require review`);
}
for (const complexRoute of [appIconRoute, softAppIconRoute, mapRoute, cloudRoute, skylineRoute, travelerRoute]) {
  assert(complexRoute.route !== 'editable_vector', `${complexRoute.id} must not route to editable_vector`);
  assert(complexRoute.route !== 'editable_text', `${complexRoute.id} must not route to editable_text`);
}
assert(travelerRoute.route === 'regenerated_image', 'occluded person should route to regenerated_image');
assert(travelerRoute.cutout_feasibility === 'low', 'occluded person should have low cutout feasibility');
assert(travelerRoute.regeneration_fit === 'high', 'occluded person should have high regeneration fit');
assert(travelerRoute.requires_imagegen_prompt === true, 'regenerated image route should require ImageGen prompt');
assert(headlineRoute.route === 'editable_text', 'text element should route to editable_text');
for (const domTextRoute of [pricingTableRoute, featureMatrixRoute, languageTabsRoute]) {
  assert(domTextRoute.route === 'editable_text', `${domTextRoute.id} should route to editable_text`);
}
assert(airportPhotoBgRoute.route === 'locked_base_layer', 'photo_background should route to locked_base_layer');
assert(airportPhotoWithFlattenedCopyRoute.route === 'review', 'photo_background with flattened text behind DOM overlay should route to review');
assert(airportPhotoWithFlattenedCopyRoute.difficulty_signals.includes('flattened_text_conflicts_dom_overlay'), 'photo_background review should record flattened text DOM overlay conflict');
assert(marketingCopyLayerRoute.route === 'editable_text', 'editable_text kind should route to editable_text');
assert(cardRoute.route === 'editable_vector', 'card element should route to editable_vector');
assert(glassDashboardRoute.route === 'editable_vector', 'dashboard_widget should route to editable_vector');
assert(volumetricGlowRoute.route === 'regenerated_image', 'complex_gradient should route to regenerated_image');
assert(volumetricGlowRoute.requires_imagegen_prompt === true, 'complex_gradient regenerated route should require ImageGen prompt');
assert(decorativeParticlesRoute.route === 'omit_or_simplify', 'omitted particle effects should route to omit_or_simplify');
assert(cardShadowRoute.route === 'omit_or_simplify', 'simplified shadows should route to omit_or_simplify');
assert(unknownRoute.status === 'review', 'missing bbox or description should require review');
assert(routeReport.prompts.prompts.length >= 2, 'regenerated_image elements should get prompt packages');
assert(routeReport.prompts.prompts[0].status === 'prompt_only', 'generated prompt package should be prompt_only');
assert(routeReport.prompts.prompts.every((item) => item.prompt.includes('人物、地图、云和天际线，应用程序图标这些难以用 SVG 或图形线条复刻的部分')), 'prompt package should include the fixed complex asset instruction');
assert(routeReport.prompts.prompts.every((item) => item.prompt.includes('transparent PNG with alpha channel')), 'prompt package should require transparent PNG with alpha channel');
assert(routeReport.prompts.prompts.every((item) => item.prompt.includes('No green screen, green background, chroma key background')), 'prompt package should forbid green/chroma-key backgrounds');
assert(routeReport.prompts.prompts.every((item) => item.required_format === 'png'), 'prompt package should require png format structurally');
assert(routeReport.prompts.prompts.every((item) => item.requires_alpha_channel === true), 'prompt package should require alpha channel structurally');
assert(routeReport.prompts.prompts.every((item) => item.exterior_alpha === 0), 'prompt package should require exterior alpha 0 structurally');
assert(routeReport.prompts.prompts.every((item) => Array.isArray(item.forbidden_backgrounds) && item.forbidden_backgrounds.includes('green screen') && item.forbidden_backgrounds.includes('chroma key background') && item.forbidden_backgrounds.includes('colored matte')), 'prompt package should structurally forbid green/chroma-key/matte backgrounds');
assert(routeReport.provenance.assets.every((asset) => asset.status !== 'final_asset'), 'route planning must not create final assets');

const routeElementsPath = path.join(projectPaths.working, 'asset-routing-elements.json');
fs.writeFileSync(routeElementsPath, JSON.stringify(routeElements, null, 2));
const routeCliOutput = require('child_process').execFileSync(process.execPath, [
  path.join(ROOT, 'scripts', 'route-assets.js'),
  '--project', projectId,
  '--source-image', routeSourcePath,
  '--elements', routeElementsPath,
], {
  cwd: ROOT,
  encoding: 'utf8',
});
assert(routeCliOutput.includes('Asset routing table written'), 'route-assets should print routing table path');
for (const reportName of [
  'reverse-prompt-brief.md',
  'asset-routing-table.json',
  'asset-generation-prompts.json',
  'asset-provenance.json',
]) {
  assert(fs.existsSync(path.join(projectPaths.reports, reportName)), `route-assets should write reports/${reportName}`);
}
const routeTable = JSON.parse(fs.readFileSync(path.join(projectPaths.reports, 'asset-routing-table.json'), 'utf8'));
assert(routeTable.elements.every((item) => item.cutout_feasibility && item.regeneration_fit), 'routing table should include difficulty fields');
assert(routeTable.elements.filter((item) => ['app_icon', 'application_icon', 'complex_icon', 'person', 'map', 'cloud', 'skyline'].includes(item.kind)).every((item) => !['editable_vector', 'editable_text'].includes(item.route)), 'hard-to-vector assets must not route to editable vector/text');
assert(routeTable.elements.filter((item) => ['qr', 'barcode', 'payment_logo', 'country_flag'].includes(item.kind)).every((item) => !['editable_vector', 'editable_text', 'regenerated_image'].includes(item.route)), 'bitmap/source-truth assets must not route to editable vector/text or regenerated image');
assert(routeTable.elements.filter((item) => ['route_lines', 'route_points'].includes(item.kind)).every((item) => item.route === 'editable_vector' && item.clip_to_container === true && item.container_id), 'map route overlays must be clipped editable vectors');
const exactRouteContractAudit = auditExpectedRouteContract({
  expectedContract: {
    case_id: 'unit-route-exact',
    required_routes: [
      {
        element_id: 'traveler',
        kind: 'person',
        expected_route: 'reference_cutout',
        forbidden_routes: ['editable_vector', 'editable_text'],
        reason: 'person must remain bitmap/review truth',
      },
    ],
  },
  routingTable: {
    elements: [
      {
        id: 'traveler',
        kind: 'person',
        route: 'regenerated_image',
      },
    ],
  },
});
assert(exactRouteContractAudit.status === 'fail', 'exact expected route mismatch should fail without allowed_routes');
assert(exactRouteContractAudit.failures.some((failure) => failure.code === 'route_mismatch'), 'exact expected route mismatch should report route_mismatch');
const allowedRouteContractAudit = auditExpectedRouteContract({
  expectedContract: {
    case_id: 'unit-route-allowed-family',
    required_routes: [
      {
        element_id: 'traveler',
        kind: 'person',
        expected_route: 'reference_cutout',
        allowed_routes: ['reference_cutout', 'regenerated_image', 'locked_base_layer', 'review'],
        forbidden_routes: ['editable_vector', 'editable_text'],
        reason: 'person must remain bitmap/review truth',
      },
    ],
  },
  routingTable: {
    elements: [
      {
        id: 'traveler',
        kind: 'person',
        route: 'regenerated_image',
      },
    ],
  },
});
assert(allowedRouteContractAudit.status === 'pass', 'allowed_routes should permit valid route-family alternatives');
assert(allowedRouteContractAudit.results[0].route_match_type === 'allowed_route', 'allowed route-family pass should record allowed_route match type');
const forbiddenRouteContractAudit = auditExpectedRouteContract({
  expectedContract: {
    case_id: 'unit-route-forbidden',
    required_routes: [
      {
        element_id: 'activation_qr',
        kind: 'qr',
        expected_route: 'reference_cutout',
        allowed_routes: ['reference_cutout', 'review'],
        forbidden_routes: ['editable_vector', 'editable_text', 'regenerated_image'],
        reason: 'QR must remain source truth',
      },
    ],
  },
  routingTable: {
    elements: [
      {
        id: 'activation_qr',
        kind: 'qr',
        route: 'regenerated_image',
      },
    ],
  },
});
assert(forbiddenRouteContractAudit.status === 'fail', 'forbidden routes must fail even when route families exist');
assert(forbiddenRouteContractAudit.failures.some((failure) => failure.code === 'forbidden_route'), 'forbidden route should report forbidden_route');
const promptPackage = JSON.parse(fs.readFileSync(path.join(projectPaths.reports, 'asset-generation-prompts.json'), 'utf8'));
assert(promptPackage.prompts.every((item) => item.route === 'regenerated_image'), 'prompt package should only include regenerated_image elements');
assert(promptPackage.prompts.every((item) => item.status === 'prompt_only'), 'prompt package entries should remain prompt_only');
assert(promptPackage.prompts.every((item) => item.prompt.includes('人物、地图、云和天际线，应用程序图标这些难以用 SVG 或图形线条复刻的部分')), 'prompt package should include fixed complex asset routing instruction');
assert(promptPackage.prompts.every((item) => item.prompt.includes('transparent PNG with alpha channel')), 'written prompt package should require transparent PNG with alpha channel');
assert(promptPackage.prompts.every((item) => item.prompt.includes('No green screen, green background, chroma key background')), 'written prompt package should forbid green/chroma-key backgrounds');
assert(promptPackage.prompts.every((item) => item.required_format === 'png'), 'written prompt package should include required png format');
assert(promptPackage.prompts.every((item) => item.requires_alpha_channel === true), 'written prompt package should include alpha-channel requirement');
assert(promptPackage.prompts.every((item) => item.exterior_alpha === 0), 'written prompt package should include exterior alpha 0');
assert(promptPackage.prompts.every((item) => item.forbidden_backgrounds.includes('green background') && item.forbidden_backgrounds.includes('white matte') && item.forbidden_backgrounds.includes('gradient background')), 'written prompt package should list forbidden solid/matte backgrounds');

const missingPromptBundlePaths = createProjectWorkspace('codex prompt bundle missing evidence');
assertThrows(
  () => composeCodexHtmlPrompt({ projectPaths: missingPromptBundlePaths }),
  /visual-intake-manifest\.json/,
  'prompt compose should fail when visual intake manifest is missing'
);
const composedPromptBundle = composeCodexHtmlPrompt({ projectPaths });
assert(composedPromptBundle.audit.status === 'pass', 'prompt compose audit should pass with required artifacts');
assert(fs.existsSync(path.join(projectPaths.reports, 'reverse-visual-spec.md')), 'prompt compose should write reverse-visual-spec.md');
assert(fs.existsSync(path.join(projectPaths.reports, 'visual-elements.json')), 'prompt compose should write visual-elements.json');
assert(fs.existsSync(path.join(projectPaths.reports, 'first-pass-html-plan.md')), 'prompt compose should write first-pass-html-plan.md');
assert(fs.existsSync(path.join(projectPaths.reports, 'codex-first-pass-html-prompt.md')), 'prompt compose should write codex-first-pass-html-prompt.md');
assert(fs.existsSync(path.join(projectPaths.reports, 'codex-prompt-compose-audit.json')), 'prompt compose should write codex-prompt-compose-audit.json');
assert(composedPromptBundle.prompt.includes('Read these local artifacts in this order'), 'prompt bundle should define artifact read order');
assert(composedPromptBundle.prompt.includes('Do not start writing HTML until'), 'prompt bundle should block premature HTML');
assert(composedPromptBundle.firstPassPlan.includes('DOM text'), 'first-pass plan should name DOM text responsibilities');
assert(composedPromptBundle.firstPassPlan.includes('prompt_only assets are not final assets'), 'first-pass plan should preserve prompt-only boundary');
const codexPromptCliOutput = require('child_process').execFileSync(process.execPath, [
  path.join(ROOT, 'scripts', 'compose-codex-html-prompt.js'),
  '--project', projectId,
], {
  cwd: ROOT,
  encoding: 'utf8',
});
assert(codexPromptCliOutput.includes('Codex first-pass HTML prompt written'), 'prompt:compose CLI should print prompt path');

const opaqueCandidatePath = path.join(projectPaths.working, 'imagegen-opaque-rgb-candidate.png');
const opaqueCandidatePng = new PNG({ width: 10, height: 10 });
for (let index = 0; index < opaqueCandidatePng.data.length; index += 4) {
  opaqueCandidatePng.data[index] = 232;
  opaqueCandidatePng.data[index + 1] = 235;
  opaqueCandidatePng.data[index + 2] = 238;
  opaqueCandidatePng.data[index + 3] = 255;
}
fs.writeFileSync(opaqueCandidatePath, PNG.sync.write(opaqueCandidatePng, { colorType: 2 }));
const opaqueCandidateAudit = auditImagegenCandidate({
  id: 'volumetric_glow_candidate_01',
  routeTarget: 'volumetric_glow',
  outputPath: opaqueCandidatePath,
  prompt: 'transparent PNG with alpha channel for soft volumetric light',
});
assert(opaqueCandidateAudit.accepted === false, 'RGB/no-alpha ImageGen candidate must be rejected');
assert(opaqueCandidateAudit.status === 'rejected', 'RGB/no-alpha candidate should have rejected status');
assert(opaqueCandidateAudit.edge_fringe_issues.includes('no_alpha_channel'), 'RGB/no-alpha candidate should report no_alpha_channel');
assert(opaqueCandidateAudit.rejection_reason.includes('alpha'), 'RGB/no-alpha candidate rejection should explain alpha failure');
assert(opaqueCandidateAudit.blocked_from_final_html === true, 'rejected ImageGen candidate must be blocked from final HTML');
assert(opaqueCandidateAudit.alpha_extrema === null, 'RGB/no-alpha candidate should not invent alpha extrema');

const opaqueLockedBaseAudit = auditImagegenCandidate({
  id: 'clean_airport_skyline_base',
  routeTarget: 'locked_base_layer',
  outputPath: opaqueCandidatePath,
  prompt: 'clean no-text airport skyline base layer for locked background',
});
assert(opaqueLockedBaseAudit.accepted === true, 'opaque locked_base_layer ImageGen candidate should be accepted without alpha');
assert(opaqueLockedBaseAudit.status === 'accepted', 'opaque locked base candidate should have accepted status');
assert(opaqueLockedBaseAudit.blocked_from_final_html === false, 'accepted opaque locked base candidate should not be blocked from final HTML');
assert(opaqueLockedBaseAudit.edge_fringe_issues.length === 0, 'opaque locked base candidate should not report alpha fringe issues');

const transparentCandidatePath = path.join(projectPaths.working, 'imagegen-transparent-alpha-candidate.png');
const transparentCandidatePng = new PNG({ width: 10, height: 10 });
for (let y = 0; y < transparentCandidatePng.height; y += 1) {
  for (let x = 0; x < transparentCandidatePng.width; x += 1) {
    const offset = (transparentCandidatePng.width * y + x) << 2;
    const inside = x >= 3 && x <= 6 && y >= 3 && y <= 6;
    transparentCandidatePng.data[offset] = inside ? 32 : 0;
    transparentCandidatePng.data[offset + 1] = inside ? 140 : 0;
    transparentCandidatePng.data[offset + 2] = inside ? 220 : 0;
    transparentCandidatePng.data[offset + 3] = inside ? 255 : 0;
  }
}
fs.writeFileSync(transparentCandidatePath, PNG.sync.write(transparentCandidatePng));
const transparentCandidateAudit = auditImagegenCandidate({
  id: 'cloud_layers_candidate_01',
  routeTarget: 'cloud_layers',
  outputPath: transparentCandidatePath,
  prompt: 'transparent PNG with alpha channel for decorative clouds',
  transparency_method: 'native_alpha',
  alpha_source: 'model_native_transparent_png',
});
assert(transparentCandidateAudit.accepted === true, 'candidate with transparent exterior and opaque subject should be accepted');
assert(transparentCandidateAudit.status === 'accepted', 'accepted candidate should have accepted status');
assert(transparentCandidateAudit.alpha_extrema.min === 0 && transparentCandidateAudit.alpha_extrema.max === 255, 'accepted candidate should record alpha extrema');
assert(transparentCandidateAudit.transparent_corner_count === 4, 'accepted candidate should record transparent corners');
assert(transparentCandidateAudit.blocked_from_final_html === false, 'accepted candidate should not be blocked from final HTML');
assert(transparentCandidateAudit.transparency_provenance?.method === 'native_alpha', 'accepted native-alpha candidate should record transparency method');

const missingTransparencyProvenanceAudit = auditImagegenCandidate({
  id: 'cloud_layers_missing_transparency_method',
  routeTarget: 'cloud_layers',
  outputPath: transparentCandidatePath,
  prompt: 'transparent PNG with alpha channel for decorative clouds',
});
assert(missingTransparencyProvenanceAudit.accepted === false, 'alpha PNG candidate without transparency provenance must be rejected');
assert(missingTransparencyProvenanceAudit.edge_fringe_issues.includes('missing_transparency_method'), 'missing provenance candidate should report missing_transparency_method');
const chromaMissingEvidenceAudit = auditImagegenCandidate({
  id: 'phone_chroma_missing_evidence',
  routeTarget: 'phone_shell',
  outputPath: transparentCandidatePath,
  prompt: 'phone shell cutout from flat #00ff00 chroma-key background',
  transparency_method: 'chroma_key_removed',
  alpha_source: 'local_chroma_key_removal',
});
assert(chromaMissingEvidenceAudit.accepted === false, 'chroma-removed candidate without source/report evidence must be rejected');
assert(chromaMissingEvidenceAudit.edge_fringe_issues.includes('missing_source_chroma_path'), 'chroma-removed candidate should require source_chroma_path');
assert(chromaMissingEvidenceAudit.edge_fringe_issues.includes('missing_postprocess_report_path'), 'chroma-removed candidate should require postprocess_report_path');
const chromaPostprocessReportPath = path.join(projectPaths.reports, 'unit-chroma-postprocess-report.json');
fs.writeFileSync(chromaPostprocessReportPath, JSON.stringify({
  tool: 'remove_chroma_key.py',
  input: opaqueCandidatePath,
  output: transparentCandidatePath,
  method: 'chroma_key_removed',
}, null, 2));
const chromaWithEvidenceAudit = auditImagegenCandidate({
  id: 'phone_chroma_with_evidence',
  routeTarget: 'phone_shell',
  outputPath: transparentCandidatePath,
  prompt: 'phone shell cutout from flat #00ff00 chroma-key background',
  transparency_method: 'chroma_key_removed',
  alpha_source: 'local_chroma_key_removal',
  source_chroma_path: opaqueCandidatePath,
  postprocess_report_path: chromaPostprocessReportPath,
});
assert(chromaWithEvidenceAudit.accepted === true, 'chroma-removed candidate with source and postprocess report evidence can be accepted');
assert(chromaWithEvidenceAudit.transparency_provenance.postprocess_report_exists === true, 'chroma evidence should confirm postprocess report exists');

const sourceTruthQrPath = path.join(projectPaths.working, 'source-truth-qr-high-contrast.png');
const sourceTruthQrPng = new PNG({ width: 20, height: 20 });
for (let y = 0; y < sourceTruthQrPng.height; y += 1) {
  for (let x = 0; x < sourceTruthQrPng.width; x += 1) {
    const offset = (sourceTruthQrPng.width * y + x) << 2;
    const value = (x + y) % 2 === 0 ? 0 : 255;
    sourceTruthQrPng.data[offset] = value;
    sourceTruthQrPng.data[offset + 1] = value;
    sourceTruthQrPng.data[offset + 2] = value;
    sourceTruthQrPng.data[offset + 3] = 255;
  }
}
fs.writeFileSync(sourceTruthQrPath, PNG.sync.write(sourceTruthQrPng));
const lowContrastBarcodePath = path.join(projectPaths.working, 'source-truth-barcode-low-contrast.png');
const lowContrastBarcodePng = new PNG({ width: 40, height: 12 });
for (let y = 0; y < lowContrastBarcodePng.height; y += 1) {
  for (let x = 0; x < lowContrastBarcodePng.width; x += 1) {
    const offset = (lowContrastBarcodePng.width * y + x) << 2;
    const value = x % 2 === 0 ? 120 : 145;
    lowContrastBarcodePng.data[offset] = value;
    lowContrastBarcodePng.data[offset + 1] = value;
    lowContrastBarcodePng.data[offset + 2] = value;
    lowContrastBarcodePng.data[offset + 3] = 255;
  }
}
fs.writeFileSync(lowContrastBarcodePath, PNG.sync.write(lowContrastBarcodePng));
const sourceTruthAudit = auditSourceTruthBitmaps({
  assets: [
    {
      id: 'activation_qr',
      route: 'reference_cutout',
      path: sourceTruthQrPath,
      asset_source_type: 'local_deterministic_truth_asset',
      final_asset_ready: true,
      css_filter_allowed: false,
      symbology: 'QR',
    },
    {
      id: 'training_reference',
      kind: 'training_reference',
      route: 'review',
      path: path.join(projectPaths.source, 'reference.png'),
      asset_source_type: 'imagegen_training_reference',
      final_asset_ready: false,
    },
    {
      id: 'bad_barcode',
      kind: 'barcode',
      route: 'regenerated_image',
      path: lowContrastBarcodePath,
      asset_source_type: '',
      final_asset_ready: true,
      css_filter_allowed: true,
      symbology: 'Code39',
    },
  ],
});
const qrSourceTruth = sourceTruthAudit.assets.find((asset) => asset.id === 'activation_qr');
const skippedTrainingReference = sourceTruthAudit.assets.find((asset) => asset.id === 'training_reference');
const badBarcodeTruth = sourceTruthAudit.assets.find((asset) => asset.id === 'bad_barcode');
assert(sourceTruthAudit.status === 'fail', 'mixed source-truth bitmap audit should fail when one asset is invalid');
assert(qrSourceTruth.status === 'pass', 'valid high-contrast QR source-truth bitmap should pass');
assert(qrSourceTruth.high_contrast.pass === true, 'valid QR should record high-contrast pass');
assert(skippedTrainingReference.status === 'skipped', 'mixed provenance source-truth audit should skip non-source-truth assets');
assert(badBarcodeTruth.status === 'fail', 'invalid barcode source-truth bitmap should fail');
assert(badBarcodeTruth.failures.some((failure) => failure.code === 'forbidden_source_truth_route'), 'source-truth barcode must reject regenerated route');
assert(badBarcodeTruth.failures.some((failure) => failure.code === 'css_filter_allowed'), 'source-truth barcode must reject CSS filter allowance');
assert(badBarcodeTruth.failures.some((failure) => failure.code === 'low_contrast_bitmap'), 'source-truth barcode must reject low contrast');

const bitmapLayerHtmlPath = path.join(projectPaths.working, 'bitmap-layer-contract.html');
fs.writeFileSync(bitmapLayerHtmlPath, `<!doctype html>
<html>
<body>
  <main class="poster" style="width: 400px; height: 300px">
    <figure class="qr-card" data-asset-id="activation_qr" data-route="reference_cutout" data-final-asset-ready="true">
      <img class="qr-code" src="${sourceTruthQrPath}" width="20" height="20" data-asset-text-policy="no-text" data-source-truth="true">
    </figure>
    <img class="floating-bitmap" src="${lowContrastBarcodePath}" data-asset-text-policy="no-text">
  </main>
</body>
</html>`);
const bitmapLayerContractAudit = auditBitmapLayerContract({
  htmlPath: bitmapLayerHtmlPath,
  provenance: {
    assets: [
      {
        id: 'activation_qr',
        path: sourceTruthQrPath,
        route: 'reference_cutout',
        asset_source_type: 'local_deterministic_truth_asset',
        final_asset_ready: true,
        css_placement: { selector: '.qr-card img', width: 20, height: 20, z_index: 'normal' },
      },
    ],
  },
});
assert(bitmapLayerContractAudit.status === 'fail', 'bitmap layer contract should fail when one HTML bitmap lacks provenance');
const validLayer = bitmapLayerContractAudit.layers.find((layer) => layer.asset_id === 'activation_qr');
const invalidLayer = bitmapLayerContractAudit.layers.find((layer) => layer.src && layer.src.endsWith('source-truth-barcode-low-contrast.png'));
assert(validLayer.status === 'pass', 'valid bitmap layer should pass provenance and placement contract');
assert(invalidLayer.status === 'fail', 'bitmap layer without asset id/provenance should fail');
assert(invalidLayer.failures.some((failure) => failure.code === 'missing_asset_id'), 'invalid bitmap layer should report missing asset id');
assert(invalidLayer.failures.some((failure) => failure.code === 'missing_provenance'), 'invalid bitmap layer should report missing provenance');
assert(bitmapLayerContractAudit.summary.pass_count === 1 && bitmapLayerContractAudit.summary.fail_count === 1, 'bitmap layer contract should summarize pass/fail layers');

const reviewGateHtmlPath = path.join(projectPaths.working, 'review-gate-contract.html');
fs.writeFileSync(reviewGateHtmlPath, `<!doctype html>
<html>
<body>
  <main class="poster" style="width: 400px; height: 300px">
    <section data-route="review" data-asset-id="traveler" data-final-asset-ready="false">
      <p>Traveler remains under review until an accepted transparent cutout exists.</p>
    </section>
    <section data-route="review" data-asset-id="fake-map">
      <img src="${sourceTruthQrPath}" data-asset-text-policy="no-text">
    </section>
  </main>
</body>
</html>`);
const reviewGateAudit = auditReviewGateContract({
  htmlPath: reviewGateHtmlPath,
  reviewGatedAssets: ['traveler', 'fake-map'],
});
const travelerGate = reviewGateAudit.gates.find((gate) => gate.asset_id === 'traveler');
const fakeMapGate = reviewGateAudit.gates.find((gate) => gate.asset_id === 'fake-map');
assert(reviewGateAudit.status === 'fail', 'review gate contract should fail invalid review gates');
assert(travelerGate.status === 'pass', 'explicit non-final review gate with reason should pass');
assert(fakeMapGate.status === 'fail', 'review gate containing image placeholder and no final flag should fail');
assert(fakeMapGate.failures.some((failure) => failure.code === 'missing_final_false'), 'invalid review gate should require data-final-asset-ready=false');
assert(fakeMapGate.failures.some((failure) => failure.code === 'review_gate_contains_bitmap'), 'invalid review gate should reject hidden bitmap placeholders');

const assetReadinessAudit = auditAssetReadinessContract({
  expectedContract: {
    case_id: 'unit-asset-readiness',
    required_routes: [
      {
        element_id: 'app_icons',
        kind: 'app_icon',
        expected_route: 'review',
        allowed_routes: ['reference_cutout', 'review'],
      },
      {
        element_id: 'cloud_layers',
        kind: 'cloud',
        expected_route: 'regenerated_image',
      },
      {
        element_id: 'pricing_table',
        kind: 'table',
        expected_route: 'editable_text',
      },
    ],
  },
  provenance: {
    assets: [
      {
        id: 'cloud_layers',
        route: 'regenerated_image',
        asset_source_type: 'prompt_only',
        status: 'prompt_only',
        final_asset_ready: false,
      },
    ],
    dom_assets: [
      {
        id: 'app_icons',
        route: 'review',
        final_asset_ready: false,
      },
    ],
  },
  imagegenCandidates: {
    candidates: [
      {
        id: 'cloud_layers_candidate_01',
        route_target: 'cloud_layers',
        accepted: false,
        blocked_from_final_html: true,
        rejection_reason: 'no_alpha_channel',
      },
    ],
  },
  reviewGateAudit: {
    status: 'pass',
    gates: [
      {
        asset_id: 'app_icons',
        review_covers: [],
        status: 'pass',
      },
    ],
  },
});
const appIconsReadiness = assetReadinessAudit.assets.find((asset) => asset.asset_id === 'app_icons');
const cloudReadiness = assetReadinessAudit.assets.find((asset) => asset.asset_id === 'cloud_layers');
const tableReadiness = assetReadinessAudit.assets.find((asset) => asset.asset_id === 'pricing_table');
assert(assetReadinessAudit.status === 'fail', 'asset readiness should fail when a prompt-only regenerated asset lacks final provenance and review coverage');
assert(appIconsReadiness.status === 'review', 'review-gated app icons should be reported as review, not pass');
assert(cloudReadiness.status === 'fail', 'prompt-only cloud asset without accepted candidate or review gate should fail readiness');
assert(cloudReadiness.failures.some((failure) => failure.code === 'prompt_only_not_review_gated'), 'prompt-only asset should require review gate coverage');
assert(cloudReadiness.failures.some((failure) => failure.code === 'no_accepted_imagegen_candidate'), 'regenerated asset should require an accepted ImageGen candidate or review gate');
assert(tableReadiness.status === 'pass' && tableReadiness.readiness === 'not_asset_required', 'editable text/table routes should not require bitmap asset readiness');

const sourceTruthAcquisitionAudit = auditSourceTruthAcquisitionPlan({
  expectedContract: {
    case_id: 'unit-source-truth-acquisition',
    required_routes: [
      { element_id: 'app_icons', kind: 'app_icon', expected_route: 'review', allowed_routes: ['reference_cutout', 'review'] },
      { element_id: 'payment_marks', kind: 'payment_logo', expected_route: 'review', allowed_routes: ['reference_cutout', 'review'] },
      { element_id: 'country_flags', kind: 'country_flag', expected_route: 'review', allowed_routes: ['reference_cutout', 'review'] },
      { element_id: 'unblocked_app_icon', kind: 'app_icon', expected_route: 'review', allowed_routes: ['reference_cutout', 'review'] },
      { element_id: 'activation_qr', kind: 'qr', expected_route: 'reference_cutout' },
      { element_id: 'unscoped_qr', kind: 'qr', expected_route: 'reference_cutout' },
      { element_id: 'floating_payment_logo', kind: 'payment_logo', expected_route: 'reference_cutout' },
    ],
  },
  provenance: {
    assets: [
      {
        id: 'activation_qr',
        kind: 'qr',
        route: 'reference_cutout',
        path: '/tmp/unit-activation-qr.png',
        width: 256,
        height: 256,
        sha256: 'unit-sha256-activation-qr',
        asset_source_type: 'copied_from_qr_barcode_case_local_deterministic_truth_asset',
        source_truth_scope: 'lab_owned_deterministic_test_fixture',
        license: 'internal_test_fixture',
        status: 'accepted_for_html',
        final_asset_ready: true,
      },
      {
        id: 'unscoped_qr',
        kind: 'qr',
        route: 'reference_cutout',
        path: '/tmp/unit-unscoped-qr.png',
        width: 256,
        height: 256,
        sha256: 'unit-sha256-unscoped-qr',
        asset_source_type: 'source_bitmap',
        status: 'accepted_for_html',
        final_asset_ready: true,
      },
      { id: 'floating_payment_logo', kind: 'payment_logo', route: 'reference_cutout', status: 'accepted_for_html', final_asset_ready: true },
    ],
    dom_assets: [
      { id: 'app_icons', route: 'review', final_asset_ready: false },
      { id: 'unblocked_app_icon', route: 'review', final_asset_ready: false },
      { id: 'payment_marks', route: 'review', final_asset_ready: false },
      { id: 'country_flags', route: 'review', final_asset_ready: false },
    ],
  },
  reviewGateAudit: {
    gates: [
      { asset_id: 'app_icons', status: 'pass', review_covers: [] },
      { asset_id: 'unblocked_app_icon', status: 'pass', review_covers: [] },
      { asset_id: 'payment_marks', status: 'pass', review_covers: [] },
      { asset_id: 'country_flags', status: 'pass', review_covers: [] },
    ],
  },
  acquisitionPlan: {
    assets: [
      {
        asset_id: 'app_icons',
        kind: 'app_icon',
        status: 'review_required',
        allowed_source_types: ['user_provided_asset', 'licensed_asset', 'reference_cutout'],
        forbidden_actions: ['regenerated_image', 'approximate_redraw', 'editable_vector'],
        blocking_condition: 'external_source_asset_missing',
        evidence_required: ['source_file_path', 'license_or_usage_scope', 'checksum', 'dimensions'],
        next_action: 'Request user-provided app icon assets or licensed source artwork.',
      },
      {
        asset_id: 'unblocked_app_icon',
        kind: 'app_icon',
        status: 'review_required',
        allowed_source_types: ['user_provided_asset', 'licensed_asset', 'reference_cutout'],
        forbidden_actions: ['regenerated_image', 'approximate_redraw', 'editable_vector'],
        next_action: 'Request user-provided app icon assets or licensed source artwork.',
      },
      {
        asset_id: 'payment_marks',
        kind: 'payment_logo',
        status: 'review_required',
        allowed_source_types: ['user_provided_asset', 'licensed_asset'],
        forbidden_actions: ['regenerated_image'],
        next_action: 'Request licensed payment logo source artwork.',
      },
    ],
  },
});
const appIconAcquisition = sourceTruthAcquisitionAudit.assets.find((asset) => asset.asset_id === 'app_icons');
const unblockedAppIconAcquisition = sourceTruthAcquisitionAudit.assets.find((asset) => asset.asset_id === 'unblocked_app_icon');
const paymentAcquisition = sourceTruthAcquisitionAudit.assets.find((asset) => asset.asset_id === 'payment_marks');
const flagAcquisition = sourceTruthAcquisitionAudit.assets.find((asset) => asset.asset_id === 'country_flags');
const qrAcquisition = sourceTruthAcquisitionAudit.assets.find((asset) => asset.asset_id === 'activation_qr');
const unscopedQrAcquisition = sourceTruthAcquisitionAudit.assets.find((asset) => asset.asset_id === 'unscoped_qr');
const floatingPaymentAcquisition = sourceTruthAcquisitionAudit.assets.find((asset) => asset.asset_id === 'floating_payment_logo');
assert(sourceTruthAcquisitionAudit.status === 'fail', 'source-truth acquisition audit should fail missing or incomplete acquisition plans');
assert(appIconAcquisition.status === 'review', 'complete review-gated app icon acquisition plan should be review');
assert(unblockedAppIconAcquisition.status === 'fail', 'review-gated source-truth acquisition plans without blocker metadata should fail');
assert(unblockedAppIconAcquisition.failures.some((failure) => failure.code === 'missing_blocking_condition'), 'review-gated source-truth plans should require a blocking condition');
assert(unblockedAppIconAcquisition.failures.some((failure) => failure.code === 'missing_evidence_required'), 'review-gated source-truth plans should require evidence requirements');
assert(paymentAcquisition.status === 'fail', 'payment logo plan missing required forbidden actions should fail');
assert(paymentAcquisition.failures.some((failure) => failure.code === 'missing_forbidden_action'), 'payment logo plan should require forbidden action coverage');
assert(flagAcquisition.status === 'fail', 'country flags without acquisition plan should fail');
assert(flagAcquisition.failures.some((failure) => failure.code === 'missing_acquisition_plan'), 'missing country flag acquisition plan should be explicit');
assert(qrAcquisition.status === 'pass', 'final-ready QR source-truth asset does not need acquisition plan');
assert(unscopedQrAcquisition.status === 'fail', 'final-ready source-truth assets without license/source scope should fail acquisition audit');
assert(unscopedQrAcquisition.failures.some((failure) => failure.code === 'missing_final_source_scope'), 'final-ready source-truth assets should require license/source scope evidence');
assert(floatingPaymentAcquisition.status === 'fail', 'final-ready source-truth assets without source metadata should fail acquisition audit');
assert(floatingPaymentAcquisition.failures.some((failure) => failure.code === 'missing_final_source_metadata'), 'final-ready source-truth assets should require source metadata evidence');

const lockedPhotoReadinessAudit = auditAssetReadinessContract({
  expectedContract: {
    case_id: 'unit-locked-photo-readiness',
    required_routes: [
      {
        element_id: 'airport_terminal',
        kind: 'photo_background',
        expected_route: 'locked_base_layer',
        allowed_routes: ['locked_base_layer', 'review'],
      },
    ],
  },
  routingTable: {
    elements: [
      {
        id: 'airport_terminal',
        kind: 'photo_background',
        route: 'review',
        status: 'review',
        difficulty_signals: ['flattened_text_conflicts_dom_overlay'],
      },
    ],
  },
  provenance: {
    assets: [
      {
        id: 'airport_terminal',
        route: 'locked_base_layer',
        asset_source_type: 'reference_image',
        status: 'accepted_for_html',
        final_asset_ready: true,
        contains_flattened_text: true,
        requires_dom_overlay: true,
      },
    ],
  },
});
const lockedPhotoReadiness = lockedPhotoReadinessAudit.assets.find((asset) => asset.asset_id === 'airport_terminal');
assert(lockedPhotoReadinessAudit.status === 'fail', 'locked photo layer with flattened text conflict must fail without clean-base proof or review gate');
assert(lockedPhotoReadiness.failures.some((failure) => failure.code === 'locked_base_contains_flattened_text'), 'locked photo readiness should report flattened text conflict');

const regeneratedOpaqueBaseReadinessAudit = auditAssetReadinessContract({
  expectedContract: {
    case_id: 'unit-regenerated-opaque-base-readiness',
    required_routes: [
      {
        element_id: 'clean_airport_background',
        kind: 'photo_background',
        expected_route: 'locked_base_layer',
      },
    ],
  },
  provenance: {
    assets: [
      {
        id: 'clean_airport_background',
        route: 'locked_base_layer',
        asset_source_type: 'regenerated_image',
        status: 'accepted_for_html',
        final_asset_ready: true,
        contains_flattened_text: false,
      },
    ],
  },
});
const regeneratedOpaqueBaseReadiness = regeneratedOpaqueBaseReadinessAudit.assets.find((asset) => asset.asset_id === 'clean_airport_background');
assert(regeneratedOpaqueBaseReadinessAudit.status === 'fail', 'regenerated opaque locked bases should require explicit clean-base provenance');
assert(regeneratedOpaqueBaseReadiness.failures.some((failure) => failure.code === 'missing_regenerated_locked_base_provenance'), 'regenerated opaque locked bases should report missing provenance');

const greenFringeCandidatePath = path.join(projectPaths.working, 'imagegen-green-fringe-alpha-candidate.png');
const greenFringeCandidatePng = new PNG({ width: 12, height: 12 });
for (let y = 0; y < greenFringeCandidatePng.height; y += 1) {
  for (let x = 0; x < greenFringeCandidatePng.width; x += 1) {
    const offset = (greenFringeCandidatePng.width * y + x) << 2;
    const inSubject = x >= 3 && x <= 8 && y >= 3 && y <= 8;
    const inGreenFringe = inSubject && (x === 3 || x === 8 || y === 3 || y === 8);
    greenFringeCandidatePng.data[offset] = inGreenFringe ? 0 : inSubject ? 46 : 0;
    greenFringeCandidatePng.data[offset + 1] = inGreenFringe ? 250 : inSubject ? 118 : 0;
    greenFringeCandidatePng.data[offset + 2] = inGreenFringe ? 0 : inSubject ? 180 : 0;
    greenFringeCandidatePng.data[offset + 3] = inSubject ? 255 : 0;
  }
}
fs.writeFileSync(greenFringeCandidatePath, PNG.sync.write(greenFringeCandidatePng));
const greenFringeCandidateAudit = auditImagegenCandidate({
  id: 'traveler_green_fringe_candidate',
  routeTarget: 'human_traveler',
  outputPath: greenFringeCandidatePath,
  prompt: 'traveler cutout from flat #00ff00 chroma-key background',
  keyColor: '#00ff00',
});
assert(greenFringeCandidateAudit.accepted === false, 'candidate with alpha proof but chroma-key fringe must be rejected');
assert(greenFringeCandidateAudit.edge_fringe_issues.includes('chroma_key_fringe'), 'green fringe candidate should report chroma_key_fringe');
assert(greenFringeCandidateAudit.chroma_key_fringe && greenFringeCandidateAudit.chroma_key_fringe.contaminated_pixel_ratio > 0, 'green fringe candidate should record contamination ratio');
assert(greenFringeCandidateAudit.rejection_reason.includes('chroma'), 'green fringe rejection should mention chroma contamination');
const precomputedFringeCandidateAudit = auditImagegenCandidate({
  id: 'traveler_precomputed_fringe_candidate',
  routeTarget: 'human_traveler',
  outputPath: transparentCandidatePath,
  prompt: 'traveler cutout from case-local chroma removal',
  edge_fringe_green_ratio: 0.0032,
});
assert(precomputedFringeCandidateAudit.accepted === false, 'candidate with precomputed green fringe ratio must be rejected');
assert(precomputedFringeCandidateAudit.edge_fringe_issues.includes('chroma_key_fringe'), 'precomputed fringe candidate should report chroma_key_fringe');
assert(precomputedFringeCandidateAudit.chroma_key_fringe.source === 'precomputed_edge_fringe_green_ratio', 'precomputed fringe evidence should record its source');
const smallPrecomputedFringeCandidateAudit = auditImagegenCandidate({
  id: 'phone_small_precomputed_fringe_candidate',
  routeTarget: 'phone_shell',
  outputPath: transparentCandidatePath,
  prompt: 'phone shell cutout from case-local chroma removal',
  keyColor: '#00ff00',
  edge_fringe_green_ratio: 0.0008,
});
assert(smallPrecomputedFringeCandidateAudit.accepted === false, 'any explicit precomputed visible green fringe should block final HTML');
assert(smallPrecomputedFringeCandidateAudit.chroma_key_fringe.source === 'precomputed_edge_fringe_green_ratio', 'precomputed fringe should remain the reported evidence source even when computed key-color scan is clean');

const imagegenManifestPath = path.join(projectPaths.working, 'imagegen-candidates-input.json');
const imagegenReportPath = path.join(projectPaths.reports, 'imagegen-candidates-audit.json');
fs.writeFileSync(imagegenManifestPath, JSON.stringify({
  case_id: 'unit-imagegen-candidates',
  candidates: [
    {
      id: 'opaque_candidate',
      route_target: 'volumetric_glow',
      output_path: opaqueCandidatePath,
      prompt: 'transparent PNG with alpha channel',
    },
    {
      id: 'transparent_candidate',
      route_target: 'cloud_layers',
      output_path: transparentCandidatePath,
      prompt: 'transparent PNG with alpha channel',
      transparency_method: 'native_alpha',
      alpha_source: 'model_native_transparent_png',
    },
  ],
}, null, 2));
const imagegenAuditOutput = require('child_process').execFileSync(process.execPath, [
  path.join(ROOT, 'scripts', 'audit-imagegen-candidates.js'),
  '--input', imagegenManifestPath,
  '--report', imagegenReportPath,
], {
  cwd: ROOT,
  encoding: 'utf8',
});
assert(imagegenAuditOutput.includes('ImageGen candidate audit written'), 'audit:imagegen should print report path');
assert(fs.existsSync(imagegenReportPath), 'audit:imagegen should write a JSON report');
const imagegenAuditReport = JSON.parse(fs.readFileSync(imagegenReportPath, 'utf8'));
assert(imagegenAuditReport.status === 'partial', 'mixed candidate audit should have partial status');
assert(imagegenAuditReport.summary.accepted === 1, 'candidate audit should count accepted candidate');
assert(imagegenAuditReport.summary.rejected === 1, 'candidate audit should count rejected candidate');
assert(imagegenAuditReport.candidates.find((item) => item.id === 'opaque_candidate').blocked_from_final_html === true, 'rejected candidate must be blocked from final HTML in report');
assert(imagegenAuditReport.candidates.find((item) => item.id === 'transparent_candidate').alpha_extrema.min === 0, 'accepted candidate report should include alpha evidence');

const assetReadinessExpectedPath = path.join(projectPaths.working, 'asset-readiness-expected-contract.json');
const assetReadinessProvenancePath = path.join(projectPaths.working, 'asset-readiness-provenance.json');
const assetReadinessCandidatesPath = path.join(projectPaths.working, 'asset-readiness-imagegen-candidates.json');
const assetReadinessReviewPath = path.join(projectPaths.working, 'asset-readiness-review-gates.json');
const assetReadinessReportPath = path.join(projectPaths.reports, 'asset-readiness-audit.json');
fs.writeFileSync(assetReadinessExpectedPath, JSON.stringify({
  case_id: 'unit-asset-readiness-cli',
  required_routes: [
    { element_id: 'payment_marks', kind: 'payment_logo', expected_route: 'review', allowed_routes: ['reference_cutout', 'review'] },
    { element_id: 'phone_shell', kind: 'complex_gradient', expected_route: 'regenerated_image' },
  ],
}, null, 2));
fs.writeFileSync(assetReadinessProvenancePath, JSON.stringify({
  assets: [
    { id: 'phone_shell', route: 'regenerated_image', asset_source_type: 'prompt_only', status: 'prompt_only', final_asset_ready: false },
  ],
  dom_assets: [
    { id: 'payment_marks', route: 'review', final_asset_ready: false },
  ],
}, null, 2));
fs.writeFileSync(assetReadinessCandidatesPath, JSON.stringify({
  candidates: [
    { id: 'phone_shell_candidate_01', route_target: 'phone_shell', accepted: false, blocked_from_final_html: true, rejection_reason: 'no_alpha_channel' },
  ],
}, null, 2));
fs.writeFileSync(assetReadinessReviewPath, JSON.stringify({
  status: 'pass',
  gates: [
    { asset_id: 'payment_marks', status: 'pass', review_covers: [] },
  ],
}, null, 2));
const assetReadinessCliOutput = require('child_process').execFileSync(process.execPath, [
  path.join(ROOT, 'scripts', 'audit-asset-readiness.js'),
  '--expected', assetReadinessExpectedPath,
  '--provenance', assetReadinessProvenancePath,
  '--imagegen', assetReadinessCandidatesPath,
  '--review-gates', assetReadinessReviewPath,
  '--report', assetReadinessReportPath,
], {
  cwd: ROOT,
  encoding: 'utf8',
});
assert(assetReadinessCliOutput.includes('Asset readiness audit written'), 'audit:asset-readiness should print report path');
assert(fs.existsSync(assetReadinessReportPath), 'audit:asset-readiness should write report JSON');
const assetReadinessReport = JSON.parse(fs.readFileSync(assetReadinessReportPath, 'utf8'));
assert(assetReadinessReport.status === 'fail', 'CLI asset readiness report should preserve helper status');
assert(assetReadinessReport.summary.review_count === 1, 'CLI asset readiness report should count review-gated assets');
assert(assetReadinessReport.summary.fail_count === 1, 'CLI asset readiness report should count failed prompt-only assets');

const fusedLogoReadiness = auditAssetReadinessContract({
  expectedContract: {
    case_id: 'unit-logo-row-decomposition',
    required_routes: [
      {
        element_id: 'payment_badge_row',
        kind: 'payment_logo',
        expected_route: 'reference_cutout',
        requires_independent_children: true,
        min_child_assets: 3,
      },
    ],
  },
  provenance: {
    assets: [
      {
        id: 'payment_badge_row',
        route: 'reference_cutout',
        asset_source_type: 'reference_crop',
        final_asset_ready: true,
      },
    ],
  },
});
assert(fusedLogoReadiness.status === 'fail', 'fused logo/payment rows should fail when independent child assets are required');
assert(fusedLogoReadiness.failures.some((failure) => failure.code === 'missing_independent_child_assets'), 'fused logo/payment rows should report missing independent child assets');

const decomposedLogoReadiness = auditAssetReadinessContract({
  expectedContract: {
    case_id: 'unit-logo-row-decomposed-children',
    required_routes: [
      {
        element_id: 'payment_badge_row',
        kind: 'payment_logo',
        expected_route: 'reference_cutout',
        requires_independent_children: true,
        min_child_assets: 3,
      },
    ],
  },
  provenance: {
    dom_assets: [
      {
        id: 'payment_badge_row',
        route: 'reference_cutout',
        final_asset_ready: false,
        child_assets: [
          { id: 'payment_badge_1', route: 'reference_cutout', final_asset_ready: true },
          { id: 'payment_badge_2', route: 'reference_cutout', final_asset_ready: true },
          { id: 'payment_badge_3', route: 'reference_cutout', final_asset_ready: true },
        ],
      },
    ],
  },
});
assert(decomposedLogoReadiness.status === 'pass', 'independent child assets should satisfy grouped logo/payment readiness');
assert(decomposedLogoReadiness.assets[0].readiness === 'independent_children_ready', 'decomposed logo/payment rows should report child readiness');

const poseFidelityReadinessAudit = auditAssetReadinessContract({
  expectedContract: {
    case_id: 'unit-primary-human-pose-fidelity',
    required_routes: [
      {
        element_id: 'traveler_alpha',
        kind: 'human_traveler',
        expected_route: 'regenerated_image',
        requires_pose_fidelity_review: true,
      },
    ],
  },
  provenance: {
    assets: [
      {
        id: 'traveler_alpha',
        route: 'regenerated_image',
        asset_source_type: 'regenerated_image',
        status: 'accepted_for_html',
        final_asset_ready: true,
      },
    ],
  },
  imagegenCandidates: {
    candidates: [
      {
        id: 'traveler_candidate',
        route_target: 'traveler_alpha',
        accepted: true,
        blocked_from_final_html: false,
      },
    ],
  },
});
const poseFidelityReadiness = poseFidelityReadinessAudit.assets.find((asset) => asset.asset_id === 'traveler_alpha');
assert(poseFidelityReadinessAudit.status === 'fail', 'primary regenerated human/device assets should require pose fidelity evidence when requested');
assert(poseFidelityReadiness.failures.some((failure) => failure.code === 'missing_pose_fidelity_review'), 'pose fidelity readiness should report missing_pose_fidelity_review');

const acquisitionExpectedPath = path.join(projectPaths.working, 'source-truth-acquisition-expected-contract.json');
const acquisitionProvenancePath = path.join(projectPaths.working, 'source-truth-acquisition-provenance.json');
const acquisitionReviewPath = path.join(projectPaths.working, 'source-truth-acquisition-review-gates.json');
const acquisitionPlanPath = path.join(projectPaths.working, 'source-truth-acquisition-plan.json');
const acquisitionReportPath = path.join(projectPaths.reports, 'source-truth-acquisition-audit.json');
fs.writeFileSync(acquisitionExpectedPath, JSON.stringify({
  case_id: 'unit-source-truth-acquisition-cli',
  required_routes: [
    { element_id: 'payment_marks', kind: 'payment_logo', expected_route: 'review', allowed_routes: ['reference_cutout', 'review'] },
  ],
}, null, 2));
fs.writeFileSync(acquisitionProvenancePath, JSON.stringify({
  dom_assets: [
    { id: 'payment_marks', route: 'review', final_asset_ready: false },
  ],
}, null, 2));
fs.writeFileSync(acquisitionReviewPath, JSON.stringify({
  status: 'pass',
  gates: [
    { asset_id: 'payment_marks', status: 'pass', review_covers: [] },
  ],
}, null, 2));
fs.writeFileSync(acquisitionPlanPath, JSON.stringify({
  assets: [
    {
      asset_id: 'payment_marks',
      kind: 'payment_logo',
      status: 'review_required',
      allowed_source_types: ['user_provided_asset', 'licensed_asset'],
      forbidden_actions: ['regenerated_image', 'approximate_redraw', 'editable_vector'],
      blocking_condition: 'external_source_asset_missing',
      evidence_required: ['source_file_path', 'license_or_usage_scope', 'checksum', 'dimensions'],
      next_action: 'Request licensed payment logo source artwork.',
    },
  ],
}, null, 2));
const acquisitionCliOutput = require('child_process').execFileSync(process.execPath, [
  path.join(ROOT, 'scripts', 'audit-source-truth-acquisition.js'),
  '--expected', acquisitionExpectedPath,
  '--provenance', acquisitionProvenancePath,
  '--review-gates', acquisitionReviewPath,
  '--plan', acquisitionPlanPath,
  '--report', acquisitionReportPath,
], {
  cwd: ROOT,
  encoding: 'utf8',
});
assert(acquisitionCliOutput.includes('Source-truth acquisition audit written'), 'audit:source-truth-acquisition should print report path');
assert(fs.existsSync(acquisitionReportPath), 'audit:source-truth-acquisition should write report JSON');
const acquisitionReport = JSON.parse(fs.readFileSync(acquisitionReportPath, 'utf8'));
assert(acquisitionReport.status === 'review', 'CLI source-truth acquisition report should preserve review status');
assert(acquisitionReport.summary.review_count === 1, 'CLI source-truth acquisition report should count review-gated plans');

const overlapLayoutAudit = auditLayoutContract({
  canvas: { width: 1024, height: 1536 },
  regions: [
    { id: 'dashboard', role: 'dom_widget', bbox: { x: 334, y: 472, w: 640, h: 325 } },
    { id: 'map-panel', role: 'review_gate', bbox: { x: 278, y: 760, w: 520, h: 240 } },
    { id: 'pricing-table', role: 'dom_table', bbox: { x: 70, y: 1020, w: 560, h: 246 } },
  ],
});
assert(overlapLayoutAudit.status === 'fail', 'layout contract should fail key-region overlap');
assert(overlapLayoutAudit.failures.some((item) => item.code === 'key_region_overlap' && item.a === 'dashboard' && item.b === 'map-panel'), 'layout contract should identify overlapping regions by id');
assert(overlapLayoutAudit.failures.every((item) => item.coordinate_evidence), 'layout failures should include coordinate evidence');
const cleanLayoutAudit = auditLayoutContract({
  canvas: { width: 1024, height: 1536 },
  regions: [
    { id: 'dashboard', role: 'dom_widget', bbox: { x: 334, y: 472, w: 640, h: 325 } },
    { id: 'map-panel', role: 'review_gate', bbox: { x: 278, y: 805, w: 520, h: 200 } },
    { id: 'pricing-table', role: 'dom_table', bbox: { x: 70, y: 1020, w: 560, h: 246 } },
  ],
});
assert(cleanLayoutAudit.status === 'pass', 'layout contract should pass separated key regions');
assert(cleanLayoutAudit.summary.overlap_count === 0, 'clean layout should have no overlap failures');

const visualDomBadSnapshot = {
  html: path.join(projectPaths.html, 'index.html'),
  file_url: 'file:///visual-dom-bad.html',
  canvas: { width: 2280, height: 800 },
  elements: [
    {
      selector: '.scene-base',
      tag: 'img',
      rect: { x: 0, y: 0, width: 2280, height: 800, left: 0, top: 0, right: 2280, bottom: 800 },
      visible: true,
      display: 'block',
      position: 'absolute',
      z_index: 1,
      data_asset_id: 'locked-kyoto-scene',
      data_route: 'locked_base_layer',
      data_asset_text_policy: 'text_obscured_by_editable_dom_overlay',
      data_final_asset_ready: 'true',
      clean_base_proof: '',
    },
    {
      selector: '.copy-card',
      tag: 'section',
      rect: { x: 842, y: 52, width: 598, height: 637, left: 842, top: 52, right: 1440, bottom: 689 },
      visible: true,
      display: 'block',
      position: 'absolute',
      z_index: 8,
    },
    {
      selector: '.aqua-wave',
      tag: 'div',
      rect: { x: -120, y: 585, width: 2520, height: 390, left: -120, top: 585, right: 2400, bottom: 975 },
      visible: true,
      display: 'block',
      position: 'absolute',
      z_index: 6,
      inferred_role: 'editable_vector',
    },
    {
      selector: '.person-restore',
      tag: 'div',
      rect: { x: 1340, y: 215, width: 418, height: 585, left: 1340, top: 215, right: 1758, bottom: 800 },
      visible: false,
      display: 'none',
      position: 'absolute',
      z_index: 9,
      data_asset_id: 'traveler-restore-crop',
      data_route: 'locked_base_layer',
    },
  ],
  text_boxes: [
    {
      selector: '.award-line.award-line-one',
      text: '2026 Opensignal 評選',
      i18n_key: 'award.opensignal',
      rect: { x: 794, y: 512, width: 320, height: 38, left: 794, top: 512, right: 1114, bottom: 550 },
      center: { x: 954, y: 531 },
      top_selector_at_center: '.aqua-wave',
      top_z_index_at_center: 6,
      covered_by_unrelated_top_element: true,
    },
  ],
};
const visualDomBadAudit = auditVisualDomSnapshot(visualDomBadSnapshot);
assert(visualDomBadAudit.status === 'fail', 'visual DOM audit should fail the locked-base / disabled-layer / occluded-text pattern');
assert(visualDomBadAudit.failures.some((failure) => failure.code === 'locked_base_text_obscured_without_clean_base'), 'visual DOM audit should fail locked base with obscured raster text and no clean-base proof');
assert(visualDomBadAudit.failures.some((failure) => failure.code === 'disabled_asset_layer' && failure.asset_id === 'traveler-restore-crop'), 'visual DOM audit should fail disabled routed asset layers');
assert(visualDomBadAudit.failures.some((failure) => failure.code === 'text_center_occluded' && failure.selector === '.award-line.award-line-one'), 'visual DOM audit should fail editable text occlusion');
assert(visualDomBadAudit.failures.some((failure) => failure.code === 'z_index_band_violation' && failure.selector === '.aqua-wave'), 'visual DOM audit should fail vector layers outside their z-index band');

const visualDomCleanSnapshot = {
  html: path.join(projectPaths.html, 'index-clean.html'),
  file_url: 'file:///visual-dom-clean.html',
  canvas: { width: 1200, height: 800 },
  elements: [
    {
      selector: '.clean-base',
      tag: 'img',
      rect: { x: 0, y: 0, width: 1200, height: 800, left: 0, top: 0, right: 1200, bottom: 800 },
      visible: true,
      display: 'block',
      position: 'absolute',
      z_index: 1,
      data_asset_id: 'clean-scenery',
      data_route: 'locked_base_layer',
      data_asset_text_policy: 'clean_no_text_base',
      data_final_asset_ready: 'true',
      clean_base_proof: 'source/reference-clean-base.png',
    },
    {
      selector: '.title',
      tag: 'h1',
      rect: { x: 120, y: 120, width: 420, height: 90, left: 120, top: 120, right: 540, bottom: 210 },
      visible: true,
      display: 'block',
      position: 'absolute',
      z_index: 72,
      inferred_role: 'editable_text',
    },
  ],
  text_boxes: [
    {
      selector: '.title',
      text: 'Japan eSIM',
      i18n_key: 'headline.title',
      rect: { x: 120, y: 120, width: 420, height: 90, left: 120, top: 120, right: 540, bottom: 210 },
      center: { x: 330, y: 165 },
      top_selector_at_center: '.title',
      top_z_index_at_center: 72,
      covered_by_unrelated_top_element: false,
    },
  ],
};
const visualDomCleanAudit = auditVisualDomSnapshot(visualDomCleanSnapshot);
assert(visualDomCleanAudit.status === 'pass', 'visual DOM audit should pass clean base plus visible editable text');

const visualDomOverlaySvg = renderVisualDomOverlaySvg(visualDomBadAudit);
assert(visualDomOverlaySvg.includes('<svg'), 'visual DOM overlay should render an SVG document');
assert(visualDomOverlaySvg.includes('locked_base_text_obscured_without_clean_base'), 'visual DOM overlay should include failure labels');
assert(visualDomOverlaySvg.includes('.award-line.award-line-one'), 'visual DOM overlay should include text selectors');
const visualDomSummaryMd = renderVisualDomSummaryMarkdown({
  generated_at: new Date('2026-07-06T00:00:00.000Z').toISOString(),
  project_id: 'visual-dom-unit',
  subproject_id: null,
  browser_backed: false,
  status: 'fail',
  summary: {
    entry_count: 1,
    pass_count: 0,
    review_count: 0,
    fail_count: 1,
    element_count: visualDomBadAudit.elements.length,
    text_box_count: visualDomBadAudit.text_boxes.length,
    image_layer_count: visualDomBadAudit.elements.filter((element) => element.tag === 'img').length,
    failure_count: visualDomBadAudit.failures.length,
    failure_types: [...new Set(visualDomBadAudit.failures.map((failure) => failure.code))].sort(),
  },
  entries: [visualDomBadAudit],
});
assert(visualDomSummaryMd.includes('# Visual DOM Audit'), 'visual DOM summary should have a stable heading');
assert(visualDomSummaryMd.includes('locked_base_text_obscured_without_clean_base'), 'visual DOM summary should list failure codes');

const visualDomProjectId = 'visual-dom-smoke-preview-audit';
assertReadableProjectName(visualDomProjectId, 'visual DOM smoke project id');
const visualDomProjectPaths = createProjectWorkspace(visualDomProjectId);
const visualDomHtmlPath = path.join(visualDomProjectPaths.html, 'index.html');
fs.mkdirSync(visualDomProjectPaths.html, { recursive: true });
fs.writeFileSync(visualDomHtmlPath, `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; }
    .poster { position: relative; width: 320px; height: 180px; overflow: hidden; }
    .clean-base { position: absolute; left: 0; top: 0; width: 320px; height: 180px; z-index: 1; }
    .title { position: absolute; left: 24px; top: 24px; z-index: 72; font-size: 28px; }
  </style>
</head>
<body>
  <main class="poster" style="width:320px;height:180px">
    <img class="clean-base" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-asset-id="clean-base" data-route="locked_base_layer" data-asset-text-policy="clean_no_text_base" data-clean-base-proof="source/clean-base.png" alt="">
    <h1 class="title" data-i18n-key="headline.title">Japan eSIM</h1>
  </main>
</body>
</html>
`, 'utf8');
const visualDomCliOutput = require('child_process').execFileSync(process.execPath, [
  path.join(ROOT, 'scripts', 'audit-visual-dom.js'),
  '--project', visualDomProjectPaths.project_id,
  '--no-fail',
  '--width', '320',
  '--height', '180',
], {
  cwd: ROOT,
  encoding: 'utf8',
});
assert(visualDomCliOutput.includes('Visual DOM audit written'), 'audit:visual-dom should print report path');
assert(fs.existsSync(path.join(visualDomProjectPaths.reports, 'visual-dom-audit.json')), 'audit:visual-dom should write JSON report');
assert(fs.existsSync(path.join(visualDomProjectPaths.reports, 'visual-dom-summary.md')), 'audit:visual-dom should write Markdown summary');
assert(fs.existsSync(path.join(visualDomProjectPaths.reports, 'visual-dom-overlay.svg')), 'audit:visual-dom should write SVG overlay');

const visualDomConversationSnapshot = {
  html: '/Users/tashima_meru/Documents/text2html-image-project/japan-esim-kddi-banner-copy/html/index.html',
  file_url: 'file:///Users/tashima_meru/Documents/text2html-image-project/japan-esim-kddi-banner-copy/html/index.html',
  canvas: { width: 2280, height: 800 },
  elements: [
    {
      selector: '.scene-base',
      tag: 'img',
      rect: { x: 0, y: 0, width: 2280, height: 800, left: 0, top: 0, right: 2280, bottom: 800 },
      visible: true,
      display: 'block',
      position: 'absolute',
      z_index: 1,
      data_asset_id: 'locked-kyoto-scene',
      data_route: 'locked_base_layer',
      data_asset_text_policy: 'text_obscured_by_editable_dom_overlay',
      data_final_asset_ready: 'true',
    },
    {
      selector: '.copy-card',
      tag: 'section',
      rect: { x: 842, y: 52, width: 598, height: 637, left: 842, top: 52, right: 1440, bottom: 689 },
      visible: true,
      display: 'block',
      position: 'absolute',
      z_index: 8,
      inferred_role: 'editable_vector',
    },
    {
      selector: '.person-restore',
      tag: 'div',
      rect: { x: 1340, y: 215, width: 418, height: 585, left: 1340, top: 215, right: 1758, bottom: 800 },
      visible: false,
      display: 'none',
      position: 'absolute',
      z_index: 9,
      data_asset_id: 'traveler-restore-crop',
      data_route: 'locked_base_layer',
    },
    {
      selector: '.white-swoosh',
      tag: 'div',
      rect: { x: 1140, y: 500, width: 1450, height: 245, left: 1140, top: 500, right: 2590, bottom: 745 },
      visible: true,
      display: 'block',
      position: 'absolute',
      z_index: 5,
      inferred_role: 'editable_vector',
    },
  ],
  text_boxes: [
    {
      selector: '.brand-line',
      text: 'Powered by KDDI',
      i18n_key: 'brand.powered_by',
      rect: { x: 996, y: 110, width: 310, height: 48, left: 996, top: 110, right: 1306, bottom: 158 },
      center: { x: 1151, y: 134 },
      top_selector_at_center: '.brand-line',
      covered_by_unrelated_top_element: false,
    },
  ],
};
const visualDomConversationAudit = auditVisualDomSnapshot(visualDomConversationSnapshot);
assert(visualDomConversationAudit.status === 'fail', 'visual DOM audit should fail the conversation final-state pattern');
assert(visualDomConversationAudit.failures.some((failure) => failure.code === 'locked_base_text_obscured_without_clean_base'), 'conversation pattern should fail because full base contains hidden raster text without clean-base proof');
assert(visualDomConversationAudit.failures.some((failure) => failure.code === 'disabled_asset_layer'), 'conversation pattern should fail because person restore asset is disabled');

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

const macPersonUnavailableOutputPath = path.join(projectPaths.working, 'mac-person-guard-output.png');
let macPersonUnavailableError = null;
try {
  assertMacPersonCutoutAvailable({
    platform: 'linux',
    swiftPath: '/usr/bin/swift',
    fsExists: () => true,
  });
} catch (error) {
  macPersonUnavailableError = error;
}
assert(macPersonUnavailableError, 'mac person cutout should reject non-mac platforms');
assert(macPersonUnavailableError.message === 'cutout:person-mac requires macOS with Apple Vision and swift', 'mac person cutout should use stable non-mac error message');
assert(!fs.existsSync(macPersonUnavailableOutputPath), 'mac person cutout guard must not write partial output files');

// --- install-skill.js: 双平台符号链接安装 ---
const installSkill = require('./install-skill');
const osModule = require('os');

// 单元：resolveTargets 路径解析（纯函数，不碰真实 HOME）
{
  const targets = installSkill.resolveTargets({
    target: 'all',
    env: { CODEX_HOME: '/tmp/fake-codex' },
    homedir: '/tmp/fake-home',
  });
  assert(targets.length === 2, 'resolveTargets all should return two targets');
  const claude = targets.find((t) => t.platform === 'claude');
  const codex = targets.find((t) => t.platform === 'codex');
  assert(
    claude.linkPath === path.join('/tmp/fake-home', '.claude', 'skills', 'text2html-image'),
    'claude link path defaults under ~/.claude/skills'
  );
  assert(
    codex.linkPath === path.join('/tmp/fake-codex', 'skills', 'text2html-image'),
    'codex link path honors CODEX_HOME'
  );
  const onlyClaude = installSkill.resolveTargets({ target: 'claude', homedir: '/tmp/fake-home' });
  assert(onlyClaude.length === 1 && onlyClaude[0].platform === 'claude', 'target=claude filters to one target');
  const codexDefault = installSkill.resolveTargets({ target: 'codex', env: {}, homedir: '/tmp/fake-home' });
  assert(
    codexDefault[0].linkPath === path.join('/tmp/fake-home', '.codex', 'skills', 'text2html-image'),
    'codex falls back to ~/.codex when CODEX_HOME unset'
  );
}

// 端到端：创建 / 幂等 / 真实目录报错（用临时目录，不污染真实 HOME）
{
  const tmpBase = fs.mkdtempSync(path.join(osModule.tmpdir(), 't2h-install-'));
  const claudeDir = path.join(tmpBase, '.claude', 'skills');
  const codexDir = path.join(tmpBase, '.codex', 'skills');
  const claudeLink = path.join(claudeDir, 'text2html-image');
  const codexLink = path.join(codexDir, 'text2html-image');
  const runInstall = (extraArgs) =>
    require('child_process').execFileSync(
      process.execPath,
      [path.join(ROOT, 'scripts', 'install-skill.js'), '--claude-dir', claudeDir, '--codex-dir', codexDir, ...extraArgs],
      { cwd: ROOT, encoding: 'utf8' }
    );

  runInstall(['--target', 'all']);
  assert(fs.lstatSync(claudeLink).isSymbolicLink(), 'claude symlink created');
  assert(fs.lstatSync(codexLink).isSymbolicLink(), 'codex symlink created');
  assert(fs.realpathSync(claudeLink) === fs.realpathSync(ROOT), 'claude symlink points to skill dir');
  assert(fs.existsSync(path.join(claudeLink, 'SKILL.md')), 'SKILL.md is readable through the symlink');

  // 幂等：再次运行不报错，仍是符号链接
  runInstall(['--target', 'all']);
  assert(fs.lstatSync(claudeLink).isSymbolicLink(), 'idempotent re-run keeps the symlink');

  // 安全：目标是真实目录时必须报错且不删除
  fs.unlinkSync(claudeLink);
  fs.mkdirSync(claudeLink, { recursive: true });
  fs.writeFileSync(path.join(claudeLink, 'keep.txt'), 'real-data');
  let threw = false;
  try {
    runInstall(['--target', 'claude']);
  } catch (e) {
    threw = true;
    assert(/Refusing to overwrite real path/.test(String(e.stdout) + String(e.stderr)), 'error explains refusal');
  }
  assert(threw, 'install exits non-zero when target is a real directory');
  assert(fs.existsSync(path.join(claudeLink, 'keep.txt')), 'real directory must NOT be deleted');

  fs.rmSync(tmpBase, { recursive: true, force: true });
}

console.log(`Tests passed. Generated ${outputs.filter((item) => item.status === 'built').length} preview(s).`);
