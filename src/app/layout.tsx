import type { Metadata, Viewport } from "next"
import "./globals.css"
import { StudentNavigation } from "@/components/navigation/student-navigation"
import { AchievementNotifier } from "@/components/profile/achievement-notifier"
import { AccountWorkspaceProvider } from "@/components/lab/account-workspace"
import { AccessProvider } from "@/components/auth/access-provider"
import { AppStartup } from "@/components/auth/app-startup"

export const metadata: Metadata = {
  title: "TLC — программирование роботов",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "TechLabCode", statusBarStyle: "default" },
  icons: { apple: "/icons/icon-180.png", icon: "/icons/icon-192.png" },
  description:
    "Среда блочного программирования роботов LEGO SPIKE Prime и LEGO EV3",
}

export const viewport: Viewport = {
  themeColor: "#008ef8",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ru">
      <body className="min-h-dvh flex flex-col"><AccessProvider><AccountWorkspaceProvider><AppStartup><StudentNavigation>{children}</StudentNavigation><AchievementNotifier /></AppStartup></AccountWorkspaceProvider></AccessProvider></body>
    </html>
  )
}
