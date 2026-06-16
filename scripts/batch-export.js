const fs = require('fs');
const path = require('path');
const { createProjectWorkspace, parseArgs, toFileUrl, writeJson } = require('./utils/workflow-core');

const args = parseArgs();
const projectPaths = createProjectWorkspace(args.project, { subprojectId: args.subproject });
const htmlRoot = projectPaths.html;

const entries = fs.existsSync(htmlRoot)
  ? fs.readdirSync(htmlRoot)
      .flatMap((name) => {
        const groupDir = path.join(htmlRoot, name);
        if (!fs.statSync(groupDir).isDirectory()) return [];
        return fs.readdirSync(groupDir)
          .filter((fileName) => /^index(?:\.[a-z0-9-]+)?\.html$/.test(fileName))
          .map((fileName) => {
            const html = path.join(groupDir, fileName);
            const suffix = fileName === 'index.html' ? 'canonical' : fileName.replace(/^index\.|\.[^.]+$/g, '');
            return {
              html_group: name,
              variant: suffix,
              html,
              file_url: toFileUrl(html),
              expected_png: path.join(projectPaths.exports, `${name}-${suffix}.png`),
              status: 'ready-for-codex-browser-open-or-refresh',
            };
          });
      })
  : [];

const manifest = {
  generated_at: new Date().toISOString(),
  project_id: projectPaths.project_id,
  subproject_id: projectPaths.subproject_id,
  mode: 'manifest-only',
  note: 'Open or refresh each file_url in Codex Browser before final export.',
  total: entries.length,
  exports: entries,
};

writeJson(path.join(projectPaths.exports, 'export-manifest.json'), manifest);
console.log(`Prepared export manifest for ${entries.length} HTML preview(s) in project ${projectPaths.project_id}.`);
