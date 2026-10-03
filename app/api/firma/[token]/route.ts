import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { evidencia, sobrePorToken } from "@/lib/firma/servicio";
import { sobrePublico } from "@/lib/firma/publico";
import { ipDe, resumenDispositivo } from "@/lib/firma/sobre";

// PÁGINA DE FIRMA (pública, por enlace secreto): lo que se enseña del sobre. La PRIMERA
// apertura queda en las pruebas (fecha, IP, dispositivo): «el firmante abrió los documentos».
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createSupabaseAdmin();
  const s = await sobrePorToken(admin, token);
  if (!s) return NextResponse.json({ error: "Enlace no válido." }, { status: 404 });
  if (s.estado === "PENDIENTE" && !s.abiertoAt) {
    const ahora = new Date().toISOString();
    s.evidencias = await evidencia(admin, s, { evento: "abierto", ip: ipDe(req.headers), dispositivo: resumenDispositivo(req.headers.get("user-agent")) }, { abiertoAt: ahora });
    s.abiertoAt = ahora;
  }
  return NextResponse.json(await sobrePublico(admin, s), { headers: { "Cache-Control": "no-store" } });
}
