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
        sans: ["var(--font-onest)", "Onest", "ui-sans-serif", "system-ui", "sans-serif"],
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
          red: "#d12f20",
          black: "#1d1b1a",
          yellow: "#f4b04c",
          cream: "#f6e3b8",
          cyan: "#d12f20",
          paper: "#ecdcc1",
          dark: "#1d1b1a",
          button: "#1d1b1a",
        },
      },
      boxShadow: {
        sm: "0 2px 0 rgba(29,27,26,0.16)",
        DEFAULT: "0 3px 0 rgba(29,27,26,0.16)",
        md: "0 3px 0 rgba(29,27,26,0.2)",
        lg: "0 4px 0 rgba(29,27,26,0.22)",
        xl: "0 5px 0 rgba(29,27,26,0.24)",
        "2xl": "0 6px 0 rgba(29,27,26,0.26)",
        hard: "3px 3px 0 #1d1b1a",
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
