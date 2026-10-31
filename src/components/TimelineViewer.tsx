import React from 'react';
import type { StrikeDetection, StrikeInterval } from '../types.ts';

interface TimelineViewerProps {
  duration: number;
  currentTime: number;
  detections: StrikeDetection[];
  intervals: StrikeInterval[];
  onSeek: (seconds: number) => void;
}

export const TimelineViewer: React.FC<TimelineViewerProps> = ({
  duration,
  currentTime,
  detections,
  intervals,
  onSeek,
}) => {
  if (duration <= 0) return null;

  const currentPercent = Math.min(100, Math.max(0, (currentTime / duration) * 100));

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(ratio * duration);
  };

  return (
    <div className="w-full bg-slate-900/70 border border-slate-800 rounded-2xl p-4">
      <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-slate-300">Strike Timeline</span>
          <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-400">
            {intervals.length} event{intervals.length === 1 ? '' : 's'} buffered
          </span>
        </div>
        <div className="font-mono text-xs">
          <span className="text-cyan-400">{currentTime.toFixed(1)}s</span> / {duration.toFixed(1)}s
        </div>
      </div>

      {/* Main Bar */}
      <div
        onClick={handleTimelineClick}
        className="relative w-full h-9 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer overflow-hidden group select-none"
      >
        {/* Buffered Interval Regions (+1s / -1s) */}
        {intervals.map((inv) => {
          const startPct = (inv.start / duration) * 100;
          const widthPct = ((inv.end - inv.start) / duration) * 100;

          return (
            <div
              key={inv.id}
              style={{ left: `${startPct}%`, width: `${widthPct}%` }}
              className="absolute top-0 bottom-0 bg-cyan-500/20 border-x border-cyan-400/60 pointer-events-none transition-all group-hover:bg-cyan-500/30"
              title={`Event: ${inv.start}s - ${inv.end}s (+1s buffer)`}
            />
          );
        })}

        {/* Strike Flash Pins */}
        {detections.map((det, idx) => {
          const pinPct = (det.timestamp / duration) * 100;
          return (
            <div
              key={`pin-${idx}`}
              style={{ left: `${pinPct}%` }}
              className="absolute top-0 bottom-0 w-0.5 bg-amber-400 pointer-events-none z-10 shadow-[0_0_8px_rgba(251,191,36,0.8)]"
            />
          );
        })}

        {/* Playhead */}
        <div
          style={{ left: `${currentPercent}%` }}
          className="absolute top-0 bottom-0 w-1 bg-white pointer-events-none z-20 shadow-[0_0_10px_#fff]"
        >
          <div className="w-3 h-3 -ml-1 -top-1 bg-white rounded-full border border-slate-950 shadow" />
        </div>
      </div>

      {/* Legend & quick jump buttons */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1.5">
            <div className="w-2.5 h-2.5 rounded bg-cyan-500/40 border border-cyan-400" />
            <span>+1s Buffered Event Clip</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <div className="w-1.5 h-3 bg-amber-400 rounded-sm" />
            <span>Lightning Strike Flash</span>
          </div>
        </div>

        {intervals.length > 0 && (
          <div className="flex items-center space-x-1.5">
            <span className="text-slate-500">Jump to:</span>
            {intervals.map((inv, idx) => (
              <button
                key={inv.id}
                type="button"
                onClick={() => onSeek(inv.start)}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-750 text-slate-300 font-mono text-[10px] transition"
              >
                Clip #{idx + 1} ({inv.start.toFixed(1)}s)
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
