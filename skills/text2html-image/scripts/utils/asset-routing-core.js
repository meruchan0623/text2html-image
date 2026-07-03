const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const { writeJson } = require('./workflow-core');

const TEXT_KINDS = new Set(['text', 'copy', 'headline', 'title', 'subtitle', 'caption', 'label', 'price', 'cta', 'legal', 'table_text', 'business_label']);
const VECTOR_KINDS = new Set(['card', 'panel', 'border', 'divider', 'dot', 'pill', 'badge', 'simple_icon', 'notice_bar', 'shape']);
const HARD_TO_VECTOR_KINDS = new Set(['person', 'map', 'cloud', 'skyline', 'landmark', 'globe', 'application_icon', 'app_icon', 'complex_icon', 'brand_icon', 'multicolor_icon', 'screenshot_icon']);
const HARD_TO_VECTOR_ALLOWED_ROUTES = new Set(['reference_cutout', 'regenerated_image', 'locked_base_layer', 'review']);
const COMPLEX_KINDS = new Set(['person', 'character', 'mascot', 'map', 'globe', 'cloud', 'skyline', 'landmark', 'device', 'product_render', 'illustration', 'complex_art', 'application_icon', 'app_icon', 'complex_icon', 'brand_icon', 'multicolor_icon', 'screenshot_icon']);
const FIXED_COMPLEX_ASSET_INSTRUCTION = '人物、地图、云和天际线，应用程序图标这些难以用 SVG 或图形线条复刻的部分，请采用抠图或者反向生成提示词再生图的形式进行。';
const IMAGEGEN_FORBIDDEN_BACKGROUNDS = [
  'green screen',
  'green background',
  'chroma key background',
  'white matte',
  'gray matte',
  'beige matte',
  'colored matte',
  'gradient background',
];

function readImageDimensions(imagePath) {
  const buffer = fs.readFileSync(imagePath);
  if (buffer.length >= 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
    const png = PNG.sync.read(buffer);
    return { width: png.width, height: png.height, format: 'png' };
  }
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        return {
          width: buffer.readUInt16BE(offset + 7),
          height: buffer.readUInt16BE(offset + 5),
          format: 'jpeg',
        };
      }
      offset += 2 + length;
    }
  }
  throw new Error(`Unsupported or unreadable source image: ${imagePath}`);
}

function parseElementsInput(input) {
  if (!input) return { elements: [] };
  if (typeof input === 'object') return normalizeElementsContainer(input);
  const text = String(input).trim();
  if (!text) return { elements: [] };
  const fromFile = fs.existsSync(text) ? fs.readFileSync(text, 'utf8') : text;
  return normalizeElementsContainer(JSON.parse(fromFile));
}

function normalizeElementsContainer(value) {
  if (Array.isArray(value)) return { elements: value };
  if (Array.isArray(value.elements)) return value;
  throw new Error('Elements input must be an array or an object with an elements array.');
}

