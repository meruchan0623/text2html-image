# Direct HTML PNG Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增一个不依赖浏览器截图的 `export-fast` 流程，把本项目生成的静态 HTML 子集直接编译为 SVG，再以指定倍率无截图损失地栅格化为 PNG。

**Architecture:** 不尝试实现通用浏览器。实现一个 `poster-render profile`：解析生成后的 `html/<html-group>/index*.html`、读取同目录 `master.css`、抽取固定画布、绝对定位图层、内联 SVG、图片层和文本层，编译成 SVG，再用 `@resvg/resvg-js` 输出 PNG。遇到 `grid`、`flex` 自动布局、`filter`、`mix-blend-mode`、`clip-path`、伪元素视觉内容等超出 profile 的 CSS 时，写 `reports/render-profile-report.json` 并 fail-fast，不伪造输出。

**Tech Stack:** Node.js 18+, CommonJS, `parse5`, `css-tree`, `@resvg/resvg-js`, existing `scripts/utils/workflow-core.js`, existing `html/<group>/index*.html` outputs.

---

## 文件结构

- Create: `scripts/utils/html-entries.js`
  - 统一枚举 `html/<html-group>/index*.html`，供 `batch-export`、`render-fast` 和测试复用。
- Create: `scripts/utils/render-profile.js`
  - 读取 HTML/CSS，抽取画布、CSS 变量、基础 class 样式，检测 unsupported CSS。
- Create: `scripts/utils/poster-ir.js`
  - 将 HTML DOM 编译成受限 Poster IR：canvas、rect/image/svg/text/layer。
- Create: `scripts/utils/svg-compiler.js`
  - 将 Poster IR 编译成单个 SVG 字符串，内嵌本地图片为 data URL。
- Create: `scripts/render-fast.js`
  - CLI：`--profile-only` 只写 profile/IR；默认输出 PNG 和报告。
- Modify: `package.json`
  - 增加 `render:profile`、`export-fast` 脚本和依赖。
- Modify: `scripts/batch-export.js`
  - 改用 `html-entries.js`，输出文案明确 `report-only` 并指向 `npm run export-fast`。
- Modify: `scripts/test.js`
  - 增加 direct renderer smoke：profile pass/fail、SVG/PNG 生成、报告路径、无浏览器词汇。
- Modify: `skills/text2html-image/SKILL.md`
  - 把 `export-fast` 加入命令与 Export Mode Guard，明确它不是浏览器截图。
- Modify: `README.md`
  - 补充“直接 HTML 出图”和“不支持 CSS 时 fail-fast”的说明。

## 支持边界

第一版只承诺：

- fixed canvas from `.poster` inline `style="width: ...px; height: ...px"`.
- absolute positioned blocks with numeric `left/top/right/bottom/width/height`.
- inline SVG passthrough with computed x/y/width/height transform.
- `<img>` with local/data URL source, explicit width/height, `object-fit: contain|cover`.
- text nodes inside positioned elements, basic font/color/weight/size/line-height/text-align.
- CSS variables under `:root` and direct class selectors like `.title-pill`.
- simple `background`, `background-color`, `border`, `border-radius`, `opacity`, `z-index`.

第一版必须 fail-fast：

- `display: grid` or nontrivial `display: flex`.
- `filter`, `mix-blend-mode`, `clip-path`, `mask`.
- visual `::before` / `::after` with non-empty `content`.
- media queries.
- complex transforms beyond `translate(...)`, `rotate(...)`, and `translate(-50%, -50%)` on positioned boxes.
- external HTTP assets.

---

### Task 1: 依赖与命令脚本骨架

**Files:**
- Modify: `package.json`
- Test: `scripts/test.js`

- [ ] **Step 1: 写失败测试，要求脚本入口存在**

在 `scripts/test.js` 的 package script target 检查处，把脚本数组改成：

```js
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
```

在 `package.json` 断言后追加：

```js
const packageJson = JSON.parse(read('package.json'));
assert(packageJson.scripts['render:profile'] === 'node scripts/render-fast.js --profile-only', 'package.json missing render:profile script');
assert(packageJson.scripts['export-fast'] === 'node scripts/render-fast.js', 'package.json missing export-fast script');
for (const dependency of ['@resvg/resvg-js', 'css-tree', 'parse5']) {
  assert(packageJson.dependencies?.[dependency] || packageJson.devDependencies?.[dependency], `package.json missing ${dependency}`);
}
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test
```

Expected: FAIL with `missing package script target scripts/render-fast.js`.

