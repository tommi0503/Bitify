import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import JSZip from "jszip";
import { convertPngFile, defaultOptions, revokeConvertedAsset } from "./lib/imagePipeline";
import { encodeHorizontalTileBmp } from "./lib/tileSheet";
import type { ConversionOptions, ConvertedAsset, FileJob } from "./types";

function makeJobId(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getPreviewSize(width?: number, height?: number): { width: number; height: number } | null {
  if (!width || !height) {
    return null;
  }

  const maxDimension = Math.max(width, height);
  const baseScale = Math.max(1, Math.floor(288 / maxDimension));
  const scaledWidth = width * baseScale;
  const scaledHeight = height * baseScale;
  const fit = Math.min(336 / scaledWidth, 336 / scaledHeight, 1);

  return {
    width: Math.max(width, Math.round(scaledWidth * fit)),
    height: Math.max(height, Math.round(scaledHeight * fit)),
  };
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="border-b border-slate-200 px-4 py-4 text-xs font-semibold tracking-[0.18em] text-blue-600 uppercase sm:px-6">
      {children}
    </div>
  );
}

function PreviewCard({
  title,
  src,
  width,
  height,
}: {
  title: string;
  src?: string;
  width?: number;
  height?: number;
}) {
  const previewSize = getPreviewSize(width, height);
  const sizeLabel = width && height ? `${width} x ${height} px` : "";

  return (
    <section className="min-h-[26rem] border-b border-slate-200 last:border-b-0 lg:min-h-[30rem] lg:border-b-0">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-6">
        <p className="text-xs font-semibold tracking-[0.18em] text-blue-600 uppercase">{title}</p>
        <p className="text-xs text-slate-500">{sizeLabel}</p>
      </div>
      <div className="soft-checkerboard flex min-h-[22rem] items-center justify-center p-6 lg:min-h-[26rem]">
        {src ? (
          <img
            src={src}
            alt={title}
            className="block [image-rendering:pixelated]"
            style={{
              width: previewSize ? `${previewSize.width}px` : undefined,
              height: previewSize ? `${previewSize.height}px` : undefined,
            }}
          />
        ) : (
          <div className="text-sm text-slate-400">No file selected</div>
        )}
      </div>
    </section>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block px-4 py-4 sm:px-6">
      <div className="flex items-center justify-between text-sm font-medium text-slate-900">
        <span>{label}</span>
        <span className="font-semibold text-blue-600">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        className="mt-4 w-full"
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-4 px-4 py-3 sm:px-6">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-slate-900">{value}</span>
    </div>
  );
}

