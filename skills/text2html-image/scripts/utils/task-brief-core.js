const fs = require('fs');
const path = require('path');
const { toFileUrl, toMarkdownLink, writeJson } = require('./workflow-core');

const MODES = {
  'faithful-recreate': {
    detachedPreview: false,
    exportAllowed: false,
    rebuildAllowed: false,
    allowedWrites: ['html/index.html', 'html/master.css', 'source/*', 'reports/*'],
    forbiddenWrites: ['exports/*'],
    handoff: ['explicit_preview_file_links_in_conversation', 'clickable_index_html_link', 'plain_absolute_index_html_path', 'preview_links_report_if_present', 'export_skipped_note'],
    workflowHints: ['visual:intake -> route:assets --from-intake -> prompt:compose'],
  },
  'preview-overwrite': {
    detachedPreview: false,
    exportAllowed: false,
    rebuildAllowed: false,
    allowedWrites: ['html/index.html', 'html/master.css'],
    forbiddenWrites: ['exports/*'],
    handoff: ['explicit_preview_file_links_in_conversation', 'clickable_index_html_link', 'plain_absolute_index_html_path', 'preview_links_report_if_present', 'export_skipped_note'],
    workflowHints: ['active html/index.html is the default preview surface'],
  },
  'preview-only': {
    detachedPreview: true,
    exportAllowed: false,
    rebuildAllowed: false,
    allowedWrites: ['html/preview-*.html', 'html/preview-*.css'],
    forbiddenWrites: ['html/index.html', 'html/master.css', 'exports/*'],
    handoff: ['explicit_preview_file_links_in_conversation', 'detached_preview_html_link', 'plain_absolute_preview_html_path', 'export_skipped_note'],
    workflowHints: ['detached preview is only for no-overwrite drafts or option sets'],
  },
  'surgical-edit': {
    detachedPreview: false,
    exportAllowed: false,
    rebuildAllowed: false,
    allowedWrites: ['html/index.html', 'html/master.css', 'html/index.*.html'],
    forbiddenWrites: ['exports/*'],
    handoff: ['explicit_preview_file_links_in_conversation', 'clickable_index_html_link', 'plain_absolute_index_html_path', 'export_skipped_note'],
    workflowHints: ['patch the smallest active HTML/CSS surface; do not rebuild before direct workspace edits'],
  },
  'multilingual-sync': {
    detachedPreview: false,
    exportAllowed: false,
    rebuildAllowed: false,
    allowedWrites: ['html/index.html', 'html/index.*.html', 'html/master.css'],
    forbiddenWrites: ['exports/*'],
    handoff: ['explicit_preview_file_links_in_conversation', 'clickable_index_html_link', 'plain_absolute_index_html_path', 'locale_preview_links', 'export_skipped_note'],
    workflowHints: ['keep sibling locale variants synchronized unless scoped to one language'],
  },
  'finalize-export': {
    detachedPreview: false,
    exportAllowed: true,
    rebuildAllowed: false,
    allowedWrites: ['exports/*', 'reports/*'],
    forbiddenWrites: [],
    handoff: ['export_file_links', 'export_dimensions', 'source_html_path'],
    workflowHints: ['produce real image files; export reports alone are not deliverables'],
  },
};

function normalizeRepeated(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return [String(value).trim()].filter(Boolean);
}

function resolveActiveHtml(projectPaths, htmlPath) {
  if (!htmlPath) return path.join(projectPaths.html, 'index.html');
  const value = String(htmlPath);
  return path.isAbsolute(value) ? path.resolve(value) : path.join(projectPaths.html, value);
}

function sanitizePreviewName(previewName) {
  const baseName = String(previewName || 'preview-draft');
  const safeName = baseName
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return safeName || 'preview-draft';
}

function resolvePreviewFiles({ projectPaths, mode, activeHtml, previewName }) {
  if (mode === 'preview-only') {
    const safeName = sanitizePreviewName(previewName);
    return [path.join(projectPaths.html, `${safeName}.html`)];
  }
  return activeHtml ? [activeHtml] : [];
}

