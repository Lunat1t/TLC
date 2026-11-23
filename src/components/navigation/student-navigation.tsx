"use client"

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  ChevronDown,
  Home,
  LogIn,
  LogOut,
  Map,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react"
import { useAccess } from "@/components/auth/access-provider"
import { useRouteWarmup } from "@/components/auth/app-startup"
import { useWorkspaceSettings } from "@/components/lab/workspace-settings"
import { signOutFromSupabase } from "@/lib/auth"
import {
  MAIN_NAV_TABS,
  getExtraNavPages,
  getRoleLabel,
  getTopbarBrandTarget,
  isNavPathActive,
  isNavigableAppPath,
  shouldShowMainNavTabs,
  type NavIconKey,
} from "@/lib/navigation-shell"
import { AppLauncher } from "./app-launcher"
import { NavigationTransitionContext } from "./navigation-transition"
import "./navigation-shell.css"

const MAIN_ICONS: Partial<Record<NavIconKey, LucideIcon>> = {
  home: Home,
  map: Map,
  "battle-pass": Sparkles,
  settings: Settings,
}

export function StudentNavigation({ children }: { children: ReactNode }) {
  const path = usePathname()
  const router = useRouter()
  const access = useAccess()
  const warm = useRouteWarmup()
  const { settings } = useWorkspaceSettings()
  const reduced = useReducedMotion()

  const lastCommittedPathRef = useRef<string | null>(null)
  const getPrevPath = useCallback(() => lastCommittedPathRef.current, [])
  useEffect(() => {
    lastCommittedPathRef.current = path
  }, [path])

  const [accountOpen, setAccountOpen] = useState(false)
  const accountRoot = useRef<HTMLDivElement>(null)
  const accountTrigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setAccountOpen(false)
  }, [path])

  useEffect(() => {
    if (!accountOpen) return
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !accountRoot.current?.contains(event.target)) {
        setAccountOpen(false)
      }
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault()
        setAccountOpen(false)
        accountTrigger.current?.focus()
      }
    }
    document.addEventListener("pointerdown", dismiss)
    document.addEventListener("keydown", escape)
    return () => {
      document.removeEventListener("pointerdown", dismiss)
      document.removeEventListener("keydown", escape)
    }
  }, [accountOpen])

  const home = path === "/dashboard"
  const preferences = path === "/settings"
  const appPage = isNavigableAppPath(path)

  const showMainTabs = shouldShowMainNavTabs(access.role)
  const brandTarget = getTopbarBrandTarget({
    userId: access.userId,
    role: access.role,
  })
  const extraPages = getExtraNavPages({
    role: access.role,
    canPublish: access.canPublish,
    isAdmin: access.isAdmin,
  })

  const nickname = access.profile?.nickname || "Аккаунт"
  const roleLabel = getRoleLabel(access.role, access.isAdmin)
  const avatarBg = access.profile?.avatar?.bodyColor || "#34bdf2"
  const avatarInitial = nickname.trim().slice(0, 1).toUpperCase() || "B"

  async function handleSignOut() {
    setAccountOpen(false)
    await signOutFromSupabase(localStorage)
    router.replace("/login")
    router.refresh()
  }

  const rootStyle: CSSProperties = {
    "--workspace-background": settings.color,
  } as CSSProperties

  const contentStyle: CSSProperties =
    settings.background === "wallpaper" && settings.wallpaper
      ? {
          backgroundImage: `url("${settings.wallpaper}")`,
          backgroundSize: settings.wallpaperFit || "cover",
          backgroundPosition: "center top",
          backgroundRepeat: "no-repeat",
        }
      : {}

  return (
    <NavigationTransitionContext.Provider
      value={{ getPrevPath, currentPath: path, appPage }}
    >
      <div
        data-wallpaper={settings.background === "wallpaper" && !!settings.wallpaper ? "true" : undefined}
        data-theme={settings.theme}
        data-background={settings.background}
        style={rootStyle}
        className={`tlc-os${home ? " is-desktop" : ""}${preferences ? " is-preferences" : ""}${
          appPage ? " is-app" : " is-public"
        }`}
      >
        {appPage && (
          <header className="studio-topbar">
            <Link
              href={brandTarget.href}
              className="studio-brand"
              aria-label={brandTarget.label}
              onPointerEnter={() => warm(brandTarget.href)}
              onFocus={() => warm(brandTarget.href)}
            >
              <span className="studio-brand-mark" aria-hidden="true">
                BS
              </span>
              <span className="studio-brand-text">Brick Studio</span>
            </Link>

            {showMainTabs || extraPages.length > 0 ? (
              <nav className="studio-nav-center" aria-label="Разделы Brick Studio">
                {showMainTabs && (
                  <div className="studio-tabs">
                    {MAIN_NAV_TABS.map((tab) => {
                      const Icon = MAIN_ICONS[tab.iconKey] ?? Home
                      const active = isNavPathActive(path, tab.path)
                      return (
                        <Link
                          key={tab.path}
                          href={tab.path}
                          className="studio-tab"
                          data-active={active ? "true" : "false"}
                          aria-label={tab.label}
                          title={tab.label}
                          aria-current={active ? "page" : undefined}
                          onPointerEnter={() => warm(tab.path)}
                          onFocus={() => warm(tab.path)}
                        >
                          <Icon size={18} aria-hidden="true" />
                          <AnimatePresence initial={false}>
                            {active && (
                              <motion.span
                                key="label"
                                className="studio-tab-label"
                                initial={reduced ? false : { opacity: 0, width: 0 }}
                                animate={{ opacity: 1, width: "auto" }}
                                exit={reduced ? { opacity: 0 } : { opacity: 0, width: 0 }}
                                transition={reduced ? { duration: 0 } : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                              >
                                {tab.label}
                              </motion.span>
                            )}
                          </AnimatePresence>
                          {active && (
                            <motion.span
                              layoutId={reduced ? undefined : "studio-tab-notch"}
                              className="studio-tab-notch"
                              aria-hidden="true"
                              transition={
                                reduced
                                  ? { duration: 0 }
                                  : { type: "spring", stiffness: 460, damping: 34 }
                              }
                            >
                              <svg width="34" height="8" viewBox="0 0 34 8" fill="none">
                                <path
                                  d="M0 0C8 0 12.5 8 17 8C21.5 8 26 0 34 0H0Z"
                                  fill="currentColor"
                                />
                              </svg>
                            </motion.span>
                          )}
                        </Link>
                      )
                    })}
                  </div>
                )}

                {extraPages.length > 0 && <AppLauncher apps={extraPages} />}
              </nav>
            ) : (
              <div aria-hidden="true" />
            )}

            <div ref={accountRoot} className="studio-account">
              <button
                ref={accountTrigger}
                type="button"
                className="studio-account-trigger"
                aria-label={`Аккаунт: ${nickname}`}
                aria-expanded={accountOpen}
                aria-controls="studio-account-menu"
                aria-haspopup="menu"
                onClick={() => setAccountOpen((value) => !value)}
              >
                <span
                  className="studio-account-avatar"
                  style={settings.profilePhoto ? undefined : { background: avatarBg }}
                  aria-hidden="true"
                >
                  {settings.profilePhoto ? (
                    <img src={settings.profilePhoto} alt="" />
                  ) : (
                    avatarInitial
                  )}
                </span>
                <span className="studio-account-meta">
                  <strong>{nickname}</strong>
                  <small>{roleLabel}</small>
                </span>
                <ChevronDown size={15} className="studio-account-chevron" aria-hidden="true" />
              </button>

              <AnimatePresence>
                {accountOpen && (
                  <motion.div
                    id="studio-account-menu"
                    role="menu"
                    aria-label="Меню аккаунта"
                    className="studio-account-menu"
                    initial={reduced ? { opacity: 1 } : { opacity: 0, y: -6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.97 }}
                    transition={reduced ? { duration: 0 } : { duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <div className="studio-account-header">
                      <strong>{nickname}</strong>
                      <span>{roleLabel}</span>
                    </div>

                    <Link
                      href="/settings"
                      role="menuitem"
                      className="studio-account-item"
                      aria-current={isNavPathActive(path, "/settings") ? "page" : undefined}
                      onPointerEnter={() => warm("/settings")}
                      onClick={() => setAccountOpen(false)}
                    >
                      <Settings size={17} aria-hidden="true" />
                      <span>Настройки</span>
                    </Link>

                    {access.userId ? (
                      <button
                        type="button"
                        role="menuitem"
                        className="studio-account-item is-danger"
                        onClick={() => void handleSignOut()}
                      >
                        <LogOut size={17} aria-hidden="true" />
                        <span>Выйти</span>
                      </button>
                    ) : (
                      <Link
                        href="/login"
                        role="menuitem"
                        className="studio-account-item"
                        onClick={() => setAccountOpen(false)}
                      >
                        <LogIn size={17} aria-hidden="true" />
                        <span>Войти</span>
                      </Link>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </header>
        )}

        <div className="os-content" style={contentStyle}>
          {appPage && !home && !preferences ? (
            <div className="workshop-section">
              <div className="workshop-section-body">{children}</div>
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </NavigationTransitionContext.Provider>
  )
}
