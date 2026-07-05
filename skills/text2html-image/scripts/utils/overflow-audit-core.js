const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const DEFAULT_SELECTORS = ['td', 'th', '[data-overflow-check]', '[data-overflow-cell]'];

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

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(url, { method: options.method || 'GET' }, (response) => {
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

function buildOverflowEvaluationScript(options = {}) {
  const selectors = options.selectors?.length ? options.selectors : DEFAULT_SELECTORS;
  return `(() => {
    const selectors = ${JSON.stringify(selectors)};
    const seen = new Set();
    const elements = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)).map((element) => ({ selector, element })))
      .filter((item) => {
        if (seen.has(item.element)) return false;
        seen.add(item.element);
        return true;
      });
    function textOf(element) {
      return (element.innerText || element.textContent || '').replace(/\\s+/g, ' ').trim();
    }
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
        const classes = Array.from(current.classList || []).slice(0, 2);
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
      };
    }
    const cells = elements.map(({ selector, element }) => {
      const elementRect = element.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(element);
      const rangeRects = Array.from(range.getClientRects()).map(rectToJson);
      range.detach();
      const visibleRangeRects = rangeRects.filter((rect) => rect.width > 0 && rect.height > 0);
      const maxTextRight = visibleRangeRects.reduce((max, rect) => Math.max(max, rect.x + rect.width), elementRect.x);
      const maxTextBottom = visibleRangeRects.reduce((max, rect) => Math.max(max, rect.y + rect.height), elementRect.y);
      const textOverflowX = maxTextRight > elementRect.x + element.clientWidth + 1;
      const textOverflowY = maxTextBottom > elementRect.y + element.clientHeight + 1;
      const scrollOverflowX = element.scrollWidth > element.clientWidth + 1;
      const scrollOverflowY = element.scrollHeight > element.clientHeight + 1;
      return {
        selector,
        path: cssPath(element),
        text: textOf(element).slice(0, 120),
        data_i18n_key: element.getAttribute('data-i18n-key') || '',
        data_sku: element.getAttribute('data-sku') || '',
        rect: rectToJson(elementRect),
        client_width: element.clientWidth,
        client_height: element.clientHeight,
        scroll_width: element.scrollWidth,
        scroll_height: element.scrollHeight,
        range_rect_count: visibleRangeRects.length,
        range_rects: visibleRangeRects.slice(0, 8),
        overflow_x: scrollOverflowX || textOverflowX,
        overflow_y: scrollOverflowY || textOverflowY,
        overflow: scrollOverflowX || scrollOverflowY || textOverflowX || textOverflowY,
      };
    });
    const root = document.documentElement;
    const body = document.body;
    const page = {
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
      document_client_width: root.clientWidth,
      document_client_height: root.clientHeight,
      document_scroll_width: Math.max(root.scrollWidth, body ? body.scrollWidth : 0),
      document_scroll_height: Math.max(root.scrollHeight, body ? body.scrollHeight : 0),
    };
    page.overflow_x = page.document_scroll_width > page.viewport_width + 1;
    page.overflow_y = page.document_scroll_height > page.viewport_height + 1;
    return {
      page,
      selector_count: selectors.length,
      measured_cell_count: cells.length,
      overflow_cell_count: cells.filter((cell) => cell.overflow).length,
      cells,
    };
  })()`;
}

function connectDevtools(webSocketUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl);
    const pending = new Map();
    let nextId = 1;
    socket.addEventListener('open', () => {
      resolve({
        send(method, params = {}) {
          const id = nextId;
          nextId += 1;
          socket.send(JSON.stringify({ id, method, params }));
          return new Promise((commandResolve, commandReject) => {
            pending.set(id, { resolve: commandResolve, reject: commandReject });
          });
        },
        close() {
          socket.close();
        },
      });
    });
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) return;
      const command = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) command.reject(new Error(`${message.error.message || 'CDP error'}: ${message.error.data || ''}`));
      else command.resolve(message.result);
    });
    socket.addEventListener('error', () => reject(new Error(`Could not connect to Chrome DevTools at ${webSocketUrl}`)));
    socket.addEventListener('close', () => {
      for (const command of pending.values()) command.reject(new Error('Chrome DevTools socket closed'));
      pending.clear();
    });
  });
}

