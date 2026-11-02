import type { StrikeDetection, StrikeInterval, VideoMetadata } from '../types.ts';
import { calculateStrikeIntervals } from './intervalMerger.ts';
import { runYoloDetectionOnFrame } from './yoloDetector.ts';

export interface AnalysisProgress {
  currentFrame: number;
  totalFrames: number;
  progressPercent: number;
  currentTime: number;
  currentStrikesCount: number;
  fpsSpeed: number;
}

export interface FrameStats {
  meanBrightness: number;
  maxLum: number;
  brightPixelCount: number;
  brightCenterX: number;
  brightCenterY: number;
  maxQuadLum?: number; // Maximum luminance across the 4 quadrants
}

/**
 * High-speed quadrant-aware luminance extraction on downsampled 96x54 canvas.
 * Divides frame into 4 spatial quadrants to detect localized lightning strikes
 * that global frame averaging washes out.
 */
export const calculateFrameStats = (
  data: Uint8ClampedArray,
  width: number,
  height: number
): FrameStats => {
  let totalLum = 0;
  let maxLum = 0;
  let brightPixelCount = 0;
  let brightSumX = 0;
  let brightSumY = 0;
  const pixelCount = width * height;

  const halfW = width >> 1;
  const halfH = height >> 1;
  let qTL = 0, qTR = 0, qBL = 0, qBR = 0;
  const quadPixelCount = (halfW * halfH) || 1;

  for (let i = 0; i < data.length; i += 4) {
    // Fast Rec. 709 integer weights
    const lum = (data[i] * 54 + data[i + 1] * 183 + data[i + 2] * 19) >> 8;
    totalLum += lum;
    if (lum > maxLum) {
      maxLum = lum;
    }

    const pixelIdx = i >> 2;
    const x = pixelIdx % width;
    const y = Math.floor(pixelIdx / width);

    // Accumulate quadrant luminance
    if (y < halfH) {
      if (x < halfW) qTL += lum;
      else qTR += lum;
    } else {
      if (x < halfW) qBL += lum;
      else qBR += lum;
    }

    // High-luminance threshold for bolt channel tracking (lowered to 140 for distant/rain strikes)
    if (lum > 140) {
      brightPixelCount++;
      brightSumX += x;
      brightSumY += y;
    }
  }

  const meanBrightness = totalLum / Math.max(1, pixelCount);
  const maxQuadLum = Math.max(
    qTL / quadPixelCount,
    qTR / quadPixelCount,
    qBL / quadPixelCount,
    qBR / quadPixelCount
  );

  const brightCenterX = brightPixelCount > 0 ? brightSumX / brightPixelCount : -1;
  const brightCenterY = brightPixelCount > 0 ? brightSumY / brightPixelCount : -1;

  return {
    meanBrightness,
    maxLum,
    brightPixelCount,
    brightCenterX,
    brightCenterY,
    maxQuadLum,
  };
};

/**
 * Intelligent Multi-Pathway Lightning Detector.
 * Rejects streetlights and headlights while catching:
 * 1. Localized quadrant flashes (bolts striking in a corner of dark sky)
 * 2. Full atmospheric sky bursts
 * 3. Channel peak ionization spikes (sharp white fork contrast)
 */
export class LightningTemporalDetector {
  private ambientBaseline: number[] = [];
  private prevBrightness: number | null = null;
  private prevQuadLum: number | null = null;
  private prevBrightCount: number | null = null;
  private prevMaxLum: number | null = null;
  private staticTrack = { x: -1, y: -1, frames: 0 };
  public readonly sensitivity: number;

  constructor(sensitivity = 0.5) {
    this.sensitivity = Math.max(0.1, Math.min(0.95, sensitivity));
  }

