import React, { useRef, useState } from 'react';
import { UploadCloud, Film } from 'lucide-react';
import { GlowButton } from './common/GlowButton';

interface VideoUploaderProps {
  onVideoSelected: (fileOrBlob: Blob, name: string) => void;
  disabled?: boolean;
}

/**
 * Ultra-Clean Minimalist Video Uploader
 * Single-action video dropzone with frosted glass blur and elegant typography.
 */
export const VideoUploader: React.FC<VideoUploaderProps> = ({
  onVideoSelected,
  disabled = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onVideoSelected(file, file.name);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('video/')) {
      onVideoSelected(file, file.name);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={`relative p-8 sm:p-12 text-center transition-all duration-500 backdrop-blur-2xl rounded-3xl bg-[#0c071a]/35 border ${
          isDragOver
            ? 'border-purple-400 shadow-[0_0_50px_rgba(168,85,247,0.35)] bg-[#1a1033]/50 scale-[1.01]'
            : 'border-purple-500/20 hover:border-purple-400/40 shadow-[0_20px_50px_rgba(0,0,0,0.6)]'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={handleFileChange}
          disabled={disabled}
        />

        {/* Minimal Pedestal */}
        <div className="w-14 h-14 rounded-2xl bg-[#140b2b]/80 border border-purple-500/30 mx-auto flex items-center justify-center mb-5 shadow-[0_0_20px_rgba(168,85,247,0.2)]">
          <UploadCloud className="w-6 h-6 text-purple-300" />
        </div>

        <div className="space-y-2 mb-8">
          <h3 className="font-editorial italic text-3xl sm:text-4xl text-white tracking-tight">
            Drop Storm Footage
          </h3>
          <p className="text-xs sm:text-sm text-slate-300/80 max-w-md mx-auto leading-relaxed">
            Automated strike isolation with ±1.0s buffered clip extraction.
          </p>
        </div>

        {/* Focused Single Action Button */}
        <div className="flex items-center justify-center">
          <GlowButton
            variant="primary"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
          >
            <Film className="w-4 h-4 mr-1.5" />
            SELECT VIDEO
          </GlowButton>
        </div>
      </div>
    </div>
  );
};

export default VideoUploader;
