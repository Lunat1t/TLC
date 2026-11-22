/** Local-only WebRTC measurements. No SDP, tokens, addresses or device IDs. */
type Stat = { id: string; type: string; [key: string]: unknown }
export type DisplaySample = {
  at: number
  inbound?: Stat
  outbound?: Stat
}
export type DisplayMetrics = {
  connection: string
  protocol?: string
  localType?: string
  remoteType?: string
  route?: "direct" | "relay"
  rttMs?: number
  codec?: string
  width?: number
  height?: number
  fps?: number
  bitrateKbps?: number
  jitterMs?: number
  bufferMs?: number
  decodeMs?: number
  encodeMs?: number
  lossPercent?: number
  freezes?: number
  droppedFrames?: number
  qualityLimit?: string
  capture?: { width?: number; height?: number; frameRate?: number }
}
function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}
function delta(current: Stat | undefined, previous: Stat | undefined, key: string) {
  if (!current || !previous || current.id !== previous.id) return undefined
  const a = number(current[key]), b = number(previous[key])
  return a !== undefined && b !== undefined && a >= b ? a - b : undefined
}
function averageMs(total: number | undefined, count: number | undefined) {
  return total !== undefined && count !== undefined && count > 0 ? total * 1000 / count : undefined
}

/** Interval counters reset when a stream changes; unsupported values stay absent. */
export function measureDisplay(
  report: RTCStatsReport, connection: string, previous?: DisplaySample,
  at = performance.now(), track?: MediaStreamTrack,
): { metrics: DisplayMetrics; sample: DisplaySample } {
  const stats = new Map<string, Stat>()
  report.forEach(value => stats.set(value.id, value as Stat))
  const values = Array.from(stats.values())
  const video = (stat: Stat) => stat.kind === "video" || stat.mediaType === "video"
  const inbound = values.find(stat => stat.type === "inbound-rtp" && video(stat))
  const outbound = values.find(stat => stat.type === "outbound-rtp" && video(stat) && stat.active !== false)
  const stream = inbound || outbound
  const transport = stream && typeof stream.transportId === "string"
    ? stats.get(stream.transportId)
    : values.find(stat => stat.type === "transport" && typeof stat.selectedCandidatePairId === "string")
  const nominated = values.filter(stat => stat.type === "candidate-pair" && stat.state === "succeeded" && stat.nominated === true)
  const pair = typeof transport?.selectedCandidatePairId === "string"
    ? stats.get(transport.selectedCandidatePairId)
    : nominated.length === 1 ? nominated[0] : undefined
  const local = typeof pair?.localCandidateId === "string" ? stats.get(pair.localCandidateId) : undefined
  const remote = typeof pair?.remoteCandidateId === "string" ? stats.get(pair.remoteCandidateId) : undefined
  const codec = typeof stream?.codecId === "string" ? stats.get(stream.codecId) : undefined
  const elapsed = previous && at > previous.at ? (at - previous.at) / 1000 : undefined
  const frames = inbound ? delta(inbound, previous?.inbound, "framesDecoded") : delta(outbound, previous?.outbound, "framesEncoded")
  const bytes = inbound ? delta(inbound, previous?.inbound, "bytesReceived") : delta(outbound, previous?.outbound, "bytesSent")
  const lost = delta(inbound, previous?.inbound, "packetsLost")
  const received = delta(inbound, previous?.inbound, "packetsReceived")
  const localType = typeof local?.candidateType === "string" ? local.candidateType : undefined
  const remoteType = typeof remote?.candidateType === "string" ? remote.candidateType : undefined
  let capture: DisplayMetrics["capture"]
  try {
    const settings = track?.getSettings()
    if (settings) capture = { width: settings.width, height: settings.height, frameRate: settings.frameRate }
  } catch { /* A track can end between samples. */ }
  return {
    metrics: {
      connection,
      protocol: typeof local?.protocol === "string" ? local.protocol : typeof remote?.protocol === "string" ? remote.protocol : undefined,
      localType, remoteType,
      route: localType === "relay" || remoteType === "relay" ? "relay" : localType && remoteType ? "direct" : undefined,
      rttMs: number(pair?.currentRoundTripTime) === undefined ? undefined : Number(pair?.currentRoundTripTime) * 1000,
      codec: typeof codec?.mimeType === "string" ? codec.mimeType : undefined,
      width: number(stream?.frameWidth), height: number(stream?.frameHeight),
      fps: elapsed && frames !== undefined ? frames / elapsed : number(stream?.framesPerSecond),
      bitrateKbps: elapsed && bytes !== undefined ? bytes * 8 / elapsed / 1000 : undefined,
      jitterMs: number(inbound?.jitter) === undefined ? undefined : Number(inbound?.jitter) * 1000,
      bufferMs: averageMs(delta(inbound, previous?.inbound, "jitterBufferDelay"), delta(inbound, previous?.inbound, "jitterBufferEmittedCount")),
      decodeMs: averageMs(delta(inbound, previous?.inbound, "totalDecodeTime"), delta(inbound, previous?.inbound, "framesDecoded")),
      encodeMs: averageMs(delta(outbound, previous?.outbound, "totalEncodeTime"), delta(outbound, previous?.outbound, "framesEncoded")),
      lossPercent: lost !== undefined && received !== undefined && lost + received > 0 ? 100 * lost / (lost + received) : undefined,
      freezes: number(inbound?.freezeCount), droppedFrames: number(inbound?.framesDropped),
      qualityLimit: typeof outbound?.qualityLimitationReason === "string" ? outbound.qualityLimitationReason : undefined,
      capture,
    },
    sample: { at, inbound, outbound },
  }
}

/** A browser hint, not a promised playout delay. */
export function requestLowDelay(receiver: RTCRtpReceiver) {
  if (!("jitterBufferTarget" in receiver)) return false
  try {
    ;(receiver as RTCRtpReceiver & { jitterBufferTarget: number | null }).jitterBufferTarget = 0
    return true
  } catch { return false }
}
