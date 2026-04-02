import { encodeBmpBinaryAlpha } from "./bmpEncoder";
import type { ConversionOptions, ConvertedAsset, PixelBuffer } from "../types";

const OPAQUE_SEARCH_RADIUS = 2;
const TRANSPARENT_FILL_RADIUS = 3;
const COLOR_SIMILARITY_MAX_DISTANCE = 12288;
const MIN_CANDIDATE_ALPHA = 24;
const RECOVERY_THRESHOLD_STEP = 5;
const BRIDGE_CANDIDATE_MARGIN = 18;
const BRIDGE_PASSES = 2;

const BRIDGE_DIRECTIONS = [
  [[-1, 0], [1, 0]],
  [[0, -1], [0, 1]],
  [[-1, -1], [1, 1]],
  [[1, -1], [-1, 1]],
] as const;

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export const defaultOptions: ConversionOptions = {
  alphaThreshold: 128,
  recoveryStrength: 8,
};

function clonePixelBuffer(buffer: PixelBuffer): PixelBuffer {
  return {
    width: buffer.width,
    height: buffer.height,
    data: new Uint8ClampedArray(buffer.data),
  };
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function getCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("2D canvas context could not be created.");
  }

  return context;
}

function pixelIndex(x: number, y: number, width: number): number {
  return (y * width + x) * 4;
}

function readRgb(buffer: PixelBuffer, offset: number): RgbColor {
  return {
    r: buffer.data[offset + 0],
    g: buffer.data[offset + 1],
    b: buffer.data[offset + 2],
  };
}

function writeRgb(target: Uint8ClampedArray, offset: number, color: RgbColor): void {
  target[offset + 0] = color.r;
  target[offset + 1] = color.g;
  target[offset + 2] = color.b;
}

function colorDistanceSquared(left: RgbColor, right: RgbColor): number {
  const red = left.r - right.r;
  const green = left.g - right.g;
  const blue = left.b - right.b;
  return red * red + green * green + blue * blue;
}

function isWithinBounds(buffer: PixelBuffer, x: number, y: number): boolean {
  return x >= 0 && x < buffer.width && y >= 0 && y < buffer.height;
}

function isOpaqueAt(maskAlpha: Uint8ClampedArray, width: number, x: number, y: number): boolean {
  return maskAlpha[(y * width + x) * 4 + 3] === 255;
}

function getSeedThreshold(options: ConversionOptions): number {
  return Math.max(
    MIN_CANDIDATE_ALPHA,
    options.alphaThreshold - options.recoveryStrength * RECOVERY_THRESHOLD_STEP,
  );
}

function isSimilarOpaqueNeighbor(
  source: PixelBuffer,
  maskAlpha: Uint8ClampedArray,
  x: number,
  y: number,
  referenceColor: RgbColor,
): boolean {
  if (!isWithinBounds(source, x, y) || !isOpaqueAt(maskAlpha, source.width, x, y)) {
    return false;
  }

  const offset = pixelIndex(x, y, source.width);
  return colorDistanceSquared(referenceColor, readRgb(source, offset)) <= COLOR_SIMILARITY_MAX_DISTANCE;
}

function countSimilarOpaqueNeighbors(
  source: PixelBuffer,
  maskAlpha: Uint8ClampedArray,
  x: number,
  y: number,
  referenceColor: RgbColor,
): number {
  let count = 0;

  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }

      if (isSimilarOpaqueNeighbor(source, maskAlpha, x + dx, y + dy, referenceColor)) {
        count += 1;
      }
    }
  }

  return count;
}

function hasBridgeSupport(
  source: PixelBuffer,
  maskAlpha: Uint8ClampedArray,
  x: number,
  y: number,
  referenceColor: RgbColor,
): boolean {
  for (const [[ax, ay], [bx, by]] of BRIDGE_DIRECTIONS) {
    const hasLeft = isSimilarOpaqueNeighbor(source, maskAlpha, x + ax, y + ay, referenceColor);
    const hasRight = isSimilarOpaqueNeighbor(source, maskAlpha, x + bx, y + by, referenceColor);

    if (hasLeft && hasRight) {
      return true;
    }
  }

  return false;
}

function findBestOpaqueColor(
  source: PixelBuffer,
  x: number,
  y: number,
  alphaThreshold: number,
  referenceColor?: RgbColor,
  maxRadius = OPAQUE_SEARCH_RADIUS,
): RgbColor | null {
  let bestScore = -1;
  let bestColor: RgbColor | null = null;

  for (let dy = -maxRadius; dy <= maxRadius; dy += 1) {
    for (let dx = -maxRadius; dx <= maxRadius; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }

      const nextX = x + dx;
      const nextY = y + dy;

      if (!isWithinBounds(source, nextX, nextY)) {
        continue;
      }

      const offset = pixelIndex(nextX, nextY, source.width);
      const alpha = source.data[offset + 3];

      if (alpha < alphaThreshold) {
        continue;
      }

      const candidateColor = readRgb(source, offset);
      const distanceSquared = dx * dx + dy * dy;
      const distanceWeight = 1 / (1 + distanceSquared);
      const similarityWeight = referenceColor
        ? 1 / (1 + colorDistanceSquared(referenceColor, candidateColor) / 4096)
        : 1;
      const score = (alpha / 255) * distanceWeight * similarityWeight;

      if (score > bestScore) {
        bestScore = score;
        bestColor = candidateColor;
      }
    }
  }

  return bestColor;
}

