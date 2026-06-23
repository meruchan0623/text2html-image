---
name: text2html-image
description: Use when generating, validating, localizing, or exporting editable ecommerce poster/ad images with repo-root HTML/CSS templates, project workspaces, browser screenshots, and multilingual variants.
---

# text2html-image

Use this as the single skill for this repository. It should run from the repo root because `scripts/`, `config/`, `templates/`, `data/`, and `workflow.config.json` are shared runtime resources. If the current working directory is elsewhere, locate or switch to that repo root before using repo commands.

## Core Rule

Produce editable source first. Text, price, CTA, labels, and legal copy must remain HTML/CSS/SVG unless the user explicitly asks for a flattened bitmap.

Generated previews must be 静态 `index.html` plus CSS and assets. Do not add `<script>`, frontend state machines, debug panels, browser automation code, or generated control pages unless the user explicitly asks for an interactive prototype.

Before coding a complex image, decide layer ownership:

- `reference image`: visual target only; do not place it in the page unless the user explicitly approves it as a base asset.
- `base image layer`: complex non-editable visuals such as maps, landmarks, people, dense illustrations, or textured backgrounds.
- `editable text layer`: all user-facing copy, labels, prices, CTAs, legal text, and translatable words.
- `editable vector layer`: simple shapes, icons, borders, pills, progress rings, and other elements that benefit from CSS/SVG editing.
- `debug/report layer`: coordinate reports, recognition overlays, score JSON, and screenshots; never ship these as visible page UI.

For complex maps, landmarks, illustrated backgrounds, or dense visual assets, prefer `base image + editable HTML/SVG overlay` unless the user explicitly asks for full vector recreation.

## Text Editability Contract

Before completion, verify that required text is real editable DOM text:

- Required text is not baked into a raster image.
- Required text is not converted into SVG path outlines.
- Required text is not drawn on a canvas.
- Required text can be selected in the rendered page.
- Localizable text has stable metadata such as `data-i18n-key`.
- Map, region, SKU, or repeated labels have stable business keys such as `data-country-code`, `data-region-code`, or `data-sku`.

For map labels, prefer this pattern:

```html
<span class="map-label" data-country-code="FR" data-i18n-key="country.fr">法國</span>
```

## Fast Path Default

For ordinary requests like creating, recreating, or editing one poster/banner, avoid the full six-stage setup. Read only the minimum working files:

- `data/copy_master.json` for the active content row.
- `templates/<template_id>/master.html` and `master.css` for the target template.
- Any user-provided image paths or local assets needed for the current output.

Then build the preview with `npm run build -- --project <project-id>`. Run QC only after a concrete HTML/CSS change or before export.

## Project Workspace

Runtime files live outside the repo in the current user's Documents folder, grouped directly by image project:

```text
<Documents>/text2html-image-project/<project-id>/
<Documents>/text2html-image-project/<project-id>/<subproject-id>/
├── source/       原始素材和参考图
├── working/      中间文件、草稿、辅助数据
├── html/         可编辑 HTML/CSS 预览
├── screenshots/  浏览器截图
├── scores/       抄图/复刻每轮评分 JSON
├── exports/      最终导出图片目标
└── reports/      build、QC、汇总报告
```

Image project folders must stay shallow and self-contained. Do not place repo configuration, skill files, package files, or global manifests inside image project folders. Keep generator runtime files such as `workflow.config.json`, `package.json`, `scripts/`, `templates/`, and skill source files in the repo only.

Do not generate `project-manifest.json` inside image project folders. If a command needs structured output, write task-specific JSON under `reports/`, `scores/`, or `exports/`.

Default project id is `default`. Prefer an explicit English kebab-case project id. Project and subproject ids are sanitized to lowercase ASCII kebab-case and capped at 20 characters.

Use `--subproject <subproject-id>` when one user job contains multiple page-level image masters that need isolated rounds, screenshots, and exports.

## HTML Grouping

