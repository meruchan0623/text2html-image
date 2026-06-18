# 复杂图片嵌字与 HTML 化复盘：text2html-image 技能优化建议

本文基于欧洲 eSIM 覆盖地图复刻过程整理，目标是把这次踩过的坑转化为 `text2html-image` skill 的可执行规则。重点不是总结“做得像不像”，而是沉淀复杂海报、地图、嵌字图片在 HTML 化时更稳的工作方法。

## 背景案例

本次案例是一张欧洲地图海报，目标从“复刻整张图”逐步收敛为“保留底图，只嵌入可编辑国家名”。最终实践中涉及：

- 静态海报 HTML：固定画布、无运行时脚本。
- 复杂地图底图：无法低成本手写精确 SVG 国界。
- 可替换文字：国家名必须是真实 HTML 文本，可选中，可多语言替换。
- 标签定位：从手调坐标、OpenCV 色块识别，升级到 GIS 真值层加校准。
- 输出目录：生成器仓库和图片项目产物目录容易混淆。

## 已踩坑

### 1. 误把参考图当成最终网页素材

问题：早期复刻容易直接把参考图放进网页，然后在视觉上“看起来正确”。  
后果：这不是 HTML 化，只是贴图；文字不可编辑，结构不可复用，也无法多语言替换。

技能规则应明确：如果用户说“复刻”“抄图”“HTML 化”，必须区分：

- `reference image`：只作为视觉参考。
- `base asset`：用户明确允许作为底图时才可进入页面。
- `editable layer`：文字、价格、CTA、标签、说明必须优先保持 HTML/CSS/SVG。

### 2. 复杂地图不应一开始强行全 SVG 化

问题：欧洲地图的国界、海岸线、地标和地球弧面都很复杂，完全用 SVG path 重建会消耗大量时间，而且容易出现形变。  
后果：路径数量很多，但最终视觉和可维护性都不稳定。

更稳的方法是混合分层：

- 复杂且不需要编辑的图形：作为一张透明或完整底图。
- 必须替换的文字：HTML 文本层。
- 必须可程序定位的元素：单独生成报告和调试图。

对复杂地图类图片，skill 应默认推荐“底图 + 可编辑标签层”，除非用户明确要求全矢量化。

### 3. 文字所有权容易被 CSS 或 SVG 破坏

问题：标签曾经视觉存在，但用户发现无法选中。常见原因是文字被做进图片/SVG path，或者父层用了不合适的 `pointer-events` / `user-select`。  
后果：看起来有文字，实际上不能复制、不能替换、不能本地化。

技能规则应增加硬性检查：

- 所有业务文字必须是 DOM 文本节点。
- 标签节点必须带稳定 metadata，例如 `data-country-code` 和 `data-i18n-key`。
- `.map-label` 等文字层必须保留 `user-select: text`。
- 验收时检查 DOM 标签数量、metadata 数量和 CSS selectable 状态。

### 4. OpenCV 适合找色块，不适合识别国家身份

问题：用 OpenCV/Pillow 从位图提取国家色块，可以找到颜色区域，但它不知道哪个色块是哪个国家。  
后果：小国漏标、邻国串色、狭长国家中心点偏到细腰处，奥地利/保加利亚等标签容易歪。

更稳的定位策略：

- OpenCV：作为视觉辅助，提取色块中心、宽度、调试图。
- GIS 数据：作为国家身份和边界真值。
- 人工控制点：用于把 GIS 边界校准到艺术化海报。
- 标签算法：在 polygon 内寻找可放入文本 bbox 的位置。

技能应把“位图识别”和“真值几何”分清楚：OpenCV 不负责最终语义判断。

### 5. 标签坐标不能只用几何中心

问题：挪威、瑞典、芬兰、意大利、希腊这类狭长或不规则国家，几何中心不等于可读标签中心。  
后果：标签落在狭窄腰部、海岸边、国界外，视觉上像标错国家。

复杂地图标签应采用混合评分：

- 大且方正国家：优先 polygon centroid 或 representative point。
- 狭长国家：扫描水平切片，选可用宽度最大的位置。
- 小国：按标签 bbox 是否能放入主体色块判断，不按面积硬放。
- 微型国家：允许省略，并在报告中标记 `omitted_micro_country`。

### 6. “更多标签”不是无条件把所有国家都标上

