const fs = require('fs');
const path = require('path');
const parse5 = require('parse5');
const { attrsToObject, parseInlineStyle, parsePx, walk } = require('./render-profile');

const BUSINESS_KEY_ATTRS = new Set([
  'data-country-code',
  'data-region-code',
  'data-sku',
  'data-product-id',
  'data-plan-id',
]);

const MARKETING_TEXT_PATTERN = /(title|headline|subtitle|price|cta|disclaimer|label|copy|text|legal|banner|poster)/i;

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isIgnorableTextNode(node) {
  const value = normalizeText(node.value || '');
  return !value || value === '|' || value === '·';
}

function hasAncestor(node, predicate) {
  let current = node.parentNode;
  while (current) {
    if (predicate(current)) return true;
    current = current.parentNode;
  }
  return false;
}

function attachParents(node, parent = null) {
  node.parentNode = parent;
  for (const child of node.childNodes || []) attachParents(child, node);
}

function classList(attrs) {
  return String(attrs.class || '').split(/\s+/).filter(Boolean);
}

function extractCanvas(documentNode) {
  let poster;
  walk(documentNode, (node) => {
    if (poster || !node.tagName) return;
    const attrs = attrsToObject(node);
    if (/\bposter\b/.test(attrs.class || '')) poster = node;
  });
  if (!poster) return { error: 'missing .poster element' };
  const attrs = attrsToObject(poster);
  const style = parseInlineStyle(attrs.style);
  const width = parsePx(style.width);
  const height = parsePx(style.height);
  if (!width || !height) return { error: '.poster must have inline pixel width and height' };
  return { width, height };
}

function inspectImage(node, htmlPath) {
  const attrs = attrsToObject(node);
  const src = attrs.src || attrs.href || attrs['xlink:href'] || '';
  const resolved = src && !/^data:|^https?:/i.test(src)
    ? path.resolve(path.dirname(htmlPath), src)
    : undefined;
  const policy = attrs['data-asset-text-policy'] || attrs['data-text-policy'] || '';
  const alt = attrs.alt || attrs['aria-label'] || '';
  const basename = src ? path.basename(src) : '';
  const risks = [];
  if (!policy) {
    risks.push({
      code: 'image_missing_text_policy',
      message: 'image asset does not declare data-asset-text-policy',
      src,
    });
  }
  if (MARKETING_TEXT_PATTERN.test(`${basename} ${alt}`) && policy !== 'preserve-raster') {
    risks.push({
      code: 'possible_bitmap_text_asset',
      message: 'image filename or alt text suggests embedded editable marketing text',
      src,
      alt,
    });
  }
  if (resolved && !fs.existsSync(resolved)) {
    risks.push({
      code: 'missing_local_image_asset',
      message: 'local image asset path does not resolve from HTML location',
      src,
      resolved,
    });
  }
  return {
    src,
    resolved,
    alt,
    text_policy: policy,
    exists: resolved ? fs.existsSync(resolved) : undefined,
    risks,
  };
}

function inspectHtmlEditability(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const documentNode = parse5.parse(html);
  attachParents(documentNode);
  const canvas = extractCanvas(documentNode);
  const risks = [];
  const samples = {
    missing_i18n_text: [],
    images_without_policy: [],
  };
  const metrics = {
    editable_text_node_count: 0,
    i18n_key_count: 0,
    business_key_count: 0,
    image_count: 0,
    script_count: 0,
    asset_text_risk_count: 0,
    unresolved_template_token_count: 0,
  };
  const images = [];

  if (canvas.error) {
    risks.push({ severity: 'fail', code: 'canvas_error', message: canvas.error });
  }
  const tokenMatches = html.match(/{{[^}]+}}/g) || [];
  metrics.unresolved_template_token_count = tokenMatches.length;
  if (tokenMatches.length) {
    risks.push({
      severity: 'fail',
      code: 'unresolved_template_tokens',
      message: 'HTML contains unreplaced template tokens',
      count: tokenMatches.length,
    });
  }

  walk(documentNode, (node) => {
    if (!node.tagName && node.nodeName !== '#text') return;
    if (node.tagName === 'script') metrics.script_count += 1;
    if (node.tagName === 'img' || node.tagName === 'image') {
      metrics.image_count += 1;
      const image = inspectImage(node, htmlPath);
      images.push(image);
      for (const risk of image.risks) {
        metrics.asset_text_risk_count += 1;
        risks.push({ severity: risk.code === 'missing_local_image_asset' ? 'fail' : 'review', ...risk });
      }
      if (!image.text_policy) samples.images_without_policy.push(image.src);
    }
    const attrs = attrsToObject(node);
    if (attrs['data-i18n-key']) metrics.i18n_key_count += 1;
    for (const attr of BUSINESS_KEY_ATTRS) {
      if (attrs[attr]) {
        metrics.business_key_count += 1;
        break;
      }
    }
    if (node.nodeName === '#text' && !isIgnorableTextNode(node)) {
      const text = normalizeText(node.value);
      if (hasAncestor(node, (ancestor) => ['script', 'style', 'title'].includes(ancestor.tagName))) return;
      metrics.editable_text_node_count += 1;
      const parentAttrs = attrsToObject(node.parentNode || {});
      const parentClasses = classList(parentAttrs);
      const isLikelyUserText = parentClasses.some((name) => MARKETING_TEXT_PATTERN.test(name)) || text.length >= 2;
      if (isLikelyUserText && !parentAttrs['data-i18n-key'] && samples.missing_i18n_text.length < 20) {
        samples.missing_i18n_text.push({ text, parent_class: parentAttrs.class || '' });
      }
    }
  });

  if (metrics.script_count) {
    risks.push({
      severity: 'fail',
      code: 'script_tag_present',
      message: 'Generated preview must stay static and script-free',
      count: metrics.script_count,
    });
  }
  if (samples.missing_i18n_text.length) {
    risks.push({
      severity: 'review',
      code: 'missing_i18n_metadata',
      message: 'Editable text exists without data-i18n-key metadata on its parent node',
      sample_count: samples.missing_i18n_text.length,
    });
  }

  const hasFail = risks.some((risk) => risk.severity === 'fail');
  const hasReview = risks.some((risk) => risk.severity === 'review');
  return {
    html_path: htmlPath,
    status: hasFail ? 'fail' : hasReview ? 'review' : 'pass',
    canvas: canvas.error ? undefined : canvas,
    metrics,
    risks,
    samples,
    images,
  };
}

function summarizeReports(entries) {
  const summary = {
    entry_count: entries.length,
    pass_count: entries.filter((entry) => entry.status === 'pass').length,
    review_count: entries.filter((entry) => entry.status === 'review').length,
    fail_count: entries.filter((entry) => entry.status === 'fail').length,
    editable_text_node_count: 0,
    i18n_key_count: 0,
    business_key_count: 0,
    image_count: 0,
    script_count: 0,
    asset_text_risk_count: 0,
  };
  for (const entry of entries) {
    summary.editable_text_node_count += entry.metrics.editable_text_node_count;
    summary.i18n_key_count += entry.metrics.i18n_key_count;
    summary.business_key_count += entry.metrics.business_key_count;
    summary.image_count += entry.metrics.image_count;
    summary.script_count += entry.metrics.script_count;
    summary.asset_text_risk_count += entry.metrics.asset_text_risk_count;
  }
  return summary;
}

module.exports = {
  inspectHtmlEditability,
  summarizeReports,
};
