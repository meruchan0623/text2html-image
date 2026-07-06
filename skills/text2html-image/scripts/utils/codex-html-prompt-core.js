const fs = require('fs');
const path = require('path');
const { writeJson } = require('./workflow-core');

function readJsonFile(filePath, label) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing required ${label}: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readTextFile(filePath, label) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing required ${label}: ${filePath}`);
  return fs.readFileSync(filePath, 'utf8');
}

function writeTextFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function defaultPromptPaths(projectPaths, overrides = {}) {
  const reports = projectPaths.reports;
  return {
    visualIntake: path.resolve(overrides.visualIntakePath || path.join(reports, 'visual-intake-manifest.json')),
    reverseBrief: path.resolve(overrides.reverseBriefPath || path.join(reports, 'reverse-prompt-brief.md')),
    routing: path.resolve(overrides.routingPath || path.join(reports, 'asset-routing-table.json')),
    assetPrompts: path.resolve(overrides.assetPromptsPath || path.join(reports, 'asset-generation-prompts.json')),
    assetProvenance: path.resolve(overrides.assetProvenancePath || path.join(reports, 'asset-provenance.json')),
    reverseVisualSpec: path.resolve(overrides.reverseVisualSpecPath || path.join(reports, 'reverse-visual-spec.md')),
    visualElements: path.resolve(overrides.visualElementsPath || path.join(reports, 'visual-elements.json')),
    firstPassPlan: path.resolve(overrides.firstPassPlanPath || path.join(reports, 'first-pass-html-plan.md')),
    prompt: path.resolve(overrides.promptPath || path.join(reports, 'codex-first-pass-html-prompt.md')),
    audit: path.resolve(overrides.auditPath || path.join(reports, 'codex-prompt-compose-audit.json')),
  };
}

function tableRow(values) {
  return `| ${values.map((value) => String(value ?? '').replace(/\|/g, '\\|')).join(' | ')} |`;
}

function routeCounts(elements) {
  return elements.reduce((acc, item) => {
    const route = item.route || item.suggested_route || 'unknown';
    acc[route] = (acc[route] || 0) + 1;
    return acc;
  }, {});
}

function buildVisualElements({ visualIntake, routing }) {
  const routesById = new Map((routing.elements || []).map((item) => [String(item.id), item]));
  const manifestElements = Array.isArray(visualIntake.elements) ? visualIntake.elements : [];
  const routedOnly = (routing.elements || []).filter((item) => !manifestElements.some((element) => String(element.id) === String(item.id)));
  const elements = [
    ...manifestElements.map((element) => {
      const route = routesById.get(String(element.id)) || {};
      return {
        id: element.id,
        kind: element.kind,
        description: element.description,
        bbox: element.bbox || null,
        confidence: element.confidence,
        evidence: element.evidence || [],
        uncertainty_reason: element.uncertainty_reason || '',
        suggested_route: element.suggested_route || null,
        route: route.route || element.suggested_route || 'review',
        route_status: route.status || null,
        cutout_feasibility: route.cutout_feasibility || null,
        regeneration_fit: route.regeneration_fit || null,
        difficulty_signals: route.difficulty_signals || [],
        decision_reason: route.decision_reason || '',
        expected_output: route.expected_output || '',
      };
    }),
    ...routedOnly.map((route) => ({
      id: route.id,
      kind: route.kind,
      description: route.description,
      bbox: route.bbox || null,
      confidence: null,
      evidence: [],
      uncertainty_reason: '',
      suggested_route: null,
      route: route.route || 'review',
      route_status: route.status || null,
      cutout_feasibility: route.cutout_feasibility || null,
      regeneration_fit: route.regeneration_fit || null,
      difficulty_signals: route.difficulty_signals || [],
      decision_reason: route.decision_reason || '',
      expected_output: route.expected_output || '',
    })),
  ];
  return {
    generated_at: new Date().toISOString(),
    project_id: visualIntake.project_id || routing.project_id,
    subproject_id: visualIntake.subproject_id || routing.subproject_id || null,
    source_image: visualIntake.source_image || routing.source_image,
    canvas: visualIntake.canvas || routing.canvas,
    visual_intake_status: visualIntake.status,
    asset_routing_status: routing.status,
    visual_hierarchy: visualIntake.visual_hierarchy || [],
    business_text_candidates: visualIntake.business_text_candidates || [],
    unknowns_requiring_user_or_agent_review: visualIntake.unknowns_requiring_user_or_agent_review || [],
    elements,
  };
}

function renderReverseVisualSpec({ visualElements, reverseBrief }) {
  const lines = [
    '# Reverse Visual Spec',
    '',
    `- Source image: \`${visualElements.source_image}\``,
    `- Canvas: ${visualElements.canvas?.width || 'unknown'} x ${visualElements.canvas?.height || 'unknown'}`,
    `- Visual intake status: \`${visualElements.visual_intake_status}\``,
    `- Asset routing status: \`${visualElements.asset_routing_status}\``,
    '',
    '## Visual Hierarchy',
    '',
  ];
  if (visualElements.visual_hierarchy.length) {
    for (const item of visualElements.visual_hierarchy) lines.push(`- ${item}`);
  } else {
    lines.push('- No visual hierarchy was supplied.');
  }
  lines.push('', '## Business Text Candidates', '');
  if (visualElements.business_text_candidates.length) {
    for (const item of visualElements.business_text_candidates) lines.push(`- ${item}`);
  } else {
    lines.push('- No business text candidates were supplied.');
  }
  lines.push('', '## Element Table', '');
  lines.push(tableRow(['id', 'kind', 'bbox', 'route', 'cutout', 'regen', 'description']));
  lines.push(tableRow(['---', '---', '---', '---', '---', '---', '---']));
  for (const element of visualElements.elements) {
    const bbox = element.bbox ? `${element.bbox.x},${element.bbox.y},${element.bbox.w}x${element.bbox.h}` : 'missing';
    lines.push(tableRow([
      element.id,
      element.kind,
      bbox,
      element.route,
      element.cutout_feasibility || '',
      element.regeneration_fit || '',
      element.description,
    ]));
  }
  lines.push('', '## Unknowns And Review Items', '');
  if (visualElements.unknowns_requiring_user_or_agent_review.length) {
    for (const item of visualElements.unknowns_requiring_user_or_agent_review) lines.push(`- ${item}`);
  } else {
    lines.push('- None supplied by visual intake.');
  }
  lines.push('', '## Source Reverse Prompt Brief', '', reverseBrief.trim(), '');
  return `${lines.join('\n')}\n`;
}

