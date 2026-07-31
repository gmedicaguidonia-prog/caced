/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // I colori d'identità arrivano dalle variabili --t-* (vedi src/index.css):
        // cambiando tema cambiano tutte insieme.
        panna: 'var(--t-card)',
        sidebar: 'var(--t-sidebar)',
        velo: 'var(--t-velo)',
        cielo: {
          50: 'var(--t-tenue)',
          100: 'var(--t-bg)',
          200: 'var(--t-bordo)',
          300: 'var(--t-bordo-forte)',
          400: 'var(--t-fioco)',
          500: 'var(--t-accento)',
          600: 'var(--t-primario)',
          700: 'var(--t-testo)',
          800: 'var(--t-titolo)',
        },
      },
    },
  },
  plugins: [],
}
