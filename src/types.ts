/**
 * TypeScript definitions for lightning strike detection and video clipping.
 */

export interface StrikeDetection {
  /** Timestamp in seconds when strike was detected */
  timestamp: number;
  /** Detection confidence or normalized intensity (0.0 to 1.0) */
  confidence: number;
  /** Frame index in the video */
  frameIndex: number;
  /** Optional bounding box [x1, y1, x2, y2] normalized [0, 1] from YOLO */
  bbox?: [number, number, number, number];
}

export interface StrikeInterval {
  /** Unique ID for this strike event */
  id: string;
  /** Buffered start time in seconds (+1s earlier or clamped at 0) */
  start: number;
  /** Buffered end time in seconds (+1s later or clamped at duration) */
  end: number;
  /** Total duration of this event clip in seconds */
  duration: number;
  /** Original timestamps of all strikes subsumed in this interval */
  strikeTimestamps: number[];
}

export interface ExtractedClip {
  /** Identifier matching the interval */
  id: string;
  /** Corresponding strike interval */
  interval: StrikeInterval;
  /** Blob URL for in-browser playback */
  blobUrl: string;
  /** Downloadable filename */
  filename: string;
  /** File size in bytes */
  sizeBytes: number;
}

export interface VideoMetadata {
  /** File name */
  name: string;
  /** Duration in seconds */
  duration: number;
  /** Video frame rate */
  fps: number;
  /** Video width in pixels */
  width: number;
  /** Video height in pixels */
  height: number;
}

