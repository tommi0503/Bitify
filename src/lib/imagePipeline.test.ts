import { describe, expect, it } from "vitest";
import { correctEdgeColors, amplifyAlpha, processPixelBuffer, smartBinarizeAlpha, thresholdAlpha } from "./imagePipeline";
import type { PixelBuffer } from "../types";

function makeBuffer(width: number, height: number, values: number[]): PixelBuffer {
  return {
    width,
    height,
    data: new Uint8ClampedArray(values),
  };
}

describe("image pipeline", () => {
  it("amplifies low alpha values with the stacking formula", () => {
    const source = makeBuffer(1, 1, [10, 20, 30, 64]);
    const next = amplifyAlpha(source, 8);

    expect(next.data[3]).toBeGreaterThan(source.data[3]);
    expect(next.data[3]).toBe(230);
  });

  it("thresholds every pixel to binary alpha", () => {
    const source = makeBuffer(2, 1, [1, 2, 3, 127, 4, 5, 6, 128]);
    const next = thresholdAlpha(source, 128);

    expect(Array.from(next.data)).toEqual([1, 2, 3, 0, 4, 5, 6, 255]);
  });

  it("keeps medium-alpha border pixels by lowering the seed threshold", () => {
    const source = makeBuffer(2, 1, [120, 120, 120, 96, 120, 120, 120, 50]);
    const next = smartBinarizeAlpha(source, {
      alphaThreshold: 128,
      recoveryStrength: 8,
      preserveSize: true,
    });

    expect(next.data[3]).toBe(255);
    expect(next.data[7]).toBe(0);
  });

  it("recovers bridge pixels without turning one-sided halo into opaque pixels", () => {
    const source = makeBuffer(3, 3, [
      0, 0, 0, 200,   120, 120, 120, 80,  0, 0, 0, 0,
      120, 120, 120, 80,  120, 120, 120, 90,  120, 120, 120, 80,
      0, 0, 0, 0,  120, 120, 120, 80,  0, 0, 0, 200,
    ]);

    const next = smartBinarizeAlpha(source, {
      alphaThreshold: 128,
      recoveryStrength: 8,
      preserveSize: true,
    });

    expect(next.data[3]).toBe(255);
    expect(next.data[15]).toBe(0);
    expect(next.data[19]).toBe(255);
    expect(next.data[23]).toBe(0);
    expect(next.data[35]).toBe(255);
  });

  it("preserves opaque edge colors instead of averaging nearby shapes", () => {
    const original = makeBuffer(3, 1, [0, 120, 255, 255, 128, 128, 128, 255, 0, 0, 0, 0]);
    const thresholded = makeBuffer(3, 1, [0, 120, 255, 255, 128, 128, 128, 255, 0, 0, 0, 0]);
    const next = correctEdgeColors(original, thresholded, 128);

    expect(Array.from(next.data.slice(0, 4))).toEqual([0, 120, 255, 255]);
    expect(Array.from(next.data.slice(4, 8))).toEqual([128, 128, 128, 255]);
  });

  it("chooses the closest similar source color for recovered semi-transparent pixels", () => {
    const original = makeBuffer(3, 1, [0, 120, 255, 255, 140, 140, 140, 100, 128, 128, 128, 255]);
    const thresholded = makeBuffer(3, 1, [0, 120, 255, 255, 140, 140, 140, 255, 128, 128, 128, 255]);
    const next = correctEdgeColors(original, thresholded, 128);

    expect(Array.from(next.data.slice(4, 8))).toEqual([128, 128, 128, 255]);
  });

  it("keeps output alpha strictly binary after the full pipeline", () => {
    const source = makeBuffer(2, 2, [
      12, 18, 22, 20,
      120, 180, 255, 110,
      120, 180, 255, 180,
      255, 255, 255, 255,
    ]);
    const next = processPixelBuffer(source, {
      alphaThreshold: 128,
      recoveryStrength: 8,
      preserveSize: true,
    });

    const alphas = [next.data[3], next.data[7], next.data[11], next.data[15]];
    expect(new Set(alphas)).toEqual(new Set([0, 255]));
  });
});
