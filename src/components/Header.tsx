import React from 'react';
import { Zap, Video, ShieldCheck } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Zap className="w-6 h-6 text-white fill-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg font-bold text-white tracking-tight">VoltClip AI</h1>
              <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-800 text-cyan-400">
                YOLO & Vision
              </span>
            </div>
            <p className="text-xs text-slate-400">Lightning Strike Detection & +1s Event Buffer Slicer</p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="hidden sm:flex items-center space-x-2 text-xs text-slate-300 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Zero-Upload Client Processing</span>
          </div>
          <div className="flex items-center space-x-1.5 text-xs text-cyan-400 bg-cyan-950/50 border border-cyan-900 px-3 py-1.5 rounded-lg">
            <Video className="w-4 h-4" />
            <span>Buffer: -1s / +1s</span>
          </div>
        </div>
      </div>
    </header>
  );
};

