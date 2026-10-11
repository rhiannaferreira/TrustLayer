/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: token('canvas'),
        surface: token('surface'),
        raised: token('raised'),
        overlay: token('overlay'),
        line: token('line'),
        'line-strong': token('line-strong'),
        ink: token('ink'),
        muted: token('muted'),
        faint: token('faint'),
        accent: token('accent'),
        'accent-soft': token('accent-soft'),
        violet: token('violet'),
        safe: token('safe'),
        warn: token('warn'),
        danger: token('danger'),
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        card: '0 1px 0 0 rgb(255 255 255 / 0.03) inset, 0 1px 2px 0 rgb(0 0 0 / 0.25)',
        pop: '0 12px 40px -12px rgb(0 0 0 / 0.6)',
        glow: '0 0 0 1px rgb(var(--accent) / 0.35), 0 0 24px -6px rgb(var(--accent) / 0.45)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
        'slide-in': { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgb(var(--accent) / 0.5)' },
          '100%': { boxShadow: '0 0 0 8px rgb(var(--accent) / 0)' },
        },
        shimmer: { from: { backgroundPosition: '-200% 0' }, to: { backgroundPosition: '200% 0' } },
        flow: { from: { strokeDashoffset: '24' }, to: { strokeDashoffset: '0' } },
      },
      animation: {
        'fade-in': 'fade-in 220ms ease-out both',
        'slide-in': 'slide-in 240ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'pulse-ring': 'pulse-ring 1.2s ease-out infinite',
        shimmer: 'shimmer 1.6s linear infinite',
        flow: 'flow 0.8s linear infinite',
      },
    },
  },
  plugins: [],
};
