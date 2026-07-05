const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

function readPngWithMetadata(filePath) {
  const buffer = fs.readFileSync(filePath);
  const png = PNG.sync.read(buffer);
  const colorType = buffer.length >= 26 && buffer.toString('ascii', 1, 4) === 'PNG' ? buffer[25] : null;
  return { png, colorType };
}

function hasAlphaColorType(colorType) {
  return colorType === 4 || colorType === 6;
}

function alphaEvidence(png) {
  let min = 255;
  let max = 0;
  let transparentPixels = 0;
  let opaquePixels = 0;
  let partialAlphaPixels = 0;
  for (let index = 3; index < png.data.length; index += 4) {
    const alpha = png.data[index];
    min = Math.min(min, alpha);
    max = Math.max(max, alpha);
    if (alpha === 0) transparentPixels += 1;
    else if (alpha === 255) opaquePixels += 1;
    else partialAlphaPixels += 1;
  }
  const totalPixels = png.width * png.height;
  return {
    min,
    max,
    transparent_pixels: transparentPixels,
    opaque_pixels: opaquePixels,
    partial_alpha_pixels: partialAlphaPixels,
    transparent_pixel_ratio: Number((transparentPixels / Math.max(1, totalPixels)).toFixed(6)),
    opaque_pixel_ratio: Number((opaquePixels / Math.max(1, totalPixels)).toFixed(6)),
  };
}

function cornerAlphaValues(png) {
  const corners = [
    [0, 0],
    [png.width - 1, 0],
    [0, png.height - 1],
    [png.width - 1, png.height - 1],
  ];
  return corners.map(([x, y]) => png.data[((png.width * y + x) << 2) + 3]);
}

