"use client"

import { createContext, useContext } from "react"

export interface NavigationTransitionState {
  getPrevPath: () => string | null
  currentPath: string
  appPage: boolean
}

export const NavigationTransitionContext = createContext<NavigationTransitionState>({
  getPrevPath: () => null,
  currentPath: "/",
  appPage: false,
})

export function useNavigationTransition() {
  return useContext(NavigationTransitionContext)
}
