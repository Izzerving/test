import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#09090B",
        foreground: "#FAFAFA",
        card: "#111113",
        muted: "#a1a1aa",
        primary: "#e11d48",
        border: "#27272a"
      }
    }
  },
  plugins: []
} satisfies Config;
