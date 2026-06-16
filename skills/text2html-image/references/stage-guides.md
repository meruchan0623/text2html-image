# Stage Guides

Use this reference only when stage rules are unclear, when extending templates, or when the user asks for multilingual, export, asset-library, or platform-spec behavior. The active skill remains `text2html-image`; these stage names are workflow phases, not separate skills.

## 1. 资产准备

- Backgrounds and patches must not contain flattened text, logos, prices, CTAs, or legal copy.
- Hero, product, and character assets should be transparent PNG when compositing is required.
- Five-view character packs should include `front.png`, `front_3q.png`, `side.png`, `back_3q.png`, `back.png`, `contact-sheet.png`, and `asset.json`.
- Record source, license, dimensions, transparency, angle, style, and usage scene.
- Treat GPT Images 2 or other image generation as an external asset producer: require source references, action prompt, target use case, local output files, and metadata before claiming completion.

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
- Current export is manifest-only and writes project `exports/export-manifest.json`; real screenshot export must wait until final assets and browser rendering runtime are verified.