async function waitForChrome(port) {
  const versionUrl = `http://127.0.0.1:${port}/json/version`;
  const started = Date.now();
  let lastError;
  while (Date.now() - started < 8000) {
    try {
      return await requestJson(versionUrl);
    } catch (error) {
      lastError = error;
      await sleep(100);
    }
  }
  throw new Error(`Chrome DevTools did not become ready on port ${port}: ${lastError?.message || 'timeout'}`);
}

async function auditHtmlOverflow(htmlEntry, options = {}) {
  const chromePath = findChrome(options.chromePath);
  if (!chromePath) {
    throw new Error('Chrome executable not found. Set CHROME_PATH or install Google Chrome/Chromium.');
  }
  const port = await findOpenPort();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'text2html-overflow-chrome-'));
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-extensions',
    '--no-first-run',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], { stdio: 'ignore' });

  try {
    await waitForChrome(port);
    const target = await requestJson(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(htmlEntry.file_url)}`, { method: 'PUT' });
    const devtools = await connectDevtools(target.webSocketDebuggerUrl);
    try {
      await devtools.send('Page.enable');
      await devtools.send('Runtime.enable');
      await devtools.send('Emulation.setDeviceMetricsOverride', {
        width: Number(options.viewportWidth || 1448),
        height: Number(options.viewportHeight || 1086),
        deviceScaleFactor: 1,
        mobile: false,
      });
      await devtools.send('Page.navigate', { url: htmlEntry.file_url });
      await sleep(Number(options.settleMs || 500));
      const result = await devtools.send('Runtime.evaluate', {
        expression: buildOverflowEvaluationScript({ selectors: options.selectors }),
        returnByValue: true,
        awaitPromise: false,
      });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text || 'overflow evaluation failed');
      }
      return {
        html_group: htmlEntry.html_group,
        variant: htmlEntry.variant,
        html: htmlEntry.html,
        file_url: htmlEntry.file_url,
        browser_backed: true,
        status: result.result.value.overflow_cell_count || result.result.value.page.overflow_x || result.result.value.page.overflow_y ? 'fail' : 'pass',
        ...result.result.value,
      };
    } finally {
      devtools.close();
      if (target.id) {
        try {
          await requestJson(`http://127.0.0.1:${port}/json/close/${target.id}`);
        } catch (_error) {
          // Chrome may close the target before the close request lands.
        }
      }
    }
  } finally {
    chrome.kill('SIGTERM');
    removeTemporaryDirectory(userDataDir);
  }
}

async function auditOverflowEntries(entries, options = {}) {
  const audited = [];
  for (const entry of entries) {
    audited.push(await auditHtmlOverflow(entry, options));
  }
  const summary = {
    entry_count: audited.length,
    pass_count: audited.filter((entry) => entry.status === 'pass').length,
    fail_count: audited.filter((entry) => entry.status === 'fail').length,
    measured_cell_count: audited.reduce((sum, entry) => sum + entry.measured_cell_count, 0),
    overflow_cell_count: audited.reduce((sum, entry) => sum + entry.overflow_cell_count, 0),
    page_overflow_count: audited.filter((entry) => entry.page.overflow_x || entry.page.overflow_y).length,
  };
  return {
    status: summary.fail_count ? 'fail' : 'pass',
    summary,
    entries: audited,
  };
}

module.exports = {
  DEFAULT_SELECTORS,
  auditHtmlOverflow,
  auditOverflowEntries,
  buildOverflowEvaluationScript,
  findChrome,
  removeTemporaryDirectory,
};
