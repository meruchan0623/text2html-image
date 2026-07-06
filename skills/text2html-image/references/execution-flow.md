# text2html-image Execution Flow

Use this reference when a task may cause rework: existing project edits, direct generated HTML edits, multilingual variants, real PNG export, dense map/table posters, direct renderer profile failures, or final delivery checks.

## 1. Pick the Active Surface

Before editing, state which surface owns the next change:

| Surface | Edit here | Rebuild? | Use when |
| --- | --- | --- | --- |
| `template-source` | `templates/<template_id>/master.html` and `master.css` | Yes | The change should survive future builds. |
| `workspace-html` | generated `html/index*.html` or `html/<html-group>/index*.html` | No, unless backporting or discarding direct edits | The user asks to tune an existing generated preview or exported poster. |
| `deliverable-copy` | self-contained final output folder | No, unless syncing back intentionally | The user asks to patch already packaged delivery files. |

If the surface is `workspace-html`, resolve the active HTML path from files on disk first. Patch every `index*.html` in the active single-group `html/` path or active `html_group` unless the user explicitly scopes the request to one locale. Do not run `npm run build` before export; it can overwrite the direct edits.

## Existing Project Inspect

When the user says to continue an existing project, open an existing preview, or modify a named generated artifact and the active HTML/CSS surface is not already certain, run:

```bash
npm run project:inspect -- --project <project-id>
```

This command is read-only: it uses `getProjectPaths`, not `createProjectWorkspace`, and fails if the project folder does not exist. Use `reports/project-inspect.md` to choose the active HTML, identify grouped or localized variants, check existing exports/reports, and pick the next `task:brief` mode.

Do not run `project:init` for an existing-project edit unless `project:inspect` proves the project is missing and the user actually wants a new workspace.

## Task Brief Pre-Edit Guard

For image-copy/edit tasks that need explicit limits, boundaries, or active-surface certainty, run:

```bash
npm run task:brief -- --project <project-id> --mode <mode>
```

as the first step (before manual HTML/CSS edits). The command records intent and expectations in:

- `reports/task-brief.json`
- `reports/task-brief.md`

Mode guidance:

- `preview-overwrite` (default): overwrite `html/index.html` / `html/master.css` as active preview.
- `preview-only`: produce preview-only draft without touching canonical active files.
- `faithful-recreate`: source-driven first pass requiring reference image.
- `surgical-edit`: minimal patch to active HTML/CSS.
- `multilingual-sync`: keep language variants synchronized.
- `finalize-export`: permit real export flow.

Keep `finalize-export` in mind for export expectations; otherwise avoid assuming any PNG export is done.

## Existing Preview Micro-Edit Guard

Do not promote a micro-adjustment into a full regeneration. If the user points to an already-open `file://` preview and asks for a local fix, keep the work on that active surface unless they explicitly ask to rebuild templates.

1. Capture the active HTML path from the user's browser or request.
2. Classify the path:
   - `workspace-html`: generated project HTML under `html/` or `html/<html-group>/`.
   - `deliverable-copy`: detached output HTML under `outputs/`, a task-local delivery folder, or another copied package.
3. For `workspace-html`, patch the active HTML/CSS/assets and decide whether the change must be backported to templates.
4. For `deliverable-copy`, patch the delivered copy first, then make a sync-back decision:
   - `sync_back_required`: the workspace/template must receive the same fix.
   - `delivery_only`: the copied output is intentionally detached.
5. Record the decision in the report or final message with the active HTML path and affected asset paths.

When no patching script exists for the needed edit, write or update a small report under `runs/latest/reports/` when run evidence is active; otherwise use the current/legacy `reports/` path. Include:

```json
{
  "source_surface": "workspace-html",
  "rebuild_allowed": false,
  "html_group": "copy-complex-poster",
  "affected_variants": ["index.html", "index.zh-tw.html"],
  "required_export_refresh": true
}
```

## 2. Choose the Shortest Safe Path

Use the fast path for a single ordinary poster:

1. Read `data/copy_master.json`, target template files, and only the needed assets.
2. Build with `npm run build -- --project <project-id>`.
3. Run `npm run quality-check -- --project <project-id>` after actual HTML/CSS changes or before export.

Escalate to the full workflow when the request includes:

