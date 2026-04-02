import { encodeBmpBinaryAlpha } from "./bmpEncoder";
import type { PixelBuffer } from "../types";

export function buildHorizontalTileBuffer(buffers: PixelBuffer[]): PixelBuffer {
  if (buffers.length === 0) {
    throw new Error("At least one buffer is required to build a tile sheet.");
  }

  const width = buffers.reduce((sum, buffer) => sum + buffer.width, 0);
  const height = buffers.reduce((max, buffer) => Math.max(max, buffer.height), 0);
  const data = new Uint8ClampedArray(width * height * 4);

  let xOffset = 0;

  for (const buffer of buffers) {
    const yOffset = Math.floor((height - buffer.height) / 2);

    for (let y = 0; y < buffer.height; y += 1) {
      for (let x = 0; x < buffer.width; x += 1) {
        const sourceOffset = (y * buffer.width + x) * 4;
        const targetOffset = ((y + yOffset) * width + (x + xOffset)) * 4;

        data[targetOffset + 0] = buffer.data[sourceOffset + 0];
        data[targetOffset + 1] = buffer.data[sourceOffset + 1];
        data[targetOffset + 2] = buffer.data[sourceOffset + 2];
        data[targetOffset + 3] = buffer.data[sourceOffset + 3];
      }
    }

    xOffset += buffer.width;
  }

  return { width, height, data };
}

export function encodeHorizontalTileBmp(buffers: PixelBuffer[]): Blob {
  return encodeBmpBinaryAlpha(buildHorizontalTileBuffer(buffers));
}
