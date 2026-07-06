const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROLE_Z_INDEX_BANDS = {
  locked_base_layer: { min: 0, max: 29 },
  reference_cutout: { min: 30, max: 49 },
  regenerated_image: { min: 30, max: 49 },
  editable_vector: { min: 50, max: 69 },
  editable_text: { min: 70, max: 89 },
};

const TEXT_OBSCURED_POLICIES = new Set([
  'text_obscured_by_editable_dom_overlay',
  'text_obscured_by_overlay',
  'obscured_by_overlay',
]);

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeRect(rect = {}) {
  const x = numberOrNull(rect.x ?? rect.left);
  const y = numberOrNull(rect.y ?? rect.top);
  const width = numberOrNull(rect.width ?? rect.w);
  const height = numberOrNull(rect.height ?? rect.h);
  if (![x, y, width, height].every((value) => value !== null) || width <= 0 || height <= 0) return null;
  return {
    x,
    y,
    width,
    height,
    left: numberOrNull(rect.left) ?? x,
    top: numberOrNull(rect.top) ?? y,
    right: numberOrNull(rect.right) ?? x + width,
    bottom: numberOrNull(rect.bottom) ?? y + height,
  };
}

function rectEvidence(rect) {
  const normalized = normalizeRect(rect);
  if (!normalized) return null;
  return {
    x: Math.round(normalized.x),
    y: Math.round(normalized.y),
    width: Math.round(normalized.width),
    height: Math.round(normalized.height),
    left: Math.round(normalized.left),
    top: Math.round(normalized.top),
    right: Math.round(normalized.right),
    bottom: Math.round(normalized.bottom),
  };
}

function inferredRole(element = {}) {
  if (element.inferred_role) return String(element.inferred_role);
  if (element.data_route) return String(element.data_route);
  return '';
}

function isVisible(element = {}) {
  const rect = normalizeRect(element.rect);
  if (!rect) return false;
  if (element.visible === false) return false;
  if (element.display === 'none' || element.visibility === 'hidden') return false;
  if (Number(element.opacity) === 0) return false;
  return true;
}

function addFailure(failures, failure) {
  failures.push({
    severity: failure.severity || 'fail',
    ...failure,
  });
}

function checkLockedBaseTextPolicy(element, failures) {
  if (element.data_route !== 'locked_base_layer') return;
  if (!TEXT_OBSCURED_POLICIES.has(String(element.data_asset_text_policy || ''))) return;
  const proof = element.clean_base_proof || element.data_clean_base_proof || element.clean_base_asset || '';
  const reviewGate = element.review_gate || element.data_review_gate || element.data_review_required || '';
  if (proof || reviewGate) return;
  addFailure(failures, {
    code: 'locked_base_text_obscured_without_clean_base',
    asset_id: element.data_asset_id || null,
    selector: element.selector,
    message: 'locked base layer declares raster text is hidden by overlays but has no clean-base proof or review gate',
    coordinate_evidence: { rect: rectEvidence(element.rect) },
  });
}

function checkDisabledAssetLayer(element, failures) {
  if (!element.data_asset_id && !element.data_route) return;
  if (isVisible(element)) return;
  addFailure(failures, {
    code: 'disabled_asset_layer',
    asset_id: element.data_asset_id || null,
    selector: element.selector,
    message: 'routed asset layer is disabled, hidden, transparent, or has no measurable visible box',
    coordinate_evidence: { rect: rectEvidence(element.rect), display: element.display || null, visibility: element.visibility || null },
  });
}

function checkZIndexBand(element, failures) {
  const role = inferredRole(element);
  const band = ROLE_Z_INDEX_BANDS[role];
  if (!band) return;
  const zIndex = numberOrNull(element.z_index);
  if (zIndex === null) return;
  if (zIndex >= band.min && zIndex <= band.max) return;
  addFailure(failures, {
    code: 'z_index_band_violation',
    selector: element.selector,
    asset_id: element.data_asset_id || null,
    role,
    z_index: zIndex,
    expected_band: band,
    message: 'visual layer z-index is outside the expected role band',
    coordinate_evidence: { rect: rectEvidence(element.rect) },
  });
}

