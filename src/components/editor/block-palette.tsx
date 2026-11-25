"use client"

import * as React from "react"
import {
  ArrowDownUp,
  ArrowRight,
  ArrowRightLeft,
  CircleDot,
  Compass,
  Gamepad2,
  LayoutGrid,
  Monitor,
  Navigation,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  RectangleHorizontal,
  Square,
  Trash2,
  Waves,
  Workflow,
} from "lucide-react"
import type { BlockType, WorkspaceBlock } from "@/lib/workspace"
import {
  DIRECTION_CONTROLS,
  isDirectionControl,
  isPlaceableControl,
  type DirectionControlKind,
  type PlaceableControlKind,
} from "@/lib/control-workspace"
import { DirectionPalettePreview, DistanceGaugePalettePreview, MotorButtonsPalettePreview } from "@/components/editor/direction-control"

export const DISPLAY_LABEL = "Дисплей"
export const DISPLAY_SIZE = [224, 160] as const
export const GAUGE_LABEL = "Дальномер"

const ALL_BLOCKS = {
  id: "all",
  label: "Все блоки",
  icon: LayoutGrid,
  color: "#475569",
} as const

export const BLOCK_CATEGORIES = [
  {
    id: "events",
    label: "События",
    icon: Play,
    color: "#9a4b08",
    blocks: [
      { type: "start", label: "При запуске", icon: Play },
      { type: "button", event: "hold", label: "Кнопка пульта", icon: Gamepad2 },
    ],
  },
  {
    id: "motion",
    label: "Движение",
    icon: ArrowRight,
    color: "#087692",
    blocks: [
      { type: "chassis", label: "Ехать", icon: Navigation },
      { type: "drive", label: "Движение мотора", icon: ArrowRight },
      { type: "stop", label: "Стоп мотора", icon: Square },
    ],
  },
  {
    id: "sensors",
    label: "Датчики",
    icon: Waves,
    color: "#4f46e5",
    blocks: [
      { type: "sensor", label: "Датчик", icon: Waves },
    ],
  },
  {
    id: "logic",
    label: "Логика",
    icon: Workflow,
    color: "#6d35bf",
    blocks: [
      { type: "if", label: "Если / иначе", icon: Workflow },
    ],
  },
  {
    id: "controls",
    label: "Пульт",
    icon: Gamepad2,
    color: "#147363",
    blocks: [
      { type: "area", label: "Область управления", icon: RectangleHorizontal },
      { type: "motor-buttons", label: "Кнопки моторов", icon: Gamepad2 },
      { type: "drive-turn", label: DIRECTION_CONTROLS["drive-turn"].label, icon: ArrowRightLeft },
      { type: "drive-linear", label: DIRECTION_CONTROLS["drive-linear"].label, icon: ArrowDownUp },
      { type: "display", label: DISPLAY_LABEL, icon: Monitor },
      { type: "distance-gauge", label: GAUGE_LABEL, icon: Waves },
    ],
  },
] as const

export const PALETTE_FILTERS = [ALL_BLOCKS, ...BLOCK_CATEGORIES]
export type PaletteFilterId = (typeof PALETTE_FILTERS)[number]["id"]

export type PaletteControlKind = "area" | PlaceableControlKind

type BlockPaletteProps = {
  paletteRef: React.Ref<HTMLElement>
  drawerRef: React.Ref<HTMLDivElement>
  /** Program is running in check mode: the palette is shown but inert. */
  checking: boolean
  /** No project loaded yet. */
  disabled: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  category: PaletteFilterId
  onCategoryChange: (category: PaletteFilterId) => void
  /** A board block is being dragged over the palette and will be deleted on release. */
  dropToDelete: boolean
  /** A board block is being dragged somewhere: hint that the palette deletes it. */
  blockDragging: boolean
  /** The active sheet already has its single control area. */
  areaExists: boolean
  onBlockDragStart: (type: BlockType, clientX: number, clientY: number, initialOverrides?: Partial<WorkspaceBlock>) => void
  onControlDragStart: (event: React.PointerEvent<HTMLButtonElement>, kind: PaletteControlKind) => void
}

