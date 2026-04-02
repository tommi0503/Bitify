import { describe, expect, it } from "vitest";
import { buildHorizontalTileBuffer } from "./tileSheet";
import type { PixelBuffer } from "../types";

function makeBuffer(width: number, height: number, values: number[]): PixelBuffer {
  return {
    width,
    height,
    data: new Uint8ClampedArray(values),
  };
}

describe("tile sheet", () => {
  it("stitches buffers horizontally and centers shorter tiles vertically", () => {
    const left = makeBuffer(1, 1, [255, 0, 0, 255]);
    const right = makeBuffer(2, 3, [
      0, 255, 0, 255,
      0, 0, 255, 255,
      10, 20, 30, 255,
      40, 50, 60, 255,
      70, 80, 90, 255,
      100, 110, 120, 255,
    ]);

    const sheet = buildHorizontalTileBuffer([left, right]);

    expect(sheet.width).toBe(3);
    expect(sheet.height).toBe(3);
    expect(Array.from(sheet.data.slice(0, 4))).toEqual([0, 0, 0, 0]);
    expect(Array.from(sheet.data.slice(4, 12))).toEqual([0, 255, 0, 255, 0, 0, 255, 255]);
    expect(Array.from(sheet.data.slice(12, 16))).toEqual([255, 0, 0, 255]);
  });
});
