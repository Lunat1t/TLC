"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"
import type { CharacterEmotion, CharacterId } from "@/lib/characters"
import "./shape-character.css"

const GLASSES_DURATION_MS = 4600
const RANDOM_EMOTIONS: CharacterEmotion[] = ["joy", "focus", "wink", "sleepy", "cool"]
const EYE_OFFSETS: Record<CharacterId, number> = { cloud: -22, rectangle: -19, square: -31, triangle: -27, star: 8 }
const EYE_SCALES: Record<CharacterId, number> = { cloud: 1, rectangle: 1, square: 1, triangle: .86, star: .92 }

const HANDS = {
  cloud: { x: 146, y: 17, edge: 105, path: "M 146 -18 C 156 -15, 161 -9, 163 3 C 166 23, 166 39, 158 48 C 149 57, 135 55, 131 44 C 127 33, 125 18, 125 1 C 125 -13, 134 -21, 146 -18 Z" },
  rectangle: { x: 186, y: 7, edge: 145, path: "M 186 -31 C 197 -29, 203 -21, 205 -9 C 208 11, 208 29, 200 38 C 191 47, 176 45, 172 34 C 168 23, 166 6, 166 -10 C 166 -24, 174 -33, 186 -31 Z" },
  square: { x: 141, y: 0, edge: 103, path: "M 123 -36 Q 141 -38, 160 -35 Q 163 0, 160 35 Q 141 38, 123 35 Q 120 0, 123 -36 Z" },
  triangle: { x: 145, y: 32, edge: 123, path: "M 127 -4 C 136 -6, 143 -1, 148 10 C 156 27, 162 45, 160 56 C 157 69, 144 74, 135 65 C 128 57, 121 41, 114 24 C 109 9, 115 -1, 127 -4 Z" },
  star: { x: 150, y: 53, edge: 142, path: "M 140 20 C 148 18, 154 22, 159 32 C 165 48, 170 65, 168 76 C 167 88, 154 92, 145 84 C 138 76, 133 61, 127 45 C 123 31, 128 23, 140 20 Z" },
} satisfies Record<CharacterId, { x: number; y: number; edge: number; path: string }>