- Same-page or same-master multilingual files must live in one `html/<html-group>/` directory.
- `index.html` is the canonical preview for the group.
- Localized variants use `index.<lang>.html`, for example `index.zh-cn.html`, `index.en-us.html`, `index.ja-jp.html`.
- Prefer an explicit `html_group` field in `data/copy_master.json`; otherwise the script infers one from output/template fields.
- Do not overwrite the only baseline during translation. Keep the canonical HTML and emit separate localized files.

## Map + Table Poster Pitfalls

Use these rules for coverage posters that combine a background map with editable HTML tables, especially multilingual eSIM region maps.

- Decide the source of truth before editing. If the user asks to directly tune generated `html/<html-group>/index*.html`, do not run `npm run build` again until the direct edits are either accepted and backported to templates or intentionally discarded. A rebuild can overwrite generated HTML/CSS changes.
- Keep a clear split between template source and generated workspace. Template fixes belong in `templates/<template_id>/`; emergency visual fixes can be made in the generated `html/<html-group>/` files, but then either sync the same change to every localized `index.<lang>.html` or document that only the canonical preview was edited.
- For multilingual groups, a shared `master.css` does not update per-language asset references. If a map image changes in `index.html`, also grep and replace all `index.*.html` variants before exporting.
- When left and right tables have different row counts, define the row height from the taller table container. For example, set `--coverage-table-height`, derive `--coverage-row-height: calc(var(--coverage-table-height) / 10)`, make the left table use `repeat(10, minmax(0, 1fr))`, and make the right table use the same row height for its 9 rows. Do not let each table auto-size independently.
- Put map imagery in a deterministic layer below the table and above the card surface. A common stack is card background, map `z-index: 2`, title/table/notice `z-index: 3`, with `isolation: isolate` on the card when blending or transparency could leak.
- Prefer a real transparent PNG for map backgrounds. Do not rely on `mix-blend-mode`, heavy CSS filters, or dark full-rectangle screenshots to simulate transparency; they can wash out text, pollute borders, and make exports differ across browsers.
- Center map assets with `left: 50%; top: ...; transform: translate(-50%, -50%)` when the map must align to a table area. Size the map against the table container, not the whole canvas, when the design intent is "behind the table".
- Table borders and map borders need separate tuning. If the map is only a faint context layer, its outline should be visible enough to read as a map but never compete with grid lines or row text.
- CSS specificity can silently break language-specific fixes. When a generic language selector such as `.ja .row strong` overrides a special country rule, increase the special rule specificity, for example `.ja .row [data-country-code="CD"]`.
- Long country names should be handled per language and per country, not by globally shrinking all rows. Keep normal countries at the base size, then add narrow exceptions such as `[data-country-code="CD"]`.
- Chinese variants may need short operational names instead of literal long country names. If the approved copy is `民主剛果` / `民主刚果`, keep it as text data and keep the same row alignment as other countries.
- Font choice is part of layout, not a cosmetic afterthought. Chinese variants should keep the approved CJK stack, Thai may need a Thai UI font and larger size, Japanese often needs lower weight, and English carrier text should stay at the intended medium weight.
- When Figma is available, extract numeric frame metrics instead of matching by eye: canvas size, card x/y/w/h, title x/y/font/line-height, table x/y/w/h, row height, badge size, map x/y/w/h, color tokens, and opacity. Use those numbers as CSS constraints, then visually check exported PNGs.
- If the in-app browser refuses a `file://` URL because of browser policy, do not treat that as a page failure and do not keep retrying. Use static DOM checks and direct Chrome headless screenshots as the verification fallback.
- `npm run batch-export` may be report-oriented depending on the repo state. If actual PNG files are required and the script does not write them, export with Chrome headless against the generated HTML files.
- For higher-resolution export, preserve the CSS layout viewport and increase device scale factor. For a 1404 x 1120 canvas, use `--window-size=1404,1120 --force-device-scale-factor=2` to produce 2808 x 2240 without changing layout.
- After direct workspace edits, export from the generated HTML paths only. Do not rebuild first unless the goal is to test template regeneration.

## Multilingual Copy-Recreation Pipeline Pitfalls

Use these rules when opening a full multilingual copy-recreation pipeline from reference images into multiple editable HTML files and PNG exports.

