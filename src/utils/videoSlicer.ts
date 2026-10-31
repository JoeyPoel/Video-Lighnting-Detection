import type { ExtractedClip, StrikeInterval } from '../types.ts';

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

  // Pick supported mimeType
  const mimeTypes = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];
  const selectedMime = mimeTypes.find((m) => MediaRecorder.isTypeSupported(m)) || 'video/webm';

  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, {
    mimeType: selectedMime,
    videoBitsPerSecond: 3_500_000,
  });

  const recordedChunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };

  const extension = selectedMime.includes('mp4') ? 'mp4' : 'webm';
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

    // Seek to interval start
    const seekTo = (time: number): Promise<void> =>
      new Promise((res) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          res();
        };
        video.addEventListener('seeked', onSeeked);
        video.currentTime = Math.max(0, time);
      });

    seekTo(interval.start)
      .then(() => {
        recorder.start(100);

        const startTime = interval.start;
        const endTime = interval.end;
        const totalDuration = endTime - startTime;

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
          ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
          ctx.fillRect(10, height - 32, 210, 24);
          ctx.fillStyle = '#38bdf8';
          ctx.font = '12px "JetBrains Mono", monospace';
          ctx.fillText(`⚡ STRIKE EVENT: ${video.currentTime.toFixed(2)}s`, 16, height - 16);

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

