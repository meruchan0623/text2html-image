const fs = require('fs');
const path = require('path');
const parse5 = require('parse5');
const { attrsToObject, walk } = require('./render-profile');

function attachParents(node, parent = null) {
  node.parentNode = parent;
  for (const child of node.childNodes || []) attachParents(child, node);
}

function textContent(node) {
  if (node.nodeName === '#text') return node.value || '';
  return (node.childNodes || []).map(textContent).join(' ');
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

function hasBitmapChild(node) {
  let found = false;
  walk(node, (child) => {
    if (child === node || found) return;
    if (child.tagName !== 'img' && child.tagName !== 'image') return;
    const attrs = attrsToObject(child);
    if (attrs['data-review-debug'] === 'true' || attrs['data-debug-layer'] === 'true') return;
    found = true;
  });
  return found;
}

function auditReviewGateContract({ htmlPath, reviewGatedAssets } = {}) {
  const resolvedHtmlPath = path.resolve(String(htmlPath || ''));
  const html = fs.readFileSync(resolvedHtmlPath, 'utf8');
  const documentNode = parse5.parse(html);
  attachParents(documentNode);
  const expected = new Set((reviewGatedAssets || []).map(String));
  const gates = [];

  walk(documentNode, (node) => {
    if (!node.tagName) return;
    const attrs = attrsToObject(node);
    const isReview = attrs['data-route'] === 'review' || attrs['data-final-asset-ready'] === 'false';
    if (!isReview) return;
    const assetId = attrs['data-asset-id'] || '';
    const covers = String(attrs['data-review-covers'] || '').split(/\s+/).filter(Boolean);
    const text = textContent(node).replace(/\s+/g, ' ').trim();
    const failures = [];

    if (!assetId) failures.push({ code: 'missing_asset_id', message: 'review gate must declare data-asset-id' });
    if (attrs['data-final-asset-ready'] !== 'false') {
      failures.push({ code: 'missing_final_false', message: 'review gate must declare data-final-asset-ready=false' });
    }
    if (text.length < 24 || !/review|pending|required|until|missing|source|asset|alpha|provenance/i.test(text)) {
      failures.push({ code: 'missing_review_reason', message: 'review gate must contain a visible reason or next action' });
    }
    if (hasBitmapChild(node)) {
      failures.push({ code: 'review_gate_contains_bitmap', message: 'review gate must not contain final-looking bitmap placeholders' });
    }
    if (expected.size && assetId && !expected.has(assetId) && covers.every((id) => !expected.has(id))) {
      failures.push({ code: 'review_asset_not_listed', message: 'review gate asset is not listed in expected review-gated assets', asset_id: assetId, review_covers: covers });
    }

    gates.push({
      asset_id: assetId || null,
      review_covers: covers,
      selector: selectorFor(node),
      text_sample: text.slice(0, 160),
      status: failures.length ? 'fail' : 'pass',
      failures,
    });
  });

  const covered = new Set();
  for (const gate of gates) {
    if (gate.asset_id) covered.add(gate.asset_id);
    for (const id of gate.review_covers) covered.add(id);
  }
  const missingExpected = [...expected].filter((id) => !covered.has(id));
  const failures = gates.flatMap((gate) => gate.failures.map((failure) => ({ asset_id: gate.asset_id, selector: gate.selector, ...failure })));
  for (const id of missingExpected) {
    failures.push({
      code: 'missing_review_gate',
      asset_id: id,
      message: 'expected review-gated asset has no matching review gate or data-review-covers entry',
    });
  }

  return {
    generated_at: new Date().toISOString(),
    html_path: resolvedHtmlPath,
    status: failures.length ? 'fail' : 'pass',
    summary: {
      gate_count: gates.length,
      pass_count: gates.filter((gate) => gate.status === 'pass').length,
      fail_count: gates.filter((gate) => gate.status === 'fail').length,
      missing_expected_count: missingExpected.length,
      failure_count: failures.length,
      failure_types: [...new Set(failures.map((failure) => failure.code))].sort(),
    },
    gates,
    missing_expected_review_gates: missingExpected,
    failures,
  };
}

module.exports = {
  auditReviewGateContract,
};
