# text2html-image

`text2html-image` 是基于 HTML/CSS 的跨境电商图片生产工作流。仓库内的 Codex skill 源文件位于 `skills/text2html-image/`，运行时项目文件默认写入用户文稿目录下的 `text2html-image-project` 工作区，而不是写回仓库根目录。

典型项目目录：

```text
<Documents>/text2html-image-project/<project-id>/
<Documents>/text2html-image-project/<project-id>/<subproject-id>/
```

本仓库支持多语言 HTML 变体，例如 `index.<lang>.html`。预览时可以直接打开生成文件的 `file://` URL；如果已经在 Codex Browser 中打开了预览页，修改 HTML/CSS 后刷新当前 Codex Browser 页面即可重新检查。图片未完成前保持该预览页打开，直到用户确认导出结果可以交付。