function checkTextOcclusion(textBox, failures) {
  if (!textBox || !textBox.covered_by_unrelated_top_element) return;
  addFailure(failures, {
    code: 'text_center_occluded',
    selector: textBox.selector,
    text: textBox.text || '',
    message: 'editable text center is covered by an unrelated top element',
    coordinate_evidence: {
      text_rect: rectEvidence(textBox.rect),
      sample_point: textBox.center || null,
      top_selector: textBox.top_selector_at_center || null,
      top_z_index: textBox.top_z_index_at_center ?? null,
    },
  });
}

function entryStatusFromFailures(failures) {
  if (failures.some((failure) => failure.severity === 'fail')) return 'fail';
  if (failures.some((failure) => failure.severity === 'review')) return 'review';
  return 'pass';
}

function auditVisualDomSnapshot(snapshot = {}) {
  const failures = [];
  const elements = Array.isArray(snapshot.elements) ? snapshot.elements : [];
  const textBoxes = Array.isArray(snapshot.text_boxes) ? snapshot.text_boxes : [];
  for (const element of elements) {
    checkLockedBaseTextPolicy(element, failures);
    checkDisabledAssetLayer(element, failures);
    checkZIndexBand(element, failures);
  }
  for (const textBox of textBoxes) checkTextOcclusion(textBox, failures);
  return {
    html: snapshot.html || '',
    file_url: snapshot.file_url || '',
    status: entryStatusFromFailures(failures),
    canvas: snapshot.canvas || null,
    elements,
    text_boxes: textBoxes,
    failures,
    summary: {
      element_count: elements.length,
      text_box_count: textBoxes.length,
      image_layer_count: elements.filter((element) => element.tag === 'img' || element.tag === 'image').length,
      failure_count: failures.length,
      failure_types: [...new Set(failures.map((failure) => failure.code))].sort(),
    },
  };
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function overlayColorForFailure(code) {
  if (code === 'text_center_occluded') return '#ef4444';
  if (code === 'z_index_band_violation') return '#f59e0b';
  if (code === 'disabled_asset_layer') return '#a855f7';
  if (code === 'locked_base_text_obscured_without_clean_base') return '#dc2626';
  return '#2563eb';
}

function renderVisualDomOverlaySvg(entry) {
  const canvas = entry.canvas || { width: 1200, height: 800 };
  const width = Number(canvas.width) || 1200;
  const height = Number(canvas.height) || 800;
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<rect width="100%" height="100%" fill="#f8fafc"/>',
    '<text x="24" y="36" font-family="Arial, sans-serif" font-size="24" fill="#0f172a">Visual DOM Overlay</text>',
  ];
  const failures = Array.isArray(entry.failures) ? entry.failures : [];
  failures.forEach((failure, index) => {
    const evidence = failure.coordinate_evidence || {};
    const rect = evidence.text_rect || evidence.rect;
    if (!rect) return;
    const color = overlayColorForFailure(failure.code);
    lines.push(`<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="none" stroke="${color}" stroke-width="5"/>`);
    lines.push(`<text x="${rect.x}" y="${Math.max(18, rect.y - 8)}" font-family="Arial, sans-serif" font-size="18" fill="${color}">${index + 1}. ${escapeXml(failure.code)} ${escapeXml(failure.selector || failure.asset_id || '')}</text>`);
    if (evidence.sample_point) {
      lines.push(`<circle cx="${evidence.sample_point.x}" cy="${evidence.sample_point.y}" r="8" fill="${color}"/>`);
    }
  });
  lines.push('</svg>');
  return `${lines.join('\n')}\n`;
}

