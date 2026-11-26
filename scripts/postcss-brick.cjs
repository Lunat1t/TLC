// Тема «Pocket Lab»: цвета прежних тем в CSS проекта заменяются переменными --bs-*
// из src/app/theme.css, скругления становятся мягче, жёсткие тени — «губкой» снизу.

const COLOR = /#[0-9a-f]{3,8}\b|rgba?\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)|(?<![-\w.])(?:white|black)(?![-\w])/gi

// Прежний «сигнальный» красный был цветом главного действия.
const BRAND = new Set(["209,47,32", "168,33,26", "130,30,23"])
const DANGER_TINT = new Set(["254,242,242", "254,226,226", "255,241,238", "254,202,202"])

function parse(color) {
  const c = color.toLowerCase()
  if (c === "white") return { rgb: [255, 255, 255], a: 1 }
  if (c === "black") return { rgb: [0, 0, 0], a: 1 }
  if (c.startsWith("#")) {
    let h = c.slice(1)
    if (h.length < 6) h = [...h].map((x) => x + x).join("")
    return { rgb: [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)), a: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1 }
  }
  const m = c.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*(.+?))?\s*\)$/)
  if (!m) return null
  const raw = m[4]
  const n = raw === undefined ? 1 : parseFloat(raw) / (raw.endsWith("%") ? 100 : 1)
  return { rgb: [m[1], m[2], m[3]].map(Number), a: Number.isNaN(n) ? 1 : n }
}

function traits([r, g, b]) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const chroma = (max - min) / 255
  const light = (max + min) / 510
  let hue = 0
  if (max !== min) {
    const d = max - min
    hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    hue = (hue * 60 + 360) % 360
  }
  return { chroma, light, hue }
}

// role: "bg" | "text" | "line". Возвращает имя переменной темы или null (цвет не трогаем).
function token({ rgb }, role) {
  const key = rgb.join(",")
  const { chroma, light, hue } = traits(rgb)
  if (BRAND.has(key)) return role === "text" ? "action-text" : "action"
  if (DANGER_TINT.has(key)) return role === "bg" ? "danger-bg" : "danger"
  if (chroma >= 0.45 && hue >= 28 && hue <= 55 && light > 0.4 && light < 0.8) return "reward"
  if (chroma < 0.26) {
    if (role === "line") return "line"
    // Светлый текст в прежней теме всегда лежал на тёмной или цветной заливке.
    if (role === "text") return light > 0.75 ? "on-dark" : light < 0.35 ? "text" : "muted"
    if (light >= 0.9) return "card"
    if (light >= 0.75) return "bg"
    if (light >= 0.45) return "line"
    return "deep"
  }
  if ((hue <= 12 || hue >= 340) && light < 0.65) return role === "bg" ? "danger-bg" : "danger"
  if (role === "text" && light < 0.45) return "muted"
  return null
}

function replace(value, role, used) {
  return value.replace(COLOR, (color) => {
    const parsed = parse(color)
    if (!parsed || parsed.a === 0) return color
    // Тени и полупрозрачные затемнения оставляем как есть.
    const { light, chroma } = traits(parsed.rgb)
    if (role === "bg" && parsed.a < 0.75 && chroma < 0.26 && light < 0.45) return color
    const name = token(parsed, role)
    if (!name) return color
    used?.push({ name, a: parsed.a })
    return parsed.a >= 1 ? `var(--bs-${name})` : `color-mix(in srgb, var(--bs-${name}) ${Math.round(parsed.a * 100)}%, transparent)`
  })
}

