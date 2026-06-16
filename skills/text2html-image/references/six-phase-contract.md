# Six-Phase Contract

This reference defines the full handoff contract for the single `text2html-image` skill. It is not part of the default poster-generation path; load it when documenting, auditing, or changing the complete workflow. Stage names are phases inside the workflow, not separate skills.

## Phase Gates

| Order | Phase | Required gate |
| --- | --- | --- |
| 1 | 资产准备 | Assets have source, license, dimensions, transparency, and usage scene metadata. |
| 2 | 布局指定 | Layout fits the canvas and assigns title, hero, price, CTA, and legal zones. |
| 3 | 细节指定 | Visible details are editable HTML/CSS/SVG unless explicitly accepted as bitmap assets. |
| 4 | 细节修改 | Every revision is scoped, reversible, and tied to concrete visual feedback. |
| 5 | 布局稳固性审核 | QC has no errors: no scrollbars, no unreplaced tokens, no critical overflow. |
| 6 | 多语言化 | Localized versions preserve structure, hierarchy, price visibility, and CTA prominence. |

## Data Handoffs

### Asset Record

```json
{
  "asset_id": "hero_travel_esim_girl_front",
  "asset_type": "hero",
  "path": "assets/heroes/hero_travel_esim_girl_front.png",
  "format": "png",
  "transparent": true,
  "angle": "front",
  "style": "clean ecommerce illustration",
  "usage_scene": "travel-esim-poster",
  "license": "provided-by-user",
  "notes": ""
}
```

### Layout Record

```json
{
  "template_id": "T01_price_type",
  "canvas": {"width": 1024, "height": 1280},
  "zones": {
    "title": {"x": 50, "y": 50, "w": 924, "h": 180},
    "hero": {"x": 120, "y": 260, "w": 784, "h": 520},
    "benefits": {"x": 90, "y": 700, "w": 844, "h": 160},
    "price": {"x": 120, "y": 860, "w": 784, "h": 140},
    "cta": {"x": 180, "y": 1060, "w": 664, "h": 90},
    "disclaimer": {"x": 80, "y": 1180, "w": 864, "h": 60}
  }
}
```

### Copy Row

```json
{
  "source_row_id": "ROW001",
  "template_id": "T01_price_type",
  "platform": "shopee",
  "canvas_w": 1024,
  "canvas_h": 1280,
  "lang": "en-US",
  "sku": "SIM001",
  "title": "Summer Sale - 50% Off",
  "cta": "Shop Now",
  "export_name": "T01_en-US_SIM001_1024x1280"
}
```

## Current Local Commands

```bash
npm run start
npm run build -- --project <project-id> [--subproject <subproject-id>]
npm run quality-check -- --project <project-id> [--subproject <subproject-id>]
npm run batch-export -- --project <project-id> [--subproject <subproject-id>]
npm test
```

## External Service Boundary

GPT Images 2 and other image-generation services are optional external producers for assets. A phase may use them only when the user provides credentials/context or explicitly asks for live generation. Without live generation, record the intended prompt contract and keep the workflow runnable with local placeholders.
