import type { Metadata, Viewport } from "next"
import "./globals.css"
import { StudentNavigation } from "@/components/navigation/student-navigation"
import { AccountWorkspaceProvider } from "@/components/lab/account-workspace"
import { AccessProvider } from "@/components/auth/access-provider"
import { AppStartup } from "@/components/auth/app-startup"

export const metadata: Metadata = {
  title: "Brick Studio — программирование роботов",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Brick Studio", statusBarStyle: "default" },
  icons: { apple: "/icons/icon-180.png", icon: "/icons/icon-192.png" },
  description:
    "Среда блочного программирования роботов LEGO SPIKE Prime и LEGO EV3",
}

export const viewport: Viewport = {
  themeColor: "#0d1015",
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
      <body className="min-h-dvh flex flex-col bg-[#0d1015]"><AccessProvider><AccountWorkspaceProvider><AppStartup><StudentNavigation>{children}</StudentNavigation></AppStartup></AccountWorkspaceProvider></AccessProvider></body>
    </html>
  )
}
