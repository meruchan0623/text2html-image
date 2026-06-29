# Transparent Layer Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a generation-first transparent layer package workflow for `text2html-image`, with reusable prompts, same-canvas and bbox PNG contracts, local transparency audit, and explicit `flood-cutout` fallback only when requested.

**Architecture:** Add a new `transparent-layer` CLI that writes a prompt package under the project workspace and audits supplied or generated PNG outputs. Keep image generation itself as an agent/operator action outside the local Node runtime because Codex image generation tools are not available inside `npm` scripts and no external API keys should be hardcoded. Split reusable logic into a request/prompt builder and a PNG transparency auditor; keep `flood-cutout` as an explicit local cleanup helper instead of the default path.

**Tech Stack:** Node.js 18+, CommonJS, `pngjs`, existing `workflow-core` workspace helpers, existing `npm test` script.

---

## Scope And Assumptions

- This plan does not replace the existing `scripts/flood-cutout.js`; it repositions it as an optional cleanup helper behind `--local-cleanup`.
- The local CLI never calls a hosted image generation API and never reads secrets. If Codex image generation is available in the agent environment, the agent uses `prompt.md` outside the CLI, saves the returned PNG files to the expected paths, then reruns the CLI with `--same-canvas` and `--bbox` to audit them.
- `prompt_only` is a valid status. It means the workflow has produced a complete ChatGPT Images / Codex Images prompt contract but no PNG output has been attached yet.
- All runtime artifacts are written under `~/Documents/text2html-image-project/<project-id>/...`, through existing `createProjectWorkspace`.

## File Structure

- Create: `skills/text2html-image/scripts/utils/transparent-layer-audit.js`
  - Reads PNG alpha data and returns status, dimensions, opaque bbox, alpha counts, exterior edge counts, and risk flags.
- Create: `skills/text2html-image/scripts/utils/transparent-layer-request.js`
  - Builds the structured transparent layer request and renders the reusable `prompt.md` text.
- Create: `skills/text2html-image/scripts/transparent-layer.js`
  - CLI entrypoint for prompt package creation, optional supplied-output audit, optional local flood cleanup, and report writing.
- Modify: `skills/text2html-image/scripts/test.js`
  - Adds failing contract tests, synthetic PNG audit tests, CLI prompt-only smoke test, supplied-output audit test, and local cleanup warning test.
- Modify: `skills/text2html-image/package.json`
  - Adds `transparent-layer` npm script.
- Modify: `skills/text2html-image/SKILL.md`
  - Documents generation-first transparent layer workflow, required artifacts, and the new role of flood-cutout.
- Modify: `skills/text2html-image/references/stage-guides.md`
  - Updates asset-preparation guidance to prefer `transparent-layer` before flood cleanup.
- Modify: `skills/text2html-image/references/six-phase-contract.md`
  - Clarifies external image-generation boundary and prompt-only fallback.

## Task 1: Add Failing Tests For The New Contract

**Files:**
- Modify: `skills/text2html-image/scripts/test.js`
- Modify: `skills/text2html-image/package.json`

- [ ] **Step 1: Add the new CLI script target assertion in `skills/text2html-image/scripts/test.js`**

Find the `for (const script of [` block near the top of the file and add `transparent-layer.js` after `flood-cutout.js`:

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
  'transparent-layer.js',
  'test.js',
]) {
  assert(fs.existsSync(path.join(ROOT, 'scripts', script)), `missing package script target scripts/${script}`);
}
```

- [ ] **Step 2: Add the package script assertion after the existing `flood-cutout` assertion**

```js
assert(packageJson.scripts['transparent-layer'] === 'node scripts/transparent-layer.js', 'package.json missing transparent-layer script');
```

- [ ] **Step 3: Add document contract assertions after the existing flood-cutout document assertions**

```js
assert(skillBody.includes('## Transparent Layer Generation'), 'skill must document transparent layer generation');
assert(skillBody.includes('npm run transparent-layer'), 'skill must document transparent-layer command');
assert(skillBody.includes('prompt.md'), 'skill must require transparent layer prompt output');
assert(skillBody.includes('request.json'), 'skill must require transparent layer request output');
assert(skillBody.includes('same-canvas.png'), 'skill must require same-canvas transparent layer output');
assert(skillBody.includes('bbox.png'), 'skill must require bbox transparent layer output');
assert(skillBody.includes('transparent-layer-report.json'), 'skill must require transparent layer report output');
assert(skillBody.includes('prompt_only'), 'skill must document prompt-only fallback status');
assert(skillBody.includes('--local-cleanup'), 'skill must keep flood cleanup explicit');
```

- [ ] **Step 4: Add direct module imports before the flood fixture block near the bottom of `test.js`**

Place these lines before `const floodInputPath = ...`:

```js
const { auditTransparentLayer } = require('./utils/transparent-layer-audit');
const { buildTransparentLayerRequest, renderTransparentLayerPrompt } = require('./utils/transparent-layer-request');
```

- [ ] **Step 5: Run the test and verify it fails on missing files**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image/skills/text2html-image
npm test
```

Expected output includes one of:

