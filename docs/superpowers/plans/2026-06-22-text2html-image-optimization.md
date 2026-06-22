# text2html-image Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把过去一周 `text2html-image` 使用中反复踩过的坑沉淀成可执行的工作流优化：少靠记忆和口头约定，多靠脚本、报告、测试和验收清单拦截。

**Architecture:** 保持现有 Node.js CLI 工作流，不引入重型应用层。新增一组聚焦的验证/导出脚本和共享工具：工作区契约验证、DOM 可编辑性验证、多语言溢出验证、真实 PNG 导出、变更审计报告；再把这些脚本接入 `npm test`、README 和 skill 文档。

**Tech Stack:** Node.js 18+, CommonJS, filesystem/path utilities, optional `playwright-core` with local Chrome/Edge for visual checks, existing `scripts/utils/workflow-core.js`, existing HTML/CSS templates.

---

## 背景与踩坑归纳

这份计划基于本地 memory/session 里与 `text2html-image` 相关的 2026-06-16 到 2026-06-18 记录，以及当前仓库代码状态。

| 坑点 | 已发生的表现 | 计划中的拦截方式 |
| --- | --- | --- |
| 工作区路径漂移 | 早期在 `<Documents>/text2html-image/projects`、后续在 `<Documents>/text2html-image-project/<project-id>`，还出现过 `project-manifest.json` 旧契约残留 | 新增工作区审计脚本，强制检查 `workflow.config.json`、实际输出目录、报告路径和禁止文件 |
| 文档更新但运行时没跟上 | README/skill 说法和 `build/project-init/batch-export` 行为曾不同步 | 把 README/skill 关键词检查升级为行为测试和 smoke commands |
| 只改一个语言文件 | 非洲 eSIM map 的 disclaimer 先定位到单语言，后来才扩到所有 `index*.html` | 新增 html group 变体一致性检查，要求同组 canonical/localized 全量同步 |
| 可编辑文本被视觉层破坏 | Europe map 出现过 `.map-labels { pointer-events: none; }` 方向冲突，用户明确要求 metadata-backed selectable text | 新增 DOM contract 检查：`data-i18n-key`、业务 key、禁止 label 容器屏蔽选择 |
| 导出不等于生成报告 | `batch-export` 可能只写 `export-report.json`，不一定产生 PNG | 拆清 report-only 与 real-export，新增真实 PNG 导出脚本和导出后回读验证 |
| Chrome headless 不稳定 | 直接 Chrome CLI 截图可能写出文件但进程挂住 | 用 Playwright 控制本机 Chrome/Edge，设置超时和关闭流程 |
| 多语言表格局部溢出 | 页面无滚动条不代表 cell 内文字没溢出；`scrollHeight / lineHeight` 对 flex cell 会误判 | 新增 browser-based cell overflow 检查，使用 bounding box 和 `Range.getClientRects()` |
| 地图/表格视觉迭代靠肉眼 | Figma 数值、画布尺寸、map layer、row height、字体规则容易丢 | 报告里固化 canvas、image/script/text/i18n/business key count、导出尺寸和语言例外 |
| skill 注册最后一步容易漏 | 源码改名完成但 `~/.codex/skills` 仍暴露旧 skill | 新增安装态 smoke check，明确只在测试通过后同步 installed skill |

## 方案比较

### 方案 A：只扩写 skill 文档

成本最低，但不能阻止同类错误复发。适合补充说明，不适合作为主方案。

### 方案 B：新增独立验证/导出工具并接入测试（推荐）

把高频坑点转为脚本输出和 CI-like 本地验收。既保留当前轻量 Node CLI，又能让每次 poster 工作结束前有稳定检查面。

### 方案 C：重构成完整任务编排器

可以统一阶段、状态和报告，但会扩大范围，容易把当前高频手工迭代流程做重。当前不建议先做。

推荐执行方案 B，并把方案 A 中必要的规则同步到 README/skill。

