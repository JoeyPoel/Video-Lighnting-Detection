import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import type { ExtractedClip, StrikeInterval } from '../types.ts';

/**
 * Returns the best supported video MIME type and file extension for MediaRecorder fallback.
 * Strictly pairs the extension with the true container format to avoid Windows parser errors.
 */
export const getSupportedVideoMimeType = (): { mimeType: string; extension: string } => {
  const candidates: Array<{ mimeType: string; extension: string }> = [
    { mimeType: 'video/mp4;codecs=avc1.42E01E', extension: 'mp4' },
    { mimeType: 'video/mp4;codecs=avc1.4D401E', extension: 'mp4' },
    { mimeType: 'video/mp4;codecs=avc1', extension: 'mp4' },
    { mimeType: 'video/mp4', extension: 'mp4' },
    { mimeType: 'video/webm;codecs=vp9', extension: 'webm' },
    { mimeType: 'video/webm;codecs=vp8', extension: 'webm' },
    { mimeType: 'video/webm;codecs=h264', extension: 'webm' },
    { mimeType: 'video/webm', extension: 'webm' },
  ];

  for (const { mimeType, extension } of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mimeType)) {
      return { mimeType, extension };
    }
  }

  return { mimeType: 'video/webm', extension: 'webm' };
};

/**
 * Detects maximum hardware playback acceleration rate supported by the browser.
 * Chromium allows up to 16.0x, Firefox/Safari allow up to 8.0x.
 */
export const getMaxPlaybackRate = (): number => {
  if (typeof document === 'undefined') return 16.0;
  try {
    const testVideo = document.createElement('video');
    testVideo.playbackRate = 16.0;
    return testVideo.playbackRate === 16.0 ? 16.0 : 8.0;
  } catch {
    return 8.0;
  }
};

/**
 * Ensures video metadata is completely loaded and returns native video dimensions.
 * Clamps dimensions to even numbers as required by H.264 macroblocks.
 */
export const ensureVideoDimensions = async (
  video: HTMLVideoElement
): Promise<{ width: number; height: number }> => {
  if (video.videoWidth > 0 && video.videoHeight > 0) {
    const rawW = video.videoWidth;
    const rawH = video.videoHeight;
    return {
      width: rawW % 2 === 0 ? rawW : rawW - 1,
      height: rawH % 2 === 0 ? rawH : rawH - 1,
    };
  }

  await new Promise<void>((resolve) => {
    const onMeta = () => {
      video.removeEventListener('loadedmetadata', onMeta);
      resolve();
    };
    video.addEventListener('loadedmetadata', onMeta);
    setTimeout(resolve, 800);
  });

  const rawW = video.videoWidth || 1920;
  const rawH = video.videoHeight || 1080;
  return {
    width: rawW % 2 === 0 ? rawW : rawW - 1,
    height: rawH % 2 === 0 ? rawH : rawH - 1,
  };
};

/**
 * Calculates optimal high-fidelity bitrate within H.264 compliant profile limits.
 * Avoids exceeding Windows Media Foundation hardware decoder limits.
 */
export const getHighFidelityBitrate = (width: number, height: number): number => {
  const pixels = width * height;
  // 4K UHD (3840x2160 = ~8.3M px) -> 35 Mbps (within level 5.1 safe bounds)
  if (pixels >= 3840 * 2160 * 0.8) return 35_000_000;
  // 1440p QHD (2560x1440 = ~3.7M px) -> 24 Mbps
  if (pixels >= 2560 * 1440 * 0.8) return 24_000_000;
  // 1080p FHD (1920x1080 = ~2.1M px) -> 16 Mbps (flawless visually, compliant with WMP)
  if (pixels >= 1920 * 1080 * 0.8) return 16_000_000;
  // 720p HD (1280x720 = ~0.9M px) -> 8 Mbps
  if (pixels >= 1280 * 720 * 0.8) return 8_000_000;
  // Fallback high quality
  return Math.min(16_000_000, Math.max(4_000_000, Math.round(pixels * 30 * 0.25)));
};

/**
 * Checks whether WebCodecs VideoEncoder is available and supports H.264 encoding.
 */
