"use client"

import { useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { usePathname } from "next/navigation"
import { useNavigationTransition } from "@/components/navigation/navigation-transition"
import { getRouteTransitionDirection } from "@/lib/navigation-shell"

export default function RootTemplate({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const reduced = useReducedMotion()
  const { getPrevPath, appPage } = useNavigationTransition()

  const [transition] = useState(() => {
    const prevPath = getPrevPath()
    return {
      animate: prevPath !== null && prevPath !== pathname,
      direction: getRouteTransitionDirection(prevPath, pathname),
    }
  })

  if (!appPage) {
    return <>{children}</>
  }

  if (reduced || !transition.animate) {
    return <div className="tlc-page-frame">{children}</div>
  }

  return (
    <motion.div
      className="tlc-page-frame"
      initial={{ opacity: 0.35, x: transition.direction * 28 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}
