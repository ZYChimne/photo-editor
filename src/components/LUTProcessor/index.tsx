import { useEffect, useRef, useState } from "preact/hooks";
import "./index.css";

interface LUTData {
  size: number;
  data: Uint8Array;
}

interface ImageState {
  src: string | null;
  data: ImageData | null;
}

interface ProcessingState {
  isProcessing: boolean;
  progress: number;
  hasResult: boolean;
}

export default function LUTProcessor() {
  // Merged state management
  const [image, setImage] = useState<ImageState>({ src: null, data: null });
  const [lut, setLut] = useState<LUTData | null>(null);
  const [processing, setProcessing] = useState<ProcessingState>({
    isProcessing: false,
    progress: 0,
    hasResult: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker>();

  // Worker initialization
  useEffect(() => {
    const worker = new Worker(
      new URL("../../workers/lutWorker.ts", import.meta.url)
    );

    worker.onmessage = (e) => {
      switch (e.data.type) {
        case "progress":
          setProcessing((prev) => ({ ...prev, progress: e.data.value }));
          break;
        case "result":
          drawResult(e.data.imageData);
          setProcessing((prev) => ({
            ...prev,
            isProcessing: false,
            hasResult: true,
          }));
          break;
        case "error":
          setProcessing((prev) => ({ ...prev, isProcessing: false }));
          setError(e.data.message);
          break;
      }
    };

    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  // File handlers
  const handleFile = async <T,>(
    file: File | undefined,
    processor: (file: File) => Promise<T>,
    errorMessage: string
  ) => {
    if (!file) return;

    try {
      setError(null);
      return await processor(file);
    } catch (err) {
      setError(errorMessage);
      return null;
    }
  };

  // Image processing
  const processImage = async (file: File) => {
    const img = await loadImage(file);
    setImage({
      src: URL.createObjectURL(file),
      data: getImageData(img),
    });
  };

  // LUT processing
  const processLUT = async (file: File) => {
    setLut(await parseCubeFile(file));
  };

  // Start processing
  const startProcessing = () => {
    if (!image.data || !lut) return;

    setProcessing((prev) => ({ ...prev, isProcessing: true }));
    workerRef.current?.postMessage({
      type: "start",
      imageData: image.data,
      lutData: lut.data,
      lutSize: lut.size,
    });
  };

  // Canvas operations
  const drawResult = (imageData: ImageData) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = imageData.width;
    canvas.height = imageData.height;
    canvas.getContext("2d")?.putImageData(imageData, 0, 0);
  };

  return (
    <div className="processor">
      <div className="controls">
        <FileInput
          label="Upload Image:"
          accept="image/*"
          onChange={(e) =>
            handleFile(
              (e.target as any).files?.[0],
              processImage,
              "Failed to load image"
            )
          }
        />

        <FileInput
          label="Upload LUT (.cube):"
          accept=".cube"
          onChange={(e) =>
            handleFile(
              (e.target as any).files?.[0],
              processLUT,
              "Invalid LUT file format"
            )
          }
        />

        <button
          onClick={startProcessing}
          disabled={!image.data || !lut || processing.isProcessing}
        >
          {processing.isProcessing ? "Processing..." : "Apply LUT"}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      <ProgressIndicator progress={processing.progress} />

      {image.src && (
        <PreviewContainer
          width={image.data?.width}
          height={image.data?.height}
          onHover={setShowOriginal}
        >
          <canvas ref={canvasRef} className="preview" />
          {(showOriginal || !processing.hasResult) && (
            <img className="origin" src={image.src} />
          )}
        </PreviewContainer>
      )}
    </div>
  );
}

// Sub-components
const FileInput = ({
  label,
  accept,
  onChange,
}: {
  label: string;
  accept: string;
  onChange: (e: Event) => void;
}) => (
  <div>
    <label>
      {label}
      <input type="file" accept={accept} onChange={onChange} />
    </label>
  </div>
);

const ProgressIndicator = ({ progress }: { progress: number }) => (
  <div className="progress">
    <div className="progress-bar" style={{ width: `${progress}%` }} />
    <div className="progress-text">{progress}%</div>
  </div>
);

const PreviewContainer = ({
  children,
  width,
  height,
  onHover,
}: {
  children: preact.ComponentChildren;
  width?: number;
  height?: number;
  onHover: (show: boolean) => void;
}) => (
  <div
    className="preview-container"
    style={{ width: `${width}px`, height: `${height}px` }}
    onPointerOver={() => onHover(true)}
    onPointerLeave={() => onHover(false)}
  >
    {children}
  </div>
);

// Utility functions
async function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function getImageData(img: HTMLImageElement): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, img.width, img.height);
}

async function parseCubeFile(file: File): Promise<LUTData> {
  const text = await file.text();
  const sizeMatch = text.match(/LUT_3D_SIZE (\d+)/);
  if (!sizeMatch) throw new Error("Invalid LUT file");

  return {
    size: parseInt(sizeMatch[1]),
    data: new Uint8Array(
      text
        .split("\n")
        .filter((line) => /^\d/.test(line))
        .flatMap((line) => line.trim().split(/\s+/).map(Number))
        .map((v) => Math.round(v * 255))
    ),
  };
}
