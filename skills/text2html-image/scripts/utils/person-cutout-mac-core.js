const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PNG } = require('pngjs');
const { writeJson } = require('./workflow-core');

const MAC_PERSON_CUTOUT_UNAVAILABLE = 'cutout:person-mac requires macOS with Apple Vision and swift';

const SWIFT_PERSON_MASK_SCRIPT = `
import Foundation
import Vision
import CoreImage
import CoreImage.CIFilterBuiltins

func fail(_ message: String) -> Never {
    fputs(message + "\\n", stderr)
    exit(1)
}

let args = CommandLine.arguments
if args.count < 4 {
    fail("usage: swift person-cutout.swift <input> <person-mask> <foreground-mask>")
}

let inputURL = URL(fileURLWithPath: args[1])
let personMaskURL = URL(fileURLWithPath: args[2])
let foregroundMaskURL = URL(fileURLWithPath: args[3])
let rgb = CGColorSpaceCreateDeviceRGB()

guard let source = CIImage(contentsOf: inputURL) else {
    fail("Cannot load source image")
}

func colorizeMask(_ image: CIImage) -> CIImage {
    return image.applyingFilter("CIColorMatrix", parameters: [
        "inputRVector": CIVector(x: 1, y: 0, z: 0, w: 0),
        "inputGVector": CIVector(x: 1, y: 0, z: 0, w: 0),
        "inputBVector": CIVector(x: 1, y: 0, z: 0, w: 0),
        "inputAVector": CIVector(x: 0, y: 0, z: 0, w: 1)
    ])
}

let personRequest = VNGeneratePersonSegmentationRequest()
personRequest.qualityLevel = .accurate
personRequest.outputPixelFormat = kCVPixelFormatType_OneComponent8
let personHandler = VNImageRequestHandler(url: inputURL, options: [:])
do {
    try personHandler.perform([personRequest])
} catch {
    fail("VNGeneratePersonSegmentationRequest failed: \\(error)")
}
guard let personObservation = personRequest.results?.first as? VNPixelBufferObservation else {
    fail("VNGeneratePersonSegmentationRequest produced no mask")
}

let personRaw = CIImage(cvPixelBuffer: personObservation.pixelBuffer)
let sx = source.extent.width / personRaw.extent.width
let sy = source.extent.height / personRaw.extent.height
let personMask = personRaw
    .transformed(by: CGAffineTransform(scaleX: sx, y: sy))
    .cropped(to: source.extent)

let foregroundRequest = VNGenerateForegroundInstanceMaskRequest()
let foregroundHandler = VNImageRequestHandler(url: inputURL, options: [:])
do {
    try foregroundHandler.perform([foregroundRequest])
} catch {
    fail("VNGenerateForegroundInstanceMaskRequest failed: \\(error)")
}
guard let foregroundObservation = foregroundRequest.results?.first as? VNInstanceMaskObservation else {
    fail("VNGenerateForegroundInstanceMaskRequest produced no mask")
}

let foregroundPixelBuffer: CVPixelBuffer
do {
    foregroundPixelBuffer = try foregroundObservation.generateScaledMaskForImage(
        forInstances: foregroundObservation.allInstances,
        from: foregroundHandler
    )
} catch {
    fail("Foreground scaled mask generation failed: \\(error)")
}
let foregroundMask = CIImage(cvPixelBuffer: foregroundPixelBuffer).cropped(to: source.extent)

let context = CIContext(options: [.workingColorSpace: rgb, .outputColorSpace: rgb])
do {
    try context.writePNGRepresentation(of: colorizeMask(personMask), to: personMaskURL, format: .RGBA8, colorSpace: rgb)
    try context.writePNGRepresentation(of: colorizeMask(foregroundMask), to: foregroundMaskURL, format: .RGBA8, colorSpace: rgb)
} catch {
    fail("PNG mask write failed: \\(error)")
}
`;

function assertMacPersonCutoutAvailable(options = {}) {
  const platform = options.platform || process.platform;
  const swiftPath = options.swiftPath || '/usr/bin/swift';
  const fsExists = options.fsExists || fs.existsSync;
  if (platform !== 'darwin' || !fsExists(swiftPath)) {
    throw new Error(MAC_PERSON_CUTOUT_UNAVAILABLE);
  }
}

function ensureInputPng(input) {
  if (!fs.existsSync(input)) throw new Error(`Input image not found: ${input}`);
  const png = PNG.sync.read(fs.readFileSync(input));
  if (!png.width || !png.height) throw new Error(`Input PNG has invalid dimensions: ${input}`);
  return png;
}

