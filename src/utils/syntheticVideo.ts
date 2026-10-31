/**
 * Generates an in-memory sample thunderstorm video using HTML5 Canvas & MediaRecorder.
 * Features nighttime clouds, ambient lightning glow, and sharp multi-branch strikes at 2.5s and 6.0s.
 *
 * @param durationSec - Length of video in seconds (default: 9.0).
 * @param fps - Frames per second (default: 30).
 * @returns Promise resolving to a video Blob.
 */
export const generateSampleStormVideo = async (
  durationSec: number = 9.0,
  fps: number = 30
): Promise<Blob> => {
  const width = 640;
  const height = 360;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas context unavailable.');
  }

  const stream = canvas.captureStream(fps);
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  return new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: mimeType }));
    };

    recorder.start();

    const totalFrames = Math.floor(durationSec * fps);
    let frame = 0;

    const strikeTimes = [2.5, 6.0];
    const strikeDuration = 0.25;

    const draw = () => {
      if (frame >= totalFrames) {
        recorder.stop();
        return;
      }

      const timeNow = frame / fps;

      // Dark storm sky gradient
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, '#0a0d14');
      grad.addColorStop(1, '#161c28');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Rain / storm ambience
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      for (let r = 0; r < 20; r++) {
        const rx = (frame * 12 + r * 35) % width;
        const ry = (frame * 18 + r * 22) % height;
        ctx.fillRect(rx, ry, 1, 10);
      }

      // Check lightning condition
      const isLightning = strikeTimes.some(
        (st) => timeNow >= st && timeNow < st + strikeDuration
      );

      if (isLightning) {
        // Ambient flash illumination
        ctx.fillStyle = 'rgba(186, 230, 253, 0.55)';
        ctx.fillRect(0, 0, width, height);

        // Core lightning bolt
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3.5;
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 15;

        ctx.beginPath();
        ctx.moveTo(width / 2 + 10, 0);
        ctx.lineTo(width / 2 + 30, 80);
        ctx.lineTo(width / 2 - 10, 150);
        ctx.lineTo(width / 2 + 40, 240);
        ctx.lineTo(width / 2 + 15, 300);
        ctx.lineTo(width / 2 + 25, height);
        ctx.stroke();

        // Branches
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(width / 2 + 30, 80);
        ctx.lineTo(width / 2 + 75, 130);
        ctx.lineTo(width / 2 + 110, 160);

        ctx.moveTo(width / 2 - 10, 150);
        ctx.lineTo(width / 2 - 60, 200);
        ctx.lineTo(width / 2 - 90, 230);
        ctx.stroke();

        ctx.shadowBlur = 0;
      }

      // Timestamp watermark
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(10, 10, 140, 24);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px monospace';
      ctx.fillText(`TIME: ${timeNow.toFixed(2)}s`, 18, 26);

      frame++;
      setTimeout(draw, 1000 / fps);
    };

    draw();
  });
};