function normalizeKind(kind) {
  return String(kind || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function isHardToVectorKind(kind) {
  return HARD_TO_VECTOR_KINDS.has(normalizeKind(kind));
}

function isIconLikeCutoutKind(kind) {
  return ['icon', 'logo', 'application_icon', 'app_icon', 'complex_icon', 'brand_icon', 'multicolor_icon', 'screenshot_icon'].includes(normalizeKind(kind));
}

function bboxArea(bbox) {
  if (!bbox) return 0;
  return Math.max(0, Number(bbox.w || bbox.width || 0)) * Math.max(0, Number(bbox.h || bbox.height || 0));
}

function bboxTouchesEdge(bbox, canvas, marginRatio = 0.025) {
  if (!bbox || !canvas) return false;
  const marginX = canvas.width * marginRatio;
  const marginY = canvas.height * marginRatio;
  const x = Number(bbox.x || 0);
  const y = Number(bbox.y || 0);
  const w = Number(bbox.w || bbox.width || 0);
  const h = Number(bbox.h || bbox.height || 0);
  return x <= marginX || y <= marginY || x + w >= canvas.width - marginX || y + h >= canvas.height - marginY;
}

function hasMeaningfulBBox(element) {
  return bboxArea(element.bbox) > 0;
}

function hasDescription(element) {
  return Boolean(String(element.description || '').trim());
}

function pushSignal(signals, condition, signal) {
  if (condition && !signals.includes(signal)) signals.push(signal);
}

function scoreElement(element, canvas) {
  const kind = normalizeKind(element.kind);
  const description = String(element.description || '').toLowerCase();
  const signals = [];
  const area = bboxArea(element.bbox);
  const canvasArea = Math.max(1, canvas.width * canvas.height);
  const areaRatio = area / canvasArea;

  pushSignal(signals, !hasMeaningfulBBox(element), 'missing_bbox');
  pushSignal(signals, !hasDescription(element), 'missing_description');
  pushSignal(signals, area > 0 && area < 64 * 64 && COMPLEX_KINDS.has(kind), 'low_resolution_bbox');
  pushSignal(signals, Boolean(element.overlaps_text || element.occluded || element.partially_occluded), 'partially_occluded');
  pushSignal(signals, Boolean(element.soft_edges || /soft|blur|feather|transparent|gradient|glow/.test(description)), 'soft_edges');
  pushSignal(signals, bboxTouchesEdge(element.bbox, canvas), 'touches_canvas_edge');
  pushSignal(signals, Boolean(element.background_similar || /similar background|low contrast/.test(description)), 'background_close_to_subject');
  pushSignal(signals, Boolean(element.visual_noise || /noisy|busy|dense/.test(description)), 'visual_noise');
  pushSignal(signals, Boolean(element.needs_style_consistency || /consistent style|same style|3d|illustration/.test(description)), 'style_consistency_needed');
  pushSignal(signals, Boolean(element.needs_independent_adjustment), 'independent_adjustment_needed');
  pushSignal(signals, areaRatio > 0.35 && COMPLEX_KINDS.has(kind), 'large_locked_art_candidate');

  let cutoutScore = 2;
  if (signals.includes('missing_bbox')) cutoutScore -= 2;
  if (signals.includes('missing_description')) cutoutScore -= 1;
  if (signals.includes('low_resolution_bbox')) cutoutScore -= 1;
  if (signals.includes('partially_occluded')) cutoutScore -= 2;
  if (signals.includes('soft_edges')) cutoutScore -= 1;
  if (signals.includes('touches_canvas_edge')) cutoutScore -= 1;
  if (signals.includes('background_close_to_subject')) cutoutScore -= 1;
  if (signals.includes('visual_noise')) cutoutScore -= 1;
  if (isIconLikeCutoutKind(kind)) cutoutScore += 1;

  let regenerationScore = 0;
  if (COMPLEX_KINDS.has(kind)) regenerationScore += 2;
  if (['person', 'character', 'mascot', 'cloud', 'skyline', 'landmark', 'globe', 'map', 'illustration'].includes(kind)) regenerationScore += 1;
  if (signals.includes('partially_occluded')) regenerationScore += 1;
  if (signals.includes('soft_edges')) regenerationScore += 1;
  if (signals.includes('style_consistency_needed')) regenerationScore += 1;
  if (kind === 'icon' || kind === 'logo') regenerationScore -= 2;

  const cutoutFeasibility = cutoutScore >= 2 ? 'high' : cutoutScore >= 0 ? 'medium' : 'low';
  const regenerationFit = regenerationScore >= 3 ? 'high' : regenerationScore >= 1 ? 'medium' : 'low';
  return { cutoutFeasibility, regenerationFit, signals };
}

function expectedOutputFor(element, route) {
  const id = String(element.id || 'asset').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'asset';
  if (route === 'editable_text') return `DOM text node with data-i18n-key or business metadata for ${id}`;
  if (route === 'editable_vector') return `CSS/SVG vector layer for ${id}`;
  if (route === 'locked_base_layer') return `assets/${id}-base.png`;
  if (route === 'omit_or_simplify') return `omitted or simplified ${id}`;
  return `assets/${id}.png`;
}

function decideRoute(element, score) {
  const kind = normalizeKind(element.kind);
  if (TEXT_KINDS.has(kind)) return 'editable_text';
  if (VECTOR_KINDS.has(kind)) return 'editable_vector';
  const requestedRoute = normalizeKind(element.route);
  if (requestedRoute && isHardToVectorKind(kind) && HARD_TO_VECTOR_ALLOWED_ROUTES.has(requestedRoute)) return requestedRoute;
  if (requestedRoute && !isHardToVectorKind(kind)) return requestedRoute;
  if (score.signals.includes('missing_bbox') || score.signals.includes('missing_description')) return 'review';
  if (element.locked_base_layer || score.signals.includes('large_locked_art_candidate')) return 'locked_base_layer';
  if (element.omit || element.simplify) return 'omit_or_simplify';
  if (score.cutoutFeasibility === 'low' || score.regenerationFit === 'high') return 'regenerated_image';
  if (score.cutoutFeasibility === 'high' && !score.signals.includes('partially_occluded')) return 'reference_cutout';
  if (COMPLEX_KINDS.has(kind)) return score.regenerationFit === 'medium' ? 'regenerated_image' : 'reference_cutout';
  return 'reference_cutout';
}

function decisionReason(element, route, score) {
  if (route === 'editable_text') return 'User-facing or business text must remain selectable editable DOM text.';
  if (route === 'editable_vector') return 'Regular UI geometry is more stable and editable as CSS/SVG.';
  if (route === 'review') return `Element needs review because ${score.signals.join(', ') || 'required routing data is incomplete'}.`;
  if (route === 'regenerated_image') return `Cutout is ${score.cutoutFeasibility} and regeneration fit is ${score.regenerationFit}; use prompt_only image generation before final PNG acceptance.`;
  if (route === 'reference_cutout') return `Cutout feasibility is ${score.cutoutFeasibility} with no blocking occlusion signals.`;
  if (route === 'locked_base_layer') return 'Large or intentionally locked decorative art should remain a base bitmap layer without required text.';
  return 'Element can be omitted or simplified without harming the message.';
}

function promptFor(element, canvas) {
  return [
    FIXED_COMPLEX_ASSET_INSTRUCTION,
    `Generate an isolated transparent PNG with alpha channel for: ${element.description || element.id}.`,
    `Canvas context: source poster ${canvas.width}x${canvas.height}.`,
    'Match the reference style, lighting, and perspective. Do not include text, logo copy, UI labels, QR codes, or background panels.',
    'Output must be a clean standalone subject with real transparent background for HTML/CSS placement: exterior pixels outside the subject must have alpha 0.',
    'No green screen, green background, chroma key background, white matte, gray matte, beige matte, colored matte, or gradient background.',
    'Return PNG output only; do not fake transparency with a solid color background.',
  ].join(' ');
}

function routeAssets(options) {
  const sourceImage = path.resolve(String(options.sourceImage));
  const projectPaths = options.projectPaths;
  const dimensions = readImageDimensions(sourceImage);
  const elementsInput = parseElementsInput(options.elementsInput);
  const elements = elementsInput.elements.map((element, index) => {
    const id = String(element.id || `element-${index + 1}`);
    const score = scoreElement(element, dimensions);
    const route = decideRoute(element, score);
    const status = route === 'review' ? 'review' : 'planned';
    return {
      id,
      kind: normalizeKind(element.kind),
      description: String(element.description || ''),
      bbox: element.bbox || null,
      route,
      status,
      cutout_feasibility: score.cutoutFeasibility,
      regeneration_fit: score.regenerationFit,
      difficulty_signals: score.signals,
      decision_reason: decisionReason(element, route, score),
      requires_imagegen_prompt: route === 'regenerated_image',
      expected_output: expectedOutputFor({ ...element, id }, route),
      needs_independent_adjustment: Boolean(element.needs_independent_adjustment),
    };
  });

  const routing = {
    generated_at: new Date().toISOString(),
    project_id: projectPaths.project_id,
    subproject_id: projectPaths.subproject_id || null,
    source_image: sourceImage,
    canvas: { width: dimensions.width, height: dimensions.height, format: dimensions.format },
    status: elements.some((item) => item.status === 'review') ? 'review' : 'pass',
    elements,
  };

  const prompts = {
    generated_at: routing.generated_at,
    project_id: routing.project_id,
    source_image: sourceImage,
    prompts: elements
      .filter((item) => item.route === 'regenerated_image')
      .map((item) => ({
        id: item.id,
        route: item.route,
        status: 'prompt_only',
        expected_output: item.expected_output,
        required_format: 'png',
        requires_alpha_channel: true,
        exterior_alpha: 0,
        forbidden_backgrounds: IMAGEGEN_FORBIDDEN_BACKGROUNDS,
        prompt: promptFor(item, dimensions),
        blocked_from_final_html: true,
      })),
  };

  const provenance = {
    generated_at: routing.generated_at,
    project_id: routing.project_id,
    source_image: sourceImage,
    assets: elements
      .filter((item) => ['reference_cutout', 'regenerated_image', 'locked_base_layer'].includes(item.route))
      .map((item) => ({
        id: item.id,
        route: item.route,
        asset_source_type: item.route === 'regenerated_image' ? 'prompt_only' : item.route === 'reference_cutout' ? 'planned_reference_cutout' : 'planned_locked_base_layer',
        status: item.route === 'regenerated_image' ? 'prompt_only' : 'planned',
        final_asset_ready: false,
        expected_output: item.expected_output,
        required_before_final: item.route === 'regenerated_image'
          ? ['real_png_output', 'alpha_audit', 'mask_debug', 'provenance_update']
          : ['crop_output', 'alpha_audit', 'mask_debug'],
      })),
  };

  const brief = writeBrief({ routing, prompts });
  if (projectPaths?.reports) {
    writeJson(path.join(projectPaths.reports, 'asset-routing-table.json'), routing);
    writeJson(path.join(projectPaths.reports, 'asset-generation-prompts.json'), prompts);
    writeJson(path.join(projectPaths.reports, 'asset-provenance.json'), provenance);
    fs.writeFileSync(path.join(projectPaths.reports, 'reverse-prompt-brief.md'), brief, 'utf8');
  }
  return { routing, prompts, provenance, brief };
}

function writeBrief({ routing, prompts }) {
  const lines = [
    '# Reverse Prompt Brief',
    '',
    `- Source image: \`${routing.source_image}\``,
    `- Canvas: ${routing.canvas.width} x ${routing.canvas.height} (${routing.canvas.format})`,
    `- Status: \`${routing.status}\``,
    `- Routed elements: ${routing.elements.length}`,
    `- Regenerated prompt-only assets: ${prompts.prompts.length}`,
    '',
    '## Element Routes',
    '',
  ];
  for (const item of routing.elements) {
    lines.push(`- \`${item.id}\`: \`${item.route}\`, cutout=\`${item.cutout_feasibility}\`, regeneration=\`${item.regeneration_fit}\`, signals=${item.difficulty_signals.join(', ') || 'none'}`);
  }
  lines.push('', 'Reverse prompts are planning artifacts only. They do not prove that final PNG assets exist.');
  return `${lines.join('\n')}\n`;
}

module.exports = {
  parseElementsInput,
  readImageDimensions,
  routeAssets,
  scoreElement,
};
