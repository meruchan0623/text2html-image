# Flood Cutout Transparent Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 `text2html-image` 增加一个洪泛式透明抠图工具，让复杂图片 layer 可以去掉外部连通背景、渐变灰边和辉光污染，并输出可审计的透明 PNG、mask debug 和 JSON report。

**Architecture:** 新增一个独立 Node.js 工具 `scripts/flood-cutout.js`，用 `pngjs` 读写 PNG，并把像素算法放在 `scripts/utils/flood-cutout-core.js`。测试继续集中在现有 `scripts/test.js`，先生成合成 PNG fixture 验证“外部背景洪泛删除、主体内部洞保留、边缘去辉光、报告输出”，再实现 CLI 和 skill 文档合同。

**Tech Stack:** Node.js 18+, CommonJS, `pngjs`, existing `npm test` test runner, existing `text2html-image` skill package.

---

## File Structure

- Create: `skills/text2html-image/scripts/utils/flood-cutout-core.js`
  - 负责 PNG 像素算法：边缘采样、背景洪泛、alpha mask、边缘去辉光、report 统计。
- Create: `skills/text2html-image/scripts/flood-cutout.js`
  - 负责 CLI 参数、文件 I/O、默认输出路径、错误输出。
- Modify: `skills/text2html-image/scripts/test.js`
  - 增加合成 PNG fixture 和 CLI smoke test，先失败再实现。
- Modify: `skills/text2html-image/package.json`
  - 增加 `flood-cutout` npm script 和 `pngjs` 依赖。
- Modify: `skills/text2html-image/SKILL.md`
  - 在资产准备和 Layered PNG 规则中写明洪泛抠图默认路径、验收产物和 stop condition。
- Modify: `skills/text2html-image/references/stage-guides.md`
  - 在资产准备阶段补充 `flood-cutout` 工作流。
- Modify: `skills/text2html-image/scripts/test.js`
  - 增加文档合同断言，确保 skill 明确提到 `npm run flood-cutout` 和 `*-mask-debug.png`。

## Task 1: 写失败测试和 npm 合同

**Files:**
- Modify: `skills/text2html-image/scripts/test.js`
- Modify: `skills/text2html-image/package.json`

- [ ] **Step 1: 在 `scripts/test.js` 顶部引入 PNG helpers**

```js
const { PNG } = require('pngjs');
```

