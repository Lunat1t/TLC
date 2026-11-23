import React from "react"
import { AlertTriangle, Check, Copy, Download, HelpCircle, Play, RefreshCw, X } from "lucide-react"
import type { HubType } from "@/lib/projects"
import { MAX_PYTHON_CODE_CHARS } from "@/lib/workspace"
import { GuideIllustration } from "@/components/editor/block-scenes"

interface GuideExample {
  id: string
  title: string
  summary: string
  illustration: "wall" | "color" | "button" | "beacon"
  spikeCode: string
  ev3Code: string
}

interface GuideCommand {
  id: string
  title: string
  description: string
  snippet: string
}

const GUIDE_EXAMPLES: readonly GuideExample[] = [
  {
    id: "wall",
    title: "Стоп у стены",
    summary: "Робот едет вперёд, пока не увидит стену ближе 20 см, и тормозит.",
    illustration: "wall",
    spikeCode: `# Стоп у стены (SPIKE Prime)
from pybricks.pupdevices import Motor, UltrasonicSensor
from pybricks.parameters import Port
from pybricks.tools import wait

left = Motor(Port.A)
right = Motor(Port.B)
eyes = UltrasonicSensor(Port.C)

left.run(360)
right.run(-360)

while eyes.distance() >= 200:
    wait(10)

left.brake()
right.brake()
`,
    ev3Code: `# Стоп у стены (EV3)
from pybricks.ev3devices import Motor, UltrasonicSensor
from pybricks.parameters import Port
from pybricks.tools import wait

left = Motor(Port.B)
right = Motor(Port.C)
eyes = UltrasonicSensor(Port.S4)

left.run(360)
right.run(360)

while eyes.distance() >= 200:
    wait(10)

left.brake()
right.brake()
`,
  },
  {
    id: "color",
    title: "По цвету",
    summary: "Ждёт красный цвет перед датчиком и крутит мотор 1 оборот.",
    illustration: "color",
    spikeCode: `# Ждём красный цвет (SPIKE Prime)
from pybricks.pupdevices import Motor, ColorSensor
from pybricks.parameters import Color, Port, Stop
from pybricks.tools import wait

motor_a = Motor(Port.A)
sensor = ColorSensor(Port.D)

while sensor.color() != Color.RED:
    wait(10)

motor_a.run_angle(360, 360, then=Stop.BRAKE)
`,
    ev3Code: `# Ждём красный цвет (EV3)
from pybricks.ev3devices import Motor, ColorSensor
from pybricks.parameters import Color, Port, Stop
from pybricks.tools import wait

motor_a = Motor(Port.A)
sensor = ColorSensor(Port.S3)

while sensor.color() != Color.RED:
    wait(10)

motor_a.run_angle(360, 360, then=Stop.BRAKE)
`,
  },
  {
    id: "button",
    title: "Кнопка пуска",
    summary: "Мотор включается, когда нажали датчик нажатия на порте E.",
    illustration: "button",
    spikeCode: `# Запуск по кнопке (SPIKE Prime)
from pybricks.pupdevices import Motor, ForceSensor
from pybricks.parameters import Port, Stop
from pybricks.tools import wait

motor_a = Motor(Port.A)
btn = ForceSensor(Port.E)

while not btn.pressed():
    wait(10)

motor_a.run_time(500, 1500, then=Stop.BRAKE)
`,
    ev3Code: `# Запуск по кнопке (EV3)
from pybricks.ev3devices import Motor, TouchSensor
from pybricks.parameters import Port, Stop
from pybricks.tools import wait

motor_a = Motor(Port.A)
btn = TouchSensor(Port.S1)

while not btn.pressed():
    wait(10)

motor_a.run_time(500, 1500, then=Stop.BRAKE)
`,
  },
  {
    id: "beacon",
    title: "Маяк и пищалка",
    summary: "Меняет цвет лампочки на хабе и играет два весёлых звука.",
    illustration: "beacon",
    spikeCode: `# Маяк и звук на хабе (SPIKE Prime)
from pybricks.hubs import PrimeHub
from pybricks.parameters import Color
from pybricks.tools import wait

hub = PrimeHub()

hub.light.on(Color.GREEN)
hub.speaker.beep(523, 200)
wait(300)
hub.light.on(Color.BLUE)
hub.speaker.beep(659, 300)
`,
    ev3Code: `# Свет и звук на хабе (EV3)
from pybricks.hubs import EV3Brick
from pybricks.parameters import Color
from pybricks.tools import wait

ev3 = EV3Brick()

ev3.light.on(Color.GREEN)
ev3.speaker.beep(523, 200)
wait(300)
ev3.light.on(Color.ORANGE)
ev3.speaker.beep(659, 300)
`,
  },
]

