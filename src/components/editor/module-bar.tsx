import React from "react"
import { Check, Gauge, Trash2, Zap } from "lucide-react"
import type { WorkspaceBlock, TravelUnit } from "@/lib/workspace"
import { isPairedBlock } from "@/lib/block-registry"
import {
  DEFAULT_LOOP_TIMES,
  MAX_LOOP_TIMES,
  activeModules,
  moduleAddPatch,
  moduleInfo,
  moduleMenu,
  percentToSpeed,
  speedToPercent,
  toggleModule,
  type ModuleBlockType,
  type ModuleDef,
  type ModuleIconKey,
} from "@/lib/block-modules"
import {
  TRAVEL_UNIT_ARIA_LABELS,
  TRAVEL_UNIT_LABELS,
  computePopoverPlacement,
  nextTravelUnit,
} from "@/lib/controller-block-ui"

/** Закрывает всплывающее окно по клику снаружи и Esc, подбирает сторону раскрытия. */
export function usePopoverDismiss(open: boolean, ref: React.RefObject<HTMLDivElement | null>, onClose: () => void) {
  const [placement, setPlacement] = React.useState<{ alignLeft: boolean; openUp: boolean }>({
    alignLeft: false,
    openUp: false,
  })

  React.useEffect(() => {
    if (!open) return
    if (ref.current && typeof window !== "undefined") {
      const rect = ref.current.getBoundingClientRect()
      setPlacement(
        computePopoverPlacement(rect, { width: window.innerWidth, height: window.innerHeight })
      )
    }
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("pointerdown", onPointer)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("pointerdown", onPointer)
      window.removeEventListener("keydown", onKey)
    }
  }, [open, ref, onClose])

  return placement
}

