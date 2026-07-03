# Stage Guides

Use this reference only when stage rules are unclear, when extending templates, or when the user asks for multilingual, export, asset-library, or platform-spec behavior. The active skill remains `text2html-image`; these stage names are workflow phases, not separate skills.

## 1. 资产准备

- Backgrounds and patches must not contain flattened text, logos, prices, CTAs, or legal copy.
- Hero, product, and character assets should be transparent PNG when compositing is required.
- ImageGen / Codex image generation must request transparent PNG with alpha channel for composited assets. Do not request or accept green screen, green background, chroma key background, white matte, gray matte, beige matte, colored matte, or gradient background as a transparency substitute.
- For irregular bitmap cutouts, run `npm run flood-cutout -- --input <source.png>` and use the generated `*-transparent.png` as the compositing asset. Keep `*-mask-debug.png` and `*-cutout-report.json` in `working/` or `reports/` for review.
- 固定复杂资产规则：人物、地图、云和天际线，应用程序图标这些难以用 SVG 或图形线条复刻的部分，请采用抠图或者反向生成提示词再生图的形式进行。
- Reject transparent assets that still depend on gradient glow, gray matte, or semi-transparent exterior haze to blend into the poster.
- Five-view character packs should include `front.png`, `front_3q.png`, `side.png`, `back_3q.png`, `back.png`, `contact-sheet.png`, and `asset.json`.
- Record source, license, dimensions, transparency, angle, style, and usage scene.
- Treat GPT Images 2 or other image generation as an external asset producer: require source references, action prompt, target use case, local output files, and metadata before claiming completion.

### Prompt package is not an asset

- Treat external image-generation prompts (e.g. ChatGPT Images, Codex image generation) as `prompt_only` until real PNG outputs are supplied.
- A usable transparent layer must include the PNG file, expected dimensions, alpha audit, and a report path.
- Even if ImageGen returns a PNG, reject it as unfinished when the exterior is green-screen, chroma-key, matte, or another solid/gradient background instead of real alpha transparency.
- Do not place `prompt_only` layers into HTML, exports, screenshots, or delivery reports.
- If image generation is unavailable, record the prompt package path and stop the asset at review state.
- A prompt-only visual brief may guide routing, but it is not a bitmap layer, crop, source image, or proof that final art exists.

### Complex art source types

For complex non-text art such as people, maps, globes, clouds, landmarks, skylines, devices, mascots, product renders, or dense illustrations, assign one source type before integration:

- `reference_cutout`: crop from the reference image, clean transparency, and keep mask/debug evidence.
- `regenerated_image`: use a reverse prompt to generate a replacement asset, then clean transparency and record provenance.
- `user_provided_asset`: use the supplied bitmap and record its original path.
- `licensed_asset`: use a documented external asset with source/license notes.

Hard-to-vector kinds such as `person`, `map`, `cloud`, `skyline`, `landmark`, `globe`, `application_icon`, `app_icon`, and `complex_icon` must not be routed to `editable_vector` or `editable_text`. Use `simple_icon` only for single-color or simple glyphs that can be recreated cleanly as CSS/SVG.

Do not accept `css_geometry`, `svg_placeholder`, or `pil_geometry_placeholder` as final source types when the user asked for cutout or regenerated imagery. They can be temporary scaffolding only if clearly labeled and removed before delivery.

Before choosing `reference_cutout` or `regenerated_image`, record `cutout_feasibility`, `regeneration_fit`, difficulty signals, and a decision reason. Low cutout feasibility or high regeneration fit should route to `regenerated_image`, which only produces a `prompt_only` entry in `reports/asset-generation-prompts.json` until a real PNG with alpha channel, alpha audit, and mask/debug report exist.

Asset index records should follow this shape:

```json
{
  "asset_id": "hero_sim_girl_front",
  "asset_type": "hero",
  "path": "assets/heroes/hero_sim_girl_front.png",
  "format": "png",
  "transparent": true,
  "angle": "front",
  "usage_scene": "travel-esim-poster",
  "license": "provided-by-user"
}
```

## 2. 规格与布局指定

- Define platform/channel, image type, canvas width/height, export format, safe areas, and font fallback rules before rendering.
- Use `workflow.config.json`, `config/canvas_specs.json`, and `config/platform_rules.json` as the current sources of truth.
- Choose a template type from `workflow.config.json` and keep mandatory zones separate: title, hero, benefits, price, CTA, disclaimer.
- Prefer a `layout.json` record with explicit pixel boxes:

```json
{
  "template_id": "T01_price_type",
  "canvas": {"width": 1024, "height": 1280},
  "zones": {
    "title": {"x": 50, "y": 50, "w": 924, "h": 180},
    "hero": {"x": 120, "y": 260, "w": 784, "h": 520},
    "price": {"x": 120, "y": 820, "w": 784, "h": 140},
    "cta": {"x": 180, "y": 1040, "w": 664, "h": 90}
  }
}
```

