import Link from "next/link"
import { Sparkles, Map, Home } from "lucide-react"

export default function BattlePassPage() {
  return (
    <main className="grid min-h-[calc(100dvh-56px)] place-items-center bg-[#f3f6fb] p-5 sm:p-10 text-[#15283d]">
      <section className="battle-pass-card mx-auto grid max-w-xl gap-5 rounded-3xl border border-[#d6e1ee] bg-white p-7 sm:p-9 shadow-sm text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#fef3c7] text-[#b45309]">
          <Sparkles size={28} aria-hidden="true" />
        </div>
        <span className="mx-auto inline-flex items-center rounded-full bg-[#e6f2ff] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#1d4ed8]">
          Скоро
        </span>
        <h1 className="text-3xl font-black tracking-tight">Батл пас</h1>
        <p className="text-sm sm:text-base leading-relaxed text-[#4d6278]">
          Раздел сезонных заданий и наград пока находится в разработке. Здесь появятся уровни, челленджи по сборке и программированию роботов.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href="/map"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#0d1015] px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
          >
            <Map size={17} aria-hidden="true" />
            Открыть роадмап
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#cbd8e6] bg-[#f8fafd] px-5 py-2.5 text-sm font-bold text-[#1e354d] transition hover:bg-[#edf3fa]"
          >
            <Home size={17} aria-hidden="true" />
            На рабочий стол
          </Link>
        </div>
      </section>
    </main>
  )
}
