const fs = require('fs');
const path = require('path');
const { readImageDimensions } = require('./asset-routing-core');
const { writeJson } = require('./workflow-core');

const ALLOWED_KINDS = new Set(['text', 'card', 'simple_icon', 'person', 'map', 'cloud', 'skyline', 'app_icon', 'complex_art', 'unknown']);
const ALLOWED_ROUTES = new Set(['editable_text', 'editable_vector', 'reference_cutout', 'regenerated_image', 'locked_base_layer', 'omit_or_simplify', 'review']);

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

function validateManifest(manifest) {
  const issues = [];
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
    required_output: 'Return JSON with visual_hierarchy, elements, business_text_candidates, and unknowns_requiring_user_or_agent_review.',
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
    visual_hierarchy: [],
    elements: [],
    business_text_candidates: [],
    unknowns_requiring_user_or_agent_review: ['No model response was supplied.'],
    validation_issues: [],
    request_path: requestPath,
    response_path: options.responsePath ? path.resolve(options.responsePath) : null,
  };

  if (response) {
    manifest.visual_hierarchy = Array.isArray(response.visual_hierarchy) ? response.visual_hierarchy.map(String) : [];
    manifest.elements = Array.isArray(response.elements) ? response.elements.map(normalizeElement) : [];
    manifest.business_text_candidates = Array.isArray(response.business_text_candidates) ? response.business_text_candidates.map(String) : [];
    manifest.unknowns_requiring_user_or_agent_review = Array.isArray(response.unknowns_requiring_user_or_agent_review)
      ? response.unknowns_requiring_user_or_agent_review.map(String)
      : [];
    manifest.validation_issues = validateManifest(manifest);
    manifest.status = manifest.validation_issues.length || manifest.unknowns_requiring_user_or_agent_review.length ? 'review' : 'pass';
  }

  const manifestPath = path.join(projectPaths.reports, 'visual-intake-manifest.json');
  writeJson(manifestPath, manifest);
  return { request, manifest, requestPath, manifestPath };
}

module.exports = {
  normalizeBbox,
  normalizeElement,
  runVisualIntake,
  validateManifest,
};
