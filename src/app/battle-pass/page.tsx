import Link from "next/link"
import { Sparkles, Map, Home } from "lucide-react"

export default function BattlePassPage() {
  return (
    <main className="grid min-h-full place-items-center bg-[#f7f5ef] p-5 sm:p-10 text-[#22201b]">
      <section className="battle-pass-card mx-auto grid max-w-xl gap-5 rounded-md border border-[#1a181373] bg-white p-7 sm:p-9 shadow-sm text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-md bg-[#fef3c7] text-[#b45309]">
          <Sparkles size={28} aria-hidden="true" />
        </div>
        <span className="mx-auto inline-flex items-center rounded-md bg-[#f4f1e9] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#b79cf5]">
          Скоро
        </span>
        <h1 className="text-3xl font-bold tracking-tight">Батл пас</h1>
        <p className="text-sm sm:text-base leading-relaxed text-[#6b655a]">
          Раздел сезонных заданий и наград пока находится в разработке. Здесь появятся уровни, челленджи по сборке и программированию роботов.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href="/map"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-[#12100e] px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
          >
            <Map size={17} aria-hidden="true" />
            Открыть роадмап
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-[#1a181373] bg-[#faf8f4] px-5 py-2.5 text-sm font-bold text-[#2b2822] transition hover:bg-[#f5f2ea]"
          >
            <Home size={17} aria-hidden="true" />
            На рабочий стол
          </Link>
        </div>
      </section>
    </main>
  )
}
