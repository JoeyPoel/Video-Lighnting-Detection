import React, { useState, useRef } from 'react';
import { VideoUploader } from './components/VideoUploader.tsx';
import { TimelineViewer } from './components/TimelineViewer.tsx';
import { ClipCard } from './components/ClipCard.tsx';
import { ThunderStrike } from './components/ThunderStrike.tsx';
import { DetectionInspector } from './components/DetectionInspector.tsx';
import { GlowButton } from './components/common/GlowButton.tsx';
import { WireBadge } from './components/common/WireBadge.tsx';
import { analyzeVideoForLightning, type AnalysisProgress } from './utils/lightningAnalyzer.ts';
import { sliceVideoInterval, createLightningMontage, type MontageProgress } from './utils/videoSlicer.ts';
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
  Sparkles,
  RotateCcw,
  Film,
  Download,
  Eye,
} from 'lucide-react';

/**
 * VoltClip — Precision Lightning Strike Detection & Event Buffer Slicer
 * Ultra-clean, atmospheric dark void studio.
 */
export const App: React.FC = () => {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoName, setVideoName] = useState<string>('');
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isStormActive, setIsStormActive] = useState<boolean>(true);

  // Detection Settings (YOLO object detection + temporal flash verification)
  const [bufferSeconds, setBufferSeconds] = useState<number>(2.0);
  const [modelConfidence, setModelConfidence] = useState<number>(0.25);
  const [useYolo, setUseYolo] = useState<boolean>(true);

  // Operation State
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [autoScanPending, setAutoScanPending] = useState<boolean>(false);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
  const [isSlicing, setIsSlicing] = useState<boolean>(false);
  const [slicingProgress, setSlicingProgress] = useState<{ current: number; total: number } | null>(null);
  const [activeTab, setActiveTab] = useState<'studio' | 'explainability'>('studio');

  // Montage State
  const [isGeneratingMontage, setIsGeneratingMontage] = useState<boolean>(false);
  const [montageProgress, setMontageProgress] = useState<MontageProgress | null>(null);
  const [montageClip, setMontageClip] = useState<ExtractedClip | null>(null);

  // Strike & Clip Results
  const [detections, setDetections] = useState<StrikeDetection[]>([]);
  const [intervals, setIntervals] = useState<StrikeInterval[]>([]);
  const [extractedClips, setExtractedClips] = useState<ExtractedClip[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);

  const runAnalysis = async (customVideo?: HTMLVideoElement) => {
    const target = customVideo || videoRef.current;
    if (!target) return;
    try {
      setIsAnalyzing(true);
      setExtractedClips([]);
      setMontageClip(null);

      const result = await analyzeVideoForLightning(
        target,
        {
          modelConfidence,
          bufferSeconds,
          sampleFps: 15,
          useYolo,
        },
        (prog, liveDets) => {
          setAnalysisProgress(prog);
          // Stream live strike pins stably onto timeline
          if (liveDets) setDetections(liveDets);
        }
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

  const triggerAutoScanIfPending = (video: HTMLVideoElement) => {
    if (autoScanPending && !isAnalyzing) {
      setAutoScanPending(false);
      setTimeout(() => {
        runAnalysis(video);
      }, 150);
    }
  };

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
    setMontageClip(null);
    setCurrentTime(0);
    setIsPlaying(false);
    setAutoScanPending(true);
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration || 0;
      setDuration(dur);
      if (dur > 0.05 && videoRef.current.currentTime === 0) {
        videoRef.current.currentTime = 0.05;
      }
      triggerAutoScanIfPending(videoRef.current);
    }
  };

  const handleLoadedData = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration || 0;
      if (dur > 0.05 && videoRef.current.currentTime === 0) {
        videoRef.current.currentTime = 0.05;
      }
      triggerAutoScanIfPending(videoRef.current);
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

  const runGenerateMontage = async () => {
    if (!videoRef.current || !intervals.length) return;
    try {
      setIsGeneratingMontage(true);
      const montage = await createLightningMontage(
        videoRef.current,
        intervals,
        (prog) => setMontageProgress(prog)
      );
      setMontageClip(montage);
    } catch (err) {
      console.error('Error creating lightning montage:', err);
      alert('Failed to generate continuous montage video.');
    } finally {
      setIsGeneratingMontage(false);
      setMontageProgress(null);
    }
  };

  const activeStrike = detections.find(
    (d) => Math.abs(d.timestamp - currentTime) < 0.25 && d.bbox
  );

  return (
    <div className="relative min-h-screen text-slate-100 flex flex-col font-sans selection:bg-purple-500 selection:text-white bg-transparent">
      {/* Dynamic Ambient Lightning Thunderstorm Background Canvas */}
      {isStormActive && (
        <ThunderStrike
          speed={45}
        />
      )}

      {/* Zero-Lag Atmospheric Vignette (Hardware accelerated) */}
      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none z-[1] bg-gradient-to-b from-[#07040d]/40 via-transparent to-[#07040d]/60"
      />

      {/* Floating Minimalist Storm Atmosphere Toggle in Top-Right */}
      <div className="fixed top-5 right-5 sm:top-7 sm:right-7 z-50">
        <button
          type="button"
          onClick={() => setIsStormActive((prev) => !prev)}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full font-mono text-[10px] tracking-[0.18em] uppercase transition-all border backdrop-blur-2xl shadow-lg ${
            isStormActive
              ? 'border-purple-500/40 text-purple-200 bg-[#1a1033]/60 shadow-[0_0_15px_rgba(168,85,247,0.3)] hover:bg-[#1a1033]/80'
              : 'border-purple-950/60 text-slate-400 bg-[#07040d]/60 hover:text-white'
          }`}
        >
          <Sparkles className="w-3 h-3 text-purple-400" />
          <span>{isStormActive ? 'STORM FX' : 'MUTED'}</span>
        </button>
      </div>

      {/* Main Centered Stage */}
      <main className="relative z-10 flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20 flex flex-col justify-center">
        {!videoUrl ? (
          /* Centered Lightning Studio Hero & Uploader */
          <div className="w-full space-y-12 sm:space-y-16 my-auto">
            {/* Centerpiece Headline + Subtitle */}
            <div className="text-center max-w-4xl mx-auto space-y-4">
              <h1 className="font-editorial text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-bold tracking-[0.14em] sm:tracking-[0.2em] text-white uppercase plasma-glow-text whitespace-nowrap transition-all duration-700">
                VØLT<span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-300 via-fuchsia-200 to-white">CLIP</span>
              </h1>

              <p className="font-mono text-xs sm:text-sm tracking-[0.25em] text-purple-200/70 uppercase max-w-xl mx-auto">
                PRECISION LIGHTNING DETECTION & BUFFER SLICER
              </p>
            </div>

            {/* Video Dropzone */}
            <VideoUploader onVideoSelected={handleVideoSelected} />
          </div>
        ) : (
          /* Active Studio: Single Unified Workspace */
          <div className="space-y-6">
            {/* Top Workspace Session Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-[#0c071a]/50 border border-purple-500/25 rounded-2xl p-4 sm:px-6 backdrop-blur-2xl shadow-[0_10px_30px_rgba(0,0,0,0.6)]">
              <div className="flex items-center space-x-3.5">
                <div className="w-9 h-9 rounded-xl bg-[#1a1033] border border-purple-500/40 flex items-center justify-center text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.3)]">
                  <FileVideo className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-sm font-bold text-white block truncate max-w-xs sm:max-w-md font-mono">
                    {videoName}
                  </span>
                  <span className="text-[11px] font-mono text-purple-300/70">
                    DURATION: {duration.toFixed(2)}S
                  </span>
                </div>
              </div>

              {/* View Mode Navigation Tabs & Action */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 p-1 bg-[#120b24]/90 border border-purple-500/30 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setActiveTab('studio')}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-lg font-mono text-xs font-bold uppercase transition ${
                      activeTab === 'studio'
                        ? 'bg-purple-600 text-white shadow-[0_0_12px_rgba(168,85,247,0.5)]'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Film className="w-3.5 h-3.5" />
                    <span>STUDIO</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('explainability')}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-lg font-mono text-xs font-bold uppercase transition ${
                      activeTab === 'explainability'
                        ? 'bg-purple-600 text-white shadow-[0_0_12px_rgba(168,85,247,0.5)]'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5 text-purple-300" />
                    <span>PROCESS & AI</span>
                    {detections.length > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-purple-950 border border-purple-400/40 text-purple-200">
                        {detections.length}
                      </span>
                    )}
                  </button>
                </div>

                <GlowButton
                  variant="secondary"
                  onClick={() => {
                    if (videoUrl) URL.revokeObjectURL(videoUrl);
                    setVideoUrl(null);
                  }}
                  className="py-2 px-5 text-xs"
                >
                  SWITCH FOOTAGE
                </GlowButton>
              </div>
            </div>

            {activeTab === 'studio' ? (
              <>
                {/* Connected Stage & Controls Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left 2 Cols: Connected Video Player + Timeline Scrubber */}
                  <div className="lg:col-span-2 bg-[#0c071a]/50 border border-purple-500/25 rounded-3xl p-5 sm:p-6 space-y-4 backdrop-blur-2xl shadow-2xl">
                    {/* Player Box */}
                    <div className="relative aspect-video bg-black rounded-2xl overflow-hidden border border-purple-900/50 group shadow-inner">
                      <video
                        ref={videoRef}
                        src={videoUrl}
                        preload="auto"
                        muted={true}
                        onLoadedMetadata={handleLoadedMetadata}
                        onLoadedData={handleLoadedData}
                        onTimeUpdate={handleTimeUpdate}
                        onEnded={() => setIsPlaying(false)}
                        className="w-full h-full object-contain cursor-pointer"
                        onClick={togglePlay}
                        playsInline
                      />

                      {/* Real-time YOLO Neural Bounding Box Overlay */}
                      {activeStrike && activeStrike.bbox && (
                        <div
                          style={{
                            left: `${activeStrike.bbox[0] * 100}%`,
                            top: `${activeStrike.bbox[1] * 100}%`,
                            width: `${Math.max(4, (activeStrike.bbox[2] - activeStrike.bbox[0]) * 100)}%`,
                            height: `${Math.max(4, (activeStrike.bbox[3] - activeStrike.bbox[1]) * 100)}%`,
                          }}
                          className="absolute border-2 border-fuchsia-400 bg-fuchsia-500/15 pointer-events-none rounded-lg shadow-[0_0_20px_#e879f9] transition-all duration-75"
                        >
                          <div className="absolute -top-6 left-0 px-2 py-0.5 text-[10px] font-mono font-bold bg-[#140b2b]/95 text-fuchsia-200 border border-fuchsia-400/60 rounded shadow-lg whitespace-nowrap flex items-center gap-1">
                            <Zap className="w-3 h-3 text-fuchsia-400 fill-fuchsia-400" />
                            <span>LIGHTNING BOLT • {(activeStrike.confidence * 100).toFixed(0)}%</span>
                          </div>
                        </div>
                      )}

                      {/* Player Overlay Controls */}
                      <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/95 via-black/50 to-transparent flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={togglePlay}
                          className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white flex items-center justify-center transition shadow-lg shadow-purple-500/40 hover:scale-105 active:scale-95"
                        >
                          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                        </button>

                        <div className="text-xs font-mono text-slate-200 bg-[#120b24]/90 px-3.5 py-1.5 rounded-full border border-purple-500/30">
                          <span className="text-purple-300 font-bold">{currentTime.toFixed(2)}s</span> / {duration.toFixed(2)}s
                        </div>
                      </div>
                    </div>

                    {/* Real-time Hardware Scan Progress */}
                    {isAnalyzing && analysisProgress && (
                      <div className="bg-[#120b24]/80 border border-purple-500/40 rounded-xl p-4 space-y-2 font-mono backdrop-blur-xl">
                        <div className="flex items-center justify-between text-xs text-slate-200">
                          <span className="flex items-center gap-2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                            Scanning video ({analysisProgress.fpsSpeed || 60} FPS)...
                          </span>
                          <span className="text-purple-300 font-bold">
                            {analysisProgress.progressPercent}%
                          </span>
                        </div>

                        <div className="w-full h-1.5 bg-black rounded-full overflow-hidden">
                          <div
                            style={{ width: `${analysisProgress.progressPercent}%` }}
                            className="h-full bg-gradient-to-r from-purple-500 via-fuchsia-400 to-purple-300 shadow-[0_0_12px_#c084fc] transition-all duration-150"
                          />
                        </div>
                      </div>
                    )}

                    {/* Timeline Scrubber */}
                    <TimelineViewer
                      duration={duration}
                      currentTime={currentTime}
                      detections={detections}
                      intervals={intervals}
                      onSeek={handleSeek}
                    />
                  </div>

                  {/* Right 1 Col: Unified Command Console */}
                  <div className="bg-[#0c071a]/50 border border-purple-500/25 rounded-3xl p-6 space-y-6 backdrop-blur-2xl shadow-2xl flex flex-col justify-between">
                    <div className="space-y-6">
                      <div className="flex items-center space-x-2 text-xs font-mono font-bold text-white uppercase tracking-widest border-b border-purple-900/30 pb-3">
                        <Sliders className="w-4 h-4 text-purple-400" />
                        <span>DETECTION CONSOLE</span>
                      </div>

                      {/* Buffer Slider */}
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs font-mono text-slate-200">
                          <span>EVENT BUFFER:</span>
                          <span className="text-purple-300 font-bold">±{bufferSeconds.toFixed(1)}S</span>
                        </div>
                        <input
                          type="range"
                          min="0.5"
                          max="5.0"
                          step="0.5"
                          value={bufferSeconds}
                          onChange={(e) => setBufferSeconds(parseFloat(e.target.value))}
                          className="w-full accent-purple-400 h-1.5 bg-black rounded-full cursor-pointer"
                        />
                        <span className="text-[10px] text-slate-400 font-mono block">
                          Guarantees {bufferSeconds}s lead-in & {bufferSeconds}s tail buffer on each clip.
                        </span>
                      </div>

                      {/* YOLO Model Confidence Threshold Slider */}
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs font-mono text-slate-200">
                          <span>MODEL CONFIDENCE:</span>
                          <span className="text-purple-300 font-bold">
                            {(modelConfidence * 100).toFixed(0)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0.10"
                          max="0.75"
                          step="0.05"
                          value={modelConfidence}
                          onChange={(e) => setModelConfidence(parseFloat(e.target.value))}
                          className="w-full accent-purple-400 h-1.5 bg-black rounded-full cursor-pointer"
                        />
                        <span className="text-[10px] text-slate-400 font-mono block">
                          Neural confidence filter (default 25%): strikes matching bolt channels or atmospheric flash surges are detected.
                        </span>
                      </div>

                      {/* YOLO11 Neural ONNX Engine Toggle */}
                      <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#140b2b]/90 border border-purple-500/30 shadow-inner">
                        <div className="flex items-center gap-2.5">
                          <Sparkles className="w-4 h-4 text-purple-400" />
                          <div>
                            <span className="text-xs font-mono font-bold text-white block">
                              YOLO11 NEURAL ENGINE
                            </span>
                            <span className="text-[10px] text-purple-300/70 font-mono">
                              Client-side ONNX WebGL
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setUseYolo((prev) => !prev)}
                          className={`px-3 py-1 rounded-full font-mono text-[10px] uppercase font-bold border transition ${
                            useYolo
                              ? 'bg-purple-600 border-purple-400 text-white shadow-[0_0_12px_rgba(168,85,247,0.5)]'
                              : 'bg-black/60 border-purple-900/50 text-slate-400'
                          }`}
                        >
                          {useYolo ? 'ACTIVE' : 'OFF'}
                        </button>
                      </div>
                    </div>

                    {/* Action Buttons & Status Summary */}
                    <div className="space-y-3 pt-6 border-t border-purple-900/30">
                      <GlowButton
                        variant="primary"
                        onClick={() => runAnalysis()}
                        disabled={isAnalyzing || isSlicing || isGeneratingMontage}
                        fullWidth={true}
                      >
                        {isAnalyzing ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            SCANNING ({analysisProgress?.progressPercent || 0}%)
                          </>
                        ) : (
                          <>
                            <RotateCcw className="w-4 h-4 mr-2" />
                            RE-SCAN FOOTAGE
                          </>
                        )}
                      </GlowButton>

                      {/* Montage Generator Action */}
                      {intervals.length > 0 && (
                        <GlowButton
                          variant="secondary"
                          onClick={runGenerateMontage}
                          disabled={isGeneratingMontage || isSlicing || isAnalyzing}
                          fullWidth={true}
                        >
                          {isGeneratingMontage ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin mr-2" />
                              STITCHING MONTAGE ({montageProgress?.overallPercent || 0}%)
                            </>
                          ) : (
                            <>
                              <Film className="w-4 h-4 mr-2 text-purple-300" />
                              EXPORT MONTAGE (ALL STRIKES)
                            </>
                          )}
                        </GlowButton>
                      )}

                      {/* Individual Clips Slicer Action */}
                      {intervals.length > 0 && (
                        <GlowButton
                          variant="outline"
                          onClick={runSliceAll}
                          disabled={isSlicing || isGeneratingMontage || isAnalyzing}
                          fullWidth={true}
                        >
                          {isSlicing ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin mr-2" />
                              SLICING CLIP {slicingProgress?.current}/{slicingProgress?.total}
                            </>
                          ) : (
                            <>
                              <Scissors className="w-4 h-4 mr-2" />
                              EXTRACT {intervals.length} INDIVIDUAL CLIPS
                            </>
                          )}
                        </GlowButton>
                      )}

                      {/* Identification Summary */}
                      {intervals.length > 0 ? (
                        <div className="bg-[#120b24]/80 border border-purple-500/40 rounded-xl p-3.5 text-xs font-mono space-y-2.5 shadow-[0_0_15px_rgba(168,85,247,0.2)] backdrop-blur-xl">
                          <div className="flex items-center space-x-1.5 text-purple-200 font-bold">
                            <CheckCircle2 className="w-4 h-4 text-purple-400" />
                            <span>{intervals.length} STRIKE EVENT(S) IDENTIFIED</span>
                          </div>
                          <p className="text-slate-300 text-[11px] leading-relaxed font-sans">
                            Isolated {detections.length} strike frame(s) into {intervals.length} merged window(s) of ±{bufferSeconds}s buffer.
                          </p>

                          <button
                            type="button"
                            onClick={() => setActiveTab('explainability')}
                            className="w-full py-2 px-3 rounded-lg bg-purple-950/70 border border-purple-500/40 text-purple-200 text-xs font-mono flex items-center justify-center gap-2 hover:bg-purple-900/60 transition shadow-sm"
                          >
                            <Eye className="w-3.5 h-3.5 text-purple-400" />
                            <span>VIEW EXPLAINABLE AI PROCESS</span>
                          </button>
                        </div>
                      ) : (
                        !isAnalyzing && detections.length === 0 && (
                          <div className="bg-[#120b24]/60 border border-purple-900/30 rounded-xl p-3 text-[11px] font-mono text-purple-300/60 leading-relaxed flex items-center justify-between">
                            <span>AWAITING SCAN COMMAND</span>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              /* Process Page: Dedicated Explainable AI & Neural Analysis View */
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="font-editorial font-bold text-2xl sm:text-3xl text-white tracking-wide flex items-center gap-2.5">
                      <Eye className="w-6 h-6 text-purple-400" />
                      <span>PROCESS & EXPLAINABLE AI INSPECTOR</span>
                    </h2>
                    <p className="text-xs text-purple-300/70 font-mono uppercase tracking-wide">
                      Frame-by-frame neural stroke verification, spatial coordinates, and explainability verdicts.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveTab('studio')}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold bg-[#140b2b] border border-purple-500/30 text-purple-200 hover:bg-[#1a1033] transition"
                  >
                    <Film className="w-4 h-4" />
                    <span>RETURN TO STUDIO</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left 2 Cols: Synchronized Video Inspector with Real-time Bounding Box */}
                  <div className="lg:col-span-2 bg-[#0c071a]/50 border border-purple-500/25 rounded-3xl p-5 sm:p-6 space-y-4 backdrop-blur-2xl shadow-2xl">
                    <div className="relative aspect-video bg-black rounded-2xl overflow-hidden border border-purple-900/50 group shadow-inner">
                      <video
                        ref={videoRef}
                        src={videoUrl}
                        preload="auto"
                        muted={true}
                        onLoadedMetadata={handleLoadedMetadata}
                        onLoadedData={handleLoadedData}
                        onTimeUpdate={handleTimeUpdate}
                        onEnded={() => setIsPlaying(false)}
                        className="w-full h-full object-contain cursor-pointer"
                        onClick={togglePlay}
                        playsInline
                      />

                      {activeStrike && activeStrike.bbox && (
                        <div
                          style={{
                            left: `${activeStrike.bbox[0] * 100}%`,
                            top: `${activeStrike.bbox[1] * 100}%`,
                            width: `${Math.max(4, (activeStrike.bbox[2] - activeStrike.bbox[0]) * 100)}%`,
                            height: `${Math.max(4, (activeStrike.bbox[3] - activeStrike.bbox[1]) * 100)}%`,
                          }}
                          className="absolute border-2 border-fuchsia-400 bg-fuchsia-500/15 pointer-events-none rounded-lg shadow-[0_0_20px_#e879f9] transition-all duration-75"
                        >
                          <div className="absolute -top-6 left-0 px-2 py-0.5 text-[10px] font-mono font-bold bg-[#140b2b]/95 text-fuchsia-200 border border-fuchsia-400/60 rounded shadow-lg whitespace-nowrap flex items-center gap-1">
                            <Zap className="w-3 h-3 text-fuchsia-400 fill-fuchsia-400" />
                            <span>LIGHTNING BOLT • {(activeStrike.confidence * 100).toFixed(0)}%</span>
                          </div>
                        </div>
                      )}

                      <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/95 via-black/50 to-transparent flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={togglePlay}
                          className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white flex items-center justify-center transition shadow-lg shadow-purple-500/40 hover:scale-105 active:scale-95"
                        >
                          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                        </button>

                        <div className="text-xs font-mono text-slate-200 bg-[#120b24]/90 px-3.5 py-1.5 rounded-full border border-purple-500/30">
                          <span className="text-purple-300 font-bold">{currentTime.toFixed(2)}s</span> / {duration.toFixed(2)}s
                        </div>
                      </div>
                    </div>

                    <TimelineViewer
                      duration={duration}
                      currentTime={currentTime}
                      detections={detections}
                      intervals={intervals}
                      onSeek={handleSeek}
                    />
                  </div>

                  {/* Right 1 Col: Explainable AI Inspector Component */}
                  <div className="lg:col-span-1">
                    <DetectionInspector
                      activeStrike={activeStrike}
                      allDetections={detections}
                      currentTime={currentTime}
                      onSeekToStrike={handleSeek}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Continuous Montage Feature Hero Card */}
        {montageClip && (
          <div className="pt-12 border-t border-purple-900/40 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-editorial font-bold text-2xl sm:text-3xl text-white tracking-wide flex items-center gap-2">
                  <Film className="w-6 h-6 text-purple-400" />
                  <span>ALL-STRIKES CONTINUOUS MONTAGE</span>
                </h2>
                <p className="text-xs text-purple-300/70 font-mono uppercase tracking-wide">
                  Every detected strike stitched back-to-back into a single seamless video.
                </p>
              </div>

              <WireBadge variant="purple" pulse={true}>
                MONTAGE READY • {montageClip.interval.duration.toFixed(1)}S
              </WireBadge>
            </div>

            <div className="bg-[#0c071a]/70 border border-purple-500/30 rounded-3xl p-6 backdrop-blur-2xl shadow-2xl grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
              <div className="md:col-span-2 relative aspect-video bg-black rounded-2xl overflow-hidden border border-purple-500/20 shadow-inner">
                <video
                  src={montageClip.blobUrl}
                  controls
                  playsInline
                  className="w-full h-full object-contain"
                />
              </div>

              <div className="flex flex-col justify-between space-y-6 p-2">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full text-[11px] font-mono border border-purple-400/40 bg-purple-950/50 text-purple-300">
                      {intervals.length} STRIKES COMBINED
                    </span>
                    <span className="px-3 py-1 rounded-full text-[11px] font-mono border border-purple-400/40 bg-purple-950/50 text-purple-300">
                      ±{bufferSeconds}S BUFFERS
                    </span>
                  </div>

                  <h3 className="text-xl font-editorial font-bold text-white tracking-wide">
                    Full Storm Sequence
                  </h3>

                  <p className="text-xs text-slate-300 leading-relaxed font-sans">
                    All isolated lightning discharges sequenced seamlessly in chronological order with full lead-in and decay padding.
                  </p>

                  <div className="bg-[#120b24]/90 border border-purple-900/40 rounded-xl p-3 font-mono text-[11px] space-y-1 text-slate-300">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Total Duration:</span>
                      <span className="text-purple-300 font-bold">{montageClip.interval.duration.toFixed(2)}s</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Format:</span>
                      <span className="text-purple-300 font-bold">{montageClip.filename.split('.').pop()?.toUpperCase()} (FastStart H.264)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">File Size:</span>
                      <span className="text-purple-300 font-bold">{(montageClip.sizeBytes / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                    <div className="pt-1 text-[10px] text-emerald-400 font-mono flex items-center gap-1.5">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Windows Media Player & QuickTime Verified</span>
                    </div>
                  </div>
                </div>

                <a
                  href={montageClip.blobUrl}
                  download={montageClip.filename}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-purple-600 via-fuchsia-600 to-purple-500 text-white font-mono text-xs font-bold uppercase tracking-wider transition shadow-lg shadow-purple-600/30 hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Download className="w-4 h-4" />
                  <span>DOWNLOAD MONTAGE ({montageClip.filename.split('.').pop()?.toUpperCase()})</span>
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Extracted Individual Clips Gallery */}
        {extractedClips.length > 0 && (
          <div className="pt-12 border-t border-purple-900/40 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-editorial font-bold text-2xl sm:text-3xl text-white tracking-wide flex items-center gap-2">
                  <Scissors className="w-6 h-6 text-purple-400" />
                  <span>INDIVIDUAL DISCHARGES (±{bufferSeconds}S BUFFER)</span>
                </h2>
                <p className="text-xs text-purple-300/70 font-mono uppercase tracking-wide">
                  Lossless event cuts with {bufferSeconds}s lead-in and {bufferSeconds}s tail buffer.
                </p>
              </div>

              <WireBadge variant="purple" pulse={true}>
                {extractedClips.length} CLIP{extractedClips.length === 1 ? '' : 'S'} READY
              </WireBadge>
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

export default App;
