const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..', '..');
const PROJECT_DIRS = ['source', 'working', 'html', 'screenshots', 'scores', 'exports', 'reports'];
const MAX_PROJECT_SLUG_LENGTH = 20;
const MAX_PROJECT_FOLDER_NAME_LENGTH = 80;

function readJson(relativePath) {
  const target = path.isAbsolute(relativePath) ? relativePath : path.join(ROOT, relativePath);
  return JSON.parse(fs.readFileSync(target, 'utf8'));
}

function writeJson(targetPath, value) {
  const target = path.isAbsolute(targetPath) ? targetPath : path.join(ROOT, targetPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function ensureDir(relativePath) {
  fs.mkdirSync(path.join(ROOT, relativePath), { recursive: true });
}

function loadConfig() {
  return readJson('workflow.config.json');
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function getUserDocumentsDir() {
  return path.join(os.homedir(), 'Documents');
}

function expandHome(inputPath) {
  if (!inputPath) return inputPath;
  if (inputPath === '$REPO') return ROOT;
  if (inputPath.startsWith('$REPO/')) return path.join(ROOT, inputPath.slice('$REPO/'.length));
  if (inputPath === '$DOCUMENTS') return getUserDocumentsDir();
  if (inputPath.startsWith('$DOCUMENTS/')) return path.join(getUserDocumentsDir(), inputPath.slice('$DOCUMENTS/'.length));
  if (inputPath === '~') return os.homedir();
  if (inputPath.startsWith('~/')) return path.join(os.homedir(), inputPath.slice(2));
  return inputPath;
}

function sanitizeProjectId(projectId, fallback = 'default') {
  const value = String(projectId || fallback).trim().toLowerCase();
  const words = value.match(/[a-z0-9]+/g) || [];
  let sanitized = '';
  for (const word of words) {
    const candidate = sanitized ? `${sanitized}-${word}` : word;
    if (candidate.length > MAX_PROJECT_SLUG_LENGTH) break;
    sanitized = candidate;
  }
  if (!sanitized && words[0]) sanitized = words[0].slice(0, MAX_PROJECT_SLUG_LENGTH);
  return sanitized || fallback;
}

function truncateFolderName(value, maxLength = MAX_PROJECT_FOLDER_NAME_LENGTH) {
  if (value.length <= maxLength) return value;
  const truncated = value.slice(0, maxLength).replace(/-+$/g, '');
  return truncated || value.slice(0, maxLength);
}

function sanitizeProjectFolderName(projectId, fallback = 'default') {
  const value = String(projectId || fallback).trim();
  const normalized = value
    .normalize('NFKC')
    .replace(/[\\/:\0]/g, '-')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .replace(/[-_]{2,}/g, '-');
  return truncateFolderName(normalized || fallback);
}

function getWorkspaceRoot(config = loadConfig()) {
  return path.resolve(expandHome(config.workspace_root || '$DOCUMENTS/text2html-image-project'));
}

function getProjectPaths(projectId, config = loadConfig(), options = {}) {
  const safeProjectId = sanitizeProjectFolderName(projectId || config.default_project_id || 'default');
  const safeSubprojectId = options.subprojectId ? sanitizeProjectFolderName(options.subprojectId, '') : '';
  const workspaceRoot = getWorkspaceRoot(config);
  const projectRoot = path.join(workspaceRoot, safeProjectId);
  const activeRoot = safeSubprojectId ? path.join(projectRoot, safeSubprojectId) : projectRoot;
  const paths = {
    project_id: safeProjectId,
    subproject_id: safeSubprojectId || undefined,
    workspace_root: workspaceRoot,
    project_root: projectRoot,
    root: activeRoot,
  };
  const manifestFile = config.project_directory_schema?.manifest_file;
  if (manifestFile) paths.manifest = path.join(activeRoot, manifestFile);
  for (const dir of config.project_directory_schema?.directories || PROJECT_DIRS) {
    paths[dir] = path.join(activeRoot, dir);
  }
  return paths;
}

function createProjectWorkspace(projectId, options = {}) {
  const config = loadConfig();
  const paths = getProjectPaths(projectId, config, { subprojectId: options.subprojectId });
  fs.mkdirSync(paths.root, { recursive: true });
  for (const dir of config.project_directory_schema?.directories || PROJECT_DIRS) {
    fs.mkdirSync(paths[dir], { recursive: true });
  }

  if (paths.manifest && (!fs.existsSync(paths.manifest) || options.refreshManifest)) {
    writeJson(paths.manifest, {
      project_id: paths.project_id,
      subproject_id: paths.subproject_id,
      created_at: new Date().toISOString(),
      workspace_root: paths.workspace_root,
      project_root: paths.project_root,
      directories: Object.fromEntries((config.project_directory_schema?.directories || PROJECT_DIRS).map((dir) => [dir, paths[dir]])),
    });
  }

  return paths;
}

function loadCopyRows(copyDataPath = 'data/copy_master.json') {
  const copyMaster = readJson(copyDataPath);
  return Array.isArray(copyMaster.data) ? copyMaster.data : [];
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function langClass(lang) {
  return String(lang || 'en-US').split('-')[0].toLowerCase();
}

function safeLang(lang) {
  return sanitizeProjectId(lang || 'default', 'default');
}

function outputGroupName(row) {
  return sanitizeProjectId(row.html_group || row.master_id || row.export_group || row.export_name || row.template_id || 'default-output');
}

function buildBenefits(row) {
  const icons = ['*', '+', '✓', '•', '→'];
  return [1, 2, 3, 4, 5]
    .map((index) => String(row[`benefit_${index}`] || '').trim())
    .filter(Boolean)
    .map((text, index) => ({
      icon: icons[index] || '•',
      text,
      title: text,
      description: text,
    }));
}

function buildPatchAssets(row) {
  return String(row.patch_assets || '')
    .split(';')
    .map((asset) => asset.trim())
    .filter(Boolean);
}

function placeholderAsset(label, width = 1024, height = 1280) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#f4f6f8"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="36" fill="#65758b">${escapeHtml(label)}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function resolveAsset(assetPath, label, width, height, outputDir, projectPaths) {
  if (!assetPath) return placeholderAsset(label, width, height);
  const absolute = path.isAbsolute(assetPath) ? assetPath : path.join(ROOT, assetPath);
  if (fs.existsSync(absolute)) {
    if (projectPaths?.source) {
      const relativeAssetPath = path.isAbsolute(assetPath)
        ? path.basename(assetPath)
        : assetPath.replace(/^\.\//, '');
      const projectAssetPath = path.join(projectPaths.source, relativeAssetPath);
      fs.mkdirSync(path.dirname(projectAssetPath), { recursive: true });
      fs.copyFileSync(absolute, projectAssetPath);
      return path.relative(outputDir, projectAssetPath);
    }
    return path.relative(outputDir, absolute);
  }
  return placeholderAsset(`${label}: missing`, width, height);
}

function assetExists(assetPath) {
  if (!assetPath) return false;
  const absolute = path.isAbsolute(assetPath) ? assetPath : path.join(ROOT, assetPath);
  return fs.existsSync(absolute);
}

function toFileUrl(filePath) {
  return pathToFileURL(filePath).href;
}

function toMarkdownLink(filePath) {
  return `[${path.basename(filePath)}](${toFileUrl(filePath)})`;
}

function getAnnotationCapability() {
  return {
    status: 'probe-required',
    use_when: 'Only after the current browser session exposes an annotation screenshot command such as elementScreenshot.',
    fallback: 'Use ordinary browser screenshots plus visual-annotations evidence when the probe fails or is unavailable.',
  };
}

function buildPreviewLinksMarkdown(projectPaths, outputs, generatedAt, annotationCapability) {
  const lines = [
    '# HTML Preview Links',
    '',
    `Generated: ${generatedAt}`,
    `Project: ${projectPaths.project_id}${projectPaths.subproject_id ? ` / ${projectPaths.subproject_id}` : ''}`,
    '',
    'Browser annotation capability is optional and must be probed in the current session before use.',
    'Do not claim annotation usage unless a session probe succeeds.',
    `Annotation fallback: ${annotationCapability.fallback}`,
    '',
    'Required final-response handoff for every image-edit round: include the active Markdown preview link, the plain absolute local HTML file path, and this report path so the browser preview can be reopened without discovery.',
    '',
    '## Links',
    '',
  ];

  for (const output of outputs.filter((item) => item.status === 'built')) {
    lines.push(`### ${output.html_group} / ${output.lang}`);
    lines.push('');
    lines.push(`- Markdown preview link: ${output.markdown_link}`);
    lines.push(`- Local HTML file path: \`${output.html}\``);
    lines.push(`- File URL: \`${output.file_url}\``);
    lines.push('- Browser hint: open or refresh the file URL, then screenshot or inspect the DOM before visual review.');
    lines.push('');
  }

  if (!outputs.some((item) => item.status === 'built')) {
    lines.push('No HTML previews were built. Check build-report.json for skipped rows.');
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function renderTemplate(template, row, outputDir, projectPaths) {
  const benefits = buildBenefits(row);
  const patchAssets = buildPatchAssets(row);
  const values = {
    ...row,
    lang: row.lang,
    lang_class: langClass(row.lang),
    canvas_width: row.canvas_w,
    canvas_height: row.canvas_h,
    title: row.title,
    subtitle: row.subtitle,
    currency: row.currency,
    price: row.price,
    unit: row.unit,
    cta: row.cta,
    disclaimer: row.disclaimer,
    bg_asset: resolveAsset(row.bg_asset, 'background', row.canvas_w, row.canvas_h, outputDir, projectPaths),
    hero_asset: resolveAsset(row.hero_asset, 'hero asset', row.canvas_w, row.canvas_h, outputDir, projectPaths),
    patch_asset_1: resolveAsset(patchAssets[0], 'patch asset 1', row.canvas_w, row.canvas_h, outputDir, projectPaths),
    patch_asset_2: resolveAsset(patchAssets[1], 'patch asset 2', row.canvas_w, row.canvas_h, outputDir, projectPaths),
  };

  let html = template.replace(/{{#each benefits}}([\s\S]*?){{\/each}}/g, (_match, block) =>
    benefits
      .map((benefit) =>
        block.replace(/{{\s*(icon|text|title|description)\s*}}/g, (_token, key) => escapeHtml(benefit[key]))
      )
      .join('')
  );

  html = html.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key) => escapeHtml(values[key] ?? '').replace(/\|/g, '\n'));
  return html;
}

function copyTemplateAssets(templateId, outputDir) {
  const templateDir = path.join(ROOT, 'templates', templateId);
  for (const name of ['master.css', 'styles']) {
    const source = path.join(templateDir, name);
    const target = path.join(outputDir, name);
    if (!fs.existsSync(source)) continue;
    fs.rmSync(target, { recursive: true, force: true });
    fs.cpSync(source, target, { recursive: true, force: true });
  }
}

function renderRows(rows, options = {}) {
  const activeRows = rows || loadCopyRows(options.copyDataPath);
  const outputs = [];
  const projectPaths = createProjectWorkspace(options.projectId, { subprojectId: options.subprojectId });
  const canonicalGroups = new Set();
  const generatedAt = new Date().toISOString();
  const previewLinksReport = path.join(projectPaths.reports, 'preview-links.md');
  const annotationCapability = getAnnotationCapability();

  for (const row of activeRows) {
    const templatePath = path.join(ROOT, 'templates', row.template_id, 'master.html');
    if (!fs.existsSync(templatePath)) {
      outputs.push({ row: row.source_row_id, status: 'skipped', error: `missing template ${row.template_id}` });
      continue;
    }

    const groupName = outputGroupName(row);
    const outputDir = path.join(projectPaths.html, groupName);
    const languageHtml = `index.${safeLang(row.lang)}.html`;
    const htmlPath = path.join(outputDir, languageHtml);
    fs.mkdirSync(outputDir, { recursive: true });
    const html = renderTemplate(fs.readFileSync(templatePath, 'utf8'), row, outputDir, projectPaths);
    copyTemplateAssets(row.template_id, outputDir);
    fs.writeFileSync(htmlPath, html);
    if (!canonicalGroups.has(groupName)) {
      fs.writeFileSync(path.join(outputDir, 'index.html'), html);
      canonicalGroups.add(groupName);
    }
    outputs.push({
      row: row.source_row_id,
      status: 'built',
      project_id: projectPaths.project_id,
      subproject_id: projectPaths.subproject_id,
      template_id: row.template_id,
      lang: row.lang,
      html_group: groupName,
      html: htmlPath,
      file_url: toFileUrl(htmlPath),
      markdown_link: toMarkdownLink(htmlPath),
      browser_hint: 'open_or_refresh_file_url',
      preview_links_report: previewLinksReport,
      export_name: row.export_name,
      canvas: `${row.canvas_w}x${row.canvas_h}`,
    });
  }

  fs.writeFileSync(
    previewLinksReport,
    buildPreviewLinksMarkdown(projectPaths, outputs, generatedAt, annotationCapability)
  );

  writeJson(path.join(projectPaths.reports, 'build-report.json'), {
    generated_at: generatedAt,
    project_id: projectPaths.project_id,
    subproject_id: projectPaths.subproject_id,
    preview_links_report: previewLinksReport,
    annotation_capability: annotationCapability,
    total: outputs.length,
    built: outputs.filter((item) => item.status === 'built').length,
    outputs,
  });

  return outputs;
}

function validateScoreReport(report) {
  const errors = [];
  const requiredScores = ['overall_score', 'layout_score', 'typography_score', 'color_score', 'asset_score'];
  for (const field of requiredScores) {
    if (typeof report[field] !== 'number' || report[field] < 0 || report[field] > 100) {
      errors.push(`${field} must be a number from 0 to 100`);
    }
  }
  if (!Array.isArray(report.issues)) {
    errors.push('issues must be an array');
  } else {
    report.issues.forEach((issue, index) => {
      for (const field of ['severity', 'area', 'observed', 'expected', 'fix_hint']) {
        if (!issue || typeof issue[field] !== 'string' || !issue[field].trim()) {
          errors.push(`issues[${index}].${field} must be a non-empty string`);
        }
      }
    });
  }
  return { errors };
}

function validateWorkflow(options = {}) {
  const errors = [];
  const warnings = [];
  const config = loadConfig();
  const rows = options.rows || loadCopyRows(options.copyDataPath);
  const projectPaths = getProjectPaths(options.projectId, config, { subprojectId: options.subprojectId });

  if (!Array.isArray(config.workflow_phases) || config.workflow_phases.length !== 6) {
    errors.push('workflow.config.json must define exactly six workflow_phases');
  }
  if (!config.workspace_root) errors.push('workflow.config.json missing workspace_root');
  if (!String(config.workspace_root).includes('text2html-image')) errors.push('workflow.config.json workspace_root must point to text2html-image');
  if (config.workspace_root !== '$DOCUMENTS/text2html-image-project') {
    errors.push('workflow.config.json workspace_root must be $DOCUMENTS/text2html-image-project');
  }
  if (/CloudStorage|OneDrive|文档/.test(String(config.workspace_root))) {
    errors.push('workflow.config.json workspace_root must not point to cloud or localized document folders');
  }
  if (!Array.isArray(config.project_directory_schema?.directories)) {
    errors.push('workflow.config.json missing project_directory_schema.directories');
  }
  if (!config.copy_image_review?.score_schema) errors.push('workflow.config.json missing copy_image_review.score_schema');

  if (!rows.length) {
    warnings.push('data/copy_master.json has no active copy rows');
  }

  for (const row of rows) {
    for (const field of ['source_row_id', 'template_id', 'platform', 'canvas_w', 'canvas_h', 'lang', 'sku', 'title', 'export_name']) {
      if (row[field] === undefined || row[field] === '') errors.push(`${row.source_row_id || 'unknown row'} missing ${field}`);
    }

    const templatePath = path.join(ROOT, 'templates', row.template_id, 'master.html');
    if (!fs.existsSync(templatePath)) errors.push(`${row.source_row_id} references missing template ${row.template_id}`);

    for (const assetField of ['bg_asset', 'hero_asset']) {
      if (row[assetField] && !assetExists(row[assetField])) {
        warnings.push(`${row.source_row_id} references missing optional asset ${row[assetField]}`);
      }
    }
  }

  const htmlRoot = projectPaths.html;
  if (fs.existsSync(htmlRoot)) {
    const htmlFiles = fs.readdirSync(htmlRoot)
      .flatMap((name) => {
        const groupDir = path.join(htmlRoot, name);
        if (!fs.statSync(groupDir).isDirectory()) return [];
        return fs.readdirSync(groupDir)
          .filter((fileName) => /^index(?:\.[a-z0-9-]+)?\.html$/.test(fileName))
          .map((fileName) => path.join(groupDir, fileName));
      });
    for (const file of htmlFiles) {
      const html = fs.readFileSync(file, 'utf8');
      if (html.includes('{{')) errors.push(`${file} contains unreplaced template tokens`);
      if (!html.includes('class="poster')) errors.push(`${file} is missing poster container`);
    }
  }

  return { errors, warnings };
}

module.exports = {
  ROOT,
  PROJECT_DIRS,
  MAX_PROJECT_FOLDER_NAME_LENGTH,
  MAX_PROJECT_SLUG_LENGTH,
  createProjectWorkspace,
  expandHome,
  getUserDocumentsDir,
  getProjectPaths,
  getWorkspaceRoot,
  parseArgs,
  readJson,
  writeJson,
  ensureDir,
  loadConfig,
  loadCopyRows,
  renderRows,
  sanitizeProjectFolderName,
  sanitizeProjectId,
  safeLang,
  validateScoreReport,
  validateWorkflow,
  buildPatchAssets,
  assetExists,
  toFileUrl,
  toMarkdownLink,
};
