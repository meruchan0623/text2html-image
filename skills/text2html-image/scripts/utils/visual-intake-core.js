const fs = require('fs');
const path = require('path');
const { readImageDimensions } = require('./asset-routing-core');
const { writeJson } = require('./workflow-core');

const ALLOWED_KINDS = new Set([
  'text',
  'editable_text',
  'card',
  'panel',
  'simple_icon',
  'person',
  'character',
  'mascot',
  'map',
  'cloud',
  'skyline',
  'landmark',
  'globe',
  'application_icon',
  'app_icon',
  'complex_icon',
  'brand_icon',
  'multicolor_icon',
  'screenshot_icon',
  'complex_art',
  'illustration',
  'complex_gradient',
  'photo_background',
  'dashboard_widget',
  'route_lines',
  'route_points',
  'table',
  'feature_matrix',
  'multilingual_copy',
  'qr',
  'qr_code',
  'barcode',
  'payment_logo',
  'country_flag',
  'particle',
  'shadow',
  'unknown',
]);
const ALLOWED_ROUTES = new Set(['editable_text', 'editable_vector', 'reference_cutout', 'regenerated_image', 'locked_base_layer', 'omit_or_simplify', 'review']);
const MIN_REVERSE_VISUAL_PROMPT_LENGTH = 600;
const REVERSE_VISUAL_PROMPT_REQUIRED_TOPICS = [
  {
    label: 'composition/layout',
    patterns: [/composition/i, /layout/i, /canvas/i, /poster/i, /构图/, /布局/, /画面/],
  },
  {
    label: 'visual hierarchy',
    patterns: [/hierarchy/i, /priority/i, /层级/, /主次/, /视觉焦点/],
  },
  {
    label: 'color',
    patterns: [/color/i, /palette/i, /色彩/, /颜色/, /配色/],
  },
  {
    label: 'typography/font',
    patterns: [/typography/i, /font/i, /type/i, /字体/, /字号/, /字重/],
  },
  {
    label: 'material/assets',
    patterns: [/asset/i, /material/i, /image/i, /素材/, /资产/, /图层/],
  },
  {
    label: 'spatial relationships',
    patterns: [/spacing/i, /position/i, /left/i, /right/i, /top/i, /bottom/i, /空间/, /位置/, /关系/],
  },
  {
    label: 'editable DOM candidates',
    patterns: [/editable/i, /DOM/i, /selectable/i, /可编辑/, /文本/, /文字/],
  },
  {
    label: 'bitmap candidates',
    patterns: [/bitmap/i, /raster/i, /PNG/i, /cutout/i, /位图/, /抠图/, /图片/],
  },
  {
    label: 'unknowns',
    patterns: [/unknown/i, /review/i, /verify/i, /uncertain/i, /不确定/, /待确认/, /验证/],
  },
];

