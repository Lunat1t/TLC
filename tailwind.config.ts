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
      colors: {
        red: {50: "#fdeaea", 100: "#fbd0d0", 200: "#f8a9a9", 300: "#f8a9a9", 400: "#ed2929", 500: "#ed2929", 600: "#931919", 700: "#931919", 800: "#931919", 900: "#212121", 950: "#212121"},
        rose: {50: "#fdeaea", 100: "#fbd0d0", 200: "#f8a9a9", 300: "#f8a9a9", 400: "#ed2929", 500: "#ed2929", 600: "#931919", 700: "#931919", 800: "#931919", 900: "#212121", 950: "#212121"},
        orange: {50: "#fef0e8", 100: "#fddecb", 200: "#fcc4a1", 300: "#fcc4a1", 400: "#f76b14", 500: "#f76b14", 600: "#99420c", 700: "#99420c", 800: "#99420c", 900: "#212121", 950: "#212121"},
        amber: {50: "#fff8e6", 100: "#fff0c7", 200: "#ffe499", 300: "#ffe499", 400: "#ffbb00", 500: "#ffbb00", 600: "#9e7400", 700: "#9e7400", 800: "#9e7400", 900: "#212121", 950: "#212121"},
        yellow: {50: "#fff8e6", 100: "#fff0c7", 200: "#ffe499", 300: "#ffe499", 400: "#ffbb00", 500: "#ffbb00", 600: "#9e7400", 700: "#9e7400", 800: "#9e7400", 900: "#212121", 950: "#212121"},
        green: {50: "#e9f8ea", 100: "#ceefd0", 200: "#a7e3aa", 300: "#a7e3aa", 400: "#22b82b", 500: "#22b82b", 600: "#15721b", 700: "#15721b", 800: "#15721b", 900: "#212121", 950: "#212121"},
        emerald: {50: "#e9f8ea", 100: "#ceefd0", 200: "#a7e3aa", 300: "#a7e3aa", 400: "#22b82b", 500: "#22b82b", 600: "#15721b", 700: "#15721b", 800: "#15721b", 900: "#212121", 950: "#212121"},
        lime: {50: "#e9f8ea", 100: "#ceefd0", 200: "#a7e3aa", 300: "#a7e3aa", 400: "#22b82b", 500: "#22b82b", 600: "#15721b", 700: "#15721b", 800: "#15721b", 900: "#212121", 950: "#212121"},
        blue: {50: "#e6f4fe", 100: "#c7e6fd", 200: "#99d2fc", 300: "#99d2fc", 400: "#008ef8", 500: "#008ef8", 600: "#00589a", 700: "#00589a", 800: "#00589a", 900: "#212121", 950: "#212121"},
        sky: {50: "#e6f4fe", 100: "#c7e6fd", 200: "#99d2fc", 300: "#99d2fc", 400: "#008ef8", 500: "#008ef8", 600: "#00589a", 700: "#00589a", 800: "#00589a", 900: "#212121", 950: "#212121"},
        cyan: {50: "#e6f4fe", 100: "#c7e6fd", 200: "#99d2fc", 300: "#99d2fc", 400: "#008ef8", 500: "#008ef8", 600: "#00589a", 700: "#00589a", 800: "#00589a", 900: "#212121", 950: "#212121"},
        teal: {50: "#e6f4fe", 100: "#c7e6fd", 200: "#99d2fc", 300: "#99d2fc", 400: "#008ef8", 500: "#008ef8", 600: "#00589a", 700: "#00589a", 800: "#00589a", 900: "#212121", 950: "#212121"},
        purple: {50: "#f1ecfd", 100: "#e0d4fb", 200: "#c6b1f8", 300: "#c6b1f8", 400: "#703cee", 500: "#703cee", 600: "#452594", 700: "#452594", 800: "#452594", 900: "#212121", 950: "#212121"},
        violet: {50: "#f1ecfd", 100: "#e0d4fb", 200: "#c6b1f8", 300: "#c6b1f8", 400: "#703cee", 500: "#703cee", 600: "#452594", 700: "#452594", 800: "#452594", 900: "#212121", 950: "#212121"},
        slate: { 50: "#fafafa", 100: "#f3f3f3", 200: "#dedede", 300: "#cccccc", 400: "#929292", 500: "#626262", 600: "#525252", 700: "#414141", 800: "#303030", 900: "#212121", 950: "#212121" },
        gray: { 50: "#fafafa", 100: "#f3f3f3", 200: "#dedede", 300: "#cccccc", 400: "#929292", 500: "#626262", 600: "#525252", 700: "#414141", 800: "#303030", 900: "#212121", 950: "#212121" },
        zinc: { 50: "#fafafa", 100: "#f3f3f3", 200: "#dedede", 300: "#cccccc", 400: "#929292", 500: "#626262", 600: "#525252", 700: "#414141", 800: "#303030", 900: "#212121", 950: "#212121" },
        brand: { red: "#ed2929", orange: "#f76b14", yellow: "#ffbb00", green: "#22b82b", blue: "#008ef8", purple: "#703cee", ink: "#212121" },
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
          cyan: "#008ef8",
          dark: "#212121",
          button: "#212121",
        },
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
