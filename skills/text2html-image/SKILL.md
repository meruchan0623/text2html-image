---
name: text2html-image
description: Use when generating, validating, localizing, or exporting editable ecommerce poster/ad images with repo-root HTML/CSS templates, project workspaces, browser screenshots, and multilingual variants.
when_to_use: When the user wants to create, recreate, edit, localize, layer, QC, or export an editable poster/banner/ad image from text, a reference image, or an existing HTML/CSS template — keeping text, price, CTA, labels, and legal copy as real editable DOM rather than baked-in pixels.
---

# text2html-image

Use this as the canonical skill package. It should run from this skill directory because `scripts/`, `config/`, `templates/`, `data/`, `assets/`, `package.json`, and `workflow.config.json` are bundled runtime resources. If the current working directory is elsewhere, locate or switch to this directory before using repo commands.

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

## Self-Contained Skill Package

The skill root is the package root. Run commands from the directory that contains this `SKILL.md`:

```bash
npm test
npm run project:init -- --project <project-id>
npm run build -- --project <project-id>
```

Locate this skill directory before running commands (the runtime working directory is usually the caller's project, not this package):

- Claude Code: the skill directory is `${CLAUDE_SKILL_DIR}` — run `cd "$CLAUDE_SKILL_DIR"` first.
- Codex: the skill directory is `$CODEX_HOME/skills/text2html-image` (or the repo path `skills/text2html-image`) — `cd` there first.
- Any other agent: `cd` into the directory that contains this `SKILL.md`.

Install as a discoverable skill for both agents with `npm run install:all` (or `npm run install:claude` / `npm run install:codex`).

Do not write generated work into the skill directory or repository root. Keep runtime image projects under the system user-home Documents folder: `/Users/<user>/Documents/text2html-image-project`. Do not use CloudStorage, OneDrive, or localized `文档` paths for generated project output.

## Flood Cutout Asset Cleanup

When a bitmap layer must be composited over HTML/CSS, clean it with edge-connected flood cutout before accepting it as a transparent PNG. This is required for AI-generated maps, characters, devices, landmarks, and irregular sticker-like assets that show gradient glow, gray matte, soft halos, or non-transparent outer backgrounds.

Use `npm run flood-cutout -- --input <source.png>` from the skill root. The tool removes only background pixels connected to the canvas edge, then cleans the immediate edge ring so the delivered transparent layer does not keep glow or gradient haze. It must preserve internal background-colored holes that are not edge-connected.

Required outputs:

- `*-transparent.png`: cleaned transparent layer.
- `*-mask-debug.png`: black/white debug mask showing the final transparentized background and glow cleanup area.
- `*-cutout-report.json`: dimensions, thresholds, removed pixel counts, alpha cleanup counts, warnings, and output paths.

Do not use prompt wording, CSS filters, `mix-blend-mode`, opacity tricks, or a white/gray matte as a substitute for real transparency. If the report warns that the removed area ratio is too high or too low, inspect the mask debug before using the asset.

## Repository Hygiene

Keep the skill package limited to reusable runtime resources: `SKILL.md`, `agents/`, `scripts/`, `references/`, `config/`, `templates/`, `data/`, `package*.json`, `workflow.config.json`, and intentionally reusable `assets/`.

Generated image projects, screenshots, exports, copied deliverables, one-off work helpers, and user/reference image folders are not part of the skill. They belong under the configured project workspace or a task-local output folder, not in this repo.

Only keep files under `assets/` when they are reusable skill fixtures with clear metadata, license/source, dimensions, and an active template or test dependency. If an image asset was created for one poster or one client round, list it for user confirmation before deletion instead of treating it as bundled skill data.

Deletion review rules:

- Safe cleanup candidates: `.DS_Store`, empty directories, caches, generated exports, screenshots, temporary `work/` helpers, stale reports, and detached deliverable copies.
- Confirm before deleting: tracked assets, templates, copy rows, `workflow.config.json`, scripts, references, and any workspace project that still contains source images or final exports.
- Before removing a tracked asset, grep for its basename in templates, data, reports, and references; do not delete it if any active template or copy row still points at it.

## Execution Router

Before changing an existing project, identify the active edit surface:

- `template-source`: edit `templates/<template_id>/`; rebuild after the change.
- `workspace-html`: edit generated HTML under `html/index*.html` for single-group projects or `html/<html-group>/index*.html` for multi-group projects; do not rebuild before export unless the change is intentionally backported or discarded.
- `deliverable-copy`: edit a self-contained final output folder; sync back or mark it detached.

If the user asks to patch an existing preview, remove copy, adjust one language in a group, re-export images, or continue a previous visual round, read `references/execution-flow.md` before editing. It contains the source-surface guard, grouped DOM patch discipline, export mode guard, and verification ladder.

For `workspace-html` edits, patch all variants in the active `html_group` unless the user explicitly asks for one locale only. Under current scripts, workspace HTML is commonly emitted as `html/<html-group>/`; patch variants accordingly unless a single-group adaptive layout is already active for that project. Record the affected variants and whether export refresh is required under `reports/` when the change is more than trivial.

## Project Workspace

Runtime files live outside the repo in the current user's system Documents folder. The only output root is `/Users/<user>/Documents/text2html-image-project`. Do not use CloudStorage, OneDrive, or localized `文档` paths. The preferred future layout is adaptive: keep stable project entrypoints shallow, add subdirectories only when there is more than one group or when process evidence must be retained.

This is a preferred future output contract for generated workspaces. Current scripts are unchanged, so existing/historical folders may still follow legacy grouped paths until runtime behavior is updated.

Current runtime truth is existing generated files on disk. Future target is adaptive shallow single-group output first, with grouped output only when needed.

For a single-group project:

```text
<Documents>/text2html-image-project/<project-id>/
├── source/
├── html/
│   ├── index.html
│   ├── index.<lang>.html
│   └── master.css
├── exports/
│   └── index.png
└── project-summary.json
```

For a multi-group project:

```text
<Documents>/text2html-image-project/<project-id>/
├── source/
├── html/<html-group>/
├── exports/<delivery-id-or-group>/
└── project-summary.json
```

For complex iteration that must retain process evidence, add process evidence under `runs/` (optional):

```text
<Documents>/text2html-image-project/<project-id>/
└── runs/
    ├── latest/
    │   ├── working/
    │   ├── screenshots/
    │   ├── scores/
    │   └── reports/
    └── YYYY-MM-DD-rNN-<reason>/
```

Directory creation rules:

Define stable summary/report as user-facing, accepted artifacts meant for handoff (for example `project-summary.json`, `delivery-audit.json`, `qc-summary.json`, `export-audit.json`, `user-acceptance.json`). A **stable report** is durable project-level handoff evidence; temporary `runs/latest/` evidence is not stable by itself.

- One durable summary file: keep `project-summary.json` at project root.
- Two durable project-level report files may stay at project root when names are self-explanatory and not mixed report types.
- Three or more durable project-level reports, or mixed report types that need grouping, create `reports/` and keep report names specific.
- Temporary run reports stay under `runs/latest/reports/` and do not count as durable project-level reports.
- Existing historical project summaries/reports may remain where they already are; do not move or rewrite them to fit this preference unless the user explicitly requests migration.

Before creating or editing output files:

- Detect active project layout from existing files first.
- If both html/index.html and html/<html-group>/index.html exist, grouped evidence wins; use `html/<html-group>/index.html` as grouped/current-script layout.
- If html/<html-group>/index.html exists (and no conflicting newer grouped evidence exists), treat it as grouped/current-script output.
- If neither grouped layout evidence exists and html/index.html is active, use single-group shallow output.
- If neither exists and the user/project is clearly single-group, use the preferred future shallow layout.
- If neither exists and grouping is needed, use the current script-compatible grouped layout until runtime scripts are updated.
- If there is only one HTML group, write `index.html`, localized `index.<lang>.html`, and `master.css` directly under `html/`.
- If there are two or more HTML groups, write them under `html/<html-group>/`.
- If there is only one export group, write PNG/WebP/JPG outputs directly under `exports/`.
- If there are two or more delivery groups, write them under `exports/<delivery-id-or-group>/`.
Run evidence activation:

- If `runs/latest/` already exists, keep using it for run evidence.
- If current task needs reviewable iteration evidence, reference-image scoring rounds, final export/delivery audit, or reusable failure investigation: create/use `runs/latest/` first and place screenshots/scores/working/reports there.
- Otherwise, default to existing/current script-supported legacy locations such as `screenshots/`, `scores/`, `working/`, and `reports/` (runtime scripts are unchanged, so existing files on disk remain source-of-truth).
- Promote `runs/latest/` to `runs/YYYY-MM-DD-rNN-<reason>/` only for accepted milestones, final delivery checkpoints, or reusable failure evidence.

Do not preserve every micro-iteration as a named run. Named runs should exist only when they support later review: user acceptance, delivery/export proof, reusable failure analysis, or before/after audit evidence. Temporary browser screenshots, MCP captures, mask experiments, and one-off work files should stay in `runs/latest/working/` unless they become part of that proof.

Existing historical and current runtime folders may still use the older `source/`, `working/`, `html/`, `screenshots/`, `scores/`, `exports/`, `reports/` layout. Do not migrate or delete old folders unless the user explicitly requests a migration task.

Image project folders must stay shallow and self-contained. Do not place repo configuration, skill files, package files, or global manifests inside image project folders. Keep generator runtime files such as `workflow.config.json`, `package.json`, `scripts/`, `templates/`, and skill source files in the repo only.

Do not generate `project-manifest.json` inside image project folders. If a command needs structured output, write task-specific JSON under `reports/`, `scores/`, or `exports/`.

Default project id is `default`. Prefer an explicit readable project folder name derived from the image's main title, followed by short hyphen-separated notes for the inferred image type and visual style, for example `欧洲多国流量包-国家覆盖表-简洁蓝白商务风`. If the title contains Chinese, keep the Chinese title. If there is no Chinese title, translate the main title to Chinese when the prompt or source copy makes that safe; otherwise keep a readable English title. The notes should be easy to identify from the prompt or reference image, such as `国家覆盖表`, `价格促销海报`, `步骤说明图`, `清爽商务风`, or `卡通插画风`. Project and subproject folder names preserve readable Unicode text, replace unsafe path separators with hyphens, and are capped at 80 characters. Internal language/html group slugs still use lowercase ASCII kebab-case.

Use `--subproject <subproject-id>` when one user job contains multiple page-level image masters that need isolated rounds, screenshots, and exports. This remains the existing script behavior; adaptive flattening is a documentation contract and does not alter `--subproject` semantics until scripts are updated.

## HTML Grouping

- Same-page or same-master multilingual files belong to one HTML output group.
- Single-group projects may keep `index.html` directly under `html/`; multi-group projects keep each group under `html/<html-group>/`.
- `index.<lang>.html` variants (for example `index.zh-cn.html`, `index.en-us.html`, `index.ja-jp.html`) live in that group path.
- Locale labels can be product-specific, such as `zh-sgmy`; if a locale code changes, update `copy_master.lang`, generated `index.<lang>.html`, export names, reports, deliverable file names, and any manually maintained variant list together.
- Prefer an explicit `html_group` field in `data/copy_master.json`; otherwise the script infers one from output/template fields.
- Do not overwrite the only baseline during translation. Keep the canonical HTML and emit separate localized files.

## Map + Table Poster Pitfalls

Use these rules for coverage posters that combine a background map with editable HTML tables, especially multilingual eSIM region maps.

- Decide the source of truth before editing. If the user asks to directly tune generated `html/index*.html` or `html/<html-group>/index*.html`, do not run `npm run build` again until the direct edits are either accepted and backported to templates or intentionally discarded. A rebuild can overwrite generated HTML/CSS changes.
- Keep a clear split between template source and generated workspace. Template fixes belong in `templates/<template_id>/`; emergency visual fixes can be made in generated HTML files (`html/index*.html` for active single-group or `html/<html-group>/index*.html` for grouped/current-script output), but then either sync the same change to every localized `index.<lang>.html` or document that only the canonical preview was edited.
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
- Treat `html_group` as the contract for batch multilingual output. For single-group projects, localized pages may land under `html/index*.html`; for multi-group projects they should land under `html/<html-group>/index*.html`, all with one shared CSS file and stable `index.<lang>.html` names.
- Build scripts may render old sample rows in addition to the active project rows. When that happens, scope review, QC interpretation, export, and final delivery to the intended `html_group` rather than every preview printed by `npm run build`.
- Do not assume `npm run batch-export` writes PNG files. Check what it actually produces. If it only writes a manifest/report, use a local export helper or Chrome headless screenshots for real image output.
- Playwright being installed does not mean its browser binary is available. If Playwright fails because the cached Chromium executable is missing, prefer an installed system browser such as Google Chrome or Microsoft Edge before changing HTML/CSS.
- Keep one-off export helpers outside shared repo scripts unless the behavior is generally useful. A temporary helper can live in the task workspace `work/`, while durable export behavior should be promoted intentionally later. One-off helpers should export the generated HTML as-is; they should not recreate the poster with a different DOM, inject `<script>`, or bypass the editability contract.
- If an emergency Pillow/canvas-style raster fallback is used to unblock a visual preview, label it as non-authoritative and non-editable. Do not deliver it as the final skill output when editable HTML text is required.
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
- Report DOM contracts along with images: canvas size, script count, image count, i18n node count, business key count, scrollbar status, cell overflow list, selectable text status, and any language-specific exceptions. These checks catch regressions that visual review can miss.
- When copying final PNGs and HTML to a detached `outputs/` folder, also copy the export report. The report should name the workspace project root, active `html_group`, every language variant, PNG dimensions, byte sizes, and source HTML path so later agents can trace the deliverable back to editable HTML.

## Layered PNG + HTML Pitfalls

Use these rules for complex illustrated posters where a flat sticker-sheet asset causes positioning, alpha, or I18N rework.

- Do not generate a loose asset sticker sheet for complex posters. Prefer same-canvas transparent PNG layers plus editable HTML/CSS/SVG overlay.
- Every PNG layer must use the final canvas dimensions and origin. Preserve alpha, keep transparent regions transparent, and verify dimensions before reporting success.
- ImageGen / Codex image generation for poster assets must request PNG output with a real alpha channel. Exterior pixels outside the subject must be alpha 0; do not accept green screen, green background, chroma key background, white matte, gray matte, beige matte, colored matte, or gradient background as a substitute for transparency.
- For irregular or AI-generated bitmap layers, run flood cutout first and use the resulting `*-transparent.png`; do not place glow-cutout, gray-matte, or softly faded background assets as final layers.
- Transparent PNG acceptance requires fully transparent exterior pixels, no visible gradient glow around the silhouette, and a saved `*-mask-debug.png` plus `*-cutout-report.json`.
- Generated ImageGen assets may enter HTML `<img>` layers only after PNG format, real alpha transparency, dimensions, and provenance are checked.
- PNG layers must not contain poster-level title, step copy, CTA, legal text, labels, or other text that needs localization. Those belong in DOM text with `data-i18n-key`.
- Keep CSS-rebuildable geometry out of PNG layers: large rectangles, circles, rounded cards, pills, button bases, notice bars, simple borders, and simple icons.
- Use clear layer names and z-index roles such as `background-art.png`, `device-art.png`, optional `foreground-art.png`, and an HTML text/vector layer.
- If a device or screen layer still contains microcopy from the reference image, report it as a known limitation instead of calling the poster fully editable.
- Check `script_count`, editable text count, `data-i18n-key` count, PNG dimensions, alpha extrema, and visible layer paths before completion.

## Complex Art Asset Split Contract

Use this when a poster contains complex non-text art such as people, maps, globes, clouds, landmarks, skylines, devices, mascots, product renders, or dense illustrations.

- 固定规则：人物、地图、云和天际线，应用程序图标这些难以用 SVG 或图形线条复刻的部分，请采用抠图或者反向生成提示词再生图的形式进行。
- Hard-to-vector kinds include `person`, `map`, `cloud`, `skyline`, `landmark`, `globe`, `application_icon`, `app_icon`, and `complex_icon`. They may route only to `reference_cutout`, `regenerated_image`, `locked_base_layer`, or `review`.
- `simple_icon` is the exception for single-color or simple glyphs that can be recreated cleanly as inline SVG/CSS.
- Do not recreate complex art with CSS circles, rounded rectangles, clip-paths, SVG/PIL geometry, or code-drawn placeholder PNGs unless the user explicitly requests a vector-style approximation.
- Choose an asset source strategy before coding:
  - `reference_cutout`: crop from the reference image and clean transparency.
  - `regenerated_image`: reverse-prompt and generate a replacement art asset.
  - `user_provided_asset`: use a supplied bitmap asset.
  - `licensed_asset`: use a documented external asset.
- Every independently adjustable visual subject must be a separate PNG and a separate DOM node.
- Do not fuse separately movable subjects into one same-canvas PNG unless the user explicitly approves a locked composition.
- Required examples: map/globe -> `globe-map.png`, left cloud -> `cloud-left.png`, right cloud -> `cloud-right.png`, skyline -> `skyline.png`, person/mascot -> `traveler.png`.
- Every art asset must have explicit CSS placement: `left`, `top`, `width`, `height`, and `z-index`.
- Write `reports/split-art-assets.json` with each asset's source path, `asset_source_type`, output path, placement, dimensions, alpha extrema, mask/debug path, and known limitations.
- Write `reports/asset-provenance.json` when complex art assets are cut out, regenerated, externally licensed, or user-provided. Provenance must prove the final PNG is not a CSS/SVG/PIL geometric placeholder.
- Every complex element must include routing difficulty fields: `cutout_feasibility`, `regeneration_fit`, `difficulty_signals`, `decision_reason`, and `requires_imagegen_prompt`.
- For `regenerated_image`, write `reports/asset-generation-prompts.json` with `prompt_only` entries. A prompt package is never a final asset and must not be inserted into HTML.
- Every `regenerated_image` prompt must require transparent PNG with alpha channel and must forbid green screen / chroma key / matte backgrounds. Do not ask ImageGen for green-background channel images and do not treat them as acceptable transparent assets.
- The final HTML must pass: `script_count == 0`, no unapproved complex art SVG placeholders, `image_count == expected independent asset count`, all image paths resolve from the active or delivered HTML path, and `old_geometric_css=false` for replaced art.

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

## Draw/Edit Rework Guard

Use these rules before starting or continuing a poster recreation, transparent-layer package, current preview edit, or detached `outputs/` delivery.

- `prompt_only is not a finished transparent asset`. A prompt package for ChatGPT Images 2, Codex image generation, or any external image model only means the layer request is ready. Do not place that layer into final HTML until real PNG outputs exist, match the expected canvas/bbox contract, and have an audit report.
- ImageGen returning a green-background or other chroma-key/matte PNG is still not a finished transparent asset. It must be regenerated as a transparent PNG with alpha channel or rejected before HTML composition.
- `flood-cutout is not semantic segmentation`. It removes edge-connected background and near-edge glow from a supplied bitmap. It cannot decide which part of a full ghost poster is the phone, map, person, or background. If the source is a full poster, return to layer planning, model-assisted visual review, manual crop, or user-supplied layers before using `flood-cutout`.
- For a current preview edit, start from the HTML path the user is actually viewing. Decide whether the active surface is `workspace-html` or `deliverable-copy` before editing. Do not rebuild or regenerate the full page just to fix a QR code, icon, copy position, phone safe-area, or asset path.
- QR/barcode assets are bitmap truth assets. Crop them from the reference or original source image, keep them as PNG assets in the project asset pack, and verify they resolve from both the workspace HTML path and any detached delivery path.
- Small single-color icons, such as a plane next to `Travel eSIM`, should be recreated as inline SVG/CSS unless source fidelity requires a PNG crop. Record SVG recreation as an editable substitute, not a pixel-perfect crop.
- When syncing to `outputs/`, asset paths must be resolved from the delivered HTML path. A workspace path like `../../source/qr-code.png` may need to become `../source/qr-code.png` in `outputs/html/index.html`.
- When making a design more visually full, scale phone shells and internal UI as a group. Preserve translation resilience with `min-width: 0`, `minmax(0, 1fr)`, tight readable `line-height`, and `overflow-wrap: anywhere` for long S8N/localized text.
- If the user asks for a beginner-readable workflow explanation, update README or another explicit local guide instead of leaving the flow only in chat.

## Escalation Triggers

Read `workflow.config.json` or the references only when the request needs the full workflow:

- Multi-language generation or batch export.
- Existing generated HTML edits, direct localized variant patches, or final delivery re-export.
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
- Read `references/execution-flow.md` for existing project edits, workspace HTML patches, multilingual synchronization, export mode selection, direct HTML-to-SVG-to-PNG boundaries, and completion verification.

## Operating Flow

1. Route the task: fast path, existing-project edit, complex recreation, multilingual/export, or full six-stage workflow.
2. Confirm the source surface before editing: `template-source`, `workspace-html`, or `deliverable-copy`.
3. Confirm or create source tables: platform/spec data, SKU data, `copy_master`, `html_group`, and asset metadata.
4. Choose short English kebab-case `project-id`; add `--subproject` only for isolated page/master groups inside one job.
5. Build or choose a template using `template_id`, `canvas_w`, `canvas_h`, safe areas, and target platform rules.
6. Create a project workspace with `npm run project:init -- --project <project-id> [--subproject <subproject-id>]` when the workspace does not already exist.
7. Generate HTML previews with `npm run build -- --project <project-id> [--subproject <subproject-id>]` only when the active surface allows rebuild.
8. Run `npm run quality-check -- --project <project-id> [--subproject <subproject-id>]` after every layout or text-affecting source/template change, and run equivalent DOM checks after direct workspace HTML edits.
9. Before visual iteration or scoring, resolve the active HTML path using the Project Workspace path decision rules: grouped evidence wins; otherwise use active shallow single-group files or current script-compatible layout. For visual iteration, open the generated `file://.../html/index*.html` (single-group) or `file://.../html/<html-group>/index*.html` (multi-group) in your browser tool, save current iterative screenshots under `runs/latest/screenshots/` when runs-based evidence is active; otherwise keep screenshots in the existing/current script-supported location. Then use multimodal reading to identify fixes. If the preview is already open, refresh the browser preview after rebuilding.
10. Keep the browser preview open until the image is accepted or the user stops the work. Do not close the debugging preview between unfinished rounds.
11. Only prepare export outputs after QC or equivalent DOM/layout checks have no blocking errors.
12. For multilingual work, preserve structure and hierarchy first; adjust language-specific typography only after the approved base layout is stable.

## 抄图复刻流程

Use this flow when the user provides a reference image and asks to copy, recreate, or match its layout.

Inputs:

- `project-id`
- optional `subproject-id`
- reference image path, copied or linked under `source/`
- target canvas width and height
- optional style, copy, brand, asset, or text-editability constraints

## Reverse Prompt Asset Routing

Use this before recreating or editing any reference image unless the user is only changing existing text in an already editable HTML file.

Before writing HTML/CSS, create a short reverse prompt / visual brief from the reference image. The brief is not the final art prompt and is not a source of business truth. It is a planning artifact used to classify visible elements and decide their implementation route.

Required outputs:

- `reports/reverse-prompt-brief.md`
- `reports/asset-routing-table.json`
- `reports/asset-generation-prompts.json` when any element is routed to `regenerated_image`

The brief must describe canvas size and aspect ratio, main layout structure, text hierarchy, repeated tables or lists, simple vector-editable shapes, complex art subjects, background/decorative layers, likely editable/localizable content, and likely bitmap-only content.

Then produce an asset routing table. Every meaningful visible element must be assigned one route:

- `editable_text`
- `editable_vector`
- `reference_cutout`
- `regenerated_image`
- `locked_base_layer`
- `omit_or_simplify`

Example routing entry:

```json
{
  "id": "globe_map",
  "description": "Pale 3D globe with Europe map and orange location pin",
  "route": "regenerated_image",
  "cutout_feasibility": "low",
  "regeneration_fit": "high",
  "difficulty_signals": ["partially_occluded", "style_consistency_needed"],
  "decision_reason": "Complex decorative art is not suitable for CSS/SVG geometry and the reference is partly covered by text.",
  "requires_imagegen_prompt": true,
  "adjustability": "independent img layer with left/top/width/height/z-index",
  "expected_output": "assets/globe-map.png"
}
```

Route visible elements as follows:

- User-facing copy, prices, CTAs, legal copy, titles, table text, country names, operators, labels, and translatable content -> `editable_text`.
- Cards, panels, borders, dividers, dots, pills, badges, simple icons, notice bars, and regular geometric UI -> `editable_vector`.
- People, maps, clouds, skylines, landmarks, globes, and application icons that are hard to reproduce with SVG or line geometry -> `reference_cutout` or `regenerated_image`.
- Complex art that exists clearly in the reference and has enough resolution or separable boundaries -> `reference_cutout`.
- Complex art that is low-resolution, partly covered by text, visually noisy, hard to cut cleanly, or needs a consistent illustrated style -> `regenerated_image`.
- Large decorative texture or background art that should not be edited separately and does not contain required text -> `locked_base_layer`.
- Tiny details that do not affect the message, are not visible at target size, or would harm editability -> `omit_or_simplify`.

Use `npm run route:assets -- --project <project-id> --source-image <path> --elements <json-or-path>` to write the routing reports. The script reads agent/human-supplied element candidates; it does not claim to semantically detect all people, maps, clouds, logos, or text from pixels alone.

When an element may need later movement, scaling, replacement, localization, or independent visual tuning, it must be a separate asset and a separate DOM node. Do not merge it into a same-canvas PNG unless the user explicitly approves a locked composition.

Before the loop, decide which parts are bitmap base assets and which parts must remain editable HTML/SVG. If text editability is required, never use OCR output as final rendered pixels. If a clean no-text base image is available, prefer base image plus editable text overlay. Do not start the HTML/CSS recreation until the reverse prompt brief and asset routing table exist for reference-image recreation work.

Loop:

1. Build or revise editable HTML/CSS/SVG. Keep text, price, CTA, labels, and legal copy editable unless the user explicitly accepts bitmap text.
2. Run `npm run build -- --project <project-id> [--subproject <subproject-id>]`.
3. Report the local HTML path and `file_url` printed by `npm run build` for this round.
4. Open the generated preview in your browser tool via the `file_url` printed by `npm run build`.
5. If the preview is already open from an earlier round, refresh the browser preview after rebuilding instead of opening a new debugging surface.
6. Keep the preview open while the image is unfinished.
7. Capture a browser screenshot into `runs/latest/screenshots/round-NN.png` when run evidence is active; otherwise keep using the current/existing screenshot location (for example `screenshots/round-NN.png`).
8. Use multimodal reading to compare the screenshot with the reference image.
9. If `runs/latest/` is active, write scoring/review JSON under `runs/latest/scores/round-NN.json` and related reports under `runs/latest/reports/`; otherwise use the current/legacy `scores/round-NN.json` (and existing report locations).
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
- Your browser tool performs visual opening, screenshots, and real layout inspection.
- Multimodal image reading happens against the saved browser screenshot; do not hard-code any browser-native APIs inside repo scripts.
- Reuse the generated `file_url` and refresh the browser preview between rebuilds.
- Every build round should surface the local HTML path and `file_url` before screenshot review.
- If the browser tool cannot open `file://` because of browser policy, use static DOM checks plus Playwright or system screenshot fallback. Do not treat browser policy failure as a page failure.

## Final Preview Links

Every build or final delivery should surface a clickable local preview target for the active HTML. Every plain-text report or final response that references an HTML preview must include the local HTML file path. `npm run build` writes `reports/preview-links.md` and each built output in `reports/build-report.json` includes:

- `html`: absolute local HTML path.
- `file_url`: `file://` URL for your browser tool or another local browser surface.
- `markdown_link`: Markdown link using the `file_url`.
- `browser_hint`: `open_or_refresh_file_url`.

In final responses, include the active HTML as a Markdown link and include the plain absolute local HTML file path next to it for clients that do not open `file://` links. Keep `reports/preview-links.md` with the project evidence so a later agent can reopen the same preview without re-running discovery.

This is a required handoff for every image-edit round, not just final delivery: always output the active HTML Markdown preview link, the plain absolute local HTML path, and the `reports/preview-links.md` path before asking the user to inspect the result. If multiple HTML variants were built, name the active variant or list each variant that needs review.

Browser annotation capability is optional. Probe the current agent/browser session before using browser-native element annotation, for example by checking whether an annotation screenshot command is exposed and succeeds. Do not claim browser annotation was used unless the current session probe succeeds. If the probe fails or the client does not expose annotation commands, use ordinary browser screenshots, DOM snapshots, coordinate notes, or a task-local visual annotation report instead.

## Export Mode Guard

`npm run batch-export` prepares `reports/export-report.json`; it is report-only and does not prove PNG files exist.

Use `npm run export-fast -- --project <project-id> [--group <html-group>] [--scale 2]` when a direct HTML-to-SVG-to-PNG export is required and the HTML passes the render profile. This is not a browser screenshot path.

`npm run render:profile -- --project <project-id> [--group <html-group>]` writes `reports/render-profile-report.json`. If a preview fails because of unsupported CSS, do not silently export a degraded image; report the unsupported CSS and use a separate high-fidelity fallback only when needed.

When using a Playwright/browser screenshot fallback, set the viewport to the CSS canvas size and increase `deviceScaleFactor` only for higher-resolution output. Do not change CSS dimensions to get a larger export.

When real images are required, verify file existence, dimensions, language variants, and scale variants before reporting completion.

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
- DOM editability report path, including editable text count, i18n metadata count, business key count, script count, image count, and asset text risk count.
- Selectable text status.
- Source asset path.
- Resolved local image paths from the active HTML path.
- Detached deliverable asset path status, if an `outputs/` copy exists.
- QR/scannable-code crop path and rendered dimensions, when a code appears in the reference.
- Phone safe-area and z-index status, when a device mockup contains editable DOM UI.
- Translation overflow-safety notes for enlarged phone UI, feature cards, or dense labels.
- Preview path.
- Local HTML file path.
- Preview Markdown link and `reports/preview-links.md` path.
- Report path.
- Exported PNG paths and dimensions, when image export was requested.
- Known omissions.

For reference-image recreation or image-editing tasks, also report:

- Reverse prompt brief path.
- Asset routing table path.
- Count of routed elements by route type.
- `cutout_feasibility`, `regeneration_fit`, difficulty signals, and decision reason for every routed element.
- Asset generation prompt package path when any route is `regenerated_image`.
- Complex art asset count.
- Expected vs actual independent PNG asset list.
- Asset source type for every complex art asset.
- Whether every complex art asset is independently movable in HTML/CSS.
- CSS placement for every complex art asset: `left`, `top`, `width`, `height`, and `z-index`.
- Alpha extrema and mask/debug path for every PNG that was cut out or regenerated.
- Whether stale CSS/SVG/PIL geometric placeholders remain, reported as `old_geometric_css=false` when clean.
- Screenshot path and DOM contract result after the routed asset strategy is implemented.

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
npm run audit:dom -- --project <project-id> [--subproject <subproject-id>] [--group <html-group>]
npm run route:assets -- --project <project-id> --source-image <path> --elements <json-or-path> [--subproject <subproject-id>]
npm run review:score -- --project <project-id> [--subproject <subproject-id>] --round 1 --source-image <path> --screenshot <path> --overall-score 90 --layout-score 90 --typography-score 90 --color-score 90 --asset-score 90 --issue "medium|layout|observed|expected|fix hint"
npm run batch-export -- --project <project-id> [--subproject <subproject-id>]  # report/export plan; verify PNGs separately
npm run render:profile -- --project <project-id> [--group <html-group>]
npm run export-fast -- --project <project-id> [--group <html-group>] [--scale 2]
npm run flood-cutout -- --input <source.png> [--output <clean.png>] [--mask <mask-debug.png>] [--report <report.json>]
npm test
```

## Stop Conditions

- Missing required copy/SKU/spec fields.
- Unresolved template tokens in generated HTML.
- Scrollbars, obvious text overflow, or critical missing assets after QC.
- Multilingual variants that change visual hierarchy, price visibility, or CTA prominence.
- Direct `workspace-html` edits followed by an unintended rebuild.
- Required text exists only in an image, SVG outline, or canvas.
- Text labels are not selectable.
- Expected i18n or business metadata is missing.
- Output was written to the repo root or the wrong project folder.
- `reports/dom-editability-report.json` has `status: "fail"` for the affected HTML group.
- A task-specific source image, generated PNG, screenshot, or deliverable has been added to the skill repo without a reusable asset reason and metadata.
- A transparent bitmap layer still has visible exterior glow, gray matte, or partial-alpha haze after flood cutout.
- A flood cutout report warns about removed area ratio and the mask debug has not been inspected.
- A semi-transparent mask or partial-alpha cutout creates a dark compositing seam around a layer.
- A QR/scannable code is missing, redrawn, filtered, blurred, or not resolvable from the final delivered HTML.
- A detached `outputs/` HTML copy has broken local image paths after moving files out of the workspace.
- Device screen UI is partially hidden by the phone shell, clipped safe area, oversized internal containers, or incorrect z-index.
- Enlarged phone/card layout has not been checked for S8N or translated-copy overflow.
- Complex map labels lack coordinate reports or debug artifacts.
- The user requested image export but only `reports/export-report.json` was produced.
- The final deliverable was produced by a non-editable raster fallback while the request required editable HTML text.
- The page visually matches but the DOM contract fails.
- A copy/recreation task started HTML/CSS implementation before `reports/reverse-prompt-brief.md` and `reports/asset-routing-table.json` were created.
- `reports/asset-routing-table.json` lacks `cutout_feasibility`, `regeneration_fit`, `difficulty_signals`, or `decision_reason` for any complex element.
- An element with `cutout_feasibility: "low"` was routed to `reference_cutout` without explicit user approval.
- An element routed to `regenerated_image` has no `prompt_only` entry in `reports/asset-generation-prompts.json`.
- A hard-to-vector element such as `person`, `map`, `cloud`, `skyline`, `application_icon`, `app_icon`, or `complex_icon` was routed to `editable_vector` or `editable_text`.
- Complex visual elements were not assigned an explicit route: `editable_text`, `editable_vector`, `reference_cutout`, `regenerated_image`, `locked_base_layer`, or `omit_or_simplify`.
- Complex visual art requested as cutout or regenerated imagery was implemented with CSS/SVG/PIL geometric placeholders.
- Multiple independently adjustable art subjects are fused into one PNG without explicit user approval.
- A regenerated or cutout bitmap asset was inserted before transparency cleanup and mask/debug inspection.
- Final HTML contains stale geometric CSS for art that has supposedly been replaced by PNG assets.
- Asset provenance is unclear: the report does not say whether each complex art asset is `reference_cutout`, `regenerated_image`, `user_provided_asset`, or `licensed_asset`.
