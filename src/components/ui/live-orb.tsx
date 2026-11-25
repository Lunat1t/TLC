"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export type LiveOrbVariant = "white" | "black" | "webgl" | "custom"

export const ORB_EXPRESSIONS = [
  { id: "happy", name: "Радость", eyes: "round", brows: "none", mouth: "smile" },
  { id: "laugh", name: "Смех", eyes: "closed", brows: "none", mouth: "laugh" },
  { id: "love", name: "Восторг", eyes: "spark", brows: "lifted", mouth: "open" },
  { id: "curious", name: "Любопытство", eyes: "round", brows: "raised", mouth: "small" },
  { id: "sleepy", name: "Сонный", eyes: "closed", brows: "flat", mouth: "small" },
  { id: "sad", name: "Грусть", eyes: "soft", brows: "sad", mouth: "frown" },
  { id: "angry", name: "Сердитый", eyes: "narrow", brows: "angry", mouth: "flat" },
  { id: "surprised", name: "Удивление", eyes: "round", brows: "raised", mouth: "open" },
  { id: "shy", name: "Смущение", eyes: "soft", brows: "none", mouth: "smile" },
  { id: "skeptical", name: "Сомнение", eyes: "uneven", brows: "uneven", mouth: "side" },
  { id: "confused", name: "Растерянность", eyes: "round", brows: "uneven", mouth: "side" },
  { id: "dizzy", name: "Кружится голова", eyes: "cross", brows: "none", mouth: "wavy" },
] as const

export type OrbExpressionId = (typeof ORB_EXPRESSIONS)[number]["id"]
export const DEFAULT_ORB_EXPRESSION: OrbExpressionId = "happy"

export function OrbExpressionFace({ expression, eyeColor }: { expression: OrbExpressionId; eyeColor: string }) {
  const face = ORB_EXPRESSIONS.find((item) => item.id === expression) ?? ORB_EXPRESSIONS[0]
  const stroke = { fill: "none", stroke: eyeColor, strokeWidth: 5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const }
  const eye = (x: number, kind: string) => {
    if (kind === "closed") return <path d={`M${x - 6} 43 Q${x} 49 ${x + 6} 43`} {...stroke} />
    if (kind === "soft") return <path d={`M${x - 5} 42 Q${x} 47 ${x + 5} 42`} {...stroke} />
    if (kind === "narrow") return <path d={`M${x - 7} 42 L${x + 7} 45`} {...stroke} />
    if (kind === "spark") return <><path d={`M${x - 6} 39 L${x + 6} 51 M${x + 6} 39 L${x - 6} 51`} {...stroke} /><circle cx={x} cy="45" r="8" fill={eyeColor} /></>
    if (kind === "cross") return <><path d={`M${x - 6} 39 L${x + 6} 51 M${x + 6} 39 L${x - 6} 51`} {...stroke} /></>
    if (kind === "uneven" && x === 66) return <ellipse cx={x} cy="45" rx="4" ry="6" fill={eyeColor} />
    return <ellipse cx={x} cy="45" rx={kind === "uneven" ? 4 : 5} ry={kind === "uneven" ? 7 : 8} fill={eyeColor} />
  }
  const brow = (x: number, kind: string) => {
    if (kind === "none") return null
    if (kind === "angry") return <path d={x < 50 ? "M25 31 L43 36" : "M57 36 L75 31"} {...stroke} />
    if (kind === "sad") return <path d={x < 50 ? "M27 34 Q34 27 42 35" : "M58 35 Q66 27 73 34"} {...stroke} />
    if (kind === "raised") return <path d={`M${x - 8} 31 Q${x} 25 ${x + 8} 31`} {...stroke} />
    if (kind === "lifted") return <path d={`M${x - 7} 32 Q${x} 27 ${x + 7} 32`} {...stroke} />
    if (kind === "uneven" && x === 34) return <path d="M25 34 Q34 29 42 32" {...stroke} />
    if (kind === "uneven") return <path d="M59 30 Q67 28 75 32" {...stroke} />
    return <path d={`M${x - 8} 32 L${x + 8} 32`} {...stroke} />
  }

  return (
    <svg className="orb-expression-face" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      {eye(34, face.eyes)}{eye(66, face.eyes)}
      {brow(34, face.brows)}{brow(66, face.brows)}
      {face.mouth === "smile" && <path d="M39 62 Q50 74 61 62" {...stroke} />}
      {face.mouth === "laugh" && <path d="M39 60 Q50 78 61 60 Q59 74 50 74 Q41 74 39 60Z" fill={eyeColor} />}
      {face.mouth === "open" && <ellipse cx="50" cy="65" rx="7" ry="10" fill={eyeColor} />}
      {face.mouth === "small" && <path d="M46 64 Q50 66 54 64" {...stroke} />}
      {face.mouth === "frown" && <path d="M40 72 Q50 59 60 72" {...stroke} />}
      {face.mouth === "flat" && <path d="M42 66 L58 66" {...stroke} />}
      {face.mouth === "side" && <path d="M43 68 Q50 63 58 66" {...stroke} />}
      {face.mouth === "wavy" && <path d="M39 65 Q44 60 49 65 T60 65" {...stroke} />}
    </svg>
  )
}

