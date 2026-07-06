const fs = require('fs');
const path = require('path');
const { listHtmlEntries } = require('./html-entries');
const { toFileUrl, toMarkdownLink, writeJson } = require('./workflow-core');

const SAMPLE_LIMIT = 12;

function listFiles(dirPath, options = {}) {
  if (!dirPath || !fs.existsSync(dirPath)) return [];
  const recursive = Boolean(options.recursive);
  const files = [];

  function walk(currentDir) {
    for (const name of fs.readdirSync(currentDir).sort()) {
      const filePath = path.join(currentDir, name);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        if (recursive) walk(filePath);
        continue;
      }
      files.push({
        path: filePath,
        relative_path: path.relative(dirPath, filePath),
        size_bytes: stat.size,
        modified_at: stat.mtime.toISOString(),
      });
    }
  }

  walk(dirPath);
  return files;
}

function sampleFiles(files) {
  return files.slice(0, SAMPLE_LIMIT).map((file) => file.relative_path);
}

function latestFile(files) {
  if (!files.length) return null;
  return [...files].sort((a, b) => String(b.modified_at).localeCompare(String(a.modified_at)))[0];
}

function findCssFiles(projectPaths, htmlEntries) {
  const dirs = new Set();
  for (const entry of htmlEntries) {
    dirs.add(path.dirname(entry.html));
  }
  dirs.add(projectPaths.html);

  return [...dirs].flatMap((dirPath) => listFiles(dirPath)
    .filter((file) => file.relative_path.endsWith('.css'))
    .map((file) => ({
      ...file,
      relative_path: path.relative(projectPaths.root, file.path),
    })))
    .sort((a, b) => a.relative_path.localeCompare(b.relative_path));
}

function buildRecommendations(projectPaths, summary) {
  if (!summary.project_exists) {
    return [
      `npm run project:init -- --project ${projectPaths.project_id}${projectPaths.subproject_id ? ` --subproject ${projectPaths.subproject_id}` : ''}`,
    ];
  }

  const base = `--project ${projectPaths.project_id}${projectPaths.subproject_id ? ` --subproject ${projectPaths.subproject_id}` : ''}`;
  const recommendations = [];

  if (summary.html_entries.length) {
    recommendations.push(`npm run task:brief -- ${base} --mode preview-overwrite`);
    recommendations.push(`npm run task:brief -- ${base} --mode surgical-edit`);
  } else if (summary.source_files.count) {
    const sourceHint = summary.source_files.sample[0] ? path.join(projectPaths.source, summary.source_files.sample[0]) : '<source-image>';
    recommendations.push(`npm run task:brief -- ${base} --mode faithful-recreate --source-image ${sourceHint}`);
  } else {
    recommendations.push(`npm run project:init -- ${base}`);
  }

  recommendations.push(`npm run task:brief -- ${base} --mode finalize-export`);
  return recommendations;
}

function inspectProject(projectPaths, options = {}) {
  if (!projectPaths || !projectPaths.root) {
    throw new Error('projectPaths with root is required');
  }

  const projectExists = fs.existsSync(projectPaths.root);
  if (!projectExists && !options.allowMissing) {
    throw new Error(`Project workspace does not exist: ${projectPaths.root}`);
  }

  const htmlEntries = projectExists ? listHtmlEntries(projectPaths) : [];
  const sourceFiles = projectExists ? listFiles(projectPaths.source, { recursive: true }) : [];
  const exportFiles = projectExists ? listFiles(projectPaths.exports, { recursive: true }) : [];
  const reportFiles = projectExists ? listFiles(projectPaths.reports, { recursive: true }) : [];
  const cssFiles = projectExists ? findCssFiles(projectPaths, htmlEntries) : [];

  const summary = {
    generated_at: new Date().toISOString(),
    project_id: projectPaths.project_id,
    subproject_id: projectPaths.subproject_id || null,
    workspace_root: projectPaths.workspace_root,
    project_root: projectPaths.project_root,
    active_root: projectPaths.root,
    project_exists: projectExists,
    html_entries: htmlEntries.map((entry) => ({
      html_group: entry.html_group,
      variant: entry.variant,
      html: entry.html,
      file_url: entry.file_url,
      markdown_link: toMarkdownLink(entry.html),
      expected_png: entry.expected_png,
    })),
    css_files: cssFiles.map((file) => ({
      path: file.path,
      relative_path: file.relative_path,
      markdown_link: toMarkdownLink(file.path),
    })),
    source_files: {
      count: sourceFiles.length,
      sample: sampleFiles(sourceFiles),
      latest: latestFile(sourceFiles),
    },
    export_files: {
      count: exportFiles.length,
      sample: sampleFiles(exportFiles),
      latest: latestFile(exportFiles),
    },
    report_files: {
      count: reportFiles.length,
      sample: sampleFiles(reportFiles),
      latest: latestFile(reportFiles),
    },
  };

  summary.recommended_next_commands = buildRecommendations(projectPaths, summary);
  summary.active_preview = summary.html_entries.find((entry) => entry.variant === 'canonical') || summary.html_entries[0] || null;
  return summary;
}

