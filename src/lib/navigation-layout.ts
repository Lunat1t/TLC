export const NAVIGATION_LAYOUT_KEY = "tlc.navigation-layout.v1"
export type PageId = "projects" | "instructions" | "add-instruction" | "avatar"
export type NavigationLayout = { x: number; y: number; vertical: boolean; order: PageId[] }
export const defaultNavigationLayout = (): NavigationLayout => ({ x: .5, y: 1, vertical: false, order: ["projects", "instructions", "avatar"] })
const unit = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback
export function readNavigationLayout(raw: string | null): NavigationLayout {
  try {
    const data = JSON.parse(raw || "null")
    if (!data || typeof data !== "object") return defaultNavigationLayout()
    return { x: unit(data.x, .5), y: unit(data.y, 1), vertical: data.vertical === true,
      order: Array.isArray(data.order) && data.order.length >= 2 && data.order.length <= 4 && new Set(data.order).size === data.order.length && data.order.every((id: unknown) => ["projects", "instructions", "add-instruction", "avatar"].includes(String(id))) && data.order.includes("projects") && data.order.includes("instructions") ? [...data.order] : ["projects", "instructions", "avatar"] }
  } catch { return defaultNavigationLayout() }
}
export type LayoutBounds = { left: number; top: number; width: number; height: number }
export function layoutPosition(layout: NavigationLayout, bounds: LayoutBounds, size: { width: number; height: number }, reserved?: LayoutBounds) {
  const position = { left: bounds.left + Math.max(0, bounds.width - size.width) * unit(layout.x, .5), top: bounds.top + Math.max(0, bounds.height - size.height) * unit(layout.y, 1) }
  if (reserved && position.left < reserved.left + reserved.width && position.left + size.width > reserved.left && position.top < reserved.top + reserved.height && position.top + size.height > reserved.top) position.top = Math.max(bounds.top, reserved.top - size.height)
  return position
}
export function layoutAtPosition(layout: NavigationLayout, left: number, top: number, bounds: LayoutBounds, size: { width: number; height: number }): NavigationLayout {
  const width = Math.max(0, bounds.width - size.width), height = Math.max(0, bounds.height - size.height)
  return { ...layout, x: width ? unit((left - bounds.left) / width, .5) : .5, y: height ? unit((top - bounds.top) / height, 1) : 1 }
}

export type NavigationDock = "left" | "right" | "top" | "bottom"
export function navigationDock(layout: NavigationLayout): NavigationDock {
  return layout.vertical ? (layout.x <= .5 ? "left" : "right") : (layout.y <= .5 ? "top" : "bottom")
}
/** Every saved or dragged panel belongs to an edge, never the page surface. */
export function dockNavigationLayout(layout: NavigationLayout, bounds?: LayoutBounds): NavigationLayout {
  const width = bounds?.width ?? 1, height = bounds?.height ?? 1
  const distances: [NavigationDock, number][] = layout.vertical
    ? [["left",layout.x*width],["right",(1-layout.x)*width],["top",layout.y*height],["bottom",(1-layout.y)*height]]
    : [["top",layout.y*height],["bottom",(1-layout.y)*height],["left",layout.x*width],["right",(1-layout.x)*width]]
  const edge = distances.reduce((best,item)=>item[1]<best[1]?item:best)[0]
  return {...layout, vertical: edge==="left"||edge==="right", x: edge==="left"?0:edge==="right"?1:layout.x, y: edge==="top"?0:edge==="bottom"?1:layout.y}
}

export function navigationPages(role: string | null, canPublish = false): PageId[] {
  if (!role || role === "parent") return []
  return canPublish ? ["projects", "instructions", "add-instruction", "avatar"] : ["projects", "instructions", "avatar"]
}
export function reconcilePageOrder(order: PageId[], allowed: PageId[]): PageId[] {
  return [...order.filter(id=>allowed.includes(id)), ...allowed.filter(id=>!order.includes(id))]
}
export function moveNavigationPage(order: PageId[], from: number, to: number): PageId[] {
  if (from<0 || to<0 || from>=order.length || to>=order.length) return order
  const next=[...order], [item]=next.splice(from,1); next.splice(to,0,item); return next
}
