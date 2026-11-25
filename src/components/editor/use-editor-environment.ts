"use client"

import * as React from "react"
import { requestEditorLandscape, shouldRequireEditorLandscape } from "@/lib/editor-orientation"
import type { BleSupport } from "@/components/editor/editor-dialogs"

/** True while the media query does NOT match (e.g. a narrow screen for a min-width query). */
export function useMediaQueryMiss(query: string) {
  const [miss, setMiss] = React.useState(false)
  React.useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMiss(!media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [query])
  return miss
}

/**
 * Requests landscape on mount and reports whether a touch device is held in portrait.
 * While blocked, the given root is made inert so only the orientation prompt is reachable.
 */
export function useLandscapeBlock(rootRef: React.RefObject<HTMLElement | null>) {
  const [blocked, setBlocked] = React.useState(false)
  React.useEffect(() => requestEditorLandscape(window.screen?.orientation, document), [])
  React.useEffect(() => {
    const pointerQuery = typeof window.matchMedia === "function" ? window.matchMedia("(pointer: coarse)") : null
    const update = () => setBlocked(shouldRequireEditorLandscape({
      width: window.innerWidth,
      height: window.innerHeight,
      coarsePointer: Boolean(pointerQuery?.matches),
    }))
    update()
    window.addEventListener("resize", update)
    window.addEventListener("orientationchange", update)
    pointerQuery?.addEventListener?.("change", update)
    window.screen?.orientation?.addEventListener?.("change", update)
    return () => {
      window.removeEventListener("resize", update)
      window.removeEventListener("orientationchange", update)
      pointerQuery?.removeEventListener?.("change", update)
      window.screen?.orientation?.removeEventListener?.("change", update)
    }
  }, [])
  React.useEffect(() => {
    if (rootRef.current) rootRef.current.inert = blocked
  }, [blocked, rootRef])
  return blocked
}

/** Whether Web Bluetooth can be used here, with a user-facing reason when it cannot. */
export function useBleSupport(): BleSupport {
  const [support, setSupport] = React.useState<BleSupport>({ checked: false, available: true, reason: "" })
  React.useEffect(() => {
    const hasBluetooth = Boolean((navigator as Navigator & { bluetooth?: unknown }).bluetooth)
    if (!window.isSecureContext) {
      setSupport({ checked: true, available: false, reason: "Для Bluetooth нужен адрес по HTTPS." })
    } else if (!hasBluetooth) {
      setSupport({ checked: true, available: false, reason: "Нужен Chrome или Edge на компьютере или Android." })
    } else {
      setSupport({ checked: true, available: true, reason: "" })
    }
  }, [])
  return support
}

/** Close popup menus on an outside pointer press or Escape. */
export function useDismissable(
  entries: readonly { open: boolean; ref: React.RefObject<HTMLElement | null>; close: () => void }[],
) {
  const latest = React.useRef(entries)
  latest.current = entries
  const anyOpen = entries.some(entry => entry.open)
  React.useEffect(() => {
    if (!anyOpen) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      for (const entry of latest.current) {
        if (entry.open && entry.ref.current && !entry.ref.current.contains(target)) entry.close()
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") for (const entry of latest.current) entry.close()
    }
    window.addEventListener("pointerdown", onPointerDown)
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [anyOpen])
}
