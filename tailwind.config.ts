import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'storm-void': 'var(--volt-storm-void)',
        'storm-abyss': 'var(--volt-storm-abyss)',
        'storm-surface': 'var(--volt-storm-surface)',
        'storm-elevated': 'var(--volt-storm-elevated)',
        'storm-glass': 'var(--volt-storm-glass)',

        'plasma-violet': 'var(--volt-plasma-violet)',
        'plasma-electric': 'var(--volt-plasma-electric)',
        'plasma-lavender': 'var(--volt-plasma-lavender)',
        'plasma-ice': 'var(--volt-plasma-ice)',
        'plasma-deep': 'var(--volt-plasma-deep)',

        'mono-pureWhite': 'var(--volt-mono-pureWhite)',
        'mono-silver': 'var(--volt-mono-silver)',
        'mono-muted': 'var(--volt-mono-muted)',
        'mono-hairline': 'var(--volt-mono-hairline)',
      },
      boxShadow: {
        'plasma-subtle': 'var(--volt-glow-plasma-subtle)',
        'plasma-intense': 'var(--volt-glow-plasma-intense)',
        'white-strobe': 'var(--volt-glow-white-strobe)',
      },
      fontFamily: {
        cybersigil: ['"Grenze Gotisch"', '"Pirata One"', 'serif'],
        sigil: ['"Pirata One"', '"Grenze Gotisch"', 'serif'],
        editorial: ['"Playfair Display"', 'Georgia', 'serif'],
        ritual: ['"Cinzel Decorative"', 'serif'],
        mono: ['"JetBrains Mono"', '"Space Mono"', 'monospace'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