function parseHexColor(value) {
  const match = String(value || '').trim().match(/^#?([0-9a-f]{6})$/i);
  if (!match) return null;
  const hex = match[1];
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function inferKeyColor(candidate) {
  const explicit = parseHexColor(candidate.keyColor || candidate.key_color || candidate.chromaKeyColor || candidate.chroma_key_color);
  if (explicit) return explicit;
  const text = `${candidate.prompt || ''} ${candidate.source_chroma_path || ''} ${candidate.sourceChromaPath || ''}`;
  if (/#00ff00/i.test(text)) return { r: 0, g: 255, b: 0 };
  return null;
}

function colorDistance(a, r, g, b) {
  const dr = r - a.r;
  const dg = g - a.g;
  const db = b - a.b;
  return Math.sqrt((dr * dr) + (dg * dg) + (db * db));
}

function chromaFringeEvidence(png, keyColor) {
  if (!keyColor) return null;
  let subjectPixels = 0;
  let contaminatedPixels = 0;
  const threshold = 48;
  for (let index = 0; index < png.data.length; index += 4) {
    const alpha = png.data[index + 3];
    if (alpha === 0) continue;
    subjectPixels += 1;
    const distance = colorDistance(keyColor, png.data[index], png.data[index + 1], png.data[index + 2]);
    if (distance <= threshold) contaminatedPixels += 1;
  }
  return {
    key_color: `#${[keyColor.r, keyColor.g, keyColor.b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`,
    contaminated_pixels: contaminatedPixels,
    subject_pixels: subjectPixels,
    contaminated_pixel_ratio: Number((contaminatedPixels / Math.max(1, subjectPixels)).toFixed(6)),
    distance_threshold: threshold,
  };
}

function precomputedChromaFringeEvidence(candidate) {
  const ratio = Number(candidate.edge_fringe_green_ratio ?? candidate.chroma_key_fringe_ratio);
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  return {
    source: candidate.edge_fringe_green_ratio !== undefined ? 'precomputed_edge_fringe_green_ratio' : 'precomputed_chroma_key_fringe_ratio',
    contaminated_pixel_ratio: Number(ratio.toFixed(6)),
  };
}

function transparencyProvenance(candidate) {
  const method = String(candidate.transparency_method || candidate.transparencyMethod || '').trim();
  const alphaSource = String(candidate.alpha_source || candidate.alphaSource || '').trim();
  const sourceChromaPath = candidate.source_chroma_path || candidate.sourceChromaPath || null;
  const postprocessReportPath = candidate.postprocess_report_path || candidate.postprocessReportPath || null;
  const maskDebugPath = candidate.mask_debug_path || candidate.maskDebugPath || null;
  const resolvedSourceChromaPath = sourceChromaPath ? path.resolve(String(sourceChromaPath)) : null;
  const resolvedPostprocessReportPath = postprocessReportPath ? path.resolve(String(postprocessReportPath)) : null;
  const resolvedMaskDebugPath = maskDebugPath ? path.resolve(String(maskDebugPath)) : null;
  return {
    method: method || null,
    alpha_source: alphaSource || null,
    source_chroma_path: resolvedSourceChromaPath,
    source_chroma_exists: resolvedSourceChromaPath ? fs.existsSync(resolvedSourceChromaPath) : false,
    postprocess_report_path: resolvedPostprocessReportPath,
    postprocess_report_exists: resolvedPostprocessReportPath ? fs.existsSync(resolvedPostprocessReportPath) : false,
    mask_debug_path: resolvedMaskDebugPath,
    mask_debug_exists: resolvedMaskDebugPath ? fs.existsSync(resolvedMaskDebugPath) : false,
  };
}

function validateTransparencyProvenance(provenance) {
  const issues = [];
  if (!provenance.method) {
    issues.push('missing_transparency_method');
    return issues;
  }
  if (provenance.method === 'chroma_key_removed') {
    if (!provenance.source_chroma_path) issues.push('missing_source_chroma_path');
    else if (!provenance.source_chroma_exists) issues.push('source_chroma_path_not_found');
    if (!provenance.postprocess_report_path) issues.push('missing_postprocess_report_path');
    else if (!provenance.postprocess_report_exists) issues.push('postprocess_report_path_not_found');
  }
  return issues;
}

function routeTargetAllowsOpaque(candidate) {
  const routeTarget = String(candidate.routeTarget || candidate.route_target || '').trim();
  const route = String(candidate.route || '').trim();
  return routeTarget === 'locked_base_layer' || route === 'locked_base_layer';
}

function auditImagegenCandidate(candidate) {
  const outputPath = path.resolve(String(candidate.outputPath || candidate.output_path || ''));
  const issues = [];
  let png = null;
  let colorType = null;
  let evidence = null;
  let dimensions = null;
  let alphaExtrema = null;
  let transparentCornerCount = 0;
  let chromaKeyFringe = null;
  const precomputedFringe = precomputedChromaFringeEvidence(candidate);
  const provenance = transparencyProvenance(candidate);

  if (!fs.existsSync(outputPath)) {
    issues.push('missing_output_path');
  } else {
    try {
      const metadata = readPngWithMetadata(outputPath);
      png = metadata.png;
      colorType = metadata.colorType;
      dimensions = { width: png.width, height: png.height };
      if (!hasAlphaColorType(colorType)) {
        if (!routeTargetAllowsOpaque(candidate)) issues.push('no_alpha_channel');
      } else {
        evidence = alphaEvidence(png);
        alphaExtrema = { min: evidence.min, max: evidence.max };
        transparentCornerCount = cornerAlphaValues(png).filter((alpha) => alpha === 0).length;
        if (evidence.min > 0) issues.push('no_fully_transparent_pixels');
        if (evidence.max === 0) issues.push('no_opaque_subject_pixels');
        if (transparentCornerCount < 4) issues.push('nontransparent_corners');
        issues.push(...validateTransparencyProvenance(provenance));
        chromaKeyFringe = chromaFringeEvidence(png, inferKeyColor(candidate));
        if (chromaKeyFringe && chromaKeyFringe.contaminated_pixel_ratio > 0.001) {
          issues.push('chroma_key_fringe');
        }
      }
    } catch (error) {
      issues.push(`png_read_failed:${error.message}`);
    }
  }
  if (precomputedFringe && precomputedFringe.contaminated_pixel_ratio > 0) {
    chromaKeyFringe = precomputedFringe;
    if (!issues.includes('chroma_key_fringe')) issues.push('chroma_key_fringe');
  }

  const accepted = issues.length === 0;
  return {
    id: candidate.id || null,
    prompt: candidate.prompt || '',
    source_reference_role: candidate.sourceReferenceRole || candidate.source_reference_role || null,
    output_path: outputPath,
    dimensions,
    color_type: colorType,
    transparency_provenance: provenance,
    alpha_extrema: alphaExtrema,
    alpha_evidence: evidence,
    chroma_key_fringe: chromaKeyFringe,
    transparent_corner_count: transparentCornerCount,
    edge_fringe_issues: issues,
    route_target: candidate.routeTarget || candidate.route_target || null,
    alpha_required: !routeTargetAllowsOpaque(candidate),
    accepted,
    status: accepted ? 'accepted' : 'rejected',
    blocked_from_final_html: !accepted,
    rejection_reason: accepted ? null : `ImageGen candidate rejected: ${issues.join(', ')}; real transparent PNG alpha evidence is required before HTML placement.`,
  };
}

function buildImagegenCandidateReport(candidates) {
  const audited = candidates.map(auditImagegenCandidate);
  const accepted = audited.filter((candidate) => candidate.accepted).length;
  const rejected = audited.length - accepted;
  const rejectionTypes = [...new Set(audited.flatMap((candidate) => candidate.edge_fringe_issues))].sort();
  return {
    generated_at: new Date().toISOString(),
    status: rejected ? (accepted ? 'partial' : 'all_candidates_rejected') : 'pass',
    candidates: audited,
    summary: {
      total: audited.length,
      accepted,
      rejected,
      rejection_types: rejectionTypes,
    },
  };
}

module.exports = {
  auditImagegenCandidate,
  buildImagegenCandidateReport,
};