export function smartBinarizeAlpha(
  source: PixelBuffer,
  options: ConversionOptions,
): PixelBuffer {
  const next = clonePixelBuffer(source);
  const seedThreshold = getSeedThreshold(options);
  const candidateFloor = Math.max(MIN_CANDIDATE_ALPHA, seedThreshold - BRIDGE_CANDIDATE_MARGIN);
  const supportFloor = Math.max(seedThreshold, candidateFloor + 12);

  for (let index = 0; index < next.data.length; index += 4) {
    next.data[index + 3] = source.data[index + 3] >= seedThreshold ? 255 : 0;
  }

  for (let pass = 0; pass < BRIDGE_PASSES; pass += 1) {
    const snapshot = new Uint8ClampedArray(next.data);
    let changed = false;

    for (let y = 0; y < source.height; y += 1) {
      for (let x = 0; x < source.width; x += 1) {
        const offset = pixelIndex(x, y, source.width);

        if (snapshot[offset + 3] === 255) {
          continue;
        }

        const sourceAlpha = source.data[offset + 3];
        if (sourceAlpha < candidateFloor) {
          continue;
        }

        const sourceColor = readRgb(source, offset);
        const similarNeighbors = countSimilarOpaqueNeighbors(source, snapshot, x, y, sourceColor);
        const shouldRecover =
          hasBridgeSupport(source, snapshot, x, y, sourceColor) ||
          (sourceAlpha >= supportFloor && similarNeighbors >= 3);

        if (shouldRecover) {
          next.data[offset + 3] = 255;
          changed = true;
        }
      }
    }

    if (!changed) {
      break;
    }
  }

  return next;
}

function hasTransparentNeighbor(buffer: PixelBuffer, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }

      const nextX = x + dx;
      const nextY = y + dy;

      if (!isWithinBounds(buffer, nextX, nextY)) {
        return true;
      }

      const offset = pixelIndex(nextX, nextY, buffer.width);
      if (buffer.data[offset + 3] === 0) {
        return true;
      }
    }
  }

  return false;
}

export function correctEdgeColors(
  source: PixelBuffer,
  thresholded: PixelBuffer,
  alphaThreshold: number,
): PixelBuffer {
  const next = clonePixelBuffer(thresholded);

  for (let y = 0; y < next.height; y += 1) {
    for (let x = 0; x < next.width; x += 1) {
      const offset = pixelIndex(x, y, next.width);
      const sourceAlpha = source.data[offset + 3];
      const sourceColor = readRgb(source, offset);

      if (next.data[offset + 3] === 0) {
        const hiddenColor = findBestOpaqueColor(
          source,
          x,
          y,
          alphaThreshold,
          sourceAlpha > 0 ? sourceColor : undefined,
          TRANSPARENT_FILL_RADIUS,
        );

        if (hiddenColor) {
          writeRgb(next.data, offset, hiddenColor);
        }

        continue;
      }

      if (!hasTransparentNeighbor(next, x, y)) {
        continue;
      }

      if (sourceAlpha >= alphaThreshold) {
        writeRgb(next.data, offset, sourceColor);
        continue;
      }

      const replacement = findBestOpaqueColor(source, x, y, alphaThreshold, sourceColor);
      writeRgb(next.data, offset, replacement ?? sourceColor);
    }
  }

  return next;
}

export function processPixelBuffer(
  source: PixelBuffer,
  options: ConversionOptions,
): PixelBuffer {
  const thresholded = smartBinarizeAlpha(source, options);
  return correctEdgeColors(source, thresholded, getSeedThreshold(options));
}

export function pixelBufferToImageData(buffer: PixelBuffer): ImageData {
  return new ImageData(new Uint8ClampedArray(buffer.data), buffer.width, buffer.height);
}

export function createPreviewUrl(buffer: PixelBuffer): string {
  const canvas = createCanvas(buffer.width, buffer.height);
  const context = getCanvasContext(canvas);
  context.putImageData(pixelBufferToImageData(buffer), 0, 0);
  return canvas.toDataURL("image/png");
}

async function decodeFileToPixelBuffer(file: File): Promise<PixelBuffer> {
  if ("createImageBitmap" in window) {
    const bitmap = await createImageBitmap(file);

    try {
      const canvas = createCanvas(bitmap.width, bitmap.height);
      const context = getCanvasContext(canvas);
      context.drawImage(bitmap, 0, 0);
      const imageData = context.getImageData(0, 0, bitmap.width, bitmap.height);
      return {
        width: imageData.width,
        height: imageData.height,
        data: new Uint8ClampedArray(imageData.data),
      };
    } finally {
      bitmap.close();
    }
  }

  const url = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error(`Failed to decode ${file.name}.`));
      nextImage.src = url;
    });
    const canvas = createCanvas(image.width, image.height);
    const context = getCanvasContext(canvas);
    context.drawImage(image, 0, 0);
    const imageData = context.getImageData(0, 0, image.width, image.height);
    return {
      width: imageData.width,
      height: imageData.height,
      data: new Uint8ClampedArray(imageData.data),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function convertPngFile(
  file: File,
  options: ConversionOptions,
): Promise<ConvertedAsset> {
  const source = await decodeFileToPixelBuffer(file);
  const processed = processPixelBuffer(source, options);
  const bmpBlob = encodeBmpBinaryAlpha(processed);
  const originalPreviewUrl = URL.createObjectURL(file);

  return {
    sourceFile: file,
    outputFileName: file.name.replace(/\.png$/i, ".bmp"),
    bmpBlob,
    previewUrl: createPreviewUrl(processed),
    originalPreviewUrl,
    width: processed.width,
    height: processed.height,
    processedBuffer: processed,
  };
}

export function revokeConvertedAsset(asset: ConvertedAsset): void {
  URL.revokeObjectURL(asset.originalPreviewUrl);
}
