type DeviceOrientation = {
  lock?: (orientation: "landscape") => Promise<void>
  unlock: () => void
}

let currentRequest: symbol | undefined

export function requestEditorLandscape(orientation?: DeviceOrientation) {
  if (!orientation?.lock) return
  const request = Symbol()
  currentRequest = request
  const unlock = () => {
    try { orientation.unlock() } catch { /* Browser may disallow unlocking. */ }
  }
  try {
    void orientation.lock("landscape").then(() => {
      // Navigation can finish while the device is still rotating.
      if (!currentRequest) unlock()
    }, () => {})
  } catch {
    currentRequest = undefined
    return
  }
  return () => {
    if (currentRequest !== request) return
    currentRequest = undefined
    unlock()
  }
}
