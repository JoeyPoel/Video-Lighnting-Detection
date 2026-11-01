import type { ExtractedClip, StrikeInterval } from '../types.ts';

/**
 * Returns the best supported video MIME type and file extension for MediaRecorder.
 * Prioritizes standard MP4 (AVC1 / H.264) to ensure native playback in Windows Media Player
 * without 0x8000FFFF codec errors, falling back to WebM if MP4 recording is unavailable.
 */
export const getSupportedVideoMimeType = (): { mimeType: string; extension: string } => {
  const candidates = [
    'video/mp4;codecs=avc1',
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
    'video/webm;codecs=h264',
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
  const width = video.videoWidth || 640;
  const height = video.videoHeight || 360;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas context not available for video slicing.');
  }

  const { mimeType: selectedMime, extension } = getSupportedVideoMimeType();

  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, {
    mimeType: selectedMime,
    videoBitsPerSecond: 4_000_000,
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
      reject(e);
    };

    seekTo(video, interval.start)
      .then(() => {
        recorder.start(100);

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

          ctx.drawImage(video, 0, 0, width, height);

          // Timestamp overlay watermark
          ctx.fillStyle = 'rgba(12, 7, 26, 0.75)';
          ctx.fillRect(10, height - 32, 230, 24);
          ctx.fillStyle = '#c084fc';
          ctx.font = '12px "JetBrains Mono", monospace';
          ctx.fillText(`⚡ STRIKE #${index} • ${video.currentTime.toFixed(2)}s`, 16, height - 16);

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

  const width = video.videoWidth || 640;
  const height = video.videoHeight || 360;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas context not available for montage rendering.');
  }

  const { mimeType: selectedMime, extension } = getSupportedVideoMimeType();

  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, {
    mimeType: selectedMime,
    videoBitsPerSecond: 4_500_000,
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
      reject(e);
    };

    const originalMuted = video.muted;
    video.muted = true;

    // Start recording immediately
    recorder.start(100);

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

          ctx.drawImage(video, 0, 0, width, height);

          // Subtle, high-contrast montage HUD overlay
          ctx.fillStyle = 'rgba(12, 7, 26, 0.8)';
          ctx.fillRect(10, height - 34, 310, 26);
          ctx.fillStyle = '#e879f9';
          ctx.font = 'bold 11px "JetBrains Mono", monospace';
          ctx.fillText(`⚡ MONTAGE • STRIKE ${currentIntervalIdx + 1}/${sortedIntervals.length}`, 16, height - 17);
          ctx.fillStyle = '#cbd5e1';
          ctx.fillText(`• ${video.currentTime.toFixed(2)}s`, 220, height - 17);

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