```text
missing package script target scripts/transparent-layer.js
```

or:

```text
Cannot find module './utils/transparent-layer-audit'
```

- [ ] **Step 6: Do not commit in this planning turn**

The current user request is to write the plan without submitting it. During later implementation, commit only if the user explicitly asks for commits or chooses an execution flow that includes commit checkpoints.

## Task 2: Implement The Transparent Layer Audit Core

**Files:**
- Create: `skills/text2html-image/scripts/utils/transparent-layer-audit.js`
- Modify: `skills/text2html-image/scripts/test.js`

- [ ] **Step 1: Add synthetic PNG tests for audit behavior in `scripts/test.js`**

Place this block after `getPixel()` is defined, so it can reuse `setPixel()` and `getPixel()`:

```js
function createTransparentFixture(width, height) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      setPixel(png, x, y, [0, 0, 0, 0]);
    }
  }
  return png;
}

const goodLayer = createTransparentFixture(12, 12);
for (let y = 4; y <= 7; y += 1) {
  for (let x = 4; x <= 7; x += 1) {
    setPixel(goodLayer, x, y, [30, 120, 190, 255]);
  }
}
const goodAudit = auditTransparentLayer(goodLayer, {
  expectedWidth: 12,
  expectedHeight: 12,
  label: 'same-canvas',
});
assert(goodAudit.status === 'pass', `good transparent layer should pass: ${goodAudit.review_flags.join('; ')}`);
assert(goodAudit.alpha.transparent_pixels > 0, 'good layer should include transparent pixels');
assert(goodAudit.alpha.opaque_pixels > 0, 'good layer should include opaque pixels');
assert(goodAudit.opaque_bbox.width === 4 && goodAudit.opaque_bbox.height === 4, 'good layer should report tight opaque bbox');

const grayBackedLayer = createTransparentFixture(12, 12);
for (let y = 0; y < 12; y += 1) {
  for (let x = 0; x < 12; x += 1) {
    setPixel(grayBackedLayer, x, y, [236, 236, 236, 255]);
  }
}
for (let y = 4; y <= 7; y += 1) {
  for (let x = 4; x <= 7; x += 1) {
    setPixel(grayBackedLayer, x, y, [30, 120, 190, 255]);
  }
}
const grayAudit = auditTransparentLayer(grayBackedLayer, {
  expectedWidth: 12,
  expectedHeight: 12,
  label: 'same-canvas',
});
assert(grayAudit.status === 'needs_review', 'gray-backed layer should need review');
assert(grayAudit.review_flags.includes('no_transparent_pixels'), 'gray-backed layer should flag missing transparency');
assert(grayAudit.review_flags.includes('opaque_bbox_fills_canvas'), 'gray-backed layer should flag full-canvas opaque bbox');
assert(grayAudit.review_flags.includes('nontransparent_canvas_edge'), 'gray-backed layer should flag nontransparent edge');

const partialEdgeLayer = createTransparentFixture(12, 12);
for (let y = 4; y <= 7; y += 1) {
  for (let x = 4; x <= 7; x += 1) {
    setPixel(partialEdgeLayer, x, y, [40, 90, 160, 255]);
  }
}
for (let x = 3; x <= 8; x += 1) {
  setPixel(partialEdgeLayer, x, 3, [40, 90, 160, 96]);
  setPixel(partialEdgeLayer, x, 8, [40, 90, 160, 96]);
}
for (let y = 3; y <= 8; y += 1) {
  setPixel(partialEdgeLayer, 3, y, [40, 90, 160, 96]);
  setPixel(partialEdgeLayer, 8, y, [40, 90, 160, 96]);
}
const partialAudit = auditTransparentLayer(partialEdgeLayer, {
  expectedWidth: 12,
  expectedHeight: 12,
  label: 'same-canvas',
  partialAlphaRiskRatio: 0.1,
});
assert(partialAudit.status === 'needs_review', 'partial-alpha edge layer should need review');
assert(partialAudit.review_flags.includes('partial_alpha_edge_risk'), 'partial-alpha edge layer should flag edge risk');
```

- [ ] **Step 2: Run the test and verify it fails because the audit module is missing**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image/skills/text2html-image
npm test
```

Expected output includes:

```text
Cannot find module './utils/transparent-layer-audit'
```

- [ ] **Step 3: Create `scripts/utils/transparent-layer-audit.js`**

```js
function pixelOffset(width, x, y) {
  return (width * y + x) << 2;
}

function readAlpha(png, x, y) {
  return png.data[pixelOffset(png.width, x, y) + 3];
}

function countAlpha(png) {
  const alpha = {
    transparent_pixels: 0,
    opaque_pixels: 0,
    partial_alpha_pixels: 0,
    total_pixels: png.width * png.height,
  };
  for (let index = 3; index < png.data.length; index += 4) {
    const value = png.data[index];
    if (value === 0) alpha.transparent_pixels += 1;
    else if (value === 255) alpha.opaque_pixels += 1;
    else alpha.partial_alpha_pixels += 1;
  }
  return alpha;
}

