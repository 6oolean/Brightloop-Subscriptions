// One palette, defined once. Pages only use these tokens, so the whole app stays consistent.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'] },
      colors: {
        paper: '#f3f4f1', surface: '#ffffff', line: '#dfe3dc', ink: '#1b2430', muted: '#5d6875',
        brand: { DEFAULT: '#0b5d57', dark: '#084843', soft: '#e1f0ee' },
        ok: { DEFAULT: '#1f7a4d', soft: '#e0f2e8' }, warn: { DEFAULT: '#9a6200', soft: '#fbefd5' },
        bad: { DEFAULT: '#b42318', soft: '#fbe4e1' }, info: { DEFAULT: '#2c5aa0', soft: '#e3ecf8' },
      },
      borderRadius: { DEFAULT: '6px', lg: '10px' },
    },
  },
  plugins: [],
};