export const checkWebCodecsAvcSupport = async (
  width: number,
  height: number,
  bitrate: number
): Promise<string | null> => {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    return null;
  }

  // Preferred H.264 codec identifiers for universal Windows & QuickTime compatibility
  const candidateCodecs = [
    'avc1.42001f', // Baseline profile level 3.1
    'avc1.4d002a', // Main profile level 4.2
    'avc1.640028', // High profile level 4.0
    'avc1.42e01e', // Constrained baseline profile level 3.0
  ];

  for (const codec of candidateCodecs) {
    try {
      const isSupported = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        bitrate,
        framerate: 30,
      });
      if (isSupported.supported) {
        return codec;
      }
    } catch {
      // Continue to next candidate
    }
  }

  return null;
};

/**
 * Automatically triggers an instant browser file download for a generated Blob URL.
 * Appends a hidden anchor element, triggers click(), and cleans up immediately.
 *
 * @param blobUrl - Blob object URL of the file to download.
 * @param filename - Name and extension of the file to be saved.
 */
export const triggerFileDownload = (blobUrl: string, filename: string): void => {
  if (typeof document === 'undefined') return;
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    if (document.body.contains(link)) {
      document.body.removeChild(link);
    }
  }, 200);
};

/**
 * Helper to reliably seek video to a timestamp and await the seeked event.
 * Includes proximity check and safety timeout to guarantee resolution.
 *
 * @param video - HTMLVideoElement to seek.
 * @param time - Target timestamp in seconds.
 */
export const seekTo = (video: HTMLVideoElement, time: number): Promise<void> =>
  new Promise((resolve) => {
    const targetTime = Math.max(0, time);
    // If the video is already at this position, resolve immediately
    if (Math.abs(video.currentTime - targetTime) < 0.03) {
      resolve();
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout>;
    const onSeeked = () => {
      clearTimeout(timeoutId);
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };

    // Failsafe timeout in case seeked doesn't fire
    timeoutId = setTimeout(() => {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    }, 1500);

    video.addEventListener('seeked', onSeeked);
    video.currentTime = targetTime;
  });

/**
 * Slices a video interval into a pristine, universal FastStart MP4 using WebCodecs and mp4-muxer.
 * Uses 16x hardware playback acceleration and requestVideoFrameCallback to complete in under 1 second.
 */
const sliceWithWebCodecs = async (
  video: HTMLVideoElement,
  interval: StrikeInterval,
  index: number,
  codec: string,
  width: number,
  height: number,
  targetBitrate: number,
  onProgress?: (percent: number) => void
): Promise<ExtractedClip> => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas context not available.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: 'avc',
      width,
      height,
    },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  let encoderError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      muxer.addVideoChunk(chunk, meta);
    },
    error: (e) => {
      encoderError = e instanceof Error ? e : new Error(String(e));
    },
  });

  const fps = 30;
  const frameDurationMicros = 1_000_000 / fps;

  encoder.configure({
    codec,
    width,
    height,
    bitrate: targetBitrate,
    framerate: fps,
  });

  const startTime = interval.start;
  const endTime = interval.end;
  const totalDuration = Math.max(0.1, endTime - startTime);

  await seekTo(video, startTime);
  ctx.drawImage(video, 0, 0, width, height);

  const originalMuted = video.muted;
  const originalPlaybackRate = video.playbackRate;
  const acceleration = getMaxPlaybackRate();

  video.muted = true;
  video.playbackRate = acceleration;

  let frameIndex = 0;
  let isDone = false;

  const cleanup = () => {
    video.pause();
    video.muted = originalMuted;
    video.playbackRate = originalPlaybackRate;
  };

  return new Promise<ExtractedClip>((resolve, reject) => {
    let animId: number | null = null;
    let rvfcId: number | null = null;

    const cancelPendingFrame = () => {
      if (animId !== null) {
        cancelAnimationFrame(animId);
        animId = null;
      }
      const videoAny = video as unknown as { cancelVideoFrameCallback?: (id: number) => void };
      if (rvfcId !== null && typeof videoAny.cancelVideoFrameCallback === 'function') {
        videoAny.cancelVideoFrameCallback(rvfcId);
        rvfcId = null;
      }
    };

    const processFrame = async () => {
      if (encoderError) {
        cancelPendingFrame();
        cleanup();
        reject(encoderError);
        return;
      }

      if (video.currentTime >= endTime || video.ended || isDone) {
        cancelPendingFrame();
        cleanup();
        isDone = true;

        try {
          await encoder.flush();
          muxer.finalize();
          const buffer = muxer.target.buffer;
          const blob = new Blob([buffer], { type: 'video/mp4' });
          const blobUrl = URL.createObjectURL(blob);
          const filename = `lightning_clip_${String(index).padStart(2, '0')}_${interval.start.toFixed(1)}s_to_${interval.end.toFixed(1)}s.mp4`;

          resolve({
            id: interval.id,
            interval,
            blobUrl,
            filename,
            sizeBytes: blob.size,
          });
        } catch (err) {
          reject(err);
        }
        return;
      }

      ctx.drawImage(video, 0, 0, width, height);

      const timestampMicros = Math.round(frameIndex * frameDurationMicros);
      const isKeyFrame = frameIndex % fps === 0;

      try {
        const videoFrame = new VideoFrame(canvas, { timestamp: timestampMicros });
        encoder.encode(videoFrame, { keyFrame: isKeyFrame });
        videoFrame.close();
        frameIndex++;

        if (onProgress) {
          const currentOffset = Math.max(0, video.currentTime - startTime);
          const percent = Math.min(100, Math.round((currentOffset / totalDuration) * 100));
          onProgress(percent);
        }
      } catch (err) {
        cancelPendingFrame();
        cleanup();
        reject(err);
        return;
      }

      const videoAny = video as unknown as { requestVideoFrameCallback?: (cb: () => void) => number };
      if (typeof videoAny.requestVideoFrameCallback === 'function') {
        rvfcId = videoAny.requestVideoFrameCallback(processFrame);
      } else {
        animId = requestAnimationFrame(processFrame);
      }
    };

    video.play().then(() => {
      const videoAny = video as unknown as { requestVideoFrameCallback?: (cb: () => void) => number };
      if (typeof videoAny.requestVideoFrameCallback === 'function') {
        rvfcId = videoAny.requestVideoFrameCallback(processFrame);
      } else {
        animId = requestAnimationFrame(processFrame);
      }
    }).catch((err) => {
      cleanup();
      reject(err);
    });
  });
};

