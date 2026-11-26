import type { Metadata, Viewport } from "next"
import localFont from "next/font/local"
import "./globals.css"
import "./theme.css"
import { StudentNavigation } from "@/components/navigation/student-navigation"
import { AccountWorkspaceProvider } from "@/components/lab/account-workspace"
import { AccessProvider } from "@/components/auth/access-provider"
import { AppStartup } from "@/components/auth/app-startup"

const nunito = localFont({
  src: [
    { path: "./fonts/nunito-cyrillic-wght-normal.woff2", weight: "200 1000", style: "normal" },
    { path: "./fonts/nunito-latin-wght-normal.woff2", weight: "200 1000", style: "normal" },
  ],
  variable: "--font-nunito",
  display: "swap",
})

const lora = localFont({
  src: [
    { path: "./fonts/lora-cyrillic-wght-normal.woff2", weight: "400 700", style: "normal" },
    { path: "./fonts/lora-latin-wght-normal.woff2", weight: "400 700", style: "normal" },
  ],
  variable: "--font-lora",
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
  themeColor: "#d9a566",
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
    <html lang="ru" className={`${nunito.variable} ${lora.variable} ${jetbrainsMono.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var n=navigator,c=n.connection||{};if((n.hardwareConcurrency&&n.hardwareConcurrency<=4)||(n.deviceMemory&&n.deviceMemory<=4)||c.saveData)document.documentElement.setAttribute('data-lite','')}catch(e){}",
          }}
        />
      </head>
      <body className="min-h-dvh flex flex-col">
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
