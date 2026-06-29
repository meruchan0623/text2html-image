# FigEdit-Inspired HTML Editability Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 借鉴 `giszzt/figedit` 的 manifest 决策和可编辑性审计思路，增强 `text2html-image` 产出的 HTML 可编辑能力，让后续修改能依赖稳定 DOM key、资产文本策略和可复查报告，而不是靠人工猜测页面结构。

**Architecture:** 首版不引入 PaddleOCR、OpenCV，也不增加 PPTX、Office Math 或其他非 HTML 输出面。新增一个纯 Node.js DOM 审计模块读取已生成的 `html/<html-group>/index*.html`，统计真实 DOM 文本、i18n/business key、脚本、图片资产、疑似被压进位图的文本风险，并通过 CLI 写入项目 `reports/`。报告的直接用途是指导 HTML 编辑：指出哪些文本缺少稳定 key、哪些图片资产需要文本策略、哪些节点不适合被当成可编辑内容。

**Tech Stack:** Node.js 18+, CommonJS, `parse5`, existing `listHtmlEntries`, existing workspace helpers, existing `npm test` runner.

---

## Assumptions

- 当前项目主合同仍然是静态 HTML/CSS/SVG 预览，文字、价格、CTA、标签和法律文案优先保留为可编辑 DOM 文本。
- `figedit` 的核心可借鉴点是“每个元素的处理决策可审计”和“报告统计可编辑性”，不是把当前产物改成 SVG、PPTX 或其他编辑格式。
- 首版必须轻量、可跑在现有 Node 依赖内；OCR/OpenCV/Paddle 依赖会显著增加安装成本，因此不进入本计划。
- 当前仓库已有未跟踪文件 `docs/superpowers/plans/2026-06-25-transparent-layer-generation.md`，执行本计划时不要修改、删除或纳入无关提交。

## Borrowed Ideas From FigEdit

1. **元素处理决策显式化**
   FigEdit 的 manifest 会记录 `retype`、`redraw`、`crop`、`embed` 等决策，以及 `decision_reason`、`text_policy`、`crop_status`。本计划在 HTML 侧落地为 DOM/资产审计报告，不要求每个 HTML 节点都有人工 manifest，但会把图片资产、真实文本、键值元数据和风险项结构化输出。

2. **证据和最终产物分离**
   FigEdit 把 OCR/OpenCV 结果作为 evidence，不直接让检测候选进入最终 SVG。`text2html-image` 首版只读 HTML 和本地资产，生成审计证据，不回写 HTML、不自动修复布局。

3. **可编辑性指标量化**
   FigEdit 的 `editability_report.md` 包含 text lift ratio、SVG text count、asset text risk count 等指标。HTML 版对应指标为 editable text node count、i18n metadata count、business metadata count、image asset count、script count、asset text risk count、missing metadata samples。

4. **资产文本风险显式报告**
   FigEdit 会检查图片资产里是否包含本应可编辑的文本。首版没有 OCR，因此通过文件名、alt、DOM 邻近文本、缺少 `data-asset-text-policy` 的图片、以及关键营销字段缺失来标记“需要人工复核”，不声称已识别图片内部文字。

5. **输出报告优先于 prose**
   当前 skill 已经要求复杂项目写 `reports/` 证据。本计划新增固定报告路径，减少交接时“视觉看起来没问题但 DOM 合同失败”的返工。

6. **编辑入口稳定化**
   FigEdit 的 manifest 让元素可以被再次定位和修改。HTML 侧对应目标是推动 `data-i18n-key`、`data-country-code`、`data-region-code`、`data-sku`、`data-asset-text-policy` 等稳定属性成为编辑入口，使后续直接 patch 生成 HTML 时能按语义定位，而不是按文本搜索或视觉坐标猜测。

## Approach Options

### Option A: DOM-Only Audit First

只解析生成后的 HTML 和 CSS 链接，输出 DOM 可编辑性与资产风险报告。实现快、依赖轻、和当前项目边界最吻合。

Trade-off: 无法真正读取图片内部文字，只能标记风险。

### Option B: DOM Audit Plus OCR