function renderFirstPassHtmlPlan({ visualElements, assetPrompts }) {
  const elements = visualElements.elements;
  const byRoute = (route) => elements.filter((item) => item.route === route);
  const promptOnly = Array.isArray(assetPrompts?.prompts) ? assetPrompts.prompts : [];
  const lines = [
    '# First-Pass HTML Plan',
    '',
    '## Goal',
    '',
    'Create the first editable HTML/CSS pass from the structured visual spec, then verify with DOM, Visual-DOM, overflow, and visual comparison audits.',
    '',
    '## DOM text',
    '',
  ];
  const textItems = byRoute('editable_text');
  if (textItems.length) {
    for (const item of textItems) lines.push(`- \`${item.id}\`: ${item.description || 'editable text'}; keep selectable and add stable data-i18n-key or business metadata.`);
  } else {
    lines.push('- Use `business_text_candidates` from visual intake as candidates only; verify final copy before delivery.');
  }
  lines.push('', '## CSS/SVG vector layers', '');
  const vectorItems = byRoute('editable_vector');
  if (vectorItems.length) {
    for (const item of vectorItems) lines.push(`- \`${item.id}\`: ${item.description || 'vector layer'}; implement with CSS/SVG, not bitmap text.`);
  } else {
    lines.push('- No editable vector elements were routed.');
  }
  lines.push('', '## Bitmap and source-truth layers', '');
  const bitmapRoutes = ['reference_cutout', 'locked_base_layer', 'review'];
  const bitmapItems = elements.filter((item) => bitmapRoutes.includes(item.route));
  if (bitmapItems.length) {
    for (const item of bitmapItems) {
      lines.push(`- \`${item.id}\`: route=\`${item.route}\`, expected=\`${item.expected_output || 'asset evidence required'}\`, reason=${item.decision_reason || 'routing evidence required'}`);
    }
  } else {
    lines.push('- No bitmap/source-truth elements were routed.');
  }
  lines.push('', '## Regenerated prompt-only assets', '');
  if (promptOnly.length) {
    for (const item of promptOnly) lines.push(`- \`${item.id}\`: prompt package exists but prompt_only assets are not final assets; wait for accepted PNG + alpha/provenance audit before HTML placement.`);
  } else {
    lines.push('- No regenerated prompt-only assets were requested.');
  }
  lines.push('', '## Do not', '');
  lines.push('- Do not place prompt_only assets into HTML.');
  lines.push('- Do not bake required text, prices, labels, legal copy, QR codes, or logo source truth into a generated bitmap.');
  lines.push('- Do not use broad original-image overlays or glass effects that reintroduce old flattened elements.');
  lines.push('- Do not route hard-to-vector people, maps, clouds, skylines, landmarks, globes, or application icons to CSS geometry placeholders.');
  lines.push('', '## Verification commands', '');
  lines.push('```bash');
  lines.push('npm run audit:dom -- --project <project-id>');
  lines.push('npm run audit:visual-dom -- --project <project-id> --width <canvas-width> --height <canvas-height>');
  lines.push('npm run audit:overflow -- --project <project-id> --width <canvas-width> --height <canvas-height>');
  lines.push('npm run audit:visual-compare -- --reference <source/reference.png> --render <exports/index.png>');
  lines.push('```');
  return `${lines.join('\n')}\n`;
}