- [ ] **Step 3: 安装依赖并增加脚本**

Run:

```bash
npm install @resvg/resvg-js css-tree parse5
```

修改 `package.json` 的 scripts：

```json
{
  "scripts": {
    "start": "node scripts/start.js",
    "project:init": "node scripts/project-init.js",
    "build": "node scripts/build.js",
    "quality-check": "node scripts/quality-check.js",
    "review:score": "node scripts/review-score.js",
    "batch-export": "node scripts/batch-export.js",
    "render:profile": "node scripts/render-fast.js --profile-only",
    "export-fast": "node scripts/render-fast.js",
    "test": "node scripts/test.js"
  }
}
```

- [ ] **Step 4: 新建最小 `scripts/render-fast.js`**

Create `scripts/render-fast.js`:

```js
const { parseArgs } = require('./utils/workflow-core');

const args = parseArgs();
console.log(`render-fast entry invoked${args['profile-only'] ? ' in profile-only mode' : ''}.`);
process.exit(0);
```

- [ ] **Step 5: 运行测试确认当前任务通过**

Run:

```bash
npm test
```

Expected: PASS through the new script existence/package checks.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json scripts/test.js scripts/render-fast.js
git commit -m "chore: add direct html renderer dependencies"
```

---

### Task 2: 统一 HTML 变体枚举

**Files:**
- Create: `scripts/utils/html-entries.js`
- Modify: `scripts/batch-export.js`
- Modify: `scripts/test.js`

- [ ] **Step 1: 写失败测试，要求枚举 canonical 和 localized variants**

在 `scripts/test.js` 顶部 require 区增加：

```js
const { listHtmlEntries } = require('./utils/html-entries');
```

在 `renderRows(undefined, { projectId })` 之后追加：

```js
const htmlEntries = listHtmlEntries(projectPaths);
assert(htmlEntries.length >= 3, 'html entries should enumerate generated canonical and localized previews');
assert(htmlEntries.some((entry) => entry.variant === 'canonical'), 'html entries should include canonical index.html');
assert(htmlEntries.some((entry) => entry.variant === 'zh-cn'), 'html entries should include zh-cn localized html');
assert(htmlEntries.every((entry) => entry.file_url === toFileUrl(entry.html)), 'html entries should include correct file_url');
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test
```

Expected: FAIL with `Cannot find module './utils/html-entries'`.

- [ ] **Step 3: 实现 `scripts/utils/html-entries.js`**

Create `scripts/utils/html-entries.js`:

```js
const fs = require('fs');
const path = require('path');
const { toFileUrl } = require('./workflow-core');

function variantFromFileName(fileName) {
  return fileName === 'index.html' ? 'canonical' : fileName.replace(/^index\.|\.[^.]+$/g, '');
}

function listHtmlEntries(projectPaths, options = {}) {
  const htmlRoot = projectPaths.html;
  if (!fs.existsSync(htmlRoot)) return [];
  const groups = options.group ? [options.group] : fs.readdirSync(htmlRoot).sort();
  return groups.flatMap((groupName) => {
    const groupDir = path.join(htmlRoot, groupName);
    if (!fs.existsSync(groupDir) || !fs.statSync(groupDir).isDirectory()) return [];
    return fs.readdirSync(groupDir)
      .filter((fileName) => /^index(?:\.[a-z0-9-]+)?\.html$/.test(fileName))
      .sort()
      .map((fileName) => {
        const html = path.join(groupDir, fileName);
        const variant = variantFromFileName(fileName);
        return {
          html_group: groupName,
          variant,
          html,
          file_name: fileName,
          file_url: toFileUrl(html),
          expected_png: path.join(projectPaths.exports, `${groupName}-${variant}.png`),
        };
      });
  });
}

module.exports = {
  listHtmlEntries,
  variantFromFileName,
};
```

- [ ] **Step 4: 修改 `scripts/batch-export.js` 使用共享枚举**

Replace manual scanning with:

```js
const path = require('path');
const { createProjectWorkspace, parseArgs, writeJson } = require('./utils/workflow-core');
const { listHtmlEntries } = require('./utils/html-entries');

const args = parseArgs();
const projectPaths = createProjectWorkspace(args.project, { subprojectId: args.subproject });
const entries = listHtmlEntries(projectPaths, { group: args.group }).map((entry) => ({
  ...entry,
  status: 'ready-for-export-fast-or-browser-fallback',
}));

