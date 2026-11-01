import { describe, it, expect } from 'vitest';
import {
  LightningTemporalDetector,
  calculateFrameStats,
  type FrameStats,
} from './lightningAnalyzer.ts';

describe('LightningTemporalDetector', () => {
  it('correctly suppresses static lamps and lights across consecutive frames (No Lightning scenario)', () => {
    const detector = new LightningTemporalDetector(0.35);

    // Simulate 30 frames of night footage with a bright street lamp at (50, 20)
    // Mean brightness is steady ~15 lux with slight camera noise (±0.8)
    const results = [];
    for (let f = 0; f < 30; f++) {
      const noise = Math.sin(f) * 0.5;
      const stats: FrameStats = {
        meanBrightness: 15.0 + noise,
        maxLum: 255.0, // Bright lamp fixture
        brightPixelCount: 45,
        brightCenterX: 50.0 + (f % 2 === 0 ? 0.2 : -0.2), // Stationary lamp
        brightCenterY: 20.0,
      };

      const result = detector.processFrame(stats);
      results.push(result);
    }

    // Every frame must be rejected as non-lightning!
    const strikeFrames = results.filter((r) => r.isStrike);
    expect(strikeFrames).toHaveLength(0);
  });

  it('detects a sudden violent flash burst (Lightning strike scenario)', () => {
    const detector = new LightningTemporalDetector(0.35);

    // 10 dark frames
    for (let f = 0; f < 10; f++) {
      detector.processFrame({
        meanBrightness: 12.0,
        maxLum: 40.0,
        brightPixelCount: 0,
        brightCenterX: -1,
        brightCenterY: -1,
      });
    }

    // Frame 11: Massive lightning flash surge (delta = 140 lux)
    const flashFrame = detector.processFrame({
      meanBrightness: 152.0,
      maxLum: 255.0,
      brightPixelCount: 600,
      brightCenterX: 60.0,
      brightCenterY: 34.0,
    });

    expect(flashFrame.isStrike).toBe(true);
    expect(flashFrame.confidence).toBeGreaterThan(0.7);
  });

  it('detects localized transient stroke bolt appearing in darkness without static history', () => {
    const detector = new LightningTemporalDetector(0.35);

    // 10 dark frames
    for (let f = 0; f < 10; f++) {
      detector.processFrame({
        meanBrightness: 10.0,
        maxLum: 25.0,
        brightPixelCount: 0,
        brightCenterX: -1,
        brightCenterY: -1,
      });
    }

    // Frame 11: Bolt appears suddenly
    const boltFrame = detector.processFrame({
      meanBrightness: 25.0, // Moderate global delta
      maxLum: 250.0,
      brightPixelCount: 85, // New bright pixels
      brightCenterX: 80.0,
      brightCenterY: 15.0,
    });

    expect(boltFrame.isStrike).toBe(true);
  });
});

describe('calculateFrameStats', () => {
  it('correctly calculates Rec. 709 luminance and bright pixel centroids', () => {
    // 2x2 image: [black, black, white, black]
    const width = 2;
    const height = 2;
    const data = new Uint8ClampedArray([
      0, 0, 0, 255,       // (0, 0) black
      0, 0, 0, 255,       // (1, 0) black
      255, 255, 255, 255, // (0, 1) white (lum = 255)
      0, 0, 0, 255,       // (1, 1) black
    ]);

    const stats = calculateFrameStats(data, width, height);

    expect(stats.maxLum).toBeCloseTo(255, 0);
    expect(stats.brightPixelCount).toBe(1);
    expect(stats.brightCenterX).toBe(0);
    expect(stats.brightCenterY).toBe(1);
    expect(stats.meanBrightness).toBeCloseTo(255 / 4, 1);
  });
});