问题：用户要求更多国家名，但地图上巴尔干、小岛、微型国家非常密集。  
后果：强行标全会造成重叠、跨国界、遮挡主体。

技能应把目标改成“面积合适且标签可读的国家尽量标出”，而不是“所有国家都标出”。省略必须可解释：

- `omitted_micro_country`
- `omitted_too_small_to_fit`
- `omitted_label_box_outside_polygon`
- `omitted_no_gis_geometry`

### 7. 浏览器验证不能只看截图

问题：截图只能说明视觉近似，不能说明 HTML 是否满足可编辑、无脚本、单底图等约束。  
后果：容易通过视觉验收，但丢失 HTML 化价值。

复杂图片 HTML 化至少应做两类验收：

- DOM 合同：画布尺寸、图片数量、脚本数量、标签数量、metadata 数量。
- 视觉合同：截图、调试层、坐标报告、边界覆盖图。

本案例中有效的快速合同包括：

```text
poster: 1116 x 1410
document.images.length: 1
document.scripts.length: 0
.map-label count: expected count
data-country-code count == .map-label count
data-i18n-key count == .map-label count
user-select: text
```

### 8. file:// 浏览器策略可能阻断自动验证

问题：Codex in-app browser 可能拒绝访问某些 `file://` 路径。  
后果：不能把“浏览器验证失败”误判成页面失败。

技能应规定 fallback：

- 首选当前浏览器真实预览。
- 若 `file://` 被策略阻断，改用静态 DOM 检查加 Playwright/系统浏览器截图。
- 若 Playwright 不可用，再用 PIL 生成预览图，但必须说明 PIL 预览不等于 DOM 渲染验收。

### 9. 输出目录和生成器仓库容易混淆

问题：本次多次混淆了 `/Develop/text2html-image` 仓库、OneDrive 文档目录、Codex 临时输出目录。  
后果：可能把生成器配置文件放进图片项目目录，或者把图片项目产物散落在多个地方。

skill 应明确三种目录：

- `repo root`：生成器代码、模板、脚本、配置，只放在仓库。
- `project output root`：只放图片项目。
- `scratch output`：Codex 临时实验目录，可用于探索，但最终要回收到图片项目。

图片项目目录里不应出现生成器配置文件，例如 `workflow.config.json`、`package.json`、技能文件、全局 manifest。项目内部只放运行所需产物。

## 建议加入 Skill 的新规则

### 复杂图片分层规则

当图片包含复杂地图、建筑群、地球、插画背景、人物或大量非编辑图形时，默认采用分层复刻：

```text
base image layer: 复杂不可编辑视觉
editable text layer: 所有需要复制、替换、多语言化的文字
editable vector layer: 形状简单且需要调整的图标、按钮、进度条、边框
debug/report layer: 坐标、识别、评分和验收报告，不进入最终页面
```

只有在用户明确要求全 SVG / 全 CSS 时，才尝试完整矢量化复杂底图。

### 文本可编辑性硬规则

在完成前必须检查：

```text
业务文字不是图片
业务文字不是 path outline
业务文字不是 canvas 绘制
业务文字可选中
需要本地化的文字有 data-i18n-key
列表/地图/标签类文字有稳定业务 key
```

对于地图国家名，推荐：

```html
<span class="map-label" data-country-code="FR" data-i18n-key="country.fr">法國</span>
```

### 复杂地图标签流程

如果用户要求地图国家、城市、区域标签准确嵌字，skill 应优先选择：

1. 找到或保留干净底图。
2. 把所有标签从底图中移除或使用无字底图。
3. 用 HTML 文本叠加标签。
4. 对普通图片用视觉 seed + OpenCV 估计色块。
5. 对真实地理对象用 GIS/矢量边界作为语义真值。
6. 对艺术化地图用控制点校准 GIS 到画布。
7. 输出坐标报告和调试图。

推荐输出：

```text
index.html
style.css
assets/base-map.png
label-coordinate-report.json
label-coordinate-debug.png
可选: gis-calibration-report.json
可选: gis-boundary-debug.svg
可选: gis-boundary-debug.png
preview.png
```

### 标签定位评分标准

标签位置不应只由中心点决定，应综合评分：