export interface AvatarPreset {
  id: string
  name: string
  badge: string
  variant: LiveOrbVariant
  colors: string[]
  color: string
  eyeColor: string
}

export const WHITE = { color: "#f6f3ec", eyeColor: "#0d0c0a" } as const
export const BLACK = { color: "#171612", eyeColor: "#f6f3ec" } as const
export const CUSTOM_DEFAULT = { color: "#b79cf5", eyeColor: "#f9f7f3" } as const
export const WEBGL_COLORS = ["#b79cf5", "#b0aba0", "#E8B4D4"]

export const AVATAR_PRESETS: AvatarPreset[] = [
  {
    id: "aurora",
    name: "Aurora WebGL",
    badge: "21st.dev Original",
    variant: "webgl",
    colors: ["#b79cf5", "#b0aba0", "#E8B4D4"],
    color: "#b79cf5",
    eyeColor: "#0d0c0a",
  },
  {
    id: "tlc-cyber",
    name: "Brick Studio Импульс",
    badge: "SPIKE Cyan",
    variant: "webgl",
    colors: ["#b79cf5", "#b79cf5", "#b0aba0"],
    color: "#b79cf5",
    eyeColor: "#171612",
  },
  {
    id: "white",
    name: "Светлый Орб",
    badge: "White",
    variant: "white",
    colors: ["#f6f3ec", "#ece6d8", "#e1d8c3"],
    color: WHITE.color,
    eyeColor: WHITE.eyeColor,
  },
  {
    id: "black",
    name: "Обсидиан",
    badge: "Black",
    variant: "black",
    colors: ["#171612", "#221f1b", "#343029"],
    color: BLACK.color,
    eyeColor: BLACK.eyeColor,
  },
  {
    id: "violet",
    name: "Неоновый Вектор",
    badge: "Custom",
    variant: "custom",
    colors: ["#b79cf5", "#b79cf5", "#e3dbc7"],
    color: CUSTOM_DEFAULT.color,
    eyeColor: CUSTOM_DEFAULT.eyeColor,
  },
  {
    id: "solar-ev3",
    name: "Солнечный EV3",
    badge: "EV3 Core",
    variant: "webgl",
    colors: ["#FF6B35", "#F7931E", "#FFE66D"],
    color: "#FF6B35",
    eyeColor: "#1F130B",
  },
]

export function hexToRgb(hex: string): [number, number, number] {
  const raw = String(hex || "").replace("#", "").trim()
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw.padEnd(6, "0").slice(0, 6)
  const num = Number.parseInt(full, 16)
  if (Number.isNaN(num)) return [0.96, 0.96, 0.96]
  return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255]
}

export function resolveOrbConfig(options: {
  variant?: LiveOrbVariant
  color?: string
  eyeColor?: string
  colors?: string[]
} = {}) {
  const variant: LiveOrbVariant = options.variant || "webgl"
  if (variant === "white") {
    return {
      variant: "white" as const,
      mode: 0,
      color: WHITE.color,
      eyeColor: options.eyeColor || WHITE.eyeColor,
      colors: [...WEBGL_COLORS],
    }
  }
  if (variant === "black") {
    return {
      variant: "black" as const,
      mode: 0,
      color: BLACK.color,
      eyeColor: options.eyeColor || BLACK.eyeColor,
      colors: [...WEBGL_COLORS],
    }
  }
  if (variant === "custom") {
    return {
      variant: "custom" as const,
      mode: 0,
      color: options.color || CUSTOM_DEFAULT.color,
      eyeColor: options.eyeColor || CUSTOM_DEFAULT.eyeColor,
      colors:
        Array.isArray(options.colors) && options.colors.length >= 3
          ? options.colors.slice(0, 3)
          : [...WEBGL_COLORS],
    }
  }
  const stops =
    Array.isArray(options.colors) && options.colors.length >= 3
      ? options.colors.slice(0, 3)
      : [...WEBGL_COLORS]
  return {
    variant: "webgl" as const,
    mode: 1,
    color: options.color || stops[0],
    eyeColor: options.eyeColor || "#0d0c0a",
    colors: stops,
  }
}