function normalizeBbox(value) {
  if (!value || typeof value !== 'object') return null;
  const x = Number(value.x);
  const y = Number(value.y);
  const w = Number(value.w ?? value.width);
  const h = Number(value.h ?? value.height);
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

function normalizeElement(element, index) {
  const kind = String(element.kind || '').trim();
  const route = String(element.suggested_route || '').trim();
  const confidence = Number(element.confidence);
  return {
    id: String(element.id || `element-${index + 1}`).trim(),
    kind: ALLOWED_KINDS.has(kind) ? kind : 'unknown',
    description: String(element.description || '').trim(),
    bbox: normalizeBbox(element.bbox),
    suggested_route: ALLOWED_ROUTES.has(route) ? route : 'review',
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    evidence: Array.isArray(element.evidence) ? element.evidence.map(String).filter(Boolean) : [],
    uncertainty_reason: String(element.uncertainty_reason || '').trim(),
  };
}

function normalizeReverseVisualPrompt(value) {
  return String(value || '').trim();
}

function validateReverseVisualPrompt(prompt) {
  const issues = [];
  if (!prompt) {
    issues.push('reverse_visual_prompt is required for reference-image recreation');
    return issues;
  }
  if (prompt.length < MIN_REVERSE_VISUAL_PROMPT_LENGTH) {
    issues.push(`reverse_visual_prompt must be at least ${MIN_REVERSE_VISUAL_PROMPT_LENGTH} characters`);
  }
  for (const topic of REVERSE_VISUAL_PROMPT_REQUIRED_TOPICS) {
    if (!topic.patterns.some((pattern) => pattern.test(prompt))) {
      issues.push(`reverse_visual_prompt missing ${topic.label} coverage`);
    }
  }
  return issues;
}

function validateManifest(manifest) {
  const issues = validateReverseVisualPrompt(manifest.reverse_visual_prompt);
  for (const [index, element] of manifest.elements.entries()) {
    if (!element.description) issues.push(`elements[${index}].description is required`);
    if (!element.bbox) issues.push(`elements[${index}].bbox is required`);
    if (element.confidence < 0.5) issues.push(`elements[${index}].confidence below 0.5`);
  }
  return issues;
}

function readResponse(responsePath) {
  if (!responsePath) return null;
  return JSON.parse(fs.readFileSync(path.resolve(responsePath), 'utf8'));
}

function tableRow(values) {
  return `| ${values.map((value) => String(value ?? '').replace(/\|/g, '\\|')).join(' | ')} |`;
}

function renderReverseVisualSpec(manifest) {
  const lines = [
    '# Reverse Visual Spec',
    '',
    `- Source image: \`${manifest.source_image}\``,
    `- Canvas: ${manifest.canvas?.width || 'unknown'} x ${manifest.canvas?.height || 'unknown'}`,
    `- Visual intake status: \`${manifest.status}\``,
    '- This visual spec is a planning blueprint, not final business truth. Verify OCR, prices, tables, QR codes, logos, and legal copy separately.',
    '',
    '## Reverse Visual Prompt',
    '',
    manifest.reverse_visual_prompt || 'No reverse_visual_prompt was supplied.',
    '',
    '## Visual Hierarchy',
    '',
  ];
  if (manifest.visual_hierarchy.length) {
    for (const item of manifest.visual_hierarchy) lines.push(`- ${item}`);
  } else {
    lines.push('- No visual hierarchy was supplied.');
  }
  lines.push('', '## Business Text Candidates', '');
  if (manifest.business_text_candidates.length) {
    for (const item of manifest.business_text_candidates) lines.push(`- ${item}`);
  } else {
    lines.push('- No business text candidates were supplied.');
  }
  lines.push('', '## Element Candidates', '');
  lines.push(tableRow(['id', 'kind', 'bbox', 'suggested_route', 'confidence', 'description']));
  lines.push(tableRow(['---', '---', '---', '---', '---', '---']));
  for (const element of manifest.elements) {
    const bbox = element.bbox ? `${element.bbox.x},${element.bbox.y},${element.bbox.w}x${element.bbox.h}` : 'missing';
    lines.push(tableRow([
      element.id,
      element.kind,
      bbox,
      element.suggested_route,
      element.confidence,
      element.description,
    ]));
  }
  lines.push('', '## Unknowns And Review Items', '');
  if (manifest.unknowns_requiring_user_or_agent_review.length) {
    for (const item of manifest.unknowns_requiring_user_or_agent_review) lines.push(`- ${item}`);
  } else {
    lines.push('- None supplied by visual intake.');
  }
  if (manifest.validation_issues.length) {
    lines.push('', '## Validation Issues', '');
    for (const issue of manifest.validation_issues) lines.push(`- ${issue}`);
  }
  return `${lines.join('\n')}\n`;
}

function runVisualIntake(options = {}) {
  const projectPaths = options.projectPaths;
  const sourceImage = path.resolve(String(options.sourceImage));
  const dimensions = readImageDimensions(sourceImage);
  const canvas = options.targetCanvas || { width: dimensions.width, height: dimensions.height };
  const request = {
    generated_at: new Date().toISOString(),
    project_id: projectPaths.project_id,
    subproject_id: projectPaths.subproject_id || null,
    source_image: sourceImage,
    target_canvas: canvas,
    task_type: options.taskType || 'recreate',
    required_output: [
      'Return JSON with reverse_visual_prompt, visual_hierarchy, elements, business_text_candidates, and unknowns_requiring_user_or_agent_review.',
      `reverse_visual_prompt is required, must be at least ${MIN_REVERSE_VISUAL_PROMPT_LENGTH} characters, and must broadly cover composition/layout, hierarchy, color, typography, material/assets, spatial relationships, editable DOM candidates, bitmap candidates, and unknowns.`,
    ].join(' '),
  };
  const requestPath = path.join(projectPaths.reports, 'visual-intake-request.json');
  writeJson(requestPath, request);

  const response = readResponse(options.responsePath);
  const manifest = {
    generated_at: new Date().toISOString(),
    project_id: projectPaths.project_id,
    subproject_id: projectPaths.subproject_id || null,
    source_image: sourceImage,
    canvas,
    status: 'review',
    reverse_visual_prompt: '',
    visual_hierarchy: [],
    elements: [],
    business_text_candidates: [],
    unknowns_requiring_user_or_agent_review: ['No model response was supplied.'],
    validation_issues: [],
    request_path: requestPath,
    response_path: options.responsePath ? path.resolve(options.responsePath) : null,
  };

  if (response) {
    manifest.reverse_visual_prompt = normalizeReverseVisualPrompt(response.reverse_visual_prompt);
    manifest.visual_hierarchy = Array.isArray(response.visual_hierarchy) ? response.visual_hierarchy.map(String) : [];
    manifest.elements = Array.isArray(response.elements) ? response.elements.map(normalizeElement) : [];
    manifest.business_text_candidates = Array.isArray(response.business_text_candidates) ? response.business_text_candidates.map(String) : [];
    manifest.unknowns_requiring_user_or_agent_review = Array.isArray(response.unknowns_requiring_user_or_agent_review)
      ? response.unknowns_requiring_user_or_agent_review.map(String)
      : [];
    manifest.validation_issues = validateManifest(manifest);
    manifest.status = manifest.validation_issues.length || manifest.unknowns_requiring_user_or_agent_review.length ? 'review' : 'pass';
    if (validateReverseVisualPrompt(manifest.reverse_visual_prompt).length === 0) {
      fs.writeFileSync(path.join(projectPaths.reports, 'reverse-visual-spec.md'), renderReverseVisualSpec(manifest), 'utf8');
    }
  }

  const manifestPath = path.join(projectPaths.reports, 'visual-intake-manifest.json');
  writeJson(manifestPath, manifest);
  return { request, manifest, requestPath, manifestPath };
}

module.exports = {
  MIN_REVERSE_VISUAL_PROMPT_LENGTH,
  normalizeBbox,
  normalizeElement,
  normalizeReverseVisualPrompt,
  renderReverseVisualSpec,
  runVisualIntake,
  validateManifest,
  validateReverseVisualPrompt,
};