- Multi-language generation, translation, or grouped export.
- Existing generated HTML edits.
- Dense maps, tables, labels, or long locale-specific text.
- Reference-image recreation that needs scoring rounds.
- Final delivery where actual PNG files, dimensions, or variants matter.
- Any mismatch between visual acceptance and DOM editability.

## Reference Image Asset Routing

For reference-image recreation or image-editing work, create routing evidence before writing the first HTML/CSS pass unless the request is only changing existing editable text.

Fixed routing rule: 人物、地图、云和天际线，应用程序图标这些难以用 SVG 或图形线条复刻的部分，请采用抠图或者反向生成提示词再生图的形式进行.

First-pass entrance order: `visual:intake -> route:assets --from-intake -> prompt:compose`. The first agent/model response to a reference image must include `reverse_visual_prompt`, a broad visual blueprint for composition/layout, hierarchy, color, typography, material/assets, spatial relationships, editable DOM candidates, bitmap candidates, and unknowns. `visual:intake` must write that blueprint to `reports/reverse-visual-spec.md`; without it, do not write first-pass HTML.

Required evidence:

- `reports/reverse-visual-spec.md`: the broad reverse visual prompt and intake summary created before routing. This is a visual blueprint, not final business truth.
- `reports/visual-intake-manifest.json`: intake manifest with `status: "pass"` and the original `reverse_visual_prompt`.
- `reports/reverse-prompt-brief.md`: visual structure, text hierarchy, simple vector shapes, complex art subjects, decorative layers, and likely editable/localizable content.
- `reports/asset-routing-table.json`: one route per meaningful visible element plus `cutout_feasibility`, `regeneration_fit`, difficulty signals, and decision reason.
- `reports/codex-first-pass-html-prompt.md`: stable Codex read-in prompt composed from visual intake, reverse prompt brief, and asset routing before writing the first HTML/CSS pass.
- `reports/route-contract-audit.json`: expected route validation from `npm run audit:routes -- --expected <expected-contract.json> --routing <asset-routing-table.json> --report <reports/route-contract-audit.json>`. Use `allowed_routes` when a route family is valid, and keep `forbidden_routes` authoritative.
- `reports/asset-generation-prompts.json`: `prompt_only` ImageGen prompt packages for `regenerated_image` elements; these must request transparent PNG with alpha channel, forbid green screen / chroma key / matte backgrounds, and are not final assets.
- `reports/imagegen-candidates.json`: returned ImageGen candidate audit from `npm run audit:imagegen`; accepted candidates need alpha extrema, transparent corners, and `transparency_method` provenance, while rejected candidates stay `blocked_from_final_html=true`.
- `reports/split-art-assets.json`: each independent PNG asset, output path, placement, dimensions, z-index, alpha extrema, mask/debug path, and limitations.
- `reports/asset-provenance.json`: source type for each complex art asset so CSS/SVG/PIL geometric placeholders cannot be mistaken for final art.
- `reports/bitmap-layer-contract-audit.json`: HTML bitmap layer validation from `npm run audit:bitmap-layers -- --html <html/index.html> --provenance <asset-provenance.json> --report <reports/bitmap-layer-contract-audit.json>`. Every final `<img>` / SVG `<image>` layer must declare or inherit `data-asset-id`, resolve to the provenance path, and have final readiness plus `css_placement`.
- `reports/source-truth-bitmap-audit.json`: source-truth bitmap validation from `npm run audit:source-truth -- --assets <asset-provenance.json> --report <reports/source-truth-bitmap-audit.json>`. QR/barcode assets must be local high-contrast bitmaps with provenance, final-ready status, source-preserving routes, and `css_filter_allowed=false`.
- `reports/review-gate-contract-audit.json`: review-gate validation from `npm run audit:review-gates -- --html <html/index.html> --provenance <asset-provenance.json> --report <reports/review-gate-contract-audit.json>`. Review-gated assets must stay explicitly non-final, explain why or what is missing, and must not contain final-looking bitmap placeholders.
- `reports/asset-readiness-audit.json`: final/review readiness validation from `npm run audit:asset-readiness -- --expected <expected-contract.json> --provenance <asset-provenance.json> --routing <asset-routing-table.json> --imagegen <imagegen-candidates.json> --review-gates <review-gate-contract-audit.json> --report <reports/asset-readiness-audit.json>`. Asset-like routes must have final-ready provenance or explicit review-gate coverage; prompt-only, rejected ImageGen candidates, planned cutouts, and flattened-text photo backgrounds cannot silently count as usable assets.
- `reports/source-truth-acquisition-audit.json`: acquisition plan validation from `npm run audit:source-truth-acquisition -- --expected <expected-contract.json> --provenance <asset-provenance.json> --plan <source-truth-acquisition-plan.json> --review-gates <review-gate-contract-audit.json> --report <reports/source-truth-acquisition-audit.json>`. Review-gated QR/barcode/logo/icon/flag assets must name allowed real source types and explicitly forbid regenerated images, approximate redraws, and editable-vector substitutes.

