import * as ort from 'onnxruntime-web';

// Point ONNX runtime WebAssembly binaries to the local public directory
ort.env.wasm.wasmPaths = '/';
ort.env.wasm.numThreads = 1;

export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  confidence: number;
}

export interface YoloDetectionResult {
  hasLightning: boolean;
  maxConfidence: number;
  boxes: BoundingBox[];
}

let sessionInstance: ort.InferenceSession | null = null;
let isLoadingSession = false;

/**
 * Loads the fine-tuned YOLO11 lightning ONNX model into memory.
 * Caches the InferenceSession singleton for zero re-load overhead.
 *
 * @param modelPath - URL/path to the ONNX model (default '/models/lightning_yolo.onnx').
 * @returns InferenceSession ready for execution.
 */
export const getYoloSession = async (
  modelPath: string = '/models/lightning_yolo.onnx'
): Promise<ort.InferenceSession> => {
  if (sessionInstance) {
    return sessionInstance;
  }

  if (isLoadingSession) {
    // Wait for in-flight initialization
    while (isLoadingSession) {
      await new Promise((r) => setTimeout(r, 50));
    }
    if (sessionInstance) return sessionInstance;
  }

  isLoadingSession = true;
  try {
    // Attempt WebGL first for hardware acceleration, falling back gracefully to WASM
    sessionInstance = await ort.InferenceSession.create(modelPath, {
      executionProviders: ['webgl', 'wasm'],
      graphOptimizationLevel: 'all',
    });
    return sessionInstance;
  } catch (err) {
    console.warn('WebGL provider failed, falling back to pure WASM execution:', err);
    sessionInstance = await ort.InferenceSession.create(modelPath, {
      executionProviders: ['wasm'],
    });
    return sessionInstance;
  } finally {
    isLoadingSession = false;
  }
};

/**
 * Pre-processes an HTMLVideoElement or HTMLCanvasElement into a normalized
 * [1, 3, 256, 256] Float32Array RGB tensor for YOLO11.
 */
const preprocessFrame = (
  source: CanvasImageSource,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D
): ort.Tensor => {
  const targetSize = 256;
  canvas.width = targetSize;
  canvas.height = targetSize;

  // Draw scaled video frame onto 256x256 buffer
  ctx.drawImage(source, 0, 0, targetSize, targetSize);
  const imgData = ctx.getImageData(0, 0, targetSize, targetSize);
  const { data } = imgData;

  const floatData = new Float32Array(3 * targetSize * targetSize);
  const area = targetSize * targetSize;

  // Convert HWC (RGBA) to CHW (RGB normalized [0.0, 1.0])
  for (let i = 0; i < area; i++) {
    const pixelOffset = i * 4;
    floatData[i] = data[pixelOffset] / 255.0; // R
    floatData[area + i] = data[pixelOffset + 1] / 255.0; // G
    floatData[2 * area + i] = data[pixelOffset + 2] / 255.0; // B
  }

  return new ort.Tensor('float32', floatData, [1, 3, targetSize, targetSize]);
};

/**
 * Non-Maximum Suppression (NMS) to eliminate overlapping candidate bounding boxes.
 */
const applyNMS = (boxes: BoundingBox[], iouThreshold: number = 0.45): BoundingBox[] => {
  const sorted = [...boxes].sort((a, b) => b.confidence - a.confidence);
  const selected: BoundingBox[] = [];

  while (sorted.length > 0) {
    const best = sorted.shift()!;
    selected.push(best);

    for (let i = sorted.length - 1; i >= 0; i--) {
      const candidate = sorted[i];

      const xA = Math.max(best.x1, candidate.x1);
      const yA = Math.max(best.y1, candidate.y1);
      const xB = Math.min(best.x2, candidate.x2);
      const yB = Math.min(best.y2, candidate.y2);

      const interW = Math.max(0, xB - xA);
      const interH = Math.max(0, yB - yA);
      const interArea = interW * interH;

      const areaA = (best.x2 - best.x1) * (best.y2 - best.y1);
      const areaB = (candidate.x2 - candidate.x1) * (candidate.y2 - candidate.y1);
      const unionArea = areaA + areaB - interArea;

      const iou = unionArea > 0 ? interArea / unionArea : 0;
      if (iou > iouThreshold) {
        sorted.splice(i, 1);
      }
    }
  }

  return selected;
};

// Reusable scratch canvas to avoid garbage collection pressure
let scratchCanvas: HTMLCanvasElement | null = null;
let scratchCtx: CanvasRenderingContext2D | null = null;

/**
 * Runs YOLO11 neural object detection on a video frame.
 *
 * @param source - HTMLVideoElement or HTMLCanvasElement containing current frame.
 * @param confThreshold - Confidence threshold for positive lightning detection (default 0.25).
 * @returns YoloDetectionResult with lightning presence flag, max confidence, and bounding boxes.
 */
export const runYoloDetectionOnFrame = async (
  source: CanvasImageSource,
  confThreshold: number = 0.25
): Promise<YoloDetectionResult> => {
  if (!scratchCanvas) {
    scratchCanvas = document.createElement('canvas');
    scratchCanvas.width = 256;
    scratchCanvas.height = 256;
    scratchCtx = scratchCanvas.getContext('2d', { willReadFrequently: true });
  }

  if (!scratchCtx) {
    throw new Error('Canvas 2D context unavailable for YOLO preprocessing.');
  }

  const session = await getYoloSession();
  const inputTensor = preprocessFrame(source, scratchCanvas, scratchCtx);

  // Execute YOLO11 inference
  const feeds: Record<string, ort.Tensor> = { images: inputTensor };
  const results = await session.run(feeds);

  // Model output shape: [1, 5, 1344]
  // Dimensions: [batch, features (cx, cy, w, h, class_conf), anchors]
  const outputTensor = results[session.outputNames[0]];
  const outputData = outputTensor.data as Float32Array;

  const numAnchors = 1344;
  const rawBoxes: BoundingBox[] = [];
  let maxConfidence = 0.0;

  for (let i = 0; i < numAnchors; i++) {
    // Stride across the 5 channels
    const cx = outputData[0 * numAnchors + i];
    const cy = outputData[1 * numAnchors + i];
    const w = outputData[2 * numAnchors + i];
    const h = outputData[3 * numAnchors + i];
    const conf = outputData[4 * numAnchors + i];

    if (conf > maxConfidence) {
      maxConfidence = conf;
    }

    if (conf >= confThreshold) {
      // Normalize coordinates [0.0, 1.0] relative to 256x256 image
      const x1 = Math.max(0.0, Math.min(1.0, (cx - w / 2.0) / 256.0));
      const y1 = Math.max(0.0, Math.min(1.0, (cy - h / 2.0) / 256.0));
      const x2 = Math.max(0.0, Math.min(1.0, (cx + w / 2.0) / 256.0));
      const y2 = Math.max(0.0, Math.min(1.0, (cy + h / 2.0) / 256.0));

      rawBoxes.push({
        x1,
        y1,
        x2,
        y2,
        confidence: Math.round(conf * 100) / 100,
      });
    }
  }

  const filteredBoxes = applyNMS(rawBoxes, 0.45);

  return {
    hasLightning: filteredBoxes.length > 0 || maxConfidence >= confThreshold,
    maxConfidence: Math.round(maxConfidence * 100) / 100,
    boxes: filteredBoxes,
  };
};