## 文件结构

### 新增文件

- `scripts/utils/html-contract.js`
  - 负责扫描 `html/<html-group>/index*.html`、解析静态 DOM 约定、检查脚本标签、图片引用、i18n/business metadata、map label 可选择性风险。
- `scripts/utils/browser-checks.js`
  - 负责 Playwright 启动本机 Chrome/Edge、打开 `file://` HTML、执行页面级和 cell 级布局检查。
- `scripts/verify-output.js`
  - 面向项目的总验收命令，写入 `reports/verify-output-report.json`。
- `scripts/export-png.js`
  - 面向项目的真实 PNG 导出命令，写入 `exports/*.png` 和 `reports/png-export-report.json`。
- `docs/text2html-image-optimization-checklist.md`
  - 用户级工作流清单：开工前、HTML 变更后、导出前、交付前。

### 修改文件

- `package.json`
  - 增加 `verify-output`、`export-png`、`check-layout` 脚本；如采用 Playwright 控制本机浏览器，增加 `playwright-core` devDependency。
- `scripts/test.js`
  - 增加新脚本存在性、报告路径、真实 PNG 导出 dry-run、DOM contract fixture 的断言。
- `scripts/batch-export.js`
  - 保持 report-only 语义，但输出文案明确“只准备报告，不写 PNG”；指向 `npm run export-png`。
- `scripts/quality-check.js`
  - 继续负责基础 workflow 验证；不要塞入 browser-only 检查。
- `scripts/utils/workflow-core.js`
  - 只补必要共享函数，如 `listHtmlEntries(projectPaths)`；避免把 browser 依赖放入核心工具。
- `README.md`
  - 增加“标准验收命令顺序”和“report-only vs real export”说明。
- `skills/text2html-image/SKILL.md`
  - 把新命令加入 Completion Contract 和 Commands；明确直接编辑 generated HTML 时先验同组语言文件，再导出。

---

## Task 1: 建立 HTML 输出枚举与静态契约工具

**Files:**
- Create: `scripts/utils/html-contract.js`
- Modify: `scripts/utils/workflow-core.js`
- Test: `scripts/test.js`

- [ ] **Step 1: 写失败测试，覆盖 HTML group 枚举与 metadata 检查**

在 `scripts/test.js` 增加断言：

```js
const { listHtmlEntries, inspectHtmlContract } = require('./utils/html-contract');

const htmlEntries = listHtmlEntries(projectPaths);
assert(htmlEntries.length >= 3, 'html contract should enumerate canonical and localized previews');
assert(htmlEntries.some((entry) => entry.variant === 'canonical'), 'html contract should include canonical index.html');
assert(htmlEntries.some((entry) => entry.variant === 'zh-cn'), 'html contract should include zh-cn variant');

for (const entry of htmlEntries) {
  const contract = inspectHtmlContract(entry.html);
  assert(contract.script_count === 0, `generated HTML must not contain scripts: ${entry.html}`);
  assert(contract.has_viewport_meta, `generated HTML should include viewport meta: ${entry.html}`);
  assert(contract.missing_local_assets.length === 0, `missing local assets in ${entry.html}: ${contract.missing_local_assets.join(', ')}`);
}
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test
```

Expected: FAIL with `Cannot find module './utils/html-contract'`.

- [ ] **Step 3: 实现 `scripts/utils/html-contract.js`**

