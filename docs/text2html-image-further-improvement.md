# text2html-image 进一步改进文档：低资源出图与返工点收敛

本文基于过去一周 `text2html-image` 的真实使用记录、当前仓库脚本和模板结构整理。目标不是继续堆规则，而是把高返工环节拆成可实现的工具能力，尤其解决两个核心堵点：

1. HTML DOM 修改不够精准，常常要靠人工 `rg`、手改多个 `index*.html`、再补导出。
2. 从 HTML 出图依赖 Playwright/Chrome 这类重资源渲染链路，启动慢、占用高、偶发挂起。

## 结论先行

可以写一个“低资源 HTML 出图程序”，但边界必须明确：

- 如果目标是兼容任意 HTML/CSS，并且像浏览器一样精准渲染 `grid`、`flex`、`filter`、`mix-blend-mode`、`clip-path`、`mask`、伪元素、字体 fallback、emoji/CJK 排版，那么本质上就是重新实现浏览器布局/渲染引擎，不现实。
- 如果目标是服务本技能生成的静态海报，可以把 HTML 约束为一个 `poster-render profile`：固定画布、绝对定位、有限文本、图片、SVG、圆角矩形、线条、简单渐变。然后用 `HTML/DOM -> Poster IR -> SVG -> PNG` 的方式出图，资源占用会远低于启动 Playwright。

推荐路线：

1. 保留 Playwright/真实浏览器作为最终兜底验收面。
2. 新增低资源 renderer，优先覆盖 80% 静态海报、批量多语言导出、快速预览。
3. 对超出 renderer profile 的 CSS 明确报错或降级，不假装支持。

## 当前真实堵点

### 1. DOM 修改靠“猜选择器”和文本搜索

过去在 Africa eSIM map 里移除底部提示时，先定位到一个语言文件，后来才扩展到所有 `index*.html`。这说明当前修改链路缺少“变体组”的概念：用户说“移除最下面的提示”，系统应该定位到 `data-i18n-key="disclaimer"`，并把同一 `html_group` 下所有语言文件作为一个修改集合。

建议新增：

- `scripts/patch-html.js`
- `scripts/utils/html-patch-core.js`
- `reports/html-patch-report.json`

核心能力：

- 用结构化 HTML parser 修改 DOM，不用正则直接改 HTML。
- 支持 selector、`data-i18n-key`、`data-country-code`、文本 fingerprint、视觉区域名称四种定位方式。
- 每次修改先 dry-run，输出将改哪些文件、哪些节点、节点前后摘要。
- 默认按 `html/<html-group>/index*.html` 同步修改，不只改当前打开的语言。

建议命令：

```bash
npm run patch-html -- --project africa-esim-map --group africa-esim-map --key disclaimer --remove --dry-run
npm run patch-html -- --project africa-esim-map --group africa-esim-map --key disclaimer --remove --apply
```

### 2. 生成源、生成后 HTML、导出 PNG 三个真相面经常混在一起

当前 skill 已提醒：如果用户直接调 generated HTML，不要先 rebuild，否则可能覆盖手改。但这个规则仍靠人记忆执行。应把“当前要改的是模板源还是工作区 HTML”变成命令参数和报告。

建议新增：

```bash
npm run edit-workspace-html -- --project <project-id> --group <html-group> ...
npm run edit-template -- --template <template-id> ...
```

并在报告里强制写：

- source surface: `template` 或 `workspace-html`
- rebuild allowed: true/false
- affected html variants
- required export refresh: true/false

如果 `source surface=workspace-html`，后续命令应阻止无意 `npm run build`，或至少输出醒目警告。

### 3. `batch-export` 名字像导出，但实际是 report-only

当前 `scripts/batch-export.js` 写 `reports/export-report.json`，没有生成 PNG。这会导致“以为导出了，但交付面没有 PNG”的返工。

建议拆成三个清晰命令：

```bash
npm run export-plan -- --project <project-id>
npm run export-fast -- --project <project-id>
npm run export-browser -- --project <project-id>
```