function pixelIndex(width, x, y) {
  return (width * y) + x;
}

function rgbaOffset(width, x, y) {
  return pixelIndex(width, x, y) << 2;
}

function maskValue(maskPng, x, y) {
  return maskPng.data[rgbaOffset(maskPng.width, x, y)];
}

function erodeMask(mask, width, height, iterations) {
  let current = mask;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const next = new Uint8Array(current.length);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = pixelIndex(width, x, y);
        if (
          current[index] &&
          current[pixelIndex(width, x - 1, y)] &&
          current[pixelIndex(width, x + 1, y)] &&
          current[pixelIndex(width, x, y - 1)] &&
          current[pixelIndex(width, x, y + 1)]
        ) {
          next[index] = 1;
        }
      }
    }
    current = next;
  }
  return current;
}

function buildAlphaFromVisionMasks(personMaskPng, foregroundMaskPng) {
  if (personMaskPng.width !== foregroundMaskPng.width || personMaskPng.height !== foregroundMaskPng.height) {
    throw new Error('Vision mask dimensions do not match');
  }
  const width = personMaskPng.width;
  const height = personMaskPng.height;
  const base = new Uint8Array(width * height);
  const alpha = Buffer.alloc(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = pixelIndex(width, x, y);
      const personValue = maskValue(personMaskPng, x, y);
      const foregroundValue = maskValue(foregroundMaskPng, x, y);
      if (personValue > 8 && foregroundValue > 8) {
        base[index] = 1;
        alpha[index] = Math.max(personValue, foregroundValue);
      }
    }
  }

  const interior = erodeMask(base, width, height, 16);
  for (let index = 0; index < alpha.length; index += 1) {
    if (interior[index]) alpha[index] = 255;
  }
  return alpha;
}

function alphaBounds(alpha, width, height, threshold = 8) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let nonzeroAlphaPixels = 0;
  let solidAlphaPixels = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = alpha[pixelIndex(width, x, y)];
      if (value > 0) nonzeroAlphaPixels += 1;
      if (value > 250) solidAlphaPixels += 1;
      if (value > threshold) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return {
    bbox: maxX >= 0 ? [minX, minY, maxX + 1, maxY + 1] : null,
    nonzeroAlphaPixels,
    solidAlphaPixels,
  };
}

function applyAlpha(sourcePng, alpha) {
  const output = new PNG({ width: sourcePng.width, height: sourcePng.height });
  sourcePng.data.copy(output.data);
  for (let y = 0; y < sourcePng.height; y += 1) {
    for (let x = 0; x < sourcePng.width; x += 1) {
      output.data[rgbaOffset(sourcePng.width, x, y) + 3] = alpha[pixelIndex(sourcePng.width, x, y)];
    }
  }
  return output;
}

function createAlphaMaskPng(alpha, width, height) {
  const output = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = alpha[pixelIndex(width, x, y)];
      const offset = rgbaOffset(width, x, y);
      output.data[offset] = value;
      output.data[offset + 1] = value;
      output.data[offset + 2] = value;
      output.data[offset + 3] = value;
    }
  }
  return output;
}

function cropPng(sourcePng, bbox, padding = 18) {
  const [x0, y0, x1, y1] = bbox;
  const left = Math.max(0, x0 - padding);
  const top = Math.max(0, y0 - padding);
  const right = Math.min(sourcePng.width, x1 + padding);
  const bottom = Math.min(sourcePng.height, y1 + padding);
  const output = new PNG({ width: right - left, height: bottom - top });
  for (let y = 0; y < output.height; y += 1) {
    for (let x = 0; x < output.width; x += 1) {
      const sourceOffset = rgbaOffset(sourcePng.width, left + x, top + y);
      const outputOffset = rgbaOffset(output.width, x, y);
      output.data[outputOffset] = sourcePng.data[sourceOffset];
      output.data[outputOffset + 1] = sourcePng.data[sourceOffset + 1];
      output.data[outputOffset + 2] = sourcePng.data[sourceOffset + 2];
      output.data[outputOffset + 3] = sourcePng.data[sourceOffset + 3];
    }
  }
  return { png: output, bboxWithPadding: [left, top, right, bottom] };
}

