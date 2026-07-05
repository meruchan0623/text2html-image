function normalizeRect(region) {
  const source = region.bbox || region.rect || {};
  const x = Number(source.x);
  const y = Number(source.y);
  const width = Number(source.w ?? source.width);
  const height = Number(source.h ?? source.height);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    return { error: 'invalid_region_bbox' };
  }
  return {
    x,
    y,
    width,
    height,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
  };
}

function rectEvidence(rect) {
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

function overlapRect(a, b) {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  return { left, top, right, bottom, width, height, area: width * height };
}

function allowsOverlap(a, b) {
  if (a.allow_overlap === true || b.allow_overlap === true) return true;
  const aList = Array.isArray(a.allow_overlaps_with) ? a.allow_overlaps_with : [];
  const bList = Array.isArray(b.allow_overlaps_with) ? b.allow_overlaps_with : [];
  return aList.includes(b.id) || bList.includes(a.id);
}

function auditLayoutContract(contract = {}) {
  const canvas = contract.canvas || {};
  const width = Number(canvas.width);
  const height = Number(canvas.height);
  const regions = Array.isArray(contract.regions) ? contract.regions : [];
  const overlapToleranceArea = Number.isFinite(Number(contract.overlap_tolerance_area))
    ? Number(contract.overlap_tolerance_area)
    : 0;
  const failures = [];
  const normalized = [];

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    failures.push({
      code: 'invalid_canvas',
      message: 'layout contract requires positive canvas width and height',
      coordinate_evidence: { canvas },
    });
  }

  for (const region of regions) {
    const id = region.id || region.element_id || `region-${normalized.length + 1}`;
    const rect = normalizeRect(region);
    if (rect.error) {
      failures.push({
        code: rect.error,
        id,
        message: 'region must include bbox/rect with x, y, width/w, and height/h',
        coordinate_evidence: { id, bbox: region.bbox || region.rect || null },
      });
      continue;
    }
    const item = { ...region, id, rect };
    normalized.push(item);
    if (Number.isFinite(width) && Number.isFinite(height)) {
      const outside = rect.left < 0 || rect.top < 0 || rect.right > width || rect.bottom > height;
      if (outside) {
        failures.push({
          code: 'region_outside_canvas',
          id,
          message: 'layout region extends outside the declared canvas',
          coordinate_evidence: {
            region: rectEvidence(rect),
            canvas: { width, height },
          },
        });
      }
    }
  }

  for (let i = 0; i < normalized.length; i += 1) {
    for (let j = i + 1; j < normalized.length; j += 1) {
      const a = normalized[i];
      const b = normalized[j];
      if (allowsOverlap(a, b)) continue;
      const overlap = overlapRect(a.rect, b.rect);
      const tolerance = Math.max(
        overlapToleranceArea,
        Number(a.overlap_tolerance_area || 0),
        Number(b.overlap_tolerance_area || 0),
      );
      if (overlap.area > tolerance) {
        failures.push({
          code: 'key_region_overlap',
          a: a.id,
          b: b.id,
          area: Math.round(overlap.area),
          message: 'layout regions overlap without an explicit allowance',
          coordinate_evidence: {
            a: rectEvidence(a.rect),
            b: rectEvidence(b.rect),
            overlap: rectEvidence({
              x: overlap.left,
              y: overlap.top,
              width: overlap.width,
              height: overlap.height,
              left: overlap.left,
              top: overlap.top,
              right: overlap.right,
              bottom: overlap.bottom,
            }),
          },
        });
      }
    }
  }

  return {
    status: failures.length ? 'fail' : 'pass',
    canvas: Number.isFinite(width) && Number.isFinite(height) ? { width, height } : canvas,
    summary: {
      region_count: regions.length,
      failure_count: failures.length,
      overlap_count: failures.filter((failure) => failure.code === 'key_region_overlap').length,
      outside_canvas_count: failures.filter((failure) => failure.code === 'region_outside_canvas').length,
    },
    regions: normalized.map((region) => ({
      id: region.id,
      role: region.role,
      rect: rectEvidence(region.rect),
    })),
    failures,
  };
}

module.exports = {
  auditLayoutContract,
};
