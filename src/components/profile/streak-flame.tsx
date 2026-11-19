import { useId } from "react"

const palettes = {
  orange: ["#E62E00", "#FF5912", "#FF8C1A", "#FFB01F", "#FFE885"],
  blue: ["#005CE6", "#1496FF", "#47C8FF", "#6BE2FF", "#D4F7FF"],
  purple: ["#5B16D9", "#8B3DFF", "#C07BFF", "#D59BFF", "#F3DBFF"],
  green: ["#008F4C", "#0EC76B", "#4CEB92", "#7BF5AC", "#D9FFE8"],
  pink: ["#C4004E", "#FF1E6E", "#FF669C", "#FF85B3", "#FFD6E7"],
} as const

export function StreakFlame({ size, color = "orange", muted = false }: {
  size: number
  color?: keyof typeof palettes
  muted?: boolean
}) {
  const id = useId()
  const [base, middle, tip, inner, heart] = palettes[color]
  return <svg viewBox="-126 -140 252 252" width={size} height={size} aria-hidden="true"
    style={muted ? { filter: "grayscale(1)", opacity: 0.45 } : undefined}>
    <defs>
      <linearGradient id={id} x1="0%" y1="100%" x2="0%" y2="0%">
        <stop offset="0%" stopColor={base} />
        <stop offset="55%" stopColor={middle} />
        <stop offset="100%" stopColor={tip} />
      </linearGradient>
    </defs>
    <path fill={`url(#${id})`} d="M10 -134 C4 -96 30 -66 48 -24 C56 -42 68 -54 74 -44 C94 -10 96 52 62 86 C32 114 -32 114 -62 86 C-96 52 -94 -8 -62 -52 C-38 -84 -12 -104 10 -134 Z" />
    <path fill={inner} d="M4 -68 C-2 -40 18 -18 28 8 C34 -4 44 -12 48 -4 C60 22 56 64 34 86 C14 102 -16 102 -36 86 C-58 64 -58 22 -36 -8 C-20 -32 -8 -48 4 -68 Z" />
    <path fill={heart} d="M2 6 C0 22 16 34 22 54 C26 72 16 88 0 90 C-16 88 -26 72 -22 54 C-18 36 -6 22 2 6 Z" />
  </svg>
}