function renderCodexPromptBundle({ paths, visualElements, assetPrompts }) {
  const canvas = visualElements.canvas || {};
  const promptOnlyCount = Array.isArray(assetPrompts?.prompts) ? assetPrompts.prompts.length : 0;
  const lines = [
    '# Codex First-Pass HTML Prompt',
    '',
    'Read these local artifacts in this order before writing HTML:',
    '',
    `1. \`${paths.reverseVisualSpec}\``,
    `2. \`${paths.visualElements}\``,
    `3. \`${paths.routing}\``,
    `4. \`${paths.firstPassPlan}\``,
    `5. \`${paths.reverseBrief}\``,
    '',
    'Do not start writing HTML until every required artifact above exists and you can state which elements are editable DOM text, editable CSS/SVG, bitmap/source-truth layers, regenerated prompt-only assets, or review-gated.',
    '',
    '## Task',
    '',
    `Create the first static editable HTML/CSS pass for project \`${visualElements.project_id}\` at canvas ${canvas.width || '<width>'} x ${canvas.height || '<height>'}.`,
    '',
    '## Hard Rules',
    '',
    '- Text, prices, CTAs, labels, legal copy, and business rows must be selectable DOM text unless explicitly accepted as source-truth bitmap.',
    '- Use bitmap layers only where routing evidence says `reference_cutout`, `locked_base_layer`, source-truth bitmap, or accepted final asset.',
    '- `prompt_only` is not a final asset. Do not place generated-image prompts in HTML until real PNG outputs pass alpha/provenance audits.',
    '- Keep independently adjustable complex art as separate DOM nodes with explicit CSS placement.',
    '- Avoid broad original-reference overlays that cause ghosted old elements under new DOM.',
    '',
    '## Current Input Summary',
    '',
    `- Visual elements: ${visualElements.elements.length}`,
    `- Route counts: ${JSON.stringify(routeCounts(visualElements.elements))}`,
    `- Prompt-only regenerated assets: ${promptOnlyCount}`,
    '',
    '## Required First-Pass Outputs',
    '',
    '- `html/index.html` or the active grouped HTML path.',
    '- `html/master.css` or equivalent stylesheet.',
    '- Updated asset provenance when bitmap layers are used.',
    '- Browser screenshot and DOM/Visual-DOM evidence before claiming completion.',
    '',
  ];
  return `${lines.join('\n')}\n`;
}

