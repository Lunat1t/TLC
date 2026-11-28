import { cp, copyFile, mkdir } from 'node:fs/promises'
// Keep the browser worker on the exact same version as the installed PDF.js.
const destination = new URL('../public/vendor/', import.meta.url)
await mkdir(destination, { recursive: true })
await copyFile(new URL('../node_modules/pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url), new URL('pdf.worker.min.mjs', destination))
// JPEG 2000 (openjpeg), JBIG2 and ICC decoders are WebAssembly modules that PDF.js loads from `wasmUrl`.
// Without them pages built from JPX images (for example LEGO EV3 instructions) render as blank white pages.
await cp(new URL('../node_modules/pdfjs-dist/wasm/', import.meta.url), new URL('pdfjs-wasm/', destination), { recursive: true })
