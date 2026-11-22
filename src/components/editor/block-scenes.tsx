import React from "react"

export function UltrasonicEyesScene({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
      <rect x="2" y="6" width="14" height="12" rx="4" stroke="currentColor" strokeWidth="2" />
      <circle cx="6.5" cy="12" r="2" fill="currentColor" />
      <circle cx="11.5" cy="12" r="2" fill="currentColor" />
      <path d="M18 9.5C19 10.7 19 13.3 18 14.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="20.5" y="6" width="2" height="12" rx="1" fill="currentColor" />
    </svg>
  )
}

export function DistanceCompareScene({ mode, size = 16 }: { mode: "lt" | "gt"; size?: number }) {
  return mode === "lt" ? (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true" className="shrink-0">
      <circle cx="6" cy="10" r="3" fill="currentColor" />
      <path d="M10.5 10H14.5M14.5 10L12.5 8M14.5 10L12.5 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="16" y="4" width="2.5" height="12" rx="1" fill="currentColor" />
    </svg>
  ) : (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true" className="shrink-0">
      <circle cx="4" cy="10" r="3" fill="currentColor" />
      <path d="M12.5 10H8.5M8.5 10L10.5 8M8.5 10L10.5 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="15.5" y="4" width="2.5" height="12" rx="1" fill="currentColor" />
    </svg>
  )
}

export function ColorBeamScene({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
      <rect x="7" y="3" width="10" height="7" rx="2.5" stroke="currentColor" strokeWidth="2" />
      <path d="M9.5 10L6 17H18L14.5 10" fill="currentColor" fillOpacity="0.28" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <rect x="4" y="18.5" width="16" height="3" rx="1.5" fill="currentColor" />
    </svg>
  )
}

export function ReflectionScene({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
      <circle cx="12" cy="12" r="4" fill="currentColor" />
      <path d="M12 3V5.5M12 18.5V21M3 12H5.5M18.5 12H21M5.6 5.6L7.4 7.4M16.6 16.6L18.4 18.4M18.4 5.6L16.6 7.4M7.4 16.6L5.6 18.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function ForceButtonScene({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
      <path d="M12 3V11M12 11L9 8M12 11L15 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="6" y="13" width="12" height="3.5" rx="1.75" fill="currentColor" />
      <rect x="4" y="17" width="16" height="4" rx="2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

export function ImuTiltScene({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
      <g transform="rotate(-14 12 13)">
        <rect x="5" y="7" width="14" height="10" rx="2.5" stroke="currentColor" strokeWidth="2" />
        <circle cx="10" cy="12" r="1.4" fill="currentColor" />
        <circle cx="14" cy="12" r="1.4" fill="currentColor" />
      </g>
      <path d="M5 6.5C7 4.2 10 3.5 12.5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function LightsGlowScene({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
      <circle cx="8" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <path d="M8 5V6.5M16 5V6.5M8 17.5V19M16 17.5V19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function GuideIllustration({ kind }: { kind: "wall" | "color" | "button" | "beacon" }) {
  if (kind === "wall") {
    return (
      <svg viewBox="0 0 140 68" className="w-full h-[64px] rounded-xl bg-[#eef7fb]" aria-hidden="true">
        <rect x="14" y="24" width="36" height="24" rx="6" fill="#087996" />
        <circle cx="24" cy="50" r="6" fill="#18313b" />
        <circle cx="42" cy="50" r="6" fill="#18313b" />
        <circle cx="43" cy="33" r="3.5" fill="#fff" />
        <circle cx="43" cy="33" r="1.5" fill="#18313b" />
        <path d="M56 30C60 33 60 39 56 42M63 26C69 31 69 41 63 46" stroke="#087996" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <rect x="98" y="14" width="18" height="42" rx="4" fill="#e85d2a" />
        <path d="M74 36H94" stroke="#087996" strokeWidth="2" strokeDasharray="3 3" />
        <text x="72" y="22" fontSize="10" fontWeight="800" fill="#18313b">&lt; 20 см</text>
      </svg>
    )
  }
  if (kind === "color") {
    return (
      <svg viewBox="0 0 140 68" className="w-full h-[64px] rounded-xl bg-[#eef2ff]" aria-hidden="true">
        <rect x="24" y="10" width="26" height="16" rx="4" fill="#4f46e5" />
        <path d="M31 26L22 44H52L43 26Z" fill="#818cf8" fillOpacity="0.45" />
        <rect x="12" y="45" width="38" height="11" rx="4" fill="#ef4444" />
        <rect x="54" y="45" width="38" height="11" rx="4" fill="#22c55e" />
        <rect x="96" y="45" width="32" height="11" rx="4" fill="#3b82f6" />
      </svg>
    )
  }
  if (kind === "button") {
    return (
      <svg viewBox="0 0 140 68" className="w-full h-[64px] rounded-xl bg-[#fff7ed]" aria-hidden="true">
        <rect x="44" y="30" width="52" height="24" rx="6" fill="#087996" />
        <rect x="58" y="22" width="24" height="10" rx="4" fill="#e85d2a" />
        <path d="M70 6V18M70 18L64 12M70 18L76 12" stroke="#c2410c" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 140 68" className="w-full h-[64px] rounded-xl bg-[#ecfdf5]" aria-hidden="true">
      <rect x="46" y="14" width="48" height="40" rx="8" fill="#087996" />
      <rect x="58" y="22" width="24" height="16" rx="4" fill="#fef08a" />
      <path d="M36 24C30 29 30 39 36 44M104 24C110 29 110 39 104 44" stroke="#059669" strokeWidth="2.8" strokeLinecap="round" fill="none" />
      <circle cx="70" cy="46" r="4" fill="#22c55e" />
    </svg>
  )
}
