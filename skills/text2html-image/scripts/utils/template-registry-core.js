const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function readRegistry(registryPath = path.join(ROOT, 'templates', 'registry.json')) {
  if (!fs.existsSync(registryPath)) {
    return { schema_version: 1, templates: [] };
  }
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  if (!Array.isArray(registry.templates)) {
    throw new Error('templates/registry.json must contain a templates array.');
  }
  return registry;
}

function extractTemplateTokens(html) {
  const tokens = new Set();
  for (const match of String(html || '').matchAll(/{{\s*([#/])?([a-zA-Z0-9_]+)\s*}}/g)) {
    if (match[1] === '/') continue;
    tokens.add(match[2]);
  }
  return [...tokens].sort();
}

function templateIdsFromRows(rows = []) {
  return [...new Set(rows.map((row) => row.template_id).filter(Boolean))].sort();
}

function checkTemplates(options = {}) {
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const registry = options.registry || readRegistry(options.registryPath);
  const registryById = new Map(registry.templates.map((item) => [item.template_id, item]));
  const requestedIds = options.templateId ? [options.templateId] : templateIdsFromRows(rows);
  const templates = requestedIds.map((templateId) => {
    const templateDir = path.join(ROOT, 'templates', templateId);
    const masterHtml = path.join(templateDir, 'master.html');
    const masterCss = path.join(templateDir, 'master.css');
    const exists = fs.existsSync(masterHtml);
    const registryEntry = registryById.get(templateId) || {};
    return {
      template_id: templateId,
      exists,
      master_html: masterHtml,
      master_css: fs.existsSync(masterCss) ? masterCss : null,
      template_type: registryEntry.template_type || 'unregistered',
      supported_tokens: exists ? extractTemplateTokens(fs.readFileSync(masterHtml, 'utf8')) : [],
      missing_required_assets: [],
    };
  });
  const missingTemplates = templates.filter((item) => !item.exists).map((item) => item.template_id);
  const unregisteredTemplates = templates
    .filter((item) => item.exists && item.template_type === 'unregistered')
    .map((item) => item.template_id);
  return {
    generated_at: new Date().toISOString(),
    status: missingTemplates.length ? 'fail' : unregisteredTemplates.length ? 'review' : 'pass',
    templates,
    missing_templates: missingTemplates,
    unregistered_templates: unregisteredTemplates,
  };
}

module.exports = {
  ROOT,
  checkTemplates,
  extractTemplateTokens,
  readRegistry,
  templateIdsFromRows,
};
