import type { StrikeInterval } from '../types.ts';

/**
 * Calculates buffered time intervals around detected strikes and merges overlapping events.
 *
 * Each strike is buffered by adding bufferSeconds before (clamped to 0.0) and bufferSeconds
 * after (clamped to videoDuration). Overlapping or adjacent intervals are merged seamlessly.
 *
 * @param strikeTimestamps - Array of detected timestamps in seconds.
 * @param videoDuration - Total duration of the video in seconds.
 * @param bufferSeconds - Seconds to pad before and after each strike event (default: 1.0).
 * @param mergeThreshold - Max distance in seconds between detections to group into one event (default: 0.5).
 * @returns Array of non-overlapping, buffered StrikeInterval objects.
 */
export const calculateStrikeIntervals = (
  strikeTimestamps: number[],
  videoDuration: number,
  bufferSeconds: number = 1.0,
  mergeThreshold: number = 0.5
): StrikeInterval[] => {
  if (!strikeTimestamps.length || videoDuration <= 0) {
    return [];
  }

  // Sort timestamps in ascending order
  const sortedTimes = [...strikeTimestamps].sort((a, b) => a - b);

  // 1. Group closely spaced detections into discrete strike clusters
  interface Cluster {
    start: number;
    end: number;
    strikes: number[];
  }

  const clusters: Cluster[] = [];
  let currentCluster: Cluster = {
    start: sortedTimes[0],
    end: sortedTimes[0],
    strikes: [sortedTimes[0]],
  };

  for (let i = 1; i < sortedTimes.length; i++) {
    const t = sortedTimes[i];
    if (t - currentCluster.end <= mergeThreshold) {
      currentCluster.end = t;
      currentCluster.strikes.push(t);
    } else {
      clusters.push(currentCluster);
      currentCluster = { start: t, end: t, strikes: [t] };
    }
  }
  clusters.push(currentCluster);

  // 2. Expand each cluster by +bufferSeconds at start and +bufferSeconds at end, clamping to bounds
  interface RawInterval {
    start: number;
    end: number;
    strikes: number[];
  }

  const buffered: RawInterval[] = clusters.map((c) => ({
    start: Math.max(0, c.start - bufferSeconds),
    end: Math.min(videoDuration, c.end + bufferSeconds),
    strikes: c.strikes,
  }));

  // 3. Merge overlapping or contiguous intervals
  const merged: RawInterval[] = [buffered[0]];

  for (let i = 1; i < buffered.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = buffered[i];

    if (curr.start <= prev.end) {
      // Overlapping: extend previous interval end time and merge strikes
      prev.end = Math.max(prev.end, curr.end);
      prev.strikes = [...prev.strikes, ...curr.strikes];
    } else {
      merged.push(curr);
    }
  }

  // 4. Format into structured StrikeInterval records
  return merged.map((m, index) => {
    const startRounded = Math.round(m.start * 100) / 100;
    const endRounded = Math.round(m.end * 100) / 100;
    const duration = Math.round((endRounded - startRounded) * 100) / 100;

    return {
      id: `strike-interval-${index + 1}`,
      start: startRounded,
      end: endRounded,
      duration,
      strikeTimestamps: m.strikes.map((s) => Math.round(s * 100) / 100),
    };
  });
};

