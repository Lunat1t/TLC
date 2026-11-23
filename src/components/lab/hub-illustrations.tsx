import { useId } from "react"
import type { HubType } from "@/lib/projects"

export function Ev3HubIllustration() {
  const clipId = useId()
  return (
    <svg
      viewBox="0 0 120 168"
      className="program-picker-svg"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="6" y="4" width="108" height="160" rx="10" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {/* Main white-light body */}
        <rect x="6" y="4" width="108" height="160" rx="10" fill="#F1F4F8" />
        {/* Upper grey hood & small lower-left tab */}
        <rect x="6" y="4" width="108" height="76" fill="#9DA4AE" />
        <rect x="14" y="78" width="22" height="10" rx="3" fill="#9DA4AE" />
        {/* Screen bezel & mint-grey LCD */}
        <rect x="15" y="13" width="90" height="54" rx="7" fill="#272B30" />
        <rect x="22" y="19" width="76" height="42" rx="4" fill="#97ACA0" />
        <rect x="22" y="19" width="76" height="3" rx="1.5" fill="#82968B" opacity="0.55" />
        {/* Connector stem */}
        <rect x="58" y="67" width="4" height="13" fill="#272B30" />
        <rect x="58" y="80" width="4" height="8" fill="#6B7280" />
        {/* D-pad octagonal cluster */}
        <path
          d="M60 85 L81 100 L81 122 L60 137 L39 122 L39 100 Z"
          fill="#ADB4BD"
          stroke="#646B73"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {/* Left & Right pill buttons */}
        <rect
          x="22"
          y="102"
          width="24"
          height="18"
          rx="9"
          fill="#ADB4BD"
          stroke="#646B73"
          strokeWidth="2.5"
        />
        <rect
          x="74"
          y="102"
          width="24"
          height="18"
          rx="9"
          fill="#ADB4BD"
          stroke="#646B73"
          strokeWidth="2.5"
        />
        {/* Center dark OK button */}
        <rect
          x="50"
          y="101"
          width="20"
          height="20"
          rx="3.5"
          fill="#272B30"
          stroke="#525860"
          strokeWidth="2"
        />
        {/* Bottom EV3 bar (no LEGO logo) */}
        <rect x="6" y="143" width="108" height="21" fill="#9DA4AE" />
        <text
          x="16"
          y="158"
          fill="#FFFFFF"
          fontSize="12"
          fontWeight="900"
          fontFamily="var(--font-ui)"
          letterSpacing="0.06em"
        >
          EV3
        </text>
      </g>
      <rect
        x="6.75"
        y="4.75"
        width="106.5"
        height="158.5"
        rx="9.5"
        stroke="#CBD5E1"
        strokeWidth="1.5"
      />
    </svg>
  )
}

export function SpikeHubIllustration() {
  const matrixCols = [0, 1, 2, 3, 4]
  const matrixRows = [0, 1, 2, 3, 4]
  return (
    <svg
      viewBox="0 0 120 168"
      className="program-picker-svg"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* White rounded casing */}
      <rect
        x="8"
        y="4.75"
        width="104"
        height="158.5"
        rx="12"
        fill="#FFFFFF"
        stroke="#CBD5E1"
        strokeWidth="1.5"
      />
      {/* 4 corner Technic holes */}
      {[
        [18, 15],
        [102, 15],
        [18, 153],
        [102, 153],
      ].map(([cx, cy], index) => (
        <g key={index}>
          <circle cx={cx} cy={cy} r="5.5" fill="#E2E8F0" stroke="#CBD5E1" strokeWidth="1" />
          <circle cx={cx} cy={cy} r="3" fill="#CBD5E1" opacity="0.65" />
        </g>
      ))}

      {/* Top-right Bluetooth button */}
      <circle cx="88" cy="26" r="10.5" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="1.2" />
      <path
        d="M86 21.5 L90.5 25 L86 28.2 M88 19.5 V32.5 L91.5 29 L85 23.5"
        stroke="#94A3B8"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Subtle 5x5 LED matrix grid */}
      <g opacity="0.75">
        {matrixRows.map((row) =>
          matrixCols.map((col) => (
            <rect
              key={`${row}-${col}`}
              x={38 + col * 9.5}
              y={52 + row * 9.5}
              width="6"
              height="6"
              rx="1.2"
              fill="#E8EEF5"
            />
          ))
        )}
      </g>

      {/* Side port labels A-F */}
      {[
        { label: "A", x: 18, y: 58 },
        { label: "C", x: 18, y: 80 },
        { label: "E", x: 18, y: 102 },
        { label: "B", x: 102, y: 58 },
        { label: "D", x: 102, y: 80 },
        { label: "F", x: 102, y: 102 },
      ].map((port) => (
        <text
          key={port.label}
          x={port.x}
          y={port.y}
          textAnchor="middle"
          fill="#64748B"
          fontSize="9.5"
          fontWeight="800"
          fontFamily="var(--font-ui)"
        >
          {port.label}
        </text>
      ))}

      {/* Bottom control strip: pill rocker + left/right arrows + center red-ring button */}
      <rect
        x="24"
        y="124"
        width="72"
        height="20"
        rx="10"
        fill="#F8FAFC"
        stroke="#CBD5E1"
        strokeWidth="1.2"
      />
      <path d="M37 130.5 L31.5 134 L37 137.5 Z" fill="#94A3B8" />
      <path d="M83 130.5 L88.5 134 L83 137.5 Z" fill="#94A3B8" />
      <circle
        cx="60"
        cy="134"
        r="13.5"
        fill="#FFFFFF"
        stroke="#DC4A4A"
        strokeWidth="3"
      />
      <circle cx="60" cy="134" r="9" fill="#F8FAFC" />
    </svg>
  )
}

export function HubIllustration({ hub }: { hub: HubType }) {
  return hub === "ev3" ? <Ev3HubIllustration /> : <SpikeHubIllustration />
}
