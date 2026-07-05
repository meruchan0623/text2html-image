const fs = require('fs');
const path = require('path');
const { createProjectWorkspace, parseArgs, writeJson } = require('./utils/workflow-core');
const { listHtmlEntries } = require('./utils/html-entries');
const { inspectRenderProfile } = require('./utils/render-profile');
const { compilePosterIr } = require('./utils/poster-ir');
const { compileSvg } = require('./utils/svg-compiler');
const { Resvg } = require('@resvg/resvg-js');
const { PNG } = require('pngjs');

function renderSvgToPng(svg, pngPath, scale) {
  const renderer = new Resvg(svg, {
    fitTo: {
      mode: 'zoom',
      value: scale,
    },
    font: {
      loadSystemFonts: true,
    },
  });
  const pngData = renderer.render();
  fs.mkdirSync(path.dirname(pngPath), { recursive: true });
  fs.writeFileSync(pngPath, pngData.asPng());
}

function readLayerPng(layer) {
  if (!layer.href || !fs.existsSync(layer.href)) return null;
  try {
    return PNG.sync.read(fs.readFileSync(layer.href));
  } catch (_error) {
    return null;
  }
}

function sampleRegionEvidence(png, layer, scale) {
  const x0 = Math.max(0, Math.floor(layer.x * scale));
  const y0 = Math.max(0, Math.floor(layer.y * scale));
  const x1 = Math.min(png.width, Math.ceil((layer.x + layer.width) * scale));
  const y1 = Math.min(png.height, Math.ceil((layer.y + layer.height) * scale));
  const sourcePng = readLayerPng(layer);
  const colors = new Set();
  let sampled = 0;
  let sourceOpaqueSampled = 0;
  const stepX = Math.max(1, Math.floor((x1 - x0) / 24));
  const stepY = Math.max(1, Math.floor((y1 - y0) / 24));
  for (let y = y0; y < y1; y += stepY) {
    for (let x = x0; x < x1; x += stepX) {
      if (sourcePng) {
        const localX = (x - x0) / Math.max(1, x1 - x0);
        const localY = (y - y0) / Math.max(1, y1 - y0);
        const sx = Math.max(0, Math.min(sourcePng.width - 1, Math.floor(localX * sourcePng.width)));
        const sy = Math.max(0, Math.min(sourcePng.height - 1, Math.floor(localY * sourcePng.height)));
        const sourceAlpha = sourcePng.data[((sourcePng.width * sy + sx) << 2) + 3];
        if (sourceAlpha === 0) continue;
        sourceOpaqueSampled += 1;
      }
      const offset = (png.width * y + x) << 2;
      colors.add(`${png.data[offset]},${png.data[offset + 1]},${png.data[offset + 2]},${png.data[offset + 3]}`);
      sampled += 1;
    }
  }
  return {
    layer_id: layer.id,
    bbox: { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) },
    sampled_pixel_count: sampled,
    source_opaque_sample_count: sourcePng ? sourceOpaqueSampled : null,
    source_alpha_checked: Boolean(sourcePng),
    distinct_sampled_color_count: colors.size,
    status: sampled > 0 && colors.size >= 2 ? 'visible' : 'review',
  };
}

function inspectImageLayerEvidence(pngPath, ir, scale) {
  const imageLayers = ir.layers.filter((layer) => layer.type === 'image');
  if (!imageLayers.length || !pngPath || !fs.existsSync(pngPath)) {
    return {
      image_layer_count: imageLayers.length,
      visible_image_layer_count: 0,
      layers: [],
    };
  }
  const png = PNG.sync.read(fs.readFileSync(pngPath));
  const layers = imageLayers.map((layer) => sampleRegionEvidence(png, layer, scale));
  return {
    image_layer_count: imageLayers.length,
    visible_image_layer_count: layers.filter((layer) => layer.status === 'visible').length,
    layers,
  };
}

function main() {
  const args = parseArgs();
  const projectPaths = createProjectWorkspace(args.project, { subprojectId: args.subproject });
  const entries = listHtmlEntries(projectPaths, { group: args.group });
  const scale = Number(args.scale || 1);
  const profileEntries = entries.map((entry) => {
    const profile = inspectRenderProfile(entry.html);
    if (profile.status === 'pass') {
      const ir = compilePosterIr(entry.html);
      const irDir = path.join(projectPaths.reports, 'render-ir');
      const irPath = path.join(irDir, `${entry.html_group}.${entry.variant}.json`);
      writeJson(irPath, ir);
      const svgDir = path.join(projectPaths.working, 'render-svg');
      const svgPath = path.join(svgDir, `${entry.html_group}-${entry.variant}.svg`);
      const svg = compileSvg(ir);
      fs.mkdirSync(svgDir, { recursive: true });
      fs.writeFileSync(svgPath, svg);
      const pngPath = path.join(projectPaths.exports, `${entry.html_group}-${entry.variant}.png`);
      if (!args['profile-only']) {
        renderSvgToPng(svg, pngPath, scale);
      }
      const imageLayerEvidence = args['profile-only'] ? undefined : inspectImageLayerEvidence(pngPath, ir, scale);
      return {
        ...entry,
        ...profile,
        ir_path: irPath,
        svg_path: svgPath,
        png: args['profile-only'] ? undefined : pngPath,
        image_layer_evidence: imageLayerEvidence,
        scale,
      };
    }
    return { ...entry, ...profile };
  });
  const report = {
    generated_at: new Date().toISOString(),
    project_id: projectPaths.project_id,
    subproject_id: projectPaths.subproject_id,
    mode: args['profile-only'] ? 'profile-only' : 'export-fast',
    status: profileEntries.every((entry) => entry.status === 'pass') ? 'pass' : 'partial',
    entries: profileEntries,
  };
  const reportPath = path.join(projectPaths.reports, 'render-profile-report.json');
  writeJson(reportPath, report);
  console.log(`Render profile report written: ${reportPath}`);
  if (!args['profile-only']) {
    const exported = profileEntries.filter((entry) => entry.status === 'pass' && entry.png);
    const failed = profileEntries.filter((entry) => entry.status !== 'pass');
    const pngReport = {
      generated_at: new Date().toISOString(),
      project_id: projectPaths.project_id,
      subproject_id: projectPaths.subproject_id,
      renderer: 'direct-html-svg-resvg',
      status: failed.length ? 'partial' : 'pass',
      exports: exported.map((entry) => ({
        html_group: entry.html_group,
        variant: entry.variant,
        html: entry.html,
        svg: entry.svg_path,
        png: entry.png,
        scale: entry.scale,
        canvas: entry.canvas,
        output_pixels: {
          width: entry.canvas.width * entry.scale,
          height: entry.canvas.height * entry.scale,
        },
        image_layer_evidence: entry.image_layer_evidence,
      })),
      failed: failed.map((entry) => ({
        html_group: entry.html_group,
        variant: entry.variant,
        html: entry.html,
        unsupported_css: entry.unsupported_css,
        errors: entry.errors,
      })),
    };
    writeJson(path.join(projectPaths.reports, 'png-export-report.json'), pngReport);
    if (exported.length) console.log(`Direct PNG export completed for ${exported.length} HTML preview(s).`);
    if (!exported.length) {
      console.error('No PNG files exported because no HTML entry passed the direct render profile.');
      process.exit(1);
    }
  }
}

main();
