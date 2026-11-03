import { describe, it, expect, vi } from 'vitest';
import {
  getHighFidelityBitrate,
  getSupportedVideoMimeType,
  ensureVideoDimensions,
  getMaxPlaybackRate,
  triggerFileDownload,
} from './videoSlicer.ts';

describe('videoSlicer utilities', () => {
  describe('getHighFidelityBitrate', () => {
    it('allocates 35 Mbps for 4K UHD video within level 5.1 safe limits', () => {
      const bitrate = getHighFidelityBitrate(3840, 2160);
      expect(bitrate).toBe(35_000_000);
    });

    it('allocates 24 Mbps for 1440p QHD video', () => {
      const bitrate = getHighFidelityBitrate(2560, 1440);
      expect(bitrate).toBe(24_000_000);
    });

    it('allocates 16 Mbps for 1080p FHD video for universal Windows compatibility', () => {
      const bitrate = getHighFidelityBitrate(1920, 1080);
      expect(bitrate).toBe(16_000_000);
    });

    it('allocates 8 Mbps for 720p HD video', () => {
      const bitrate = getHighFidelityBitrate(1280, 720);
      expect(bitrate).toBe(8_000_000);
    });
  });

  describe('ensureVideoDimensions', () => {
    it('clamps odd dimensions down to even integers for H.264 macroblock compliance', async () => {
      const mockVideo = {
        videoWidth: 1921,
        videoHeight: 1081,
      } as unknown as HTMLVideoElement;

      const { width, height } = await ensureVideoDimensions(mockVideo);
      expect(width % 2).toBe(0);
      expect(height % 2).toBe(0);
      expect(width).toBe(1920);
      expect(height).toBe(1080);
    });

    it('preserves already even dimensions', async () => {
      const mockVideo = {
        videoWidth: 1920,
        videoHeight: 1080,
      } as unknown as HTMLVideoElement;

      const { width, height } = await ensureVideoDimensions(mockVideo);
      expect(width).toBe(1920);
      expect(height).toBe(1080);
    });
  });

  describe('getMaxPlaybackRate', () => {
    it('returns a high hardware acceleration multiplier (>= 8.0x)', () => {
      const rate = getMaxPlaybackRate();
      expect(rate).toBeGreaterThanOrEqual(8.0);
    });
  });

  describe('getSupportedVideoMimeType', () => {
    it('returns a valid mimeType and matching extension', () => {
      const result = getSupportedVideoMimeType();
      expect(result).toHaveProperty('mimeType');
      expect(result).toHaveProperty('extension');
      expect(['mp4', 'webm']).toContain(result.extension);
      if (result.extension === 'mp4') {
        expect(result.mimeType).toContain('mp4');
      } else {
        expect(result.mimeType).toContain('webm');
      }
    });
  });

  describe('triggerFileDownload', () => {
    it('safely handles non-DOM / server-side environments without throwing', () => {
      expect(() => {
        triggerFileDownload('blob:test', 'test.mp4');
      }).not.toThrow();
    });

    it('creates an anchor, sets attributes and triggers click when document is available', () => {
      const mockClick = vi.fn();
      const mockAnchor = {
        href: '',
        download: '',
        style: {} as Record<string, string>,
        click: mockClick,
      };
      const appendSpy = vi.fn();
      const removeSpy = vi.fn();

      const fakeDocument = {
        createElement: vi.fn(() => mockAnchor),
        body: {
          appendChild: appendSpy,
          removeChild: removeSpy,
          contains: vi.fn(() => true),
        },
      };

      vi.stubGlobal('document', fakeDocument);

      triggerFileDownload('blob:http://localhost/mock-video', 'lightning_test.mp4');

      expect(fakeDocument.createElement).toHaveBeenCalledWith('a');
      expect(mockAnchor.href).toBe('blob:http://localhost/mock-video');
      expect(mockAnchor.download).toBe('lightning_test.mp4');
      expect(mockClick).toHaveBeenCalledTimes(1);
      expect(appendSpy).toHaveBeenCalledWith(mockAnchor);

      vi.unstubAllGlobals();
    });
  });
});