- `export-plan`: 只生成报告，不写 PNG。
- `export-fast`: 用低资源 renderer 写 PNG，要求 HTML 符合 profile。
- `export-browser`: 用 Playwright/Chrome 写 PNG，作为高保真兜底。

旧 `batch-export` 可以保留兼容，但输出必须明确：`report-only`。

## 低资源 HTML 出图程序设计

### 推荐架构：HTML 子集编译器

```text
html/<group>/index*.html
        |
        v
DOM parser + CSS parser
        |
        v
Poster Render Profile Validator
        |
        v
Poster IR: canvas, layers, text, images, svg, boxes
        |
        v
SVG compiler
        |
        v
PNG rasterizer
```

### 为什么不直接“解析 HTML 然后截图”

普通 HTML 的布局结果不是 HTML 文件本身决定的，而是浏览器把 DOM、CSSOM、字体、图片尺寸、布局算法、绘制顺序一起计算后的结果。没有浏览器，就没有完整 layout tree。

所以低资源方案必须转向两种方式之一：

1. 约束 HTML/CSS，让布局可由我们的小程序计算。
2. 在 build 阶段同时生成 `render-ir.json`，出图程序不再从任意 HTML 反推布局。

推荐第二种作为长期方向：让 `build.js` 除 HTML 外再输出 `reports/render-ir/<html-group>.<variant>.json`。HTML 继续给人类预览，IR 给机器出图。

### Poster IR 示例

```json
{
  "canvas": { "width": 1404, "height": 1064, "background": "#f1ece5" },
  "assetsRoot": "../source",
  "layers": [
    {
      "id": "sheet",
      "type": "rect",
      "x": 34,
      "y": 62,
      "width": 1331,
      "height": 940,
      "radius": 28,
      "fill": "#fffdfa",
      "stroke": "rgba(255,255,255,.78)",
      "strokeWidth": 3.5
    },
    {
      "id": "africa-map",
      "type": "image",
      "src": "africa-map-transparent.png",
      "x": 46,
      "y": 50,
      "width": 1239,
      "height": 826,
      "opacity": 0.55,
      "fit": "contain"
    },
    {
      "id": "title",
      "type": "text",
      "text": "非洲 eSIM 覆蓋",
      "x": 0,
      "y": 79,
      "width": 1404,
      "fontFamily": "Source Han Sans TC",
      "fontSize": 54,
      "fontWeight": 900,
      "lineHeight": 1,
      "align": "center",
      "fill": "#475786",
      "i18nKey": "title"
    }
  ]
}
```

### 支持等级

#### Level 1：强约束，优先落地

支持：

- fixed canvas
- absolute positioned layers
- rect / rounded rect / line / circle
- image with contain/cover
- text block with known box
- inline SVG passthrough
- simple fill/stroke/shadow
- simple linear/radial gradient

不支持：

- flex/grid 自动布局
- CSS filter / mix-blend-mode
- mask / clip-path
- pseudo-element
- JS/canvas

适合：

- 固定海报
- 多语言同版导出
- 地图底图 + HTML 标签
- 价格卡、banner、表格类输出

#### Level 2：有限布局支持

支持部分 grid/table：

- 固定列宽 `grid-template-columns: 48px 170px 1fr`
- 固定行高 `repeat(10, 57px)`
- row/cell text overflow check

仍不做通用 CSS layout。只针对本技能里高频的 coverage table。

#### Level 3：浏览器兜底

遇到这些 CSS，自动标记 `requires_browser=true`：

- `filter`
- `mix-blend-mode`
- `clip-path`
- `mask`
- complex `transform`
- pseudo-elements with visual content
- non-fixed `flex/grid`

此时走 `export-browser`，不尝试伪造低资源渲染。

## 低资源出图实现建议

### 新增文件

```text
scripts/render-fast.js
scripts/utils/render-profile.js
scripts/utils/render-ir.js
scripts/utils/svg-compiler.js
scripts/utils/png-rasterizer.js
```