接入 PaddleOCR 或其他 OCR，把图片内部文字也纳入 text lift ratio。

Trade-off: 更接近 FigEdit，但依赖重、安装慢，容易把图片识别问题带进默认工作流。

### Option C: Introduce Full HTML Edit Manifest

要求每个复杂海报先写 `html-edit-manifest.json`，记录可编辑文本、资产层、业务 key、允许编辑的字段和不应被修改的位图区域，再生成或 patch HTML。

Trade-off: 可审计性最好，但会改变当前 fast path，首版容易过重。

**Recommendation:** 采用 Option A。它能直接增强当前 `quality-check` 和完成合同，同时保留后续接 OCR/manifest 的扩展点。

## HTML Editing Capabilities This Enables

首版审计工具不是一个可视化编辑器，但它会为 HTML 编辑提供三个直接能力：

1. **可定位编辑**
   报告列出哪些真实文本节点缺少 `data-i18n-key`，哪些重复业务节点缺少 `data-country-code`、`data-region-code` 或 `data-sku`。修完这些 key 后，后续 patch 可以稳定定位节点。

2. **可编辑边界识别**
   报告区分 DOM 文本、业务标签、图片资产和脚本风险。后续编辑时可以明确知道哪些内容应该改 HTML 文本，哪些内容应改 CSS/SVG，哪些只能作为位图资产替换。

3. **资产文本策略**
   图片节点必须逐步补 `data-asset-text-policy`，例如 `preserve-raster`、`extract-editable`、`allow-embedded-text`。这会让后续编辑者知道某张图片里的文字是故意保留、需要拆出成 DOM，还是需要人工复核。

## File Structure

- Create: `skills/text2html-image/scripts/utils/dom-editability-core.js`
  - 负责解析单个 HTML 文件，提取 DOM 文本、i18n/business key、图片资产、脚本数量、风险项和汇总指标。
- Create: `skills/text2html-image/scripts/audit-dom.js`
  - 负责 CLI 参数、枚举项目 HTML entries、写入 `reports/dom-editability-report.json` 和 `reports/dom-editability-summary.md`。
- Modify: `skills/text2html-image/package.json`
  - 增加 `audit:dom` npm script。
- Modify: `skills/text2html-image/scripts/test.js`
  - 增加脚本存在性、package script、核心函数和 CLI smoke 测试。
- Modify: `skills/text2html-image/SKILL.md`
  - 在 completion contract 和 commands 中加入 DOM 可编辑性审计。
- Modify: `skills/text2html-image/references/execution-flow.md`
  - 在 verification ladder 和 reports 列表中加入 DOM 审计报告。

## Report Contract

`reports/dom-editability-report.json`:

```json
{
  "generated_at": "2026-06-29T00:00:00.000Z",
  "project_id": "test-default-project",
  "subproject_id": null,
  "status": "pass",
  "summary": {
    "entry_count": 3,
    "pass_count": 3,
    "review_count": 0,
    "fail_count": 0,
    "editable_text_node_count": 42,
    "i18n_key_count": 18,
    "business_key_count": 12,
    "image_count": 4,
    "script_count": 0,
    "asset_text_risk_count": 0
  },
  "entries": [
    {
      "html_group": "europe-esim-map",
      "variant": "canonical",
      "html": "/absolute/path/index.html",
      "status": "pass",
      "canvas": { "width": 1000, "height": 1263 },
      "metrics": {
        "editable_text_node_count": 12,
        "i18n_key_count": 8,
        "business_key_count": 6,
        "image_count": 1,
        "script_count": 0,
        "asset_text_risk_count": 0
      },
      "risks": [],
      "samples": {
        "missing_i18n_text": [],
        "images_without_policy": []
      }
    }
  ]
}
```

Status rules:

- `fail`: any script tag exists, `.poster` canvas is missing, or unresolved `{{...}}` template tokens exist.
- `review`: no hard failure, but visible text lacks i18n/business metadata, image assets lack text policy, or image alt/filename suggests embedded marketing text.
- `pass`: no hard failure and no review risk.

## Task 1: Write Failing Tests And Package Contract