```js
const fs = require('fs');
const path = require('path');
const { toFileUrl } = require('./workflow-core');

function listHtmlEntries(projectPaths) {
  const htmlRoot = projectPaths.html;
  if (!fs.existsSync(htmlRoot)) return [];
  return fs.readdirSync(htmlRoot)
    .flatMap((groupName) => {
      const groupDir = path.join(htmlRoot, groupName);
      if (!fs.statSync(groupDir).isDirectory()) return [];
      return fs.readdirSync(groupDir)
        .filter((fileName) => /^index(?:\.[a-z0-9-]+)?\.html$/.test(fileName))
        .sort()
        .map((fileName) => {
          const html = path.join(groupDir, fileName);
          const variant = fileName === 'index.html' ? 'canonical' : fileName.replace(/^index\.|\.[^.]+$/g, '');
          return { html_group: groupName, variant, html, file_url: toFileUrl(html) };
        });
    })
    .sort((a, b) => `${a.html_group}/${a.variant}`.localeCompare(`${b.html_group}/${b.variant}`));
}

function inspectHtmlContract(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const htmlDir = path.dirname(htmlPath);
  const imageSources = [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1]);
  const localImageSources = imageSources.filter((src) => !src.startsWith('data:') && !/^https?:\/\//.test(src));
  const missingLocalAssets = localImageSources
    .map((src) => ({ src, absolute: path.resolve(htmlDir, src) }))
    .filter((item) => !fs.existsSync(item.absolute))
    .map((item) => item.src);

  return {
    html_path: htmlPath,
    script_count: (html.match(/<script\b/gi) || []).length,
    image_count: imageSources.length,
    i18n_count: (html.match(/data-i18n-key=/g) || []).length,
    business_key_count: (html.match(/data-(country|region|sku)-/g) || []).length,
    map_label_count: (html.match(/class="[^"]*\bmap-label\b/g) || []).length,
    has_viewport_meta: /<meta\s+name="viewport"\s+content="width=device-width, initial-scale=1"/.test(html),
    missing_local_assets: missingLocalAssets,
  };
}

module.exports = {
  inspectHtmlContract,
  listHtmlEntries,
};
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```bash
npm test
```

Expected: PASS with `Tests passed. Generated ... preview(s).`

- [ ] **Step 5: Commit**

```bash
git add scripts/utils/html-contract.js scripts/test.js
git commit -m "test: add html output contract checks"
```

---

## Task 2: 新增项目级 `verify-output` 总验收报告

**Files:**
- Create: `scripts/verify-output.js`
- Modify: `package.json`
- Modify: `scripts/test.js`

- [ ] **Step 1: 写失败测试，要求 `verify-output` 写报告**

在 `scripts/test.js` 增加：

```js
const verifyOutput = require('child_process').execFileSync(process.execPath, [
  path.join(ROOT, 'scripts', 'verify-output.js'),
  '--project', projectId,
], {
  cwd: ROOT,
  encoding: 'utf8',
});
assert(verifyOutput.includes('Verify output pass'), 'verify-output should pass for generated fixtures');
const verifyReportPath = path.join(projectPaths.reports, 'verify-output-report.json');
assert(fs.existsSync(verifyReportPath), 'verify-output should write reports/verify-output-report.json');
const verifyReport = JSON.parse(fs.readFileSync(verifyReportPath, 'utf8'));
assert(verifyReport.status === 'pass', 'verify-output report should pass');
assert(verifyReport.html_contracts.length >= 3, 'verify-output should include html contracts');
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test
```

Expected: FAIL with missing `scripts/verify-output.js`.

- [ ] **Step 3: 实现 `scripts/verify-output.js`**

```js
const path = require('path');
const { createProjectWorkspace, parseArgs, writeJson } = require('./utils/workflow-core');
const { inspectHtmlContract, listHtmlEntries } = require('./utils/html-contract');

const args = parseArgs();
const projectPaths = createProjectWorkspace(args.project, { subprojectId: args.subproject });
const entries = listHtmlEntries(projectPaths);
const htmlContracts = entries.map((entry) => ({ ...entry, ...inspectHtmlContract(entry.html) }));

const errors = [];
if (!entries.length) errors.push(`no HTML previews found under ${projectPaths.html}`);
for (const contract of htmlContracts) {
  if (contract.script_count !== 0) errors.push(`script tags found: ${contract.html}`);
  if (!contract.has_viewport_meta) errors.push(`missing viewport meta: ${contract.html}`);
  for (const asset of contract.missing_local_assets) errors.push(`missing local asset in ${contract.html}: ${asset}`);
}