### 新增命令

```json
{
  "scripts": {
    "render:profile": "node scripts/render-fast.js --profile-only",
    "export-fast": "node scripts/render-fast.js",
    "export-browser": "node scripts/export-browser.js"
  }
}
```

### 验收标准

`export-fast` 必须输出：

```text
reports/render-profile-report.json
reports/render-ir/<html-group>.<variant>.json
exports/<html-group>-<variant>.png
```

报告必须包含：

```json
{
  "status": "pass",
  "renderer": "fast-svg",
  "requires_browser": false,
  "unsupported_css": [],
  "canvas": { "width": 1404, "height": 1064 },
  "layers": 44,
  "text_layers": 21,
  "image_layers": 1
}
```

如果不支持，必须失败并说明原因：

```json
{
  "status": "fail",
  "requires_browser": true,
  "unsupported_css": [
    { "selector": ".africa-map", "property": "mix-blend-mode", "value": "screen" },
    { "selector": ".hero", "property": "filter", "value": "drop-shadow(...)" }
  ]
}
```

## 高返工点深挖

| 高返工点 | 具体症状 | 根因 | 应沉淀成的工具能力 |
| --- | --- | --- | --- |
| DOM 定位不准 | “移除提示”“改标题”“换地图”需要人工搜索多个文件 | HTML 缺少稳定业务 key，patch 没有变体组意识 | `patch-html`，按 `data-i18n-key` / group 同步修改 |
| 修改面不明确 | 改了 generated HTML 后又 rebuild 覆盖 | template 和 workspace HTML 没有状态锁 | `edit-surface` 标记和 rebuild 警告 |
| 多语言同步漏改 | 只改 zh-TW，其他 `index*.html` 保留旧文案/旧图 | 当前语言文件被当作唯一真相 | `html-group-diff` 检查同组结构差异 |
| 图片导出语义混乱 | `batch-export` 生成报告但没有 PNG | export plan 和 real export 没拆开 | `export-plan` / `export-fast` / `export-browser` 三命令 |
| 浏览器出图重 | Playwright/Chrome 启动重，CLI headless 还可能挂 | 高保真渲染和批量低成本导出混用一条链路 | fast renderer + browser fallback |
| 画布高度返工 | 删除底部提示后还要重新缩高度并导出所有语言 | 内容删除没有触发布局/canvas 影响分析 | `layout-impact-report`，提示 height/exports 需刷新 |
| 文本可编辑性回退 | 标签视觉存在但不可选、不可本地化 | CSS 事件层或 SVG/path 化破坏文本所有权 | `dom-contract-check` 检查 selectable/i18n/business keys |
| 地图坐标返工 | 加国家名后坐标密集、微型国家重叠 | 坐标没有报告、没有 omitted reason | `label-coordinate-report` + grid preview |
| 语言排版返工 | 日文、泰文、俄文长文溢出；数字圈撑开 | base CSS 被当作所有语言通用 | `locale-typography-profile` 和 cell overflow 检查 |
| asset 路径返工 | OneDrive symlink、repo-relative、workspace-relative 混用 | 图片复制和引用缺少统一 resolver | `asset-resolve-report` 同时验证 symlink path 与 real path |
| Figma 数值丢失 | 视觉调了一轮又一轮，缺少 x/y/w/h 真值 | 设计参数未结构化入库 | `figma-metrics.json` 或 `layout.json` 作为 CSS token 源 |
| 参考图误用 | 看起来像复刻，但其实只是整图贴进去 | reference/base/editable layer 没分清 | `layer-ownership-report`，列出 image/text/svg 所有权 |
| 评分不可复用 | 每轮 screenshot 和人工评价散落 | 分数、截图、修改点没形成下一轮输入 | `round-review.json` 记录最低分项和下一步 patch |

## 返工流程地图：哪些阶段最耗精力

### A. 输入准备阶段：资料没有结构化，后面每一轮都重问

真实迹象：