/**
 * Fallback slicing using native MediaRecorder with 4x hardware playback acceleration.
 */
const sliceWithMediaRecorder = async (
  video: HTMLVideoElement,
  interval: StrikeInterval,
  index: number,
  width: number,
  height: number,
  targetBitrate: number,
  onProgress?: (percent: number) => void
): Promise<ExtractedClip> => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas context not available.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const { mimeType: selectedMime, extension } = getSupportedVideoMimeType();
  const stream = canvas.captureStream(30);

  const recorder = new MediaRecorder(stream, {
    mimeType: selectedMime,
    videoBitsPerSecond: targetBitrate,
  });

  const recordedChunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };

  const filename = `lightning_clip_${String(index).padStart(2, '0')}_${interval.start.toFixed(1)}s_to_${interval.end.toFixed(1)}s.${extension}`;

  const originalMuted = video.muted;
  const originalPlaybackRate = video.playbackRate;
  const acceleration = Math.min(4.0, getMaxPlaybackRate());

  const cleanup = () => {
    video.pause();
    video.muted = originalMuted;
    video.playbackRate = originalPlaybackRate;
  };

  return new Promise<ExtractedClip>((resolve, reject) => {
    recorder.onstop = () => {
      cleanup();
      const blob = new Blob(recordedChunks, { type: selectedMime });
      const blobUrl = URL.createObjectURL(blob);
      resolve({
        id: interval.id,
        interval,
        blobUrl,
        filename,
        sizeBytes: blob.size,
      });
    };

    recorder.onerror = (e) => {
      cleanup();
      reject(e);
    };

    seekTo(video, interval.start)
      .then(() => {
        ctx.drawImage(video, 0, 0, width, height);
        recorder.start();

        const startTime = interval.start;
        const endTime = interval.end;
        const totalDuration = Math.max(0.1, endTime - startTime);

        video.muted = true;
        video.playbackRate = acceleration;

        let animationFrameId: number;

        const drawFrame = () => {
          if (video.currentTime >= endTime || video.paused || video.ended) {
            cancelAnimationFrame(animationFrameId);
            cleanup();
            if (recorder.state === 'recording') {
              recorder.stop();
            }
            return;
          }

          ctx.drawImage(video, 0, 0, width, height);

          if (onProgress) {
            const currentOffset = Math.max(0, video.currentTime - startTime);
            const progress = Math.min(100, Math.round((currentOffset / totalDuration) * 100));
            onProgress(progress);
          }

          animationFrameId = requestAnimationFrame(drawFrame);
        };

        video.play().then(() => {
          drawFrame();
        }).catch((err) => {
          recorder.stop();
          cleanup();
          reject(err);
        });
      })
      .catch((err) => {
        cleanup();
        reject(err);
      });
  });
};