const groupMap = new Map();
for (const entry of entries) {
  if (!groupMap.has(entry.html_group)) groupMap.set(entry.html_group, []);
  groupMap.get(entry.html_group).push(entry.variant);
}
for (const [groupName, variants] of groupMap.entries()) {
  if (!variants.includes('canonical')) errors.push(`html group missing canonical index.html: ${groupName}`);
}

const report = {
  generated_at: new Date().toISOString(),
  project_id: projectPaths.project_id,
  subproject_id: projectPaths.subproject_id,
  status: errors.length ? 'fail' : 'pass',
  html_total: entries.length,
  html_groups: Object.fromEntries(groupMap.entries()),
  html_contracts: htmlContracts,
  errors,
};

writeJson(path.join(projectPaths.reports, 'verify-output-report.json'), report);
console.log(`Verify output ${report.status} for project ${projectPaths.project_id}.`);
console.log(`HTML previews: ${entries.length}`);
if (errors.length) {
  for (const error of errors) console.error(`ERROR ${error}`);
  process.exit(1);
}
```

- [ ] **Step 4: 修改 `package.json` 脚本**

```json
{
  "scripts": {
    "verify-output": "node scripts/verify-output.js"
  }
}
```

保留现有 scripts，只新增这一项。

- [ ] **Step 5: 运行测试确认通过**

Run:

```bash
npm test
```

Expected: PASS with `Verify output pass`.

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/verify-output.js scripts/test.js
git commit -m "feat: add project output verification report"
```

---

## Task 3: 拆清 report-only batch export 与真实 PNG export

**Files:**
- Create: `scripts/export-png.js`
- Modify: `package.json`
- Modify: `scripts/batch-export.js`
- Modify: `scripts/test.js`

- [ ] **Step 1: 写失败测试，要求 batch-export 明确 report-only**

在 `scripts/test.js` 中把 batch-export 断言扩展为：

```js
assert(batchOutput.includes('report-only'), 'batch-export output should explicitly say report-only');
assert(batchOutput.includes('npm run export-png'), 'batch-export should point users to real PNG export command');
```

- [ ] **Step 2: 修改 `scripts/batch-export.js` 输出文案**

```js
console.log(`Prepared report-only export report for ${entries.length} HTML preview(s) in project ${projectPaths.project_id}.`);
console.log('Run npm run export-png -- --project <project-id> to create real PNG files.');
```

- [ ] **Step 3: 新增 `scripts/export-png.js` dry-run 模式**

先实现无浏览器依赖的 dry-run，保证测试稳定：

```js
const path = require('path');
const { createProjectWorkspace, parseArgs, writeJson } = require('./utils/workflow-core');
const { listHtmlEntries } = require('./utils/html-contract');

const args = parseArgs();
const projectPaths = createProjectWorkspace(args.project, { subprojectId: args.subproject });
const entries = listHtmlEntries(projectPaths).map((entry) => ({
  ...entry,
  png: path.join(projectPaths.exports, `${entry.html_group}-${entry.variant}.png`),
  status: args['dry-run'] ? 'planned' : 'pending-browser-export',
}));

const report = {
  generated_at: new Date().toISOString(),
  project_id: projectPaths.project_id,
  subproject_id: projectPaths.subproject_id,
  mode: args['dry-run'] ? 'dry-run' : 'browser-export',
  total: entries.length,
  exports: entries,
};

writeJson(path.join(projectPaths.reports, 'png-export-report.json'), report);
console.log(`PNG export ${report.mode} prepared for ${entries.length} HTML preview(s).`);
if (!args['dry-run']) {
  console.error('Browser export is not implemented in this task. Run with --dry-run until Task 4 is complete.');
  process.exit(1);
}
```

