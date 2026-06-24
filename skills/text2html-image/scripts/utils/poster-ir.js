const fs = require('fs');
const parse5 = require('parse5');
const { attrsToObject, parseInlineStyle, parsePx, walk } = require('./render-profile');

function textContent(node) {
  if (node.nodeName === '#text') return node.value || '';
  return (node.childNodes || []).map(textContent).join('');
}

function serializeNode(node) {
  return parse5.serialize({ childNodes: [node] });
}

function classList(node) {
  return String(attrsToObject(node).class || '').split(/\s+/).filter(Boolean);
}

function extractInlinePosition(node) {
  const style = parseInlineStyle(attrsToObject(node).style);
  return {
    x: parsePx(style.left),
    y: parsePx(style.top),
    width: parsePx(style.width),
    height: parsePx(style.height),
  };
}

function readCanvas(documentNode) {
  let poster;
  walk(documentNode, (node) => {
    if (!poster && /\bposter\b/.test(attrsToObject(node).class || '')) poster = node;
  });
  const style = parseInlineStyle(attrsToObject(poster).style);
  return { width: parsePx(style.width), height: parsePx(style.height) };
}

function compileEuropeLikeIr(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const documentNode = parse5.parse(html);
  const canvas = readCanvas(documentNode);
  const layers = [];
  walk(documentNode, (node) => {
    if (!node.tagName) return;
    const attrs = attrsToObject(node);
    const classes = classList(node);
    if (node.tagName === 'svg') {
      layers.push({
        id: attrs.class || `svg-${layers.length + 1}`,
        type: 'svg',
        className: attrs.class || '',
        svg: serializeNode(node),
      });
      return;
    }
    if (node.tagName === 'span' && classes.includes('map-label')) {
      const position = extractInlinePosition(node);
      layers.push({
        id: attrs['data-country-code'] || attrs.class || `text-${layers.length + 1}`,
        type: 'text',
        text: textContent(node).trim(),
        className: attrs.class || '',
        x: position.x || 0,
        y: position.y || 0,
        fill: '#ffffff',
        fontSize: classes.includes('label-lg') ? 28 : classes.includes('label-md') ? 21 : classes.includes('label-sm') ? 15 : 11,
        fontWeight: 700,
        textAnchor: 'middle',
      });
      return;
    }
    if (classes.includes('title-pill')) {
      layers.push({
        id: 'title-pill-box',
        type: 'rect',
        x: 560,
        y: 1130,
        width: 370,
        height: 72,
        fill: '#415BA8',
        stroke: '#ffffff',
        strokeWidth: 6,
        radius: 36,
      });
      layers.push({
        id: 'title-pill-text',
        type: 'text',
        text: textContent(node).trim(),
        x: 745,
        y: 1166,
        fill: '#ffffff',
        fontSize: 34,
        fontWeight: 800,
        textAnchor: 'middle',
      });
    }
  });
  return {
    generated_at: new Date().toISOString(),
    source_html: htmlPath,
    renderer: 'direct-html-svg-v1',
    canvas,
    layers,
  };
}

module.exports = {
  compileEuropeLikeIr,
};
