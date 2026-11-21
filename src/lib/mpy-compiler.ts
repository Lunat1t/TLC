import { compile } from "@pybricks/mpy-cross-v6"
import { buildMultiMpy6Blob } from "../../public/pybricks-protocol.js"
import { HUB_PROGRAM_SOURCE } from "./hub-program-source.ts"

const cachedBlobs = new Map<string, Uint8Array>()

export async function compilePythonToMultiMpy6(
  source: string,
  options?: { moduleName?: string; fileName?: string; wasmPath?: string }
): Promise<Uint8Array> {
  const moduleName = options?.moduleName ?? "__main__"
  const fileName = options?.fileName ?? `${moduleName}.py`
  const cacheKey = `${moduleName}\0${source}`
  const existing = cachedBlobs.get(cacheKey)
  if (existing) return existing

  const wasmPath =
    options?.wasmPath ??
    (typeof window !== "undefined" ? "/vendor/mpy-cross-v6.wasm" : undefined)

  const result = await compile(fileName, source, undefined, wasmPath)
  if (result.status !== 0 || !result.mpy) {
    const details = result.err.join("\n").trim() || `код выхода ${result.status}`
    throw new Error(`Не удалось скомпилировать программу для хаба: ${details}`)
  }

  const blob = buildMultiMpy6Blob([{ name: moduleName, mpy: result.mpy }])
  cachedBlobs.set(cacheKey, blob)
  return blob
}

let cachedHubProgramPromise: Promise<Uint8Array> | null = null

export function compileBundledHubProgram(): Promise<Uint8Array> {
  if (!cachedHubProgramPromise) {
    cachedHubProgramPromise = compilePythonToMultiMpy6(HUB_PROGRAM_SOURCE).catch((error) => {
      cachedHubProgramPromise = null
      throw error
    })
  }
  return cachedHubProgramPromise
}
