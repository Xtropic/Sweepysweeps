/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gold:  { DEFAULT: '#D4A017', tint: '#F5E6B0', dark: '#8B6A0A', prize: '#4A2E00' },
        green: { DEFAULT: '#1A6B3A', tint: '#D6EFE0', dark: '#0D3D20' },
        navy:  { DEFAULT: '#0D1B2A', tint: '#D6E3F0', dark: '#0D2347' },
        red:   { DEFAULT: '#C0392B', tint: '#F8DFDC', dark: '#7A1C12' },
        cream: '#FAF7F0',
        sand:  '#E8E0CC',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      lineHeight: {
        body: '1.7',
      },
      borderRadius: {
        card: '12px',
        badge: '8px',
      },
    },
  },
  plugins: [],
}