**Files:**
- Modify: `skills/text2html-image/scripts/test.js`
- Modify: `skills/text2html-image/package.json`

- [ ] **Step 1: Add script target to the package script existence list**

In `skills/text2html-image/scripts/test.js`, update the script list:

```js
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
```

- [ ] **Step 2: Add npm script assertion**

In `skills/text2html-image/scripts/test.js`, near existing package script assertions:

```js
assert(packageJson.scripts['audit:dom'] === 'node scripts/audit-dom.js', 'package.json missing audit:dom script');
```

- [ ] **Step 3: Add core module tests**

In `skills/text2html-image/scripts/test.js`, after `const packageJson = JSON.parse(read('package.json'));`, add:

```js
const { inspectHtmlEditability } = require('./utils/dom-editability-core');
```

After the build output checks, add:

```js
const firstHtmlOutput = outputs.find((item) => item.status === 'built');
const firstHtmlAudit = inspectHtmlEditability(firstHtmlOutput.html);
assert(firstHtmlAudit.status !== 'fail', `generated HTML should not fail DOM audit: ${firstHtmlOutput.html}`);
assert(firstHtmlAudit.metrics.script_count === 0, 'generated HTML should not contain script tags');
assert(firstHtmlAudit.metrics.editable_text_node_count > 0, 'generated HTML should expose editable DOM text nodes');
assert(firstHtmlAudit.metrics.image_count >= 0, 'DOM audit should report image count');
assert(Array.isArray(firstHtmlAudit.risks), 'DOM audit should report risk array');
```

- [ ] **Step 4: Add CLI smoke test**

In `skills/text2html-image/scripts/test.js`, after the `quality-check` validation block:

```js
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
```

- [ ] **Step 5: Run tests and verify they fail**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image/skills/text2html-image
npm test
```

Expected output includes:

```text
missing package script target scripts/audit-dom.js
```

or:

```text
Cannot find module './utils/dom-editability-core'
```

## Task 2: Implement DOM Editability Core

**Files:**
- Create: `skills/text2html-image/scripts/utils/dom-editability-core.js`

- [ ] **Step 1: Create the core module**

Create `skills/text2html-image/scripts/utils/dom-editability-core.js`:

```js
const fs = require('fs');
const path = require('path');
const parse5 = require('parse5');
const { attrsToObject, parseInlineStyle, parsePx, walk } = require('./render-profile');

const BUSINESS_KEY_ATTRS = new Set([
  'data-country-code',
  'data-region-code',
  'data-sku',
  'data-product-id',
  'data-plan-id',
]);

const MARKETING_TEXT_PATTERN = /(title|headline|subtitle|price|cta|disclaimer|label|copy|text|legal|banner|poster)/i;

