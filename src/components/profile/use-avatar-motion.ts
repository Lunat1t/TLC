"use client"

import { useEffect, useRef } from "react"

export function useAvatarMotion() {
  const characterRef = useRef<SVGSVGElement>(null)
  const gazeRef = useRef<SVGGElement>(null)
  const eyelidsRef = useRef<SVGGElement>(null)

  useEffect(() => {
    const character = characterRef.current, gaze = gazeRef.current, eyelids = eyelidsRef.current
    if (!character || !gaze || !eyelids) return
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    let frame = 0
    let blinkTimer: ReturnType<typeof setTimeout> | undefined
    let resetTimer: ReturnType<typeof setTimeout> | undefined
    let blink: Animation | undefined
    let target: { x: number; y: number } | null = null

    function resetGaze() {
      target = null
      cancelAnimationFrame(frame)
      frame = 0
      gaze!.style.transform = "translate(0px, 0px)"
    }

    function updateGaze() {
      frame = 0
      if (!target) return
      // The screen matrix includes the SVG's letterboxing and face zoom.
      const matrix = character!.getScreenCTM()
      if (!matrix) return
      const point = new DOMPoint(target.x, target.y).matrixTransform(matrix.inverse())
      const dx = (point.x - 310) / 180, dy = (point.y - 160) / 180
      const distance = Math.max(1, Math.hypot(dx, dy))
      gaze!.style.transform = `translate(${dx / distance * 32}px, ${dy / distance * 24}px)`
    }

    function follow(event: PointerEvent) {
      if (reducedMotion.matches || document.hidden || !event.isPrimary) return
      clearTimeout(resetTimer)
      target = { x: event.clientX, y: event.clientY }
      if (!frame) frame = requestAnimationFrame(updateGaze)
    }

    function release(event: PointerEvent) {
      if (event.pointerType !== "mouse") resetTimer = setTimeout(resetGaze, 900)
    }
    function leave(event: PointerEvent) { if (!event.relatedTarget) resetGaze() }

    function scheduleBlink() {
      clearTimeout(blinkTimer)
      if (reducedMotion.matches || document.hidden) return
      blinkTimer = setTimeout(() => {
        blink = eyelids!.animate([
          { transform: "scaleY(1)", offset: 0 },
          { transform: "scaleY(0.06)", offset: 0.45 },
          { transform: "scaleY(1)", offset: 1 },
        ], { duration: 180, easing: "ease-in-out" })
        scheduleBlink()
      }, 2500 + Math.random() * 3500)
    }

    function syncMotion() {
      clearTimeout(blinkTimer)
      clearTimeout(resetTimer)
      blink?.cancel()
      resetGaze()
      scheduleBlink()
    }

    scheduleBlink()
    window.addEventListener("pointermove", follow, { passive: true })
    window.addEventListener("pointerdown", follow, { passive: true })
    window.addEventListener("pointerup", release, { passive: true })
    window.addEventListener("pointercancel", resetGaze)
    window.addEventListener("pointerout", leave)
    window.addEventListener("blur", resetGaze)
    document.addEventListener("visibilitychange", syncMotion)
    reducedMotion.addEventListener("change", syncMotion)
    return () => {
      clearTimeout(blinkTimer)
      clearTimeout(resetTimer)
      cancelAnimationFrame(frame)
      blink?.cancel()
      window.removeEventListener("pointermove", follow)
      window.removeEventListener("pointerdown", follow)
      window.removeEventListener("pointerup", release)
      window.removeEventListener("pointercancel", resetGaze)
      window.removeEventListener("pointerout", leave)
      window.removeEventListener("blur", resetGaze)
      document.removeEventListener("visibilitychange", syncMotion)
      reducedMotion.removeEventListener("change", syncMotion)
    }
  }, [])

  return { characterRef, gazeRef, eyelidsRef }
}