/**
 * Extracts a specific time interval from a video element into a downloadable video clip.
 * Prioritizes standard H.264 FastStart MP4 via WebCodecs to prevent 0x8000FFFF playback errors.
 *
 * @param video - Source HTMLVideoElement.
 * @param interval - StrikeInterval specifying start, end, and duration.
 * @param index - Index number of this clip (1-based).
 * @param onProgress - Optional progress callback.
 * @returns ExtractedClip containing blobUrl and metadata.
 */
export const sliceVideoInterval = async (
  video: HTMLVideoElement,
  interval: StrikeInterval,
  index: number,
  onProgress?: (percent: number) => void
): Promise<ExtractedClip> => {
  const { width, height } = await ensureVideoDimensions(video);
  const targetBitrate = getHighFidelityBitrate(width, height);

  const supportedCodec = await checkWebCodecsAvcSupport(width, height, targetBitrate);
  if (supportedCodec) {
    try {
      return await sliceWithWebCodecs(
        video,
        interval,
        index,
        supportedCodec,
        width,
        height,
        targetBitrate,
        onProgress
      );
    } catch (err) {
      console.warn('WebCodecs MP4 slicing failed, falling back to MediaRecorder:', err);
    }
  }

  return sliceWithMediaRecorder(video, interval, index, width, height, targetBitrate, onProgress);
};

export interface MontageProgress {
  currentIntervalIndex: number;
  totalIntervals: number;
  overallPercent: number;
}

/**
 * Continuous montage rendering using WebCodecs and mp4-muxer.
 * Uses 16x hardware playback acceleration to stitch all clips in under 1 second.
 */
