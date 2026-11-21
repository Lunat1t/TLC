import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'

// Keep the browser compiler WASM and embedded hub runner source aligned with public/hub_program.py.
const destination = new URL('../public/vendor/', import.meta.url)
await mkdir(destination, { recursive: true })
await copyFile(
  new URL('../node_modules/@pybricks/mpy-cross-v6/build/mpy-cross-v6.wasm', import.meta.url),
  new URL('mpy-cross-v6.wasm', destination)
)

const hubSource = await readFile(new URL('../public/hub_program.py', import.meta.url), 'utf8')
await writeFile(
  new URL('../src/lib/hub-program-source.ts', import.meta.url),
  `// Auto-generated from public/hub_program.py by scripts/sync-mpy-wasm.mjs\nexport const HUB_PROGRAM_SOURCE = ${JSON.stringify(hubSource)};\n`,
  'utf8'
)