The visual brief and `reverse_visual_prompt` are intake and routing aids, not final business truth. OCR text, table content, prices, country/operator rows, QR/barcode assets, logos, and legal copy still need DOM/source verification.

Even if ImageGen returns a PNG, do not accept green-background channel images, chroma-key backgrounds, or colored matte backgrounds as transparent assets. Regenerate as real alpha PNG or reject before HTML composition.

Use `npm run audit:imagegen -- --input <candidates.json> --report <reports/imagegen-candidates.json>` before adding any regenerated image to HTML. A visual-looking PNG is not enough; the report must prove alpha, record whether transparency came from `native_alpha`, `chroma_key_removed`, or `flood_cutout`, and unblock final HTML placement.

When a subject may need later movement, scaling, replacement, localization, or independent tuning, keep it as a separate DOM node with explicit CSS placement. Do not fuse multiple independently adjustable art subjects into one PNG unless the user approves a locked composition.

Hard-to-vector kinds such as `person`, `map`, `cloud`, `skyline`, `landmark`, `globe`, `application_icon`, `app_icon`, and `complex_icon` are not valid `editable_vector` or `editable_text` routes. `simple_icon` remains the route for single-color or simple glyphs that are cleanly rebuildable with SVG/CSS.

## 3. DOM Patch Discipline

Prefer stable keys over text search:

- `data-i18n-key` for copy nodes.
- `data-country-code`, `data-region-code`, `data-sku`, or similar business keys for repeated/domain nodes.
- `html_group` for deciding the sibling language files to patch.

Before applying a multi-file direct edit, dry-run mentally or with local inspection:

1. Identify the active single-group `html/` path or active `html_group`.
2. List every `index*.html` variant under that path or group.
3. Locate the same keyed node in every affected file.
4. Apply the same semantic edit to all affected variants.
5. Re-read the changed nodes and record the affected variants under `runs/latest/reports/` when run evidence is active; otherwise use the current/legacy `reports/` path.

If a visible business text node lacks a stable key, add the key while editing unless doing so would change the user's requested scope.

## 4. Export Modes

Never treat an export report as a PNG export.

- `batch-export`: report only. It writes `reports/export-report.json` and lists HTML entries plus expected PNG paths, but it does not create PNG files.
- `render:profile`: compatibility check for the direct renderer. It writes `reports/render-profile-report.json` with pass/fail entries and unsupported CSS details.
- `export-fast`: direct HTML-to-SVG-to-PNG export for HTML that passes the render profile. It does not use browser screenshots.

When the user asks to "重新导出图", produce or refresh real PNG files, then verify file existence, dimensions, variants, and scale. For higher-resolution export through `export-fast`, keep the CSS layout canvas fixed and increase `--scale`.

## 5. Direct Renderer Boundary

The direct renderer supports a constrained poster profile:

- fixed `.poster` canvas dimensions from inline pixel styles.
- inline SVG passthrough.
- fixed map labels and title text layers.
- SVG output under `working/render-svg/`.
- PNG output under `exports/`.
- export report under `reports/png-export-report.json`.

It must fail-fast instead of silently degrading output when HTML/CSS requires unsupported rendering features such as `grid`, complex `flex`, `filter`, `mix-blend-mode`, `clip-path`, visual pseudo-elements, media queries, masks, or external HTTP assets.

## 6. Verification Ladder

Use the cheapest proof that can catch the current failure mode, then escalate only when needed:

