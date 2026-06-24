# 小型美术资产识别与提取决策机制设计

## 背景

`text2html-image` 当前已经有明确分层原则：复杂地图、人物、地标、密集插画、纹理背景进入 PNG 图层；文字、价格、CTA、标签和简单图形尽量保持 HTML/CSS/SVG 可编辑。现有脚本只会复制 `bg_asset`、`hero_asset`、`patch_assets` 指向的现成图片，不会自动判断一张图里的小型美术资产应该 SVG 重绘、PNG 抠图、保留位图还是忽略。

这次优化的目标是补上“决策机制”，不是直接生成最终图像。首版以本地轻量图像探测为基础，引入模型读取图片内容作为主要判断来源，最终输出可审计报告、SVG 重绘规格和 PNG 抠图任务说明。

## 目标

1. 识别小型美术资产候选，例如图标、徽章、小插画、装饰贴纸、简单 UI 图形。
2. 基于本地探测和模型视觉审阅，给每个候选输出处理决策。
3. 模型意见优先；本地规则负责预筛、风险提示、schema 校验和明显冲突升级。
4. 生成 `asset-decision-report.json` 与 Markdown 摘要。
5. 对 `svg_redraw` 项生成 SVG 重绘规格和 prompt。
6. 对 `png_cutout` 项生成抠图任务说明，可对接已有或后续的透明抠图工具。
7. 所有输出写入项目 workspace，不写入 skill repo 的 `assets/`。

## 非目标

1. 首版不直接调用图像生成模型产出 SVG 或 PNG。
2. 首版不把模型调用绑死到某个 provider；先定义输入输出协议，允许本地命令接入模型结果文件。
3. 不尝试从复杂背景图中自动分割多个对象的精确边界。
4. 不把大型人物、完整背景、地图主图、照片墙当作“小型美术资产”自动拆分。
5. 不替换现有 HTML/CSS/SVG 模板生成逻辑。

## 资产分类

每个候选资产归入以下处理决策之一：

- `svg_redraw`：适合重绘成 SVG。典型对象是单色或少色图标、线性图标、简单 badge、几何装饰、小型 UI 图形。
- `png_cutout`：适合保留为透明 PNG。典型对象是小贴纸、小插画、带渐变或纹理但边界清楚的装饰资产。
- `keep_bitmap`：继续作为位图使用。典型对象是照片、复杂设备图、地图、人物、复杂产品图。
- `ignore`：不是可复用资产，或属于截图噪声、背景碎片、重复导出物。
- `needs_review`：模型意见和本地风险信号冲突，或模型输出不完整，需要人工确认。

## 决策原则

本地规则先做可解释的预筛，不直接替代模型判断。模型是主要裁决者，但以下情况必须升级为 `needs_review`：

1. 模型建议 `svg_redraw`，但本地探测显示颜色复杂度高、图片类似照片、边缘复杂、尺寸明显过大。
2. 模型建议 `png_cutout`，但图片没有可见主体、透明边界异常、主体与背景颜色过近。
3. 图像中包含明显文字、价格、CTA、法律说明或本应可编辑的文案。
4. 模型置信度低于 `0.65`。
5. 模型输出不符合 schema，或缺少决策理由。

如果本地规则认为候选不是小型资产，但模型明确识别为小图标或小插画，首版接受模型意见，同时在报告中记录 `local_rule_overridden_by_model`。

## 本地探测层

新增 `scripts/utils/asset-probe.js`，只负责读取图片和生成轻量信号。首版完整探测 PNG，包括 alpha、透明比例、颜色近似统计和 opaque bbox；JPEG/WebP 先读取尺寸和文件大小，颜色/alpha 统计记为不可用并加入 `limited_probe_format` 风险标记。若当前分支已有 `pngjs`，优先复用它读取 PNG 像素。

探测字段：

- `path`
- `exists`
- `format`
- `width`
- `height`
- `file_size_bytes`
- `has_alpha`
- `transparent_pixel_ratio`
- `opaque_bbox`
- `edge_transparency_ratio`
- `approx_color_count`
- `dominant_colors`
- `aspect_ratio`
- `small_asset_score`
- `local_candidate_type`
- `local_risk_flags`

`small_asset_score` 是启发式评分，不是最终决策。默认候选边界是：最长边不超过 `512px`，或 opaque bbox 面积不超过整张图 `35%` 且文件小于 `512KB`。默认复杂度边界是：近似颜色数不超过 `32` 更偏向 `svg_redraw`，超过 `96` 更偏向 `png_cutout` 或 `keep_bitmap`。这些阈值只影响本地预筛和风险提示，模型仍是主要裁决来源。

## 候选收集

新增 `scripts/asset-decide.js` 作为 CLI 入口。输入支持两种模式：

```bash
npm run asset-decide -- --project <project-id> [--subproject <subproject-id>]
npm run asset-decide -- --files <path-a> <path-b> --project <project-id>
```

项目模式扫描：

- `<workspace>/source/`
- `copy_master` 中当前项目相关的 `bg_asset`、`hero_asset`、`patch_assets`
- 明确传入的 `--files`

默认不扫描 `exports/`、`screenshots/`、`reports/` 和 skill repo 的 `assets/`，避免把导出物或历史 fixture 当作源资产。

## 模型审阅层

新增 `scripts/utils/asset-model-review.js`。它定义模型输入/输出 schema，并支持两段式工作：

