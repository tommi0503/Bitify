import type { PixelBuffer } from "../types";

const FILE_HEADER_SIZE = 14;
const DIB_HEADER_SIZE = 124;
const PIXEL_OFFSET = FILE_HEADER_SIZE + DIB_HEADER_SIZE;
const BYTES_PER_PIXEL = 4;
const BI_BITFIELDS = 3;
const LCS_SRGB = 0x73524742;

function setBitmapFileHeader(view: DataView, fileSize: number): void {
  view.setUint8(0, 0x42);
  view.setUint8(1, 0x4d);
  view.setUint32(2, fileSize, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 0, true);
  view.setUint32(10, PIXEL_OFFSET, true);
}

function setBitmapV5Header(view: DataView, buffer: PixelBuffer): void {
  const imageSize = buffer.width * buffer.height * BYTES_PER_PIXEL;
  const dibOffset = FILE_HEADER_SIZE;

  view.setUint32(dibOffset + 0, DIB_HEADER_SIZE, true);
  view.setInt32(dibOffset + 4, buffer.width, true);
  view.setInt32(dibOffset + 8, buffer.height, true);
  view.setUint16(dibOffset + 12, 1, true);
  view.setUint16(dibOffset + 14, 32, true);
  view.setUint32(dibOffset + 16, BI_BITFIELDS, true);
  view.setUint32(dibOffset + 20, imageSize, true);
  view.setInt32(dibOffset + 24, 2835, true);
  view.setInt32(dibOffset + 28, 2835, true);
  view.setUint32(dibOffset + 32, 0, true);
  view.setUint32(dibOffset + 36, 0, true);
  view.setUint32(dibOffset + 40, 0x00ff0000, true);
  view.setUint32(dibOffset + 44, 0x0000ff00, true);
  view.setUint32(dibOffset + 48, 0x000000ff, true);
  view.setUint32(dibOffset + 52, 0xff000000, true);
  view.setUint32(dibOffset + 56, LCS_SRGB, true);
  view.setUint32(dibOffset + 108, 4, true);
  view.setUint32(dibOffset + 112, 0, true);
  view.setUint32(dibOffset + 116, 0, true);
  view.setUint32(dibOffset + 120, 0, true);
}

export function encodeBmpBinaryAlpha(buffer: PixelBuffer): Blob {
  const imageSize = buffer.width * buffer.height * BYTES_PER_PIXEL;
  const fileSize = PIXEL_OFFSET + imageSize;
  const raw = new ArrayBuffer(fileSize);
  const view = new DataView(raw);
  const bytes = new Uint8Array(raw);

  setBitmapFileHeader(view, fileSize);
  setBitmapV5Header(view, buffer);

  let writeOffset = PIXEL_OFFSET;

  for (let y = buffer.height - 1; y >= 0; y -= 1) {
    for (let x = 0; x < buffer.width; x += 1) {
      const sourceOffset = (y * buffer.width + x) * 4;
      bytes[writeOffset + 0] = buffer.data[sourceOffset + 2];
      bytes[writeOffset + 1] = buffer.data[sourceOffset + 1];
      bytes[writeOffset + 2] = buffer.data[sourceOffset + 0];
      bytes[writeOffset + 3] = buffer.data[sourceOffset + 3] >= 128 ? 255 : 0;
      writeOffset += 4;
    }
  }

  return new Blob([raw], { type: "image/bmp" });
}

export const bmpHeaderConstants = {
  FILE_HEADER_SIZE,
  DIB_HEADER_SIZE,
  PIXEL_OFFSET,
  BYTES_PER_PIXEL,
};