- Verify the reference canvas from the actual image dimensions before choosing a target size. Do not assume platform defaults such as 1600 x 1200 when the reference layout is 1404 x 1120.
- If a template needs many custom copy fields, confirm the renderer supports arbitrary row fields before designing the template. If it only supports a fixed schema, make the smallest compatible renderer change so country names, carriers, and language-specific fields stay in `copy_master` instead of being hard-coded.
- Treat `html_group` as the contract for batch multilingual output. All localized pages for one visual should land under one `html/<html-group>/` directory with one shared CSS file and stable `index.<lang>.html` names.
- Build scripts may render old sample rows in addition to the active project rows. When that happens, scope review, QC interpretation, export, and final delivery to the intended `html_group` rather than every preview printed by `npm run build`.
- Do not assume `npm run batch-export` writes PNG files. Check what it actually produces. If it only writes a manifest/report, use a local export helper or Chrome headless screenshots for real image output.
- Playwright being installed does not mean its browser binary is available. If Playwright fails because the cached Chromium executable is missing, prefer an installed system browser such as Google Chrome or Microsoft Edge before changing HTML/CSS.
- Keep one-off export helpers outside shared repo scripts unless the behavior is generally useful. A temporary helper can live in the task workspace `work/`, while durable export behavior should be promoted intentionally later.
- Always run both page-level and cell-level overflow checks for dense multilingual tables. A page can have no scrollbars while individual cells still overflow their columns.
- For local cell overflow detection, compare the text element bounding box with its parent cell, not only `document.scrollWidth` or page scrollbars.
- Do not rely on `scrollHeight / lineHeight` to count visual lines in flex table cells; it can misreport centered single-line flex content. Use `Range.getClientRects()` or explicit span counts when checking real line breaks.
- For long country names, decide early between single-line shrinking and semantic line breaks. Switching late can leave conflicting CSS rules, over-small fonts, or hidden overflow.
- Do not put raw `<br>` in copy data if the renderer escapes HTML. Either add safe structured fields such as `country_cd_line1`, `country_cd_line2`, `country_cd_line3`, or implement a narrow safe token transform that does not allow arbitrary HTML.
- A newline character inside a flex item may still render as one visual line. If semantic line breaks must be guaranteed, render explicit child spans and style the country cell as a vertical flex column.
- Semantic line breaks are language-specific. Chinese, Japanese, and Korean may need two segments; Thai may need three shorter segments with its own line-height; English and Russian may remain single-line or use different abbreviations.
- Avoid globally shrinking all country names to solve one long label. Keep the base language size readable, then add per-language/per-country exceptions or explicit semantic segments.
- Map color tweaks through CSS filters can be iterative and unstable. Record whether the desired direction is "more blue", "lighter", "closer to 4G/5G badge", or "less dominant", then verify against exports rather than filter values alone.
- When syncing final deliverables to an `outputs/` folder, make the HTML self-contained for preview. Copy required assets next to the HTML or rewrite asset paths so the output directory can be opened independently from the project workspace.
- After every rebuild that changes HTML structure, resync the latest HTML, CSS, assets, and export reports to the deliverable folder. A stale copied HTML folder can make final outputs disagree with project previews.
- Report DOM contracts along with images: canvas size, script count, image count, i18n node count, business key count, scrollbar status, and any language-specific exceptions. These checks catch regressions that visual review can miss.

## Escalation Triggers

Read `workflow.config.json` or the references only when the request needs the full workflow:

- Multi-language generation or batch export.
- Platform specs, safe areas, canvas presets, or export limits.
- Asset library metadata, five-view character packs, or external image generation.
- QC failures, layout stability review, or handoff documentation.
- Adding/changing workflow phases, data contracts, template token rules, or project workspace rules.
- Direct PNG export, render profile failures, or final delivery verification.

Reference paths are relative to this skill directory, not the caller's current working directory.

## Six Stages

| Stage | Primary output |
| --- | --- |
| 1. 资产准备 | asset index, color palette, SVG specs |
| 2. 布局指定 | `layout.json`, template choice, safe-area map |
| 3. 细节指定 | editable HTML/CSS/SVG details |
| 4. 细节修改 | scoped revision record and updated source |
| 5. 布局稳固性审核 | QC report, stability score, fix list |
| 6. 多语言化 | localized previews and export report |

