export function MixMatchAccessoryArt({ transform }: { transform?: string }) {
  return (
    <g transform={transform}>
      {/* Orange mixing cups, blue lower housings, and a dark gray dual socket. */}
      <path d="M13 5h51l-4 57c-1 10-8 17-19 17h-9c-11 0-18-7-19-17z" fill="#f47700" />
      <path d="M92 5h51l-1 57c-1 10-8 17-19 17h-9c-11 0-18-7-19-17z" fill="#f47700" />
      <path d="M15 5h47l-2 19H15zM94 5h47l-1 19H94z" fill="#ff8611" />
      <path d="M18 51h42l-1 14c-1 10-8 16-18 16h-8c-9 0-15-6-15-15z" fill="#1687d2" />
      <path d="M97 51h42l-1 14c-1 10-8 16-18 16h-8c-9 0-15-6-15-15z" fill="#1687d2" />
      <path d="M0 68q0-9 10-9h136q10 0 10 9v25q0 11-12 11H12Q0 104 0 93z" fill="#555c60" />
      <path d="M8 72h140v19H8z" fill="#666e72" />
      <ellipse cx="39" cy="71" rx="23" ry="6" fill="#343a3e" />
      <ellipse cx="117" cy="71" rx="23" ry="6" fill="#343a3e" />
      <circle cx="78" cy="87" r="3.5" fill="#33393c" />
      <path d="M68 101h20v18q0 6-6 6h-8q-6 0-6-6z" fill="#585f63" />
    </g>
  )
}
