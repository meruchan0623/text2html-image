const fs = require('fs');
const path = require('path');
const { ROOT, extractTemplateTokens, templateIdsFromRows } = require('./template-registry-core');

const DERIVED_TOKEN_FIELDS = {
  canvas_width: ['canvas_w'],
  canvas_height: ['canvas_h'],
  lang_class: ['lang'],
  patch_asset_1: ['patch_assets'],
  patch_asset_2: ['patch_assets'],
};

const LOOP_TOKENS = new Set(['icon', 'text', 'description']);

function sourceFieldsForToken(token) {
  if (DERIVED_TOKEN_FIELDS[token]) return DERIVED_TOKEN_FIELDS[token];
  if (LOOP_TOKENS.has(token)) return ['benefit_1'];
  return [token];
}

function readTemplateTokens(templateId) {
  const templatePath = path.join(ROOT, 'templates', templateId, 'master.html');
  if (!fs.existsSync(templatePath)) return [];
  return extractTemplateTokens(fs.readFileSync(templatePath, 'utf8'));
}

function rowHasAnyField(row, fieldNames) {
  return fieldNames.some((fieldName) => row[fieldName] !== undefined);
}

function checkCopySchema(options = {}) {
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const templateIds = options.templateId ? [options.templateId] : templateIdsFromRows(rows);
  const allFields = [...new Set(rows.flatMap((row) => Object.keys(row)))].sort();
  const templateFields = {};
  const errors = [];

  for (const templateId of templateIds) {
    const tokens = readTemplateTokens(templateId);
    const required = [...new Set(tokens.flatMap(sourceFieldsForToken))].sort();
    const rowsForTemplate = rows.filter((row) => row.template_id === templateId);
    const missingRequiredFields = [];
    for (const row of rowsForTemplate) {
      for (const token of tokens) {
        const sourceFields = sourceFieldsForToken(token);
        if (!rowHasAnyField(row, sourceFields)) {
          const fieldLabel = sourceFields.join('|');
          errors.push(`${row.source_row_id || templateId} missing ${fieldLabel} for token ${token}`);
          missingRequiredFields.push(fieldLabel);
        }
      }
    }
    templateFields[templateId] = {
      required,
      optional: allFields.filter((field) => !required.includes(field)),
      tokens_used: tokens,
      unused_copy_fields: allFields.filter((field) => !required.includes(field)),
      missing_required_fields: [...new Set(missingRequiredFields)].sort(),
    };
  }

  return {
    generated_at: new Date().toISOString(),
    status: errors.length ? 'fail' : 'pass',
    global_fields: allFields,
    template_fields: templateFields,
    errors,
  };
}

module.exports = {
  checkCopySchema,
  sourceFieldsForToken,
};