  public processFrame(stats: FrameStats): { isStrike: boolean; confidence: number } {
    const { meanBrightness, maxLum, brightPixelCount, brightCenterX, brightCenterY } = stats;
    // Default maxQuadLum to meanBrightness if not provided (e.g. in basic tests)
    const maxQuadLum = typeof stats.maxQuadLum === 'number' ? stats.maxQuadLum : meanBrightness;

    if (this.prevBrightness === null || this.prevBrightCount === null || this.prevMaxLum === null || this.prevQuadLum === null) {
      this.prevBrightness = meanBrightness;
      this.prevQuadLum = maxQuadLum;
      this.prevBrightCount = brightPixelCount;
      this.prevMaxLum = maxLum;
      this.ambientBaseline.push(meanBrightness);
      if (brightCenterX >= 0 && brightCenterY >= 0) {
        this.staticTrack = { x: brightCenterX, y: brightCenterY, frames: 1 };
      }
      return { isStrike: false, confidence: 0 };
    }

    // Baseline computed strictly over quiet ambient frames
    const baseline =
      this.ambientBaseline.reduce((sum, val) => sum + val, 0) / Math.max(1, this.ambientBaseline.length);

    // Streetlight tracking: static bright fixture staying at the same coordinates
    let isStaticLight = false;
    if (brightCenterX >= 0 && brightCenterY >= 0) {
      const dx = Math.abs(brightCenterX - this.staticTrack.x);
      const dy = Math.abs(brightCenterY - this.staticTrack.y);
      if (dx < 3.5 && dy < 3.5) {
        this.staticTrack.frames++;
        if (this.staticTrack.frames >= 3) {
          isStaticLight = true;
        }
      } else {
        this.staticTrack = { x: brightCenterX, y: brightCenterY, frames: 1 };
      }
    } else {
      this.staticTrack = { x: -1, y: -1, frames: 0 };
    }

    // Dynamic thresholds based on sensitivity (higher sensitivity = lower threshold)
    const sensFactor = 1.0 - this.sensitivity * 0.72;
    const minDelta = Math.max(3.0, 6.0 * sensFactor);
    const delta = meanBrightness - this.prevBrightness;
    const deltaAboveBaseline = meanBrightness - baseline;

    // Pathway 1: Global Atmospheric Flash (e.g. sheet lightning or full sky illumination)
    const isGlobalFlash =
      delta >= minDelta &&
      deltaAboveBaseline >= minDelta * 0.45;

    // Pathway 2: Localized Quadrant Flash (catches corner/horizon strikes in dark sky)
    const quadDelta = maxQuadLum - this.prevQuadLum;
    const isQuadFlash = quadDelta >= Math.max(5.0, 9.5 * sensFactor);

    // Pathway 3: Channel Ionization (maxLum spike + bright pixel surge)
    const deltaMaxLum = maxLum - this.prevMaxLum;
    const deltaBrightPixels = brightPixelCount - this.prevBrightCount;

    // If there is an active surge in pixels or luminance, it is NOT a static fixture!
    const hasActiveSurge = deltaBrightPixels >= 6 || deltaMaxLum >= 24 || quadDelta >= 7.0;
    const isBoltChannel =
      (!isStaticLight || hasActiveSurge) &&
      (deltaMaxLum >= Math.max(16, Math.round(28 * sensFactor)) || deltaBrightPixels >= Math.max(3, Math.round(7 * sensFactor))) &&
      maxLum >= 95;

    const isStrike = isGlobalFlash || isQuadFlash || isBoltChannel;

    let confidence = 0;
    if (isStrike) {
      const flashScore = Math.min(1.0, Math.max(0, delta) / 30.0);
      const quadScore = Math.min(1.0, Math.max(0, quadDelta) / 40.0);
      const peakScore = Math.min(1.0, Math.max(0, deltaMaxLum) / 80.0);
      confidence = Math.max(0.45, Math.min(1.0, flashScore * 0.35 + quadScore * 0.35 + peakScore * 0.3 + 0.25));
    } else {
      // Only record quiet frames into ambient baseline so return strokes aren't suppressed
      this.ambientBaseline.push(meanBrightness);
      if (this.ambientBaseline.length > 20) {
        this.ambientBaseline.shift();
      }
    }

    this.prevBrightness = meanBrightness;
    this.prevQuadLum = maxQuadLum;
    this.prevBrightCount = brightPixelCount;
    this.prevMaxLum = maxLum;

    return { isStrike, confidence };
  }
}

export interface AnalysisOptions {
  /** Legacy sensitivity parameter (0.1 to 0.95) */
  sensitivity?: number;
  /** YOLO11 Model Confidence Threshold (0.15 to 0.85, default 0.40) */
  modelConfidence?: number;
  /** Video event buffer in seconds (default 2.0s) */
  bufferSeconds?: number;
  /** Sampling frame rate during analysis (default 15 FPS) */
  sampleFps?: number;
  /** Whether to use pure YOLO object detection (default true) */
  useYolo?: boolean;
  /** Backwards compatibility alias for modelConfidence */
  yoloConfidence?: number;
}

