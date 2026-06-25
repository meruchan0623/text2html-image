function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pixelOffset(width, x, y) {
  return (width * y + x) << 2;
}

function readPixel(png, x, y) {
  const offset = pixelOffset(png.width, x, y);
  return [
    png.data[offset],
    png.data[offset + 1],
    png.data[offset + 2],
    png.data[offset + 3],
  ];
}

function writePixel(png, x, y, rgba) {
  const offset = pixelOffset(png.width, x, y);
  png.data[offset] = rgba[0];
  png.data[offset + 1] = rgba[1];
  png.data[offset + 2] = rgba[2];
  png.data[offset + 3] = rgba[3];
}

function colorDistance(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt((dr * dr) + (dg * dg) + (db * db));
}

function averageColor(samples) {
  const total = samples.reduce((acc, pixel) => {
    acc[0] += pixel[0];
    acc[1] += pixel[1];
    acc[2] += pixel[2];
    acc[3] += pixel[3];
    return acc;
  }, [0, 0, 0, 0]);
  return total.map((value) => Math.round(value / Math.max(1, samples.length)));
}

function edgeSamples(png, inset = 0) {
  const samples = [];
  const xMin = clamp(inset, 0, png.width - 1);
  const yMin = clamp(inset, 0, png.height - 1);
  const xMax = clamp(png.width - 1 - inset, 0, png.width - 1);
  const yMax = clamp(png.height - 1 - inset, 0, png.height - 1);
  for (let x = xMin; x <= xMax; x += 1) {
    samples.push(readPixel(png, x, yMin), readPixel(png, x, yMax));
  }
  for (let y = yMin + 1; y < yMax; y += 1) {
    samples.push(readPixel(png, xMin, y), readPixel(png, xMax, y));
  }
  return samples;
}

function createMask(width, height) {
  return new Uint8Array(width * height);
}

function maskIndex(width, x, y) {
  return (width * y) + x;
}

function floodBackground(png, options = {}) {
  const tolerance = Number(options.tolerance ?? 28);
  const backgroundColor = options.backgroundColor || averageColor(edgeSamples(png, Number(options.sampleInset ?? 0)));
  const mask = createMask(png.width, png.height);
  const queue = [];

  function enqueue(x, y) {
    if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
    const index = maskIndex(png.width, x, y);
    if (mask[index]) return;
    const pixel = readPixel(png, x, y);
    if (pixel[3] === 0 || colorDistance(pixel, backgroundColor) <= tolerance) {
      mask[index] = 1;
      queue.push([x, y]);
    }
  }

  for (let x = 0; x < png.width; x += 1) {
    enqueue(x, 0);
    enqueue(x, png.height - 1);
  }
  for (let y = 1; y < png.height - 1; y += 1) {
    enqueue(0, y);
    enqueue(png.width - 1, y);
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const [x, y] = queue[cursor];
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  return { mask, backgroundColor, tolerance };
}

function isAdjacentToMask(mask, width, height, x, y, radius) {
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (mask[maskIndex(width, nx, ny)]) return true;
    }
  }
  return false;
}

function applyFloodCutout(inputPng, options = {}) {
  const { PNG } = require('pngjs');
  const output = new PNG({ width: inputPng.width, height: inputPng.height });
  inputPng.data.copy(output.data);
  const { mask, backgroundColor, tolerance } = floodBackground(inputPng, options);
  const removedMask = new Uint8Array(mask);
  const edgeCleanup = Math.max(0, Number(options.edgeCleanup ?? 2));
  const glowTolerance = Number(options.glowTolerance ?? tolerance + 18);
  let removedPixels = 0;
  let edgeCleanupPixels = 0;

  for (let y = 0; y < output.height; y += 1) {
    for (let x = 0; x < output.width; x += 1) {
      const index = maskIndex(output.width, x, y);
      const pixel = readPixel(output, x, y);
      if (mask[index]) {
        writePixel(output, x, y, [pixel[0], pixel[1], pixel[2], 0]);
        removedPixels += 1;
        continue;
      }
      if (
        edgeCleanup > 0 &&
        isAdjacentToMask(mask, output.width, output.height, x, y, edgeCleanup) &&
        colorDistance(pixel, backgroundColor) <= glowTolerance
      ) {
        writePixel(output, x, y, [pixel[0], pixel[1], pixel[2], 0]);
        removedMask[index] = 1;
        edgeCleanupPixels += 1;
      } else if (pixel[3] > 0) {
        writePixel(output, x, y, [pixel[0], pixel[1], pixel[2], 255]);
      }
    }
  }

  const maskPng = new PNG({ width: inputPng.width, height: inputPng.height });
  for (let y = 0; y < maskPng.height; y += 1) {
    for (let x = 0; x < maskPng.width; x += 1) {
      const isRemoved = removedMask[maskIndex(maskPng.width, x, y)];
      const pixel = isRemoved ? [0, 0, 0, 255] : [255, 255, 255, 255];
      writePixel(maskPng, x, y, pixel);
    }
  }

  const totalPixels = output.width * output.height;
  const removedRatio = (removedPixels + edgeCleanupPixels) / totalPixels;
  const warnings = [];
  if (removedRatio > 0.92) warnings.push('removed_area_ratio_too_high');
  if (removedRatio < 0.05) warnings.push('removed_area_ratio_too_low');

  return {
    output,
    maskPng,
    report: {
      mode: 'edge-flood',
      width: output.width,
      height: output.height,
      tolerance,
      glow_tolerance: glowTolerance,
      edge_cleanup_radius: edgeCleanup,
      background_color: backgroundColor.slice(0, 3),
      removed_pixels: removedPixels,
      edge_cleanup_pixels: edgeCleanupPixels,
      removed_area_ratio: Number(removedRatio.toFixed(6)),
      warnings,
    },
  };
}

module.exports = {
  applyFloodCutout,
  colorDistance,
  floodBackground,
  readPixel,
  writePixel,
};
