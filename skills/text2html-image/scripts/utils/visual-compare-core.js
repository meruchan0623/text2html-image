const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

function readPng(filePath) {
  return PNG.sync.read(fs.readFileSync(filePath));
}

function pixelOffset(width, x, y) {
  return (width * y + x) << 2;
}

function writeDiffMap({ reference, render, width, height, diffPath }) {
  if (!diffPath) return null;
  const output = new PNG({ width, height });
  const maxChannelDiff = 255 * 3;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const refOffset = pixelOffset(reference.width, x, y);
      const renderOffset = pixelOffset(render.width, x, y);
      const outOffset = pixelOffset(output.width, x, y);
      const diff = Math.abs(reference.data[refOffset] - render.data[renderOffset])
        + Math.abs(reference.data[refOffset + 1] - render.data[renderOffset + 1])
        + Math.abs(reference.data[refOffset + 2] - render.data[renderOffset + 2]);
      const intensity = Math.max(0, Math.min(255, Math.round((diff / maxChannelDiff) * 255)));
      output.data[outOffset] = intensity;
      output.data[outOffset + 1] = Math.round(intensity * 0.6);
      output.data[outOffset + 2] = 0;
      output.data[outOffset + 3] = 255;
    }
  }
  fs.mkdirSync(path.dirname(diffPath), { recursive: true });
  fs.writeFileSync(diffPath, PNG.sync.write(output));
  return path.resolve(diffPath);
}

function writeOverlayMap({ reference, render, width, height, overlayPath }) {
  if (!overlayPath) return null;
  const output = new PNG({ width, height });
  const maxChannelDiff = 255 * 3;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const refOffset = pixelOffset(reference.width, x, y);
      const renderOffset = pixelOffset(render.width, x, y);
      const outOffset = pixelOffset(output.width, x, y);
      const diff = Math.abs(reference.data[refOffset] - render.data[renderOffset])
        + Math.abs(reference.data[refOffset + 1] - render.data[renderOffset + 1])
        + Math.abs(reference.data[refOffset + 2] - render.data[renderOffset + 2]);
      const diffRatio = diff / maxChannelDiff;
      output.data[outOffset] = Math.round((reference.data[refOffset] * 0.48) + (render.data[renderOffset] * 0.32) + (255 * Math.min(0.2, diffRatio)));
      output.data[outOffset + 1] = Math.round((reference.data[refOffset + 1] * 0.48) + (render.data[renderOffset + 1] * 0.32));
      output.data[outOffset + 2] = Math.round((reference.data[refOffset + 2] * 0.48) + (render.data[renderOffset + 2] * 0.32));
      output.data[outOffset + 3] = 255;
    }
  }
  fs.mkdirSync(path.dirname(overlayPath), { recursive: true });
  fs.writeFileSync(overlayPath, PNG.sync.write(output));
  return path.resolve(overlayPath);
}

function rectArea(rect) {
  if (!rect) return 0;
  return Math.max(0, Number(rect.width) || 0) * Math.max(0, Number(rect.height) || 0);
}

function normalizeRect(rect = {}) {
  const x = Number(rect.x ?? rect.left);
  const y = Number(rect.y ?? rect.top);
  const width = Number(rect.width ?? rect.w);
  const height = Number(rect.height ?? rect.h);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return {
    x,
    y,
    width,
    height,
    left: Number.isFinite(Number(rect.left)) ? Number(rect.left) : x,
    top: Number.isFinite(Number(rect.top)) ? Number(rect.top) : y,
    right: Number.isFinite(Number(rect.right)) ? Number(rect.right) : x + width,
    bottom: Number.isFinite(Number(rect.bottom)) ? Number(rect.bottom) : y + height,
  };
}

