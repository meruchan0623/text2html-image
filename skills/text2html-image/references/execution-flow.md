# text2html-image Execution Flow

Use this reference when a task may cause rework: existing project edits, direct generated HTML edits, multilingual variants, real PNG export, dense map/table posters, direct renderer profile failures, or final delivery checks.

## 1. Pick the Active Surface

Before editing, state which surface owns the next change:

| Surface | Edit here | Rebuild? | Use when |
| --- | --- | --- | --- |
| `template-source` | `templates/<template_id>/master.html` and `master.css` | Yes | The change should survive future builds. |
| `workspace-html` | generated `html/<html-group>/index*.html` | No, unless backporting or discarding direct edits | The user asks to tune an existing generated preview or exported poster. |
| `deliverable-copy` | self-contained final output folder | No, unless syncing back intentionally | The user asks to patch already packaged delivery files. |

If the surface is `workspace-html`, patch every `index*.html` in the active `html_group` unless the user explicitly scopes the request to one locale. Do not run `npm run build` before export; it can overwrite the direct edits.

When no patching script exists for the needed edit, write or update a small report under `reports/` with:

```json
{
  "source_surface": "workspace-html",
  "rebuild_allowed": false,
  "html_group": "africa-esim-map",
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

## 3. DOM Patch Discipline

Prefer stable keys over text search:

- `data-i18n-key` for copy nodes.
- `data-country-code`, `data-region-code`, `data-sku`, or similar business keys for repeated/domain nodes.
- `html_group` for deciding the sibling language files to patch.

Before applying a multi-file direct edit, dry-run mentally or with local inspection:

1. Identify the active `html_group`.
2. List every `index*.html` variant under that group.
3. Locate the same keyed node in every affected file.
4. Apply the same semantic edit to all affected variants.
5. Re-read the changed nodes and record the affected variants in `reports/`.

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
2. HTML group consistency: canonical and localized variants share the expected structure and asset references.
3. Render profile: direct renderer pass/fail and unsupported CSS reasons.
4. Layout check: page overflow and cell/text overflow, especially for tables and long locale strings.
5. Visual preview: browser screenshot against reference or accepted design.
6. Export audit: PNG file count, language variants, scale variants, and pixel dimensions.

If the in-app browser refuses `file://`, do not retry indefinitely or call the page broken. Use static DOM checks plus direct renderer profile or system browser fallback as appropriate.

## 7. Rework Prevention Reports

For complex poster edits, prefer reports over prose. Use the closest existing report path, or write a small task-specific JSON under `reports/`:

- `intake-report.json`
- `html-patch-report.json`
- `layout-impact-report.json`
- `dom-contract-report.json`
- `dom-editability-report.json`
- `dom-editability-summary.md`
- `locale-risk-report.json`
- `render-profile-report.json`
- `png-export-report.json`
- `delivery-audit-report.json`

If a stage has no report or equivalent proof, say exactly which proof is missing instead of claiming the image is complete.

## 8. Completion Checklist

Before final delivery, confirm:

- Active surface was correct and not overwritten by an unintended rebuild.
- All intended `html_group` variants were patched or the one-locale exception is documented.
- Required text remains editable DOM text with i18n/business keys.
- Dense labels have coordinate/debug reports and omitted reasons.
- QC or equivalent DOM checks passed for the affected HTML files.
- Real PNG export was performed when requested, not only an export plan.
- `reports/png-export-report.json` exists when direct PNG export was requested.
- PNG files exist under `exports/`.
- `output_pixels` equals `canvas * scale`.
- Failed entries include unsupported CSS reasons.
