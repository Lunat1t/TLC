import type { Config } from "tailwindcss"
import tailwindcssAnimate from "tailwindcss-animate"

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-nunito)", "Nunito", "ui-rounded", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-lora)", "Lora", "Georgia", "serif"],
        mono: ["var(--font-mono-tech)", "JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        tlc: {
          red: "#e0643f",
          black: "#4b3420",
          yellow: "#ffd45e",
          cream: "#f3e7cd",
          cyan: "#f59a3b",
          paper: "#fbf5e8",
          dark: "#4b3420",
          button: "#f59a3b",
          cover: "#d9a566",
          sky: "#79c3dc",
          leaf: "#9fcf86",
        },
      },
      boxShadow: {
        sm: "0 2px 0 var(--bs-lip)",
        DEFAULT: "0 3px 0 var(--bs-lip)",
        md: "0 3px 0 var(--bs-lip)",
        lg: "0 4px 0 var(--bs-lip)",
        xl: "0 5px 0 var(--bs-lip)",
        "2xl": "0 5px 0 var(--bs-lip)",
        hard: "0 4px 0 var(--bs-lip)",
        soft: "0 8px 22px color-mix(in srgb, var(--bs-shadow) 20%, transparent)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [tailwindcssAnimate],
}

export default config