const createMontageWithWebCodecs = async (
  video: HTMLVideoElement,
  intervals: StrikeInterval[],
  codec: string,
  width: number,
  height: number,
  targetBitrate: number,
  onProgress?: (prog: MontageProgress) => void
): Promise<ExtractedClip> => {
  const sortedIntervals = [...intervals].sort((a, b) => a.start - b.start);
  const totalMontageDuration = sortedIntervals.reduce(
    (acc, inv) => acc + Math.max(0.1, inv.end - inv.start),
    0
  );

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas context not available.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: 'avc',
      width,
      height,
    },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  let encoderError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      muxer.addVideoChunk(chunk, meta);
    },
    error: (e) => {
      encoderError = e instanceof Error ? e : new Error(String(e));
    },
  });

  const fps = 30;
  const frameDurationMicros = 1_000_000 / fps;

  encoder.configure({
    codec,
    width,
    height,
    bitrate: targetBitrate,
    framerate: fps,
  });

  const originalMuted = video.muted;
  const originalPlaybackRate = video.playbackRate;
  const acceleration = getMaxPlaybackRate();

  video.muted = true;
  video.playbackRate = acceleration;

  const cleanup = () => {
    video.pause();
    video.muted = originalMuted;
    video.playbackRate = originalPlaybackRate;
  };

  let globalFrameIndex = 0;
  let accumulatedRecordedSeconds = 0;

  try {
    for (let currentIntervalIdx = 0; currentIntervalIdx < sortedIntervals.length; currentIntervalIdx++) {
      if (encoderError) throw encoderError;

      const inv = sortedIntervals[currentIntervalIdx];
      const invDuration = Math.max(0.1, inv.end - inv.start);

      // Seek video to start of current strike interval
      await seekTo(video, inv.start);
      ctx.drawImage(video, 0, 0, width, height);

      video.playbackRate = acceleration;
      try {
        await video.play();
      } catch {
        // Continue even if auto-play warns
      }

      // Record frames until current interval reaches its end
      await new Promise<void>((resolveInterval, rejectInterval) => {
        let isIntervalDone = false;
        let animId: number | null = null;
        let rvfcId: number | null = null;

        const cancelFrame = () => {
          if (animId !== null) {
            cancelAnimationFrame(animId);
            animId = null;
          }
          const videoAny = video as unknown as { cancelVideoFrameCallback?: (id: number) => void };
          if (rvfcId !== null && typeof videoAny.cancelVideoFrameCallback === 'function') {
            videoAny.cancelVideoFrameCallback(rvfcId);
            rvfcId = null;
          }
        };

        const finishInterval = () => {
          if (isIntervalDone) return;
          isIntervalDone = true;
          cancelFrame();
          video.pause();
          accumulatedRecordedSeconds += invDuration;
          resolveInterval();
        };

        const onFrame = () => {
          if (isIntervalDone) return;

          if (encoderError) {
            isIntervalDone = true;
            cancelFrame();
            video.pause();
            rejectInterval(encoderError);
            return;
          }

          if (video.currentTime >= inv.end || video.ended) {
            finishInterval();
            return;
          }

          ctx.drawImage(video, 0, 0, width, height);

          const timestampMicros = Math.round(globalFrameIndex * frameDurationMicros);
          const isKeyFrame = globalFrameIndex % fps === 0;

          try {
            const videoFrame = new VideoFrame(canvas, { timestamp: timestampMicros });
            encoder.encode(videoFrame, { keyFrame: isKeyFrame });
            videoFrame.close();
            globalFrameIndex++;
          } catch (err) {
            isIntervalDone = true;
            cancelFrame();
            video.pause();
            rejectInterval(err);
            return;
          }

          if (onProgress) {
            const currentClipOffset = Math.max(0, video.currentTime - inv.start);
            const totalElapsed = accumulatedRecordedSeconds + currentClipOffset;
            const overallPercent = Math.min(100, Math.round((totalElapsed / totalMontageDuration) * 100));
            onProgress({
              currentIntervalIndex: currentIntervalIdx + 1,
              totalIntervals: sortedIntervals.length,
              overallPercent,
            });
          }

          const videoAny = video as unknown as { requestVideoFrameCallback?: (cb: () => void) => number };
          if (typeof videoAny.requestVideoFrameCallback === 'function') {
            rvfcId = videoAny.requestVideoFrameCallback(onFrame);
          } else {
            animId = requestAnimationFrame(onFrame);
          }
        };

        const videoAny = video as unknown as { requestVideoFrameCallback?: (cb: () => void) => number };
        if (typeof videoAny.requestVideoFrameCallback === 'function') {
          rvfcId = videoAny.requestVideoFrameCallback(onFrame);
        } else {
          animId = requestAnimationFrame(onFrame);
        }
      });
    }

    cleanup();
    await encoder.flush();
    muxer.finalize();

    const buffer = muxer.target.buffer;
    const blob = new Blob([buffer], { type: 'video/mp4' });
    const blobUrl = URL.createObjectURL(blob);
    const filename = `lightning_montage_${sortedIntervals.length}_strikes_${totalMontageDuration.toFixed(1)}s.mp4`;

    return {
      id: 'lightning-montage-all-strikes',
      interval: {
        id: 'montage-all',
        start: 0,
        end: totalMontageDuration,
        duration: totalMontageDuration,
        strikeTimestamps: sortedIntervals.flatMap((inv) => inv.strikeTimestamps),
      },
      blobUrl,
      filename,
      sizeBytes: blob.size,
    };
  } catch (err) {
    cleanup();
    throw err;
  }
};

/**
 * Fallback montage rendering using native MediaRecorder with 4x hardware playback acceleration.
 */
