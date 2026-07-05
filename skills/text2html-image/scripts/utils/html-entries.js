const fs = require('fs');
const path = require('path');
const { toFileUrl } = require('./workflow-core');

function variantFromFileName(fileName) {
  return fileName === 'index.html' ? 'canonical' : fileName.replace(/^index\.|\.[^.]+$/g, '');
}

function listHtmlEntries(projectPaths, options = {}) {
  const htmlRoot = projectPaths.html;
  if (!fs.existsSync(htmlRoot)) return [];
  if (!options.group) {
    const shallowEntries = fs.readdirSync(htmlRoot)
      .filter((fileName) => /^index(?:\.[a-z0-9-]+)?\.html$/.test(fileName))
      .sort()
      .map((fileName) => {
        const html = path.join(htmlRoot, fileName);
        const variant = variantFromFileName(fileName);
        return {
          html_group: 'default',
          variant,
          html,
          file_name: fileName,
          file_url: toFileUrl(html),
          expected_png: path.join(projectPaths.exports, `${variant === 'canonical' ? 'index' : `index.${variant}`}.png`),
        };
      });
    if (shallowEntries.length) return shallowEntries;
  }
  const groups = options.group ? [options.group] : fs.readdirSync(htmlRoot).sort();
  return groups.flatMap((groupName) => {
    const groupDir = path.join(htmlRoot, groupName);
    if (!fs.existsSync(groupDir) || !fs.statSync(groupDir).isDirectory()) return [];
    return fs.readdirSync(groupDir)
      .filter((fileName) => /^index(?:\.[a-z0-9-]+)?\.html$/.test(fileName))
      .sort()
      .map((fileName) => {
        const html = path.join(groupDir, fileName);
        const variant = variantFromFileName(fileName);
        return {
          html_group: groupName,
          variant,
          html,
          file_name: fileName,
          file_url: toFileUrl(html),
          expected_png: path.join(projectPaths.exports, `${groupName}-${variant}.png`),
        };
      });
  });
}

module.exports = {
  listHtmlEntries,
  variantFromFileName,
};