```text
label bbox inside target region ratio
distance to polygon boundary
distance to visual centroid
available horizontal width
overlap with existing labels
font size readability
country priority or force-label rule
```

对于小国或密集区域，允许省略，但报告必须说明原因。

### 验收合同

复杂图片 HTML 化完成前，skill 应要求报告这些值：

```text
canvas size
image count
script count
editable text count
i18n metadata count
selectable text status
source asset path
preview path
report path
known omissions
```

地图类还应报告：

```text
label count
included labels
omitted labels with reason
coordinate source: manual | opencv | gis-calibrated
debug overlay path
```

## 建议修改当前 SKILL.md 的位置

### Project Workspace

应把当前“所有运行文件都在 `<Documents>/text2html-image/projects/<project-id>`”改成更浅的图片项目目录规则，例如：

```text
<Documents>/text2html-image-project/<project-id>/
├── source/
├── html/
├── screenshots/
├── scores/
├── reports/
├── exports/
└── working/
```

项目目录内不写 `project-manifest.json`。报告类 JSON 可以放在 `reports/`，但不要把全局配置、技能配置或仓库配置复制进图片项目目录。

### 抄图复刻流程

建议在现有 loop 前增加“分层决策”：

```text
Before coding, decide which parts are bitmap base assets and which parts must be editable HTML/SVG.
If text editability is required, never use OCR output as final rendered pixels.
If a clean no-text base image is available, prefer base image + editable text overlay.
```

### Browser/multimodal boundary

建议补充：

```text
If Codex Browser cannot open file:// due to browser policy, use static DOM checks plus Playwright/system screenshot fallback.
Do not treat browser policy failure as a page failure.
```

### Stop Conditions

建议新增停止条件：

```text
Required text exists only in an image or SVG outline.
Text labels are not selectable.
Expected i18n metadata is missing.
Output was written to the repo root or wrong project folder.
Complex map labels lack coordinate/report/debug artifacts.
The page visually matches but DOM contract fails.
```

## 推荐工作习惯

### 先问“文字归谁所有”

复杂图片里最重要的第一问不是“能不能画出来”，而是“哪些内容未来要改”。要改的内容必须归 HTML/SVG DOM 所有；不用改的复杂视觉才归图片底图所有。

### 不要过早全自动化

OpenCV、Pillow、GIS、OCR、多模态都应当是辅助工具，不应单独决定最终业务语义。复杂图的稳态通常来自：

```text
机器提取候选
结构化真值约束
少量人工控制点
可审计报告
真实 DOM 验收
```

### 把“失败原因”写进产物

省略小国、降字号、移动标签、换用底图，都应进入 JSON 报告。否则下一轮会重新争论同一个视觉问题。

### 把临时实验和正式项目分开

Codex 输出目录适合快速实验；正式交付要回收到图片项目目录。技能应避免让实验目录、仓库目录、项目目录三者混在一起。

## 可直接加入 Skill 的短版补丁

```markdown
## Complex Image Layering

For complex posters, maps, landmarks, illustrated backgrounds, or dense visual assets, decide layer ownership before coding:

- Keep non-editable complex visuals as base images when full vector recreation is not required.
- Keep all user-facing text as real HTML/SVG text, never as raster pixels or path outlines, unless the user explicitly accepts flattened text.
- For map/region labels, use stable metadata such as `data-country-code` and `data-i18n-key`.
- Generate coordinate/debug reports for algorithmic label placement.

Before completion, report canvas size, image count, script count, editable text count, i18n metadata count, selectable text status, preview path, and known omissions.
```

```markdown
## Map Label Placement

For geographic or region-label images, do not rely on bitmap color segmentation as semantic truth. Use OpenCV/Pillow only for visual hints. Prefer GIS/vector boundaries or a user-provided label table as the truth layer, then calibrate it to the poster with control points.

Choose label anchors by scoring whether the label bbox fits inside the target region, available horizontal width, distance from boundaries, overlap with other labels, and readability. Omit tiny regions when labels cannot fit, and write the omission reason to the coordinate report.
```

```markdown
## Output Workspace

Generated image projects should live under one shallow project folder:

`<Documents>/text2html-image-project/<project-id>/`

Do not place repo configuration, skill files, package files, or global manifests inside image project folders. Keep only source assets, editable HTML/CSS, screenshots, scores, reports, exports, and working files needed for that image project.
```