const GUIDE_COMMANDS: readonly GuideCommand[] = [
  {
    id: "motor",
    title: "Крутить мотор",
    description: "Повернуть мотор A на 1 оборот (360°).",
    snippet: "motor_a.run_angle(360, 360, then=Stop.BRAKE)",
  },
  {
    id: "wait",
    title: "Подождать",
    description: "Пауза в миллисекундах (1000 = 1 секунда).",
    snippet: "wait(1000)",
  },
  {
    id: "distance",
    title: "Расстояние (мм)",
    description: "Читает расстояние с ультразвукового датчика (200 мм = 20 см).",
    snippet: "if sensor_c.distance() < 200:\n    motor_a.brake()",
  },
  {
    id: "color",
    title: "Проверка цвета",
    description: "Сравнивает цвет с Color.RED, GREEN, BLUE, YELLOW.",
    snippet: "if sensor_d.color() == Color.RED:\n    wait(200)",
  },
  {
    id: "loop",
    title: "Повторять",
    description: "Выполняет команды внутри цикла снова и снова.",
    snippet: "while True:\n    wait(50)",
  },
]

export function PybricksWorkspace({
  hub,
  sheetName,
  code,
  dirty,
  errorMessage,
  statusMessage,
  isRunning,
  isBusy,
  onChangeCode,
  onSyncFromBlocks,
  onDownload,
  onRun,
  onStop,
}: {
  hub: HubType
  sheetName: string
  code: string
  dirty: boolean
  errorMessage?: string
  statusMessage?: string
  isRunning: boolean
  isBusy: boolean
  onChangeCode: (nextCode: string) => void
  onSyncFromBlocks: () => void
  onDownload: () => void
  onRun: () => void
  onStop: () => void
}) {
  const [guideOpen, setGuideOpen] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const [bleUnsupported, setBleUnsupported] = React.useState(false)
  const [confirmOverwrite, setConfirmOverwrite] = React.useState<{ action: "sync" } | { action: "example"; code: string } | null>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)

  React.useEffect(() => {
    setConfirmOverwrite(null)
  }, [sheetName])

  React.useEffect(() => {
    const nav = navigator as Navigator & { bluetooth?: unknown }
    setBleUnsupported(!nav.bluetooth || !window.isSecureContext)
  }, [])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      if (textareaRef.current) {
        textareaRef.current.select()
      }
    }
  }

  function handleRequestSync() {
    if (dirty && code.trim().length > 0) {
      setConfirmOverwrite({ action: "sync" })
      return
    }
    onSyncFromBlocks()
  }

  function handleInsertExample(exampleCode: string) {
    if (dirty && code.trim().length > 0) {
      setConfirmOverwrite({ action: "example", code: exampleCode })
      return
    }
    onChangeCode(exampleCode)
  }

  function handleInsertSnippet(snippet: string) {
    const el = textareaRef.current
    if (!el) {
      const prefix = code.trim().length > 0 ? code.replace(/\n*$/, "\n\n") : ""
      onChangeCode(prefix + snippet + "\n")
      return
    }
    const start = el.selectionStart ?? code.length
    const end = el.selectionEnd ?? code.length
    const before = code.slice(0, start)
    const after = code.slice(end)
    const needsLeadingNewline = before.length > 0 && !before.endsWith("\n")
    const needsTrailingNewline = after.length > 0 && !after.startsWith("\n")
    const inserted = `${needsLeadingNewline ? "\n" : ""}${snippet}${needsTrailingNewline ? "\n" : ""}`
    const next = (before + inserted + after).slice(0, MAX_PYTHON_CODE_CHARS)
    onChangeCode(next)
    requestAnimationFrame(() => {
      if (!textareaRef.current) return
      const pos = Math.min(next.length, before.length + inserted.length)
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(pos, pos)
    })
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#f5f8fa] text-[#18313b]">
      {/* Pybricks Toolbar */}
      <div className="shrink-0 flex flex-wrap items-center gap-2 px-3 sm:px-4 py-2 bg-white border-b border-[#e1eaee]">
        <button
          type="button"
          onClick={handleRequestSync}
          className="min-h-[36px] h-[36px] px-3 rounded-[10px] border border-[#c6dce2] bg-[#f4f8fa] hover:bg-[#e5f2f7] text-[#086985] text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
        >
          <RefreshCw size={14} aria-hidden="true" />
          <span>Из блоков</span>
        </button>

        <button
          type="button"
          onClick={() => void handleCopy()}
          className="min-h-[36px] h-[36px] px-3 rounded-[10px] border border-[#dce7ec] bg-white hover:bg-[#f4f8fa] text-[#31525f] text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
        >
          {copied ? <Check size={14} aria-hidden="true" className="text-emerald-600" /> : <Copy size={14} aria-hidden="true" />}
          <span>{copied ? "Скопировано ✓" : "Копировать"}</span>
        </button>

        <button
          type="button"
          onClick={onDownload}
          className="min-h-[36px] h-[36px] px-3 rounded-[10px] border border-[#dce7ec] bg-white hover:bg-[#f4f8fa] text-[#31525f] text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
        >
          <Download size={14} aria-hidden="true" />
          <span>Скачать .py</span>
        </button>

        {hub === "spike" && (
          isRunning || isBusy ? (
            <button
              type="button"
              onClick={onStop}
              className="min-h-[36px] h-[36px] px-3 rounded-[10px] bg-red-700 hover:bg-red-800 text-white text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap cursor-pointer sm:hidden"
            >
              <span>■ Стоп</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onRun}
              className="min-h-[36px] h-[36px] px-3 rounded-[10px] bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap cursor-pointer sm:hidden"
            >
              <Play size={13} aria-hidden="true" />
              <span>Запустить</span>
            </button>
          )
        )}

        <span className="flex-1" />

        <span
          className={`hidden md:inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${
            dirty ? "bg-amber-50 text-amber-800 border border-amber-200" : "bg-[#eff8fb] text-[#086985]"
          }`}
        >
          {dirty ? "Свой код" : "Из блоков"}
        </span>

        <button
          type="button"
          aria-expanded={guideOpen}
          onClick={() => setGuideOpen((prev) => !prev)}
          className={`min-h-[36px] h-[36px] px-3 rounded-[10px] text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
            guideOpen
              ? "bg-[#087996] text-white shadow-xs"
              : "border border-[#087996]/35 bg-[#eff8fb] text-[#086985] hover:bg-[#dff1f7]"
          }`}
        >
          <HelpCircle size={15} aria-hidden="true" />
          <span>? Гайд</span>
        </button>
      </div>

      {/* EV3 notice */}
      {hub === "ev3" && (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-900">
          Прямой запуск по Bluetooth работает только для SPIKE Prime. Для LEGO EV3 скачайте файл <code className="font-mono font-bold">.py</code> и откройте его в Pybricks Code.
        </div>
      )}

      {/* Web Bluetooth compatibility hint */}
      {hub === "spike" && bleUnsupported && (
        <div
          role="status"
          className="shrink-0 border-b border-sky-200 bg-sky-50 px-4 py-2 text-xs font-semibold text-sky-950"
        >
          Bluetooth к роботу работает в Chrome/Edge (ПК и Android); здесь можно скачать <code className="font-mono font-bold">.py</code>.
        </div>
      )}

      {/* Confirm overwrite banner */}
      {confirmOverwrite && (
        <div
          role="alertdialog"
          aria-label="Подтверждение замены кода"
          className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-950"
        >
          <span>Вы меняли код вручную. Заменить его?</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const pending = confirmOverwrite
                setConfirmOverwrite(null)
                if (pending.action === "sync") onSyncFromBlocks()
                else onChangeCode(pending.code)
              }}
              className="min-h-[32px] rounded-lg bg-[#087996] px-3 text-xs font-extrabold text-white hover:bg-[#06637a]"
            >
              Да, заменить
            </button>
            <button
              type="button"
              onClick={() => setConfirmOverwrite(null)}
              className="min-h-[32px] rounded-lg border border-amber-300 bg-white px-3 text-xs font-bold text-amber-950 hover:bg-amber-100"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Compiler / runtime error banner */}
      {errorMessage && (
        <div
          role="alert"
          className="shrink-0 flex items-start gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-900"
        >
          <AlertTriangle size={15} aria-hidden="true" className="shrink-0 mt-0.5 text-red-600" />
          <pre className="font-mono whitespace-pre-wrap break-words leading-snug flex-1">{errorMessage}</pre>
        </div>
      )}

      {/* Status info when running/uploading */}
      {!errorMessage && statusMessage && (
        <div role="status" className="shrink-0 border-b border-[#dce8ec] bg-[#f4fafc] px-4 py-1.5 text-xs font-semibold text-[#31525f]">
          {statusMessage}
        </div>
      )}

      {/* Split Editor + Optional Guide Drawer */}
      <div className="flex-1 min-h-0 flex relative overflow-hidden">
        <div className="flex-1 min-w-0 min-h-0 p-2 sm:p-4 flex flex-col">
          <div className="flex-1 min-h-0 rounded-[16px] border border-[#c6dce2] bg-white shadow-xs flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between px-3.5 py-2 border-b border-[#e8f0f3] bg-[#f9fcfd] text-[11px] font-bold text-[#57717d]">
              <span>Python (Pybricks) — {sheetName}</span>
              <span className="tabular-nums">{code.length} / {MAX_PYTHON_CODE_CHARS}</span>
            </div>
            <textarea
              ref={textareaRef}
              aria-label="Редактор кода Pybricks"
              value={code}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              maxLength={MAX_PYTHON_CODE_CHARS}
              onChange={(e) => onChangeCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Tab") {
                  e.preventDefault()
                  const el = e.currentTarget
                  const start = el.selectionStart
                  const end = el.selectionEnd
                  const next = (code.slice(0, start) + "    " + code.slice(end)).slice(0, MAX_PYTHON_CODE_CHARS)
                  onChangeCode(next)
                  requestAnimationFrame(() => {
                    el.selectionStart = el.selectionEnd = start + 4
                  })
                }
              }}
              placeholder="# Напишите код Pybricks или нажмите «Из блоков»"
              className="flex-1 w-full min-h-0 resize-none p-3.5 font-mono text-[13px] sm:text-sm leading-relaxed text-[#18313b] bg-white focus:outline-none select-text"
            />
          </div>
        </div>

        {guideOpen && (
          <aside
            aria-label="Гайд по Pybricks"
            className="w-full max-w-[340px] sm:w-[330px] shrink-0 border-l border-[#dce8ec] bg-white overflow-y-auto p-3.5 flex flex-col gap-3 max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-30 max-md:shadow-2xl"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-black text-[#18313b]">Гайд по Pybricks</h2>
              <button
                type="button"
                aria-label="Закрыть гайд"
                onClick={() => setGuideOpen(false)}
                className="grid size-8 place-items-center rounded-lg text-[#57717d] hover:bg-[#f4f8fa] hover:text-[#18313b]"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-extrabold uppercase tracking-wide text-[#086985]">
                Примеры программ
              </h3>
              {GUIDE_EXAMPLES.map((ex) => (
                <div
                  key={ex.id}
                  className="rounded-xl border border-[#dce8ec] bg-[#f8fbfc] p-2.5 flex flex-col gap-2"
                >
                  <GuideIllustration kind={ex.illustration} />
                  <div>
                    <p className="text-xs font-black text-[#18313b]">{ex.title}</p>
                    <p className="mt-0.5 text-[11px] font-medium text-[#57717d] leading-snug">{ex.summary}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleInsertExample(hub === "ev3" ? ex.ev3Code : ex.spikeCode)}
                    className="min-h-[34px] w-full rounded-lg bg-[#087996] hover:bg-[#06637a] text-white text-xs font-extrabold cursor-pointer"
                  >
                    Вставить
                  </button>
                </div>
              ))}
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-extrabold uppercase tracking-wide text-[#086985]">
                Команды
              </h3>
              {GUIDE_COMMANDS.map((cmd) => (
                <div
                  key={cmd.id}
                  className="rounded-xl border border-[#dce8ec] bg-white p-2.5 flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-black text-[#18313b]">{cmd.title}</p>
                    <button
                      type="button"
                      onClick={() => handleInsertSnippet(cmd.snippet)}
                      className="min-h-[28px] px-2.5 rounded-md bg-[#eff8fb] hover:bg-[#dff1f7] text-[#086985] text-[11px] font-extrabold cursor-pointer"
                    >
                      Вставить
                    </button>
                  </div>
                  <p className="text-[11px] font-medium text-[#57717d] leading-snug">{cmd.description}</p>
                  <pre className="rounded-lg bg-[#f4f8fa] px-2 py-1.5 font-mono text-[11px] text-[#0d3b4c] overflow-x-auto">
                    {cmd.snippet}
                  </pre>
                </div>
              ))}
            </section>
          </aside>
        )}
      </div>
    </div>
  )
}
