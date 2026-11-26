import React from "react"
import { Repeat } from "lucide-react"
import type { WorkspaceBlock } from "@/lib/workspace"
import { BlockErrorBar } from "@/components/editor/controller-blocks"
import { ModuleBar } from "@/components/editor/module-bar"

/**
 * Блок «Повторять». База повторяет тело всегда; модули меняют условие:
 * «Сколько раз» — «Повторить N раз», «Пока датчик» — «Повторять пока [датчик]».
 * Тело — C-образный «рот», как у «Если».
 */
export function LoopBlock({
  block,
  bodyHeight,
  isConnected,
  hasChild,
  isSelected,
  isSnapTarget,
  hasError,
  errorMessage,
  conditionSlot,
  onChange,
}: {
  block: WorkspaceBlock
  /** Высота «рта» с вложенными блоками. */
  bodyHeight: number
  isConnected: boolean
  hasChild: boolean
  isSelected: boolean
  isSnapTarget: boolean
  hasError: boolean
  errorMessage?: string
  /** Овал для датчика; показывается, когда включён модуль «Пока датчик». */
  conditionSlot: React.ReactNode
  onChange: (changes: Partial<WorkspaceBlock>) => void
}) {
  const modules = block.modules || []
  const counted = modules.includes("times")
  const conditional = modules.includes("while")
  const label = counted ? "Повторить" : conditional ? "Повторять пока" : "Повторять всегда"

  return (
    <div className="flex flex-col items-start">
      <div
        className={`block-fill pointer-events-auto relative flex flex-nowrap items-center min-h-[58px] h-[58px] w-max min-w-[220px] px-5 gap-3 bg-[#f8f2e7] border-l-4 border-[#837b70] ${
          isConnected ? "rounded-tl-[5px] rounded-tr-md" : "rounded-t-md"
        } rounded-br-md ${
          isSelected
            ? "outline outline-2 outline-[#252221]"
            : isSnapTarget
              ? "ring-4 ring-[#fbbf24]"
              : hasError
                ? "ring-2 ring-[#dc2626]"
                : ""
        }`}
      >
        {/* Нижний «шип» шапки: сюда встаёт первый блок тела цикла */}
        <span
          aria-hidden="true"
          className="block-fill absolute -bottom-[7px] left-[60px] w-[44px] h-[10px] rounded-b-[6px] bg-[#f8f2e7] z-20"
        />
        <span className="inline-flex items-center gap-1.5 text-[16px] font-bold whitespace-nowrap tracking-tight">
          <Repeat size={16} aria-hidden="true" className="shrink-0 text-[#837b70]" />
          <span>{label}</span>
        </span>
        {conditional && conditionSlot}
        <ModuleBar blockType="loop" block={block} subject="цикла" onChange={onChange} />
      </div>

      {/* Левая стенка «рта» цикла */}
      <div style={{ height: `${bodyHeight}px` }} className="relative flex items-center">
        <div className="block-fill pointer-events-auto w-[28px] h-full bg-[#f8f2e7]" />
      </div>

      {/* Нижняя планка */}
      <div
        className={`block-fill pointer-events-auto relative w-[220px] h-[28px] bg-[#f8f2e7] rounded-r-md ${
          hasChild ? "rounded-bl-[5px]" : "rounded-bl-md"
        }`}
      >
        <span
          aria-hidden="true"
          className="block-fill absolute -top-[8px] left-[60px] w-[44px] h-[10px] rounded-t-[6px] bg-[#f8f2e7]"
        />
      </div>
      {hasError && errorMessage && (
        <div className="pointer-events-auto">
          <BlockErrorBar errorMessage={errorMessage} />
        </div>
      )}
    </div>
  )
}