const VERT = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

const FRAG = `
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_speed;
uniform vec2 u_look;
uniform float u_blink;
uniform float u_faceMode;
uniform float u_mode;
uniform vec3 u_body;
uniform vec3 u_eye;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = m * p;
    a *= 0.5;
  }
  return v;
}

vec3 orient(vec3 p, vec2 look) {
  float yaw = look.x * 0.92;
  float pitch = -look.y * 0.78;
  float cy = cos(yaw);
  float sy = sin(yaw);
  float cp = cos(pitch);
  float sp = sin(pitch);
  vec3 q = vec3(p.x, p.y * cp - p.z * sp, p.y * sp + p.z * cp);
  return vec3(q.x * cy + q.z * sy, q.y, -q.x * sy + q.z * cy);
}

float eyeMask(vec3 n, vec3 e, vec3 right, vec3 up, float halfH, float rad) {
  float facing = dot(n, e);
  float x = dot(n, right) - dot(e, right);
  float y = dot(n, up) - dot(e, up);
  y -= clamp(y, -halfH, halfH);
  float d = length(vec2(x, y)) - rad;
  float fill = 1.0 - smoothstep(-0.01, 0.01, d);
  return fill * smoothstep(0.12, 0.32, facing);
}

vec3 wash(vec3 n, float t) {
  vec2 q = n.xy * 2.2 + n.z * 0.85;
  vec2 w1 = vec2(
    fbm(q * 1.4 + vec2(t * 0.22, t * 0.18)),
    fbm(q * 1.4 + vec2(-t * 0.16, t * 0.24) + 4.1)
  );
  q += (w1 - 0.5) * 0.72;
  float f = fbm(q * 2.1 + vec2(0.0, t * 0.12));
  float g = fbm(q * 4.6 - vec2(t * 0.2, 0.0));
  vec3 col = mix(u_c1, u_c2, smoothstep(0.28, 0.72, f));
  return mix(col, u_c3, pow(smoothstep(0.42, 0.9, g), 1.4));
}

void main() {
  vec2 uv = (gl_FragCoord.xy / u_resolution.xy) * 2.0 - 1.0;
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  uv.x *= aspect;

  float radius = 0.94;
  vec2 p = uv / radius;
  float r2 = dot(p, p);
  float edge = 1.0 - smoothstep(0.985, 1.012, sqrt(max(r2, 0.0)));
  if (edge <= 0.001) {
    gl_FragColor = vec4(0.0);
    return;
  }

  float z = sqrt(max(1.0 - r2, 0.0));
  vec3 n = normalize(vec3(p, z));

  vec2 look = u_look;
  float lm = length(look);
  if (lm > 1.0) look /= lm;

  vec3 right = orient(vec3(1.0, 0.0, 0.0), look);
  vec3 up = orient(vec3(0.0, 1.0, 0.0), look);
  vec3 eL = orient(normalize(vec3(-0.32, 0.08, 1.0)), look);
  vec3 eR = orient(normalize(vec3(0.32, 0.08, 1.0)), look);

  float halfH = mix(0.128, 0.012, u_blink);
  float rad = mix(0.054, 0.062, u_blink);
  float eyes = max(
    eyeMask(n, eL, right, up, halfH, rad),
    eyeMask(n, eR, right, up, halfH, rad)
  );
  if (u_faceMode > 0.5) eyes = 0.0;

  vec3 body = u_mode > 0.5 ? wash(n, u_time * u_speed) : u_body;
  vec3 col = mix(body, u_eye, clamp(eyes, 0.0, 1.0));

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), edge);
}
`

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

export interface LiveOrbProps {
  className?: string
  size?: number
  variant?: LiveOrbVariant
  color?: string
  eyeColor?: string
  colors?: string[]
  interactive?: boolean
  blink?: boolean
  lookOverride?: { x: number; y: number; squint?: number } | null
  blinkCount?: number
  expression?: OrbExpressionId
}

