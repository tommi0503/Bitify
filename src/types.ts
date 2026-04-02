export interface PixelBuffer {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface ConversionOptions {
  alphaThreshold: number;
  recoveryStrength: number;
}

export interface ConvertedAsset {
  sourceFile: File;
  outputFileName: string;
  bmpBlob: Blob;
  previewUrl: string;
  originalPreviewUrl: string;
  width: number;
  height: number;
  processedBuffer: PixelBuffer;
}

export interface FileJob {
  id: string;
  file: File;
  status: "queued" | "processing" | "ready" | "error";
  completedOptionsKey?: string;
  result?: ConvertedAsset;
  error?: string;
}