## 3. 细节指定与 HTML 渲染

- Use fixed pixel canvas dimensions from the copy row or spec.
- Keep text as selectable HTML.
- Use CSS/SVG for decorative details when possible.
- Use bitmap images only for background, hero/product/character, and patch assets.
- For reference-image recreation, start from `reports/reverse-prompt-brief.md` and `reports/asset-routing-table.json` so text, vectors, cutouts, regenerated imagery, locked base layers, and omitted details are separated before coding.
- Use `npm run route:assets` to generate the initial routing table and ImageGen prompt-only package from an agent/human-supplied element list.
- Keep independently adjustable complex art as separate `<img>` nodes with explicit CSS `left`, `top`, `width`, `height`, and `z-index`; record them in `reports/split-art-assets.json`.
- Remove stale CSS/SVG/PIL geometric placeholders after PNG art replaces them, and report the clean state as `old_geometric_css=false`.
- Run `npm run build -- --project <project-id> [--subproject <subproject-id>]` to render `data/copy_master.json` through `templates/<template_id>/master.html`.

Supported scalar tokens:

```text
{{lang}}, {{lang_class}}, {{canvas_width}}, {{canvas_height}}, {{title}},
{{subtitle}}, {{currency}}, {{price}}, {{unit}}, {{cta}}, {{disclaimer}},
{{bg_asset}}, {{hero_asset}}
```

Supported loop:

```html
{{#each benefits}}
  {{icon}} {{text}} {{title}} {{description}}
{{/each}}
```

## 4. 细节修改

- Tie each edit to a concrete visual issue.
- Keep changes reversible by recording before/after intent.
- Prefer moving or resizing a component over local CSS hacks.
- Keep language overrides scoped to `styles/<lang>.css`.
- Do not change approved hierarchy during multilingual adaptation unless QC proves it cannot fit.

### Current preview edit checklist

- Start from the HTML path the user is currently viewing.
- Classify the surface as `workspace-html` or `deliverable-copy`.
- For `workspace-html`, edit the active group and keep language variants synchronized unless the user requests one locale only.
- For `deliverable-copy`, fix that delivery copy and record whether the fix must be synced back to the workspace.
- Do not rebuild just to fix a local icon, QR code, phone safe-area, text position, or asset path.

## 5. 布局稳固性审核

Run `npm run quality-check` after rendering or any layout/text-affecting edit.

Required checks:

- Canvas size equals the target spec.
- Generated HTML has no unreplaced template tokens.
- No horizontal or vertical scrollbar.
- Title, benefit cards, price, CTA, and disclaimer do not overflow containers.
- Referenced images exist or are intentionally replaced by preview placeholders.
- Language variants preserve structure, hierarchy, price visibility, and CTA prominence.

Errors block export. Warnings identify missing optional assets or incomplete production inputs.

## 6. 多语言化与批量导出

- Localize only after the base layout passes stability review.
- One copy row equals one language, one image, and one template. Rows sharing one page/master should use the same `html_group`.
- Required fields: `source_row_id`, `template_id`, `platform`, `canvas_w`, `canvas_h`, `lang`, `sku`, `title`, `cta`, `export_name`.
- Adjust typography and line-height in language-specific CSS; do not turn text into images.
- Run `npm run batch-export -- --project <project-id> [--subproject <subproject-id>]` only after QC has no errors.
- Current `npm run batch-export` is report-only and writes `reports/export-report.json`; it does not create PNG files. Real PNG files require `npm run export-fast` for supported render profiles or an explicit browser screenshot/export fallback.
- `npm run build` writes `reports/preview-links.md` with Markdown `file://` links, `Local HTML file path` entries, and browser reopening hints. Keep this report with the final evidence and include both the active HTML Markdown link and the plain local HTML file path in the final response.
- Browser-native annotation is optional and session-dependent. Probe the current browser tool before relying on element/circle annotation; otherwise use ordinary screenshots, DOM snapshots, and coordinate notes.
- Adaptive grouping rule:
  - One HTML group -> direct `html/index.html`, `html/index.<lang>.html`.
  - Multiple HTML groups -> `html/<html-group>/`.
  - One export group -> direct `exports/`.
  - Multiple delivery/export packs -> `exports/<delivery-id-or-group>/`.
  - Iterative screenshots/scores/masks/temp export diagnostics -> `runs/latest/` unless promoted; otherwise preserve current script/legacy locations if no run evidence is active.

### Detached outputs path checklist

- Copy HTML, CSS, `source/`, `layers/`, screenshots, and reports as a single delivery set.
- Resolve every local `img src` from the delivered HTML path, not from the workspace preview path.
- Rewrite paths when needed, for example from `../../source/qr-code.png` to `../source/qr-code.png`.
- Keep QR/barcode assets as bitmap files and verify they render in the detached delivery path.
- Do not report delivery complete if any image path in the delivered HTML is unresolved.