const manifest = {
  generated_at: new Date().toISOString(),
  project_id: projectPaths.project_id,
  subproject_id: projectPaths.subproject_id,
  mode: 'report-only',
  note: 'This command does not create PNG files. Run npm run export-fast -- --project <project-id> for direct HTML-to-PNG rendering when the profile passes.',
  total: entries.length,
  exports: entries,
};

writeJson(path.join(projectPaths.reports, 'export-report.json'), manifest);
console.log(`Prepared report-only export report for ${entries.length} HTML preview(s) in project ${projectPaths.project_id}.`);
console.log('Run npm run export-fast -- --project <project-id> to create PNG files without browser screenshots when the render profile passes.');
```

- [ ] **Step 5: 更新 batch-export 测试**

把原来的 batch output 断言扩展为：

```js
assert(batchOutput.includes('report-only'), 'batch-export should say report-only');
assert(batchOutput.includes('npm run export-fast'), 'batch-export should point to export-fast');
```

- [ ] **Step 6: 运行测试确认通过**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/utils/html-entries.js scripts/batch-export.js scripts/test.js
git commit -m "refactor: share html export entry enumeration"
```

---

### Task 3: Render Profile 检测与 fail-fast 报告

**Files:**
- Create: `scripts/utils/render-profile.js`
- Modify: `scripts/render-fast.js`
- Modify: `scripts/test.js`

- [ ] **Step 1: 写失败测试，要求 profile-only 写报告并识别 unsupported CSS**

在 `scripts/test.js` 中 batch-export 测试后追加：

```js
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
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test
```

Expected: FAIL because `render-fast.js` does not write `render-profile-report.json`.

- [ ] **Step 3: 实现 `scripts/utils/render-profile.js`**

Create `scripts/utils/render-profile.js`:

```js
const fs = require('fs');
const path = require('path');
const parse5 = require('parse5');
const csstree = require('css-tree');

const UNSUPPORTED_PROPERTIES = new Set([
  'filter',
  'mix-blend-mode',
  'clip-path',
  'mask',
  'mask-image',
  '-webkit-mask',
  '-webkit-mask-image',
]);

function attrsToObject(node) {
  return Object.fromEntries((node.attrs || []).map((attr) => [attr.name, attr.value]));
}

function walk(node, callback) {
  callback(node);
  for (const child of node.childNodes || []) walk(child, callback);
}

function findElement(node, predicate) {
  let found;
  walk(node, (current) => {
    if (!found && current.nodeName && predicate(current)) found = current;
  });
  return found;
}

function parseInlineStyle(styleText = '') {
  return Object.fromEntries(String(styleText).split(';').map((part) => {
    const index = part.indexOf(':');
    if (index === -1) return undefined;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    return key ? [key, value] : undefined;
  }).filter(Boolean));
}

function parsePx(value) {
  const match = String(value || '').match(/^(-?\d+(?:\.\d+)?)px$/);
  return match ? Number(match[1]) : undefined;
}

function extractCanvas(documentNode) {
  const poster = findElement(documentNode, (node) => {
    const attrs = attrsToObject(node);
    return /\bposter\b/.test(attrs.class || '');
  });
  if (!poster) return { error: 'missing .poster element' };
  const style = parseInlineStyle(attrsToObject(poster).style);
  const width = parsePx(style.width);
  const height = parsePx(style.height);
  if (!width || !height) return { error: '.poster must have inline pixel width and height' };
  return { width, height };
}

function readLinkedCss(htmlPath, documentNode) {
  const links = [];
  walk(documentNode, (node) => {
    if (node.nodeName !== 'link') return;
    const attrs = attrsToObject(node);
    if (attrs.rel === 'stylesheet' && attrs.href) links.push(path.resolve(path.dirname(htmlPath), attrs.href));
  });
  return links.filter((file) => fs.existsSync(file)).map((file) => ({ file, css: fs.readFileSync(file, 'utf8') }));
}

function collectUnsupportedCss(cssSources) {
  const unsupported = [];
  for (const source of cssSources) {
    const ast = csstree.parse(source.css, { positions: false, parseValue: true });
    csstree.walk(ast, {
      visit: 'Rule',
      enter(rule) {
        const selector = csstree.generate(rule.prelude);
        if (/::before|::after/.test(selector) && /content\s*:\s*["'][^"']+["']/.test(csstree.generate(rule.block))) {
          unsupported.push({ file: source.file, selector, property: 'pseudo-content', value: 'visual pseudo-element content' });
        }
      },
    });
    csstree.walk(ast, {
      visit: 'Declaration',
      enter(declaration, item, list) {
        const property = declaration.property;
        const value = csstree.generate(declaration.value);
        if (UNSUPPORTED_PROPERTIES.has(property)) unsupported.push({ file: source.file, selector: '', property, value });
        if (property === 'display' && /^(grid|flex|inline-flex)$/.test(value)) {
          unsupported.push({ file: source.file, selector: '', property, value });
        }
      },
    });
  }
  return unsupported;
}

function inspectRenderProfile(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const documentNode = parse5.parse(html);
  const canvas = extractCanvas(documentNode);
  const cssSources = readLinkedCss(htmlPath, documentNode);
  const unsupportedCss = collectUnsupportedCss(cssSources);
  const errors = [];
  if (canvas.error) errors.push(canvas.error);
  if (unsupportedCss.length) errors.push('unsupported CSS found');
  return {
    html_path: htmlPath,
    status: errors.length ? 'fail' : 'pass',
    canvas: canvas.error ? undefined : canvas,
    css_files: cssSources.map((source) => source.file),
    unsupported_css: unsupportedCss,
    errors,
  };
}

module.exports = {
  attrsToObject,
  inspectRenderProfile,
  parseInlineStyle,
  parsePx,
  walk,
};
```

