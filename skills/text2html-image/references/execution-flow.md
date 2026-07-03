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

Required evidence:

- `reports/reverse-prompt-brief.md`: visual structure, text hierarchy, simple vector shapes, complex art subjects, decorative layers, and likely editable/localizable content.
- `reports/asset-routing-table.json`: one route per meaningful visible element plus `cutout_feasibility`, `regeneration_fit`, difficulty signals, and decision reason.
- `reports/asset-generation-prompts.json`: `prompt_only` ImageGen prompt packages for `regenerated_image` elements; these must request transparent PNG with alpha channel, forbid green screen / chroma key / matte backgrounds, and are not final assets.
- `reports/split-art-assets.json`: each independent PNG asset, output path, placement, dimensions, z-index, alpha extrema, mask/debug path, and limitations.
- `reports/asset-provenance.json`: source type for each complex art asset so CSS/SVG/PIL geometric placeholders cannot be mistaken for final art.

The visual brief is an intake and routing aid, not final business truth. OCR text, table content, prices, country/operator rows, QR/barcode assets, and legal copy still need DOM/source verification.

Even if ImageGen returns a PNG, do not accept green-background channel images, chroma-key backgrounds, or colored matte backgrounds as transparent assets. Regenerate as real alpha PNG or reject before HTML composition.

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
2. Asset routing contract: reverse prompt brief, asset routing table with `cutout_feasibility` and `regeneration_fit`, prompt package, split art asset report, provenance report, resolved paths, and `old_geometric_css=false` for replaced art.
3. HTML group consistency: canonical and localized variants share the expected structure and asset references.
4. Render profile: direct renderer pass/fail and unsupported CSS reasons.
5. Layout check: page overflow and cell/text overflow, especially for tables and long locale strings.
6. Visual preview: browser screenshot against reference or accepted design.
7. Export audit: PNG file count, language variants, scale variants, and pixel dimensions.

If the in-app browser refuses `file://`, do not retry indefinitely or call the page broken. Use static DOM checks plus direct renderer profile or system browser fallback as appropriate.

Every build should also leave a reopening path: `reports/preview-links.md`, `reports/build-report.json.outputs[].markdown_link`, and the plain absolute `html` path. Any plain-text reports must include local HTML file paths for every referenced preview. Treat browser-native element annotation as a current-session capability, not a guaranteed output. Probe it before use; if unsupported, keep ordinary screenshots and write coordinate or visual-annotation notes as task evidence.

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
- `runs/latest/reports/dom-contract-report.json`
- `runs/latest/reports/dom-editability-report.json`
- `runs/latest/reports/dom-editability-summary.md`
- `runs/latest/reports/reverse-prompt-brief.md`
- `runs/latest/reports/asset-routing-table.json`
- `runs/latest/reports/asset-generation-prompts.json`
- `runs/latest/reports/split-art-assets.json`
- `runs/latest/reports/asset-provenance.json`
- `runs/latest/reports/locale-risk-report.json`
- `runs/latest/reports/render-profile-report.json`

Promote `runs/latest/` to a named run only when the evidence needs to survive: accepted visual milestone, final delivery, reusable failure, or before/after audit. Use names such as `2026-06-29-r01-layout`, `2026-06-29-r02-i18n`, or `2026-06-29-r03-export`.

If a stage has no report or equivalent evidence/proof, say exactly which evidence is missing instead of claiming the image is complete.

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
- Browser annotation use is either probe-confirmed or explicitly replaced by screenshot/DOM/coordinate evidence.
- Real PNG export was performed when requested, not only an export plan.
- `reports/png-export-report.json` exists when direct PNG export was requested.
- PNG files exist under `exports/`.
- `output_pixels` equals `canvas * scale`.
- Failed entries include unsupported CSS reasons.
