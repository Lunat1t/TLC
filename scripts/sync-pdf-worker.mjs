import { copyFile, mkdir } from 'node:fs/promises'
// Keep the browser worker on the exact same version as the installed PDF.js.
const destination = new URL('../public/vendor/', import.meta.url)
await mkdir(destination, { recursive: true })
await copyFile(new URL('../node_modules/pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url), new URL('pdf.worker.min.mjs', destination))