function renderVisualDomSummaryMarkdown(report) {
  const lines = [
    '# Visual DOM Audit',
    '',
    `- Status: \`${report.status}\``,
    `- Project: \`${report.project_id}\``,
    `- Subproject: \`${report.subproject_id || ''}\``,
    `- Browser backed: \`${report.browser_backed}\``,
    `- HTML entries: ${report.summary.entry_count}`,
    `- Elements: ${report.summary.element_count}`,
    `- Text boxes: ${report.summary.text_box_count}`,
    `- Image layers: ${report.summary.image_layer_count}`,
    `- Failures: ${report.summary.failure_count}`,
    '',
    '## Entries',
    '',
  ];
  for (const entry of report.entries) {
    lines.push(`### ${entry.html_group || 'single'} / ${entry.variant || 'canonical'}`);
    lines.push('');
    lines.push(`- Status: \`${entry.status}\``);
    lines.push(`- Local HTML file path: \`${entry.html}\``);
    lines.push(`- File URL: \`${entry.file_url}\``);
    lines.push(`- Canvas: ${entry.canvas ? `${entry.canvas.width} x ${entry.canvas.height}` : 'missing'}`);
    if (!entry.failures.length) {
      lines.push('- Failures: none detected');
    } else {
      lines.push('- Failures:');
      for (const failure of entry.failures) {
        lines.push(`  - \`${failure.code}\` ${failure.selector || failure.asset_id || ''}: ${failure.message}`);
      }
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function buildVisualDomEvaluationScript() {
  return `(() => {
    function cssPath(element) {
      const parts = [];
      let current = element;
      while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
        let part = current.tagName.toLowerCase();
        if (current.id) {
          part += '#' + current.id;
          parts.unshift(part);
          break;
        }
        const classes = Array.from(current.classList || []).slice(0, 3);
        if (classes.length) part += '.' + classes.join('.');
        if (current.parentElement) {
          const sameTag = Array.from(current.parentElement.children).filter((child) => child.tagName === current.tagName);
          if (sameTag.length > 1) part += ':nth-of-type(' + (sameTag.indexOf(current) + 1) + ')';
        }
        parts.unshift(part);
        current = current.parentElement;
      }
      return parts.join(' > ');
    }
    function rectToJson(rect) {
      return {
        x: Math.round(rect.x * 100) / 100,
        y: Math.round(rect.y * 100) / 100,
        width: Math.round(rect.width * 100) / 100,
        height: Math.round(rect.height * 100) / 100,
        left: Math.round(rect.left * 100) / 100,
        top: Math.round(rect.top * 100) / 100,
        right: Math.round(rect.right * 100) / 100,
        bottom: Math.round(rect.bottom * 100) / 100
      };
    }
    function dataAttrs(element) {
      return {
        data_asset_id: element.getAttribute('data-asset-id') || '',
        data_route: element.getAttribute('data-route') || '',
        data_asset_text_policy: element.getAttribute('data-asset-text-policy') || element.getAttribute('data-text-policy') || '',
        data_final_asset_ready: element.getAttribute('data-final-asset-ready') || '',
        data_i18n_key: element.getAttribute('data-i18n-key') || '',
        clean_base_proof: element.getAttribute('data-clean-base-proof') || '',
        review_gate: element.getAttribute('data-review-gate') || element.getAttribute('data-review-required') || ''
      };
    }
    function roleFor(element) {
      const dataRoute = element.getAttribute('data-route') || '';
      if (dataRoute) return dataRoute;
      if (element.matches('.white-swoosh, .aqua-wave, .wave-highlight, [data-vector-layer]')) return 'editable_vector';
      return '';
    }
    const poster = document.querySelector('.poster') || document.body;
    const posterRect = poster.getBoundingClientRect();
    const elements = Array.from(document.querySelectorAll('body *')).map((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const attrs = dataAttrs(element);
      return {
        selector: cssPath(element),
        tag: element.tagName.toLowerCase(),
        rect: rectToJson(rect),
        visible: rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0,
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        position: style.position,
        z_index: style.zIndex === 'auto' ? null : Number(style.zIndex),
        inferred_role: roleFor(element),
        ...attrs
      };
    });
    const textElements = Array.from(document.querySelectorAll('[data-i18n-key], h1, h2, h3, p, span, button, a'))
      .filter((element) => (element.innerText || element.textContent || '').replace(/\\s+/g, ' ').trim());
    const text_boxes = textElements.map((element) => {
      const rect = element.getBoundingClientRect();
      const center = { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
      const stack = document.elementsFromPoint(center.x, center.y);
      const top = stack[0] || null;
      const topStyle = top ? getComputedStyle(top) : null;
      const topSelector = top ? cssPath(top) : '';
      const covered = Boolean(top && top !== element && !element.contains(top) && !top.contains(element));
      return {
        selector: cssPath(element),
        text: (element.innerText || element.textContent || '').replace(/\\s+/g, ' ').trim(),
        i18n_key: element.getAttribute('data-i18n-key') || '',
        rect: rectToJson(rect),
        center,
        top_selector_at_center: topSelector,
        top_z_index_at_center: topStyle && topStyle.zIndex !== 'auto' ? Number(topStyle.zIndex) : null,
        covered_by_unrelated_top_element: covered
      };
    });
    return {
      canvas: { width: Math.round(posterRect.width), height: Math.round(posterRect.height) },
      elements,
      text_boxes
    };
  })()`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function removeTemporaryDirectory(dirPath, options = {}) {
  const retries = Number(options.retries || 8);
  const delayMs = Number(options.delayMs || 150);
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
      return;
    } catch (error) {
      const retryable = ['ENOTEMPTY', 'EBUSY', 'EPERM'].includes(error.code);
      if (!retryable || attempt === retries) throw error;
      sleepSync(delayMs);
    }
  }
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const request = http.request(url, { method: 'GET' }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`HTTP ${response.statusCode} from ${url}: ${body.slice(0, 200)}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`Invalid JSON from ${url}: ${error.message}`));
        }
      });
    });
    request.on('error', reject);
    request.end();
  });
}

function findOpenPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

function chromeCandidates() {
  return [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter(Boolean);
}

function findChrome(chromePath) {
  const candidates = chromePath ? [chromePath] : chromeCandidates();
  return candidates.find((candidate) => fs.existsSync(candidate));
}

async function evaluateInChrome({ fileUrl, chromePath, viewportWidth, viewportHeight, settleMs } = {}) {
  const executable = findChrome(chromePath);
  if (!executable) throw new Error('No Chrome/Chromium executable found. Set CHROME_PATH or pass --chrome.');
  const port = await findOpenPort();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'text2html-visual-dom-'));
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--allow-file-access-from-files',
    `--window-size=${Number(viewportWidth) || 1400},${Number(viewportHeight) || 1000}`,
    fileUrl,
  ];
  const child = spawn(executable, args, { stdio: 'ignore' });
  try {
    let tabs = [];
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        tabs = await requestJson(`http://127.0.0.1:${port}/json/list`);
        if (Array.isArray(tabs) && tabs.length) break;
      } catch (_error) {
        await sleep(100);
      }
    }
    const tab = tabs.find((item) => item.url === fileUrl) || tabs[0];
    if (!tab || !tab.webSocketDebuggerUrl) throw new Error('Chrome DevTools target was not available');
    const WebSocketClient = global.WebSocket || require('ws');
    const ws = new WebSocketClient(tab.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });
    let id = 0;
    const pending = new Map();
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const { resolve, reject } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
        else resolve(message.result);
      }
    };
    function send(method, params = {}) {
      id += 1;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    }
    await send('Runtime.enable');
    await sleep(Number(settleMs) || 250);
    const result = await send('Runtime.evaluate', {
      expression: buildVisualDomEvaluationScript(),
      returnByValue: true,
      awaitPromise: true,
    });
    ws.close();
    return result.result.value;
  } finally {
    child.kill();
    await sleep(100);
    removeTemporaryDirectory(profileDir);
  }
}

