---
name: text2html-image
description: Use when generating, validating, localizing, or exporting editable ecommerce poster/ad images with repo-root HTML/CSS templates, project workspaces, browser screenshots, and multilingual variants.
---

# text2html-image

Use this as the single skill for this repository. It should run from the repo root because `scripts/`, `config/`, `templates/`, `data/`, and `workflow.config.json` are shared runtime resources. If the current working directory is elsewhere, locate or switch to that repo root before using repo commands.

## Core Rule

Produce editable source first. Text, price, CTA, labels, and legal copy must remain HTML/CSS/SVG unless the user explicitly asks for a flattened bitmap.

Generated previews must be 静态 `index.html` plus CSS and assets. Do not add `<script>`, frontend state machines, debug panels, browser automation code, or generated control pages unless the user explicitly asks for an interactive prototype.

## Fast Path Default

For ordinary requests like creating, recreating, or editing one poster/banner, avoid the full six-stage setup. Read only the minimum working files:

- `data/copy_master.json` for the active content row.
- `templates/<template_id>/master.html` and `master.css` for the target template.
- Any user-provided image paths or local assets needed for the current output.

Then build the preview with `npm run build -- --project <project-id>`. Run QC only after a concrete HTML/CSS change or before export.

## Project Workspace

Runtime files live outside the repo in the current user's Documents folder:

```text
<Documents>/text2html-image/projects/<project-id>/
<Documents>/text2html-image/projects/<project-id>/subprojects/<subproject-id>/
├── source/       原始素材和参考图
├── working/      中间文件、草稿、辅助数据
├── html/         可编辑 HTML/CSS 预览
├── screenshots/  浏览器截图
├── scores/       抄图/复刻每轮评分 JSON
├── exports/      最终导出 manifest 和图片目标
└── reports/      build、QC、汇总报告
```

Default project id is `default`. Prefer an explicit English kebab-case project id. Project and subproject ids are sanitized to lowercase ASCII kebab-case and capped at 20 characters.

Use `--subproject <subproject-id>` when one user job contains multiple page-level image masters that need isolated rounds, screenshots, and exports.

## HTML Grouping

- Same-page or same-master multilingual files must live in one `html/<html-group>/` directory.
- `index.html` is the canonical preview for the group.
- Localized variants use `index.<lang>.html`, for example `index.zh-cn.html`, `index.en-us.html`, `index.ja-jp.html`.
- Prefer an explicit `html_group` field in `data/copy_master.json`; otherwise the script infers one from output/template fields.
- Do not overwrite the only baseline during translation. Keep the canonical HTML and emit separate localized files.

## Escalation Triggers

Read `workflow.config.json` or the references only when the request needs the full workflow:

- Multi-language generation or batch export.
- Platform specs, safe areas, canvas presets, or export limits.
- Asset library metadata, five-view character packs, or external image generation.
- QC failures, layout stability review, or handoff documentation.
- Adding/changing workflow phases, data contracts, template token rules, or project workspace rules.

Reference paths are relative to this skill directory, not the caller's current working directory.

## Six Stages

| Stage | Primary output |
| --- | --- |
| 1. 资产准备 | asset index, color palette, SVG specs |
| 2. 布局指定 | `layout.json`, template choice, safe-area map |
| 3. 细节指定 | editable HTML/CSS/SVG details |
| 4. 细节修改 | scoped revision record and updated source |
| 5. 布局稳固性审核 | QC report, stability score, fix list |
| 6. 多语言化 | localized previews and export manifest |

Reference routing:

- Read `references/six-phase-contract.md` only for phase gates, data handoffs, and external service boundaries.
- Read `references/stage-guides.md` only for stage-specific rules, token contracts, validation checks, and export policy.

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
  "source_image": "<Documents>/text2html-image/projects/travel-esim-banner/subprojects/page-master-a/source/reference.png",
  "screenshot": "<Documents>/text2html-image/projects/travel-esim-banner/subprojects/page-master-a/screenshots/round-01.png",
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

- Repo scripts create project folders, HTML previews, manifest files, and JSON report structure.
- Codex Browser performs visual opening, screenshots, and real layout inspection.
- 多模态读取 happens in Codex against the saved browser screenshot; do not hard-code Codex Browser APIs inside repo scripts.
- Reuse the generated `file_url` and 刷新当前 Codex Browser 页面 between rebuilds.
- Every build round should surface the local HTML path and `file_url` before screenshot review.

## Commands

```bash
npm run start
npm run project:init -- --project <project-id> [--subproject <subproject-id>]
npm run build -- --project <project-id> [--subproject <subproject-id>]
npm run quality-check -- --project <project-id> [--subproject <subproject-id>]
npm run review:score -- --project <project-id> [--subproject <subproject-id>] --round 1 --source-image <path> --screenshot <path> --overall-score 90 --layout-score 90 --typography-score 90 --color-score 90 --asset-score 90 --issue "medium|layout|observed|expected|fix hint"
npm run batch-export -- --project <project-id> [--subproject <subproject-id>]
npm test
```

## Stop Conditions

- Missing required copy/SKU/spec fields.
- Unresolved template tokens in generated HTML.
- Scrollbars, obvious text overflow, or critical missing assets after QC.
- Multilingual variants that change visual hierarchy, price visibility, or CTA prominence.
