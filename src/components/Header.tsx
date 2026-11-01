import React from 'react';
import { Sparkles } from 'lucide-react';

interface HeaderProps {
  onToggleStorm?: () => void;
  isStormActive?: boolean;
}

/**
 * Ultra-Clean Minimalist Header Navigation
 * Stripped of clutter, highlighting pure brand wordmark and atmospheric control.
 */
export const Header: React.FC<HeaderProps> = ({ onToggleStorm, isStormActive = true }) => {
  return (
    <header className="sticky top-0 z-40 w-full bg-[#07040d]/40 backdrop-blur-2xl select-none border-b border-purple-900/20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between">
        {/* Clean Pure Wordmark */}
        <span className="font-editorial italic tracking-tight text-xl sm:text-2xl text-white plasma-glow-text">
          VØLTCLIP
        </span>

        {/* Minimalist Storm Toggle */}
        {onToggleStorm && (
          <button
            type="button"
            onClick={onToggleStorm}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full font-mono text-[10px] tracking-[0.18em] uppercase transition-all border backdrop-blur-xl ${
              isStormActive
                ? 'border-purple-500/40 text-purple-200 bg-[#1a1033]/50 shadow-[0_0_15px_rgba(168,85,247,0.25)]'
                : 'border-purple-950/60 text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3 h-3 text-purple-400" />
            <span>{isStormActive ? 'STORM FX' : 'MUTED'}</span>
          </button>
        )}
      </div>
    </header>
  );
};

export default Header;
