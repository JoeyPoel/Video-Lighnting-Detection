import type { StrikeDetection, StrikeInterval, VideoMetadata } from '../types.ts';
import { calculateStrikeIntervals } from './intervalMerger.ts';

export interface AnalysisProgress {
  currentFrame: number;
  totalFrames: number;
  progressPercent: number;
  currentTime: number;
  currentStrikesCount: number;
}

/**
 * Analyzes an HTML5 video element for lightning strikes using canvas luminance differential scanning.
 *
 * @param video - Loaded HTMLVideoElement with src attached.
 * @param options - Analysis parameters (stepFps, sensitivity, bufferSeconds).
 * @param onProgress - Optional callback for live progress updates.
 * @returns Object with metadata, detected strike timestamps, and buffered intervals.
 */
export const analyzeVideoForLightning = async (
  video: HTMLVideoElement,
  options: {
    sampleFps?: number;
    sensitivity?: number; // 0.1 to 1.0
    bufferSeconds?: number;
  } = {},
  onProgress?: (progress: AnalysisProgress) => void
): Promise<{
  metadata: VideoMetadata;
  detections: StrikeDetection[];
  intervals: StrikeInterval[];
}> => {
  const duration = video.duration || 0;
  if (duration <= 0) {
    throw new Error('Video duration must be greater than 0.');
  }

  const sampleFps = options.sampleFps ?? 15;
  const sensitivity = options.sensitivity ?? 0.35;
  const bufferSeconds = options.bufferSeconds ?? 1.0;

  const width = video.videoWidth || 640;
  const height = video.videoHeight || 360;

  // Offscreen canvas for downsampled image processing (fast 160x90 thumbnail resolution)
  const canvas = document.createElement('canvas');
  const downWidth = 160;
  const downHeight = 90;
  canvas.width = downWidth;
  canvas.height = downHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (!ctx) {
    throw new Error('Canvas 2D context not available.');
  }

  const totalSteps = Math.floor(duration * sampleFps);
  const detections: StrikeDetection[] = [];

  let prevMeanBrightness = 0;
  const brightnessHistory: number[] = [];

  // Helper to seek video and wait for 'seeked' event
  const seekTo = (time: number): Promise<void> =>
    new Promise((resolve) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        resolve();
      };
      video.addEventListener('seeked', onSeeked);
      video.currentTime = Math.min(time, duration - 0.01);
    });

  for (let i = 0; i < totalSteps; i++) {
    const currentTime = i / sampleFps;
    await seekTo(currentTime);

    ctx.drawImage(video, 0, 0, downWidth, downHeight);
    const frameData = ctx.getImageData(0, 0, downWidth, downHeight);
    const data = frameData.data;

    let totalLum = 0;
    let maxLum = 0;
    const pixelCount = downWidth * downHeight;

    for (let p = 0; p < data.length; p += 4) {
      // Rec. 709 luminance
      const lum = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
      totalLum += lum;
      if (lum > maxLum) {
        maxLum = lum;
      }
    }

    const meanBrightness = totalLum / pixelCount;
    brightnessHistory.push(meanBrightness);

    // Compute baseline rolling average of preceding frames
    const windowStart = Math.max(0, brightnessHistory.length - 8);
    const recentBaseline =
      brightnessHistory.slice(windowStart, -1).reduce((acc, v) => acc + v, 0) /
        Math.max(1, brightnessHistory.length - 1 - windowStart) || meanBrightness;

    const delta = meanBrightness - prevMeanBrightness;
    const peakContrast = maxLum - meanBrightness;

    // Detection condition: sudden upward spike in brightness or sharp white bolt contrast
    const thresholdDelta = 25 * (1.1 - sensitivity);
    const thresholdPeak = 120 * (1.1 - sensitivity);

    const isSpike = delta > thresholdDelta && meanBrightness > recentBaseline * 1.25;
    const isBrightBolt = maxLum > 230 && peakContrast > thresholdPeak;

    if (isSpike || isBrightBolt) {
      const confidence = Math.min(
        1.0,
        Math.max(0.2, (delta / 80) * 0.5 + (peakContrast / 180) * 0.5)
      );
      detections.push({
        timestamp: Math.round(currentTime * 100) / 100,
        confidence: Math.round(confidence * 100) / 100,
        frameIndex: i,
      });
    }

    prevMeanBrightness = meanBrightness;

    if (onProgress && i % 3 === 0) {
      onProgress({
        currentFrame: i,
        totalFrames: totalSteps,
        progressPercent: Math.round((i / totalSteps) * 100),
        currentTime,
        currentStrikesCount: detections.length,
      });
    }
  }

  const strikeTimestamps = detections.map((d) => d.timestamp);
  const intervals = calculateStrikeIntervals(strikeTimestamps, duration, bufferSeconds);

  return {
    metadata: {
      name: video.title || 'Input Video',
      duration: Math.round(duration * 100) / 100,
      fps: sampleFps,
      width,
      height,
    },
    detections,
    intervals,
  };
};