function intersectRects(a, b) {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  if (right <= left || bottom <= top) return null;
  return {
    x: left,
    y: top,
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

function roundRect(rect) {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    right: Math.round(rect.right),
    bottom: Math.round(rect.bottom),
  };
}

function regionSeverity(meanDiffRatio, highDiffPixelRatio) {
  if (meanDiffRatio >= 0.34 || highDiffPixelRatio >= 0.4) return 'high';
  if (meanDiffRatio >= 0.2 || highDiffPixelRatio >= 0.2) return 'medium';
  return 'low';
}

function extractTopMismatchRegions({ reference, render, width, height, regionSize = 64, maxRegions = 8, minMeanDiffRatio = 0.06 } = {}) {
  const maxChannelDiff = 255 * 3;
  const cellSize = Math.max(8, Number(regionSize) || 64);
  const regions = [];
  for (let y = 0; y < height; y += cellSize) {
    for (let x = 0; x < width; x += cellSize) {
      const cellWidth = Math.min(cellSize, width - x);
      const cellHeight = Math.min(cellSize, height - y);
      let total = 0;
      let high = 0;
      let count = 0;
      for (let cy = y; cy < y + cellHeight; cy += 1) {
        for (let cx = x; cx < x + cellWidth; cx += 1) {
          const refOffset = pixelOffset(reference.width, cx, cy);
          const renderOffset = pixelOffset(render.width, cx, cy);
          const diff = Math.abs(reference.data[refOffset] - render.data[renderOffset])
            + Math.abs(reference.data[refOffset + 1] - render.data[renderOffset + 1])
            + Math.abs(reference.data[refOffset + 2] - render.data[renderOffset + 2]);
          const ratio = diff / maxChannelDiff;
          total += ratio;
          if (ratio > 0.25) high += 1;
          count += 1;
        }
      }
      const meanDiffRatio = count ? total / count : 0;
      if (meanDiffRatio < minMeanDiffRatio) continue;
      const highDiffPixelRatio = count ? high / count : 0;
      regions.push({
        id: '',
        bbox: roundRect({ x, y, left: x, top: y, right: x + cellWidth, bottom: y + cellHeight, width: cellWidth, height: cellHeight }),
        mean_diff_ratio: Number(meanDiffRatio.toFixed(6)),
        high_diff_pixel_ratio: Number(highDiffPixelRatio.toFixed(6)),
        severity: regionSeverity(meanDiffRatio, highDiffPixelRatio),
      });
    }
  }
  return regions
    .sort((a, b) => (b.mean_diff_ratio + b.high_diff_pixel_ratio) - (a.mean_diff_ratio + a.high_diff_pixel_ratio))
    .slice(0, Math.max(0, Number(maxRegions) || 8))
    .map((region, index) => ({ ...region, id: `region-${String(index + 1).padStart(3, '0')}` }));
}

function visibleElement(element = {}) {
  if (element.visible === false) return false;
  if (element.display === 'none' || element.visibility === 'hidden') return false;
  if (Number(element.opacity) === 0) return false;
  return Boolean(normalizeRect(element.rect));
}

function normalizeDomCandidates(domEvidence = {}) {
  const entries = Array.isArray(domEvidence.entries) ? domEvidence.entries : [domEvidence];
  const candidates = [];
  for (const entry of entries) {
    for (const textBox of Array.isArray(entry.text_boxes) ? entry.text_boxes : []) {
      const rect = normalizeRect(textBox.rect);
      if (!rect) continue;
      candidates.push({
        kind: 'text',
        selector: textBox.selector || '',
        text: textBox.text || '',
        i18n_key: textBox.i18n_key || '',
        route: 'editable_text',
        rect,
      });
    }
    for (const element of Array.isArray(entry.elements) ? entry.elements : []) {
      if (!visibleElement(element)) continue;
      const rect = normalizeRect(element.rect);
      candidates.push({
        kind: 'element',
        selector: element.selector || '',
        asset_id: element.data_asset_id || element.asset_id || '',
        route: element.data_route || element.route || element.inferred_role || '',
        tag: element.tag || '',
        z_index: element.z_index ?? null,
        rect,
      });
    }
  }
  return candidates;
}

function likelyIssueType(region, primaryCandidate) {
  if (!primaryCandidate) return 'background_art';
  if (primaryCandidate.kind === 'text' || primaryCandidate.i18n_key || primaryCandidate.route === 'editable_text') return 'text_shape';
  if (['reference_cutout', 'regenerated_image', 'locked_base_layer'].includes(primaryCandidate.route) && region.high_diff_pixel_ratio >= 0.25) return 'missing_asset';
  if (primaryCandidate.route === 'editable_vector') return 'color_or_style';
  if (!primaryCandidate.route && primaryCandidate.tag === 'img') return 'missing_asset';
  return 'position';
}

function attributeRegionsToDom(regions = [], domEvidence = {}) {
  const candidates = normalizeDomCandidates(domEvidence);
  return regions.map((region) => {
    const regionRect = normalizeRect(region.bbox);
    const regionArea = rectArea(regionRect);
    const candidateElements = candidates
      .map((candidate) => {
        const intersection = intersectRects(regionRect, candidate.rect);
        if (!intersection) return null;
        const overlapRatio = regionArea ? rectArea(intersection) / regionArea : 0;
        if (overlapRatio <= 0) return null;
        return {
          selector: candidate.selector,
          kind: candidate.kind,
          asset_id: candidate.asset_id || null,
          route: candidate.route || null,
          text: candidate.kind === 'text' ? candidate.text : undefined,
          i18n_key: candidate.i18n_key || undefined,
          z_index: candidate.z_index ?? undefined,
          overlap_ratio: Number(overlapRatio.toFixed(6)),
          rect: roundRect(candidate.rect),
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const aScore = a.overlap_ratio + (a.kind === 'text' ? 0.15 : 0);
        const bScore = b.overlap_ratio + (b.kind === 'text' ? 0.15 : 0);
        return bScore - aScore;
      })
      .slice(0, 5);
    const primary = candidateElements[0] || null;
    return {
      ...region,
      candidate_elements: candidateElements,
      primary_dom_candidate: primary,
      attribution_confidence: primary ? Number(Math.min(1, primary.overlap_ratio + (primary.kind === 'text' ? 0.15 : 0)).toFixed(6)) : 0,
      likely_issue_type: likelyIssueType(region, primary),
    };
  });
}

function repairHintFor(issueType) {
  if (issueType === 'text_shape') return 'adjust the attributed text layer font size, weight, line height, copy, or position, then rerun visual compare';
  if (issueType === 'missing_asset') return 'verify the attributed asset source, route, visibility, scale, and final-ready provenance before tuning CSS';
  if (issueType === 'color_or_style') return 'adjust the attributed vector/card color, opacity, shape, or stacking so the heat region shrinks';
  if (issueType === 'background_art') return 'inspect the background/base layer or missing global art because no precise DOM element explains this region';
  return 'adjust the attributed DOM layer position, scale, or source asset to reduce this mismatch before lower-priority regions';
}

function buildRepairQueue(regions = []) {
  return regions.map((region, index) => {
    const candidate = region.primary_dom_candidate || {};
    const bbox = region.bbox;
    const issueType = region.likely_issue_type || 'position';
    return {
      priority: index + 1,
      region_id: region.id,
      severity: region.severity,
      issue_type: issueType,
      selector: candidate.selector || null,
      asset_id: candidate.asset_id || null,
      route: candidate.route || null,
      evidence: `bbox x=${bbox.x} y=${bbox.y} w=${bbox.width} h=${bbox.height}; mean_diff_ratio=${region.mean_diff_ratio}; high_diff_pixel_ratio=${region.high_diff_pixel_ratio}`,
      attribution_confidence: region.attribution_confidence || 0,
      fix_hint: repairHintFor(issueType),
    };
  });
}

function writeJsonArtifact(targetPath, value) {
  if (!targetPath) return null;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return path.resolve(targetPath);
}

function comparePngImages({
  referencePath,
  renderPath,
  stride = 4,
  diffPath,
  overlayPath,
  heatmapPath,
  domEvidence,
  regionSize = 64,
  maxRegions = 8,
  minRegionMeanDiffRatio = 0.06,
} = {}) {
  const reference = readPng(referencePath);
  const render = readPng(renderPath);
  const width = Math.min(reference.width, render.width);
  const height = Math.min(reference.height, render.height);
  const step = Math.max(1, Number(stride || 4));
  let sampled = 0;
  let totalDiff = 0;
  let highDiffPixels = 0;
  const maxChannelDiff = 255 * 3;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const refOffset = pixelOffset(reference.width, x, y);
      const renderOffset = pixelOffset(render.width, x, y);
      const diff = Math.abs(reference.data[refOffset] - render.data[renderOffset])
        + Math.abs(reference.data[refOffset + 1] - render.data[renderOffset + 1])
        + Math.abs(reference.data[refOffset + 2] - render.data[renderOffset + 2]);
      totalDiff += diff;
      if (diff / maxChannelDiff > 0.25) highDiffPixels += 1;
      sampled += 1;
    }
  }

  const meanDiff = sampled ? totalDiff / sampled : maxChannelDiff;
  const meanDiffRatio = meanDiff / maxChannelDiff;
  const similarityScore = Math.max(0, Math.min(100, Math.round((1 - meanDiffRatio) * 100)));
  const dimensionMatch = reference.width === render.width && reference.height === render.height;
  const highDiffPixelRatio = sampled ? highDiffPixels / sampled : 1;
  const status = dimensionMatch && similarityScore >= 75 ? 'pass' : 'review';
  const resolvedDiffPath = writeDiffMap({ reference, render, width, height, diffPath });
  const resolvedOverlayPath = writeOverlayMap({ reference, render, width, height, overlayPath });
  const topMismatchRegions = extractTopMismatchRegions({
    reference,
    render,
    width,
    height,
    regionSize,
    maxRegions,
    minMeanDiffRatio: minRegionMeanDiffRatio,
  });
  const attributedRegions = domEvidence ? attributeRegionsToDom(topMismatchRegions, domEvidence) : topMismatchRegions.map((region) => ({
    ...region,
    candidate_elements: [],
    primary_dom_candidate: null,
    attribution_confidence: 0,
    likely_issue_type: 'background_art',
  }));
  const repairQueue = buildRepairQueue(attributedRegions);
  const heatmap = {
    generated_at: new Date().toISOString(),
    reference_path: path.resolve(referencePath),
    render_path: path.resolve(renderPath),
    compared_dimensions: { width, height },
    region_size: Math.max(8, Number(regionSize) || 64),
    top_mismatch_regions: attributedRegions,
  };
  const resolvedHeatmapPath = writeJsonArtifact(heatmapPath, heatmap);
  return {
    generated_at: new Date().toISOString(),
    reference_path: path.resolve(referencePath),
    render_path: path.resolve(renderPath),
    status,
    canvas_match: dimensionMatch,
    reference_dimensions: { width: reference.width, height: reference.height },
    render_dimensions: { width: render.width, height: render.height },
    compared_dimensions: { width, height },
    stride: step,
    sampled_pixel_count: sampled,
    mean_rgb_diff: Number(meanDiff.toFixed(4)),
    mean_rgb_diff_ratio: Number(meanDiffRatio.toFixed(6)),
    high_diff_pixel_ratio: Number(highDiffPixelRatio.toFixed(6)),
    similarity_score: similarityScore,
    diff_path: resolvedDiffPath,
    overlay_path: resolvedOverlayPath,
    heatmap_path: resolvedHeatmapPath,
    diff_dimensions: resolvedDiffPath ? { width, height } : null,
    top_mismatch_regions: attributedRegions,
    repair_queue: repairQueue,
  };
}

module.exports = {
  attributeRegionsToDom,
  buildRepairQueue,
  comparePngImages,
  extractTopMismatchRegions,
  normalizeDomCandidates,
};
