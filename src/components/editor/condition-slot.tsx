import React from "react"
import type { WorkspaceBlock } from "@/lib/workspace"
import { SensorBlock } from "@/components/editor/controller-blocks"

type SensorBlockProps = React.ComponentProps<typeof SensorBlock>

/**
 * Овал для датчика в шапке блока с условием («Если» и цикл «Пока»).
 * Пока датчика нет, показывает пустой слот; во время перетаскивания датчика
 * прячет его, а слот подсвечивает при наведении.
 */
export function ConditionSlot({
  conditionBlock,
  dragging,
  snapping,
  errorMessage,
  liveReady,
  sensorDistances,
  sensorTelemetry,
  onChange,
  onRemove,
  onStartDrag,
}: {
  conditionBlock?: WorkspaceBlock
  dragging: boolean
  snapping: boolean
  errorMessage?: string
  liveReady: boolean
  sensorDistances: SensorBlockProps["sensorDistances"]
  sensorTelemetry: SensorBlockProps["sensorTelemetry"]
  onChange: (changes: Partial<WorkspaceBlock>) => void
  onRemove: () => void
  onStartDrag: NonNullable<SensorBlockProps["onStartDrag"]>
}) {
  if (conditionBlock && !dragging) {
    return (
      <div className="relative flex items-center shrink-0">
        <SensorBlock
          block={conditionBlock}
          slotted
          liveReady={liveReady}
          sensorDistances={sensorDistances}
          sensorTelemetry={sensorTelemetry}
          errorMessage={errorMessage}
          onChange={onChange}
          onRemoveFromCondition={onRemove}
          onStartDrag={onStartDrag}
        />
      </div>
    )
  }
  return (
    <span
      role="region"
      aria-label="Слот для датчика"
      className={`w-[88px] h-[32px] shrink-0 rounded-full border shadow-inner transition-colors ${
        snapping
          ? "border-2 border-dashed border-[#fbbf24] bg-[#fef3c7]/45"
          : "bg-[#605a52]/55 border-white/25"
      }`}
    />
  )
}
