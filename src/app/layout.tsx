import type { Metadata, Viewport } from "next"
import "./globals.css"
import "./avatar/orb-emotions.css"

export const metadata: Metadata = {
  title: "TLC — программирование роботов",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "TechLabCode", statusBarStyle: "default" },
  icons: { apple: "/icons/icon-180.png", icon: "/icons/icon-192.png" },
  description:
    "Среда блочного программирования роботов LEGO SPIKE Prime и LEGO EV3",
}

export const viewport: Viewport = {
  themeColor: "#02c7ea",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ru">
      <body className="min-h-dvh flex flex-col">{children}</body>
    </html>
  )
}
