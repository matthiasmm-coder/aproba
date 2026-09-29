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
          200: "#A7F3D0",
          300: "#6EE7B7",
          400: "#34D399",
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
        // Gráficos de Facturas › Estadísticas: barras que crecen, líneas que se trazan.
        crecer: { "0%": { transform: "scaleY(0)" }, "100%": { transform: "scaleY(1)" } },
        trazo: { "0%": { strokeDashoffset: "1" }, "100%": { strokeDashoffset: "0" } },
        aparecer: { "0%": { opacity: "0", transform: "translateY(4px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
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
        // Migración animada de la portada (components/migracion-animada.tsx), ciclo de 6 s.
        // El paquete es una capa del ancho (o alto) del hilo con el punto en su extremo:
        // translate en % de su propio tamaño = del hilo → todo en transform, nada de left/top.
        viajeX: {
          "0%": { transform: "translateX(-100%)", opacity: "0" },
          "4%": { opacity: "1" },
          "22%": { opacity: "1" },
          "25%, 100%": { transform: "translateX(0)", opacity: "0" },
        },
        viajeY: {
          "0%": { transform: "translateY(-100%)", opacity: "0" },
          "4%": { opacity: "1" },
          "22%": { opacity: "1" },
          "25%, 100%": { transform: "translateY(0)", opacity: "0" },
        },
        resalte: {
          "0%, 30%, 100%": { backgroundColor: "rgba(16,176,131,0)" },
          "5%, 20%": { backgroundColor: "rgba(16,176,131,0.13)" },
        },
        // El ✓ del cliente en Aproba (retraso = llegada de SUS datos): aparece cuando llegan, y se
        // va a los 4,5 s, justo cuando su paquete siguiente sale de la IA (1,5 s antes de llegar).
        sello: {
          "0%": { transform: "scale(0.4)", opacity: "0" },
          "6%": { transform: "scale(1.15)", opacity: "1" },
          "10%, 72%": { transform: "scale(1)", opacity: "1" },
          "76%, 100%": { transform: "scale(0.6)", opacity: "0" },
        },
        // La onda de la IA, una por paquete que entra (retraso = llegada del paquete).
        latido: {
          "0%": { transform: "scale(1)", opacity: "0.5" },
          "22%, 100%": { transform: "scale(1.75)", opacity: "0" },
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
        crecer: "crecer 0.7s cubic-bezier(0.2,0.8,0.2,1) both",
        trazo: "trazo 1.1s cubic-bezier(0.4,0,0.2,1) 0.25s both",
        aparecer: "aparecer 0.15s ease-out both",
        "viaje-x": "viajeX 6s cubic-bezier(0.45,0,0.25,1) infinite both",
        "viaje-y": "viajeY 6s cubic-bezier(0.45,0,0.25,1) infinite both",
        resalte: "resalte 6s ease-in-out infinite both",
        sello: "sello 6s ease-out infinite both",
        latido: "latido 6s ease-out infinite both",
      },
    },
  },
  plugins: [],
};

export default config;
