const fs = require('fs');
const path = require('path');
const parse5 = require('parse5');
const { attrsToObject, walk } = require('./render-profile');

function attachParents(node, parent = null) {
  node.parentNode = parent;
  for (const child of node.childNodes || []) attachParents(child, node);
}

function findAncestorAttr(node, attrName) {
  let current = node;
  while (current) {
    const attrs = attrsToObject(current);
    if (attrs[attrName]) return attrs[attrName];
    current = current.parentNode;
  }
  return '';
}

function selectorFor(node) {
  const attrs = attrsToObject(node);
  if (attrs.id) return `#${attrs.id}`;
  const parts = [];
  let current = node;
  while (current && current.tagName && current.tagName !== 'body') {
    const currentAttrs = attrsToObject(current);
    let part = current.tagName;
    if (currentAttrs.class) {
      part += `.${String(currentAttrs.class).trim().split(/\s+/).slice(0, 3).join('.')}`;
    }
    parts.unshift(part);
    current = current.parentNode;
  }
  return parts.join(' > ');
}

function normalizeAssetPath(filePath) {
  return path.resolve(String(filePath || ''));
}

function provenanceById(provenance) {
  const assets = Array.isArray(provenance?.assets) ? provenance.assets : [];
  return new Map(assets.map((asset) => [String(asset.id || asset.asset_id || ''), asset]).filter(([id]) => id));
}

function auditBitmapLayerContract({ htmlPath, provenance } = {}) {
  const resolvedHtmlPath = path.resolve(String(htmlPath || ''));
  const html = fs.readFileSync(resolvedHtmlPath, 'utf8');
  const documentNode = parse5.parse(html);
  attachParents(documentNode);
  const byId = provenanceById(provenance);
  const layers = [];

  walk(documentNode, (node) => {
    if (node.tagName !== 'img' && node.tagName !== 'image') return;
    const attrs = attrsToObject(node);
    const src = attrs.src || attrs.href || attrs['xlink:href'] || '';
    const resolvedSrc = src && !/^data:|^https?:/i.test(src)
      ? path.resolve(path.dirname(resolvedHtmlPath), src)
      : src;
    const assetId = attrs['data-asset-id'] || findAncestorAttr(node.parentNode, 'data-asset-id');
    const route = attrs['data-route'] || findAncestorAttr(node.parentNode, 'data-route');
    const finalReady = attrs['data-final-asset-ready'] || findAncestorAttr(node.parentNode, 'data-final-asset-ready');
    const provenanceAsset = assetId ? byId.get(assetId) : null;
    const failures = [];

    if (!assetId) failures.push({ code: 'missing_asset_id', message: 'bitmap layer does not declare or inherit data-asset-id' });
    if (!provenanceAsset) failures.push({ code: 'missing_provenance', message: 'bitmap layer has no matching asset-provenance entry', asset_id: assetId || null });
    if (resolvedSrc && !/^data:|^https?:/i.test(resolvedSrc) && !fs.existsSync(resolvedSrc)) {
      failures.push({ code: 'missing_local_bitmap', message: 'bitmap layer src does not resolve from HTML path', src, resolved: resolvedSrc });
    }
    if (provenanceAsset) {
      const provenancePath = normalizeAssetPath(provenanceAsset.path || provenanceAsset.output_path);
      if (resolvedSrc && !/^data:|^https?:/i.test(resolvedSrc) && provenancePath !== normalizeAssetPath(resolvedSrc)) {
        failures.push({
          code: 'path_mismatch',
          message: 'bitmap layer src does not match provenance path',
          src_resolved: resolvedSrc,
          provenance_path: provenancePath,
        });
      }
      if (!provenanceAsset.asset_source_type && !provenanceAsset.source_type) {
        failures.push({ code: 'missing_asset_source_type', message: 'provenance entry lacks source type' });
      }
      if (!provenanceAsset.css_placement) {
        failures.push({ code: 'missing_css_placement', message: 'provenance entry lacks css_placement for final bitmap layer' });
      }
      if (provenanceAsset.final_asset_ready !== true && provenanceAsset.status !== 'accepted_for_html') {
        failures.push({ code: 'not_final_ready', message: 'provenance entry is not final-ready or accepted for HTML' });
      }
      if (route && provenanceAsset.route && route !== provenanceAsset.route) {
        failures.push({ code: 'route_mismatch', message: 'HTML route does not match provenance route', route, provenance_route: provenanceAsset.route });
      }
    }

    layers.push({
      asset_id: assetId || null,
      selector: selectorFor(node),
      src,
      resolved_src: resolvedSrc,
      route: route || null,
      final_asset_ready: finalReady || null,
      provenance_found: Boolean(provenanceAsset),
      status: failures.length ? 'fail' : 'pass',
      failures,
    });
  });

  const failures = layers.flatMap((layer) => layer.failures.map((failure) => ({ asset_id: layer.asset_id, selector: layer.selector, ...failure })));
  return {
    generated_at: new Date().toISOString(),
    html_path: resolvedHtmlPath,
    status: failures.length ? 'fail' : 'pass',
    summary: {
      layer_count: layers.length,
      pass_count: layers.filter((layer) => layer.status === 'pass').length,
      fail_count: layers.filter((layer) => layer.status === 'fail').length,
      failure_count: failures.length,
      failure_types: [...new Set(failures.map((failure) => failure.code))].sort(),
    },
    layers,
    failures,
  };
}

module.exports = {
  auditBitmapLayerContract,
};