- 早期已经形成 `platform_spec.xlsx`、`sku_info.xlsx`、`copy_master.xlsx`、`assets/graphics`、`assets/hero`、`assets/product`、`layout.json` 这些规划词汇，但当前仓库仍主要依赖 `data/copy_master.json` 和模板字段。
- 多语言 poster 里，同一个视觉母版会牵涉标题、国家名、运营商、免责声明、字体栈、画布尺寸、导出倍率等多个维度。缺任何一个，后面都要返工。

返工成本：

- 文案字段缺失会导致模板里硬编码，后续本地化要逐文件改。
- 设计尺寸缺失会导致先按默认 canvas 做，后来发现参考图实际尺寸不同，需要重调所有绝对坐标。
- asset 角色没定义清楚时，会反复出现“参考图被当底图”“新人物 PNG 和旧装饰重复”的问题。

建议改进：

```text
npm run intake:init -- --project <project-id>
npm run intake:check -- --project <project-id>
```

`intake:check` 应输出 `reports/intake-report.json`：

```json
{
  "status": "pass",
  "project_id": "africa-esim-map",
  "required_inputs": {
    "canvas": true,
    "copy_master": true,
    "language_list": true,
    "asset_roles": true,
    "reference_image": true,
    "figma_metrics": false
  },
  "warnings": [
    "figma_metrics missing: visual matching may require manual coordinate tuning"
  ]
}
```

### B. 布局指定阶段：没有 token 化，CSS 里反复手调数字

真实迹象：

- Africa poster 里 Figma/Telegram 讨论过 `Source Han Sans SC`、正文色 `#282828`、标题色 `#475786`，这些是验收关键，但如果只留在聊天里，后续 Agent 容易重新调色。
- Coverage table 依赖 `--coverage-row-height`、左右表行数、地图层 z-index、表格边框颜色。任何一个变量手改错，都会让多语言表格重新返工。

返工成本：

- 视觉数字分散在 CSS 中，无法知道“哪个数字来自 Figma，哪个是临时补丁”。
- 用户要求“缩小高度”“对齐到 Figma”时，Agent 只能靠肉眼和搜索。

建议改进：

```text
working/layout-tokens.json
reports/layout-token-report.json
```

示例：

```json
{
  "canvas": { "width": 1404, "height": 1120 },
  "colors": {
    "title": "#475786",
    "body": "#282828",
    "grid": "rgba(90, 79, 64, .20)"
  },
  "typography": {
    "zh": { "family": "Source Han Sans SC", "titleSize": 54, "bodySize": 24 },
    "ja": { "family": "Noto Sans JP", "titleSize": 48, "bodySize": 22 }
  },
  "tables": {
    "coverageRowHeight": 57,
    "leftRows": 10,
    "rightRows": 9
  }
}
```

### C. DOM 修改阶段：缺少可寻址节点，改图变成全文搜索

真实迹象：

- Africa disclaimer 的高效定位最终依赖 `data-i18n-key="disclaimer"` 和 `rg index*.html`，说明有 key 的节点很好改，无 key 的节点会变成大海捞针。
- Europe map labels 早期只有视觉 `span.map-label`，后续才补 `data-country-code` / `data-i18n-key` 的方向。

返工成本：

- 用户一句“把这个提示删掉”“这个国家名不准”，如果 DOM 没有 key，Agent 要先猜文本、猜语言、猜文件，再改。
- 同一 html group 的多语言变体结构如果不一致，patch 无法安全批量应用。

建议改进：

每个可改业务节点必须有一个稳定定位键：

```html
<h1 data-i18n-key="title">非洲多國eSIM 可用地區一覽</h1>
<p class="notice" data-i18n-key="disclaimer">...</p>
<strong data-country-code="CD" data-i18n-key="country.cd">民主剛果</strong>
<span data-carrier-code="airtel-ng" data-i18n-key="carrier.airtel_ng">Airtel Nigeria</span>
```

新增检查：

```bash
npm run dom-key-audit -- --project <project-id>
```

报告应指出“可见文本但无 key”的节点，而不是只数总量。