1. Static DOM contract: no scripts, expected image count, editable text count, i18n/business key count, local asset existence, and `reports/dom-editability-report.json` status.
2. Asset routing contract: reverse prompt brief, asset routing table with `cutout_feasibility` and `regeneration_fit`, route-contract audit, prompt package, split art asset report, provenance report, bitmap-layer contract audit, source-truth bitmap audit, review-gate contract audit, asset readiness audit, source-truth acquisition audit, resolved paths, and `old_geometric_css=false` for replaced art.
3. HTML group consistency: canonical and localized variants share the expected structure and asset references.
4. Render profile: direct renderer pass/fail and unsupported CSS reasons.
5. Layout check: page overflow, cell/text overflow, and key-region overlap for cards, review gates, maps, tables, truth assets, and major copy blocks. Record the result as `layout-contract-audit.json` or an equivalent browser/layout report with coordinate evidence.
6. Visual-DOM preview gate: run `npm run audit:visual-dom -- --project <project-id> [--group <html-group>]` for bitmap-base, layered, or reference-image recreation work. Treat failures in `visual-dom-audit.json` as blocking even when `dom-editability-report.json` passes.
7. Visual preview: browser screenshot against reference or accepted design. For reference recreation, run `npm run audit:visual-compare -- --reference <source/reference.png> --render <screenshot-or-export.png> --dom-report <reports/visual-dom-audit.json>` after the Visual-DOM preview gate. Use `reference-vs-render-overlay.png`, `reference-vs-render-heatmap.json`, and `reference-vs-render-repair-queue.json` as the next repair queue.
8. Export audit: PNG file count, language variants, scale variants, and pixel dimensions.

If the in-app browser refuses `file://`, do not retry indefinitely or call the page broken. Use static DOM checks plus direct renderer profile or system browser fallback as appropriate.

Every build should also leave a reopening path: `reports/preview-links.md`, `reports/build-report.json.outputs[].markdown_link`, and the plain absolute `html` path. Any plain-text reports must include local HTML file paths for every referenced preview. Treat browser-native element annotation as a current-session capability, not a guaranteed output. Probe it before use; if unsupported, keep ordinary screenshots and write coordinate or visual-annotation notes as task evidence.

## Reference-vs-Render Gate

For reference-image recreation, do not finish on DOM/export evidence alone. Write:

- `reports/reference-vs-render-review.json`
- `reports/reference-vs-render-review.md`

The review compares `source/reference.png` with the current browser screenshot or `exports/index.png`. It must score canvas, layout, hierarchy, asset-route match, text fidelity, typography, color/lighting, image quality, overflow/clipping, and editability preservation. High or blocking issues need screenshot coordinates or DOM paths.

`audit:visual-compare` now creates overlay, diff, heatmap, and repair-queue evidence. When paired with `visual-dom-audit.json`, top mismatch regions should include candidate DOM selectors, asset ids/routes, and likely issue types. Treat the repair queue as the objective visual fix list for the next iteration; repair the largest or most severe regions before subjective polishing.

`visual similarity cannot override DOM or asset-route failure`: if DOM text is layered over a bitmap that still contains the same phone UI label, map legend, region label, table text, CTA, or legal copy, record the problem as baked raster text conflicts with DOM overlays. Use a clean no-text base before calling the overlay visually clean; otherwise keep the asset review-gated.

## Mini-batch productization review

After a P1/P2 mini-batch, stop generation and review the real outputs before choosing the next action. Read `training-productization-report.md`, `promotion-candidates.json`, `next-training-plan.md`, and each mini-batch project's `project-summary.json`, `reference-vs-render-review.json`, `dom-editability-report.json`, `asset-readiness-audit.json`, `source-truth-acquisition-audit.json`, `route-contract-audit.json`, `cell-overflow-report.json`, and `png-export-report.json`.

If `promotion-candidates.json` still lists `missing_review_gate, prompt_only_not_review_gated, or no_accepted_imagegen_candidate`, treat that as a stable productization failure until a RED test covers it or a refreshed report proves it has disappeared. Passing mini-batch samples reduce risk and can become success-pattern evidence, but they do not by themselves erase historical repeated-failure candidates.

Only promote success rules from projects classified as `success` with all hard gates passing. A reusable rule must be backed by DOM, route, asset readiness, source-truth, overflow, export, and reference-vs-render evidence. Keep review-gated gaps and prompt-only assets out of success rules.

## 7. Rework Prevention Reports