const createMontageWithMediaRecorder = async (
  video: HTMLVideoElement,
  intervals: StrikeInterval[],
  width: number,
  height: number,
  targetBitrate: number,
  onProgress?: (prog: MontageProgress) => void
): Promise<ExtractedClip> => {
  const sortedIntervals = [...intervals].sort((a, b) => a.start - b.start);
  const totalMontageDuration = sortedIntervals.reduce(
    (acc, inv) => acc + Math.max(0.1, inv.end - inv.start),
    0
  );

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas context not available.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const { mimeType: selectedMime, extension } = getSupportedVideoMimeType();
  const stream = canvas.captureStream(30);

  const recorder = new MediaRecorder(stream, {
    mimeType: selectedMime,
    videoBitsPerSecond: targetBitrate,
  });

  const recordedChunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };

  const filename = `lightning_montage_${sortedIntervals.length}_strikes_${totalMontageDuration.toFixed(1)}s.${extension}`;

  const originalMuted = video.muted;
  const originalPlaybackRate = video.playbackRate;
  const acceleration = Math.min(4.0, getMaxPlaybackRate());

  const cleanup = () => {
    video.pause();
    video.muted = originalMuted;
    video.playbackRate = originalPlaybackRate;
  };

  return new Promise<ExtractedClip>((resolve, reject) => {
    recorder.onstop = () => {
      cleanup();
      const blob = new Blob(recordedChunks, { type: selectedMime });
      const blobUrl = URL.createObjectURL(blob);
      resolve({
        id: 'lightning-montage-all-strikes',
        interval: {
          id: 'montage-all',
          start: 0,
          end: totalMontageDuration,
          duration: totalMontageDuration,
          strikeTimestamps: sortedIntervals.flatMap((inv) => inv.strikeTimestamps),
        },
        blobUrl,
        filename,
        sizeBytes: blob.size,
      });
    };

    recorder.onerror = (e) => {
      cleanup();
      reject(e);
    };

    video.muted = true;
    video.playbackRate = acceleration;

    (async () => {
      try {
        let accumulatedRecordedSeconds = 0;

        for (let currentIntervalIdx = 0; currentIntervalIdx < sortedIntervals.length; currentIntervalIdx++) {
          const inv = sortedIntervals[currentIntervalIdx];
          const invDuration = Math.max(0.1, inv.end - inv.start);

          await seekTo(video, inv.start);
          ctx.drawImage(video, 0, 0, width, height);

          if (recorder.state === 'inactive') {
            recorder.start();
          }

          video.playbackRate = acceleration;
          try {
            await video.play();
          } catch {
            // Continue even if auto-play warns
          }

          await new Promise<void>((resolveInterval) => {
            let isIntervalDone = false;
            let animId: number | null = null;

            const finishInterval = () => {
              if (isIntervalDone) return;
              isIntervalDone = true;
              if (animId !== null) cancelAnimationFrame(animId);
              video.pause();
              accumulatedRecordedSeconds += invDuration;
              resolveInterval();
            };

            const onFrame = () => {
              if (isIntervalDone) return;

              if (video.currentTime >= inv.end || video.ended) {
                finishInterval();
                return;
              }

              ctx.drawImage(video, 0, 0, width, height);

              if (onProgress) {
                const currentClipOffset = Math.max(0, video.currentTime - inv.start);
                const totalElapsed = accumulatedRecordedSeconds + currentClipOffset;
                const overallPercent = Math.min(100, Math.round((totalElapsed / totalMontageDuration) * 100));
                onProgress({
                  currentIntervalIndex: currentIntervalIdx + 1,
                  totalIntervals: sortedIntervals.length,
                  overallPercent,
                });
              }

              animId = requestAnimationFrame(onFrame);
            };

            animId = requestAnimationFrame(onFrame);
          });
        }

        cleanup();
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      } catch (err) {
        cleanup();
        if (recorder.state === 'recording') {
          recorder.stop();
        }
        reject(err);
      }
    })();
  });
};

/**
 * Stitches all detected strike intervals back-to-back into a single continuous montage video.
 * Prioritizes standard H.264 FastStart MP4 via WebCodecs to prevent 0x8000FFFF playback errors.
 *
 * @param video - Source HTMLVideoElement.
 * @param intervals - Array of StrikeIntervals to stitch.
 * @param onProgress - Callback reporting current interval and overall progress percentage.
 * @returns ExtractedClip containing the unified montage video blob.
 */
export const createLightningMontage = async (
  video: HTMLVideoElement,
  intervals: StrikeInterval[],
  onProgress?: (prog: MontageProgress) => void
): Promise<ExtractedClip> => {
  if (!intervals.length) {
    throw new Error('No strike intervals provided for montage.');
  }

  const { width, height } = await ensureVideoDimensions(video);
  const targetBitrate = getHighFidelityBitrate(width, height);

  const supportedCodec = await checkWebCodecsAvcSupport(width, height, targetBitrate);
  if (supportedCodec) {
    try {
      return await createMontageWithWebCodecs(
        video,
        intervals,
        supportedCodec,
        width,
        height,
        targetBitrate,
        onProgress
      );
    } catch (err) {
      console.warn('WebCodecs montage failed, falling back to MediaRecorder:', err);
    }
  }

  return createMontageWithMediaRecorder(video, intervals, width, height, targetBitrate, onProgress);
};
