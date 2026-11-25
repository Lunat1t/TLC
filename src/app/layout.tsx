import type { Metadata, Viewport } from "next"
import localFont from "next/font/local"
import "./globals.css"
import { StudentNavigation } from "@/components/navigation/student-navigation"
import { AccountWorkspaceProvider } from "@/components/lab/account-workspace"
import { AccessProvider } from "@/components/auth/access-provider"
import { AppStartup } from "@/components/auth/app-startup"

const onest = localFont({
  src: [
    { path: "./fonts/onest-cyrillic-wght-normal.woff2", weight: "100 900", style: "normal" },
    { path: "./fonts/onest-latin-wght-normal.woff2", weight: "100 900", style: "normal" },
  ],
  variable: "--font-onest",
  display: "swap",
})

const jetbrainsMono = localFont({
  src: [
    { path: "./fonts/jetbrains-mono-cyrillic-wght-normal.woff2", weight: "100 800", style: "normal" },
    { path: "./fonts/jetbrains-mono-latin-wght-normal.woff2", weight: "100 800", style: "normal" },
  ],
  variable: "--font-mono-tech",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Brick Studio — программирование роботов",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Brick Studio", statusBarStyle: "default" },
  icons: { apple: "/icons/icon-180.png", icon: "/icons/icon-192.png" },
  description:
    "Среда блочного программирования роботов LEGO SPIKE Prime и LEGO EV3",
}

export const viewport: Viewport = {
  themeColor: "#12100e",
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
    <html lang="ru" className={`${onest.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-dvh flex flex-col bg-[#12100e]">
        <AccessProvider>
          <AccountWorkspaceProvider>
            <AppStartup>
              <StudentNavigation>{children}</StudentNavigation>
            </AppStartup>
          </AccountWorkspaceProvider>
        </AccessProvider>
      </body>
    </html>
  )
}
