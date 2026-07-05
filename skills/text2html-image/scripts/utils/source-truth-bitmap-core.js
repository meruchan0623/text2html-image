const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const SOURCE_TRUTH_KINDS = new Set(['qr', 'qr_code', 'barcode', 'payment_logo', 'country_flag', 'app_icon', 'application_icon']);
const FINAL_SOURCE_TRUTH_ROUTES = new Set(['reference_cutout', 'locked_base_layer']);
const CONTRAST_KINDS = new Set(['qr', 'qr_code', 'barcode']);

function normalizeKind(kind) {
  return String(kind || '').trim().toLowerCase();
}

function inferKind(asset) {
  const explicit = normalizeKind(asset.kind || asset.asset_type);
  if (explicit) return explicit;
  const symbology = normalizeKind(asset.symbology);
  if (symbology === 'qr' || symbology === 'qrcode') return 'qr';
  if (symbology) return 'barcode';
  const id = normalizeKind(asset.id || asset.asset_id);
  if (id.includes('qr')) return 'qr';
  if (id.includes('barcode')) return 'barcode';
  if (id.includes('payment')) return 'payment_logo';
  if (id.includes('flag')) return 'country_flag';
  if (id.includes('app')) return 'app_icon';
  return '';
}

function resolveAssetPath(asset, baseDir) {
  const raw = asset.path || asset.output_path || asset.src;
  if (!raw) return '';
  return path.isAbsolute(String(raw)) ? String(raw) : path.resolve(baseDir || process.cwd(), String(raw));
}

function readPng(filePath) {
  const buffer = fs.readFileSync(filePath);
  return PNG.sync.read(buffer);
}

function lumaAt(data, offset) {
  return Math.round((0.2126 * data[offset]) + (0.7152 * data[offset + 1]) + (0.0722 * data[offset + 2]));
}

function contrastEvidence(png) {
  let min = 255;
  let max = 0;
  let midTonePixels = 0;
  const total = png.width * png.height;
  for (let offset = 0; offset < png.data.length; offset += 4) {
    const luma = lumaAt(png.data, offset);
    min = Math.min(min, luma);
    max = Math.max(max, luma);
    if (luma > 32 && luma < 223) midTonePixels += 1;
  }
  const midTonePixelRatio = Number((midTonePixels / Math.max(1, total)).toFixed(6));
  return {
    min_luma: min,
    max_luma: max,
    luma_range: max - min,
    mid_tone_pixel_ratio: midTonePixelRatio,
    pass: (max - min) >= 180 && midTonePixelRatio <= 0.05,
  };
}

function auditOne(asset, options = {}) {
  const failures = [];
  const kind = inferKind(asset);
  const filePath = resolveAssetPath(asset, options.baseDir);
  let dimensions = null;
  let highContrast = null;

  if (!SOURCE_TRUTH_KINDS.has(kind)) {
    return {
      id: asset.id || asset.asset_id || null,
      kind,
      route: String(asset.route || '').trim(),
      path: filePath || null,
      dimensions,
      high_contrast: highContrast,
      status: 'skipped',
      skipped_reason: 'not_source_truth_kind',
      failures,
    };
  }
  if (!filePath || !fs.existsSync(filePath)) {
    failures.push({
      code: 'missing_source_truth_bitmap',
      message: 'source-truth bitmap path does not exist',
      path: filePath || null,
    });
  } else {
    try {
      const png = readPng(filePath);
      dimensions = { width: png.width, height: png.height };
      if (png.width < 16 || png.height < 16) {
        failures.push({
          code: 'bitmap_dimensions_too_small',
          message: 'source-truth bitmap dimensions are too small for reliable rendering',
          dimensions,
        });
      }
      if (CONTRAST_KINDS.has(kind)) {
        highContrast = contrastEvidence(png);
        if (!highContrast.pass) {
          failures.push({
            code: 'low_contrast_bitmap',
            message: 'QR/barcode source-truth bitmap must be high contrast with minimal midtones',
            high_contrast: highContrast,
          });
        }
      }
    } catch (error) {
      failures.push({
        code: 'png_read_failed',
        message: error.message,
        path: filePath,
      });
    }
  }

  const route = String(asset.route || '').trim();
  if (!FINAL_SOURCE_TRUTH_ROUTES.has(route)) {
    failures.push({
      code: 'forbidden_source_truth_route',
      message: 'final source-truth bitmap must use a source-preserving route',
      route,
      allowed_routes: [...FINAL_SOURCE_TRUTH_ROUTES],
    });
  }
  if (asset.css_filter_allowed !== false) {
    failures.push({
      code: 'css_filter_allowed',
      message: 'source-truth bitmap must explicitly forbid CSS filters',
      css_filter_allowed: asset.css_filter_allowed,
    });
  }
  if (!asset.asset_source_type && !asset.source_type) {
    failures.push({
      code: 'missing_source_truth_provenance',
      message: 'source-truth bitmap requires source/provenance metadata',
    });
  }
  if (asset.final_asset_ready !== true && asset.status !== 'accepted_for_html') {
    failures.push({
      code: 'source_truth_not_final_ready',
      message: 'source-truth bitmap must be explicitly final-ready before HTML placement',
      final_asset_ready: asset.final_asset_ready,
      status: asset.status || null,
    });
  }

  return {
    id: asset.id || asset.asset_id || null,
    kind,
    route,
    path: filePath || null,
    dimensions,
    high_contrast: highContrast,
    status: failures.length ? 'fail' : 'pass',
    failures,
  };
}

function auditSourceTruthBitmaps({ assets, baseDir } = {}) {
  const audited = (Array.isArray(assets) ? assets : []).map((asset) => auditOne(asset, { baseDir }));
  const failures = audited.flatMap((asset) => asset.failures.map((failure) => ({ asset_id: asset.id, ...failure })));
  return {
    generated_at: new Date().toISOString(),
    status: failures.length ? 'fail' : 'pass',
    summary: {
      asset_count: audited.length,
      pass_count: audited.filter((asset) => asset.status === 'pass').length,
      fail_count: audited.filter((asset) => asset.status === 'fail').length,
      skipped_count: audited.filter((asset) => asset.status === 'skipped').length,
      failure_count: failures.length,
      failure_types: [...new Set(failures.map((failure) => failure.code))].sort(),
    },
    assets: audited,
    failures,
  };
}

module.exports = {
  auditSourceTruthBitmaps,
};
