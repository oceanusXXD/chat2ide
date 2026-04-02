module.exports = {
  content: ['./web/index.html', './web/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#e8ecf2',
        canvas: '#05080d',
        panel: '#111924',
        panelAlt: '#0b1119',
        accent: '#e57f4a',
        accentSoft: '#f4a77a',
        success: '#3dd08f',
        warning: '#f6c85f',
        danger: '#ff6b5f',
        border: 'rgba(255,255,255,0.12)',
        bad: '#ff8c82',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', '"Avenir Next"', '"Segoe UI"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', '"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      boxShadow: {
        shell: '0 28px 80px rgba(2, 8, 18, 0.45)',
        glass: '0 24px 64px rgba(2, 8, 18, 0.38)',
      },
    },
  },
  plugins: [],
};
