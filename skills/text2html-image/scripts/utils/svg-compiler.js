const fs = require('fs');
const path = require('path');

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function mimeTypeFor(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

function imageHref(value) {
  if (/^file:|^data:|^https?:/i.test(String(value || ''))) return String(value || '');
  if (fs.existsSync(String(value || ''))) {
    return `data:${mimeTypeFor(value)};base64,${fs.readFileSync(value).toString('base64')}`;
  }
  return `file://${String(value || '')}`;
}

function layerToSvg(layer) {
  if (layer.type === 'svg') {
    return `<g data-layer-id="${escapeXml(layer.id)}">${layer.svg}</g>`;
  }
  if (layer.type === 'rect') {
    return `<rect data-layer-id="${escapeXml(layer.id)}" x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" rx="${layer.radius || 0}" fill="${escapeXml(layer.fill)}" stroke="${escapeXml(layer.stroke || 'none')}" stroke-width="${layer.strokeWidth || 0}"/>`;
  }
  if (layer.type === 'text') {
    const transform = /label-portugal/.test(layer.className) ? ` transform="rotate(-65 ${layer.x} ${layer.y})"` : '';
    return `<text data-layer-id="${escapeXml(layer.id)}" x="${layer.x}" y="${layer.y}" fill="${escapeXml(layer.fill)}" font-family="Noto Sans TC, Arial, sans-serif" font-size="${layer.fontSize}" font-weight="${layer.fontWeight}" text-anchor="${layer.textAnchor || 'start'}" dominant-baseline="middle"${transform}>${escapeXml(layer.text)}</text>`;
  }
  if (layer.type === 'image') {
    return `<image data-layer-id="${escapeXml(layer.id)}" href="${escapeXml(imageHref(layer.href))}" x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" preserveAspectRatio="none"/>`;
  }
  return '';
}

function compileSvg(ir) {
  const width = ir.canvas.width;
  const height = ir.canvas.height;
  const body = ir.layers.map(layerToSvg).filter(Boolean).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="100%" height="100%" fill="#FDF2E3"/>
${body}
</svg>
`;
}

module.exports = {
  compileSvg,
  escapeXml,
  imageHref,
};
