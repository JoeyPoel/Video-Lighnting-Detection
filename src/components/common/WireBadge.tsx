import React from 'react';

export interface WireBadgeProps {
  children: React.ReactNode;
  variant?: 'purple' | 'cyan' | 'warning' | 'muted' | 'white';
  pulse?: boolean;
  className?: string;
}

/**
 * WireBadge Component
 * High-voltage indicator badge with electric purple styling.
 */
export const WireBadge: React.FC<WireBadgeProps> = ({
  children,
  variant = 'purple',
  pulse = false,
  className = '',
}) => {
  const variantStyles = {
    purple: 'border-purple-400/50 text-[#c084fc] shadow-[0_0_12px_rgba(168,85,247,0.3)] bg-[#120b24]/60',
    cyan: 'border-cyan-400/50 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.3)] bg-[#0c1424]/60',
    warning: 'border-amber-400/50 text-amber-300 bg-[#1e1308]/60',
    muted: 'border-purple-950 text-slate-400 bg-[#0c071a]/80',
    white: 'border-white/40 text-white shadow-[0_0_12px_rgba(255,255,255,0.4)] bg-[#120b24]/60',
  };

  return (
    <span
      className={`inline-flex items-center px-3.5 py-1 font-mono text-[10px] sm:text-[11px] tracking-[0.18em] uppercase rounded-full border whitespace-nowrap shrink-0 select-none ${
        variantStyles[variant]
      } ${pulse ? 'animate-pulse' : ''} ${className}`}
    >
      <span className="whitespace-nowrap">{children}</span>
    </span>
  );
};

export default WireBadge;
