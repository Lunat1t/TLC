"use client"

import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "framer-motion"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { Menu, X } from "lucide-react"
import { cn } from "@/lib/utils"

// Geometry and motion values from the supplied CircleMenu.
const CONSTANTS = { itemSize: 66, containerSize: 230, openStagger: .02, closeStagger: .07 }
type CircleMenuItem = { label: string; icon: ReactNode; onSelect: () => void; disabled?: boolean; color?: string }

function MenuItem({ item, index, totalItems, isOpen, reduced }: {
  item: CircleMenuItem; index: number; totalItems: number; isOpen: boolean; reduced: boolean
}) {
  const theta = 2 * Math.PI * index / totalItems - Math.PI / 2
  const radius = CONSTANTS.containerSize / 2
  return <motion.button
    type="button"
    aria-label={item.label}
    disabled={item.disabled || !isOpen}
    tabIndex={isOpen ? 0 : -1}
    aria-hidden={!isOpen}
    initial={{ x: 0, y: 0 }}
    animate={{ x: isOpen ? radius * Math.cos(theta) : 0, y: isOpen ? radius * Math.sin(theta) : 0 }}
    whileHover={reduced ? undefined : { scale: 1.1, transition: { duration: .1, delay: 0 } }}
    transition={reduced ? { duration: 0 } : {
      delay: isOpen ? index * CONSTANTS.openStagger : index * CONSTANTS.closeStagger,
      type: "spring", stiffness: 300, damping: 30,
    }}
    style={{ width: CONSTANTS.itemSize - 2, height: CONSTANTS.itemSize - 2, backgroundColor:item.color, color:item.color?"#fff":undefined }}
    className="circle-menu-item group absolute flex items-center justify-center rounded-full bg-muted text-foreground hover:bg-muted/50 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground"
    onClick={item.onSelect}
  >
    {item.icon}
    <span className="circle-menu-label pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap text-xs text-foreground opacity-100 bg-white text-slate-800 px-2 py-1 rounded-lg shadow-sm">{item.label}</span>
  </motion.button>
}

export function CircleMenu({ items, defaultOpen = false, onClose,
  openIcon = <Menu size={18} aria-hidden="true"/>, closeIcon = <X size={18} aria-hidden="true"/>,
}: { items: CircleMenuItem[]; defaultOpen?: boolean; onClose?: () => void; openIcon?: ReactNode; closeIcon?: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const ring = useAnimationControls()
  const trigger = useAnimationControls()
  const shake = useAnimationControls()
  const reduced = Boolean(useReducedMotion())
  const mounted = useRef(true)
  const triggerNode = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    mounted.current = true
    if (defaultOpen) setIsOpen(true)
    return () => { mounted.current = false }
  }, [defaultOpen])

  async function closeAnimation() {
    setClosing(true)
    setIsOpen(false)
    triggerNode.current?.focus({ preventScroll: true })
    if (reduced) { setClosing(false); onClose?.(); return }
    const rotate = async () => {
      await ring.start({ rotate: -360, filter: "blur(1px)", transition: {
        duration: CONSTANTS.closeStagger * (items.length + 2), ease: "linear",
      } })
      if (mounted.current) ring.set({ rotate: 0, filter: "blur(0px)" })
    }
    const absorb = async () => {
      void shake.start({ translateX: [0, 2, -2, 0, 2, -2, 0], transition: {
        duration: CONSTANTS.closeStagger, ease: "linear", repeat: Infinity, repeatType: "loop",
      } })
      for (let i = 0; i < items.length - 1; i++) {
        if (!mounted.current) return
        await trigger.start({
          height: Math.min(CONSTANTS.itemSize * (1 + i * .15), CONSTANTS.itemSize * 1.5),
          width: Math.min(CONSTANTS.itemSize * (1 + i * .15), CONSTANTS.itemSize * 1.5),
          backgroundColor: `color-mix(in srgb, hsl(var(--foreground)) ${Math.max(100 - i * 10, 40)}%, hsl(var(--background)))`,
          transition: { duration: CONSTANTS.closeStagger / 2, ease: "linear" },
        })
        if (i !== items.length - 2) await new Promise(resolve => setTimeout(resolve, CONSTANTS.closeStagger * 1000))
      }
      if (!mounted.current) return
      shake.stop()
      shake.set({ translateX: 0 })
      await trigger.start({ height: CONSTANTS.itemSize, width: CONSTANTS.itemSize,
        backgroundColor: "hsl(var(--foreground))", transition: { duration: .1, ease: "backInOut" },
      })
    }
    await Promise.all([rotate(), absorb()])
    if (mounted.current) { setClosing(false); onClose?.() }
  }

  return <div className="relative flex items-center justify-center place-self-center"
    style={{ width: CONSTANTS.containerSize, height: CONSTANTS.containerSize }}>
    <motion.div animate={shake} className="relative z-50">
      <motion.button ref={triggerNode} type="button" animate={trigger}
        style={{ width: CONSTANTS.itemSize, height: CONSTANTS.itemSize }}
        className={cn("flex cursor-pointer items-center justify-center rounded-full bg-foreground text-background hover:brightness-125 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground")}
        aria-label={isOpen ? "Закрыть меню" : "Открыть меню"} aria-expanded={isOpen} aria-disabled={closing}
        onClick={() => { if (closing) return; if (isOpen) void closeAnimation(); else setIsOpen(true) }}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={isOpen ? "menu-close" : "menu-open"}
            initial={{ opacity: 0, filter: reduced ? "none" : "blur(10px)" }}
            animate={{ opacity: 1, filter: reduced ? "none" : "blur(0px)" }}
            exit={{ opacity: 0, filter: reduced ? "none" : "blur(10px)" }}
            transition={{ duration: reduced ? 0 : .2 }}>
            {isOpen ? closeIcon : openIcon}
          </motion.span>
        </AnimatePresence>
      </motion.button>
    </motion.div>
    <motion.div animate={ring} className="absolute inset-0 z-0 flex items-center justify-center">
      {items.map((item, index) => <MenuItem key={item.label} item={item} index={index} totalItems={items.length} isOpen={isOpen} reduced={reduced}/>)}
    </motion.div>
  </div>
}
