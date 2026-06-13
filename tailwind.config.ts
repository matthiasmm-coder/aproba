import type { Config } from "tailwindcss";

// Tokens issus de /Users/matthiasadmin/aproba-branding/BRAND-GUIDE.md
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        aproba: {
          50: "#ECFDF5",
          100: "#D1FAE5",
          500: "#10B083",
          600: "#0E8C5F",
          700: "#0D6E4D",
        },
        cream: { 50: "#FAFAF7" },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      letterSpacing: {
        tightest: "-0.04em",
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(15,23,42,0.06)",
        float: "0 20px 50px -12px rgba(14,140,95,0.25), 0 8px 24px rgba(15,23,42,0.08)",
      },
      keyframes: {
        floaty: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        scanbeam: {
          "0%": { transform: "translateY(-6px)", opacity: "0" },
          "12%": { opacity: "1" },
          "88%": { opacity: "1" },
          "100%": { transform: "translateY(172px)", opacity: "0" },
        },
        popin: {
          "0%": { transform: "scale(0.5) rotate(-8deg)", opacity: "0" },
          "60%": { transform: "scale(1.1) rotate(2deg)", opacity: "1" },
          "100%": { transform: "scale(1) rotate(-4deg)", opacity: "1" },
        },
        slideup: {
          "0%": { transform: "translateY(14px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        blob: {
          "0%,100%": { transform: "translate(0,0) scale(1)" },
          "33%": { transform: "translate(20px,-16px) scale(1.08)" },
          "66%": { transform: "translate(-14px,12px) scale(0.95)" },
        },
        fadein: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
      },
      animation: {
        floaty: "floaty 5s ease-in-out infinite",
        scanbeam: "scanbeam 2.8s ease-in-out infinite",
        popin: "popin 0.6s cubic-bezier(0.34,1.56,0.64,1) forwards",
        slideup: "slideup 0.5s ease-out forwards",
        "blob-slow": "blob 16s ease-in-out infinite",
        fadein: "fadein 0.5s ease-out forwards",
        marquee: "marquee 50s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