- [ ] **Step 2: 在 `scripts/test.js` 的 package script 检查中加入新脚本**

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
  'test.js',
]) {
  assert(fs.existsSync(path.join(ROOT, 'scripts', script)), `missing package script target scripts/${script}`);
}
```

- [ ] **Step 3: 在 `packageJson` 断言后加入依赖和 script 断言**

```js
assert(packageJson.scripts['flood-cutout'] === 'node scripts/flood-cutout.js', 'package.json missing flood-cutout script');
assert(packageJson.dependencies?.pngjs || packageJson.devDependencies?.pngjs, 'package.json missing pngjs');
```

- [ ] **Step 4: 在 `scripts/test.js` 末尾加入合成图测试**

```js
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
  setPixel(floodPng, x, 2, [235, 232, 228, 150]);
  setPixel(floodPng, x, 9, [235, 232, 228, 150]);
}
for (let y = 2; y <= 9; y += 1) {
  setPixel(floodPng, 2, y, [235, 232, 228, 150]);
  setPixel(floodPng, 9, y, [235, 232, 228, 150]);
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
```

- [ ] **Step 5: 运行测试确认失败**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image/skills/text2html-image
npm test
```

Expected:

```text
Error: Cannot find module 'pngjs'
```

or:

```text
missing package script target scripts/flood-cutout.js
```

## Task 2: 实现 flood-cutout 核心算法

**Files:**
- Create: `skills/text2html-image/scripts/utils/flood-cutout-core.js`

- [ ] **Step 1: 创建 `flood-cutout-core.js`**

```js
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pixelOffset(width, x, y) {
  return (width * y + x) << 2;
}

function readPixel(png, x, y) {
  const offset = pixelOffset(png.width, x, y);
  return [
    png.data[offset],
    png.data[offset + 1],
    png.data[offset + 2],
    png.data[offset + 3],
  ];
}

function writePixel(png, x, y, rgba) {
  const offset = pixelOffset(png.width, x, y);
  png.data[offset] = rgba[0];
  png.data[offset + 1] = rgba[1];
  png.data[offset + 2] = rgba[2];
  png.data[offset + 3] = rgba[3];
}

function colorDistance(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt((dr * dr) + (dg * dg) + (db * db));
}

function averageColor(samples) {
  const total = samples.reduce((acc, pixel) => {
    acc[0] += pixel[0];
    acc[1] += pixel[1];
    acc[2] += pixel[2];
    acc[3] += pixel[3];
    return acc;
  }, [0, 0, 0, 0]);
  return total.map((value) => Math.round(value / Math.max(1, samples.length)));
}

function edgeSamples(png, inset = 0) {
  const samples = [];
  const xMin = clamp(inset, 0, png.width - 1);
  const yMin = clamp(inset, 0, png.height - 1);
  const xMax = clamp(png.width - 1 - inset, 0, png.width - 1);
  const yMax = clamp(png.height - 1 - inset, 0, png.height - 1);
  for (let x = xMin; x <= xMax; x += 1) {
    samples.push(readPixel(png, x, yMin), readPixel(png, x, yMax));
  }
  for (let y = yMin + 1; y < yMax; y += 1) {
    samples.push(readPixel(png, xMin, y), readPixel(png, xMax, y));
  }
  return samples;
}

function createMask(width, height) {
  return new Uint8Array(width * height);
}

function maskIndex(width, x, y) {
  return (width * y) + x;
}

function floodBackground(png, options = {}) {
  const tolerance = Number(options.tolerance ?? 28);
  const backgroundColor = options.backgroundColor || averageColor(edgeSamples(png, Number(options.sampleInset ?? 0)));
  const mask = createMask(png.width, png.height);
  const queue = [];
  function enqueue(x, y) {
    if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
    const index = maskIndex(png.width, x, y);
    if (mask[index]) return;
    const pixel = readPixel(png, x, y);
    if (pixel[3] === 0 || colorDistance(pixel, backgroundColor) <= tolerance) {
      mask[index] = 1;
      queue.push([x, y]);
    }
  }
  for (let x = 0; x < png.width; x += 1) {
    enqueue(x, 0);
    enqueue(x, png.height - 1);
  }
  for (let y = 1; y < png.height - 1; y += 1) {
    enqueue(0, y);
    enqueue(png.width - 1, y);
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const [x, y] = queue[cursor];
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }
  return { mask, backgroundColor, tolerance };
}

function isAdjacentToMask(mask, width, height, x, y, radius) {
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (mask[maskIndex(width, nx, ny)]) return true;
    }
  }
  return false;
}

function applyFloodCutout(inputPng, options = {}) {
  const { PNG } = require('pngjs');
  const output = new PNG({ width: inputPng.width, height: inputPng.height });
  inputPng.data.copy(output.data);
  const { mask, backgroundColor, tolerance } = floodBackground(inputPng, options);
  const edgeCleanup = Math.max(0, Number(options.edgeCleanup ?? 2));
  const glowTolerance = Number(options.glowTolerance ?? tolerance + 18);
  let removedPixels = 0;
  let edgeCleanupPixels = 0;
  for (let y = 0; y < output.height; y += 1) {
    for (let x = 0; x < output.width; x += 1) {
      const index = maskIndex(output.width, x, y);
      const pixel = readPixel(output, x, y);
      if (mask[index]) {
        writePixel(output, x, y, [pixel[0], pixel[1], pixel[2], 0]);
        removedPixels += 1;
        continue;
      }
      if (
        edgeCleanup > 0 &&
        isAdjacentToMask(mask, output.width, output.height, x, y, edgeCleanup) &&
        pixel[3] < 220 &&
        colorDistance(pixel, backgroundColor) <= glowTolerance
      ) {
        writePixel(output, x, y, [pixel[0], pixel[1], pixel[2], 0]);
        edgeCleanupPixels += 1;
      } else if (pixel[3] > 0) {
        writePixel(output, x, y, [pixel[0], pixel[1], pixel[2], 255]);
      }
    }
  }
  const maskPng = new PNG({ width: inputPng.width, height: inputPng.height });
  for (let y = 0; y < maskPng.height; y += 1) {
    for (let x = 0; x < maskPng.width; x += 1) {
      const isRemoved = mask[maskIndex(maskPng.width, x, y)];
      const pixel = isRemoved ? [0, 0, 0, 255] : [255, 255, 255, 255];
      writePixel(maskPng, x, y, pixel);
    }
  }
  const totalPixels = output.width * output.height;
  const removedRatio = (removedPixels + edgeCleanupPixels) / totalPixels;
  const warnings = [];
  if (removedRatio > 0.92) warnings.push('removed_area_ratio_too_high');
  if (removedRatio < 0.05) warnings.push('removed_area_ratio_too_low');
  return {
    output,
    maskPng,
    report: {
      mode: 'edge-flood',
      width: output.width,
      height: output.height,
      tolerance,
      glow_tolerance: glowTolerance,
      edge_cleanup_radius: edgeCleanup,
      background_color: backgroundColor.slice(0, 3),
      removed_pixels: removedPixels,
      edge_cleanup_pixels: edgeCleanupPixels,
      removed_area_ratio: Number(removedRatio.toFixed(6)),
      warnings,
    },
  };
}

module.exports = {
  applyFloodCutout,
  colorDistance,
  floodBackground,
  readPixel,
  writePixel,
};
```

- [ ] **Step 2: 运行测试确认仍失败在 CLI 或 package 合同**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image/skills/text2html-image
npm test
```

Expected:

```text
missing package script target scripts/flood-cutout.js
```

## Task 3: 实现 CLI 和依赖

**Files:**
- Create: `skills/text2html-image/scripts/flood-cutout.js`
- Modify: `skills/text2html-image/package.json`

- [ ] **Step 1: 修改 `package.json` scripts 和 dependencies**

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
    "test": "node scripts/test.js"
  },
  "dependencies": {
    "@resvg/resvg-js": "^2.6.2",
    "css-tree": "^3.2.1",
    "parse5": "^8.0.1",
    "pngjs": "^7.0.0"
  }
}
```

- [ ] **Step 2: 安装 lockfile**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image/skills/text2html-image
npm install
```

Expected:

```text
up to date
```

or a normal npm audit summary with `package-lock.json` updated.

- [ ] **Step 3: 创建 `scripts/flood-cutout.js`**

```js
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const { applyFloodCutout } = require('./utils/flood-cutout-core');
const { parseArgs, writeJson } = require('./utils/workflow-core');

function usage() {
  return [
    'Usage: npm run flood-cutout -- --input <source.png> [--output <clean.png>] [--mask <mask-debug.png>] [--report <report.json>]',
    '',
    'Options:',
    '  --input          Required source PNG.',
    '  --output         Transparent PNG output. Defaults to <input>-transparent.png.',
    '  --mask           Mask debug PNG output. Defaults to <input>-mask-debug.png.',
    '  --report         JSON report output. Defaults to <input>-cutout-report.json.',
    '  --tolerance      Background color distance threshold. Default: 28.',
    '  --glow-tolerance Edge glow color distance threshold. Default: tolerance + 18.',
    '  --edge-cleanup   Cleanup radius in pixels around removed background. Default: 2.',
  ].join('\n');
}

function withSuffix(input, suffix) {
  const ext = path.extname(input);
  return path.join(path.dirname(input), `${path.basename(input, ext)}${suffix}${ext || '.png'}`);
}

function main() {
  const args = parseArgs();
  if (!args.input || args.help) {
    console.error(usage());
    process.exit(args.help ? 0 : 1);
  }
  const input = path.resolve(String(args.input));
  if (!fs.existsSync(input)) {
    console.error(`Input image not found: ${input}`);
    process.exit(1);
  }
  const output = path.resolve(String(args.output || withSuffix(input, '-transparent')));
  const mask = path.resolve(String(args.mask || withSuffix(input, '-mask-debug')));
  const reportPath = path.resolve(String(args.report || path.join(path.dirname(input), `${path.basename(input, path.extname(input))}-cutout-report.json`)));
  const png = PNG.sync.read(fs.readFileSync(input));
  const result = applyFloodCutout(png, {
    tolerance: args.tolerance,
    glowTolerance: args['glow-tolerance'],
    edgeCleanup: args['edge-cleanup'],
  });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.mkdirSync(path.dirname(mask), { recursive: true });
  fs.writeFileSync(output, PNG.sync.write(result.output));
  fs.writeFileSync(mask, PNG.sync.write(result.maskPng));
  writeJson(reportPath, {
    ...result.report,
    input,
    output,
    mask,
  });
  console.log(`Flood cutout completed: ${output}`);
  console.log(`Mask debug: ${mask}`);
  console.log(`Report: ${reportPath}`);
  if (result.report.warnings.length) {
    console.log(`Warnings: ${result.report.warnings.join(', ')}`);
  }
}

main();
```

- [ ] **Step 4: 运行测试确认通过新增行为**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image/skills/text2html-image
npm test
```

Expected:

```text
All text2html-image checks passed.
```

## Task 4: 更新 skill 合同和文档断言

**Files:**
- Modify: `skills/text2html-image/SKILL.md`
- Modify: `skills/text2html-image/references/stage-guides.md`
- Modify: `skills/text2html-image/scripts/test.js`

- [ ] **Step 1: 在 `SKILL.md` 的资产准备区域加入洪泛规则**

```markdown
## Flood Cutout Asset Cleanup

When a bitmap layer must be composited over HTML/CSS, clean it with edge-connected flood cutout before accepting it as a transparent PNG. This is required for AI-generated maps, characters, devices, landmarks, and irregular sticker-like assets that show gradient glow, gray matte, soft halos, or non-transparent outer backgrounds.

Use `npm run flood-cutout -- --input <source.png>` from the skill root. The tool removes only background pixels connected to the canvas edge, then cleans the immediate edge ring so the delivered transparent layer does not keep glow or gradient haze. It must preserve internal background-colored holes that are not edge-connected.

Required outputs:

- `*-transparent.png`: cleaned transparent layer.
- `*-mask-debug.png`: black/white debug mask showing removed edge-connected background.
- `*-cutout-report.json`: dimensions, thresholds, removed pixel counts, alpha cleanup counts, warnings, and output paths.

Do not use prompt wording, CSS filters, `mix-blend-mode`, opacity tricks, or a white/gray matte as a substitute for real transparency. If the report warns that the removed area ratio is too high or too low, inspect the mask debug before using the asset.
```

- [ ] **Step 2: 在 `Layered PNG + HTML Pitfalls` 中加入验收规则**

```markdown
- For irregular or AI-generated bitmap layers, run flood cutout first and use the resulting `*-transparent.png`; do not place glow-cutout, gray-matte, or softly faded background assets as final layers.
- Transparent PNG acceptance requires fully transparent exterior pixels, no visible gradient glow around the silhouette, and a saved `*-mask-debug.png` plus `*-cutout-report.json`.
```

- [ ] **Step 3: 在 `references/stage-guides.md` 的资产准备中加入 CLI 合同**

```markdown
- For irregular bitmap cutouts, run `npm run flood-cutout -- --input <source.png>` and use the generated `*-transparent.png` as the compositing asset. Keep `*-mask-debug.png` and `*-cutout-report.json` in `working/` or `reports/` for review.
- Reject transparent assets that still depend on gradient glow, gray matte, or semi-transparent exterior haze to blend into the poster.
```

- [ ] **Step 4: 在 `scripts/test.js` 文档合同断言中加入 flood-cutout**

```js
assert(skillBody.includes('## Flood Cutout Asset Cleanup'), 'skill must document flood cutout asset cleanup');
assert(skillBody.includes('npm run flood-cutout'), 'skill must document flood-cutout command');
assert(skillBody.includes('*-mask-debug.png'), 'skill must require mask debug output');
assert(skillBody.includes('*-cutout-report.json'), 'skill must require cutout report output');
```

- [ ] **Step 5: 运行测试**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image/skills/text2html-image
npm test
```

Expected:

```text
All text2html-image checks passed.
```

## Task 5: 在真实素材上试跑并审计透明度

**Files:**
- Generate under workspace only: `/Users/tashima_meru/Documents/text2html-image-project/travel-esim-query/working/*`
- Generate under workspace only: `/Users/tashima_meru/Documents/text2html-image-project/travel-esim-query/reports/*`

- [ ] **Step 1: 对当前可见的真实素材试跑**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image/skills/text2html-image
npm run flood-cutout -- \
  --input /Users/tashima_meru/Documents/text2html-image-project/travel-esim-query/source/background-art.png \
  --output /Users/tashima_meru/Documents/text2html-image-project/travel-esim-query/working/background-art-transparent.png \
  --mask /Users/tashima_meru/Documents/text2html-image-project/travel-esim-query/working/background-art-mask-debug.png \
  --report /Users/tashima_meru/Documents/text2html-image-project/travel-esim-query/reports/background-art-cutout-report.json \
  --tolerance 30 \
  --edge-cleanup 3
```

Expected:

```text
Flood cutout completed: /Users/tashima_meru/Documents/text2html-image-project/travel-esim-query/working/background-art-transparent.png
Mask debug: /Users/tashima_meru/Documents/text2html-image-project/travel-esim-query/working/background-art-mask-debug.png
Report: /Users/tashima_meru/Documents/text2html-image-project/travel-esim-query/reports/background-art-cutout-report.json
```

- [ ] **Step 2: 审计真实输出 alpha**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image/skills/text2html-image
node - <<'NODE'
const fs = require('fs');
const { PNG } = require('pngjs');
const file = '/Users/tashima_meru/Documents/text2html-image-project/travel-esim-query/working/background-art-transparent.png';
const png = PNG.sync.read(fs.readFileSync(file));
let transparent = 0;
let opaque = 0;
let partial = 0;
for (let i = 3; i < png.data.length; i += 4) {
  if (png.data[i] === 0) transparent += 1;
  else if (png.data[i] === 255) opaque += 1;
  else partial += 1;
}
console.log(JSON.stringify({ width: png.width, height: png.height, transparent, opaque, partial }, null, 2));
NODE
```

Expected:

```text
"partial": 0
```

## Task 6: 最终验证和提交

**Files:**
- Modified files from Tasks 1-4.

- [ ] **Step 1: 运行完整测试**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image/skills/text2html-image
npm test
```

Expected:

```text
All text2html-image checks passed.
```

- [ ] **Step 2: 查看 git diff，确认没有误纳入 workspace 输出**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image
git status --short
git diff --stat
```

Expected:

```text
No generated files from /Users/tashima_meru/Documents/text2html-image-project are listed.
```

- [ ] **Step 3: 提交**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image
git add docs/superpowers/plans/2026-06-25-flood-cutout-transparent-assets.md \
  skills/text2html-image/package.json \
  skills/text2html-image/package-lock.json \
  skills/text2html-image/scripts/flood-cutout.js \
  skills/text2html-image/scripts/utils/flood-cutout-core.js \
  skills/text2html-image/scripts/test.js \
  skills/text2html-image/SKILL.md \
  skills/text2html-image/references/stage-guides.md
git commit -m "feat: add flood cutout asset cleanup"
```

Expected:

```text
[main <sha>] feat: add flood cutout asset cleanup
```

## Self-Review

- Spec coverage: 计划覆盖洪泛背景删除、边缘去辉光、异形透明 layer、报告产物、真实素材试跑和 skill 合同。
- Placeholder scan: 未保留 `TBD`、`TODO`、`implement later` 或无代码说明的实现步骤。
- Type consistency: 核心 API 固定为 `applyFloodCutout(inputPng, options)`，CLI 参数和测试字段使用同一套 `tolerance`、`glowTolerance`、`edgeCleanup` 命名。
