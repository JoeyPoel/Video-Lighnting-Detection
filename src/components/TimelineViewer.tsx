import React from 'react';
import type { StrikeDetection, StrikeInterval } from '../types.ts';
import { Zap, Clock } from 'lucide-react';

interface TimelineViewerProps {
  duration: number;
  currentTime: number;
  detections: StrikeDetection[];
  intervals: StrikeInterval[];
  onSeek: (seconds: number) => void;
}

/**
 * TimelineViewer Component
 * Visualizes frame-accurate strike spikes and buffered extraction intervals.
 * Styled with electric purple plasma accents.
 */
export const TimelineViewer: React.FC<TimelineViewerProps> = ({
  duration,
  currentTime,
  detections,
  intervals,
  onSeek,
}) => {
  if (duration <= 0) return null;

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(ratio * duration);
  };

  return (
    <div className="w-full bg-[#0c071a]/50 border border-purple-500/25 rounded-2xl p-4 sm:p-5 backdrop-blur-2xl shadow-[0_10px_30px_rgba(0,0,0,0.6)]">
      <div className="flex items-center justify-between text-xs text-slate-300 mb-3">
        <div className="flex items-center gap-3">
          <span className="font-bold text-white flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider">
            <Zap className="w-3.5 h-3.5 text-purple-400 fill-purple-400" />
            STRIKE TIMELINE
          </span>
          <span className="text-[10px] px-2.5 py-0.5 rounded-full border border-purple-500/40 text-purple-300 bg-[#1a1033] font-mono">
            {intervals.length} EVENT WINDOW{intervals.length === 1 ? '' : 'S'}
          </span>
        </div>
        <div className="font-mono text-[11px] flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-purple-400/60" />
          <span className="text-purple-300 font-bold">{currentTime.toFixed(2)}s</span>
          <span className="text-slate-500">/</span>
          <span className="text-slate-300">{duration.toFixed(2)}s</span>
        </div>
      </div>

      {/* Main Scrubber Track */}
      <div
        onClick={handleTimelineClick}
        className="relative w-full h-11 bg-black/90 border border-purple-900/40 rounded-xl cursor-pointer overflow-hidden group select-none shadow-inner"
      >
        {/* Buffered Interval Regions */}
        {intervals.map((inv) => {
          const startPct = (inv.start / duration) * 100;
          const widthPct = ((inv.end - inv.start) / duration) * 100;

          return (
            <div
              key={inv.id}
              style={{ left: `${startPct}%`, width: `${widthPct}%` }}
              className="absolute top-0 bottom-0 bg-purple-600/30 border-x border-purple-400 pointer-events-none transition-all group-hover:bg-purple-600/40"
              title={`Clip Window: ${inv.start.toFixed(1)}s - ${inv.end.toFixed(1)}s (${inv.duration.toFixed(1)}s window)`}
            />
          );
        })}

        {/* Strike Flash Marker Pins */}
        {detections.map((det, idx) => {
          const pinPct = (det.timestamp / duration) * 100;
          return (
            <div
              key={`pin-${idx}`}
              style={{ left: `${pinPct}%` }}
              className="absolute top-0 bottom-0 w-0.5 bg-white pointer-events-none z-10 shadow-[0_0_12px_#c084fc]"
            />
          );
        })}

        {/* Playhead Position Scrubber */}
        <div
          style={{ left: `${(currentTime / duration) * 100}%` }}
          className="absolute top-0 bottom-0 w-0.5 bg-white z-20 pointer-events-none shadow-[0_0_8px_#ffffff]"
        >
          <div className="w-2.5 h-2.5 rounded-full bg-purple-400 -translate-x-[4px] -translate-y-0.5 shadow-[0_0_10px_#a855f7]" />
        </div>
      </div>
    </div>
  );
};

export default TimelineViewer;