function textContent(node) {
  if (node.nodeName === '#text') return node.value || '';
  return (node.childNodes || []).map(textContent).join('');
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isIgnorableTextNode(node) {
  const value = normalizeText(node.value || '');
  return !value || value === '|' || value === '·';
}

function hasAncestor(node, predicate) {
  let current = node.parentNode;
  while (current) {
    if (predicate(current)) return true;
    current = current.parentNode;
  }
  return false;
}

function attachParents(node, parent = null) {
  node.parentNode = parent;
  for (const child of node.childNodes || []) attachParents(child, node);
}

function classList(attrs) {
  return String(attrs.class || '').split(/\s+/).filter(Boolean);
}

function extractCanvas(documentNode) {
  let poster;
  walk(documentNode, (node) => {
    if (poster || !node.tagName) return;
    const attrs = attrsToObject(node);
    if (/\bposter\b/.test(attrs.class || '')) poster = node;
  });
  if (!poster) return { error: 'missing .poster element' };
  const attrs = attrsToObject(poster);
  const style = parseInlineStyle(attrs.style);
  const width = parsePx(style.width);
  const height = parsePx(style.height);
  if (!width || !height) return { error: '.poster must have inline pixel width and height' };
  return { width, height };
}

function inspectImage(node, htmlPath) {
  const attrs = attrsToObject(node);
  const src = attrs.src || attrs.href || '';
  const resolved = src && !/^data:|^https?:/i.test(src)
    ? path.resolve(path.dirname(htmlPath), src)
    : undefined;
  const policy = attrs['data-asset-text-policy'] || attrs['data-text-policy'] || '';
  const alt = attrs.alt || attrs['aria-label'] || '';
  const basename = src ? path.basename(src) : '';
  const risks = [];
  if (!policy) {
    risks.push({
      code: 'image_missing_text_policy',
      message: 'image asset does not declare data-asset-text-policy',
      src,
    });
  }
  if (MARKETING_TEXT_PATTERN.test(`${basename} ${alt}`) && policy !== 'preserve-raster') {
    risks.push({
      code: 'possible_bitmap_text_asset',
      message: 'image filename or alt text suggests embedded editable marketing text',
      src,
      alt,
    });
  }
  if (resolved && !fs.existsSync(resolved)) {
    risks.push({
      code: 'missing_local_image_asset',
      message: 'local image asset path does not resolve from HTML location',
      src,
      resolved,
    });
  }
  return {
    src,
    resolved,
    alt,
    text_policy: policy,
    exists: resolved ? fs.existsSync(resolved) : undefined,
    risks,
  };
}

function inspectHtmlEditability(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const documentNode = parse5.parse(html);
  attachParents(documentNode);
  const canvas = extractCanvas(documentNode);
  const risks = [];
  const samples = {
    missing_i18n_text: [],
    images_without_policy: [],
  };
  const metrics = {
    editable_text_node_count: 0,
    i18n_key_count: 0,
    business_key_count: 0,
    image_count: 0,
    script_count: 0,
    asset_text_risk_count: 0,
    unresolved_template_token_count: 0,
  };
  const images = [];

  if (canvas.error) {
    risks.push({ severity: 'fail', code: 'canvas_error', message: canvas.error });
  }
  const tokenMatches = html.match(/{{[^}]+}}/g) || [];
  metrics.unresolved_template_token_count = tokenMatches.length;
  if (tokenMatches.length) {
    risks.push({
      severity: 'fail',
      code: 'unresolved_template_tokens',
      message: 'HTML contains unreplaced template tokens',
      count: tokenMatches.length,
    });
  }

  walk(documentNode, (node) => {
    if (!node.tagName && node.nodeName !== '#text') return;
    if (node.tagName === 'script') metrics.script_count += 1;
    if (node.tagName === 'img' || node.tagName === 'image') {
      metrics.image_count += 1;
      const image = inspectImage(node, htmlPath);
      images.push(image);
      for (const risk of image.risks) {
        metrics.asset_text_risk_count += 1;
        risks.push({ severity: risk.code === 'missing_local_image_asset' ? 'fail' : 'review', ...risk });
      }
      if (!image.text_policy) samples.images_without_policy.push(image.src);
    }
    const attrs = attrsToObject(node);
    if (attrs['data-i18n-key']) metrics.i18n_key_count += 1;
    for (const attr of BUSINESS_KEY_ATTRS) {
      if (attrs[attr]) {
        metrics.business_key_count += 1;
        break;
      }
    }
    if (node.nodeName === '#text' && !isIgnorableTextNode(node)) {
      const text = normalizeText(node.value);
      if (hasAncestor(node, (ancestor) => ['script', 'style', 'title'].includes(ancestor.tagName))) return;
      metrics.editable_text_node_count += 1;
      const parentAttrs = attrsToObject(node.parentNode || {});
      const parentClasses = classList(parentAttrs);
      const isLikelyUserText = parentClasses.some((name) => MARKETING_TEXT_PATTERN.test(name)) || text.length >= 2;
      if (isLikelyUserText && !parentAttrs['data-i18n-key'] && samples.missing_i18n_text.length < 20) {
        samples.missing_i18n_text.push({ text, parent_class: parentAttrs.class || '' });
      }
    }
  });

  if (metrics.script_count) {
    risks.push({
      severity: 'fail',
      code: 'script_tag_present',
      message: 'Generated preview must stay static and script-free',
      count: metrics.script_count,
    });
  }
  if (metrics.editable_text_node_count > 0 && metrics.i18n_key_count === 0) {
    risks.push({
      severity: 'review',
      code: 'missing_i18n_metadata',
      message: 'Editable text exists but no data-i18n-key metadata was found',
      sample_count: samples.missing_i18n_text.length,
    });
  }

  const hasFail = risks.some((risk) => risk.severity === 'fail');
  const hasReview = risks.some((risk) => risk.severity === 'review');
  return {
    html_path: htmlPath,
    status: hasFail ? 'fail' : hasReview ? 'review' : 'pass',
    canvas: canvas.error ? undefined : canvas,
    metrics,
    risks,
    samples,
    images,
  };
}

