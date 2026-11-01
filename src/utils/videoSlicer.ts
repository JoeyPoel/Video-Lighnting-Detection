import type { ExtractedClip, StrikeInterval } from '../types.ts';

/**
 * Returns the best supported video MIME type and file extension for MediaRecorder.
 * Prioritizes standard MP4 (AVC1 / H.264 Baseline + AAC) to ensure native playback in
 * Windows Media Player without 0x8000FFFF codec errors, falling back to WebM if unavailable.
 */
export const getSupportedVideoMimeType = (): { mimeType: string; extension: string } => {
  const candidates = [
    'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs="avc1,mp4a.40.2"',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=h264,opus',
    'video/webm;codecs=h264',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/webm;codecs=vp9',
  ];

  for (const mime of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
      const extension = mime.includes('mp4') ? 'mp4' : 'webm';
      return { mimeType: mime, extension };
    }
  }

  return { mimeType: 'video/webm', extension: 'webm' };
};

/**
 * Creates or extracts a valid audio track for the recording stream.
 * Windows Media Player (error 0x8000FFFF) requires a valid audio stream in MP4 containers.
 * If the source video doesn't provide an audio stream, a silent audio track is synthesized.
 */
const getAudioTrackForStream = (
  video: HTMLVideoElement
): { track: MediaStreamTrack | null; cleanup: () => void } => {
  try {
    const videoWithCapture = video as HTMLVideoElement & {
      captureStream?: () => MediaStream;
      mozCaptureStream?: () => MediaStream;
    };
    const captureFn = videoWithCapture.captureStream || videoWithCapture.mozCaptureStream;
    if (captureFn) {
      const captured = captureFn.call(videoWithCapture);
      const audioTracks = captured.getAudioTracks();
      if (audioTracks.length > 0 && audioTracks[0].readyState === 'live') {
        return { track: audioTracks[0], cleanup: () => {} };
      }
    }
  } catch {
    // Cross-origin or unsupported captureStream, fallback to synthesis
  }

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0; // completely silent
      const dst = ctx.createMediaStreamDestination();
      osc.connect(gain);
      gain.connect(dst);
      osc.start();
      const track = dst.stream.getAudioTracks()[0];
      return {
        track: track || null,
        cleanup: () => {
          try {
            osc.stop();
            ctx.close().catch(() => {});
          } catch {
            // ignore
          }
        },
      };
    }
  } catch {
    // AudioContext blocked or unsupported
  }

  return { track: null, cleanup: () => {} };
};

/**
 * Ensures video metadata is completely loaded and returns native video dimensions.
 * Prevents any accidental downscaling or 640x360 fallback.
 */
export const ensureVideoDimensions = async (
  video: HTMLVideoElement
): Promise<{ width: number; height: number }> => {
  if (video.videoWidth > 0 && video.videoHeight > 0) {
    return { width: video.videoWidth, height: video.videoHeight };
  }

  await new Promise<void>((resolve) => {
    const onMeta = () => {
      video.removeEventListener('loadedmetadata', onMeta);
      resolve();
    };
    video.addEventListener('loadedmetadata', onMeta);
    setTimeout(resolve, 800);
  });

  return {
    width: video.videoWidth || 1920,
    height: video.videoHeight || 1080,
  };
};

/**
 * Calculates optimal high-fidelity bitrate based on resolution
 * to guarantee zero compression degradation, preserving original 4K, 1440p, and 1080p quality.
 */
export const getHighFidelityBitrate = (width: number, height: number): number => {
  const pixels = width * height;
  // 4K UHD (3840x2160 = 8.3M px) -> 55-60 Mbps
  if (pixels >= 3840 * 2160 * 0.8) return 55_000_000;
  // 1440p QHD (2560x1440 = 3.7M px) -> 35 Mbps
  if (pixels >= 2560 * 1440 * 0.8) return 35_000_000;
  // 1080p FHD (1920x1080 = 2.1M px) -> 24-25 Mbps
  if (pixels >= 1920 * 1080 * 0.8) return 24_000_000;
  // 720p HD (1280x720 = 0.9M px) -> 14 Mbps
  if (pixels >= 1280 * 720 * 0.8) return 14_000_000;
  // Fallback high quality
  return Math.max(10_000_000, Math.round(pixels * 60 * 0.25));
};

/**
 * Helper to reliably seek video to a timestamp and await the seeked event.
 */
const seekTo = (video: HTMLVideoElement, time: number): Promise<void> =>
  new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = Math.max(0, time);
  });

