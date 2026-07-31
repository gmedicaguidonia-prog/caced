// Genera build/icon.ico (icona di CACCA.exe) da build/icona.svg,
// più un'anteprima PNG grande per controllare il disegno.

import { Resvg } from '@resvg/resvg-js'
import pngToIco from 'png-to-ico'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const svg = readFileSync('build/icona.svg', 'utf8')

// Windows sceglie la misura in base al contesto (desktop, barra, Alt+Tab).
const misure = [256, 128, 96, 64, 48, 32, 24, 16]
const pngs = misure.map((m) => new Resvg(svg, { fitTo: { mode: 'width', value: m } }).render().asPng())

mkdirSync('build', { recursive: true })
const ico = await pngToIco(pngs)
writeFileSync('build/icon.ico', ico)
console.log(`build/icon.ico generato (${misure.join(', ')} px — ${ico.length} byte)`)

writeFileSync('build/anteprima-icona.png', new Resvg(svg, { fitTo: { mode: 'width', value: 512 } }).render().asPng())
console.log('build/anteprima-icona.png generata (controllo visivo)')