function summarizeReports(entries) {
  const summary = {
    entry_count: entries.length,
    pass_count: entries.filter((entry) => entry.status === 'pass').length,
    review_count: entries.filter((entry) => entry.status === 'review').length,
    fail_count: entries.filter((entry) => entry.status === 'fail').length,
    editable_text_node_count: 0,
    i18n_key_count: 0,
    business_key_count: 0,
    image_count: 0,
    script_count: 0,
    asset_text_risk_count: 0,
  };
  for (const entry of entries) {
    summary.editable_text_node_count += entry.metrics.editable_text_node_count;
    summary.i18n_key_count += entry.metrics.i18n_key_count;
    summary.business_key_count += entry.metrics.business_key_count;
    summary.image_count += entry.metrics.image_count;
    summary.script_count += entry.metrics.script_count;
    summary.asset_text_risk_count += entry.metrics.asset_text_risk_count;
  }
  return summary;
}

module.exports = {
  inspectHtmlEditability,
  summarizeReports,
};
```

- [ ] **Step 2: Run targeted test and verify module exists**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image/skills/text2html-image
npm test
```

Expected: failure moves from missing module to missing `scripts/audit-dom.js` or missing package script.

## Task 3: Implement Audit CLI

**Files:**
- Create: `skills/text2html-image/scripts/audit-dom.js`

- [ ] **Step 1: Create the CLI file**

Create `skills/text2html-image/scripts/audit-dom.js`:

```js
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
  require('fs').writeFileSync(summaryPath, `${lines.join('\n')}\n`, 'utf8');
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
```

- [ ] **Step 2: Run tests and verify package script is now the failing contract**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image/skills/text2html-image
npm test
```

Expected:

```text
package.json missing audit:dom script
```

## Task 4: Add Package Script And Pass Tests

**Files:**
- Modify: `skills/text2html-image/package.json`

- [ ] **Step 1: Add `audit:dom` script**

In `skills/text2html-image/package.json`, update `scripts`:

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
    "flood-cutout": "node scripts/flood-cutout.js",
    "audit:dom": "node scripts/audit-dom.js",
    "test": "node scripts/test.js"
  }
}
```

Keep the existing `version`, `description`, `dependencies`, and other fields unchanged.

- [ ] **Step 2: Run full tests**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image/skills/text2html-image
npm test
```

Expected:

```text
All tests passed.
```

- [ ] **Step 3: Run CLI manually on the test project**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image/skills/text2html-image
npm run audit:dom -- --project test-default-project
```

Expected:

```text
DOM editability audit written: /Users/tashima_meru/Documents/text2html-image-project/test-default-project/reports/dom-editability-report.json
DOM editability summary written: /Users/tashima_meru/Documents/text2html-image-project/test-default-project/reports/dom-editability-summary.md
```

## Task 5: Document The New Audit In Skill Instructions

**Files:**
- Modify: `skills/text2html-image/SKILL.md`
- Modify: `skills/text2html-image/references/execution-flow.md`
- Modify: `skills/text2html-image/scripts/test.js`

- [ ] **Step 1: Add command to `SKILL.md` command block**

In `skills/text2html-image/SKILL.md`, add this line to the command list:

```bash
npm run audit:dom -- --project <project-id> [--subproject <subproject-id>] [--group <html-group>]
```

- [ ] **Step 2: Add report requirement to completion contract**

In `skills/text2html-image/SKILL.md`, under “Before claiming a complex image HTML conversion is complete, report or verify:”, add:

```markdown
- DOM editability report path, including editable text count, i18n metadata count, business key count, script count, image count, and asset text risk count.
```