function buildTaskBrief(options = {}) {
  const projectPaths = options.projectPaths || {};
  if (!projectPaths.html || !projectPaths.reports) {
    throw new Error('projectPaths must include html and reports paths');
  }

  const mode = String(options.mode || 'preview-overwrite');
  const modeSpec = MODES[mode];
  if (!modeSpec) {
    throw new Error(`Unknown task brief mode: ${mode}`);
  }

  if (mode === 'faithful-recreate' && !options.sourceImage) {
    throw new Error('sourceImage is required for faithful-recreate mode.');
  }

  const activeHtml = resolveActiveHtml(projectPaths, options.activeHtml || options.htmlPath);
  const sourceImage = options.sourceImage ? path.resolve(String(options.sourceImage)) : null;
  const previewFiles = resolvePreviewFiles({
    projectPaths,
    mode,
    activeHtml,
    previewName: options.previewName,
  });

  const locales = normalizeRepeated(options.locales);
  const constraints = normalizeRepeated(options.constraints);

  return {
    generated_at: new Date().toISOString(),
    project_id: projectPaths.project_id,
    subproject_id: projectPaths.subproject_id || null,
    mode,
    source_image: sourceImage,
    active_html: activeHtml,
    active_html_file_url: toFileUrl(activeHtml),
    active_html_markdown_link: toMarkdownLink(activeHtml),
    preview_files: previewFiles,
    preview_file_urls: previewFiles.map(toFileUrl),
    preview_markdown_links: previewFiles.map(toMarkdownLink),
    detached_preview: modeSpec.detachedPreview,
    allowed_writes: [...modeSpec.allowedWrites],
    forbidden_writes: [...modeSpec.forbiddenWrites],
    export_allowed: modeSpec.exportAllowed,
    rebuild_allowed: modeSpec.rebuildAllowed,
    multilingual_sync: {
      enabled: mode === 'multilingual-sync' || locales.length > 0,
      locales,
    },
    constraints,
    required_handoff: [...modeSpec.handoff],
    workflow_hints: [...modeSpec.workflowHints],
    verification: [
      'read active HTML/CSS after edit',
      'refresh or screenshot browser preview when visual layout changes',
      'run targeted audit only when it catches the current failure mode',
    ],
  };
}

function renderTaskBriefMarkdown(brief) {
  const lines = [
    '# Task Brief',
    '',
    `- Project: ${brief.project_id || 'unknown'}${brief.subproject_id ? ` / ${brief.subproject_id}` : ''}`,
    `- Mode: ${brief.mode || 'unknown'}`,
    `- Generated: ${brief.generated_at || 'unknown'}`,
    `- Detached preview: ${brief.detached_preview ? 'Yes' : 'No'}`,
    '',
    '## 核心要求',
    '',
    '1) 主动输出 preview 文件链接',
    '',
    `- Active HTML: \`${brief.active_html}\``,
    `- Active HTML file URL: \`${brief.active_html_file_url}\``,
    `- Active HTML markdown link: ${brief.active_html_markdown_link}`,
    '',
    '## Preview files',
    '',
  ];

  for (const previewFile of brief.preview_files || []) {
    const previewUrl = toFileUrl(previewFile);
    const previewLink = toMarkdownLink(previewFile);
    lines.push(`- ${previewFile}`);
    lines.push(`  - Markdown link: ${previewLink}`);
    lines.push(`  - File URL: \`${previewUrl}\``);
  }

  if (!brief.export_allowed) {
    lines.push('', '本轮默认不执行正式 export');
  } else {
    lines.push('', 'Formal export is allowed for this round.');
  }

  return `${lines.join('\n')}\n`;
}

function writeTaskBrief({ projectPaths, brief }) {
  if (!projectPaths || !projectPaths.reports) {
    throw new Error('projectPaths with reports path is required');
  }
  fs.mkdirSync(projectPaths.reports, { recursive: true });
  const jsonPath = path.join(projectPaths.reports, 'task-brief.json');
  const markdownPath = path.join(projectPaths.reports, 'task-brief.md');
  writeJson(jsonPath, brief);
  fs.writeFileSync(markdownPath, renderTaskBriefMarkdown(brief), 'utf8');
  return { jsonPath, markdownPath, brief };
}

module.exports = {
  MODES,
  normalizeRepeated,
  resolveActiveHtml,
  resolvePreviewFiles,
  buildTaskBrief,
  renderTaskBriefMarkdown,
  writeTaskBrief,
};