### D. 多语言阶段：一个语言过了，不代表整组过了

真实迹象：

- `data/copy_master.json` 里 Africa map 当前有 `zh-hk / zh-tw / zh-sg / en / ja / ko / th / ru` 八个语言变体。
- Japanese poster 曾经出现 `1.25GB` 圆形容器溢出，需要 `.lang-ja` 的 size/weight/width 覆盖。
- Thai、Russian、Korean 这类长文本或不同字体脚本，也会有相似风险。

返工成本：

- 用户常先验一个主语言，比如 zh-TW；其他语言的导出可能晚些才暴露问题。
- 一旦发现某个语言溢出，可能需要回头改 CSS、重导所有 PNG、重新检查视觉层级。

建议改进：

```bash
npm run locale-risk-scan -- --project <project-id>
```

`locale-risk-scan` 不需要浏览器也能先给风险分：

```json
{
  "html_group": "africa-esim-map",
  "variants": {
    "zh-tw": { "risk": "low", "longestText": 16 },
    "ja": { "risk": "medium", "reasons": ["cjk_font_weight", "long_disclaimer"] },
    "th": { "risk": "high", "reasons": ["long_title", "script_specific_font", "word_break_uncertain"] },
    "ru": { "risk": "medium", "reasons": ["long_carrier_names"] }
  }
}
```

### E. 视觉迭代阶段：每轮截图和评分没有变成下一轮指令

真实迹象：

- Row002 banner 有 `scores/round-05.json`、`scores/round-07.json` 和 `screenshots/round-07-poster.png` 这类轮次产物。
- Travel eSIM poster 的修复信息非常具体：日文标题从 `69/76px + 900` 降到 `64/70px + 800`，`1.25GB` 从 `52px + 900` 降到 `44px + 800`。

返工成本：

- 如果只保留截图，不保留“本轮最低分项”和“下一步 patch”，下一位 Agent 会重新看图、重新判断。
- 人工反馈被自然语言埋在聊天里，不能稳定复用。

建议改进：

```text
scores/round-07.json
reports/next-patch-plan.json
```

`next-patch-plan.json` 示例：

```json
{
  "round": 7,
  "lowest_dimension": "typography",
  "accepted_changes": [
    { "selector": ".lang-ja .data-value", "property": "font-size", "from": "52px", "to": "44px" }
  ],
  "next_patch": [
    { "selector": ".phone-circle", "issue": "number touches ring", "suggested_change": "reduce width to 181px" }
  ],
  "do_not_change": [
    "canonical zh-CN hierarchy",
    "shared asset paths"
  ]
}
```

### F. 导出交付阶段：文件存在不等于交付完成

真实迹象：

- Africa map 的交付面包含 9 个 variant、1x 和 @2x，共 18 个 PNG。
- 最终验收用了 `file` / `sips` 确认尺寸从 `1404x1120 / 2808x2240` 变成 `1404x1064 / 2808x2128`。
- Finder、Telegram、浏览器 preview 都曾作为交付真相面。

返工成本：

- 只看命令成功不够，可能漏某个语言、漏 @2x、漏同步输出目录。
- 用户分享到 Telegram 或素材库时，文件名、尺寸和语言变体必须可读，否则又要返工整理。

建议改进：

```bash
npm run delivery-audit -- --project <project-id>
```

报告：

```json
{
  "status": "pass",
  "expected_variants": ["index", "en", "ja", "ko", "ru", "th", "zh-hk", "zh-sg", "zh-tw"],
  "scales": [1, 2],
  "files": 18,
  "missing": [],
  "dimensions": {
    "1x": "1404x1064",
    "2x": "2808x2128"
  }
}
```

## 当前模板的 fast-render 可行性矩阵

这部分基于当前 `templates/*/master.css` 的实际 CSS 特性扫描。它用于决定低资源 renderer 应先覆盖谁、谁必须先 fallback。