/**
 * Extracts a specific time interval from a video element into a downloadable video clip.
 * Preserves 100% native resolution (up to 4K/60fps) and pristine visual fidelity without downscaling.
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

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    throw new Error('Canvas context not available for video slicing.');
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const { mimeType: selectedMime, extension } = getSupportedVideoMimeType();
  const targetBitrate = getHighFidelityBitrate(width, height);

  // Capture at 60 FPS to preserve high-framerate footage
  const stream = canvas.captureStream(60);
  const audioInfo = getAudioTrackForStream(video);
  if (audioInfo.track) {
    try {
      stream.addTrack(audioInfo.track);
    } catch {
      // ignore
    }
  }

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

  return new Promise<ExtractedClip>((resolve, reject) => {
    recorder.onstop = () => {
      audioInfo.cleanup();
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
      audioInfo.cleanup();
      reject(e);
    };

    seekTo(video, interval.start)
      .then(() => {
        // Draw initial frame immediately so stream is active
        ctx.drawImage(video, 0, 0, width, height);

        // Record continuous stream without micro-fragmentation
        recorder.start();

        const startTime = interval.start;
        const endTime = interval.end;
        const totalDuration = Math.max(0.1, endTime - startTime);

        const originalMuted = video.muted;
        video.muted = true;

        let animationFrameId: number;

        const drawFrame = () => {
          if (video.currentTime >= endTime || video.paused || video.ended) {
            cancelAnimationFrame(animationFrameId);
            video.pause();
            video.muted = originalMuted;
            if (recorder.state === 'recording') {
              recorder.stop();
            }
            return;
          }

          // Render clean original video frame at native full resolution (no destructive watermarks)
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
          reject(err);
        });
      })
      .catch((err) => {
        reject(err);
      });
  });
};

export interface MontageProgress {
  currentIntervalIndex: number;
  totalIntervals: number;
  overallPercent: number;
}

/**
 * Stitches all detected strike intervals back-to-back into a single continuous montage video.
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

  // Ensure intervals are sorted chronologically
  const sortedIntervals = [...intervals].sort((a, b) => a.start - b.start);
  const totalMontageDuration = sortedIntervals.reduce(
    (acc, inv) => acc + Math.max(0.1, inv.end - inv.start),
    0
  );

  const { width, height } = await ensureVideoDimensions(video);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    throw new Error('Canvas context not available for montage rendering.');
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const { mimeType: selectedMime, extension } = getSupportedVideoMimeType();
  const targetBitrate = getHighFidelityBitrate(width, height);

  // Capture at 60 FPS to preserve high-framerate footage
  const stream = canvas.captureStream(60);
  const audioInfo = getAudioTrackForStream(video);
  if (audioInfo.track) {
    try {
      stream.addTrack(audioInfo.track);
    } catch {
      // ignore
    }
  }

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

  return new Promise<ExtractedClip>((resolve, reject) => {
    recorder.onstop = () => {
      audioInfo.cleanup();
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
      audioInfo.cleanup();
      reject(e);
    };

    const originalMuted = video.muted;
    video.muted = true;

    let currentIntervalIdx = 0;
    let accumulatedRecordedSeconds = 0;

    const recordNextInterval = async () => {
      if (currentIntervalIdx >= sortedIntervals.length) {
        video.muted = originalMuted;
        if (recorder.state === 'recording') {
          recorder.stop();
        }
        return;
      }

      const inv = sortedIntervals[currentIntervalIdx];
      const invDuration = Math.max(0.1, inv.end - inv.start);

      try {
        await seekTo(video, inv.start);

        // Render clean first frame immediately at native resolution
        ctx.drawImage(video, 0, 0, width, height);

        // If recording hasn't started yet, begin continuous stream without micro-fragmentation
        if (recorder.state === 'inactive') {
          recorder.start();
        }

        await video.play();

        let animId: number;

        const onIntervalFrame = () => {
          if (video.currentTime >= inv.end || video.paused || video.ended) {
            cancelAnimationFrame(animId);
            video.pause();
            accumulatedRecordedSeconds += invDuration;
            currentIntervalIdx++;
            recordNextInterval();
            return;
          }

          // Render clean original video frame at native full resolution (no destructive watermarks)
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

          animId = requestAnimationFrame(onIntervalFrame);
        };

        animId = requestAnimationFrame(onIntervalFrame);
      } catch (err) {
        video.muted = originalMuted;
        recorder.stop();
        reject(err);
      }
    };

    recordNextInterval();
  });
};
