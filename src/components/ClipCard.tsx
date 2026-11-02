import React, { useRef } from 'react';
import type { ExtractedClip } from '../types.ts';
import { Download, Zap, Clock, HardDrive, CheckCircle2 } from 'lucide-react';
import { GlowButton } from './common/GlowButton';

interface ClipCardProps {
  clip: ExtractedClip;
  index: number;
}

/**
 * ClipCard Component
 * Displays extracted lightning discharge clip with timecodes, FastStart H.264 indicator, and lossless download.
 * Electric Purple theme.
 */
export const ClipCard: React.FC<ClipCardProps> = ({ clip, index }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const extension = clip.filename.split('.').pop()?.toUpperCase() || 'MP4';

  return (
    <div className="bg-[#0c071a]/50 backdrop-blur-2xl border border-purple-500/25 rounded-2xl overflow-hidden hover:border-purple-400/60 transition-all flex flex-col justify-between shadow-[0_10px_30px_rgba(0,0,0,0.6)] group">
      {/* Video Preview */}
      <div className="relative aspect-video bg-black group-hover:shadow-[0_0_25px_rgba(168,85,247,0.25)] transition">
        <video
          ref={videoRef}
          src={clip.blobUrl}
          controls
          playsInline
          className="w-full h-full object-contain"
        />
        <div className="absolute top-2.5 left-2.5 px-3 py-1 rounded-full bg-black/90 border border-purple-400/50 text-[10px] font-mono font-bold text-purple-200 flex items-center gap-1.5 shadow-[0_0_12px_rgba(168,85,247,0.3)]">
          <Zap className="w-3 h-3 text-purple-400 fill-purple-400" />
          <span>STRIKE • #{index + 1}</span>
        </div>
      </div>

      {/* Details & Actions */}
      <div className="p-5 flex flex-col justify-between flex-grow space-y-4">
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between border-b border-purple-900/30 pb-2 font-mono">
            <span className="text-slate-400 text-[11px] uppercase tracking-wider">Timestamp:</span>
            <span className="text-purple-200 font-bold bg-[#1a1033] px-2.5 py-0.5 rounded-full border border-purple-500/30">
              {clip.interval.start.toFixed(2)}s → {clip.interval.end.toFixed(2)}s
            </span>
          </div>

          <div className="flex items-center justify-between text-slate-300 text-[11px]">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-purple-400/70" />
              <span>Duration:</span>
            </span>
            <span className="text-white font-mono">{clip.interval.duration.toFixed(2)}s</span>
          </div>

          <div className="flex items-center justify-between text-slate-300 text-[11px]">
            <span className="flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-purple-400/70" />
              <span>Format & Size:</span>
            </span>
            <span className="text-white font-mono">
              {extension} • {formatSize(clip.sizeBytes)}
            </span>
          </div>

          <div className="pt-1 flex items-center gap-1.5 text-[10px] font-mono text-purple-300/80">
            <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
            <span>FastStart H.264 • Universal Windows & Mac</span>
          </div>
        </div>

        <a
          href={clip.blobUrl}
          download={clip.filename}
          className="w-full"
        >
          <GlowButton variant="primary" fullWidth={true}>
            <Download className="w-4 h-4 mr-1.5" />
            DOWNLOAD {extension}
          </GlowButton>
        </a>
      </div>
    </div>
  );
};

export default ClipCard;
