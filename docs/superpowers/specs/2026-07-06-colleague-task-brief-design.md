# 同事抄图任务简报便利化设计

## 背景

同事的对话上下文说明，`text2html-image` 现在已经可以完成图片转可编辑 HTML/CSS、局部改图、多语言版本和预览验证。真正消耗时间的不是核心生成能力，而是每一轮都要重新把自然语言需求翻译成正确的编辑面、覆盖策略、预览交付方式、多语言同步策略、字体规则和导出边界。

这次便利化改造不做 GUI，不重写生成器，不改变静态 HTML/CSS 工作流。它只增加一个低摩擦的任务简报层，让 agent 在开始每轮图片任务前拿到明确约束。

## 目标

- 减少同事反复书写长提示词的成本。
- 在编辑前明确本轮工作模式。
- 默认不生成或覆盖正式 `exports/` 图片，除非用户明确要求。
- 默认把 active `html/index.html` 当作 preview 交付面，改完后主动在对话中输出它的可点击链接和本地绝对路径。
- 只有用户明确要求“只预览不覆盖”、需要多方案比较、或改动方向高风险时，才新建 detached preview 文件。
- 保持改动小、可测试，并沿用现有脚本和报告体系。

## 非目标

- 不构建 GUI 或交互式控制页。
- 不给生成出的 preview 添加 `<script>`。
- 不替代 `visual:intake`、`route:assets`、`prompt:compose`、`audit:*` 或 `export-fast`。
- 不引入完整自动设计生成器。
- 不改变 workspace root 或项目目录布局规则。

## 推荐方案

新增一个轻量任务简报生成器：

```bash
npm run task:brief -- --project task-brief-smoke --mode preview-overwrite --constraint "只输出 active index preview，不做正式 export"
```

命令只写报告，不生成 HTML、CSS、截图或正式导出图：

- `reports/task-brief.json`
- `reports/task-brief.md`

Markdown 供 agent 直接阅读；JSON 供测试和未来自动化使用。

## 核心策略

默认最快路径是：直接更新 active `html/index.html` 与 `html/master.css`，并把 active `index.html` 当作 preview 链接输出给用户。

这样比每轮新建 `preview-*.html` 更快，因为 HTML 本身就是可预览源文件。新建 detached preview 会多出复制、命名、同步回正式稿和解释当前稿/预览稿关系的成本。

detached preview 只在以下情况使用：

- 用户明确说“只预览，不覆盖正式稿”。
- 用户要求 A/B/C 多个方案供选择。
- 改动方向不确定，直接覆盖主稿的返工风险高。
- 需要保留当前主稿作为前后对照。

## 模式

### `faithful-recreate`

用于用户要求从参考图 1:1 还原。

默认规则：

- 参考图是唯一视觉来源。
- 不重新设计、不美化、不简化、不改文案。
- 输出可编辑静态 HTML/CSS。
- 需要时走既有首轮入口：`visual:intake -> route:assets --from-intake -> prompt:compose`。
- 复杂插图、Logo、App icon、人物、地图、手机截图和密集截图必须进入 source-truth bitmap、cutout 或 review 路由，不用近似 CSS 重画冒充。

### `preview-overwrite`

用于用户希望更新当前主 preview。这是最常用、最快的默认模式。

默认规则：

- 允许覆盖 active 项目的 `html/index.html`。
- 允许覆盖 active 项目的 `html/master.css`。
- active `html/index.html` 就是本轮 preview 文件。
- 每轮视觉结果交付时，必须在对话中主动输出 active `index.html` 的可点击链接和本地绝对路径。
- 如果存在截图 preview 或浏览器渲染 preview 图片，也要在对话中主动输出这些 preview 文件链接。
- 除非用户明确要求正式导出，否则不写入或覆盖 `exports/`。

### `preview-only`

用于用户明确要求先看草稿、不要覆盖主稿。

默认规则：

- 不覆盖 canonical `html/index.html` 或 `html/master.css`。
- 写清晰命名的 detached preview 文件，例如 `html/preview-kkday-title.html` 和对应 CSS。
- 每轮交付时，必须在对话中主动输出 detached preview HTML 的可点击链接和本地绝对路径。
- 说明这个 preview 与 canonical 文件是分离的。
- 除非用户明确要求正式导出，否则不写入或覆盖 `exports/`。

### `surgical-edit`

用于窄改，例如只改勾叉、订单编号、一个 badge、一段文案、一个色值或一个字体。

默认规则：

- 只编辑最小受影响 HTML/CSS 表面。
- 修改 workspace HTML 前不 rebuild。
- 除非用户明确限定单语言，否则同步同一 active group 下的兄弟语言版本。
- 不改请求目标之外的版面、间距、图片、颜色、字体、导出文件或其他元素。

### `multilingual-sync`

用于用户要求英文、日文或其他语言版本。

默认规则：

