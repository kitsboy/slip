/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // slip palette — calm, tool-grade. Bitcoin orange is the accent only.
        bg: 'var(--slip-bg)',
        surface: 'var(--slip-surface)',
        ink: 'var(--slip-ink)',
        muted: 'var(--slip-muted)',
        secondary: 'var(--slip-secondary)',
        line: 'var(--slip-line)',
        accent: 'var(--slip-accent)',
        good: 'var(--slip-good)',
        warn: 'var(--slip-warn)',
        bad: 'var(--slip-bad)',
      },
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
