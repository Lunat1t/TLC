import React from "react"
import { ChevronDown, Volume2 } from "lucide-react"
import type { WorkspaceBlock } from "@/lib/workspace"
import { BlockErrorBar } from "@/components/editor/controller-blocks"
import { ModuleBar } from "@/components/editor/module-bar"
import { SoundLibraryDialog, type SoundPreview } from "@/components/sound/sound-library"
import { DEFAULT_SOUND_ID, DEFAULT_SOUND_VOLUME, findSoundPreset } from "@/lib/sound/presets"

/**
 * Блок «Звук». База играет выбранный звук на роботе и сразу пропускает программу дальше;
 * модули добавляют громкость, число повторов и ожидание конца.
 */
export function SoundBlock({
  block,
  errorMessage,
  onChange,
  onPreview,
  onStopPreview,
}: {
  block: WorkspaceBlock
  errorMessage?: string
  onChange: (changes: Partial<WorkspaceBlock>) => void
  onPreview: SoundPreview
  onStopPreview: () => void
}) {
  const [libraryOpen, setLibraryOpen] = React.useState(false)
  const closeLibrary = () => {
    onStopPreview()
    setLibraryOpen(false)
  }
  const soundId = block.soundId || DEFAULT_SOUND_ID
  const name = findSoundPreset(soundId)?.name ?? soundId
  const modules = block.modules || []

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
        {modules.includes("wait") && <span className="whitespace-nowrap text-[16px] font-bold tracking-tight">до конца</span>}
        <ModuleBar blockType="sound" block={block} subject="звука" onChange={onChange} />
      </div>
      <BlockErrorBar errorMessage={errorMessage} />
      {libraryOpen && (
        <SoundLibraryDialog
          selectedId={soundId}
          volume={modules.includes("volume") ? block.volume ?? DEFAULT_SOUND_VOLUME : DEFAULT_SOUND_VOLUME}
          onPreview={onPreview}
          onStopPreview={onStopPreview}
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