export function LiveOrb({
  className,
  size = 216,
  variant = "webgl",
  color,
  eyeColor,
  colors,
  interactive = true,
  blink = true,
  lookOverride = null,
  blinkCount = 0,
  expression,
}: LiveOrbProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const optsRef = React.useRef({
    variant,
    color,
    eyeColor,
    colors,
    interactive,
    blink,
    lookOverride,
    expression,
  })
  optsRef.current = {
    variant,
    color,
    eyeColor,
    colors,
    interactive,
    blink,
    lookOverride,
    expression,
  }

  const blinkStateRef = React.useRef(0)

  React.useEffect(() => {
    if (blinkCount > 0) {
      blinkStateRef.current = 1
    }
  }, [blinkCount])

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let gl: WebGLRenderingContext | null = null
    let program: WebGLProgram | null = null
    let uniforms: Record<string, WebGLUniformLocation | null> | null = null
    let ctx2d: CanvasRenderingContext2D | null = null

    try {
      gl =
        (canvas.getContext("webgl", {
          alpha: true,
          antialias: true,
          premultipliedAlpha: false,
        }) as WebGLRenderingContext | null) ||
        (canvas.getContext("experimental-webgl", {
          alpha: true,
          antialias: true,
          premultipliedAlpha: false,
        }) as WebGLRenderingContext | null)
    } catch {
      gl = null
    }

    if (gl) {
      const vs = compileShader(gl, gl.VERTEX_SHADER, VERT)
      const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG)
      if (vs && fs) {
        program = gl.createProgram()
        if (program) {
          gl.attachShader(program, vs)
          gl.attachShader(program, fs)
          gl.linkProgram(program)
          if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
            gl.useProgram(program)
            const buffer = gl.createBuffer()
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
            gl.bufferData(
              gl.ARRAY_BUFFER,
              new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
              gl.STATIC_DRAW
            )
            const posLoc = gl.getAttribLocation(program, "a_position")
            gl.enableVertexAttribArray(posLoc)
            gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

            uniforms = {
              resolution: gl.getUniformLocation(program, "u_resolution"),
              time: gl.getUniformLocation(program, "u_time"),
              speed: gl.getUniformLocation(program, "u_speed"),
              look: gl.getUniformLocation(program, "u_look"),
              blink: gl.getUniformLocation(program, "u_blink"),
              faceMode: gl.getUniformLocation(program, "u_faceMode"),
              mode: gl.getUniformLocation(program, "u_mode"),
              body: gl.getUniformLocation(program, "u_body"),
              eye: gl.getUniformLocation(program, "u_eye"),
              c1: gl.getUniformLocation(program, "u_c1"),
              c2: gl.getUniformLocation(program, "u_c2"),
              c3: gl.getUniformLocation(program, "u_c3"),
            }
          } else {
            gl = null
          }
        }
      } else {
        gl = null
      }
    }

    if (!gl) {
      try {
        ctx2d = canvas.getContext("2d")
      } catch {
        ctx2d = null
      }
    }

    const targetLook = { x: 0, y: 0 }
    const currentLook = { x: 0, y: 0 }
    let idleTarget = { x: 0, y: 0 }
    let lastPointerMove = 0
    let nextIdleTime = 0
    let blinkAmount = 0
    let nextBlinkTime = performance.now() + 1800 + Math.random() * 2600
    const startTime = performance.now()
    let rafId = 0

    function resize() {
      if (!canvas) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rect = canvas.getBoundingClientRect()
      const w = Math.max(1, Math.round((rect.width || size) * dpr))
      const h = Math.max(1, Math.round((rect.height || size) * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      if (gl) {
        gl.viewport(0, 0, canvas.width, canvas.height)
      }
    }

    function onPointerMove(event: PointerEvent) {
      if (!canvas || !optsRef.current.interactive || optsRef.current.lookOverride) return
      const rect = canvas.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const cx = rect.left + rect.width * 0.5
      const cy = rect.top + rect.height * 0.5
      const radius = Math.max(rect.width, rect.height, 220) * 1.35
      const dx = (event.clientX - cx) / radius
      const dy = (event.clientY - cy) / radius
      const mag = Math.hypot(dx, dy)
      const scale = mag > 1 ? 1 / mag : 1
      targetLook.x = dx * scale * 0.85
      targetLook.y = dy * scale * 0.85
      lastPointerMove = performance.now()
    }

    window.addEventListener("pointermove", onPointerMove, { passive: true })
    window.addEventListener("resize", resize, { passive: true })

    function frame(now: number) {
      if (!canvas) return
      resize()

      const curOpts = optsRef.current
      if (curOpts.lookOverride) {
        targetLook.x = curOpts.lookOverride.x
        targetLook.y = curOpts.lookOverride.y
      } else if (!curOpts.interactive || now - lastPointerMove > 2600) {
        if (now > nextIdleTime) {
          const angle = Math.random() * Math.PI * 2
          const dist = Math.random() * 0.42
          idleTarget = {
            x: Math.cos(angle) * dist,
            y: Math.sin(angle) * dist * 0.65,
          }
          nextIdleTime = now + 1400 + Math.random() * 2200
        }
        targetLook.x = idleTarget.x
        targetLook.y = idleTarget.y
      }

      currentLook.x += (targetLook.x - currentLook.x) * 0.14
      currentLook.y += (targetLook.y - currentLook.y) * 0.14

      if (curOpts.blink && blinkStateRef.current === 0 && now >= nextBlinkTime) {
        blinkStateRef.current = 1
      }
      if (blinkStateRef.current === 1) {
        blinkAmount = Math.min(1, blinkAmount + 0.24)
        if (blinkAmount >= 1) blinkStateRef.current = 2
      } else if (blinkStateRef.current === 2) {
        blinkAmount = Math.max(0, blinkAmount - 0.18)
        if (blinkAmount <= 0) {
          blinkStateRef.current = 0
          nextBlinkTime = now + 2200 + Math.random() * 3400
        }
      }

      const cfg = resolveOrbConfig(curOpts)

      if (gl && uniforms) {
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.uniform2f(uniforms.resolution, canvas.width, canvas.height)
        gl.uniform1f(uniforms.time, (now - startTime) * 0.001)
        gl.uniform1f(uniforms.speed, 1.0)
        gl.uniform2f(uniforms.look, currentLook.x, -currentLook.y)
        gl.uniform1f(uniforms.blink, curOpts.lookOverride?.squint ?? blinkAmount)
        gl.uniform1f(uniforms.faceMode, curOpts.expression ? 1 : 0)
        gl.uniform1f(uniforms.mode, cfg.mode)
        gl.uniform3fv(uniforms.body, hexToRgb(cfg.color))
        gl.uniform3fv(uniforms.eye, hexToRgb(cfg.eyeColor))
        gl.uniform3fv(uniforms.c1, hexToRgb(cfg.colors[0]))
        gl.uniform3fv(uniforms.c2, hexToRgb(cfg.colors[1]))
        gl.uniform3fv(uniforms.c3, hexToRgb(cfg.colors[2]))
        gl.drawArrays(gl.TRIANGLES, 0, 6)
      } else if (ctx2d) {
        const w = canvas.width
        const h = canvas.height
        ctx2d.clearRect(0, 0, w, h)
        const cx = w * 0.5
        const cy = h * 0.5
        const r = Math.min(w, h) * 0.47
        ctx2d.save()
        ctx2d.beginPath()
        ctx2d.arc(cx, cy, r, 0, Math.PI * 2)
        if (cfg.mode > 0.5) {
          const grad = ctx2d.createLinearGradient(cx - r, cy - r, cx + r, cy + r)
          grad.addColorStop(0, cfg.colors[0])
          grad.addColorStop(0.5, cfg.colors[1])
          grad.addColorStop(1, cfg.colors[2])
          ctx2d.fillStyle = grad
        } else {
          ctx2d.fillStyle = cfg.color
        }
        ctx2d.fill()

        if (!curOpts.expression) {
          const offsetX = currentLook.x * r * 0.34
          const offsetY = currentLook.y * r * 0.3
          const eyeSpacing = r * 0.29
          const eyeW = r * 0.115
          const effectiveBlink = curOpts.lookOverride?.squint ?? blinkAmount
          const eyeH = Math.max(r * 0.04, r * 0.34 * (1 - effectiveBlink * 0.88))

          ctx2d.fillStyle = cfg.eyeColor
          for (const dir of [-1, 1]) {
            const ex = cx + dir * eyeSpacing + offsetX
            const ey = cy - r * 0.04 + offsetY
            ctx2d.beginPath()
            ctx2d.roundRect(ex - eyeW, ey - eyeH, eyeW * 2, eyeH * 2, eyeW)
            ctx2d.fill()
          }
        }
        ctx2d.restore()
      }

      rafId = requestAnimationFrame(frame)
    }

    rafId = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("resize", resize)
    }
  }, [size])

  return (
    <span className="live-orb-face-wrap" style={{ width: size, height: size, display: "inline-block", position: "relative" }}>
      <canvas
        ref={canvasRef}
        width={size * 2}
        height={size * 2}
        onClick={() => {
          blinkStateRef.current = 1
        }}
        style={{ width: size, height: size }}
        className={cn("block cursor-pointer select-none", className)}
        aria-label={expression ? `Live Orb, выражение: ${ORB_EXPRESSIONS.find((item) => item.id === expression)?.name}` : "Интерактивный аватар Live Orb"}
      />
      {expression && <OrbExpressionFace expression={expression} eyeColor={eyeColor ?? WHITE.eyeColor} />}
    </span>
  )
}