Reference routing:

- Read `references/six-phase-contract.md` only for phase gates, data handoffs, and external service boundaries.
- Read `references/stage-guides.md` only for stage-specific rules, token contracts, validation checks, and export policy.
- Read `references/execution-flow.md` for export mode selection and direct HTML-to-SVG-to-PNG boundaries.

## Operating Flow

1. Confirm or create source tables: platform/spec data, SKU data, `copy_master`, `html_group`, and asset metadata.
2. Choose short English kebab-case `project-id`; add `--subproject` only for isolated page/master groups inside one job.
3. Build or choose a template using `template_id`, `canvas_w`, `canvas_h`, safe areas, and target platform rules.
4. Create a project workspace with `npm run project:init -- --project <project-id> [--subproject <subproject-id>]`.
5. Generate HTML previews with `npm run build -- --project <project-id> [--subproject <subproject-id>]`.
6. Run `npm run quality-check -- --project <project-id> [--subproject <subproject-id>]` after every layout or text-affecting change.
7. For visual iteration, open the generated `file://.../html/<html-group>/index*.html` in Codex Browser, save screenshots into `screenshots/`, then use multimodal reading to identify fixes. If the preview is already open, 刷新当前 Codex Browser 页面 after rebuilding.
8. Keep the Codex Browser preview open until the image is accepted or the user stops the work. Do not close the debugging preview between unfinished rounds.
9. Only prepare export outputs after QC has no errors.
10. For multilingual work, preserve structure and hierarchy first; adjust language-specific typography only after the approved base layout is stable.

## 抄图复刻流程

Use this flow when the user provides a reference image and asks to copy, recreate, or match its layout.

Inputs:

- `project-id`
- optional `subproject-id`
- reference image path, copied or linked under `source/`
- target canvas width and height
- optional style, copy, brand, asset, or text-editability constraints

Before the loop, decide which parts are bitmap base assets and which parts must remain editable HTML/SVG. If text editability is required, never use OCR output as final rendered pixels. If a clean no-text base image is available, prefer base image plus editable text overlay.

Loop:

1. Build or revise editable HTML/CSS/SVG. Keep text, price, CTA, labels, and legal copy editable unless the user explicitly accepts bitmap text.
2. Run `npm run build -- --project <project-id> [--subproject <subproject-id>]`.
3. Report the local HTML path and `file_url` printed by `npm run build` for this round.
4. Open the generated preview in Codex Browser via the `file_url` printed by `npm run build`.
5. If the preview is already open from an earlier round, 刷新当前 Codex Browser 页面 after rebuilding instead of opening a new debugging surface.
6. Keep the preview open while the image is unfinished.
7. Capture a browser screenshot into `screenshots/round-NN.png`.
8. Use multimodal reading to compare the screenshot with the reference image.
9. Write `scores/round-NN.json` with the score schema below, preferably via `npm run review:score -- --project <project-id> ...`.
10. Fix the lowest-scoring dimension first and repeat until `overall_score >= 90` or the user stops the loop.

Score report schema:

```json
{
  "project_id": "travel-esim-banner",
  "subproject_id": "page-master-a",
  "round": 1,
  "generated_at": "2026-06-16T00:00:00.000Z",
  "source_image": "<Documents>/text2html-image-project/travel-esim-banner/page-master-a/source/reference.png",
  "screenshot": "<Documents>/text2html-image-project/travel-esim-banner/page-master-a/screenshots/round-01.png",
  "overall_score": 90,
  "layout_score": 90,
  "typography_score": 90,
  "color_score": 90,
  "asset_score": 90,
  "issues": [
    {
      "severity": "medium",
      "area": "layout",
      "observed": "hero image is lower than the reference",
      "expected": "hero image center aligns with the reference",
      "fix_hint": "move the hero layer up by 20px"
    }
  ]
}
```

Browser/multimodal boundary:

