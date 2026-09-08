import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { MarcaPortal } from "@/lib/marca";

// Tarjeta 1200×630 que ve el cliente cuando el enlace del portal se comparte por
// WhatsApp, iMessage o email: el LOGO (o el nombre) del despacho y qué es el enlace.
// Sin logo, el nombre en grande. Aproba solo firma en pequeño, como en los emails.
export const OG_SIZE = { width: 1200, height: 630 };

// next/og NO trae fuente de serie en el runtime Node («No fonts are loaded»): las dos Geist
// se leen del disco con rutas LITERALES desde process.cwd(), el mismo patrón que las
// plantillas EX (forms/ex) — así el trazado de Vercel las incluye en la función.
function fuente(nombre: "Geist-Bold" | "Geist-Regular"): ArrayBuffer | null {
  try {
    const buf = nombre === "Geist-Bold"
      ? readFileSync(join(process.cwd(), "lib/og/Geist-Bold.ttf"))
      : readFileSync(join(process.cwd(), "lib/og/Geist-Regular.ttf"));
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  } catch (err) {
    console.error("[og portal] fuente no disponible:", nombre, err instanceof Error ? err.message : err);
    return null;
  }
}

export async function tarjetaPortal(m: MarcaPortal | null, subtitulo: string): Promise<ImageResponse> {
  const gestoria = (m?.gestoria ?? "").trim() || "Tu gestoría";
  const logo = (m?.logoUrl ?? "").trim() || null;
  const [bold, regular] = [fuente("Geist-Bold"), fuente("Geist-Regular")];
  const fonts = [
    ...(bold ? [{ name: "Geist", data: bold, weight: 700 as const, style: "normal" as const }] : []),
    ...(regular ? [{ name: "Geist", data: regular, weight: 400 as const, style: "normal" as const }] : []),
  ];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#f3f6f4", fontFamily: fonts.length ? "Geist" : "sans-serif" }}>
        <div style={{ height: 14, background: "#0E8C5F", display: "flex" }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 80px" }}>
          <div style={{ display: "flex", background: "#ffffff", borderRadius: 32, border: "2px solid #e6eae8", padding: "56px 72px", flexDirection: "column", alignItems: "center", width: 1040 }}>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" width={640} height={170} style={{ objectFit: "contain", width: 640, height: 170 }} />
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
                <div style={{ width: 120, height: 120, borderRadius: 32, background: "#ECFDF5", color: "#0D6E4D", fontSize: 56, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {gestoria.split(" ").filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div style={{ fontSize: 64, fontWeight: 700, color: "#0f172a", letterSpacing: -1.5, maxWidth: 800 }}>{gestoria}</div>
              </div>
            )}
            <div style={{ marginTop: 36, fontSize: 40, fontWeight: 700, color: "#0f172a", textAlign: "center" }}>{subtitulo}</div>
            <div style={{ marginTop: 14, fontSize: 26, color: "#64748b", textAlign: "center" }}>{logo ? gestoria : "Enlace personal para tu trámite de extranjería"}</div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "center", paddingBottom: 26, fontSize: 20, color: "#94a3b8" }}>Con la tecnología de Aproba</div>
      </div>
    ),
    { ...OG_SIZE, fonts },
  );
}
