import React from 'react';

export interface GlowButtonProps {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'subtle';
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
  fullWidth?: boolean;
  id?: string;
}

/**
 * GlowButton Component
 * Lightning purple plasma action trigger with violet core and high-voltage glow.
 */
export const GlowButton: React.FC<GlowButtonProps> = ({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
  type = 'button',
  className = '',
  fullWidth = false,
  id,
}) => {
  const baseClasses =
    'relative inline-flex items-center justify-center font-mono font-bold tracking-[0.16em] uppercase text-xs sm:text-sm px-7 py-3.5 transition-all duration-300 focus:outline-none select-none disabled:opacity-40 disabled:cursor-not-allowed rounded-full group overflow-hidden cursor-pointer';

  const widthClass = fullWidth ? 'w-full' : '';

  const variantStyles = {
    primary:
      'bg-gradient-to-r from-[#8b5cf6] via-[#a855f7] to-[#8b5cf6] text-white shadow-[0_0_20px_rgba(168,85,247,0.5)] hover:shadow-[0_0_35px_rgba(168,85,247,0.85)] hover:brightness-110 active:scale-[0.98]',
    secondary:
      'bg-[#120b24]/90 text-[#f3e8ff] border border-purple-500/30 hover:border-purple-400 hover:text-white hover:shadow-[0_0_20px_rgba(168,85,247,0.35)] backdrop-blur-sm active:scale-[0.98]',
    outline:
      'bg-transparent text-[#c084fc] border border-purple-500/60 hover:bg-purple-600 hover:text-white hover:shadow-[0_0_25px_rgba(168,85,247,0.5)] active:scale-[0.98]',
    subtle:
      'bg-transparent text-[#e2e8f0] hover:text-[#c084fc] px-3 py-2 transition-colors',
  };

  return (
    <button
      id={id}
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${variantStyles[variant]} ${widthClass} ${className}`}
    >
      {/* Soft Light Shimmer */}
      <span
        aria-hidden="true"
        className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none bg-gradient-to-r from-transparent via-white/25 to-transparent"
      />

      <span className="relative z-10 flex items-center justify-center gap-2">{children}</span>
    </button>
  );
};

export default GlowButton;