// Скругления: всё мельче 24px увеличиваем, круги и «таблетки» не трогаем.
const RADIUS_SCALE = 1.9
const RADIUS_PROPS = /^border(?:-(?:top|bottom|start|end)-(?:left|right|start|end))?-radius$/
function softenRadius(value) {
  if (/var\(|calc\(|%|\b\d{3,}/.test(value)) return value
  return value.replace(/(?<![\w.-])(\d*\.?\d+)(px|rem)\b/g, (m, n, unit) => {
    const px = unit === "rem" ? parseFloat(n) * 16 : parseFloat(n)
    if (px < 2 || px >= 24) return m
    return `${Math.min(24, Math.round(px * RADIUS_SCALE * 2) / 2)}px`
  })
}

// Тени: жёсткая со смещением → «губка» цвета --bs-lip; мягкая → тёплая размытая.
// Кольца (0 0 0 Npx), inset и уже тематические тени остаются как есть.
const SOFT_SHADOW = "0 8px 22px color-mix(in srgb, var(--bs-shadow) 20%, transparent)"
function splitLayers(value) {
  const out = []
  let depth = 0, cur = ""
  for (const ch of value) {
    if (ch === "(") depth++
    if (ch === ")") depth--
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = "" } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}
function softenShadow(value) {
  if (/var\(--bs-|var\(--tw-ring|var\(--tw-shadow|^\s*(?:none|inherit|initial|unset)\s*$/.test(value)) return value
  const seen = new Set()
  const layers = splitLayers(value).map((layer) => {
    if (/\binset\b/.test(layer)) return layer
    const nums = [...layer.replace(COLOR, " ").matchAll(/(-?\d*\.?\d+)(?:px)?(?![\w.])/g)].map((m) => parseFloat(m[1]))
    const [x = 0, y = 0, blur = 0, spread = 0] = nums
    if (!x && !y && !blur) return layer
    if (blur > 0) return SOFT_SHADOW
    if (!x && !y) return layer
    return `0 ${Math.min(5, Math.max(2, Math.round(Math.max(Math.abs(x), Math.abs(y)))))}px 0 var(--bs-lip)`
  }).filter((l) => (seen.has(l) ? false : seen.add(l)))
  return layers.join(", ")
}

function roleOf(prop) {
  if (prop.startsWith("--")) {
    if (/^--(?:bs|tw-(?:shadow|ring))/.test(prop)) return null
    if (/line|border|outline/.test(prop)) return "line"
    if (/ink|text|-fg|muted|foreground/.test(prop)) return "text"
    return "bg"
  }
  if (/^background(?:-color|-image)?$/.test(prop)) return "bg"
  if (/^(?:color|-webkit-text-fill-color|caret-color|accent-color|fill|stroke)$/.test(prop)) return "text"
  if (/^(?:border|outline)(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-color)?$/.test(prop)) return "line"
  return null
}

module.exports = () => ({
  postcssPlugin: "postcss-brick",
  OnceExit(root, { Declaration }) {
    const file = root.source?.input?.file || ""
    if (file.includes("node_modules") || file.endsWith("theme.css")) return
    root.walkRules((rule) => {
      // Кольца фокуса и выделения сделаны через box-shadow — их не трогаем.
      const keepsRing = /focus|ring/i.test(rule.selector)
      let fill = null
      let hasColor = false
      rule.each((decl) => {
        if (decl.type !== "decl") return
        const prop = decl.prop.toLowerCase()
        if (prop === "text-shadow") {
          decl.value = "none"
          return
        }
        if ((prop === "box-shadow" && !keepsRing) || prop === "--tw-shadow") {
          decl.value = softenShadow(decl.value)
          return
        }
        if (RADIUS_PROPS.test(prop)) {
          decl.value = softenRadius(decl.value)
          return
        }
        if (prop === "filter" && /drop-shadow/.test(decl.value)) {
          decl.value = decl.value.replace(/drop-shadow\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)|var\(--tw-drop-shadow\)/g, "").trim() || "none"
          return
        }
        const role = roleOf(prop)
        if (!role) return
        if (prop === "color") hasColor = true
        const used = []
        decl.value = replace(decl.value, role, used)
        if (/^background(?:-color)?$/.test(prop)) {
          const hit = used.find((u) => (u.name === "action" || u.name === "reward") && u.a >= 0.75)
          if (hit) fill = hit.name
        }
      })
      if (!fill) return
      // «Губка» кнопки в цвет её заливки.
      rule.walkDecls((d) => {
        if ((d.prop === "box-shadow" || d.prop === "--tw-shadow") && d.value.includes("var(--bs-lip)")) {
          d.value = d.value.replace(/var\(--bs-lip\)/g, `var(--bs-lip-${fill})`)
        }
      })
      // Цвет подписи на цветной заливке задаётся темой.
      const value = `var(--bs-on-${fill})`
      if (hasColor) rule.each((d) => { if (d.type === "decl" && d.prop === "color") d.value = value })
      else rule.append(new Declaration({ prop: "color", value }))
    })
  },
})
module.exports.postcss = true