- [ ] **Step 4: 修改 `package.json` 脚本**

```json
{
  "scripts": {
    "export-png": "node scripts/export-png.js"
  }
}
```

- [ ] **Step 5: 写 dry-run 测试**

在 `scripts/test.js` 增加：

```js
const pngDryRunOutput = require('child_process').execFileSync(process.execPath, [
  path.join(ROOT, 'scripts', 'export-png.js'),
  '--project', projectId,
  '--dry-run',
], {
  cwd: ROOT,
  encoding: 'utf8',
});
assert(pngDryRunOutput.includes('PNG export dry-run prepared'), 'export-png dry-run should prepare report');
assert(fs.existsSync(path.join(projectPaths.reports, 'png-export-report.json')), 'export-png should write png-export-report.json');
```

- [ ] **Step 6: 运行测试确认通过**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json scripts/batch-export.js scripts/export-png.js scripts/test.js
git commit -m "feat: separate export report from png export"
```

---

## Task 4: 用 Playwright 控制本机浏览器完成真实 PNG 导出

**Files:**
- Create: `scripts/utils/browser-checks.js`
- Modify: `scripts/export-png.js`
- Modify: `package.json`
- Test: manual smoke command, not `npm test` by default

- [ ] **Step 1: 增加依赖**

Run:

```bash
npm install --save-dev playwright-core
```

Expected: `package.json` and lockfile update with `playwright-core`.

- [ ] **Step 2: 实现本机浏览器路径解析**

Create `scripts/utils/browser-checks.js`:

```js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright-core');

function candidateBrowserPaths() {
  if (process.platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ];
  }
  if (process.platform === 'win32') {
    return [
      path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft\\Edge\\Application\\msedge.exe'),
    ];
  }
  return ['/usr/bin/google-chrome', '/usr/bin/microsoft-edge', '/usr/bin/chromium'];
}

function resolveBrowserExecutable(explicitPath) {
  const candidates = explicitPath ? [explicitPath] : candidateBrowserPaths();
  return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

async function withBrowser(callback, options = {}) {
  const executablePath = resolveBrowserExecutable(options.browser);
  if (!executablePath) throw new Error(`No local Chrome/Edge executable found for ${os.platform()}`);
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    return await callback(browser, executablePath);
  } finally {
    await browser.close();
  }
}

module.exports = {
  resolveBrowserExecutable,
  withBrowser,
};
```

- [ ] **Step 3: 实现 `scripts/export-png.js` 真实导出**

将非 dry-run 分支改为：

```js
const { withBrowser } = require('./utils/browser-checks');