function opaqueBounds(png) {
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (readAlpha(png, x, y) === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < 0 || maxY < 0) return null;
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    right: maxX,
    bottom: maxY,
    area: (maxX - minX + 1) * (maxY - minY + 1),
  };
}

function edgeAlphaCounts(png) {
  let nontransparent = 0;
  let partial = 0;
  let total = 0;
  function visit(x, y) {
    const value = readAlpha(png, x, y);
    total += 1;
    if (value > 0) nontransparent += 1;
    if (value > 0 && value < 255) partial += 1;
  }
  for (let x = 0; x < png.width; x += 1) {
    visit(x, 0);
    if (png.height > 1) visit(x, png.height - 1);
  }
  for (let y = 1; y < png.height - 1; y += 1) {
    visit(0, y);
    if (png.width > 1) visit(png.width - 1, y);
  }
  return {
    total_edge_pixels: total,
    nontransparent_edge_pixels: nontransparent,
    partial_alpha_edge_pixels: partial,
  };
}

function touchesCanvasEdge(bounds, width, height) {
  if (!bounds) return false;
  return bounds.x === 0 || bounds.y === 0 || bounds.right === width - 1 || bounds.bottom === height - 1;
}

function auditTransparentLayer(png, options = {}) {
  const expectedWidth = Number(options.expectedWidth || png.width);
  const expectedHeight = Number(options.expectedHeight || png.height);
  const partialAlphaRiskRatio = Number(options.partialAlphaRiskRatio ?? 0.08);
  const reviewFlags = [];
  const errors = [];
  if (png.width !== expectedWidth || png.height !== expectedHeight) {
    errors.push('dimension_mismatch');
  }
  const alpha = countAlpha(png);
  const bounds = opaqueBounds(png);
  const edge = edgeAlphaCounts(png);
  if (!bounds) reviewFlags.push('no_visible_subject');
  if (alpha.transparent_pixels === 0) reviewFlags.push('no_transparent_pixels');
  if (bounds && bounds.width === png.width && bounds.height === png.height) {
    reviewFlags.push('opaque_bbox_fills_canvas');
  }
  if (edge.nontransparent_edge_pixels > 0) reviewFlags.push('nontransparent_canvas_edge');
  if (touchesCanvasEdge(bounds, png.width, png.height)) reviewFlags.push('subject_touches_canvas_edge');
  const partialRatio = alpha.partial_alpha_pixels / Math.max(1, alpha.total_pixels);
  if (partialRatio > partialAlphaRiskRatio || edge.partial_alpha_edge_pixels > 0) {
    reviewFlags.push('partial_alpha_edge_risk');
  }
  const status = errors.length ? 'failed' : (reviewFlags.length ? 'needs_review' : 'pass');
  return {
    label: options.label || 'transparent-layer',
    status,
    width: png.width,
    height: png.height,
    expected_width: expectedWidth,
    expected_height: expectedHeight,
    alpha,
    opaque_bbox: bounds,
    edge,
    partial_alpha_ratio: Number(partialRatio.toFixed(6)),
    review_flags: reviewFlags,
    errors,
  };
}

module.exports = {
  auditTransparentLayer,
  countAlpha,
  opaqueBounds,
  edgeAlphaCounts,
};
```

- [ ] **Step 4: Run the test and verify audit assertions pass or advance to the next expected failure**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image/skills/text2html-image
npm test
```

Expected output now advances past audit assertions and fails on the missing request module or missing CLI script:

```text
Cannot find module './utils/transparent-layer-request'
```

or:

```text
missing package script target scripts/transparent-layer.js
```

## Task 3: Implement Request And Prompt Rendering

**Files:**
- Create: `skills/text2html-image/scripts/utils/transparent-layer-request.js`
- Modify: `skills/text2html-image/scripts/test.js`

- [ ] **Step 1: Add request and prompt tests in `scripts/test.js`**

Place this block after the audit tests:

```js
const transparentRequest = buildTransparentLayerRequest({
  assetId: 'Africa Map Layer',
  source: floodInputPath,
  width: 1404,
  height: 1064,
  subject: 'Africa map silhouette with warm regional highlights',
  placement: 'same position as the reference image, transparent outside the map',
});
assert(transparentRequest.asset_id === 'africa-map-layer', 'asset id should be normalized');
assert(transparentRequest.canvas.width === 1404, 'request should preserve canvas width');
assert(transparentRequest.canvas.height === 1064, 'request should preserve canvas height');
assert(transparentRequest.expected_outputs.some((item) => item.name === 'same-canvas.png'), 'request should include same-canvas output');
assert(transparentRequest.expected_outputs.some((item) => item.name === 'bbox.png'), 'request should include bbox output');
assert(transparentRequest.negative_constraints.includes('No poster title, CTA, price, legal copy, labels, or other localized text inside the PNG.'), 'request should forbid flattened text');
const transparentPrompt = renderTransparentLayerPrompt(transparentRequest);
assert(transparentPrompt.includes('Canvas: 1404 x 1064 px'), 'prompt should include canvas size');
assert(transparentPrompt.includes('same-canvas.png'), 'prompt should name same-canvas output');
assert(transparentPrompt.includes('bbox.png'), 'prompt should name bbox output');
assert(transparentPrompt.includes('transparent background'), 'prompt should require transparent background');
assert(transparentPrompt.includes('No white, gray, beige, or colored matte background'), 'prompt should forbid matte backgrounds');
```