- [ ] **Step 4: 实现 `scripts/render-fast.js` 的 profile-only 模式**

Replace the initial entry script with:

```js
const path = require('path');
const { createProjectWorkspace, parseArgs, writeJson } = require('./utils/workflow-core');
const { listHtmlEntries } = require('./utils/html-entries');
const { inspectRenderProfile } = require('./utils/render-profile');

function main() {
  const args = parseArgs();
  const projectPaths = createProjectWorkspace(args.project, { subprojectId: args.subproject });
  const entries = listHtmlEntries(projectPaths, { group: args.group });
  const profileEntries = entries.map((entry) => ({
    ...entry,
    ...inspectRenderProfile(entry.html),
  }));
  const report = {
    generated_at: new Date().toISOString(),
    project_id: projectPaths.project_id,
    subproject_id: projectPaths.subproject_id,
    mode: args['profile-only'] ? 'profile-only' : 'export-fast',
    status: profileEntries.every((entry) => entry.status === 'pass') ? 'pass' : 'partial',
    entries: profileEntries,
  };
  writeJson(path.join(projectPaths.reports, 'render-profile-report.json'), report);
  console.log(`Render profile report written: ${path.join(projectPaths.reports, 'render-profile-report.json')}`);
  if (!args['profile-only']) {
    console.error('PNG export is implemented in a later task. Run with --profile-only for now.');
    process.exit(1);
  }
}

main();
```

- [ ] **Step 5: 运行测试确认通过**

Run:

```bash
npm test
```

Expected: PASS and `reports/render-profile-report.json` includes pass/fail entries.

- [ ] **Step 6: Commit**

```bash
git add scripts/utils/render-profile.js scripts/render-fast.js scripts/test.js
git commit -m "feat: add direct render profile checks"
```

---

### Task 4: HTML 子集编译为 Poster IR

**Files:**
- Create: `scripts/utils/poster-ir.js`
- Modify: `scripts/render-fast.js`
- Modify: `scripts/test.js`

- [ ] **Step 1: 写失败测试，要求 Europe map 生成 IR**

在 `scripts/test.js` 的 profile 测试后追加：

```js
const europeEntry = profileReport.entries.find((entry) => entry.html_group === 'europe-esim-map' && entry.status === 'pass');
assert(europeEntry?.ir_path, 'passing render profile entry should include ir_path');
assert(fs.existsSync(europeEntry.ir_path), 'render profile should write render IR for passing entry');
const europeIr = JSON.parse(fs.readFileSync(europeEntry.ir_path, 'utf8'));
assert(europeIr.canvas.width === 1000 && europeIr.canvas.height === 1263, 'europe IR should preserve canvas size');
assert(europeIr.layers.some((layer) => layer.type === 'svg'), 'europe IR should include inline svg layers');
assert(europeIr.layers.some((layer) => layer.type === 'text' && layer.text.includes('歐洲')), 'europe IR should include title text layer');
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test
```

Expected: FAIL because `ir_path` is missing.

- [ ] **Step 3: 实现 `scripts/utils/poster-ir.js`**

Create `scripts/utils/poster-ir.js`:

