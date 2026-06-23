# text2html-image

`text2html-image` 是基于 HTML/CSS 的跨境电商图片生产工作流。仓库内的 Codex skill 源文件位于 `skills/text2html-image/`，运行时项目文件默认写入用户文稿目录下的 `text2html-image-project` 工作区，而不是写回仓库根目录。

典型项目目录：

```text
<Documents>/text2html-image-project/<project-id>/
<Documents>/text2html-image-project/<project-id>/<subproject-id>/
```

本仓库支持多语言 HTML 变体，例如 `index.<lang>.html`。预览时可以直接打开生成文件的 `file://` URL；如果已经在 Codex Browser 中打开了预览页，修改 HTML/CSS 后刷新当前 Codex Browser 页面即可重新检查。图片未完成前保持该预览页打开，直到用户确认导出结果可以交付。

## 直接 HTML 出图

```bash
npm run render:profile -- --project <project-id> [--group <html-group>]
npm run export-fast -- --project <project-id> [--group <html-group>] [--scale 2]
```

`export-fast` 不通过浏览器截图。它读取生成后的 `html/<html-group>/index*.html`，按受限 poster-render profile 编译为 SVG，再用 `@resvg/resvg-js` 栅格化为 PNG。输出文件包括：

```text
working/render-svg/<html-group>-<variant>.svg
exports/<html-group>-<variant>.png
reports/render-profile-report.json
reports/png-export-report.json
```

如果 HTML/CSS 使用当前 profile 不支持的能力，例如 `grid`、复杂 `flex`、`filter`、`mix-blend-mode`、`clip-path`、视觉伪元素或媒体查询，命令会在报告中标记失败，不会生成伪 PNG。需要高保真浏览器渲染时，应把它作为单独的兜底流程，而不是把 `batch-export` 报告当作图片导出。
