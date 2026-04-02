import { describe, expect, it } from "vitest";
import { bmpHeaderConstants, encodeBmpBinaryAlpha } from "./bmpEncoder";

describe("bmp encoder", () => {
  it("writes a BMP header with 32-bit pixels and binary alpha", async () => {
    const blob = encodeBmpBinaryAlpha({
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([
        255, 10, 20, 255,
        5, 15, 25, 100,
      ]),
    });

    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("BM");
    expect(view.getUint32(10, true)).toBe(bmpHeaderConstants.PIXEL_OFFSET);
    expect(view.getUint32(14, true)).toBe(bmpHeaderConstants.DIB_HEADER_SIZE);
    expect(view.getUint16(28, true)).toBe(32);
    expect(view.getUint32(30, true)).toBe(3);
    expect(bytes[bmpHeaderConstants.PIXEL_OFFSET + 0]).toBe(20);
    expect(bytes[bmpHeaderConstants.PIXEL_OFFSET + 1]).toBe(10);
    expect(bytes[bmpHeaderConstants.PIXEL_OFFSET + 2]).toBe(255);
    expect(bytes[bmpHeaderConstants.PIXEL_OFFSET + 3]).toBe(255);
    expect(bytes[bmpHeaderConstants.PIXEL_OFFSET + 7]).toBe(0);
  });
});