export function ShapeCharacter({
  id,
  bodyColor,
  eyeColor,
  randomEmotions = false,
  className,
}: {
  id: CharacterId
  bodyColor: string
  eyeColor: string
  randomEmotions?: boolean
  className?: string
}) {
  const [emotion, setEmotion] = useState<CharacterEmotion>("base")
  const [eyesClosed, setEyesClosed] = useState(false)
  const sceneRef = useRef<SVGSVGElement>(null)
  const hand = HANDS[id]
  const eyeY = EYE_OFFSETS[id]
  const eyeScale = EYE_SCALES[id]
  const wearingGlasses = emotion === "cool"
  const motionStyle = {
    "--glasses-duration": `${GLASSES_DURATION_MS}ms`,
    "--eye-y": `${eyeY}px`,
    "--eye-scale": eyeScale,
    "--grip-x": `${55 * eyeScale}px`,
    "--grip-y": `${eyeY + 10 * eyeScale}px`,
    "--rest-x": `${hand.x}px`,
    "--rest-y": `${hand.y}px`,
    "--side-y": `${hand.y - 10}px`,
    "--escape-x": `${hand.edge + 43}px`,
  } as CSSProperties

  useEffect(() => {
    if (!randomEmotions) return
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)")
    let timer: number
    let previous: CharacterEmotion = "base"

    function blinkInto(next: CharacterEmotion, done: () => void) {
      setEyesClosed(true)
      timer = window.setTimeout(() => {
        setEmotion(next)
        setEyesClosed(false)
        done()
      }, 140)
    }

    function schedule() {
      timer = window.setTimeout(() => {
        const choices = RANDOM_EMOTIONS.filter(item => item !== previous)
        const next = choices[Math.floor(Math.random() * choices.length)]
        previous = next
        if (next === "cool") {
          setEmotion(next)
          return
        }
        blinkInto(next, () => {
          timer = window.setTimeout(
            () => blinkInto("base", schedule),
            1500 + Math.random() * 1000,
          )
        })
      }, 6500 + Math.random() * 8500)
    }

    function restart() {
      window.clearTimeout(timer)
      setEmotion("base")
      setEyesClosed(false)
      if (!reduced.matches) schedule()
    }

    function finishGlasses(event: AnimationEvent) {
      if (event.animationName !== "shape-glasses-front" || reduced.matches) return
      setEmotion("base")
      schedule()
    }

    const scene = sceneRef.current
    scene?.addEventListener("animationend", finishGlasses)
    reduced.addEventListener("change", restart)
    if (!reduced.matches) schedule()
    return () => {
      window.clearTimeout(timer)
      reduced.removeEventListener("change", restart)
      scene?.removeEventListener("animationend", finishGlasses)
    }
  }, [randomEmotions])

  function glassesLayer(layer: "behind" | "front") {
    return (
      <g className={`shape-glasses-layer shape-glasses-${layer}`} aria-hidden="true">
        <g className="shape-glasses-prop">
          <Glasses square={id === "square"} />
        </g>
        <g className="shape-glasses-hand" fill={bodyColor}>
          <path d={hand.path} transform={`translate(${-hand.x} ${-hand.y})`} />
        </g>
      </g>
    )
  }

  return (
    <svg ref={sceneRef} className={className} viewBox="-220 -150 440 300" role="img" aria-label={`${id}, ${emotionLabel(emotion)}`} xmlns="http://www.w3.org/2000/svg">
      <g className="shape-character-motion" data-emotion={emotion} style={motionStyle}>
        {wearingGlasses && glassesLayer("behind")}
        <g className="shape-character-body" fill={bodyColor}>
          {id === "cloud" && <>
            <path d="M -2 -94 C 56 -96, 106 -61, 105 9 C 104 41, 107 59, 104 72 C 101 89, 91 96, 77 95 C 30 93, -34 97, -79 95 C -97 94, -106 86, -105 69 C -104 48, -107 28, -105 7 C -102 -59, -58 -92, -2 -94 Z" />
            <path d="M -146 -18 C -132 -22, -123 -12, -125 3 C -127 22, -129 37, -133 46 C -137 56, -152 57, -161 48 C -167 40, -165 21, -162 1 C -160 -11, -155 -15, -146 -18 Z" />
          </>}
          {id === "rectangle" && <>
            <path d="M -98 -92 C -34 -95, 36 -91, 98 -93 C 128 -94, 145 -77, 145 -47 C 146 -15, 144 19, 145 47 C 146 77, 129 93, 99 93 C 38 94, -38 92, -99 93 C -130 93, -146 76, -145 47 C -144 17, -146 -15, -145 -47 C -144 -78, -128 -91, -98 -92 Z" />
            <path d="M -186 -31 C -172 -33, -164 -23, -166 -8 C -168 10, -170 26, -174 36 C -178 46, -194 47, -203 37 C -209 29, -207 9, -204 -11 C -202 -23, -196 -29, -186 -31 Z" />
          </>}
          {id === "square" && <>
            <path d="M -100 -99 Q 0 -103, 100 -99 Q 103 0, 99 100 Q 0 103, -99 99 Q -103 0, -100 -99 Z" />
            <path d="M -160 -35 Q -141 -38, -123 -35 Q -120 0, -124 36 Q -141 39, -160 36 Q -163 0, -160 -35 Z" />
          </>}
          {id === "triangle" && <>
            <path d="M -16 -104 C -6 -130, 6 -130, 16 -104 C 52 -35, 88 35, 123 104 C 136 129, 125 135, 103 134 C 34 132, -34 136, -103 134 C -127 134, -137 128, -123 103 C -88 35, -51 -35, -16 -104 Z" />
            <path d="M -127 -4 C -115 -1, -109 10, -114 25 C -121 43, -128 57, -135 65 C -144 74, -158 69, -160 55 C -162 44, -156 26, -148 9 C -142 -2, -135 -6, -127 -4 Z" />
          </>}
          {id === "star" && <>
            <path d="M -13 -118 C -4 -132, 5 -132, 13 -118 L 40 -78 C 54 -58, 63 -55, 77 -51 L 123 -37 C 142 -32, 143 -24, 131 -13 L 102 25 C 88 44, 88 55, 88 69 L 89 117 C 89 136, 80 137, 68 132 L 23 116 C 6 110, -6 110, -23 116 L -68 132 C -81 137, -89 135, -89 117 L -88 68 C -88 54, -89 44, -102 25 L -131 -13 C -143 -25, -141 -33, -123 -37 L -77 -51 C -63 -56, -54 -60, -40 -78 Z" />
            <path d="M -140 20 C -128 23, -123 32, -127 47 C -133 63, -138 76, -145 84 C -154 92, -167 88, -168 75 C -170 64, -165 47, -158 31 C -153 21, -148 18, -140 20 Z" />
          </>}
          <path className="shape-character-resting-hand" d={hand.path} />
        </g>
        <g transform={`translate(0 ${eyeY}) scale(${eyeScale})`}>
          <g className="shape-character-eyes" data-closed={eyesClosed}>
            <Eyes id={id} emotion={wearingGlasses ? "base" : emotion} color={eyeColor} />
          </g>
        </g>
        {wearingGlasses && glassesLayer("front")}
      </g>
    </svg>
  )
}

