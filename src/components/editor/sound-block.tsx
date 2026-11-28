import React from "react"
import { ChevronDown, Volume2 } from "lucide-react"
import type { WorkspaceBlock } from "@/lib/workspace"
import { BlockErrorBar } from "@/components/editor/controller-blocks"
import { ModuleBar } from "@/components/editor/module-bar"
import { SoundLibraryDialog } from "@/components/sound/sound-library"
import { useSoundName } from "@/components/sound/use-sounds"
import { DEFAULT_SOUND_ID } from "@/lib/sound/presets"

/**
 * Блок «Звук». База играет выбранный звук и сразу пропускает программу дальше;
 * модули добавляют громкость, число повторов и ожидание конца.
 */
export function SoundBlock({
  block,
  errorMessage,
  onChange,
}: {
  block: WorkspaceBlock
  errorMessage?: string
  onChange: (changes: Partial<WorkspaceBlock>) => void
}) {
  const [libraryOpen, setLibraryOpen] = React.useState(false)
  const closeLibrary = React.useCallback(() => setLibraryOpen(false), [])
  const soundId = block.soundId || DEFAULT_SOUND_ID
  const name = useSoundName(soundId)
  const waits = Boolean(block.modules?.includes("wait"))

  return (
    <div className="flex flex-col">
      <div className="flex flex-nowrap items-center min-h-[64px] px-3 py-2 gap-3">
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[16px] font-bold tracking-tight">
          <Volume2 size={16} aria-hidden="true" className="shrink-0" />
          <span>Играть</span>
        </span>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={`Звук: ${name}. Открыть библиотеку звуков`}
          title="Библиотека звуков"
          onClick={() => setLibraryOpen(true)}
          className="min-h-[38px] h-[38px] max-w-[220px] rounded-md px-3 bg-white text-[#272423] font-bold text-[15px] shadow-xs cursor-pointer flex items-center gap-1.5"
        >
          <span className="truncate">{name}</span>
          <ChevronDown size={14} aria-hidden="true" className="shrink-0" />
        </button>
        {waits && <span className="whitespace-nowrap text-[16px] font-bold tracking-tight">до конца</span>}
        <ModuleBar blockType="sound" block={block} subject="звука" onChange={onChange} />
      </div>
      <BlockErrorBar errorMessage={errorMessage} />
      {libraryOpen && (
        <SoundLibraryDialog
          selectedId={soundId}
          onSelect={(id) => {
            onChange({ soundId: id })
            closeLibrary()
          }}
          onClose={closeLibrary}
        />
      )}
    </div>
  )
}
