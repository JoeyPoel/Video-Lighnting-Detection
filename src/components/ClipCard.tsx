import React, { useRef } from 'react';
import type { ExtractedClip } from '../types.ts';
import { Download, Zap, Clock } from 'lucide-react';

interface ClipCardProps {
  clip: ExtractedClip;
  index: number;
}

export const ClipCard: React.FC<ClipCardProps> = ({ clip, index }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden hover:border-slate-700 transition flex flex-col justify-between">
      {/* Video Preview */}
      <div className="relative aspect-video bg-black group">
        <video
          ref={videoRef}
          src={clip.blobUrl}
          controls
          playsInline
          className="w-full h-full object-contain"
        />
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-slate-950/80 border border-slate-800 text-[11px] font-mono font-medium text-cyan-400 flex items-center space-x-1">
          <Zap className="w-3 h-3 text-cyan-400" />
          <span>Clip #{index + 1}</span>
        </div>
      </div>

      {/* Details & Actions */}
      <div className="p-4 flex flex-col justify-between flex-grow">
        <div className="space-y-1 mb-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-white">Event Window:</span>
            <span className="font-mono text-cyan-400">
              {clip.interval.start.toFixed(1)}s → {clip.interval.end.toFixed(1)}s
            </span>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center space-x-1">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>Duration:</span>
            </span>
            <span className="font-mono">{clip.interval.duration.toFixed(1)}s (+1s buffer)</span>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>File size:</span>
            <span className="font-mono">{formatSize(clip.sizeBytes)}</span>
          </div>
        </div>

        <a
          href={clip.blobUrl}
          download={clip.filename}
          className="w-full py-2 px-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs tracking-wide transition flex items-center justify-center space-x-2 shadow-md shadow-cyan-500/20"
        >
          <Download className="w-4 h-4" />
          <span>Download Clip</span>
        </a>
      </div>
    </div>
  );
};
