import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Cuenta los escaneos del QR de la tarjeta. PÚBLICO y anónimo: no guarda IP ni nada que
// identifique a nadie, solo de qué soporte viene, el navegador y la hora — para saber si
// un evento (colegio, feria, reunión) ha producido algo. Sin la migración, no falla:
// simplemente no cuenta, y la página sigue funcionando.
export async function POST(req: Request) {
  const { fuente } = await req.json().catch(() => ({ fuente: null }));
  try {
    const { error } = await createSupabaseAdmin().from("EscaneoQR").insert({
      id: crypto.randomUUID(),
      fuente: typeof fuente === "string" ? fuente.slice(0, 40) : null,
      userAgent: (req.headers.get("user-agent") ?? "").slice(0, 300),
      referer: (req.headers.get("referer") ?? "").slice(0, 300),
    });
    if (error && !/EscaneoQR|relation|schema cache|does not exist/i.test(error.message)) {
      console.error("[escaneo qr]", error.message);
    }
  } catch { /* nunca debe romper la página de la tarjeta */ }
  return NextResponse.json({ ok: true });
}
