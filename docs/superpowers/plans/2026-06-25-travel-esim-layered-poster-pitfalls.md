# Travel eSIM Layered Poster Pitfalls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Travel eSIM 流量查询海报拆层过程中踩到的透明抠图、二维码、手机 UI 遮挡、输出路径和翻译溢出问题，沉淀回 `text2html-image` Skill 的长期规则与测试合同。

**Architecture:** 这次回写不新增运行时代码，只更新 Skill 文档和文档合同测试。规则进入 `skills/text2html-image/SKILL.md`，测试用 `scripts/test.js` 锁住关键短语，避免后续维护时把这些经验删掉。

**Tech Stack:** Markdown, Node.js CommonJS test runner, existing `npm test`, existing `text2html-image` skill package.

---

## File Structure

- Modify: `skills/text2html-image/SKILL.md`
  - 新增 `Phone Poster Layering Pitfalls`，记录手机海报拆层和交付路径规则。
  - 扩展 `Completion Contract`，要求回报图片路径、二维码裁切、手机安全区和翻译溢出检查。
  - 扩展 `Stop Conditions`，把二维码丢失、输出路径断裂、手机内容遮挡和半透明黑边列为阻断项。
- Modify: `skills/text2html-image/scripts/test.js`
  - 在现有 Skill 文档合同断言中加入关键短语检查。
- Create: `docs/superpowers/plans/2026-06-25-travel-esim-layered-poster-pitfalls.md`
  - 保存本次回写计划和审计路径。

## Task 1: 锁定 Skill 文档合同测试

**Files:**
- Modify: `skills/text2html-image/scripts/test.js`

- [x] **Step 1: 在 `skillBody` 断言区加入手机海报规则检查**

Add these assertions after the existing layered PNG/i18n assertions:

```js
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
assert(skillBody.includes('Device screen UI is partially hidden'), 'stop conditions must catch phone UI occlusion');
```

- [x] **Step 2: Run the targeted contract check**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image/skills/text2html-image
npm test
```

Expected if the working tree is healthy:

```text
Tests passed.
```

Expected if unrelated template deletions or existing dirty files are still present:

```text
Error: build did not generate any HTML previews
```

That failure is not caused by the new documentation assertions; it means the repo cannot currently build the expected fixture previews.

## Task 2: 回写手机海报拆层规则

**Files:**
- Modify: `skills/text2html-image/SKILL.md`

- [x] **Step 1: Add `Phone Poster Layering Pitfalls` after `Layered PNG + HTML Pitfalls`**

Insert this section:

```markdown
## Phone Poster Layering Pitfalls

Use these rules for phone-UI travel/eSIM posters and other same-canvas illustrated ads where device mockups, small icon assets, QR codes, and editable marketing copy overlap.

- If a same-canvas layer touches the canvas edge, such as bottom waves, skyline art, or a decorative sticker anchored at the edge, edge-flood cleanup can sample the subject as background or remove almost nothing. Inspect `*-mask-debug.png` whenever `removed_area_ratio_too_low` or `removed_area_ratio_too_high` appears; do not accept the transparent layer until the exterior region is truly transparent or the layer is cropped/padded for safe edge sampling.
- Do not feed feathered or semi-transparent masks into flood cutout as final art. Partial alpha that is not removed can become a dark opaque seam after PNG compositing. Use a hard mask for the removable exterior or explicitly clean near-transparent edge pixels before placing the layer.
- For icon-sized assets inside editable UI, such as the airplane in a `Travel eSIM` pill or the three feature-card icons, prefer inline SVG/CSS recreation. Use a cropped PNG only when texture, painterly shading, or source fidelity matters more than clean editability; verify that the crop has no background matte before shipping.
- QR codes and scannable codes are bitmap truth assets. Crop them from the reference into the project `source/` folder, copy them with the deliverable asset pack, preserve contrast and square geometry, and never redraw, OCR, blur, or scale them through CSS filters.
- Device mockups need a separate `phone safe-area` contract: keep the bezel/shadow, clipped screen background, and DOM screen UI in distinct z-index layers. Scale the phone shell and inner UI together, and verify no card, ring, or QR container is hidden by the shell or by an oversized screen background.
- When enlarging a phone or feature cards to fill white space, preserve translation resilience first. Use `minmax(0, 1fr)`, `min-width: 0`, tight but readable `line-height`, and `overflow-wrap: anywhere` on labels that can expand; avoid one global text scale that makes S8N/localized copy overflow.
- Left-side feature cards must leave the underlying landmark line art intentionally visible. Tighten card height, gap, and padding before moving the card stack down; do not cover skyline/landmark art unless the reference clearly does.
- Detached deliverables may have a different path depth than the workspace. A workspace file such as `html/<group>/index.html` may use `../../source/...`, while `outputs/<deliverable>/html/index.html` may need `../source/...`. Verify every local `img src` by resolving it from the delivered HTML path, not only from the workspace preview.
```

- [x] **Step 2: Extend completion proof requirements**

Add these bullets to `Completion Contract`:

```markdown
- Resolved local image paths from the active HTML path.
- Detached deliverable asset path status, if an `outputs/` copy exists.
- QR/scannable-code crop path and rendered dimensions, when a code appears in the reference.
- Phone safe-area and z-index status, when a device mockup contains editable DOM UI.
- Translation overflow-safety notes for enlarged phone UI, feature cards, or dense labels.
```

- [x] **Step 3: Extend blocking stop conditions**

Add these bullets to `Stop Conditions`:

```markdown
- A semi-transparent mask or partial-alpha cutout creates a dark compositing seam around a layer.
- A QR/scannable code is missing, redrawn, filtered, blurred, or not resolvable from the final delivered HTML.
- A detached `outputs/` HTML copy has broken local image paths after moving files out of the workspace.
- Device screen UI is partially hidden by the phone shell, clipped safe area, oversized internal containers, or incorrect z-index.
- Enlarged phone/card layout has not been checked for S8N or translated-copy overflow.
```

## Task 3: Verify and report repo state

**Files:**
- Read: `skills/text2html-image/SKILL.md`
- Read: `skills/text2html-image/scripts/test.js`
- Read: Git status for `/Users/tashima_meru/Develop/text2html-image`

- [x] **Step 1: Confirm the new phrases exist**

Run:

```bash
rg -n "Phone Poster Layering Pitfalls|same-canvas layer touches the canvas edge|QR codes and scannable codes|outputs/<deliverable>/html/index.html|phone safe-area" /Users/tashima_meru/Develop/text2html-image/skills/text2html-image/SKILL.md /Users/tashima_meru/Develop/text2html-image/skills/text2html-image/scripts/test.js
```

Expected:

```text
SKILL.md:<line>:## Phone Poster Layering Pitfalls
scripts/test.js:<line>:assert(skillBody.includes('## Phone Poster Layering Pitfalls')...
```

- [x] **Step 2: Run `npm test` and classify any failure**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image/skills/text2html-image
npm test
```

Expected healthy result:

```text
Tests passed.
```

If the repository is still missing tracked template fixtures, report the exact assertion and do not claim full package verification.

- [x] **Step 3: Report changed files without reverting unrelated dirty state**

Run:

```bash
git -C /Users/tashima_meru/Develop/text2html-image status --short
```

Expected relevant entries from this plan:

```text
 M skills/text2html-image/SKILL.md
 M skills/text2html-image/scripts/test.js
?? docs/superpowers/plans/2026-06-25-travel-esim-layered-poster-pitfalls.md
```

Other pre-existing modified or deleted files can remain in the status output; do not revert them unless the user explicitly asks.
