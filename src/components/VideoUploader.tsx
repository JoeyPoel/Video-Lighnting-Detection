import React, { useRef, useState } from 'react';
import { UploadCloud, Film, Sparkles, Loader2 } from 'lucide-react';
import { generateSampleStormVideo } from '../utils/syntheticVideo.ts';

interface VideoUploaderProps {
  onVideoSelected: (fileOrBlob: Blob, name: string) => void;
  disabled?: boolean;
}

export const VideoUploader: React.FC<VideoUploaderProps> = ({
  onVideoSelected,
  disabled = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isGeneratingDemo, setIsGeneratingDemo] = useState(false);
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

  const handleLoadDemo = async () => {
    try {
      setIsGeneratingDemo(true);
      const demoBlob = await generateSampleStormVideo(9.0, 30);
      onVideoSelected(demoBlob, 'sample_storm_thunder.webm');
    } catch (err) {
      console.error('Failed to generate sample video:', err);
    } finally {
      setIsGeneratingDemo(false);
    }
  };

  return (
    <div className="w-full">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
          isDragOver
            ? 'border-cyan-400 bg-cyan-950/20 shadow-lg shadow-cyan-500/10'
            : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
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

        <div className="w-16 h-16 rounded-2xl bg-slate-800/80 border border-slate-700 mx-auto flex items-center justify-center mb-4">
          <UploadCloud className="w-8 h-8 text-cyan-400" />
        </div>

        <h3 className="text-base font-semibold text-white mb-1">
          Upload video containing lightning strikes
        </h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto mb-6">
          MP4, WebM, MOV, or AVI. Analysis detects flash points and slices each event with a 1-second lead-in and 1-second tail buffer.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs tracking-wide transition shadow-lg shadow-cyan-500/25 flex items-center space-x-2 disabled:opacity-50"
          >
            <Film className="w-4 h-4" />
            <span>Choose Video File</span>
          </button>

          <button
            type="button"
            onClick={handleLoadDemo}
            disabled={disabled || isGeneratingDemo}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 font-medium text-xs tracking-wide transition flex items-center space-x-2 disabled:opacity-50"
          >
            {isGeneratingDemo ? (
              <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
            ) : (
              <Sparkles className="w-4 h-4 text-amber-400" />
            )}
            <span>{isGeneratingDemo ? 'Synthesizing Storm...' : 'Load Sample Storm Video'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

