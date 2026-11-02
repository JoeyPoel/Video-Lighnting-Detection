import React from 'react';
import type { StrikeDetection } from '../types.ts';
import { Eye, Zap, Target, Gauge, Crosshair } from 'lucide-react';

interface DetectionInspectorProps {
  activeStrike?: StrikeDetection;
  allDetections: StrikeDetection[];
  currentTime: number;
  onSeekToStrike: (timestamp: number) => void;
}

/**
 * DetectionInspector Component
 *
 * Provides deep visual explainability for YOLO11 neural object detections:
 * - Shows exact bounding box coordinates and detection confidence
 * - Renders plain-English neural verdict explaining where the strike channel was isolated
 * - Provides interactive timecode jump badges to inspect any strike immediately
 */
export const DetectionInspector: React.FC<DetectionInspectorProps> = ({
  activeStrike,
  allDetections,
  currentTime,
  onSeekToStrike,
}) => {
  // Find current or nearest strike
  const currentStrike =
    activeStrike ||
    allDetections.find((d) => Math.abs(d.timestamp - currentTime) <= 0.35);

  const formatCoord = (val: number): string => `${Math.round(val * 100)}%`;

  return (
    <div className="bg-[#0c071a]/70 border border-purple-500/30 rounded-2xl p-5 backdrop-blur-2xl shadow-xl space-y-4">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-purple-900/40 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#1a1033] border border-purple-500/40 flex items-center justify-center text-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.3)]">
            <Eye className="w-4 h-4 text-purple-300" />
          </div>
          <div>
            <h4 className="text-sm font-editorial font-bold text-white tracking-wide flex items-center gap-2">
              <span>YOLO11 OBJECT DETECTION INSPECTOR</span>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-mono bg-purple-950/80 text-purple-300 border border-purple-500/30">
                EXPLAINABLE AI
              </span>
            </h4>
            <p className="text-[11px] text-purple-300/70 font-mono">
              Pure neural channel detection with spatial coordinates & confidence scores
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-slate-400">Total Verified Strikes:</span>
          <span className="px-2.5 py-0.5 rounded-md bg-purple-950/60 border border-purple-400/40 text-purple-200 font-bold">
            {allDetections.length}
          </span>
        </div>
      </div>

      {/* Active Strike Inspection Card */}
      {currentStrike ? (
        <div className="bg-[#120b24]/90 border border-purple-500/40 rounded-xl p-4 space-y-3 shadow-inner">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-fuchsia-400 animate-ping" />
              <span className="text-xs font-mono font-bold text-white uppercase flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-fuchsia-400 fill-fuchsia-400" />
                <span>NEURAL STRIKE DETECTED @ {currentStrike.timestamp.toFixed(2)}s</span>
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-mono">
              <Gauge className="w-3.5 h-3.5 text-purple-300" />
              <span className="text-slate-300">CONFIDENCE:</span>
              <span className="text-fuchsia-300 font-bold bg-[#1e113a] px-2 py-0.5 rounded border border-purple-500/30">
                {(currentStrike.confidence * 100).toFixed(0)}%
              </span>
            </div>
          </div>

          {/* Confidence Meter Bar */}
          <div className="space-y-1">
            <div className="w-full h-2 bg-black/80 rounded-full overflow-hidden border border-purple-950">
              <div
                style={{ width: `${Math.min(100, currentStrike.confidence * 100)}%` }}
                className="h-full bg-gradient-to-r from-purple-500 via-fuchsia-400 to-white shadow-[0_0_12px_#c084fc] transition-all duration-300"
              />
            </div>
          </div>

          {/* Spatial Coordinates Grid */}
          {currentStrike.bbox ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-[11px] font-mono">
              <div className="bg-black/40 border border-purple-900/50 rounded-lg p-2">
                <span className="text-slate-400 block text-[9px] uppercase">Box Origin X</span>
                <span className="text-purple-200 font-bold">{formatCoord(currentStrike.bbox[0])}</span>
              </div>
              <div className="bg-black/40 border border-purple-900/50 rounded-lg p-2">
                <span className="text-slate-400 block text-[9px] uppercase">Box Origin Y</span>
                <span className="text-purple-200 font-bold">{formatCoord(currentStrike.bbox[1])}</span>
              </div>
              <div className="bg-black/40 border border-purple-900/50 rounded-lg p-2">
                <span className="text-slate-400 block text-[9px] uppercase">Width</span>
                <span className="text-purple-200 font-bold">
                  {formatCoord(currentStrike.bbox[2] - currentStrike.bbox[0])}
                </span>
              </div>
              <div className="bg-black/40 border border-purple-900/50 rounded-lg p-2">
                <span className="text-slate-400 block text-[9px] uppercase">Height</span>
                <span className="text-purple-200 font-bold">
                  {formatCoord(currentStrike.bbox[3] - currentStrike.bbox[1])}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-slate-400 font-mono italic">
              Spatial bounding box resolved via full-frame verification.
            </div>
          )}

          {/* Plain-English Explanation */}
          <div className="flex items-start gap-2 bg-[#0c071a]/90 border border-purple-900/40 rounded-lg p-2.5 text-xs">
            <Target className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
            <p className="text-slate-300 text-[11px] leading-relaxed">
              <span className="text-purple-200 font-semibold">Model Verdict: </span>
              {currentStrike.explanation ||
                `YOLO11 neural detector verified lightning strike channel with ${(currentStrike.confidence * 100).toFixed(0)}% confidence. Diffuse ambient light and background lamps were suppressed.`}
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-[#120b24]/40 border border-purple-900/30 rounded-xl p-4 text-center space-y-1.5">
          <Crosshair className="w-5 h-5 text-purple-400/50 mx-auto" />
          <p className="text-xs text-slate-300 font-mono">
            {allDetections.length > 0
              ? 'Play video or click any strike pin below to inspect its exact neural bounding box & confidence.'
              : 'No strikes detected yet. Click "ANALYZE FOOTAGE" to run pure YOLO object detection.'}
          </p>
        </div>
      )}

      {/* Interactive Quick-Jump Strike Pills */}
      {allDetections.length > 0 && (
        <div className="space-y-2 pt-1">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
            Click Strike to Inspect & View Bounding Box:
          </span>
          <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto pr-1">
            {allDetections.map((det, idx) => {
              const isSelected = Math.abs(det.timestamp - currentTime) <= 0.25;
              return (
                <button
                  key={`${det.timestamp}-${idx}`}
                  type="button"
                  onClick={() => onSeekToStrike(det.timestamp)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-mono transition-all flex items-center gap-1.5 border shadow-sm ${
                    isSelected
                      ? 'bg-fuchsia-600 border-fuchsia-400 text-white shadow-[0_0_12px_rgba(232,121,249,0.5)] scale-105'
                      : 'bg-[#140b2b]/80 border-purple-900/50 text-purple-200 hover:border-purple-400/60 hover:bg-[#1f123f]'
                  }`}
                >
                  <Zap className={`w-3 h-3 ${isSelected ? 'fill-white text-white' : 'text-purple-400'}`} />
                  <span>#{idx + 1} @ {det.timestamp.toFixed(2)}s</span>
                  <span className={`text-[9px] px-1 py-0.2 rounded font-bold ${isSelected ? 'bg-black/40 text-fuchsia-200' : 'bg-black/50 text-purple-300'}`}>
                    {(det.confidence * 100).toFixed(0)}%
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default DetectionInspector;