| 模板 | 当前特性 | fast renderer 难度 | 建议 |
| --- | --- | --- | --- |
| `T01_price_type` | 主要是 fixed canvas、absolute、少量 flex | 低 | 第一批支持；适合验证 text/image/box 基础 IR |
| `europe_esim_map` | inline SVG、absolute labels、gradient、transform、box-shadow、`.map-labels { pointer-events: none; }` | 中 | 适合拆成 SVG passthrough + HTML label IR；同时修正 selectable contract |
| `africa_esim_map` | grid/flex table、CSS variables、calc、filter、mix-blend-mode、伪元素、gradient | 中高 | 表格可做 Level 2 profile；map filter/blend 先标记 browser fallback 或转成预处理 PNG |
| `banner_zh_hkmo` | grid/flex、filter、clip-path、mask、伪元素、复杂 transform、drop-shadow | 高 | 不应作为 fast renderer 首批目标；先让 profile report 清晰报 `requires_browser=true` |

关键判断：

- fast renderer 的第一阶段不应追求覆盖 `banner_zh_hkmo`，否则会立刻陷入 CSS 渲染器泥潭。
- `africa_esim_map` 的表格结构值得支持，因为它是高频多语言返工面；但 `filter/mix-blend-mode` 应先转为“资产预处理”问题，不要在 renderer 中硬模拟。
- `europe_esim_map` 是验证“base SVG + editable labels”的好样本，但必须先让 label metadata 和 selectable 状态稳定。

## 改图返工触发器：Agent 应在这些信号出现时自动升级流程

| 用户话术 / 现象 | 不应怎么做 | 应自动触发 |
| --- | --- | --- |
| “把这行字删掉” | 只删当前打开 HTML | `patch-html --key ... --group ...` + `layout-impact-report` |
| “重新导出图” | 只写 `export-report.json` | `delivery-audit` 检查 PNG variant/scale |
| “这个语言看起来怪” | 全局缩小所有文字 | `locale-risk-scan` + per-locale CSS patch |
| “地图颜色/底图不对” | 一直调 CSS filter | 先检查 live HTML asset src 和 source 文件 hash |
| “更多国家名/更准确坐标” | 直接新增一堆 label | `label-coordinate-report` + omitted reasons + overlap check |
| “按 Figma 调” | 靠肉眼改 CSS | `figma-metrics.json` -> layout tokens |
| “这个元素居中” | 改单个 generated HTML | 回到 template 或 layout token，并跑 build/qc |
| 浏览器打开失败 | 继续重试 file URL | 静态 DOM check + browser fallback，不把 file policy 当页面失败 |
| Playwright 很重/卡住 | 删除浏览器验收 | 先 `export-fast`，复杂 CSS 再 `export-browser` |

## 更进一步的技能改进：从规则变成“状态机”

当前 skill 主要靠文字规则约束 Agent。下一步更稳的是让每个项目有一个轻量状态文件：

```text
working/project-state.json
```

示例：

```json
{
  "project_id": "africa-esim-map",
  "active_surface": "workspace-html",
  "active_html_group": "africa-esim-map",
  "rebuild_allowed": false,
  "last_patch_report": "reports/html-patch-report.json",
  "last_export_report": "reports/png-export-report.json",
  "delivery_variants": ["index", "en", "ja", "ko", "ru", "th", "zh-hk", "zh-sg", "zh-tw"],
  "required_scales": [1, 2],
  "known_risks": [
    "direct workspace edits will be overwritten by build",
    "th title is long",
    "africa-map uses mix-blend-mode"
  ]
}
```

这个状态文件能解决三类高返工：

1. 防止 direct HTML edit 后误 rebuild。
2. 防止只导出当前语言。
3. 防止下一轮 Agent 忘记上轮风险。

## 建议写回 `SKILL.md` 的新规则文本

后续工具落地后，可以把以下内容加入 skill，而不是只留在本文档：