function composeCodexHtmlPrompt(options = {}) {
  const projectPaths = options.projectPaths;
  if (!projectPaths?.reports) throw new Error('composeCodexHtmlPrompt requires projectPaths with a reports directory.');
  const paths = defaultPromptPaths(projectPaths, options);
  const visualIntake = readJsonFile(paths.visualIntake, 'visual-intake-manifest.json');
  const reverseVisualSpec = readTextFile(paths.reverseVisualSpec, 'reverse-visual-spec.md');
  const reverseBrief = readTextFile(paths.reverseBrief, 'reverse-prompt-brief.md');
  const routing = readJsonFile(paths.routing, 'asset-routing-table.json');
  const assetPrompts = fs.existsSync(paths.assetPrompts) ? readJsonFile(paths.assetPrompts, 'asset-generation-prompts.json') : { prompts: [] };
  const assetProvenanceExists = fs.existsSync(paths.assetProvenance);

  if (visualIntake.status !== 'pass' && !options.allowReview) {
    throw new Error(`visual-intake-manifest.json status is ${visualIntake.status || 'unknown'}; provide a passing model response or rerun with --allow-review.`);
  }

  const visualElements = buildVisualElements({ visualIntake, routing });
  const firstPassPlan = renderFirstPassHtmlPlan({ visualElements, assetPrompts });
  const prompt = renderCodexPromptBundle({ paths, visualElements, assetPrompts });
  const warnings = [];
  if (routing.status && routing.status !== 'pass') warnings.push(`asset-routing-table.json status is ${routing.status}`);
  if (!assetProvenanceExists) warnings.push('asset-provenance.json is missing; bitmap placement must remain review-gated until provenance exists.');
  if (visualElements.unknowns_requiring_user_or_agent_review.length) warnings.push('visual intake has unknowns requiring review.');
  const audit = {
    generated_at: new Date().toISOString(),
    project_id: projectPaths.project_id,
    subproject_id: projectPaths.subproject_id || null,
    status: 'pass',
    allow_review: Boolean(options.allowReview),
    required_inputs: {
      reverse_visual_spec: paths.reverseVisualSpec,
      visual_intake_manifest: paths.visualIntake,
      reverse_prompt_brief: paths.reverseBrief,
      asset_routing_table: paths.routing,
    },
    optional_inputs: {
      asset_generation_prompts: fs.existsSync(paths.assetPrompts) ? paths.assetPrompts : null,
      asset_provenance: assetProvenanceExists ? paths.assetProvenance : null,
    },
    written_outputs: {
      visual_elements: paths.visualElements,
      first_pass_html_plan: paths.firstPassPlan,
      codex_first_pass_html_prompt: paths.prompt,
      audit: paths.audit,
    },
    input_statuses: {
      visual_intake: visualIntake.status || null,
      asset_routing: routing.status || null,
    },
    summary: {
      element_count: visualElements.elements.length,
      route_counts: routeCounts(visualElements.elements),
      prompt_only_count: Array.isArray(assetPrompts.prompts) ? assetPrompts.prompts.length : 0,
      warning_count: warnings.length,
    },
    warnings,
  };

  writeJson(paths.visualElements, visualElements);
  writeTextFile(paths.firstPassPlan, firstPassPlan);
  writeTextFile(paths.prompt, prompt);
  writeJson(paths.audit, audit);

  return {
    audit,
    reverseVisualSpec,
    visualElements,
    firstPassPlan,
    prompt,
    paths,
  };
}

module.exports = {
  buildVisualElements,
  composeCodexHtmlPrompt,
  defaultPromptPaths,
  renderCodexPromptBundle,
  renderFirstPassHtmlPlan,
  renderReverseVisualSpec,
};