async function auditVisualDomEntries(entries, options = {}) {
  const auditedEntries = [];
  for (const entry of entries) {
    const snapshot = await evaluateInChrome({
      fileUrl: entry.file_url,
      chromePath: options.chromePath,
      viewportWidth: options.viewportWidth,
      viewportHeight: options.viewportHeight,
      settleMs: options.settleMs,
    });
    const audit = auditVisualDomSnapshot({
      ...snapshot,
      html: entry.html,
      file_url: entry.file_url,
    });
    auditedEntries.push({
      html_group: entry.html_group,
      variant: entry.variant,
      ...audit,
    });
  }
  const summary = {
    entry_count: auditedEntries.length,
    pass_count: auditedEntries.filter((entry) => entry.status === 'pass').length,
    review_count: auditedEntries.filter((entry) => entry.status === 'review').length,
    fail_count: auditedEntries.filter((entry) => entry.status === 'fail').length,
    element_count: auditedEntries.reduce((sum, entry) => sum + entry.summary.element_count, 0),
    text_box_count: auditedEntries.reduce((sum, entry) => sum + entry.summary.text_box_count, 0),
    image_layer_count: auditedEntries.reduce((sum, entry) => sum + entry.summary.image_layer_count, 0),
    failure_count: auditedEntries.reduce((sum, entry) => sum + entry.summary.failure_count, 0),
    failure_types: [...new Set(auditedEntries.flatMap((entry) => entry.summary.failure_types))].sort(),
  };
  return {
    status: summary.fail_count ? 'fail' : summary.review_count ? 'review' : 'pass',
    summary,
    entries: auditedEntries,
  };
}

module.exports = {
  auditVisualDomEntries,
  auditVisualDomSnapshot,
  buildVisualDomEvaluationScript,
  renderVisualDomOverlaySvg,
  renderVisualDomSummaryMarkdown,
};