```js
const fs = require('fs');
const path = require('path');
const parse5 = require('parse5');
const { attrsToObject, parseInlineStyle, parsePx, walk } = require('./render-profile');

function textContent(node) {
  if (node.nodeName === '#text') return node.value || '';
  return (node.childNodes || []).map(textContent).join('');
}

function serializeNode(node) {
  return parse5.serialize({ childNodes: [node] });
}

function classList(node) {
  return String(attrsToObject(node).class || '').split(/\s+/).filter(Boolean);
}

function extractInlinePosition(node) {
  const style = parseInlineStyle(attrsToObject(node).style);
  return {
    x: parsePx(style.left),
    y: parsePx(style.top),
    width: parsePx(style.width),
    height: parsePx(style.height),
  };
}

function readCanvas(documentNode) {
  let poster;
  walk(documentNode, (node) => {
    if (!poster && /\bposter\b/.test(attrsToObject(node).class || '')) poster = node;
  });
  const style = parseInlineStyle(attrsToObject(poster).style);
  return { width: parsePx(style.width), height: parsePx(style.height) };
}

function compileEuropeLikeIr(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const documentNode = parse5.parse(html);
  const canvas = readCanvas(documentNode);
  const layers = [];
  walk(documentNode, (node) => {
    if (!node.tagName) return;
    const attrs = attrsToObject(node);
    const classes = classList(node);
    if (node.tagName === 'svg') {
      layers.push({
        id: attrs.class || `svg-${layers.length + 1}`,
        type: 'svg',
        className: attrs.class || '',
        svg: serializeNode(node),
      });
      return;
    }
    if (node.tagName === 'span' && classes.includes('map-label')) {
      const position = extractInlinePosition(node);
      layers.push({
        id: attrs['data-country-code'] || attrs.class || `text-${layers.length + 1}`,
        type: 'text',
        text: textContent(node).trim(),
        className: attrs.class || '',
        x: position.x || 0,
        y: position.y || 0,
        fill: '#ffffff',
        fontSize: classes.includes('label-lg') ? 28 : classes.includes('label-md') ? 21 : classes.includes('label-sm') ? 15 : 11,
        fontWeight: 700,
        textAnchor: 'middle',
      });
      return;
    }
    if (classes.includes('title-pill')) {
      layers.push({
        id: 'title-pill',
        type: 'text-box',
        text: textContent(node).trim(),
        x: 560,
        y: 1130,
        width: 370,
        height: 72,
        fill: '#415BA8',
        stroke: '#ffffff',
        strokeWidth: 6,
        radius: 36,
        textFill: '#ffffff',
        fontSize: 34,
        fontWeight: 800,
      });
    }
  });
  return {
    generated_at: new Date().toISOString(),
    source_html: htmlPath,
    renderer: 'direct-html-svg-v1',
    canvas,
    layers,
  };
}

module.exports = {
  compileEuropeLikeIr,
};
```

This first implementation is intentionally narrow: it makes `europe_esim_map` exportable without browser screenshots and gives unsupported templates a report instead of fake PNGs.

- [ ] **Step 4: 写 IR 文件**

Modify `scripts/render-fast.js`:

```js
const { compileEuropeLikeIr } = require('./utils/poster-ir');
```

Inside `profileEntries` mapping, after profile inspection:

```js
const profile = inspectRenderProfile(entry.html);
if (profile.status === 'pass') {
  const ir = compileEuropeLikeIr(entry.html);
  const irDir = path.join(projectPaths.reports, 'render-ir');
  const irPath = path.join(irDir, `${entry.html_group}.${entry.variant}.json`);
  writeJson(irPath, ir);
  return { ...entry, ...profile, ir_path: irPath };
}
return { ...entry, ...profile };
```

- [ ] **Step 5: 运行测试确认通过**

Run:

```bash
npm test
```

Expected: PASS and Europe entries write `reports/render-ir/europe-esim-map.*.json`.

- [ ] **Step 6: Commit**

```bash
git add scripts/utils/poster-ir.js scripts/render-fast.js scripts/test.js
git commit -m "feat: compile supported html previews to poster ir"
```

---

### Task 5: Poster IR 编译 SVG

**Files:**
- Create: `scripts/utils/svg-compiler.js`
- Modify: `scripts/render-fast.js`
- Modify: `scripts/test.js`

- [ ] **Step 1: 写失败测试，要求 SVG 输出**

在 Europe IR 测试后追加：