1. `asset-decide` 生成 `working/asset-decisions/model-review-input.json` 和 Markdown prompt，列出候选图像、探测信号和需要模型判断的问题。prompt 必须要求模型实际读取图片视觉内容，而不是只根据文件名或本地探测字段下结论。
2. 用户或后续工具把模型结果保存为 `working/asset-decisions/model-review-output.json` 后，再运行 `asset-decide --model-output <path>` 合并决策。

模型输出 schema：

```json
{
  "items": [
    {
      "asset_id": "string",
      "path": "string",
      "visual_summary": "string",
      "model_candidate_type": "icon|badge|small_illustration|sticker|ui_decoration|photo|map|person|background|unknown",
      "decision": "svg_redraw|png_cutout|keep_bitmap|ignore|needs_review",
      "confidence": 0.0,
      "reason": "string",
      "contains_editable_text": false,
      "svg_spec": {
        "style": "string",
        "colors": ["string"],
        "geometry_notes": "string",
        "viewbox_hint": "string",
        "prompt": "string"
      },
      "png_cutout_task": {
        "target_subject": "string",
        "background_to_remove": "string",
        "edge_handling": "string",
        "known_risks": ["string"]
      }
    }
  ]
}
```

`svg_spec` 只在 `decision=svg_redraw` 时必填。`png_cutout_task` 只在 `decision=png_cutout` 时必填。

## 决策合并层

新增 `scripts/utils/asset-decision-rules.js`。它负责：

1. 校验模型输出 schema。
2. 合并本地探测信号和模型意见。
3. 应用风险升级规则。
4. 生成最终 `final_decision`、`decision_source`、`confidence`、`review_flags`。

`decision_source` 取值：

- `model_primary`
- `model_overrode_local`
- `local_fallback`
- `conflict_needs_review`
- `schema_error_needs_review`

当模型结果不存在时，脚本仍可生成本地预筛报告，但所有需要视觉语义判断的项标为 `needs_model_review`，不伪装成最终结论。

## 输出结构

所有输出写入项目 workspace：

```text
<project-root>/
├── working/
│   └── asset-decisions/
│       ├── model-review-input.json
│       ├── model-review-prompt.md
│       ├── svg-specs/
│       │   └── <asset-id>.md
│       └── png-cutout-tasks/
│           └── <asset-id>.md
└── reports/
    ├── asset-decision-report.json
    └── asset-decision-summary.md
```

报告包含：

- 总候选数。
- 本地预筛分类统计。
- 模型决策统计。
- 最终决策统计。
- 每个资产的路径、探测数据、模型意见、本地风险、最终决策。
- 需要人工复核的原因。
- 生成的 SVG spec 和 PNG cutout task 路径。

## 与现有抠图计划的关系

当前仓库已有 `docs/superpowers/plans/2026-06-25-flood-cutout-transparent-assets.md`，它关注洪泛式透明 PNG 抠图工具。本文设计不重复实现抠图算法，只为 `png_cutout` 资产产出任务说明。后续实现时，`png_cutout_task` 可以作为 `flood-cutout` 或其他抠图工具的输入依据。

## 文档更新

需要更新：

- `skills/text2html-image/SKILL.md`
  - 增加“小型美术资产决策”规则。
  - 说明模型意见优先、本地规则升级复核。
  - 说明首版只产出报告和任务规格。
- `skills/text2html-image/references/stage-guides.md`
  - 在资产准备阶段加入 `asset-decide`。
- `skills/text2html-image/workflow.config.json`
  - 可选增加 asset decision 输出字段说明，不改变现有六阶段结构。
- `skills/text2html-image/package.json`
  - 增加 `asset-decide` script。

## 测试策略

新增测试应集中在 `skills/text2html-image/scripts/test.js` 或拆出的工具测试中。

测试范围：

1. 本地探测可以读取小型 PNG fixture，并输出尺寸、alpha、颜色统计。
2. 模型输出 schema 校验可以接受完整结果，拒绝缺字段结果。
3. 模型建议 `svg_redraw` 但本地高复杂风险时，最终为 `needs_review`。
4. 模型建议 `png_cutout` 且本地风险低时，生成 PNG 抠图任务说明。
5. 模型建议 `svg_redraw` 且本地风险低时，生成 SVG spec。
6. 没有模型输出时，只生成预筛和待模型审阅 payload，不声称完成最终决策。
7. 报告路径位于 workspace，不写入 repo root 或 skill repo `assets/`。

## 验收标准

1. `npm run asset-decide -- --project <project-id>` 能生成本地预筛报告和模型审阅输入。
2. `npm run asset-decide -- --project <project-id> --model-output <path>` 能合并模型结果并生成最终报告。
3. `svg_redraw` 项有独立 SVG prompt/spec。
4. `png_cutout` 项有独立抠图任务说明。
5. `needs_review` 项明确列出冲突原因。
6. `npm test` 覆盖核心规则和报告路径。
7. Skill 文档明确说明：小图标优先 SVG/CSS，复杂小插画优先透明 PNG，模型意见优先但高风险冲突进入复核。

## 实施边界

这项工作适合单个实现计划完成。它新增的是决策和报告链路，不直接接入真实图像生成，也不重构现有 HTML build/export 主流程。实现时必须保护当前未提交的用户改动，只改与 `asset-decide` 相关的脚本、测试、文档和 package 配置。