export function BlockPalette({
  paletteRef,
  drawerRef,
  checking,
  disabled,
  open,
  onOpenChange,
  category,
  onCategoryChange,
  dropToDelete,
  blockDragging,
  areaExists,
  onBlockDragStart,
  onControlDragStart,
}: BlockPaletteProps) {
  const startControlDrag = (event: React.PointerEvent<HTMLButtonElement>, kind: PaletteControlKind) => {
    if (disabled || event.button !== 0) return
    onControlDragStart(event, kind)
  }
  const startBlockDrag = (event: React.PointerEvent<HTMLButtonElement>, type: BlockType, initialOverrides?: Partial<WorkspaceBlock>) => {
    if (disabled || event.button !== 0) return
    event.preventDefault()
    onBlockDragStart(type, event.clientX, event.clientY, initialOverrides)
  }

  return (
    <aside
      ref={paletteRef}
      aria-label="Меню блоков"
      inert={checking || undefined}
      className={`relative z-20 flex shrink-0 ${checking ? "opacity-50 max-md:invisible" : ""}`}
    >
      <div className={`flex w-12 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-[#dce8ec] py-2 transition-colors ${
        dropToDelete
          ? "bg-red-100 ring-2 ring-inset ring-red-400"
          : blockDragging
            ? "bg-red-50/75"
            : "bg-[#f4f8fa]"
      }`}>
        <div className="flex flex-col items-center gap-1" role="group" aria-label="Категории блоков">
          {PALETTE_FILTERS.map(({ id, label, icon: Icon, color }) => (
            <button
              key={id}
              type="button"
              title={label}
              aria-label={label}
              aria-controls="editor-block-palette"
              aria-pressed={category === id}
              style={{ color }}
              onClick={() => {
                onCategoryChange(id)
                onOpenChange(true)
              }}
              className="grid size-10 shrink-0 place-items-center rounded-lg hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-current aria-pressed:bg-white aria-pressed:ring-1 aria-pressed:ring-inset aria-pressed:ring-current"
            >
              <Icon size={20} aria-hidden="true" />
            </button>
          ))}
        </div>
        <button
          type="button"
          title={open ? "Свернуть каталог блоков" : "Развернуть каталог блоков"}
          aria-label={open ? "Свернуть каталог блоков" : "Развернуть каталог блоков"}
          aria-controls="editor-block-palette"
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
          className="mt-1 grid size-10 shrink-0 place-items-center rounded-lg border border-[#dce8ec] text-[#475569] hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-current"
        >
          {open ? <PanelLeftClose size={18} aria-hidden="true" /> : <PanelLeftOpen size={18} aria-hidden="true" />}
        </button>
        {(dropToDelete || blockDragging) && (
          <Trash2
            size={dropToDelete ? 20 : 18}
            className={`my-2 shrink-0 ${dropToDelete ? "text-red-700" : "text-red-500/75"}`}
            aria-label={dropToDelete ? "Отпустите, чтобы удалить блок" : undefined}
            aria-hidden={!dropToDelete || undefined}
          />
        )}
      </div>

      <div
        ref={drawerRef}
        id="editor-block-palette"
        hidden={!open}
        className={`w-44 shrink-0 overflow-y-auto overscroll-contain border-r border-[#dce8ec] px-2.5 py-2 max-md:absolute max-md:inset-y-0 max-md:left-full max-md:shadow-md transition-colors ${dropToDelete ? "bg-red-50 ring-2 ring-inset ring-red-400" : "bg-white"}`}
      >
        {dropToDelete && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-red-300 bg-red-100 px-2.5 py-2 text-xs font-extrabold text-red-800 shadow-xs">
            <Trash2 size={15} aria-hidden="true" className="shrink-0" />
            <span>Отпустите для удаления</span>
          </div>
        )}
        {BLOCK_CATEGORIES.filter(({ id }) => category === "all" || id === category).map(({ id, label, color, blocks: entries }) => (
          <section key={id} aria-label={label} className="mb-3">
            <h2 className="mb-1 px-1 text-xs font-extrabold" style={{ color }}>{label}</h2>
            <div className="space-y-1">
              {entries.map((entry) => {
                if (entry.type === "motor-buttons") {
                  return (
                    <button
                      key="motor-buttons"
                      type="button"
                      disabled={disabled}
                      aria-label={entry.label}
                      title={entry.label}
                      onPointerDown={(event) => startBlockDrag(event, "motor-buttons")}
                      className="grid h-12 w-full touch-none cursor-grab place-items-center rounded-xl border-2 border-[#b9d0da] bg-[#f4f8fa] p-1 hover:border-[#087996] hover:bg-[#e7f3f8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <MotorButtonsPalettePreview />
                    </button>
                  )
                }
                if (entry.type === "distance-gauge") {
                  return (
                    <button
                      key="distance-gauge"
                      type="button"
                      disabled={disabled}
                      aria-label={entry.label}
                      title={entry.label}
                      onPointerDown={(event) => startControlDrag(event, "distance-gauge")}
                      className="grid h-12 w-full touch-none cursor-grab place-items-center rounded-xl border-2 border-[#c7d2fe] bg-[#eef2ff]/60 p-1 hover:border-[#4f46e5] hover:bg-[#eef2ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <DistanceGaugePalettePreview />
                    </button>
                  )
                }
                if (isDirectionControl(entry.type)) {
                  if (entry.type === "drive-linear") return null
                  const directionEntries = entries.filter((item) => isDirectionControl(item.type))
                  return (
                    <div key="direction-tiles" className="grid grid-cols-2 gap-1.5 pt-0.5">
                      {directionEntries.map((dirEntry) => {
                        const dirKind = dirEntry.type as DirectionControlKind
                        return (
                          <button
                            key={dirKind}
                            type="button"
                            disabled={disabled}
                            aria-label={dirEntry.label}
                            title={dirEntry.label}
                            onPointerDown={(event) => startControlDrag(event, dirKind)}
                            className="grid h-14 w-full touch-none cursor-grab place-items-center rounded-xl border-2 border-[#dfae87] bg-white p-1 hover:border-[#c35117] hover:bg-[#fff8ef] focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <DirectionPalettePreview kind={dirKind} />
                          </button>
                        )
                      })}
                    </div>
                  )
                }
                const { type, label, icon: Icon } = entry
                const buttonEvent = "event" in entry ? entry.event : undefined
                const areaAlreadyExists = type === "area" && areaExists
                return (
                  <button
                    key={`${type}:${buttonEvent || ""}`}
                    type="button"
                    disabled={disabled || areaAlreadyExists}
                    title={areaAlreadyExists ? "На этом листе уже есть область управления" : undefined}
                    onPointerDown={(event) => {
                      if (type === "area" || isPlaceableControl(type)) startControlDrag(event, type)
                      else startBlockDrag(event, type, buttonEvent ? { event: buttonEvent } : undefined)
                    }}
                    className="flex min-h-10 w-full touch-none cursor-grab items-center gap-2 rounded-lg bg-[#f4f8fa] px-2 py-1.5 text-left text-xs font-bold leading-tight hover:bg-[#eaf2f6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-current active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="grid size-6 shrink-0 place-items-center rounded-md text-white" style={{ backgroundColor: color }}>
                      {type === "sensor" ? (
                        <span className="grid grid-cols-2 gap-[1px] place-items-center" aria-hidden="true">
                          <Waves size={9} />
                          <Palette size={9} />
                          <CircleDot size={9} />
                          <Compass size={9} />
                        </span>
                      ) : (
                        <Icon size={14} aria-hidden="true" />
                      )}
                    </span>
                    {label}
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </aside>
  )
}

const DRAG_GHOSTS: Partial<Record<BlockType, { className: string; label: string }>> = {
  start: { className: "w-[240px] h-[52px] rounded-t-[20px] rounded-b-[12px] bg-[#f59e0b] shadow-[inset_0_-6px_#d97706]", label: "▶  Когда программа запускается" },
  if: { className: "w-[220px] h-[56px] rounded-[12px] bg-[#f1f4f5] shadow-[inset_0_-6px_#5b21b6]", label: "Если … то (Что если)" },
  sensor: { className: "w-[200px] h-[48px] rounded-full bg-[#4f46e5] shadow-[inset_0_-6px_#3730a3]", label: "Датчик" },
  pair: { className: "w-[220px] h-[56px] rounded-[12px] bg-[#107e79] shadow-[inset_0_-6px_#086560]", label: "⇉  Связанные моторы" },
  button: { className: "w-[200px] h-[52px] rounded-t-[20px] rounded-b-[12px] bg-[#e85d2a] shadow-[inset_0_-6px_#c2410c]", label: "Кнопка пульта" },
  "motor-buttons": { className: "w-[160px] h-[52px] rounded-[14px] border border-[#b9d0da] bg-[#f4f8fa] text-[#18313b] shadow-[inset_0_-4px_#d6e4e9]", label: "🔵 🔴 🟢 🟡" },
  stop: { className: "w-[220px] h-[56px] rounded-[12px] bg-[#b1372c] shadow-[inset_0_-6px_#8f2a21]", label: "■  Стоп мотора" },
  chassis: { className: "w-[220px] h-[56px] rounded-[12px] bg-[#0284c7] shadow-[inset_0_-6px_#0369a1]", label: "↑  Ехать" },
}
const DEFAULT_DRAG_GHOST = { className: "w-[220px] h-[56px] rounded-[12px] bg-[#0589b1] shadow-[inset_0_-6px_#00759b]", label: "↗  Движение мотора" }

/** Preview that follows the pointer while a block is dragged out of the palette. */
export function PaletteDragGhost({ type, clientX, clientY }: { type: BlockType; clientX: number; clientY: number }) {
  const ghost = DRAG_GHOSTS[type] ?? DEFAULT_DRAG_GHOST
  return (
    <div
      style={{ left: `${clientX}px`, top: `${clientY}px` }}
      className={`fixed z-50 pointer-events-none opacity-85 -translate-x-1/2 -translate-y-1/2 scale-90 px-4 flex items-center text-white font-extrabold text-xs ${ghost.className}`}
    >
      {ghost.label}
    </div>
  )
}