```js
assert(europeEntry.svg_path, 'passing render profile entry should include svg_path');
assert(fs.existsSync(europeEntry.svg_path), 'render-fast should write SVG for passing entry');
const europeSvg = fs.readFileSync(europeEntry.svg_path, 'utf8');
assert(europeSvg.includes('<svg'), 'compiled SVG should contain svg root');
assert(europeSvg.includes('viewBox="0 0 1000 1263"'), 'compiled SVG should preserve canvas viewBox');
assert(europeSvg.includes('歐洲'), 'compiled SVG should contain editable text content as SVG text');
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test
```

Expected: FAIL because `svg_path` is missing.

- [ ] **Step 3: 实现 `scripts/utils/svg-compiler.js`**

Create `scripts/utils/svg-compiler.js`:

```js
function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function layerToSvg(layer) {
  if (layer.type === 'svg') {
    return `<g data-layer-id="${escapeXml(layer.id)}">${layer.svg}</g>`;
  }
  if (layer.type === 'text') {
    const transform = /label-portugal/.test(layer.className) ? ` transform="rotate(-65 ${layer.x} ${layer.y})"` : '';
    return `<text data-layer-id="${escapeXml(layer.id)}" x="${layer.x}" y="${layer.y}" fill="${escapeXml(layer.fill)}" font-family="Noto Sans TC, Arial, sans-serif" font-size="${layer.fontSize}" font-weight="${layer.fontWeight}" text-anchor="${layer.textAnchor || 'start'}" dominant-baseline="middle"${transform}>${escapeXml(layer.text)}</text>`;
  }
  if (layer.type === 'text-box') {
    const rx = layer.radius || 0;
    const centerX = layer.x + layer.width / 2;
    const centerY = layer.y + layer.height / 2;
    return [
      `<rect data-layer-id="${escapeXml(layer.id)}-box" x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" rx="${rx}" fill="${escapeXml(layer.fill)}" stroke="${escapeXml(layer.stroke)}" stroke-width="${layer.strokeWidth || 0}"/>`,
      `<text data-layer-id="${escapeXml(layer.id)}-text" x="${centerX}" y="${centerY}" fill="${escapeXml(layer.textFill)}" font-family="Noto Sans TC, Arial, sans-serif" font-size="${layer.fontSize}" font-weight="${layer.fontWeight}" text-anchor="middle" dominant-baseline="middle">${escapeXml(layer.text)}</text>`,
    ].join('\n');
  }
  return '';
}