/**
 * Ultra-Fast Hardware-Accelerated Video Lightning Analyzer with Optional YOLO11 Neural Verification.
 * Features 25 FPS precision sampling with quadrant detection and stable progress reporting.
 */
export const analyzeVideoForLightning = async (
  sourceVideo: HTMLVideoElement,
  options: AnalysisOptions = {},
  onProgress?: (
    progress: AnalysisProgress,
    liveDetections?: StrikeDetection[]
  ) => void
): Promise<{
  metadata: VideoMetadata;
  detections: StrikeDetection[];
  intervals: StrikeInterval[];
}> => {
  let duration = sourceVideo.duration;
  if (!duration || isNaN(duration) || duration <= 0) {
    await new Promise<void>((resolve) => {
      if (sourceVideo.readyState >= 1 && sourceVideo.duration > 0) {
        resolve();
        return;
      }
      const onMeta = () => {
        sourceVideo.removeEventListener('loadedmetadata', onMeta);
        resolve();
      };
      sourceVideo.addEventListener('loadedmetadata', onMeta);
      setTimeout(resolve, 800);
    });
    duration = sourceVideo.duration || 0;
  }

  if (duration <= 0) {
    duration = 5.0;
  }

  const sensitivity = options.sensitivity ?? 0.5;
  const bufferSeconds = options.bufferSeconds ?? 2.0; // Default 2.0s buffer
  const sampleFps = options.sampleFps ?? 15; // 15 FPS sampling: high temporal precision, fast scan
  const useYolo = options.useYolo ?? true; // Enable in-browser YOLO neural engine by default
  const modelConfidence =
    options.modelConfidence ??
    options.yoloConfidence ??
    (options.sensitivity !== undefined ? Math.max(0.20, Math.min(0.85, 1.0 - options.sensitivity * 0.7)) : 0.40);

  let width = sourceVideo.videoWidth;
  let height = sourceVideo.videoHeight;
  if (!width || !height) {
    await new Promise<void>((resolve) => {
      if (sourceVideo.readyState >= 1 && sourceVideo.videoWidth > 0) {
        resolve();
        return;
      }
      const onMeta = () => {
        sourceVideo.removeEventListener('loadedmetadata', onMeta);
        resolve();
      };
      sourceVideo.addEventListener('loadedmetadata', onMeta);
      setTimeout(resolve, 600);
    });
    width = sourceVideo.videoWidth || 1920;
    height = sourceVideo.videoHeight || 1080;
  }

  // Ultra-fast 96x54 downsampled processing canvas
  const downWidth = 96;
  const downHeight = 54;
  const canvas = document.createElement('canvas');
  canvas.width = downWidth;
  canvas.height = downHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable.');
  }

  const detector = new LightningTemporalDetector(sensitivity);
  const detections: StrikeDetection[] = [];

  // Use the primary video element directly for reliable hardware decoding and canvas extraction
  const workerVideo = sourceVideo;
  const originalSourceTime = sourceVideo.currentTime;
  const originalPaused = sourceVideo.paused;

  const scanDuration = workerVideo.duration && !isNaN(workerVideo.duration) && workerVideo.duration > 0
    ? workerVideo.duration
    : duration;

  const stepSeconds = 1.0 / sampleFps;
  const totalSteps = Math.max(1, Math.ceil(scanDuration / stepSeconds));

  if (onProgress) {
    onProgress({
      currentFrame: 0,
      totalFrames: totalSteps,
      progressPercent: 0,
      currentTime: 0,
      currentStrikesCount: 0,
      fpsSpeed: 0,
    }, []);
  }

  const startTime = performance.now();
  let lastProgressReportTime = performance.now();

  for (let step = 0; step < totalSteps; step++) {
    const t = Math.min(step * stepSeconds, scanDuration - 0.01);

    // Reliable frame seek with standard currentTime and seeked listener
    if (Math.abs(workerVideo.currentTime - t) > 0.01) {
      await new Promise<void>((resolve) => {
        let doneCalled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const done = () => {
          if (!doneCalled) {
            doneCalled = true;
            if (timer) clearTimeout(timer);
            workerVideo.removeEventListener('seeked', done);
            resolve();
          }
        };
        timer = setTimeout(done, 120);
        workerVideo.addEventListener('seeked', done, { once: true });
        try {
          workerVideo.currentTime = t;
        } catch {
          done();
        }
      });
    }

    try {
      // 1. Extract downsampled frame stats for temporal baseline & static light suppression
      ctx.drawImage(workerVideo, 0, 0, downWidth, downHeight);
      const frameData = ctx.getImageData(0, 0, downWidth, downHeight);
      const stats = calculateFrameStats(frameData.data, downWidth, downHeight);
      const temporalRes = detector.processFrame(stats);

      let isStrike = false;
      let finalConfidence = 0;
      let bbox: [number, number, number, number] | undefined = undefined;
      let explanation: string | undefined = undefined;

      if (useYolo) {
        try {
          const yoloResult = await runYoloDetectionOnFrame(workerVideo, modelConfidence);
          if (yoloResult.boxes.length > 0) {
            const bestBox = yoloResult.boxes[0];
            isStrike = true;
            finalConfidence = Math.max(bestBox.confidence, temporalRes.confidence);
            bbox = [bestBox.x1, bestBox.y1, bestBox.x2, bestBox.y2];

            const xPct = Math.round(bestBox.x1 * 100);
            const yPct = Math.round(bestBox.y1 * 100);
            const wPct = Math.round((bestBox.x2 - bestBox.x1) * 100);
            const hPct = Math.round((bestBox.y2 - bestBox.y1) * 100);
            const confPct = Math.round(bestBox.confidence * 100);

            explanation = `YOLO11 detected lightning stroke channel (${confPct}% confidence) at [X: ${xPct}%, Y: ${yPct}%, ${wPct}×${hPct}%].`;
          } else if (temporalRes.isStrike) {
            // Flash surge detected temporally even if thin bolt was below neural confidence threshold
            isStrike = true;
            finalConfidence = temporalRes.confidence;
            explanation = `Atmospheric lightning flash surge (${Math.round(temporalRes.confidence * 100)}% delta).`;
          }
        } catch (yoloErr) {
          console.debug('YOLO inference unavailable for frame, fallback checking:', yoloErr);
          if (temporalRes.isStrike) {
            isStrike = true;
            finalConfidence = temporalRes.confidence;
            explanation = `Atmospheric lightning flash surge (${Math.round(temporalRes.confidence * 100)}% delta).`;
          }
        }
      } else {
        if (temporalRes.isStrike) {
          isStrike = true;
          finalConfidence = temporalRes.confidence;
          explanation = `Atmospheric lightning flash surge (${Math.round(temporalRes.confidence * 100)}% delta).`;
        }
      }

      if (isStrike) {
        const lastDet = detections[detections.length - 1];
        if (!lastDet || t - lastDet.timestamp >= 0.05) {
          detections.push({
            timestamp: Math.round(t * 100) / 100,
            confidence: Math.round(finalConfidence * 100) / 100,
            frameIndex: step,
            bbox,
            explanation,
          });
        }
      }
    } catch (e) {
      console.warn('Frame sample error at t =', t, e);
    }

    // Throttled UI progress report (every 90ms or on completion) to keep scanning responsive
    const now = performance.now();
    const isLastStep = step === totalSteps - 1;
    if (onProgress && (now - lastProgressReportTime > 90 || isLastStep)) {
      lastProgressReportTime = now;
      const elapsedSec = (now - startTime) / 1000;
      const fpsSpeed = Math.round((step + 1) / Math.max(0.05, elapsedSec));

      onProgress(
        {
          currentFrame: step + 1,
          totalFrames: totalSteps,
          progressPercent: Math.min(100, Math.round(((step + 1) / totalSteps) * 100)),
          currentTime: t,
          currentStrikesCount: detections.length,
          fpsSpeed,
        },
        [...detections]
      );
    }

    // Yield to browser rendering loop periodically
    if (step % 5 === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // Restore video playback state
  try {
    sourceVideo.currentTime = originalSourceTime;
    if (!originalPaused) {
      sourceVideo.play().catch(() => {});
    }
  } catch {
    // Ignore
  }

  // Calculate clean final merged intervals with ±2.0s buffer
  const strikeTimestamps = detections.map((d) => d.timestamp);
  const intervals = calculateStrikeIntervals(strikeTimestamps, scanDuration, bufferSeconds);

  return {
    metadata: {
      name: sourceVideo.title || 'Lightning Storm Footage',
      duration: Math.round(scanDuration * 100) / 100,
      fps: sampleFps,
      width,
      height,
    },
    detections,
    intervals,
  };
};