function createCheckerPreview(subjectPng) {
  const output = new PNG({ width: subjectPng.width, height: subjectPng.height });
  const tile = Math.max(subjectPng.width, subjectPng.height) > 2000 ? 40 : 20;
  for (let y = 0; y < subjectPng.height; y += 1) {
    for (let x = 0; x < subjectPng.width; x += 1) {
      const offset = rgbaOffset(subjectPng.width, x, y);
      const checker = ((Math.floor(x / tile) + Math.floor(y / tile)) % 2) ? 210 : 255;
      const alpha = subjectPng.data[offset + 3] / 255;
      output.data[offset] = Math.round((subjectPng.data[offset] * alpha) + (checker * (1 - alpha)));
      output.data[offset + 1] = Math.round((subjectPng.data[offset + 1] * alpha) + (checker * (1 - alpha)));
      output.data[offset + 2] = Math.round((subjectPng.data[offset + 2] * alpha) + (checker * (1 - alpha)));
      output.data[offset + 3] = 255;
    }
  }
  return output;
}

function writePng(filePath, png) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

function runSwiftVisionMasks(input, personMask, foregroundMask, options = {}) {
  const swiftPath = options.swiftPath || '/usr/bin/swift';
  const result = childProcess.spawnSync(swiftPath, ['-', input, personMask, foregroundMask], {
    input: SWIFT_PERSON_MASK_SCRIPT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 8,
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'Apple Vision person cutout failed').trim());
  }
}

function runMacPersonCutout(options = {}) {
  const input = path.resolve(String(options.input || ''));
  const output = path.resolve(String(options.output || 'person-mac-same-canvas.png'));
  const cropOutput = path.resolve(String(options.cropOutput || 'person-mac-cropped.png'));
  const mask = path.resolve(String(options.mask || 'person-mac-alpha-mask.png'));
  const checker = path.resolve(String(options.checker || 'person-mac-checker.png'));
  const report = path.resolve(String(options.report || 'person-mac-report.json'));
  const swiftPath = options.swiftPath || '/usr/bin/swift';
  assertMacPersonCutoutAvailable({ swiftPath });
  const sourcePng = ensureInputPng(input);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'person-cutout-mac-'));
  const personMaskPath = path.join(tempRoot, 'person-mask.png');
  const foregroundMaskPath = path.join(tempRoot, 'foreground-mask.png');
  try {
    runSwiftVisionMasks(input, personMaskPath, foregroundMaskPath, { swiftPath });
    const personMaskPng = PNG.sync.read(fs.readFileSync(personMaskPath));
    const foregroundMaskPng = PNG.sync.read(fs.readFileSync(foregroundMaskPath));
    const alpha = buildAlphaFromVisionMasks(personMaskPng, foregroundMaskPng);
    const { bbox, nonzeroAlphaPixels, solidAlphaPixels } = alphaBounds(alpha, sourcePng.width, sourcePng.height);
    if (!bbox) throw new Error('Apple Vision produced an empty person mask');

    const sameCanvasPng = applyAlpha(sourcePng, alpha);
    const { png: croppedPng, bboxWithPadding } = cropPng(sameCanvasPng, bbox);
    const alphaMaskPng = createAlphaMaskPng(alpha, sourcePng.width, sourcePng.height);
    const checkerPng = createCheckerPreview(croppedPng);

    writePng(output, sameCanvasPng);
    writePng(cropOutput, croppedPng);
    writePng(mask, alphaMaskPng);
    writePng(checker, checkerPng);
    writeJson(report, {
      generated_at: new Date().toISOString(),
      mode: 'macos-vision-person-cutout',
      transparency_method: 'macos_vision_person_segmentation',
      toolchain: {
        platform: process.platform,
        swift: swiftPath,
        vision_requests: [
          'VNGeneratePersonSegmentationRequest',
          'VNGenerateForegroundInstanceMaskRequest',
        ],
      },
      input,
      output,
      crop_output: cropOutput,
      mask,
      checker,
      source_dimensions: [sourcePng.width, sourcePng.height],
      alpha_bbox_xyxy: bbox,
      padded_alpha_bbox_xyxy: bboxWithPadding,
      cropped_dimensions: [croppedPng.width, croppedPng.height],
      alpha_min: 0,
      alpha_max: 255,
      nonzero_alpha_pixels: nonzeroAlphaPixels,
      solid_alpha_pixels: solidAlphaPixels,
      known_limitations: [
        'macOS Vision person segmentation may exclude held phones, accessories, or non-human props.',
        'Pixels hidden by flattened poster waves, text, light streaks, or overlays cannot be recovered from the source image.',
      ],
    });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  return { output, cropOutput, mask, checker, report };
}

module.exports = {
  MAC_PERSON_CUTOUT_UNAVAILABLE,
  assertMacPersonCutoutAvailable,
  buildAlphaFromVisionMasks,
  runMacPersonCutout,
};
