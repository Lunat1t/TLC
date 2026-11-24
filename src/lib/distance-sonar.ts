export type DistanceZone = 'danger' | 'warning' | 'safe' | 'idle'

export type SonarZoneStyle = {
  zone: DistanceZone
  primaryRgb: readonly [number, number, number]
  accentRgb: readonly [number, number, number]
  speedRadPerSec: number
  wavelengthPx: number
  minRadius: number
  maxRadius: number
}

export function getDistanceZone(distance: number | null | undefined): DistanceZone {
  if (typeof distance !== 'number' || !Number.isFinite(distance) || distance < 0 || distance > 200) {
    return 'idle'
  }
  if (distance < 15) return 'danger'
  if (distance <= 45) return 'warning'
  return 'safe'
}

export function getSonarZoneStyle(distance: number | null | undefined): SonarZoneStyle {
  const zone = getDistanceZone(distance)
  if (zone === 'danger') {
    return {
      zone,
      primaryRgb: [248, 113, 113], // #f87171
      accentRgb: [252, 165, 165],  // #fca5a5
      speedRadPerSec: 8.5,
      wavelengthPx: 22,
      minRadius: 1.3,
      maxRadius: 3.1,
    }
  }
  if (zone === 'warning') {
    return {
      zone,
      primaryRgb: [251, 191, 36],  // #fbbf24
      accentRgb: [253, 230, 138],  // #fde68a
      speedRadPerSec: 5.2,
      wavelengthPx: 28,
      minRadius: 1.2,
      maxRadius: 2.7,
    }
  }
  if (zone === 'safe') {
    return {
      zone,
      primaryRgb: [34, 211, 238],  // #22d3ee
      accentRgb: [16, 185, 129],   // #10b981
      speedRadPerSec: 3.0,
      wavelengthPx: 36,
      minRadius: 1.1,
      maxRadius: 2.4,
    }
  }
  return {
    zone: 'idle',
    primaryRgb: [51, 65, 85],
    accentRgb: [71, 85, 105],
    speedRadPerSec: 0,
    wavelengthPx: 32,
    minRadius: 1.1,
    maxRadius: 1.3,
  }
}
