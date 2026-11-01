/**
 * VoltClip Lightning Studio — Centralized Theme Tokens
 * Electric Violet & Ultraviolet Plasma Theme for Lightning Strike Detection.
 */

export const THEME = {
  colors: {
    storm: {
      void: '#07040d',
      abyss: '#0c071a',
      surface: '#120b24',
      elevated: '#1a1033',
      glass: 'rgba(12, 7, 26, 0.75)',
    },
    plasma: {
      violet: '#8b5cf6',
      electric: '#a855f7',
      lavender: '#c084fc',
      ice: '#f3e8ff',
      pureWhite: '#ffffff',
      deepPurple: '#581c87',
    },
    mono: {
      pureWhite: '#ffffff',
      silver: '#e2e8f0',
      muted: '#94a3b8',
      dark: '#1e1b4b',
      hairline: 'rgba(168, 85, 247, 0.18)',
    },
    state: {
      live: '#a855f7',
      warning: '#fbbf24',
      success: '#34d399',
    },
  },
  glows: {
    plasmaSubtle: '0 0 16px rgba(168, 85, 247, 0.35)',
    plasmaIntense: '0 0 25px rgba(168, 85, 247, 0.75), 0 0 50px rgba(139, 92, 246, 0.45)',
    whiteStrobe: '0 0 20px rgba(255, 255, 255, 0.9)',
  },
  borders: {
    subtle: '1px solid rgba(168, 85, 247, 0.25)',
    plasmaLaser: '1px solid rgba(168, 85, 247, 0.65)',
    active: '1px solid #c084fc',
  },
} as const;

export type Theme = typeof THEME;
