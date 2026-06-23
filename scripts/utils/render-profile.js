const fs = require('fs');
const path = require('path');
const parse5 = require('parse5');

const UNSUPPORTED_PROPERTIES = new Set([
  'filter',
  'mix-blend-mode',
  'clip-path',
  'mask',
  'mask-image',
  '-webkit-mask',
  '-webkit-mask-image',
]);

function attrsToObject(node) {
  return Object.fromEntries((node.attrs || []).map((attr) => [attr.name, attr.value]));
}

function walk(node, callback) {
  callback(node);
  for (const child of node.childNodes || []) walk(child, callback);
}

function findElement(node, predicate) {
  let found;
  walk(node, (current) => {
    if (!found && current.nodeName && predicate(current)) found = current;
  });
  return found;
}

function parseInlineStyle(styleText = '') {
  return Object.fromEntries(String(styleText).split(';').map((part) => {
    const index = part.indexOf(':');
    if (index === -1) return undefined;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    return key ? [key, value] : undefined;
  }).filter(Boolean));
}

function parsePx(value) {
  const match = String(value || '').match(/^(-?\d+(?:\.\d+)?)px$/);
  return match ? Number(match[1]) : undefined;
}

function extractCanvas(documentNode) {
  const poster = findElement(documentNode, (node) => {
    const attrs = attrsToObject(node);
    return /\bposter\b/.test(attrs.class || '');
  });
  if (!poster) return { error: 'missing .poster element' };
  const style = parseInlineStyle(attrsToObject(poster).style);
  const width = parsePx(style.width);
  const height = parsePx(style.height);
  if (!width || !height) return { error: '.poster must have inline pixel width and height' };
  return { width, height };
}

function readLinkedCss(htmlPath, documentNode) {
  const links = [];
  walk(documentNode, (node) => {
    if (node.nodeName !== 'link') return;
    const attrs = attrsToObject(node);
    if (attrs.rel === 'stylesheet' && attrs.href) links.push(path.resolve(path.dirname(htmlPath), attrs.href));
  });
  return links.filter((file) => fs.existsSync(file)).map((file) => ({ file, css: fs.readFileSync(file, 'utf8') }));
}

function parseCssRules(css) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  const rulePattern = /([^{}@][^{}]*)\{([^{}]*)\}/g;
  let match;
  while ((match = rulePattern.exec(withoutComments)) !== null) {
    const selector = match[1].trim();
    const body = match[2].trim();
    if (!selector || selector.startsWith('@')) continue;
    const declarations = body.split(';').map((part) => {
      const index = part.indexOf(':');
      if (index === -1) return undefined;
      const property = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      return property ? { property, value } : undefined;
    }).filter(Boolean);
    rules.push({ selector, declarations, body });
  }
  return rules;
}

function isAllowedFlex(selector) {
  return selector.split(',').map((item) => item.trim()).every((item) => item === '.title-pill');
}

function collectUnsupportedCss(cssSources) {
  const unsupported = [];
  for (const source of cssSources) {
    for (const rule of parseCssRules(source.css)) {
      if (/::before|::after/.test(rule.selector) && /content\s*:\s*["'][^"']+["']/.test(rule.body)) {
        unsupported.push({
          file: source.file,
          selector: rule.selector,
          property: 'pseudo-content',
          value: 'visual pseudo-element content',
        });
      }
      for (const declaration of rule.declarations) {
        const { property, value } = declaration;
        if (UNSUPPORTED_PROPERTIES.has(property)) {
          unsupported.push({ file: source.file, selector: rule.selector, property, value });
          continue;
        }
        if (property === 'display' && value === 'grid') {
          unsupported.push({ file: source.file, selector: rule.selector, property, value });
          continue;
        }
        if (property === 'display' && /^(flex|inline-flex)$/.test(value) && !isAllowedFlex(rule.selector)) {
          unsupported.push({ file: source.file, selector: rule.selector, property, value });
        }
      }
    }
    const mediaQueryMatches = source.css.match(/@media\b/g) || [];
    for (const _match of mediaQueryMatches) {
      unsupported.push({ file: source.file, selector: '@media', property: 'media-query', value: 'media query' });
    }
  }
  return unsupported;
}

function inspectRenderProfile(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const documentNode = parse5.parse(html);
  const canvas = extractCanvas(documentNode);
  const cssSources = readLinkedCss(htmlPath, documentNode);
  const unsupportedCss = collectUnsupportedCss(cssSources);
  const errors = [];
  if (canvas.error) errors.push(canvas.error);
  if (unsupportedCss.length) errors.push('unsupported CSS found');
  return {
    html_path: htmlPath,
    status: errors.length ? 'fail' : 'pass',
    canvas: canvas.error ? undefined : canvas,
    css_files: cssSources.map((source) => source.file),
    unsupported_css: unsupportedCss,
    errors,
  };
}

module.exports = {
  attrsToObject,
  inspectRenderProfile,
  parseInlineStyle,
  parsePx,
  walk,
};