/** Кнопка-значок модуля. По нажатию открывает описание и «Убрать». */
export function ModuleCapsuleIconPopover({
  title,
  description,
  icon,
  iconClassName = "text-[#1d1b1a]",
  wide = false,
  canRemove,
  mandatoryLabel = "Обязательный модуль",
  ariaLabel,
  onRemove,
  onWillOpen,
}: {
  title: string
  description: string
  icon: React.ReactNode
  iconClassName?: string
  /** Кнопка с названием вместо значка: растягивается по тексту. */
  wide?: boolean
  canRemove: boolean
  mandatoryLabel?: string
  ariaLabel: string
  onRemove: () => void
  onWillOpen?: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)
  const close = React.useCallback(() => setOpen(false), [])
  const { alignLeft, openUp } = usePopoverDismiss(open, ref, close)

  return (
    <div ref={ref} data-module-picker="true" className="relative shrink-0">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        title={title}
        onClick={() => {
          if (!open) onWillOpen?.()
          setOpen((prev) => !prev)
        }}
        className={`min-h-[36px] min-w-[36px] h-[36px] ${wide ? "px-2.5 text-[14px] font-bold whitespace-nowrap" : "w-[36px]"} rounded-[9px] bg-white/15 hover:bg-white/25 flex items-center justify-center shrink-0 cursor-pointer transition-colors ${iconClassName}`}
      >
        {icon}
      </button>
      {open && (
        <div
          className={`absolute ${openUp ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]"} ${
            alignLeft ? "left-0" : "right-0"
          } z-50 w-[216px] max-w-[calc(100vw-16px)] max-h-[calc(100dvh-24px)] overflow-y-auto p-2.5 rounded-[12px] border border-[#f3e8d5] bg-white text-[#1d1b1a] shadow-xl flex flex-col gap-2`}
        >
          <div>
            <p className="text-xs font-black text-[#1d1b1a] leading-snug">{title}</p>
            <p className="mt-0.5 text-[11px] font-semibold text-[#726b62] leading-snug">{description}</p>
          </div>
          {canRemove ? (
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onRemove()
              }}
              className="min-h-[36px] w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#fef2f2] hover:bg-[#fee2e2] text-xs font-extrabold text-[#991b1b] cursor-pointer"
            >
              <Trash2 size={14} aria-hidden="true" className="shrink-0" />
              <span>Убрать</span>
            </button>
          ) : (
            <div className="rounded-lg bg-[#fbf8f3] px-2.5 py-1.5 text-[11px] font-bold text-[#5f5951] text-center">
              {mandatoryLabel}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const ICONS: Record<Exclude<ModuleIconKey, null>, React.ComponentType<{ size?: number; "aria-hidden"?: boolean | "true" | "false"; className?: string }>> = {
  gauge: Gauge,
  zap: Zap,
}

const FIELD_CLASS =
  "w-[78px] h-[38px] rounded-md px-3 text-center bg-white text-[#272423] font-bold text-[15px] shadow-xs"

/**
 * Модули блока: «таблетки» включённых модулей и меню «+».
 * Один компонент для всех блоков — набор модулей и правила берутся из реестра
 * (`@/lib/block-modules`). Строку с портом и направлением рисует сам блок,
 * а модуль «Мотор 2» меняет эту строку, поэтому здесь он только в меню.
 */
export function ModuleBar({
  blockType,
  block,
  subject,
  onChange,
}: {
  blockType: ModuleBlockType
  block: WorkspaceBlock
  /** «мотора» или «шасси» — для подписей кнопок. */
  subject: string
  onChange: (changes: Partial<WorkspaceBlock>) => void
}) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const menuRef = React.useRef<HTMLDivElement>(null)
  const closeMenu = React.useCallback(() => setMenuOpen(false), [])
  const { alignLeft, openUp } = usePopoverDismiss(menuOpen, menuRef, closeMenu)

  const modules = Array.isArray(block.modules) ? block.modules : []
  const isActive = (id: ModuleDef["id"]) => (id === "pair" ? isPairedBlock(block) : modules.includes(id))
  const unit: TravelUnit = block.unit || "rotations"

  const removeModule = (id: ModuleDef["id"]) => {
    onChange({
      modules: modules.filter((m) => m !== id),
      ...(id === "pair" && block.type === "pair" ? { type: "drive" as const } : {}),
    })
  }

  const toggle = (id: ModuleDef["id"]) => {
    setMenuOpen(false)
    if (isActive(id)) {
      removeModule(id)
      return
    }
    const next = toggleModule(blockType, modules, id)
    onChange({ modules: next.modules, ...moduleAddPatch(blockType, id, block) })
  }

  const renderFields = (def: ModuleDef) => {
    if (def.id === "travel") {
      return (
        <>
          <input
            type="number"
            min="0.01"
            max="10000"
            step="any"
            aria-label={`Величина движения ${subject}`}
            value={block.value ?? 1}
            onChange={(e) => {
              const val = Number(e.target.value)
              if (!Number.isFinite(val) || val < 0.01 || val > 10000) return
              onChange({ value: val })
            }}
            className={FIELD_CLASS}
          />
          <button
            type="button"
            aria-label={`Единица измерения ${subject}: ${TRAVEL_UNIT_ARIA_LABELS[unit]}`}
            title={`Единица: ${TRAVEL_UNIT_ARIA_LABELS[unit]}`}
            onClick={() => onChange({ unit: nextTravelUnit(unit) })}
            className="min-h-[36px] min-w-[36px] h-[38px] rounded-md px-3 bg-white text-[#272423] hover:bg-[#f6eee1] font-bold text-[15px] shadow-xs cursor-pointer flex items-center justify-center shrink-0"
          >
            {TRAVEL_UNIT_LABELS[unit]}
          </button>
        </>
      )
    }
    if (def.id === "times") {
      return (
        <>
          <input
            type="number"
            min="1"
            max={MAX_LOOP_TIMES}
            step="1"
            aria-label="Сколько раз повторить"
            value={block.times ?? DEFAULT_LOOP_TIMES}
            onChange={(e) => {
              const val = Math.round(Number(e.target.value))
              if (!Number.isFinite(val) || val < 1 || val > MAX_LOOP_TIMES) return
              onChange({ times: val })
            }}
            className={FIELD_CLASS}
          />
          <span className="text-[16px] font-bold tracking-tight">{def.chip?.unit}</span>
        </>
      )
    }
    const isSpeed = def.id === "speed"
    return (
      <>
        <input
          type="number"
          min="1"
          max="100"
          aria-label={isSpeed ? `Скорость ${subject}, процентов` : `Мощность ${subject}, процентов`}
          value={isSpeed ? speedToPercent(block.speed) : (block.power ?? 50)}
          onChange={(e) => {
            const val = Number(e.target.value)
            if (!Number.isFinite(val)) return
            onChange(isSpeed ? { speed: percentToSpeed(val) } : { power: val })
          }}
          className={FIELD_CLASS}
        />
        <span className="text-[14px] font-bold">{def.chip?.unit}</span>
      </>
    )
  }

  return (
    <>
      {activeModules(blockType, modules, "chip").map((def) => {
        const info = moduleInfo(blockType, def.id)
        const Icon = def.icon ? ICONS[def.icon] : null
        return (
          <div key={def.id} className="shrink-0 flex items-center gap-2 rounded-md bg-black/20 px-2 py-1">
            {def.chip?.badge !== false && (
              <ModuleCapsuleIconPopover
                title={info?.title ?? def.title}
                description={info?.description ?? def.description}
                ariaLabel={`Модуль ${subject}: ${info?.title ?? def.title}`}
                icon={Icon ? <Icon size={16} aria-hidden="true" /> : def.label}
                wide={!Icon}
                canRemove
                iconClassName="text-white/95"
                onWillOpen={() => setMenuOpen(false)}
                onRemove={() => removeModule(def.id)}
              />
            )}
            {def.chip?.prefix && (
              <span className="whitespace-nowrap text-[16px] font-bold tracking-tight">{def.chip.prefix}</span>
            )}
            {renderFields(def)}
          </div>
        )
      })}

      <div ref={menuRef} data-module-picker="true" className="relative shrink-0 flex items-center ml-1">
        <button
          type="button"
          aria-label={`Добавить модуль ${subject}`}
          aria-expanded={menuOpen}
          title="Настроить модули"
          onClick={() => setMenuOpen((prev) => !prev)}
          className="min-h-[36px] min-w-[36px] w-[36px] h-[36px] rounded-md border border-white/55 bg-white/15 hover:bg-white/30 text-white text-xl leading-none font-bold grid place-items-center"
        >
          +
        </button>
        {menuOpen && (
          <div
            className={`absolute ${openUp ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+8px)]"} ${
              alignLeft ? "left-0" : "right-0"
            } z-50 w-[176px] max-w-[calc(100vw-16px)] max-h-[calc(100dvh-24px)] overflow-y-auto p-1.5 rounded-md border border-[#1d1b1a73] bg-white text-[#252221] shadow-xl flex flex-col gap-1`}
          >
            {moduleMenu(blockType).map((def) => {
              const active = isActive(def.id)
              const Icon = def.icon ? ICONS[def.icon] : null
              return (
                <button
                  key={def.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggle(def.id)}
                  className={`min-h-[36px] flex items-center gap-2 text-left px-3 py-1.5 rounded-lg text-xs font-bold ${
                    active
                      ? "bg-[#f3e8d4] hover:bg-[#edddc2] text-[#393533]"
                      : "bg-[#f9f3e9] hover:bg-[#f5ebdb] text-[#252221]"
                  }`}
                >
                  <Check size={14} aria-hidden={true} className={active ? "opacity-100 shrink-0" : "opacity-0 shrink-0"} />
                  {Icon && <Icon size={15} aria-hidden={true} className="shrink-0" />}
                  <span>{def.label}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
