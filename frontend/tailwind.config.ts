import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ['"Instrument Serif"', "Georgia", "serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      colors: {
        background: "var(--bg)",
        "background-raised": "var(--bg-raised)",
        "background-sunken": "var(--bg-sunken)",
        primary: "var(--text-primary)",
        secondary: "var(--text-secondary)",
        "text-tertiary": "var(--text-tertiary)",
        border: {
          DEFAULT: "var(--border)",
          strong: "var(--border-strong)",
        },
        ink: {
          DEFAULT: "#111110",
          50: "#fafaf8",
          100: "#f4f4f0",
          200: "#e8e8e4",
          300: "#d1d1cc",
          400: "#a3a3a0",
          500: "#737373",
          600: "#525252",
          700: "#404040",
          800: "#2e2e2e",
          900: "#111110",
        },
        accent: {
          DEFAULT: "var(--accent)",
          light: "#ff6b6b",
          dark: "#b83030",
          green: "var(--accent-green)",
        },
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem", letterSpacing: "0.1em" }],
        xs: ["0.75rem", { lineHeight: "1.4", letterSpacing: "0.05em" }],
        sm: ["0.875rem", { lineHeight: "1.5" }],
        base: ["1rem", { lineHeight: "1.7" }],
        lg: ["1.125rem", { lineHeight: "1.6" }],
        xl: ["1.25rem", { lineHeight: "1.5", letterSpacing: "-0.01em" }],
        "2xl": ["1.5rem", { lineHeight: "1.4", letterSpacing: "-0.02em" }],
        "3xl": ["1.875rem", { lineHeight: "1.3", letterSpacing: "-0.02em" }],
        "4xl": ["2.25rem", { lineHeight: "1.2", letterSpacing: "-0.03em" }],
        "5xl": ["3rem", { lineHeight: "1.1", letterSpacing: "-0.03em" }],
        "6xl": ["3.75rem", { lineHeight: "1", letterSpacing: "-0.04em" }],
        "7xl": ["4.5rem", { lineHeight: "1", letterSpacing: "-0.04em" }],
        "8xl": ["6rem", { lineHeight: "0.95", letterSpacing: "-0.04em" }],
      },
      animation: {
        "fade-in": "fadeIn 0.5s var(--ease-expo) forwards",
        "slide-up": "slideUp 0.5s var(--ease-expo) forwards",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      transitionTimingFunction: {
        "ease-out": "var(--ease-smooth)",
        "ease-in-out": "var(--ease-expo)",
      },
    },
  },
  plugins: [],
};

export default config;