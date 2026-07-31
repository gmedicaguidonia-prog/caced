import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')) as { version: string }

// Base relativa: funziona su GitHub Pages (sottocartella /caced/) e in locale.
export default defineConfig({
  plugins: [
    react(),
    {
      // version.json accanto all'app: il banner di aggiornamento lo confronta
      // con la versione in esecuzione e propone di ricaricare.
      name: 'scrivi-version-json',
      closeBundle() {
        try {
          mkdirSync(path.resolve(__dirname, 'dist'), { recursive: true })
          writeFileSync(
            path.resolve(__dirname, 'dist', 'version.json'),
            JSON.stringify({ version: pkg.version }),
          )
        } catch {
          /* ignora */
        }
      },
    },
  ],
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
