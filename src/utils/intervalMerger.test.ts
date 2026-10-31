import { describe, it, expect } from 'vitest';
import { calculateStrikeIntervals } from './intervalMerger.ts';

describe('calculateStrikeIntervals', () => {
  it('pads an isolated strike by +1s at start and +1s at end', () => {
    const intervals = calculateStrikeIntervals([5.0], 10.0, 1.0);
    expect(intervals).toHaveLength(1);
    expect(intervals[0].start).toBe(4.0);
    expect(intervals[0].end).toBe(6.0);
    expect(intervals[0].duration).toBe(2.0);
  });

  it('clamps interval at start boundary (0.0s)', () => {
    const intervals = calculateStrikeIntervals([0.4], 10.0, 1.0);
    expect(intervals).toHaveLength(1);
    expect(intervals[0].start).toBe(0.0);
    expect(intervals[0].end).toBe(1.4);
  });

  it('clamps interval at end boundary (videoDuration)', () => {
    const intervals = calculateStrikeIntervals([9.6], 10.0, 1.0);
    expect(intervals).toHaveLength(1);
    expect(intervals[0].start).toBe(8.6);
    expect(intervals[0].end).toBe(10.0);
  });

  it('merges overlapping buffered intervals seamlessly', () => {
    // 3.0s (buffered: 2.0 -> 4.0) and 4.5s (buffered: 3.5 -> 5.5)
    // Overlap: [2.0, 5.5]
    const intervals = calculateStrikeIntervals([3.0, 4.5], 10.0, 1.0);
    expect(intervals).toHaveLength(1);
    expect(intervals[0].start).toBe(2.0);
    expect(intervals[0].end).toBe(5.5);
    expect(intervals[0].duration).toBe(3.5);
  });

  it('returns empty array when no strikes are present or video duration is zero', () => {
    expect(calculateStrikeIntervals([], 10.0)).toEqual([]);
    expect(calculateStrikeIntervals([1.0], 0)).toEqual([]);
  });
});

