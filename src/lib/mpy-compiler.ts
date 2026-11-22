import { compile } from "@pybricks/mpy-cross-v6"
import { buildMultiMpy6Blob } from "../../public/pybricks-protocol.js"
import { HUB_PROGRAM_SOURCE } from "./hub-program-source.ts"

export const MAX_PYTHON_SOURCE_CHARS = 20_000
const MAX_CACHED_BLOBS = 8
const cachedBlobs = new Map<string, Uint8Array>()

export function getCompilerCacheSize(): number {
  return cachedBlobs.size
}

export async function compilePythonToMultiMpy6(
  source: string,
  options?: { moduleName?: string; fileName?: string; wasmPath?: string; cache?: boolean }
): Promise<Uint8Array> {
  if (typeof source !== "string" || !source.trim()) {
    throw new Error("Код программы пуст. Напишите программу или нажмите «Из блоков».")
  }
  if (source.length > MAX_PYTHON_SOURCE_CHARS) {
    throw new Error(`Код слишком длинный (максимум ${MAX_PYTHON_SOURCE_CHARS} символов).`)
  }

  const moduleName = options?.moduleName ?? "__main__"
  const fileName = options?.fileName ?? `${moduleName}.py`
  const useCache = options?.cache === true
  const cacheKey = `${moduleName}\0${source}`
  if (useCache) {
    const existing = cachedBlobs.get(cacheKey)
    if (existing) return existing
  }

  const wasmPath =
    options?.wasmPath ??
    (typeof window !== "undefined" ? "/vendor/mpy-cross-v6.wasm" : undefined)

  const result = await compile(fileName, source, undefined, wasmPath)
  if (result.status !== 0 || !result.mpy) {
    const details = result.err.join("\n").trim() || `код выхода ${result.status}`
    throw new Error(`Ошибка в коде Python: ${details}`)
  }

  const blob = buildMultiMpy6Blob([{ name: moduleName, mpy: result.mpy }])
  if (useCache) {
    if (cachedBlobs.size >= MAX_CACHED_BLOBS) {
      const oldestKey = cachedBlobs.keys().next().value
      if (oldestKey !== undefined) cachedBlobs.delete(oldestKey)
    }
    cachedBlobs.set(cacheKey, blob)
  }
  return blob
}

let cachedHubProgramPromise: Promise<Uint8Array> | null = null

export function compileBundledHubProgram(): Promise<Uint8Array> {
  if (!cachedHubProgramPromise) {
    cachedHubProgramPromise = compilePythonToMultiMpy6(HUB_PROGRAM_SOURCE, { cache: true }).catch((error) => {
      cachedHubProgramPromise = null
      throw error
    })
  }
  return cachedHubProgramPromise
}
