const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

function readPng(filePath) {
  return PNG.sync.read(fs.readFileSync(filePath));
}

function alphaStats(filePath) {
  const png = readPng(filePath);
  let alphaMin = 255;
  let alphaMax = 0;
  let transparentPixels = 0;
  let opaquePixels = 0;
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  for (let pixelIndex = 0; pixelIndex < png.width * png.height; pixelIndex += 1) {
    const index = (pixelIndex << 2) + 3;
    const alpha = png.data[index];
    const x = pixelIndex % png.width;
    const y = Math.floor(pixelIndex / png.width);
    alphaMin = Math.min(alphaMin, alpha);
    alphaMax = Math.max(alphaMax, alpha);
    if (alpha === 0) transparentPixels += 1;
    if (alpha === 255) {
      opaquePixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  const opaqueBounds = opaquePixels
    ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
    : null;
  const opaqueBoundsArea = opaqueBounds ? opaqueBounds.width * opaqueBounds.height : 0;
  const opaqueBoundsFillRatio = opaqueBoundsArea ? opaquePixels / opaqueBoundsArea : 0;
  return {
    width: png.width,
    height: png.height,
    alpha_min: alphaMin,
    alpha_max: alphaMax,
    transparent_pixels: transparentPixels,
    opaque_pixels: opaquePixels,
    total_pixels: png.width * png.height,
    opaque_bounds: opaqueBounds,
    opaque_bounds_fill_ratio: Number(opaqueBoundsFillRatio.toFixed(6)),
  };
}

function blendChannel(base, overlay, alpha) {
  return Math.round(base * (1 - alpha) + overlay * alpha);
}

function writeMaskOverlay(sourceImage, maskPath, overlayPath) {
  const source = readPng(sourceImage);
  const mask = readPng(maskPath);
  if (source.width !== mask.width || source.height !== mask.height) {
    throw new Error(`mask dimensions ${mask.width}x${mask.height} do not match source ${source.width}x${source.height}`);
  }
  const output = new PNG({ width: source.width, height: source.height });
  source.data.copy(output.data);
  for (let index = 0; index < output.data.length; index += 4) {
    const alpha = mask.data[index + 3] / 255;
    if (alpha <= 0) continue;
    output.data[index] = blendChannel(output.data[index], 255, 0.45);
    output.data[index + 1] = blendChannel(output.data[index + 1], 0, 0.45);
    output.data[index + 2] = blendChannel(output.data[index + 2], 0, 0.45);
    output.data[index + 3] = 255;
  }
  fs.mkdirSync(path.dirname(overlayPath), { recursive: true });
  fs.writeFileSync(overlayPath, PNG.sync.write(output));
}

function checkElementAssets(element, sourceImage, projectPaths) {
  const issues = [];
  const maskExists = Boolean(element.mask_path && fs.existsSync(element.mask_path));
  const layerExists = Boolean(element.layer_path && fs.existsSync(element.layer_path));
  let stats = { alpha_min: null, alpha_max: null };
  let overlayPath = null;
  if (!maskExists) issues.push('mask_path is missing or does not exist');
  if (!layerExists) issues.push('layer_path is missing or does not exist');
  if (maskExists) {
    stats = alphaStats(element.mask_path);
    if (stats.alpha_min === 255) issues.push('mask has no transparent pixels');
    if (stats.alpha_max === 0) issues.push('mask has no opaque pixels');
    if (element.route === 'reference_cutout' && stats.transparent_pixels > 0 && stats.opaque_bounds_fill_ratio >= 0.97) {
      issues.push('mask appears rectangular; semantic cutout or alpha/matting proof is required');
    }
    overlayPath = path.join(projectPaths.working, 'overlays', `${element.id}-overlay.png`);
    try {
      writeMaskOverlay(sourceImage, element.mask_path, overlayPath);
    } catch (error) {
      issues.push(`overlay generation failed: ${error.message}`);
      overlayPath = null;
    }
  }
  return {
    element_id: element.id,
    mask_exists: maskExists,
    layer_exists: layerExists,
    alpha_min: stats.alpha_min,
    alpha_max: stats.alpha_max,
    opaque_bounds: stats.opaque_bounds || null,
    opaque_bounds_fill_ratio: stats.opaque_bounds_fill_ratio || null,
    bbox_fit: element.bbox ? 'pass' : 'fail',
    edge_quality: issues.length ? 'review' : 'pass',
    text_preservation: element.must_preserve_text ? 'review' : 'not_applicable',
    overlay_path: overlayPath,
    issues,
  };
}

function buildMaskQualityReport(elements, sourceImage, projectPaths) {
  const checks = elements.map((element) => checkElementAssets(element, sourceImage, projectPaths));
  const status = checks.some((check) => check.issues.length) ? 'review' : 'pass';
  return {
    generated_at: new Date().toISOString(),
    status,
    checks,
  };
}

function buildLayerPackage(elements, maskQualityReport) {
  const checkById = new Map(maskQualityReport.checks.map((check) => [check.element_id, check]));
  const layers = elements
    .filter((element) => element.layer_path && element.mask_path && fs.existsSync(element.layer_path) && fs.existsSync(element.mask_path))
    .map((element) => {
      const check = checkById.get(element.id);
      return {
        element_id: element.id,
        layer_path: element.layer_path,
        mask_path: element.mask_path,
        source_bbox: element.bbox,
        placement: {
          left: element.css_placement.left,
          top: element.css_placement.top,
          width: element.css_placement.width,
          height: element.css_placement.height,
          z_index: element.z_index_suggestion,
        },
        provenance: {
          source: element.route === 'regenerated_image' ? 'generated' : 'reference_image',
          model_or_tool: element.bbox_source,
          prompt: element.prompt,
          license_status: 'unknown',
        },
        overlay_path: check ? check.overlay_path : null,
      };
    });
  return {
    generated_at: new Date().toISOString(),
    status: maskQualityReport.status,
    layers,
  };
}

module.exports = {
  alphaStats,
  buildLayerPackage,
  buildMaskQualityReport,
  writeMaskOverlay,
};
