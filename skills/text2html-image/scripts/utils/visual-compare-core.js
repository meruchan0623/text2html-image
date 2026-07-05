const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

function readPng(filePath) {
  return PNG.sync.read(fs.readFileSync(filePath));
}

function pixelOffset(width, x, y) {
  return (width * y + x) << 2;
}

function writeDiffMap({ reference, render, width, height, diffPath }) {
  if (!diffPath) return null;
  const output = new PNG({ width, height });
  const maxChannelDiff = 255 * 3;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const refOffset = pixelOffset(reference.width, x, y);
      const renderOffset = pixelOffset(render.width, x, y);
      const outOffset = pixelOffset(output.width, x, y);
      const diff = Math.abs(reference.data[refOffset] - render.data[renderOffset])
        + Math.abs(reference.data[refOffset + 1] - render.data[renderOffset + 1])
        + Math.abs(reference.data[refOffset + 2] - render.data[renderOffset + 2]);
      const intensity = Math.max(0, Math.min(255, Math.round((diff / maxChannelDiff) * 255)));
      output.data[outOffset] = intensity;
      output.data[outOffset + 1] = Math.round(intensity * 0.6);
      output.data[outOffset + 2] = 0;
      output.data[outOffset + 3] = 255;
    }
  }
  fs.mkdirSync(path.dirname(diffPath), { recursive: true });
  fs.writeFileSync(diffPath, PNG.sync.write(output));
  return path.resolve(diffPath);
}

function comparePngImages({ referencePath, renderPath, stride = 4, diffPath } = {}) {
  const reference = readPng(referencePath);
  const render = readPng(renderPath);
  const width = Math.min(reference.width, render.width);
  const height = Math.min(reference.height, render.height);
  const step = Math.max(1, Number(stride || 4));
  let sampled = 0;
  let totalDiff = 0;
  let highDiffPixels = 0;
  const maxChannelDiff = 255 * 3;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const refOffset = pixelOffset(reference.width, x, y);
      const renderOffset = pixelOffset(render.width, x, y);
      const diff = Math.abs(reference.data[refOffset] - render.data[renderOffset])
        + Math.abs(reference.data[refOffset + 1] - render.data[renderOffset + 1])
        + Math.abs(reference.data[refOffset + 2] - render.data[renderOffset + 2]);
      totalDiff += diff;
      if (diff / maxChannelDiff > 0.25) highDiffPixels += 1;
      sampled += 1;
    }
  }

  const meanDiff = sampled ? totalDiff / sampled : maxChannelDiff;
  const meanDiffRatio = meanDiff / maxChannelDiff;
  const similarityScore = Math.max(0, Math.min(100, Math.round((1 - meanDiffRatio) * 100)));
  const dimensionMatch = reference.width === render.width && reference.height === render.height;
  const highDiffPixelRatio = sampled ? highDiffPixels / sampled : 1;
  const status = dimensionMatch && similarityScore >= 75 ? 'pass' : 'review';
  const resolvedDiffPath = writeDiffMap({ reference, render, width, height, diffPath });
  return {
    generated_at: new Date().toISOString(),
    reference_path: path.resolve(referencePath),
    render_path: path.resolve(renderPath),
    status,
    canvas_match: dimensionMatch,
    reference_dimensions: { width: reference.width, height: reference.height },
    render_dimensions: { width: render.width, height: render.height },
    compared_dimensions: { width, height },
    stride: step,
    sampled_pixel_count: sampled,
    mean_rgb_diff: Number(meanDiff.toFixed(4)),
    mean_rgb_diff_ratio: Number(meanDiffRatio.toFixed(6)),
    high_diff_pixel_ratio: Number(highDiffPixelRatio.toFixed(6)),
    similarity_score: similarityScore,
    diff_path: resolvedDiffPath,
    diff_dimensions: resolvedDiffPath ? { width, height } : null,
  };
}

module.exports = {
  comparePngImages,
};