For complex poster edits, prefer structured evidence over prose. One durable summary can stay at project root as `project-summary.json`; two durable project-level report files may also stay at root when names are self-explanatory and not mixed report types. Use project-level `reports/` when there are three or more durable reports, or mixed report types that need grouping. Iteration-specific reports should go under `runs/latest/reports/` unless promoted to a named run.

Stable project-level examples:

- `project-summary.json`
- `delivery-audit.json`
- `reports/preview-links.md`
- `reports/qc-summary.json`
- `reports/export-audit.json`
- `reports/user-acceptance.json`

Run-level examples:

- `runs/latest/reports/intake-report.json`
- `runs/latest/reports/html-patch-report.json`
- `runs/latest/reports/layout-impact-report.json`
- `runs/latest/reports/layout-contract-audit.json`
- `runs/latest/reports/dom-contract-report.json`
- `runs/latest/reports/dom-editability-report.json`
- `runs/latest/reports/dom-editability-summary.md`
- `runs/latest/reports/reverse-prompt-brief.md`
- `runs/latest/reports/asset-routing-table.json`
- `runs/latest/reports/asset-generation-prompts.json`
- `runs/latest/reports/codex-first-pass-html-prompt.md`
- `runs/latest/reports/split-art-assets.json`
- `runs/latest/reports/asset-provenance.json`
- `runs/latest/reports/locale-risk-report.json`
- `runs/latest/reports/render-profile-report.json`

Promote `runs/latest/` to a named run only when the evidence needs to survive: accepted visual milestone, final delivery, reusable failure, or before/after audit. Use names such as `2026-06-29-r01-layout`, `2026-06-29-r02-i18n`, or `2026-06-29-r03-export`.

If a stage has no report or equivalent evidence/proof, say exactly which evidence is missing instead of claiming the image is complete.

## P0 Visual Intelligence Evidence Chain

For reference-image recreation, create this report chain before final export:

```text
visual-intake-manifest.json
-> element-decomposition-plan.json
-> mask-quality-report.json
-> cutout-layer-package.json
-> asset-routing-table.json
-> codex-first-pass-html-prompt.md
-> dom-editability-report.json
-> layout-contract-audit.json
-> visual-review-round-NN.json
```

`visual-intake-manifest.json` records Agent/VLM hypotheses. It is not pixel truth.

`element-decomposition-plan.json` records element labels, prompts, bbox source, route, placement, and review status.

`mask-quality-report.json` records alpha evidence and overlay paths for masks.

`cutout-layer-package.json` records transparent PNG layer paths, mask paths, placement, z-index, and provenance.

`layout-contract-audit.json` records page overflow, text/cell overflow, and key-region overlap evidence before visual scoring.

`visual-review-round-NN.json` records screenshot comparison scores, evidence coordinates or DOM paths, and the next action.

## 8. Completion Checklist

Before final delivery, confirm:

- Active surface was correct and not overwritten by an unintended rebuild.
- All intended `html_group` variants were patched or the one-locale exception is documented.
- Required text remains editable DOM text with i18n/business keys.
- Reference-image recreation has routing evidence and complex art provenance when applicable.
- Independent art subjects are separate DOM image nodes unless a locked composition was approved.
- Replaced complex art does not leave stale CSS/SVG/PIL geometric placeholders.
- Dense labels have coordinate/debug reports and omitted reasons.
- QC or equivalent DOM checks passed for the affected HTML files.
- `reports/preview-links.md` exists and final response includes the active HTML Markdown link plus absolute path.
- When existing-project discovery used `project:inspect`, final response includes `reports/project-inspect.md` or `reports/project-inspect.json`.
- When task boundaries are staged with `task:brief`, final response includes `reports/task-brief.md` or `reports/task-brief.json` path and an explicit export note (`finalize-export` required for export).
- Browser annotation use is either probe-confirmed or explicitly replaced by screenshot/DOM/coordinate evidence.
- Reference-image recreation includes `reports/reference-vs-render-review.json` and `reports/reference-vs-render-review.md`.
- Bitmap layers under DOM overlays are clean no-text base layers, or baked raster text conflicts with DOM overlays are explicitly review-gated.
- Visual similarity cannot override DOM or asset-route failure.
- Real PNG export was performed when requested, not only an export plan.
- `reports/png-export-report.json` exists when direct PNG export was requested.
- PNG files exist under `exports/`.
- `output_pixels` equals `canvas * scale`.
- Failed entries include unsupported CSS reasons.