async function exportPngs(entries, projectPaths, args) {
  const width = Number(args.width || 1404);
  const height = Number(args.height || 1120);
  const scale = Number(args.scale || 2);
  return withBrowser(async (browser, executablePath) => {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
    const results = [];
    for (const entry of entries) {
      await page.goto(entry.file_url, { waitUntil: 'networkidle', timeout: 15000 });
      await page.screenshot({ path: entry.png, fullPage: false });
      results.push({ ...entry, browser: executablePath, viewport: { width, height, scale }, status: 'exported' });
    }
    return results;
  }, { browser: args.browser });
}
```

`main` 需要 `await exportPngs(...)` 后写 `reports/png-export-report.json`，并在没有 entries 或导出失败时 `process.exit(1)`。

- [ ] **Step 4: 手动 smoke 测试**

Run:

```bash
npm run build -- --project test-default-project
npm run export-png -- --project test-default-project --width 1536 --height 500 --scale 2
```

Expected:

```text
PNG export browser-export completed for ... HTML preview(s).
```

并且 `reports/png-export-report.json` 中每个 entry 的 `status` 为 `exported`，`exports/*.png` 文件存在。

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json scripts/export-png.js scripts/utils/browser-checks.js
git commit -m "feat: export html previews to png with local browser"
```

---

## Task 5: 增加多语言布局与 cell overflow 检查

**Files:**
- Create: `scripts/check-layout.js`
- Modify: `package.json`
- Modify: `scripts/utils/browser-checks.js`
- Modify: `skills/text2html-image/SKILL.md`

- [ ] **Step 1: 在 browser 工具中新增页面检查函数**

Add to `scripts/utils/browser-checks.js`:

```js
async function inspectPageLayout(page) {
  return page.evaluate(() => {
    const pageOverflow = {
      x: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      y: document.documentElement.scrollHeight > document.documentElement.clientHeight,
    };
    const cells = [...document.querySelectorAll('[data-check-overflow], .row, td, th')].map((node) => {
      const rect = node.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(node);
      const textRects = [...range.getClientRects()].map((item) => ({
        left: item.left,
        right: item.right,
        top: item.top,
        bottom: item.bottom,
        width: item.width,
        height: item.height,
      }));
      range.detach();
      const overflow = textRects.some((item) =>
        item.left < rect.left - 1 ||
        item.right > rect.right + 1 ||
        item.top < rect.top - 1 ||
        item.bottom > rect.bottom + 1
      );
      return {
        selector: node.getAttribute('data-i18n-key') || node.getAttribute('data-country-code') || node.className || node.tagName,
        text: node.textContent.trim().slice(0, 80),
        overflow,
      };
    });
    return { page_overflow: pageOverflow, overflowing_cells: cells.filter((cell) => cell.overflow) };
  });
}

module.exports.inspectPageLayout = inspectPageLayout;
```

- [ ] **Step 2: 新增 `scripts/check-layout.js`**

```js
const path = require('path');
const { createProjectWorkspace, parseArgs, writeJson } = require('./utils/workflow-core');
const { listHtmlEntries } = require('./utils/html-contract');
const { inspectPageLayout, withBrowser } = require('./utils/browser-checks');

async function main() {
  const args = parseArgs();
  const projectPaths = createProjectWorkspace(args.project, { subprojectId: args.subproject });
  const entries = listHtmlEntries(projectPaths);
  const results = await withBrowser(async (browser) => {
    const page = await browser.newPage({ viewport: { width: Number(args.width || 1404), height: Number(args.height || 1120) } });
    const output = [];
    for (const entry of entries) {
      await page.goto(entry.file_url, { waitUntil: 'networkidle', timeout: 15000 });
      output.push({ ...entry, layout: await inspectPageLayout(page) });
    }
    return output;
  }, { browser: args.browser });

  const errors = results.flatMap((result) =>
    result.layout.overflowing_cells.map((cell) => `${result.html}: ${cell.selector} overflow: ${cell.text}`)
  );
  const report = {
    generated_at: new Date().toISOString(),
    project_id: projectPaths.project_id,
    subproject_id: projectPaths.subproject_id,
    status: errors.length ? 'fail' : 'pass',
    results,
    errors,
  };
  writeJson(path.join(projectPaths.reports, 'layout-check-report.json'), report);
  console.log(`Layout check ${report.status} for ${entries.length} HTML preview(s).`);
  if (errors.length) {
    for (const error of errors) console.error(`ERROR ${error}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
```

- [ ] **Step 3: 修改 `package.json` 脚本**

```json
{
  "scripts": {
    "check-layout": "node scripts/check-layout.js"
  }
}
```

- [ ] **Step 4: 更新 skill 命令清单**

在 `skills/text2html-image/SKILL.md` 的 Commands 中加入：

```bash
npm run verify-output -- --project <project-id> [--subproject <subproject-id>]
npm run check-layout -- --project <project-id> [--subproject <subproject-id>] --width <canvas-w> --height <canvas-h>
npm run export-png -- --project <project-id> [--subproject <subproject-id>] --width <canvas-w> --height <canvas-h> --scale 2
```

- [ ] **Step 5: 手动 smoke 测试**

Run:

```bash
npm run check-layout -- --project test-default-project --width 1536 --height 500
```

Expected: `Layout check pass` or clear `ERROR <html>: <selector> overflow: <text>` lines.

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/check-layout.js scripts/utils/browser-checks.js skills/text2html-image/SKILL.md
git commit -m "feat: add browser layout overflow checks"
```

---

## Task 6: 文档化标准验收链和交付清单

**Files:**
- Create: `docs/text2html-image-optimization-checklist.md`
- Modify: `README.md`
- Modify: `skills/text2html-image/SKILL.md`

- [ ] **Step 1: 创建用户级清单**

Create `docs/text2html-image-optimization-checklist.md`:

````markdown
# text2html-image 优化验收清单

## 开工前

- 确认真实输入：参考图尺寸、目标平台、安全区、SKU/copy、语言列表、是否需要 selectable text。
- 确认项目 id：短英文 kebab-case，最多 20 个 ASCII 字符。
- 确认输出根：`<Documents>/text2html-image-project/<project-id>/`。

## HTML/CSS 修改后

```bash
npm run build -- --project <project-id> [--subproject <subproject-id>]
npm run quality-check -- --project <project-id> [--subproject <subproject-id>]
npm run verify-output -- --project <project-id> [--subproject <subproject-id>]
```

必须检查：

- `html/<html-group>/index.html` 与 `index.<lang>.html` 同组存在。
- 必要文本为 HTML text，不是图片、canvas 或 SVG path。
- map/country/SKU 文本带 `data-i18n-key` 和业务 key。
- 本地图片路径能从 symlink Documents 和 real OneDrive path 同时解析。

## 导出前

```bash
npm run check-layout -- --project <project-id> --width <canvas-w> --height <canvas-h>
npm run batch-export -- --project <project-id>
npm run export-png -- --project <project-id> --width <canvas-w> --height <canvas-h> --scale 2
```

必须检查：

- `batch-export` 只代表 report-only。
- `export-png` 后真实 PNG 文件存在。
- `reports/png-export-report.json` 中每个 entry 为 `exported`。

## 交付前

- 回读 `reports/verify-output-report.json`、`reports/layout-check-report.json`、`reports/png-export-report.json`。
- 抽查至少一个主语言和一个长文本语言的 PNG。
- 如果直接编辑 generated HTML，确认所有 `index*.html` 语言变体同步。
- 如果更新 skill 源码，测试通过后再同步 `~/.codex/skills/text2html-image`。
````

- [ ] **Step 2: 更新 README 标准命令顺序**

在 `README.md` 增加：

````markdown
## 标准验收命令

```bash
npm run build -- --project <project-id> [--subproject <subproject-id>]
npm run quality-check -- --project <project-id> [--subproject <subproject-id>]
npm run verify-output -- --project <project-id> [--subproject <subproject-id>]
npm run check-layout -- --project <project-id> [--subproject <subproject-id>] --width <canvas-w> --height <canvas-h>
npm run batch-export -- --project <project-id> [--subproject <subproject-id>]
npm run export-png -- --project <project-id> [--subproject <subproject-id>] --width <canvas-w> --height <canvas-h> --scale 2
```

`batch-export` 只准备 `reports/export-report.json`；真实 PNG 由 `export-png` 写入 `exports/`。
````

- [ ] **Step 3: 更新 skill Completion Contract**

在 `skills/text2html-image/SKILL.md` 的 Completion Contract 增加：

```markdown
- `reports/verify-output-report.json` status.
- `reports/layout-check-report.json` status for multilingual dense layouts.
- `reports/png-export-report.json` status when PNG files are requested.
- Whether `batch-export` was report-only or real PNG export was run.
```

- [ ] **Step 4: 运行测试**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md skills/text2html-image/SKILL.md docs/text2html-image-optimization-checklist.md
git commit -m "docs: document optimized text2html-image acceptance flow"
```

---

## Task 7: 增加 installed skill 注册态 smoke check

**Files:**
- Create: `scripts/check-installed-skill.js`
- Modify: `package.json`
- Modify: `scripts/test.js`

- [ ] **Step 1: 新增安装态检查脚本**

Create `scripts/check-installed-skill.js`:

```js
const fs = require('fs');
const os = require('os');
const path = require('path');

const installedRoot = path.join(os.homedir(), '.codex', 'skills');
const expected = path.join(installedRoot, 'text2html-image', 'SKILL.md');
const old = path.join(installedRoot, 'html-image-workflow');

const errors = [];
if (!fs.existsSync(expected)) errors.push(`missing installed skill: ${expected}`);
if (fs.existsSync(old)) errors.push(`old installed skill still exists: ${old}`);
if (fs.existsSync(expected)) {
  const body = fs.readFileSync(expected, 'utf8');
  if (!/^name:\s*text2html-image$/m.test(body)) errors.push(`installed skill frontmatter is not text2html-image: ${expected}`);
}

if (errors.length) {
  for (const error of errors) console.error(`ERROR ${error}`);
  process.exit(1);
}

console.log(`Installed skill check pass: ${expected}`);
```

- [ ] **Step 2: 修改 `package.json` 脚本**

```json
{
  "scripts": {
    "check-installed-skill": "node scripts/check-installed-skill.js"
  }
}
```

- [ ] **Step 3: 在 `scripts/test.js` 检查脚本存在，不默认检查用户安装目录**

```js
assert(fs.existsSync(path.join(ROOT, 'scripts', 'check-installed-skill.js')), 'missing installed skill check script');
```

不要让 `npm test` 依赖用户本机 `~/.codex/skills` 状态；安装态检查由发布/注册前手动运行。

- [ ] **Step 4: 手动检查 installed skill**

Run:

```bash
npm run check-installed-skill
```

Expected:

```text
Installed skill check pass: /Users/<user>/.codex/skills/text2html-image/SKILL.md
```

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/check-installed-skill.js scripts/test.js
git commit -m "chore: add installed skill smoke check"
```

---

## 总体验收

Run:

```bash
npm test
npm run build -- --project test-default-project
npm run quality-check -- --project test-default-project
npm run verify-output -- --project test-default-project
npm run batch-export -- --project test-default-project
npm run export-png -- --project test-default-project --dry-run
```

Expected:

- `npm test` 通过。
- `quality-check` status 为 `pass`。
- `verify-output` status 为 `pass`。
- `batch-export` 明确输出 `report-only`。
- `export-png --dry-run` 写入 `reports/png-export-report.json`。

如果本机浏览器和 `playwright-core` 已可用，再运行：

```bash
npm run check-layout -- --project test-default-project --width 1536 --height 500
npm run export-png -- --project test-default-project --width 1536 --height 500 --scale 2
npm run check-installed-skill
```

Expected:

- `layout-check-report.json` status 为 `pass`，或输出明确到 HTML 文件和 selector 的溢出错误。
- `png-export-report.json` 中每个 entry status 为 `exported`。
- `exports/*.png` 文件存在且尺寸符合 viewport x scale。
- installed skill 只有 `text2html-image`，没有旧 `html-image-workflow`。

## 自检结果

- Spec coverage: 覆盖工作区契约、HTML group、多语言同步、DOM 可编辑性、真实 PNG 导出、browser layout overflow、文档清单、installed skill 注册态。
- Placeholder scan: 未发现未完成标记、待填内容或模糊实现要求。
- Type consistency: 新增函数名固定为 `listHtmlEntries`、`inspectHtmlContract`、`withBrowser`、`inspectPageLayout`；报告名固定为 `verify-output-report.json`、`layout-check-report.json`、`png-export-report.json`。
- Scope check: 这是单一仓库的工作流硬化计划，没有引入任务平台、数据库或长期状态机；适合一次分任务执行。
