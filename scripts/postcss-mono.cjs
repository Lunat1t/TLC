// Временный чёрно-белый режим: все цвета в CSS проекта превращаются в #fff / #000.
// Чтобы вернуть тему: убрать этот плагин из postcss.config.mjs,
// импорт mono.css из layout.tsx и атрибут data-mono из страницы настроек.

const COLOR = /#[0-9a-f]{3,8}\b|(?:rgba?|hsla?|oklch|oklab|lab|lch|color-mix)\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)|(?<![-\w])(?:white|black|red|blue|green|gr[ae]y|orange|yellow|purple|pink|navy|teal|silver)(?![-\w])/gi
const KEEP = /^(?:none|transparent|inherit|initial|unset|revert|currentcolor)(?:\s*!important)?$/i

function alpha(color) {
  const c = color.toLowerCase()
  if (c.startsWith("#")) {
    if (c.length === 5) return parseInt(c[4] + c[4], 16) / 255
    if (c.length === 9) return parseInt(c.slice(7), 16) / 255
    return 1
  }
  const m = c.match(/(?:\/\s*|^(?:rgba|hsla)\([^,]+,[^,]+,[^,]+,\s*)([\d.]+)(%?)\s*\)$/)
  return m ? Number(m[1]) / (m[2] ? 100 : 1) : 1
}

function background(value) {
  if (KEEP.test(value) || /url\(/i.test(value)) return value
  const colors = value.match(COLOR) || []
  if (/gradient\(/i.test(value)) {
    return /transparent/i.test(value) || colors.some((c) => alpha(c) < 0.5) ? "transparent" : "#fff"
  }
  if (!colors.length) return /var\(/i.test(value) ? "#fff" : value
  return colors.every((c) => alpha(c) < 0.5) ? "transparent" : "#fff"
}

module.exports = () => ({
  postcssPlugin: "postcss-mono",
  OnceExit(root) {
    const file = root.source?.input?.file || ""
    if (file.includes("node_modules") || file.endsWith("mono.css")) return
    root.walkDecls((decl) => {
      const prop = decl.prop.toLowerCase()
      const value = decl.value.trim()
      if (prop.startsWith("--")) return
      if (/^(?:box-shadow|text-shadow|backdrop-filter|-webkit-backdrop-filter)$/.test(prop)) decl.value = "none"
      else if (/^background(?:-color|-image)?$/.test(prop)) {
        const next = background(value)
        decl.value = prop === "background-image" && next !== value ? "none" : next
      } else if (/^(?:color|-webkit-text-fill-color|caret-color|accent-color|stroke)$/.test(prop)) {
        if (!KEEP.test(value)) decl.value = "#000"
      } else if (/^(?:border|outline)(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-color)?$/.test(prop)) {
        decl.value = value.replace(COLOR, (c) => (alpha(c) === 0 ? "transparent" : "#000"))
        if (/-color$/.test(prop) && /var\(/.test(decl.value)) decl.value = "#000"
      }
    })
  },
})
module.exports.postcss = true