- [ ] **Step 2: Run the test and verify it fails because the request module is missing**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image/skills/text2html-image
npm test
```

Expected output includes:

```text
Cannot find module './utils/transparent-layer-request'
```

- [ ] **Step 3: Create `scripts/utils/transparent-layer-request.js`**

```js
const path = require('path');

function sanitizeAssetId(value, fallback = 'transparent-layer') {
  const words = String(value || fallback).trim().toLowerCase().match(/[a-z0-9]+/g) || [];
  return words.join('-') || fallback;
}

const DEFAULT_NEGATIVE_CONSTRAINTS = [
  'No poster title, CTA, price, legal copy, labels, or other localized text inside the PNG.',
  'No white, gray, beige, or colored matte background.',
  'No rectangular card background, screenshot frame, or full-canvas opaque fill.',
  'No fake transparency checkerboard.',
  'No glow haze that only works on a white background.',
  'No extra icons, characters, landmarks, QR codes, or logos that are not requested.',
];

function splitList(value) {
  if (!value) return [];
  return String(value)
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildTransparentLayerRequest(input = {}) {
  const assetId = sanitizeAssetId(input.assetId || input['asset-id']);
  const width = Number(input.width);
  const height = Number(input.height);
  if (!width || !height) throw new Error('transparent-layer requires numeric width and height');
  const subject = String(input.subject || '').trim();
  if (!subject) throw new Error('transparent-layer requires --subject');
  const placement = String(input.placement || 'Place the subject at the final intended canvas position.').trim();
  const extraNegative = splitList(input.negative || input['negative-constraint']);
  const source = input.source ? path.resolve(String(input.source)) : undefined;
  return {
    mode: 'transparent-layer-generation',
    asset_id: assetId,
    source,
    canvas: { width, height },
    subject,
    placement,
    transparent_background: true,
    expected_outputs: [
      {
        name: 'same-canvas.png',
        description: 'Full target canvas size with transparent background and subject already placed at final coordinates.',
        width,
        height,
      },
      {
        name: 'bbox.png',
        description: 'Tightly cropped transparent PNG containing only the requested subject and natural edge alpha.',
      },
    ],
    negative_constraints: [...DEFAULT_NEGATIVE_CONSTRAINTS, ...extraNegative],
  };
}

function renderTransparentLayerPrompt(request) {
  return [
    '# Transparent Layer Generation Prompt',
    '',
    'Create transparent PNG layer assets for compositing into an editable HTML/CSS poster.',
    '',
    `Canvas: ${request.canvas.width} x ${request.canvas.height} px`,
    `Subject: ${request.subject}`,
    `Placement: ${request.placement}`,
    request.source ? `Reference source: ${request.source}` : 'Reference source: use the provided image in the current chat or generation context.',
    '',
    'Required outputs:',
    '',
    '1. `same-canvas.png`: exact full canvas dimensions, transparent background, subject placed at final coordinates.',
    '2. `bbox.png`: tight transparent crop around the same subject, preserving natural subject edges.',
    '',
    'Transparency requirements:',
    '',
    '- Use a real transparent background with alpha channel.',
    '- Exterior pixels outside the subject must have alpha 0.',
    '- No white, gray, beige, or colored matte background.',
    '- No fake checkerboard transparency.',
    '- Natural antialiasing is acceptable only on the subject boundary.',
    '',
    'Do not include:',
    '',
    ...request.negative_constraints.map((item) => `- ${item}`),
    '',
    'Return or save PNG files only. Do not flatten poster text into the generated layer.',
    '',
  ].join('\n');
}

module.exports = {
  DEFAULT_NEGATIVE_CONSTRAINTS,
  buildTransparentLayerRequest,
  renderTransparentLayerPrompt,
  sanitizeAssetId,
};
```

- [ ] **Step 4: Run the test and verify request/prompt assertions pass or advance to CLI failures**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image/skills/text2html-image
npm test
```

Expected output includes:

```text
missing package script target scripts/transparent-layer.js
```

or:

```text
package.json missing transparent-layer script
```

## Task 4: Implement CLI Prompt Package And Supplied Output Audit

**Files:**
- Create: `skills/text2html-image/scripts/transparent-layer.js`
- Modify: `skills/text2html-image/package.json`
- Modify: `skills/text2html-image/scripts/test.js`

- [ ] **Step 1: Add the npm script in `package.json`**

Add `transparent-layer` after `flood-cutout`:

```json
"transparent-layer": "node scripts/transparent-layer.js",
```

- [ ] **Step 2: Add CLI prompt-only and audit tests in `scripts/test.js`**

Place this block after the request/prompt tests:

```js
const transparentCliOutput = require('child_process').execFileSync(process.execPath, [
  path.join(ROOT, 'scripts', 'transparent-layer.js'),
  '--project', projectId,
  '--asset-id', 'Africa Map Layer',
  '--source', floodInputPath,
  '--width', '12',
  '--height', '12',
  '--subject', 'Africa map silhouette with warm regional highlights',
  '--placement', 'same position as the reference image, transparent outside the map',
], {
  cwd: ROOT,
  encoding: 'utf8',
});
assert(transparentCliOutput.includes('Transparent layer prompt package written:'), 'transparent-layer should report prompt package path');
assert(transparentCliOutput.includes('Generation status: prompt_only'), 'transparent-layer should report prompt-only status without PNG outputs');
const transparentPackageDir = path.join(projectPaths.working, 'transparent-layers', 'africa-map-layer');
const transparentPromptPath = path.join(transparentPackageDir, 'prompt.md');
const transparentRequestPath = path.join(transparentPackageDir, 'request.json');
const transparentReportPath = path.join(projectPaths.reports, 'transparent-layer-report.json');
assert(fs.existsSync(transparentPromptPath), 'transparent-layer should write prompt.md');
assert(fs.existsSync(transparentRequestPath), 'transparent-layer should write request.json');
assert(fs.existsSync(transparentReportPath), 'transparent-layer should write transparent-layer-report.json');
const transparentCliReport = JSON.parse(fs.readFileSync(transparentReportPath, 'utf8'));
assert(transparentCliReport.asset_id === 'africa-map-layer', 'transparent layer report should preserve asset id');
assert(transparentCliReport.generation_status === 'prompt_only', 'transparent layer report should mark prompt-only status');
assert(transparentCliReport.status === 'prompt_only', 'transparent layer report should use prompt-only overall status');
assert(transparentCliReport.outputs.prompt.endsWith('prompt.md'), 'transparent layer report should include prompt path');
assert(transparentCliReport.outputs.request.endsWith('request.json'), 'transparent layer report should include request path');

const sameCanvasPath = path.join(transparentPackageDir, 'same-canvas.png');
const bboxPath = path.join(transparentPackageDir, 'bbox.png');
fs.writeFileSync(sameCanvasPath, PNG.sync.write(goodLayer));
const bboxLayer = createTransparentFixture(6, 6);
for (let y = 1; y <= 4; y += 1) {
  for (let x = 1; x <= 4; x += 1) {
    setPixel(bboxLayer, x, y, [30, 120, 190, 255]);
  }
}
fs.writeFileSync(bboxPath, PNG.sync.write(bboxLayer));
const transparentAuditOutput = require('child_process').execFileSync(process.execPath, [
  path.join(ROOT, 'scripts', 'transparent-layer.js'),
  '--project', projectId,
  '--asset-id', 'Africa Map Layer',
  '--source', floodInputPath,
  '--width', '12',
  '--height', '12',
  '--subject', 'Africa map silhouette with warm regional highlights',
  '--placement', 'same position as the reference image, transparent outside the map',
  '--same-canvas', sameCanvasPath,
  '--bbox', bboxPath,
], {
  cwd: ROOT,
  encoding: 'utf8',
});
assert(transparentAuditOutput.includes('Generation status: supplied_outputs'), 'transparent-layer should report supplied outputs');
const transparentAuditReport = JSON.parse(fs.readFileSync(transparentReportPath, 'utf8'));
assert(transparentAuditReport.status === 'pass', `supplied transparent outputs should pass: ${JSON.stringify(transparentAuditReport.audits)}`);
assert(transparentAuditReport.audits.same_canvas.status === 'pass', 'same-canvas audit should pass');
assert(transparentAuditReport.audits.bbox.status === 'pass', 'bbox audit should pass');
```

- [ ] **Step 3: Run the test and verify it fails because the CLI is missing**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image/skills/text2html-image
npm test
```

Expected output includes:

```text
missing package script target scripts/transparent-layer.js
```

- [ ] **Step 4: Create `scripts/transparent-layer.js`**

```js
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const { createProjectWorkspace, parseArgs, writeJson } = require('./utils/workflow-core');
const { auditTransparentLayer } = require('./utils/transparent-layer-audit');
const {
  buildTransparentLayerRequest,
  renderTransparentLayerPrompt,
  sanitizeAssetId,
} = require('./utils/transparent-layer-request');

function usage() {
  return [
    'Usage: npm run transparent-layer -- --project <project-id> --asset-id <asset-id> --source <reference.png> --width <px> --height <px> --subject <description> [options]',
    '',
    'Options:',
    '  --subproject      Optional subproject id.',
    '  --placement       Placement instruction for same-canvas.png.',
    '  --same-canvas     Existing generated same-canvas PNG to audit/copy.',
    '  --bbox            Existing generated bbox PNG to audit/copy.',
    '  --negative        Additional negative constraints separated by |.',
    '  --local-cleanup   Explicitly run local flood cleanup on --cleanup-input.',
    '  --cleanup-input   PNG input for local cleanup when --local-cleanup is set.',
  ].join('\n');
}

function copyIfNeeded(source, target) {
  if (!source) return undefined;
  const absolute = path.resolve(String(source));
  if (!fs.existsSync(absolute)) throw new Error(`PNG output not found: ${absolute}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (path.resolve(absolute) !== path.resolve(target)) fs.copyFileSync(absolute, target);
  return target;
}

function auditPng(filePath, options) {
  const png = PNG.sync.read(fs.readFileSync(filePath));
  return auditTransparentLayer(png, options);
}

function summarizeStatus(generationStatus, audits) {
  if (generationStatus === 'prompt_only') return 'prompt_only';
  const auditValues = Object.values(audits).filter(Boolean);
  if (!auditValues.length) return 'prompt_only';
  if (auditValues.some((audit) => audit.status === 'failed')) return 'failed';
  if (auditValues.some((audit) => audit.status === 'needs_review')) return 'needs_review';
  return 'pass';
}

function main() {
  const args = parseArgs();
  if (args.help || !args.project || !args['asset-id'] || !args.width || !args.height || !args.subject) {
    console.error(usage());
    process.exit(args.help ? 0 : 1);
  }

  const projectPaths = createProjectWorkspace(args.project, { subprojectId: args.subproject });
  const assetId = sanitizeAssetId(args['asset-id']);
  const packageDir = path.join(projectPaths.working, 'transparent-layers', assetId);
  fs.mkdirSync(packageDir, { recursive: true });

  const request = buildTransparentLayerRequest({
    assetId,
    source: args.source,
    width: args.width,
    height: args.height,
    subject: args.subject,
    placement: args.placement,
    negative: args.negative,
  });
  const prompt = renderTransparentLayerPrompt(request);
  const promptPath = path.join(packageDir, 'prompt.md');
  const requestPath = path.join(packageDir, 'request.json');
  fs.writeFileSync(promptPath, prompt);
  writeJson(requestPath, request);

  const sameCanvasPath = path.join(packageDir, 'same-canvas.png');
  const bboxPath = path.join(packageDir, 'bbox.png');
  const copiedSameCanvas = copyIfNeeded(args['same-canvas'], sameCanvasPath);
  const copiedBbox = copyIfNeeded(args.bbox, bboxPath);
  const audits = {};
  if (copiedSameCanvas) {
    audits.same_canvas = auditPng(copiedSameCanvas, {
      expectedWidth: request.canvas.width,
      expectedHeight: request.canvas.height,
      label: 'same-canvas',
    });
  }
  if (copiedBbox) {
    audits.bbox = auditPng(copiedBbox, {
      expectedWidth: undefined,
      expectedHeight: undefined,
      label: 'bbox',
    });
  }
  const generationStatus = copiedSameCanvas || copiedBbox ? 'supplied_outputs' : 'prompt_only';
  const status = summarizeStatus(generationStatus, audits);
  const report = {
    generated_at: new Date().toISOString(),
    project_id: projectPaths.project_id,
    subproject_id: projectPaths.subproject_id,
    asset_id: assetId,
    status,
    generation_status: generationStatus,
    package_dir: packageDir,
    request,
    outputs: {
      prompt: promptPath,
      request: requestPath,
      same_canvas: copiedSameCanvas,
      bbox: copiedBbox,
    },
    audits,
  };
  const reportPath = path.join(projectPaths.reports, 'transparent-layer-report.json');
  writeJson(reportPath, report);
  console.log(`Transparent layer prompt package written: ${packageDir}`);
  console.log(`Prompt: ${promptPath}`);
  console.log(`Request: ${requestPath}`);
  console.log(`Report: ${reportPath}`);
  console.log(`Generation status: ${generationStatus}`);
  console.log(`Status: ${status}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
```

- [ ] **Step 5: Run the test and verify prompt-only plus supplied-output paths pass**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image/skills/text2html-image
npm test
```

Expected output advances to the remaining documentation assertion failures:

```text
skill must document transparent layer generation
```

or finishes later after docs are updated.

## Task 5: Add Explicit Local Cleanup Integration

**Files:**
- Modify: `skills/text2html-image/scripts/transparent-layer.js`
- Modify: `skills/text2html-image/scripts/test.js`

- [ ] **Step 1: Add a local cleanup test in `scripts/test.js`**

Place this block after the supplied-output audit test:

```js
const cleanupOutput = require('child_process').execFileSync(process.execPath, [
  path.join(ROOT, 'scripts', 'transparent-layer.js'),
  '--project', projectId,
  '--asset-id', 'Cleanup Layer',
  '--source', floodInputPath,
  '--width', '12',
  '--height', '12',
  '--subject', 'blue square foreground from the fixture',
  '--placement', 'same position as the reference fixture',
  '--local-cleanup',
  '--cleanup-input', floodInputPath,
], {
  cwd: ROOT,
  encoding: 'utf8',
});
assert(cleanupOutput.includes('Local cleanup: completed'), 'transparent-layer should report explicit local cleanup');
const cleanupPackageDir = path.join(projectPaths.working, 'transparent-layers', 'cleanup-layer');
assert(fs.existsSync(path.join(cleanupPackageDir, 'local-cleanup-transparent.png')), 'local cleanup should write transparent PNG');
assert(fs.existsSync(path.join(cleanupPackageDir, 'local-cleanup-mask-debug.png')), 'local cleanup should write mask debug PNG');
const cleanupReport = JSON.parse(fs.readFileSync(transparentReportPath, 'utf8'));
assert(cleanupReport.local_cleanup?.enabled === true, 'report should mark local cleanup enabled');
assert(cleanupReport.local_cleanup?.report?.mode === 'edge-flood', 'report should include flood cleanup report');
assert(cleanupReport.generation_status === 'prompt_only', 'local cleanup should not pretend image generation succeeded');
```

- [ ] **Step 2: Run the test and verify it fails because local cleanup is not wired**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image/skills/text2html-image
npm test
```

Expected output includes:

```text
transparent-layer should report explicit local cleanup
```

- [ ] **Step 3: Update `scripts/transparent-layer.js` imports**

Add the flood cleanup import near the other imports:

```js
const { applyFloodCutout } = require('./utils/flood-cutout-core');
```

- [ ] **Step 4: Add local cleanup helpers in `transparent-layer.js` before `main()`**

```js
function runLocalCleanup(args, packageDir) {
  if (!args['local-cleanup']) return { enabled: false };
  if (!args['cleanup-input']) throw new Error('--local-cleanup requires --cleanup-input');
  const cleanupInput = path.resolve(String(args['cleanup-input']));
  if (!fs.existsSync(cleanupInput)) throw new Error(`Cleanup input not found: ${cleanupInput}`);
  const inputPng = PNG.sync.read(fs.readFileSync(cleanupInput));
  const result = applyFloodCutout(inputPng, {
    tolerance: args.tolerance,
    glowTolerance: args['glow-tolerance'],
    edgeCleanup: args['edge-cleanup'],
  });
  const outputPath = path.join(packageDir, 'local-cleanup-transparent.png');
  const maskPath = path.join(packageDir, 'local-cleanup-mask-debug.png');
  fs.writeFileSync(outputPath, PNG.sync.write(result.output));
  fs.writeFileSync(maskPath, PNG.sync.write(result.maskPng));
  return {
    enabled: true,
    input: cleanupInput,
    output: outputPath,
    mask: maskPath,
    report: result.report,
  };
}
```

- [ ] **Step 5: Call local cleanup from `main()` after prompt/request writing**

Add this line after `writeJson(requestPath, request);`:

```js
  const localCleanup = runLocalCleanup(args, packageDir);
```

Add `local_cleanup: localCleanup,` to the `report` object:

```js
    local_cleanup: localCleanup,
```

Add this console output before the final status lines:

```js
  if (localCleanup.enabled) console.log('Local cleanup: completed');
```

- [ ] **Step 6: Run the test and verify local cleanup passes**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image/skills/text2html-image
npm test
```

Expected output advances to documentation failures or full pass after docs are updated.

## Task 6: Update Skill Documentation And Stage Rules

**Files:**
- Modify: `skills/text2html-image/SKILL.md`
- Modify: `skills/text2html-image/references/stage-guides.md`
- Modify: `skills/text2html-image/references/six-phase-contract.md`
- Modify: `skills/text2html-image/scripts/test.js`

- [ ] **Step 1: Replace the top-level flood-cutout guidance in `SKILL.md` with generation-first guidance**

In `skills/text2html-image/SKILL.md`, insert this section before the existing `## Flood Cutout Asset Cleanup` section:

```markdown
## Transparent Layer Generation

When a bitmap layer must sit over editable HTML/CSS, prefer a generated transparent layer package before attempting aggressive local cutout. This is the default path for complex maps, characters, landmarks, devices, stickers, and illustrated backgrounds where flood fill can erase subject pixels or leave a gray matte.

Use this command from the skill root:

```bash
npm run transparent-layer -- \
  --project <project-id> \
  --asset-id <asset-id> \
  --source <reference.png> \
  --width <canvas-width> \
  --height <canvas-height> \
  --subject "<subject to generate>" \
  --placement "<same-canvas placement rule>"
```

Required package outputs:

- `prompt.md`: copyable ChatGPT Images / Codex Images prompt contract.
- `request.json`: structured source, subject, canvas, placement, negative constraints, and expected outputs.
- `same-canvas.png`: full target canvas transparent PNG with the subject already placed at final coordinates when generation output is available.
- `bbox.png`: tightly cropped transparent PNG of the same subject when generation output is available.
- `transparent-layer-report.json`: prompt package status, generation status, output paths, audit results, and review flags.

`prompt_only` is a valid status when image generation is not available in the current runtime. Do not call this a finished transparent asset until generated or supplied PNGs are audited. If Codex image generation is available, use `prompt.md` to generate `same-canvas.png` and `bbox.png`, save them in the package folder, then rerun `npm run transparent-layer` with `--same-canvas <path>` and `--bbox <path>` to audit them.

Use `--local-cleanup --cleanup-input <source.png>` only when the input is already close to a valid transparent layer and needs minor exterior cleanup. Do not increase flood tolerance repeatedly on complex art; return to the generation prompt contract when cleanup reports warnings or the mask debug shows subject damage.
```

Then adjust the first sentence under `## Flood Cutout Asset Cleanup` to:

```markdown
Flood cutout is a local cleanup fallback, not the default path for complex transparent art generation.
```

- [ ] **Step 2: Update `references/stage-guides.md` asset preparation bullets**

Replace the current flood-first bullet with:

```markdown
- For complex bitmap layers, run `npm run transparent-layer -- --project <project-id> --asset-id <asset-id> --source <reference.png> --width <w> --height <h> --subject "<subject>" --placement "<placement>"` and keep `prompt.md`, `request.json`, `same-canvas.png`, `bbox.png`, and `transparent-layer-report.json` when outputs exist.
- Use `npm run flood-cutout -- --input <source.png>` only as explicit local cleanup for a near-valid transparent layer, or through `npm run transparent-layer -- --local-cleanup --cleanup-input <source.png>`.
```

- [ ] **Step 3: Update `references/six-phase-contract.md` external service boundary**

Replace the current external service boundary paragraph with:

```markdown
GPT Images 2, ChatGPT Images, Codex image generation, and other image-generation services are optional external producers for assets. A phase may use them only when the user provides context or explicitly asks for live generation. The local `transparent-layer` CLI always keeps a runnable prompt package and never hardcodes image API credentials. Without live generation, record `prompt_only` and keep the workflow runnable with local placeholders or supplied PNGs.
```

- [ ] **Step 4: Run documentation contract tests**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image/skills/text2html-image
npm test
```

Expected output either passes or points to a missing exact phrase from the contract assertions.

## Task 7: Final Verification And Handoff

**Files:**
- Verify: `skills/text2html-image/scripts/test.js`
- Verify: `skills/text2html-image/package.json`
- Verify: `skills/text2html-image/SKILL.md`
- Verify: `skills/text2html-image/references/stage-guides.md`
- Verify: `skills/text2html-image/references/six-phase-contract.md`

- [ ] **Step 1: Run full test suite**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image/skills/text2html-image
npm test
```

Expected output:

```text
Tests passed. Generated 3 preview(s).
```

The generated preview count may be higher if `copy_master.json` has more active rows, but the command must exit `0`.

- [ ] **Step 2: Run prompt-only CLI smoke test on a clean asset id**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image/skills/text2html-image
npm run transparent-layer -- \
  --project transparent-layer-smoke \
  --asset-id smoke-map-layer \
  --width 320 \
  --height 180 \
  --subject "simple blue travel map silhouette" \
  --placement "centered in the canvas with transparent space around the subject"
```

Expected output includes:

```text
Transparent layer prompt package written:
Generation status: prompt_only
Status: prompt_only
```

Verify these files exist under `~/Documents/text2html-image-project/transparent-layer-smoke/`:

```text
working/transparent-layers/smoke-map-layer/prompt.md
working/transparent-layers/smoke-map-layer/request.json
reports/transparent-layer-report.json
```

- [ ] **Step 3: Inspect the smoke report**

Run:

```bash
node - <<'NODE'
const fs = require('fs');
const os = require('os');
const path = require('path');
const report = path.join(os.homedir(), 'Documents', 'text2html-image-project', 'transparent-layer-smoke', 'reports', 'transparent-layer-report.json');
const data = JSON.parse(fs.readFileSync(report, 'utf8'));
console.log(JSON.stringify({
  status: data.status,
  generation_status: data.generation_status,
  has_prompt: Boolean(data.outputs.prompt),
  has_request: Boolean(data.outputs.request),
}, null, 2));
NODE
```

Expected output:

```json
{
  "status": "prompt_only",
  "generation_status": "prompt_only",
  "has_prompt": true,
  "has_request": true
}
```

- [ ] **Step 4: Review git diff without committing**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image
git status --short
git diff -- docs/superpowers/plans/2026-06-25-transparent-layer-generation.md skills/text2html-image/package.json skills/text2html-image/scripts/test.js skills/text2html-image/scripts/transparent-layer.js skills/text2html-image/scripts/utils/transparent-layer-audit.js skills/text2html-image/scripts/utils/transparent-layer-request.js skills/text2html-image/SKILL.md skills/text2html-image/references/stage-guides.md skills/text2html-image/references/six-phase-contract.md
```

Expected status includes only files touched by this feature plus ignored runtime outputs under `~/Documents/text2html-image-project`, which are outside the repo. Do not commit unless the user asks for a commit.

## Self-Review

- Spec coverage: The plan covers generation-first transparent layer package creation, prompt-only fallback, same-canvas and bbox output contracts, local alpha audit, explicit `--local-cleanup`, documentation updates, and full test verification.
- Placeholder scan: The plan contains concrete paths, commands, code snippets, and expected outputs. It intentionally avoids unresolved placeholder sections.
- Type consistency: The same names are used throughout: `transparent-layer.js`, `transparent-layer-audit.js`, `transparent-layer-request.js`, `buildTransparentLayerRequest`, `renderTransparentLayerPrompt`, `auditTransparentLayer`, `prompt_only`, `same-canvas.png`, `bbox.png`, and `transparent-layer-report.json`.
- Scope check: The work is a single implementation plan. It does not rework the HTML renderer, does not replace `flood-cutout`, and does not introduce API-key based image generation into the local runtime.