function Glasses({ square }: { square: boolean }) {
  const linecap = square ? "square" : "round"
  return <g fill="#161A26">
    <rect x="-68" y="-33" width="60" height="66" rx={square ? 0 : 18} />
    <rect x="8" y="-33" width="60" height="66" rx={square ? 0 : 18} />
    <rect x="-14" y={square ? -14 : -12} width="28" height="10" rx={square ? 0 : 5} />
    <line x1="-54" y1="-8" x2="-36" y2="8" stroke="#fff" strokeWidth="5.5" strokeLinecap={linecap} strokeOpacity=".75" />
    <line x1="22" y1="-8" x2="40" y2="8" stroke="#fff" strokeWidth="5.5" strokeLinecap={linecap} strokeOpacity=".75" />
  </g>
}

function Eyes({ id, emotion, color }: { id: CharacterId; emotion: CharacterEmotion; color: string }) {
  const square = id === "square"
  const linecap = square ? "square" : "round"
  if (emotion === "joy") return square
    ? <g fill="none" stroke={color} strokeWidth="14" strokeLinejoin="miter"><path d="M -44 10 L -26 -10 L -8 10" /><path d="M 8 10 L 26 -10 L 44 10" /></g>
    : <g fill="none" stroke={color} strokeWidth="14" strokeLinecap="round"><path d="M -46 8 A 20 20 0 0 1 -8 8" /><path d="M 8 8 A 20 20 0 0 1 46 8" /></g>
  if (emotion === "focus") return <g fill={color}><rect x="-48" y="-9" width="38" height="18" rx={square ? 0 : 9} /><rect x="10" y="-9" width="38" height="18" rx={square ? 0 : 9} /></g>
  if (emotion === "sleepy") return square
    ? <g fill="none" stroke={color} strokeWidth="13" strokeLinejoin="miter"><path d="M -44 -8 L -26 10 L -8 -8" /><path d="M 8 -8 L 26 10 L 44 -8" /></g>
    : <g fill="none" stroke={color} strokeWidth="13" strokeLinecap="round"><path d="M -46 -6 A 19 19 0 0 0 -8 -6" /><path d="M 8 -6 A 19 19 0 0 0 46 -6" /></g>
  if (emotion === "wink") return <g fill={color}>
    {square
      ? <path d="M -37 -31 Q -24 -33, -11 -31 Q -10 0, -12 31 Q -24 33, -36 31 Q -38 0, -37 -31 Z" />
      : <path d="M -38 -19 C -38 -33, -16 -33, -16 -19 Q -15.5 0, -16 19 C -16 33, -38 33, -38 19 Q -38.5 0, -38 -19 Z" />}
    <path d="M 14 0 L 40 -14 M 14 0 L 40 14" fill="none" stroke={color} strokeWidth="13" strokeLinecap={linecap} strokeLinejoin={square ? "miter" : "round"} />
  </g>
  return square
    ? <g fill={color}><path d="M -37 -31 Q -24 -33, -11 -31 Q -10 0, -12 31 Q -24 33, -36 31 Q -38 0, -37 -31 Z" /><path d="M 11 -31 Q 24 -33, 37 -31 Q 38 0, 36 31 Q 24 33, 12 31 Q 10 0, 11 -31 Z" /></g>
    : <g fill={color}><path d="M -38 -19 C -38 -33, -16 -33, -16 -19 Q -15.5 0, -16 19 C -16 33, -38 33, -38 19 Q -38.5 0, -38 -19 Z" /><path d="M 16 -19 C 16 -33, 38 -33, 38 -19 Q 38.5 0, 38 19 C 38 33, 16 33, 16 19 Q 15.5 0, 16 -19 Z" /></g>
}

function emotionLabel(emotion: CharacterEmotion) {
  switch (emotion) {
    case "joy": return "радость"
    case "focus": return "сосредоточенность"
    case "wink": return "подмигивание"
    case "sleepy": return "сонливость"
    case "cool": return "крутость"
    default: return "спокойствие"
  }
}
