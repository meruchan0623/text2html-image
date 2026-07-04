const fs = require('fs');
const path = require('path');
const { readImageDimensions } = require('./asset-routing-core');
const { buildLayerPackage, buildMaskQualityReport } = require('./mask-quality-core');
const { normalizeBbox } = require('./visual-intake-core');
const { writeJson } = require('./workflow-core');

const MODES = new Set(['agent_first', 'grounding_first', 'hybrid', 'review_only']);
const ROUTES = new Set(['editable_text', 'editable_vector', 'reference_cutout', 'regenerated_image', 'locked_base_layer', 'review']);
const BBOX_SOURCES = new Set(['agent', 'grounding', 'manual', 'merged']);
const HARD_TO_VECTOR = new Set(['person', 'map', 'cloud', 'skyline', 'landmark', 'app_icon', 'application_icon', 'complex_icon']);

function normalizeId(value, fallback) {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || fallback;
}

function normalizeCutoutElement(element, index) {
  const id = normalizeId(element.id, `element-${index + 1}`);
  const bbox = normalizeBbox(element.bbox);
  const confidence = Number(element.confidence);
  return {
    id,
    label: String(element.label || element.description || id).trim(),
    prompt: String(element.prompt || element.label || id).trim(),
    kind: String(element.kind || 'unknown').trim(),
    bbox,
    bbox_source: BBOX_SOURCES.has(String(element.bbox_source || '')) ? String(element.bbox_source) : 'agent',
    mask_path: element.mask_path ? path.resolve(String(element.mask_path)) : null,
    overlay_path: null,
    layer_path: element.layer_path ? path.resolve(String(element.layer_path)) : null,
    z_index_suggestion: Number.isFinite(Number(element.z_index_suggestion)) ? Number(element.z_index_suggestion) : index + 1,
    css_placement: bbox ? { left: bbox.x, top: bbox.y, width: bbox.w, height: bbox.h } : { left: 0, top: 0, width: 0, height: 0 },
    route: ROUTES.has(String(element.route || '')) ? String(element.route) : 'review',
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    requires_review: true,
    uncertainty_reason: String(element.uncertainty_reason || '').trim(),
    must_preserve_text: Boolean(element.must_preserve_text),
  };
}

function readJsonFile(filePath) {
  if (!filePath) return null;
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function validatePlanElements(elements) {
  const blockingErrors = [];
  for (const [index, element] of elements.entries()) {
    if (!element.bbox) blockingErrors.push(`elements[${index}].bbox is required`);
    if (!element.label) blockingErrors.push(`elements[${index}].label is required`);
    if (element.confidence < 0.5) blockingErrors.push(`elements[${index}].confidence below 0.5`);
    if (element.route === 'editable_vector' && HARD_TO_VECTOR.has(element.kind)) {
      blockingErrors.push(`elements[${index}] hard-to-vector kind ${element.kind} cannot route to editable_vector`);
    }
  }
  return blockingErrors;
}

function runCutoutDecompose(options = {}) {
  const projectPaths = options.projectPaths;
  const sourceImage = path.resolve(String(options.sourceImage));
  const dimensions = readImageDimensions(sourceImage);
  const mode = MODES.has(String(options.mode || 'hybrid')) ? String(options.mode || 'hybrid') : 'hybrid';
  const request = {
    generated_at: new Date().toISOString(),
    project_id: projectPaths.project_id,
    subproject_id: projectPaths.subproject_id || null,
    source_image: sourceImage,
    canvas: { width: dimensions.width, height: dimensions.height, format: dimensions.format },
    mode,
    required_output: 'Return JSON with elements, merge_candidates, split_candidates, and per-element bbox/mask/layer paths when available.',
  };
  const requestPath = path.join(projectPaths.reports, 'agent-cutout-request.json');
  writeJson(requestPath, request);

  const response = readJsonFile(options.responsePath);
  const elements = response && Array.isArray(response.elements) ? response.elements.map(normalizeCutoutElement) : [];
  const blockingErrors = response ? validatePlanElements(elements) : ['No decomposition response was supplied.'];
  const maskQualityReport = response ? buildMaskQualityReport(elements, sourceImage, projectPaths) : {
    generated_at: new Date().toISOString(),
    status: 'review',
    checks: [],
  };
  const layerPackage = response ? buildLayerPackage(elements, maskQualityReport) : {
    generated_at: maskQualityReport.generated_at,
    status: 'review',
    layers: [],
  };
  const status = blockingErrors.length ? 'review' : maskQualityReport.status;
  const plan = {
    generated_at: new Date().toISOString(),
    status,
    source_image: sourceImage,
    canvas: { width: dimensions.width, height: dimensions.height, format: dimensions.format },
    mode,
    elements,
    merge_candidates: response && Array.isArray(response.merge_candidates) ? response.merge_candidates : [],
    split_candidates: response && Array.isArray(response.split_candidates) ? response.split_candidates : [],
    blocking_errors: blockingErrors,
    request_path: requestPath,
    response_path: options.responsePath ? path.resolve(options.responsePath) : null,
  };
  const review = {
    generated_at: plan.generated_at,
    status: plan.status,
    next_action: plan.status === 'pass' ? 'Proceed to route:assets or mask QA.' : 'Provide decomposition response with bbox, mask_path, and layer_path for each accepted element.',
    blocking_errors: blockingErrors,
  };

  const planPath = path.join(projectPaths.reports, 'element-decomposition-plan.json');
  const reviewPath = path.join(projectPaths.reports, 'agent-cutout-review.json');
  const maskQualityPath = path.join(projectPaths.reports, 'mask-quality-report.json');
  const layerPackagePath = path.join(projectPaths.reports, 'cutout-layer-package.json');
  writeJson(planPath, plan);
  writeJson(reviewPath, review);
  writeJson(maskQualityPath, maskQualityReport);
  writeJson(layerPackagePath, layerPackage);
  return {
    request,
    plan,
    review,
    maskQualityReport,
    layerPackage,
    requestPath,
    planPath,
    reviewPath,
    maskQualityPath,
    layerPackagePath,
  };
}

module.exports = {
  normalizeCutoutElement,
  runCutoutDecompose,
  validatePlanElements,
};