function compileSvg(ir) {
  const width = ir.canvas.width;
  const height = ir.canvas.height;
  const body = ir.layers.map(layerToSvg).filter(Boolean).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="100%" height="100%" fill="#FDF2E3"/>
${body}
</svg>
`;
}

module.exports = {
  compileSvg,
  escapeXml,
};
```

- [ ] **Step 4: 在 `render-fast.js` 写 SVG**

Import:

```js
const { compileSvg } = require('./utils/svg-compiler');
```

After writing IR:

```js
const svgDir = path.join(projectPaths.working, 'render-svg');
const svgPath = path.join(svgDir, `${entry.html_group}-${entry.variant}.svg`);
const svg = compileSvg(ir);
fs.mkdirSync(svgDir, { recursive: true });
fs.writeFileSync(svgPath, svg);
return { ...entry, ...profile, ir_path: irPath, svg_path: svgPath };
```

Add top import:

```js
const fs = require('fs');
```

- [ ] **Step 5: 运行测试确认通过**

Run:

```bash
npm test
```

Expected: PASS and SVG files exist under `working/render-svg/`.

- [ ] **Step 6: Commit**

```bash
git add scripts/utils/svg-compiler.js scripts/render-fast.js scripts/test.js
git commit -m "feat: compile poster ir to svg"
```

---

### Task 6: SVG 直接栅格化为 PNG

**Files:**
- Modify: `scripts/render-fast.js`
- Modify: `scripts/test.js`

- [ ] **Step 1: 写失败测试，要求 PNG 输出和尺寸报告**

在 `scripts/test.js` 的 profile-only 测试后追加非 profile export：

```js
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
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test
```

Expected: FAIL because `render-fast.js` exits before PNG export.

- [ ] **Step 3: 实现 PNG 栅格化**

Modify `scripts/render-fast.js` imports:

```js
const { Resvg } = require('@resvg/resvg-js');
```

Add helper:

```js
function renderSvgToPng(svg, pngPath, scale) {
  const renderer = new Resvg(svg, {
    fitTo: {
      mode: 'zoom',
      value: scale,
    },
    font: {
      loadSystemFonts: true,
    },
  });
  const pngData = renderer.render();
  fs.mkdirSync(path.dirname(pngPath), { recursive: true });
  fs.writeFileSync(pngPath, pngData.asPng());
}
```

Inside the mapping for pass entries:

```js
const pngPath = path.join(projectPaths.exports, `${entry.html_group}-${entry.variant}.png`);
if (!args['profile-only']) {
  renderSvgToPng(svg, pngPath, Number(args.scale || 1));
}
return {
  ...entry,
  ...profile,
  ir_path: irPath,
  svg_path: svgPath,
  png: args['profile-only'] ? undefined : pngPath,
  scale: Number(args.scale || 1),
};
```

After writing `render-profile-report.json`, add:

```js
if (!args['profile-only']) {
  const exported = profileEntries.filter((entry) => entry.status === 'pass' && entry.png);
  const failed = profileEntries.filter((entry) => entry.status !== 'pass');
  const pngReport = {
    generated_at: new Date().toISOString(),
    project_id: projectPaths.project_id,
    subproject_id: projectPaths.subproject_id,
    renderer: 'direct-html-svg-resvg',
    status: failed.length ? 'partial' : 'pass',
    exports: exported.map((entry) => ({
      html_group: entry.html_group,
      variant: entry.variant,
      html: entry.html,
      svg: entry.svg_path,
      png: entry.png,
      scale: entry.scale,
      canvas: entry.canvas,
      output_pixels: {
        width: entry.canvas.width * entry.scale,
        height: entry.canvas.height * entry.scale,
      },
    })),
    failed: failed.map((entry) => ({
      html_group: entry.html_group,
      variant: entry.variant,
      html: entry.html,
      unsupported_css: entry.unsupported_css,
      errors: entry.errors,
    })),
  };
  writeJson(path.join(projectPaths.reports, 'png-export-report.json'), pngReport);
  if (exported.length) console.log(`Direct PNG export completed for ${exported.length} HTML preview(s).`);
  if (!exported.length) {
    console.error('No PNG files exported because no HTML entry passed the direct render profile.');
    process.exit(1);
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```bash
npm test
```

Expected: PASS and PNGs exist under `exports/`.

- [ ] **Step 5: 手动检查 PNG 文件类型**

Run:

```bash
file "/Users/tashima_meru/Library/CloudStorage/OneDrive-个人/文档/text2html-image-project/test-default-project/exports/europe-esim-map-canonical.png"
```

Expected includes `PNG image data, 2000 x 2526` when source canvas is `1000 x 1263` and `--scale 2`.

- [ ] **Step 6: Commit**

```bash
git add scripts/render-fast.js scripts/test.js
git commit -m "feat: export supported html previews without browser screenshots"
```

---

### Task 7: 文档与 skill 接入

**Files:**
- Modify: `README.md`
- Modify: `skills/text2html-image/SKILL.md`
- Modify: `skills/text2html-image/references/execution-flow.md`
- Modify: `scripts/test.js`

- [ ] **Step 1: 写失败测试，要求文档说明 direct export**

在 `scripts/test.js` 的 README / skill assertions 中追加：

```js
assert(readmeBody.includes('npm run export-fast'), 'README must document direct HTML-to-PNG export');
assert(readmeBody.includes('不通过浏览器截图'), 'README must state export-fast does not use browser screenshots');

const skillBody = read('skills/text2html-image/SKILL.md');
assert(skillBody.includes('npm run export-fast'), 'skill must document export-fast command');
assert(skillBody.includes('direct HTML-to-SVG-to-PNG'), 'skill must describe direct HTML-to-SVG-to-PNG export');
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test
```

Expected: FAIL because README/skill do not document `export-fast`.

- [ ] **Step 3: 更新 README**

Add a section:

```markdown
## 直接 HTML 出图

`npm run export-fast -- --project <project-id> [--group <html-group>] [--scale 2]`

该命令不通过浏览器截图。它读取生成后的 `html/<html-group>/index*.html`，按受限 poster-render profile 编译为 SVG，再栅格化为 PNG。输出：

- `working/render-svg/<html-group>-<variant>.svg`
- `exports/<html-group>-<variant>.png`
- `reports/render-profile-report.json`
- `reports/png-export-report.json`

如果 HTML/CSS 使用了当前 profile 不支持的能力，例如 `grid`、`filter`、`mix-blend-mode`、`clip-path`、视觉伪元素，命令会在报告中标记失败，不会生成假 PNG。
```

- [ ] **Step 4: 更新 `SKILL.md` 命令与导出守卫**

In `Export Mode Guard`, add:

```markdown
Use `npm run export-fast -- --project <project-id> [--group <html-group>] [--scale 2]` when a direct HTML-to-SVG-to-PNG export is required and the HTML passes the render profile. This is not a browser screenshot path.
```

In `Commands`, add:

```bash
npm run render:profile -- --project <project-id> [--group <html-group>]
npm run export-fast -- --project <project-id> [--group <html-group>] [--scale 2]
```

- [ ] **Step 5: 更新 `execution-flow.md`**

Replace target vocabulary with implemented commands:

```markdown
- `batch-export`: report only.
- `render:profile`: direct renderer compatibility report.
- `export-fast`: direct HTML-to-SVG-to-PNG export for supported profile.
```

- [ ] **Step 6: 运行测试确认通过**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add README.md skills/text2html-image/SKILL.md skills/text2html-image/references/execution-flow.md scripts/test.js
git commit -m "docs: document direct html png export"
```

---

### Task 8: 最终验收与回归

**Files:**
- No source file changes expected.

- [ ] **Step 1: 清理并重建测试项目**

Run:

```bash
rm -rf "/Users/tashima_meru/Library/CloudStorage/OneDrive-个人/文档/text2html-image-project/test-default-project"
npm run build -- --project test-default-project
```

Expected:

```text
Built 11 HTML preview(s) for project test-default-project.
Local HTML path: ...
Open or refresh in Codex Browser: file://...
```

- [ ] **Step 2: 运行 profile 检查**

Run:

```bash
npm run render:profile -- --project test-default-project
```

Expected:

```text
Render profile report written: .../reports/render-profile-report.json
```

Then inspect:

```bash
node -e 'const fs=require("fs"); const p="/Users/tashima_meru/Library/CloudStorage/OneDrive-个人/文档/text2html-image-project/test-default-project/reports/render-profile-report.json"; const r=JSON.parse(fs.readFileSync(p,"utf8")); console.log(r.entries.map(e=>`${e.html_group}:${e.variant}:${e.status}`).join("\n"));'
```

Expected includes at least:

```text
europe-esim-map:canonical:pass
africa-esim-map:zh-tw:fail
```

- [ ] **Step 3: 运行直接 PNG 出图**

Run:

```bash
npm run export-fast -- --project test-default-project --group europe-esim-map --scale 2
```

Expected:

```text
Direct PNG export completed for 2 HTML preview(s).
```

The exact count may be `1` or more depending on how many Europe variants exist in `copy_master`; all passing variants must be exported.

- [ ] **Step 4: 检查 PNG 尺寸**

Run:

```bash
find "/Users/tashima_meru/Library/CloudStorage/OneDrive-个人/文档/text2html-image-project/test-default-project/exports" -name 'europe-esim-map-*.png' -print0 | xargs -0 file
```

Expected every Europe PNG reports dimensions equal to `canvas * scale`, for current fixture `2000 x 2526`.

- [ ] **Step 5: 运行全量测试**

Run:

```bash
npm test
```

Expected:

```text
Tests passed. Generated 11 preview(s).
```

- [ ] **Step 6: Commit**

```bash
git status --short
git add package.json package-lock.json scripts README.md skills/text2html-image
git commit -m "feat: add direct html to png export pipeline"
```

---

## 自检

Spec coverage:

- 直接通过 HTML 生成图片：Task 3-6 实现 HTML -> IR -> SVG -> PNG。
- 不通过浏览器截图：Task 6 使用 `@resvg/resvg-js`，文档在 Task 7 明确“不通过浏览器截图”。
- 减少返工：Task 2 统一 entry 枚举，Task 3 profile fail-fast，Task 6 写 `png-export-report.json`。
- 分辨率损失：Task 6 使用 SVG 栅格化倍率 `--scale`，报告记录 `output_pixels`。
- 当前复杂模板边界：Task 3 对 Africa/Banner 等复杂 CSS fail-fast。

Red-flag scan:

- 本计划没有残留占位式实现说明。
- 每个代码变更步骤都给了具体文件、代码或命令。

Type/signature consistency:

- `listHtmlEntries(projectPaths, options)` 在 Task 2 定义，Task 3/6 复用。
- `inspectRenderProfile(htmlPath)` 在 Task 3 定义，Task 4/6 复用。
- `compileEuropeLikeIr(htmlPath)` 在 Task 4 定义，Task 5/6 复用。
- `compileSvg(ir)` 在 Task 5 定义，Task 6 复用。