```markdown
## Edit Surface Guard

Before editing an existing project, identify the active edit surface:

- `template-source`: edit `templates/<template_id>/...`, then rebuild.
- `workspace-html`: edit generated `html/<html-group>/index*.html`, do not rebuild before export unless explicitly backported.
- `deliverable-copy`: edit self-contained final output only, then sync back or mark as detached.

If the surface is `workspace-html`, patch all variants in the active `html_group` unless the user explicitly asks for one locale only.
Write `reports/html-patch-report.json` before claiming the edit is complete.
```

```markdown
## Export Mode Guard

Never treat an export plan/report as a PNG export.

- `export-plan`: report only.
- `export-fast`: low-resource renderer for poster-render profile.
- `export-browser`: high-fidelity browser export.

When the user asks to "重新导出图", run a real PNG export and then verify files, dimensions, variants, and scale.
```

```markdown
## Rework Prevention Reports

For complex poster edits, prefer reports over prose:

- `intake-report.json`
- `html-patch-report.json`
- `layout-impact-report.json`
- `dom-contract-report.json`
- `locale-risk-report.json`
- `render-profile-report.json`
- `delivery-audit-report.json`

If one of these reports is missing for the affected stage, say which proof is missing instead of claiming the image is done.
```

## 建议的下一轮技能改造顺序

### Phase 1：先解决“精准改 DOM”

这是最先值得做的，因为它不依赖渲染器，且能直接减少返工。

交付：

- `patch-html`
- `html-group-diff`
- `dom-contract-check`
- `reports/html-patch-report.json`

验收：

```bash
npm run patch-html -- --project africa-esim-map --group africa-esim-map --key disclaimer --remove --dry-run
npm run patch-html -- --project africa-esim-map --group africa-esim-map --key disclaimer --remove --apply
npm run dom-contract-check -- --project africa-esim-map
```

### Phase 2：拆分导出语义

先把命令命名和报告改清楚，避免继续把 report-only 当真实导出。

交付：

- `export-plan`
- `export-browser`
- `reports/export-plan-report.json`
- `reports/png-export-report.json`

验收：

```bash
npm run export-plan -- --project africa-esim-map
npm run export-browser -- --project africa-esim-map --scale 2
```

### Phase 3：实现低资源 fast renderer

不要一上来承诺兼容所有模板。先支持 `poster-render profile level 1`，让不支持的 CSS 明确进入 browser fallback。

交付：

- `render-fast`
- `render-profile-report.json`
- `render-ir/*.json`
- `exports/*.png`

验收：

```bash
npm run render:profile -- --project test-default-project
npm run export-fast -- --project test-default-project
```

### Phase 4：把高返工点写回 skill

当 Phase 1-3 有真实命令后，再更新 `skills/text2html-image/SKILL.md`。不要先写规则再没有工具支撑。

应加入：

- 修改 HTML 前先确认 edit surface。
- 共享 copy/layout 改动默认作用于 `html_group` 全体语言。
- `batch-export` 不代表真实 PNG。
- `export-fast` 只支持 poster-render profile，失败时走 `export-browser`。
- 完成前必须报告 DOM contract、render profile、export report。

## 需要避免的方向

- 不要尝试写“通用 HTML/CSS 浏览器渲染器”。
- 不要让 fast renderer 静默忽略不支持的 CSS。
- 不要把 Playwright 完全删除；它仍是高保真和复杂 CSS 的验收兜底。
- 不要继续只靠文档要求 Agent 同步多语言；必须有脚本检查。
- 不要让出图程序反推所有布局；能在 build 阶段生成 IR 就不要事后猜 DOM。

## 推荐最终工作流

```text
build
  -> write html
  -> write render-ir when profile-compatible

patch-html
  -> dry-run DOM patch
  -> apply across html_group variants
  -> write html-patch-report

verify
  -> dom-contract-check
  -> html-group-diff
  -> asset-resolve-report

export
  -> export-fast if render profile passes
  -> export-browser if profile fails or user asks high fidelity
  -> write png-export-report
```

这样可以把 Playwright 从“每次都要启动的默认出图路径”降级为“复杂 CSS/最终验收兜底”，同时把最大返工源头从人工判断转为可回读报告。
