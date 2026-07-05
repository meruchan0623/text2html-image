const fs = require('fs');
const path = require('path');
const { readImageDimensions } = require('./asset-routing-core');
const { buildLayerPackage, buildMaskQualityReport } = require('./mask-quality-core');
const { runMacPersonCutout } = require('./person-cutout-mac-core');
const { normalizeBbox } = require('./visual-intake-core');
const { writeJson } = require('./workflow-core');

const MODES = new Set(['agent_first', 'grounding_first', 'hybrid', 'review_only']);
const ROUTES = new Set(['editable_text', 'editable_vector', 'reference_cutout', 'regenerated_image', 'locked_base_layer', 'review']);
const BBOX_SOURCES = new Set(['agent', 'grounding', 'manual', 'merged']);
const HARD_TO_VECTOR = new Set(['person', 'map', 'cloud', 'skyline', 'landmark', 'app_icon', 'application_icon', 'complex_icon']);
const LOCAL_MAC_PERSON_KINDS = new Set(['person', 'human', 'portrait', 'traveler', 'character', 'mascot', 'cartoon_person']);
const SEMANTIC_CUTOUT_KINDS = new Set(['person', 'human', 'portrait', 'traveler', 'character', 'mascot', 'cartoon_person', 'map', 'cloud', 'skyline', 'landmark', 'globe', 'app_icon', 'application_icon', 'complex_icon']);

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
    auto_cutout: null,
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

function textLooksPersonLike(element) {
  return /person|human|portrait|traveler|character|mascot|人物|人像|真人|卡通人像/i.test([
    element.kind,
    element.label,
    element.prompt,
  ].filter(Boolean).join(' '));
}

function isLocalMacPersonKind(element) {
  return LOCAL_MAC_PERSON_KINDS.has(String(element.kind || '').toLowerCase()) || textLooksPersonLike(element);
}

function needsSemanticCutout(element) {
  const kind = String(element.kind || '').toLowerCase();
  return (
    element.route === 'reference_cutout' &&
    !element.mask_path &&
    !element.layer_path &&
    (SEMANTIC_CUTOUT_KINDS.has(kind) || HARD_TO_VECTOR.has(kind) || textLooksPersonLike(element))
  );
}

function shouldAutoSemanticCutout(element) {
  return needsSemanticCutout(element) && isLocalMacPersonKind(element);
}

function macPersonCutoutPaths(projectPaths, element) {
  const id = normalizeId(element.id, 'person');
  return {
    output: path.join(projectPaths.source, `${id}-mac-person-same-canvas.png`),
    cropOutput: path.join(projectPaths.source, `${id}-mac-person-cropped.png`),
    mask: path.join(projectPaths.working, `${id}-mac-person-alpha-mask.png`),
    checker: path.join(projectPaths.working, `${id}-mac-person-checker.png`),
    report: path.join(projectPaths.reports, `${id}-mac-person-cutout-report.json`),
  };
}

function readReportIfPresent(reportPath) {
  if (!reportPath || !fs.existsSync(reportPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  } catch (_error) {
    return {};
  }
}

function markExternalSemanticReview(element) {
  if (!needsSemanticCutout(element) || shouldAutoSemanticCutout(element)) return null;
  element.auto_cutout = {
    status: 'review',
    provider: null,
    reason: 'no_local_semantic_provider_for_kind',
    next_action: 'provide_external_semantic_mask_or_regenerated_asset',
  };
  return element.auto_cutout;
}

function dispatchSemanticCutouts(elements, options = {}) {
  const dispatches = [];
  const provider = options.semanticCutoutProvider || runMacPersonCutout;
  const projectPaths = options.projectPaths;
  const sourceImage = options.sourceImage;
  const canvas = options.canvas;
  if (!projectPaths || !sourceImage || !canvas) return dispatches;

  for (const element of elements) {
    if (shouldAutoSemanticCutout(element)) {
      const paths = macPersonCutoutPaths(projectPaths, element);
      try {
        const result = provider({
          input: sourceImage,
          ...paths,
        });
        const report = readReportIfPresent(result.report || paths.report);
        element.mask_path = result.mask || paths.mask;
        element.layer_path = result.output || paths.output;
        element.crop_layer_path = result.cropOutput || paths.cropOutput;
        element.checker_path = result.checker || paths.checker;
        element.cutout_report_path = result.report || paths.report;
        element.transparency_method = report.transparency_method || 'macos_vision_person_segmentation';
        element.asset_source_type = 'reference_cutout';
        element.css_placement = { left: 0, top: 0, width: canvas.width, height: canvas.height };
        element.auto_cutout = {
          status: 'pass',
          provider: 'macos_vision_person',
          transparency_method: element.transparency_method,
          output: element.layer_path,
          crop_output: element.crop_layer_path,
          mask: element.mask_path,
          checker: element.checker_path,
          report: element.cutout_report_path,
        };
        dispatches.push({
          element_id: element.id,
          status: 'pass',
          provider: 'macos_vision_person',
          output: element.layer_path,
          mask: element.mask_path,
          report: element.cutout_report_path,
        });
      } catch (error) {
        element.auto_cutout = {
          status: 'review',
          provider: 'macos_vision_person',
          error: error.message,
          next_action: 'run_on_macos_or_provide_external_semantic_mask',
        };
        dispatches.push({
          element_id: element.id,
          status: 'review',
          provider: 'macos_vision_person',
          error: error.message,
        });
      }
      continue;
    }

    const review = markExternalSemanticReview(element);
    if (review) {
      dispatches.push({
        element_id: element.id,
        status: review.status,
        provider: review.provider,
        reason: review.reason,
        next_action: review.next_action,
      });
    }
  }
  return dispatches;
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
  const autoCutoutDispatches = response && options.autoCutout !== false
    ? dispatchSemanticCutouts(elements, {
      projectPaths,
      sourceImage,
      canvas: { width: dimensions.width, height: dimensions.height },
      semanticCutoutProvider: options.semanticCutoutProvider,
    })
    : [];
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
    auto_cutout_dispatches: autoCutoutDispatches,
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
  dispatchSemanticCutouts,
  normalizeCutoutElement,
  runCutoutDecompose,
  shouldAutoSemanticCutout,
  validatePlanElements,
};
