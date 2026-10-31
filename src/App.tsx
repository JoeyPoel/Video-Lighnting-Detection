import React, { useState, useRef } from 'react';
import { Header } from './components/Header.tsx';
import { VideoUploader } from './components/VideoUploader.tsx';
import { TimelineViewer } from './components/TimelineViewer.tsx';
import { ClipCard } from './components/ClipCard.tsx';
import { analyzeVideoForLightning, type AnalysisProgress } from './utils/lightningAnalyzer.ts';
import { sliceVideoInterval } from './utils/videoSlicer.ts';
import type { StrikeDetection, StrikeInterval, ExtractedClip } from './types.ts';
import {
  Zap,
  Play,
  Pause,
  Scissors,
  Loader2,
  Sliders,
  CheckCircle2,
  FileVideo,
} from 'lucide-react';

export const App: React.FC = () => {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoName, setVideoName] = useState<string>('');
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Settings
  const [bufferSeconds, setBufferSeconds] = useState<number>(1.0);
  const [sensitivity, setSensitivity] = useState<number>(0.35);

  // State
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
  const [isSlicing, setIsSlicing] = useState<boolean>(false);
  const [slicingProgress, setSlicingProgress] = useState<{ current: number; total: number } | null>(null);

  // Results
  const [detections, setDetections] = useState<StrikeDetection[]>([]);
  const [intervals, setIntervals] = useState<StrikeInterval[]>([]);
  const [extractedClips, setExtractedClips] = useState<ExtractedClip[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);

  const handleVideoSelected = (blob: Blob, name: string) => {
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    const url = URL.createObjectURL(blob);
    setVideoUrl(url);
    setVideoName(name);
    setDetections([]);
    setIntervals([]);
    setExtractedClips([]);
    setCurrentTime(0);
    setIsPlaying(false);
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration || 0);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleSeek = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      setCurrentTime(seconds);
    }
  };

  const runAnalysis = async () => {
    if (!videoRef.current) return;
    try {
      setIsAnalyzing(true);
      setExtractedClips([]);
      const result = await analyzeVideoForLightning(
        videoRef.current,
        {
          sampleFps: 15,
          sensitivity,
          bufferSeconds,
        },
        (prog) => setAnalysisProgress(prog)
      );

      setDetections(result.detections);
      setIntervals(result.intervals);
    } catch (err) {
      console.error('Error during lightning analysis:', err);
      alert('Analysis failed. Please check video format.');
    } finally {
      setIsAnalyzing(false);
      setAnalysisProgress(null);
    }
  };

  const runSliceAll = async () => {
    if (!videoRef.current || !intervals.length) return;
    try {
      setIsSlicing(true);
      const clips: ExtractedClip[] = [];

      for (let i = 0; i < intervals.length; i++) {
        setSlicingProgress({ current: i + 1, total: intervals.length });
        const clip = await sliceVideoInterval(videoRef.current, intervals[i], i + 1);
        clips.push(clip);
      }

      setExtractedClips(clips);
    } catch (err) {
      console.error('Error extracting video clips:', err);
      alert('Failed to slice video clips.');
    } finally {
      setIsSlicing(false);
      setSlicingProgress(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Upload or Load Video Section */}
        {!videoUrl ? (
          <div className="max-w-2xl mx-auto py-12">
            <VideoUploader onVideoSelected={handleVideoSelected} />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left 2 Cols: Player & Timeline */}
            <div className="lg:col-span-2 space-y-6">
              {/* Video Player Box */}
              <div className="relative aspect-video bg-black rounded-3xl overflow-hidden border border-slate-800 shadow-2xl group">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  onLoadedMetadata={handleLoadedMetadata}
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={() => setIsPlaying(false)}
                  className="w-full h-full object-contain cursor-pointer"
                  onClick={togglePlay}
                  playsInline
                />

                {/* Overlay Controls */}
                <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={togglePlay}
                    className="w-10 h-10 rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center justify-center transition"
                  >
                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                  </button>

                  <div className="text-xs font-mono text-slate-300 bg-slate-950/70 px-3 py-1.5 rounded-lg border border-slate-800">
                    <span className="text-cyan-400">{currentTime.toFixed(2)}s</span> / {duration.toFixed(2)}s
                  </div>
                </div>
              </div>

              {/* Scrubber Timeline */}
              <TimelineViewer
                duration={duration}
                currentTime={currentTime}
                detections={detections}
                intervals={intervals}
                onSeek={handleSeek}
              />
            </div>

            {/* Right 1 Col: Control Dashboard */}
            <div className="space-y-6">
              {/* File Info & Configuration */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <FileVideo className="w-5 h-5 text-cyan-400" />
                    <span className="text-sm font-semibold text-white truncate max-w-[180px]">
                      {videoName}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (videoUrl) URL.revokeObjectURL(videoUrl);
                      setVideoUrl(null);
                    }}
                    className="text-xs text-slate-400 hover:text-white transition"
                  >
                    Change Video
                  </button>
                </div>

                {/* Parameters */}
                <div className="space-y-4 pt-2 border-t border-slate-800/80">
                  <div className="flex items-center space-x-2 text-xs font-semibold text-slate-300">
                    <Sliders className="w-4 h-4 text-cyan-400" />
                    <span>Detection Parameters</span>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>Event Buffer Padding:</span>
                      <span className="font-mono text-cyan-400 font-medium">±{bufferSeconds.toFixed(1)}s</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="3.0"
                      step="0.5"
                      value={bufferSeconds}
                      onChange={(e) => setBufferSeconds(parseFloat(e.target.value))}
                      className="w-full accent-cyan-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                    />
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      Adds {bufferSeconds}s before & {bufferSeconds}s after each strike (merged if overlapping).
                    </span>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>Flash Sensitivity:</span>
                      <span className="font-mono text-cyan-400 font-medium">
                        {(sensitivity * 100).toFixed(0)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="0.9"
                      step="0.05"
                      value={sensitivity}
                      onChange={(e) => setSensitivity(parseFloat(e.target.value))}
                      className="w-full accent-cyan-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-2 space-y-3">
                  <button
                    type="button"
                    onClick={runAnalysis}
                    disabled={isAnalyzing || isSlicing}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs tracking-wider uppercase transition shadow-lg shadow-cyan-500/20 flex items-center justify-center space-x-2 disabled:opacity-50"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Analyzing ({analysisProgress?.progressPercent || 0}%)</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 fill-slate-950" />
                        <span>Detect Lightning Strikes</span>
                      </>
                    )}
                  </button>

                  {intervals.length > 0 && (
                    <button
                      type="button"
                      onClick={runSliceAll}
                      disabled={isSlicing || isAnalyzing}
                      className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs tracking-wider uppercase transition shadow-lg shadow-emerald-500/20 flex items-center justify-center space-x-2 disabled:opacity-50"
                    >
                      {isSlicing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>
                            Slicing Clip {slicingProgress?.current}/{slicingProgress?.total}
                          </span>
                        </>
                      ) : (
                        <>
                          <Scissors className="w-4 h-4" />
                          <span>Extract {intervals.length} Event Clip{intervals.length === 1 ? '' : 's'}</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Summary Card */}
                {intervals.length > 0 && (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs space-y-2">
                    <div className="flex items-center space-x-1.5 text-emerald-400 font-semibold">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{intervals.length} Lightning Event(s) Identified</span>
                    </div>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      Identified {detections.length} total strike frame(s), buffered into {intervals.length} merged window(s) of ±{bufferSeconds}s.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Extracted Clips Gallery */}
        {extractedClips.length > 0 && (
          <div className="pt-8 border-t border-slate-800 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight flex items-center space-x-2">
                  <Scissors className="w-5 h-5 text-cyan-400" />
                  <span>Isolated Lightning Clips (+1s Buffer)</span>
                </h2>
                <p className="text-xs text-slate-400">
                  Each clip contains the lightning discharge preceded by 1s lead-in and followed by 1s tail-off.
                </p>
              </div>

              <span className="text-xs text-slate-400 font-mono">
                {extractedClips.length} ready for download
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {extractedClips.map((clip, idx) => (
                <ClipCard key={clip.id} clip={clip} index={idx} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