function renderProjectInspectMarkdown(summary) {
  const lines = [
    '# Project Inspect',
    '',
    `- Project: ${summary.project_id}${summary.subproject_id ? ` / ${summary.subproject_id}` : ''}`,
    `- Generated: ${summary.generated_at}`,
    `- Workspace root: \`${summary.workspace_root}\``,
    `- Active root: \`${summary.active_root}\``,
    `- Project exists: ${summary.project_exists ? 'Yes' : 'No'}`,
    '',
    '## Active HTML',
    '',
  ];

  if (!summary.html_entries.length) {
    lines.push('- No active `index*.html` files found.');
  } else {
    for (const entry of summary.html_entries) {
      lines.push(`- ${entry.html_group} / ${entry.variant}: ${entry.markdown_link}`);
      lines.push(`  - Path: \`${entry.html}\``);
      lines.push(`  - File URL: \`${entry.file_url}\``);
      lines.push(`  - Expected PNG: \`${entry.expected_png}\``);
    }
  }

  lines.push('', '## CSS', '');
  if (!summary.css_files.length) {
    lines.push('- No CSS files found beside active HTML.');
  } else {
    for (const file of summary.css_files) {
      lines.push(`- ${file.markdown_link}`);
      lines.push(`  - Path: \`${file.path}\``);
    }
  }

  lines.push('', '## Assets And Outputs', '');
  lines.push(`- Source files: ${summary.source_files.count}`);
  if (summary.source_files.sample.length) lines.push(`  - Sample: ${summary.source_files.sample.join(', ')}`);
  lines.push(`- Export files: ${summary.export_files.count}`);
  if (summary.export_files.sample.length) lines.push(`  - Sample: ${summary.export_files.sample.join(', ')}`);
  if (summary.export_files.latest) lines.push(`  - Latest: \`${summary.export_files.latest.relative_path}\` (${summary.export_files.latest.modified_at})`);
  lines.push(`- Report files: ${summary.report_files.count}`);
  if (summary.report_files.sample.length) lines.push(`  - Sample: ${summary.report_files.sample.join(', ')}`);

  lines.push('', '## Recommended Next Commands', '');
  for (const command of summary.recommended_next_commands) {
    lines.push(`- \`${command}\``);
  }

  lines.push('', '## Handoff Rule', '');
  lines.push('Use this report to choose the active edit surface, then run `task:brief` before editing or exporting.');

  return `${lines.join('\n')}\n`;
}

function writeProjectInspect({ projectPaths, summary }) {
  if (!projectPaths || !projectPaths.reports) {
    throw new Error('projectPaths with reports path is required');
  }
  fs.mkdirSync(projectPaths.reports, { recursive: true });
  const jsonPath = path.join(projectPaths.reports, 'project-inspect.json');
  const markdownPath = path.join(projectPaths.reports, 'project-inspect.md');
  writeJson(jsonPath, summary);
  fs.writeFileSync(markdownPath, renderProjectInspectMarkdown(summary), 'utf8');
  return { jsonPath, markdownPath, summary };
}

module.exports = {
  inspectProject,
  listFiles,
  renderProjectInspectMarkdown,
  writeProjectInspect,
};