- [ ] **Step 3: Add stop condition**

In `skills/text2html-image/SKILL.md`, under “Stop Conditions”, add:

```markdown
- `reports/dom-editability-report.json` has `status: "fail"` for the affected HTML group.
```

- [ ] **Step 4: Update execution flow verification ladder**

In `skills/text2html-image/references/execution-flow.md`, replace the first verification ladder item with:

```markdown
1. Static DOM contract: no scripts, expected image count, editable text count, i18n/business key count, local asset existence, and `reports/dom-editability-report.json` status.
```

In the report list under “Rework Prevention Reports”, add:

```markdown
- `dom-editability-report.json`
- `dom-editability-summary.md`
```

- [ ] **Step 5: Add documentation assertions**

In `skills/text2html-image/scripts/test.js`, after existing `skillBody` assertions:

```js
assert(skillBody.includes('npm run audit:dom'), 'skill must document audit:dom command');
assert(skillBody.includes('DOM editability report path'), 'completion contract must include DOM editability report');
assert(skillBody.includes('dom-editability-report.json'), 'skill must mention dom-editability-report.json');
const executionFlow = read('references/execution-flow.md');
assert(executionFlow.includes('dom-editability-report.json'), 'execution flow must include DOM editability report');
assert(executionFlow.includes('dom-editability-summary.md'), 'execution flow must include DOM editability summary');
```

- [ ] **Step 6: Run full tests**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image/skills/text2html-image
npm test
```

Expected:

```text
All tests passed.
```

## Task 6: Commit The Implementation

**Files:**
- Stage only files changed by this plan.

- [ ] **Step 1: Review worktree**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image
git status --short
```

Expected changed files include:

```text
M  skills/text2html-image/SKILL.md
M  skills/text2html-image/package.json
M  skills/text2html-image/scripts/test.js
M  skills/text2html-image/references/execution-flow.md
A  skills/text2html-image/scripts/audit-dom.js
A  skills/text2html-image/scripts/utils/dom-editability-core.js
```

The pre-existing untracked file below is unrelated and must remain unstaged unless the user separately asks to include it:

```text
?? docs/superpowers/plans/2026-06-25-transparent-layer-generation.md
```

- [ ] **Step 2: Stage planned files**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image
git add \
  skills/text2html-image/SKILL.md \
  skills/text2html-image/package.json \
  skills/text2html-image/scripts/test.js \
  skills/text2html-image/references/execution-flow.md \
  skills/text2html-image/scripts/audit-dom.js \
  skills/text2html-image/scripts/utils/dom-editability-core.js
```

- [ ] **Step 3: Commit**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image
git commit -m "feat: add DOM editability audit"
```

Expected:

```text
[main <hash>] feat: add DOM editability audit
```

## Verification Checklist

- [ ] `npm test` passes from `/Users/tashima_meru/Develop/text2html-image/skills/text2html-image`.
- [ ] `npm run audit:dom -- --project test-default-project` writes both report files under `/Users/tashima_meru/Documents/text2html-image-project/test-default-project/reports/`.
- [ ] `dom-editability-report.json` contains `summary`, `entries`, per-entry `metrics`, `risks`, and `samples`.
- [ ] Script tags produce `status: "fail"` in a synthetic or manually edited HTML check.
- [ ] Missing `data-i18n-key` on visible text produces `status: "review"` rather than silently passing.
- [ ] Missing local image asset produces `status: "fail"`.
- [ ] No runtime artifacts are written to the repo root or skill package directory.

## Future HTML-Focused Plans Not Included Here

- OCR/OpenCV measurement evidence similar to FigEdit `prepare_measurements.py`.
- Full `html-edit-manifest.json` authoring before HTML generation or workspace HTML patching.
- A semantic HTML patch CLI that edits nodes by `data-i18n-key`, `data-country-code`, `data-region-code`, or `data-sku`.
- A report-driven repair mode that adds missing metadata only when the target node can be identified without ambiguity.
- Automatic image-internal text detection.
- Automatic HTML repair based on audit output.

Those are separate plans because each adds new dependencies, new failure modes, or a different output surface.
