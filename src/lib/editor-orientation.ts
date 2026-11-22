export type DeviceOrientation = {
  lock?: (orientation: "landscape") => Promise<void>
  unlock?: () => void
}

export type FullscreenDocument = {
  fullscreenElement?: Element | null
  exitFullscreen?: () => Promise<void>
}

export type FullscreenTarget = {
  requestFullscreen?: () => Promise<void>
}

export type EditorViewportMetrics = {
  width: number
  height: number
  coarsePointer?: boolean
}

let currentRequest: symbol | undefined
let fullscreenOwnedByEditor = false

export function shouldRequireEditorLandscape({
  width,
  height,
  coarsePointer = false,
}: EditorViewportMetrics): boolean {
  if (!(width > 0 && height > 0)) return false
  if (height <= width) return false
  return width <= 900 || coarsePointer
}

export function requestEditorLandscape(
  orientation?: DeviceOrientation,
  doc?: FullscreenDocument,
) {
  const request = Symbol()
  currentRequest = request
  const unlock = () => {
    try {
      orientation?.unlock?.()
    } catch {
      /* Browser may disallow unlocking. */
    }
    if (fullscreenOwnedByEditor) {
      fullscreenOwnedByEditor = false
      if (doc?.fullscreenElement && doc.exitFullscreen) {
        try {
          void Promise.resolve(doc.exitFullscreen()).catch(() => {})
        } catch {
          /* Ignore fullscreen exit failures. */
        }
      }
    }
  }

  if (orientation?.lock) {
    try {
      void Promise.resolve(orientation.lock("landscape")).then(
        () => {
          // Navigation can finish while the device is still rotating.
          if (currentRequest !== request) unlock()
        },
        () => {},
      )
    } catch {
      /* Ignore browsers requiring fullscreen or a user gesture. */
    }
  }

  return () => {
    if (currentRequest !== request) return
    currentRequest = undefined
    unlock()
  }
}

export async function enterEditorLandscape({
  target,
  doc,
  orientation,
}: {
  target?: FullscreenTarget | null
  doc?: FullscreenDocument | null
  orientation?: DeviceOrientation
}): Promise<"locked" | "manual"> {
  if (target?.requestFullscreen && !doc?.fullscreenElement) {
    try {
      await target.requestFullscreen()
      fullscreenOwnedByEditor = true
    } catch {
      /* Fullscreen may be unavailable (e.g. iOS Safari); still try lock(). */
    }
  }

  if (!orientation?.lock) return "manual"

  try {
    await orientation.lock("landscape")
    return "locked"
  } catch {
    return "manual"
  }
}