- Repo scripts create project folders, HTML previews, and JSON report structure.
- Codex Browser performs visual opening, screenshots, and real layout inspection.
- 多模态读取 happens in Codex against the saved browser screenshot; do not hard-code Codex Browser APIs inside repo scripts.
- Reuse the generated `file_url` and 刷新当前 Codex Browser 页面 between rebuilds.
- Every build round should surface the local HTML path and `file_url` before screenshot review.
- If Codex Browser cannot open `file://` because of browser policy, use static DOM checks plus Playwright or system screenshot fallback. Do not treat browser policy failure as a page failure.

## Export Mode Guard

`npm run batch-export` prepares `reports/export-report.json`; it is report-only and does not prove PNG files exist.

Use `npm run export-fast -- --project <project-id> [--group <html-group>] [--scale 2]` when a direct HTML-to-SVG-to-PNG export is required and the HTML passes the render profile. This is not a browser screenshot path.

`npm run render:profile -- --project <project-id> [--group <html-group>]` writes `reports/render-profile-report.json`. If a preview fails because of unsupported CSS, do not silently export a degraded image; report the unsupported CSS and use a separate high-fidelity fallback only when needed.

## Map Label Placement

For geographic or region-label images, do not rely on bitmap color segmentation as semantic truth. Use OpenCV/Pillow only for visual hints such as color regions, centroids, available width, and debug overlays.

Prefer GIS/vector boundaries, a user-provided label table, or another structured truth layer for country/region identity. For artistic maps, calibrate the truth layer to the poster with stable control points.

Choose label anchors by scoring:

- Whether the label box fits inside the target region.
- Available horizontal width around the anchor.
- Distance from region boundaries.
- Distance from the visual centroid or intended visual body.
- Overlap with existing labels.
- Font size readability.
- Explicit force-label or omit rules.

For narrow or irregular countries/regions, scan horizontal slices and place labels in the widest readable area instead of blindly using the geometric center.

Tiny or dense regions may be omitted when labels cannot fit. Write the reason to the coordinate report, for example `omitted_micro_country`, `omitted_too_small_to_fit`, `omitted_label_box_outside_polygon`, or `omitted_no_geometry`.

Recommended map-label artifacts:

```text
index.html
style.css
assets/base-map.png
label-coordinate-report.json
label-coordinate-debug.png
optional: gis-calibration-report.json
optional: gis-boundary-debug.svg
optional: gis-boundary-debug.png
preview.png
```

## Completion Contract

Before claiming a complex image HTML conversion is complete, report or verify:

- Canvas size.
- Image count.
- Script count.
- Editable text count.
- i18n metadata count.
- Selectable text status.
- Source asset path.
- Preview path.
- Report path.
- Exported PNG paths and dimensions, when image export was requested.
- Known omissions.

For map or dense label work, also report:

- Label count.
- Included labels.
- Omitted labels with reasons.
- Coordinate source: `manual`, `opencv`, `gis-calibrated`, or another named method.
- Debug overlay path.

## Commands

```bash
npm run start
npm run project:init -- --project <project-id> [--subproject <subproject-id>]
npm run build -- --project <project-id> [--subproject <subproject-id>]
npm run quality-check -- --project <project-id> [--subproject <subproject-id>]
npm run review:score -- --project <project-id> [--subproject <subproject-id>] --round 1 --source-image <path> --screenshot <path> --overall-score 90 --layout-score 90 --typography-score 90 --color-score 90 --asset-score 90 --issue "medium|layout|observed|expected|fix hint"
npm run batch-export -- --project <project-id> [--subproject <subproject-id>]
npm run render:profile -- --project <project-id> [--group <html-group>]
npm run export-fast -- --project <project-id> [--group <html-group>] [--scale 2]
npm test
```

## Stop Conditions

- Missing required copy/SKU/spec fields.
- Unresolved template tokens in generated HTML.
- Scrollbars, obvious text overflow, or critical missing assets after QC.
- Multilingual variants that change visual hierarchy, price visibility, or CTA prominence.
- Required text exists only in an image, SVG outline, or canvas.
- Text labels are not selectable.
- Expected i18n or business metadata is missing.
- Output was written to the repo root or the wrong project folder.
- Complex map labels lack coordinate reports or debug artifacts.
- The user requested image export but only `reports/export-report.json` was produced.
- The page visually matches but the DOM contract fails.