export default function App() {
  const [options, setOptions] = useState<ConversionOptions>(defaultOptions);
  const [jobs, setJobs] = useState<FileJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const jobsRef = useRef<FileJob[]>([]);

  jobsRef.current = jobs;

  const readyJobs = jobs.filter((job) => job.status === "ready" && job.result);
  const errorCount = jobs.filter((job) => job.status === "error").length;
  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? jobs[0];
  const fileSignature = jobs.map((job) => job.id).join("|");

  useEffect(() => {
    return () => {
      for (const job of jobsRef.current) {
        if (job.result) {
          revokeConvertedAsset(job.result);
        }
      }
    };
  }, []);

  useEffect(() => {
    if (jobs.length === 0) {
      return;
    }

    let cancelled = false;
    const sourceJobs = jobs.map((job) => ({ id: job.id, file: job.file }));
    const targetIds = new Set(sourceJobs.map((job) => job.id));

    setJobs((currentJobs) =>
      currentJobs.map((job) =>
        targetIds.has(job.id)
          ? { ...job, status: "processing", error: undefined, result: job.result }
          : job,
      ),
    );

    const run = async () => {
      for (const sourceJob of sourceJobs) {
        try {
          const result = await convertPngFile(sourceJob.file, options);

          if (cancelled) {
            revokeConvertedAsset(result);
            return;
          }

          setJobs((currentJobs) =>
            currentJobs.map((entry) => {
              if (entry.id !== sourceJob.id) {
                return entry;
              }

              if (entry.result) {
                revokeConvertedAsset(entry.result);
              }

              return { ...entry, status: "ready", error: undefined, result };
            }),
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "An error occurred while converting the file.";

          setJobs((currentJobs) =>
            currentJobs.map((entry) =>
              entry.id === sourceJob.id
                ? { ...entry, status: "error", error: message, result: undefined }
                : entry,
            ),
          );
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [fileSignature, options.alphaThreshold, options.recoveryStrength]);

  function enqueueFiles(list: FileList | File[]) {
    const files = Array.from(list).filter(
      (file) => file.type === "image/png" || /\.png$/i.test(file.name),
    );

    if (files.length === 0) {
      return;
    }

    const nextJobs = files.map<FileJob>((file) => ({
      id: makeJobId(file),
      file,
      status: "queued",
    }));

    setJobs((currentJobs) => {
      const knownIds = new Set(currentJobs.map((job) => job.id));
      const merged = [...currentJobs];

      for (const nextJob of nextJobs) {
        if (!knownIds.has(nextJob.id)) {
          merged.push(nextJob);
        }
      }

      return merged;
    });

    setSelectedJobId((current) => current ?? nextJobs[0]?.id ?? null);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) {
      enqueueFiles(event.target.files);
    }
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files.length > 0) {
      enqueueFiles(event.dataTransfer.files);
    }
  }

  function removeJob(jobId: string) {
    setJobs((currentJobs) => {
      const nextJobs = currentJobs.filter((job) => {
        if (job.id !== jobId) return true;
        if (job.result) revokeConvertedAsset(job.result);
        return false;
      });
      if (selectedJobId === jobId) {
        setSelectedJobId(nextJobs[0]?.id ?? null);
      }
      return nextJobs;
    });
  }

  async function downloadAll() {
    const assets = readyJobs
      .map((job) => job.result)
      .filter((result): result is ConvertedAsset => Boolean(result));

    if (assets.length === 0) return;

    setIsZipping(true);
    try {
      const zip = new JSZip();
      for (const asset of assets) {
        zip.file(asset.outputFileName, asset.bmpBlob);
      }
      zip.file(
        "tiles-horizontal.bmp",
        encodeHorizontalTileBmp(assets.map((asset) => asset.processedBuffer)),
      );
      const archive = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });
      downloadBlob(archive, "converted-bmp.zip");
    } finally {
      setIsZipping(false);
    }
  }

  return (
    <main className="min-h-screen bg-white pb-44 text-slate-900">
      <input
        ref={fileInputRef}
        type="file"
        accept=".png,image/png"
        multiple
        className="hidden"
        onChange={onFileChange}
      />

      <div className="mx-auto max-w-7xl border-x border-slate-200">
        <section className="grid lg:grid-cols-[22rem_minmax(0,1fr)]">
          <div className="divide-y divide-slate-200 border-b border-slate-200 lg:border-b-0">
            <section>
              <SectionLabel>Upload</SectionLabel>
              <div className="px-4 py-4 sm:px-6">
                <div
                  className={`border border-dashed px-6 py-16 text-center transition ${
                    isDragging ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-white"
                  }`}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    if (event.currentTarget === event.target) {
                      setIsDragging(false);
                    }
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={onDrop}
                >
                  <button
                    type="button"
                    className="border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Choose PNG Files
                  </button>
                </div>
              </div>
            </section>

            <section>
              <SectionLabel>Options</SectionLabel>
              <Slider
                label="Alpha Threshold"
                min={0}
                max={255}
                step={1}
                value={options.alphaThreshold}
                onChange={(alphaThreshold) =>
                  setOptions((current) => ({ ...current, alphaThreshold }))
                }
              />
              <div className="border-t border-slate-200">
                <Slider
                  label="Recovery Strength"
                  min={1}
                  max={20}
                  step={1}
                  value={options.recoveryStrength}
                  onChange={(recoveryStrength) =>
                    setOptions((current) => ({ ...current, recoveryStrength }))
                  }
                />
              </div>
            </section>
          </div>

          <div className="lg:border-l lg:border-slate-200">
            <section className="grid lg:grid-cols-2 lg:divide-x lg:divide-slate-200">
              <PreviewCard
                title="PNG"
                src={selectedJob?.result?.originalPreviewUrl}
                width={selectedJob?.result?.width}
                height={selectedJob?.result?.height}
              />
              <PreviewCard
                title="BMP"
                src={selectedJob?.result?.previewUrl}
                width={selectedJob?.result?.width}
                height={selectedJob?.result?.height}
              />
            </section>
          </div>
        </section>

        <section className="border-t border-slate-200">
          <SectionLabel>Files</SectionLabel>
          {jobs.length === 0 ? (
            <div className="px-4 py-10 text-sm text-slate-400 sm:px-6">No PNG files added</div>
          ) : (
            <div>
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className={`grid gap-3 border-b border-slate-200 px-4 py-4 sm:grid-cols-[1.4fr_1fr_auto] sm:items-center sm:px-6 ${
                    selectedJob?.id === job.id ? "bg-blue-50" : "bg-white"
                  }`}
                >
                  <button
                    type="button"
                    className="min-w-0 text-left"
                    onClick={() => setSelectedJobId(job.id)}
                  >
                    <p className="truncate text-sm font-medium text-slate-900">{job.file.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatSize(job.file.size)}</p>
                  </button>

                  <div className="text-sm text-slate-500">
                    {job.status === "queued" && "Queued"}
                    {job.status === "processing" && "Processing..."}
                    {job.status === "ready" && `${job.result?.width} x ${job.result?.height} px`}
                    {job.status === "error" && <span className="text-red-600">{job.error}</span>}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="border border-blue-600 px-3 py-2 text-xs font-medium text-blue-600 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-300"
                      disabled={!job.result}
                      onClick={() => job.result && downloadBlob(job.result.bmpBlob, job.result.outputFileName)}
                    >
                      Save BMP
                    </button>
                    <button
                      type="button"
                      className="border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                      onClick={() => removeJob(job.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white">
        <div className="border-b border-slate-200 bg-slate-50">
          <div className="mx-auto grid max-w-7xl grid-cols-3 divide-x divide-slate-200">
            <StatCell label="File Count" value={jobs.length} />
            <StatCell label="Done" value={readyJobs.length} />
            <StatCell label="Errors" value={errorCount} />
          </div>
        </div>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <p className="text-sm text-slate-500">ZIP: individual BMP files + tiles-horizontal.bmp</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300"
              disabled={readyJobs.length === 0 || isZipping}
              onClick={() => void downloadAll()}
            >
              {isZipping ? "Building ZIP..." : "Download Full ZIP"}
            </button>
            <button
              type="button"
              className="border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
              disabled={jobs.length === 0}
              onClick={() => {
                setJobs((currentJobs) => {
                  for (const job of currentJobs) {
                    if (job.result) revokeConvertedAsset(job.result);
                  }
                  return [];
                });
                setSelectedJobId(null);
              }}
            >
              Clear Jobs
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}