- 从已接受的源语言设计开始。
- 保持版面和视觉层级。
- 只在必要时使用语言限定字体、字距和行高覆盖。
- 检查每个受影响 locale 的分行、溢出和视觉平衡。
- 不为了塞入翻译而过度缩小文字。

### `finalize-export`

只在用户明确要求导出 PNG/JPG/WebP、保存最终图片或交付最终素材时使用。

默认规则：

- 生成真实图片文件，不能只生成 `reports/export-report.json`。
- 验证文件存在、像素尺寸和受影响语言版本。
- 保持 CSS canvas 尺寸不变，用 export scale 提高清晰度。

## 默认输出政策

除非用户明确说要导出最终图片：

- 不创建或覆盖正式 `exports/index.png`。
- 不把 export report 当作已完成图片导出。
- preview 证据必须主动在对话中输出，不只埋在报告里。
- 默认 preview 文件是 active `html/index.html`。
- 如果存在 detached preview HTML、截图 preview 或浏览器渲染 preview 图片，也必须在对话中输出链接。

每轮 preview/edit 交付必须包含：

- active `index.html` 的可点击链接。
- active `index.html` 的纯文本本地绝对路径。
- 任何额外 preview 文件链接，例如 detached preview HTML 或截图 preview 图片。
- `reports/preview-links.md`，如果它存在。
- 明确说明本轮没有执行正式 export，除非用户已经要求 export。

## 数据结构

`task-brief.json` 应包含：

```json
{
  "project_id": "example-project",
  "mode": "preview-overwrite",
  "source_image": "/Users/tashima_meru/Downloads/reference.png",
  "active_html": "/Users/tashima_meru/Documents/text2html-image-project/example-project/html/index.html",
  "preview_files": ["/Users/tashima_meru/Documents/text2html-image-project/example-project/html/index.html"],
  "detached_preview": false,
  "allowed_writes": ["html/index.html", "html/master.css"],
  "forbidden_writes": ["exports/*"],
  "export_allowed": false,
  "rebuild_allowed": false,
  "multilingual_sync": {
    "enabled": false,
    "locales": []
  },
  "required_handoff": [
    "explicit_preview_file_links_in_conversation",
    "clickable_index_html_link",
    "plain_absolute_index_html_path",
    "preview_links_report_if_present",
    "export_skipped_note"
  ],
  "verification": [
    "read active HTML/CSS after edit",
    "refresh or screenshot browser preview when visual layout changes",
    "run targeted audit only when it catches the current failure mode"
  ]
}
```

`preview-only` 模式中，`detached_preview` 为 `true`，`preview_files` 指向 detached preview HTML，而不是 canonical `html/index.html`。

## CLI 行为

- `--mode` 必填。
- `--project` 必填。
- `faithful-recreate` 模式下 `--source-image` 必填。
- `--html` 可选；如果省略，命令解析项目下最可能的 active `html/index.html`。
- `--constraint` 可以重复传入，并进入 brief 的硬约束列表。
- 未知模式必须失败。
- 命令只写 `task-brief` 报告，不创建 HTML、CSS、截图或正式导出图。
- 命令要记录预期 preview 文件，方便 agent 在后续编辑或渲染后主动输出到对话中。

## 文档更新

在现有 preview 和 execution-flow 说明附近补充：

- 当用户意图混合了 preview、覆盖、多语言同步或 export 规则时，先用 `task:brief`。
- `task:brief` 不替代现有 workflow 命令。
- 默认 active `html/index.html` 就是 preview。
- detached preview 只用于用户明确要求不覆盖、多方案比较或高风险试改。
- 正式 export 仍然需要用户明确要求。
- 只要 preview 文件存在，就要在用户可见回复里显式输出链接。

## 测试要求

在 `scripts/test.js` 中覆盖：

- `package.json` 暴露 `task:brief`。
- 每个已知 mode 都产出预期的 allowed/forbidden write policy。
- `preview-overwrite` 允许 `html/index.html` 和 `html/master.css`，禁止 `exports/*`，并设置 `export_allowed: false`。
- `preview-overwrite` 设置 `detached_preview: false`，并把 active `index.html` 放进 `preview_files`。
- `preview-only` 设置 `detached_preview: true`，并要求在用户可见交付中输出 detached preview 文件链接。
- `finalize-export` 设置 `export_allowed: true`。
- 未知 mode 失败。
- Markdown 输出包含 active `index.html` 交付要求和主动输出 preview 文件链接的要求。

## 实施边界

这是一个小型增量改造：

- 新增 `scripts/task-brief.js`
- 新增 `scripts/utils/task-brief-core.js`
- 新增 package script：`task:brief`
- 小范围更新 `SKILL.md`、`README.md`、`references/execution-flow.md`
- 小范围更新 `scripts/test.js`

不要在这个任务里重构 build、render、audit 或 asset-routing 系统。
