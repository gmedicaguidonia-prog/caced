/// <reference types="vite/client" />

/** Versione dell'app (da package.json, iniettata da Vite). */
declare const __APP_VERSION__: string

/** Moduli CommonJS condivisi con Electron (es. electron/motore.cjs). */
declare module '*.cjs' {
  const modulo: any
  export default modulo
}
