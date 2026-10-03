import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { datosEncargo } from "@/lib/encargo";
import { datosDeCliente } from "@/lib/formularios";
import { FICHA_KEYS, type ClienteFicha } from "@/lib/ficha";
import { datosCanjeValidos } from "@/lib/canje";
import { partirNombreProfesional } from "@/lib/presentador";
import { rellenarMod03, rellenarMod24, type ModeloDgt, type RepresentanteDgt } from "@/lib/dgt-forms";

// IMPRESOS DE LA DGT DEL CANJE (lib/dgt-forms.ts): GET ?modelo=03 (solicitud de canje) o 24
// (otorgamiento de representación), rellenados y editables. Sesión + RLS: el expediente solo
// resuelve dentro de su despacho (anti-IDOR). Despacho, profesional y lugar: los mismos que
// la hoja de encargo (datosEncargo), para que todos los papeles del expediente cuadren.
const nombreArchivo = (s: string) => s.replace(/[^a-zA-Z0-9_-]+/g, "_");
type ExpEncargo = NonNullable<Parameters<typeof datosEncargo>[1]>;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = new URL(req.url).searchParams.get("modelo");
  const modelo: ModeloDgt | null = q === "03" || q === "24" ? q : null;
  if (!modelo) return NextResponse.json({ error: "Modelo de la DGT desconocido." }, { status: 400 });

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  let res = await supabase.from("Expediente")
    .select("id, referencia, tipo, servicioClave, serviciosExtra, suplidosOverride, descuento, serviciosAsignacion, familiaId, workspaceId, oficinaId, cliente:Cliente(*)")
    .eq("id", id).maybeSingle();
  if (res.error) res = await supabase.from("Expediente")
    .select("id, referencia, tipo, servicioClave, workspaceId, cliente:Cliente(*)")
    .eq("id", id).maybeSingle() as typeof res;
  const exp = res.data as unknown as ExpEncargo | null;
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });
  const c = exp.cliente;
  if (!c) return NextResponse.json({ error: "El canje es de una persona: este expediente no tiene titular." }, { status: 409 });

  const admin = createSupabaseAdmin();
  const datos = await datosEncargo(admin, exp);
  if (!datos) return NextResponse.json({ error: "Configura primero el servicio del expediente." }, { status: 409 });

  const ficha: ClienteFicha = {};
  for (const k of FICHA_KEYS) { const v = c[k]; if (typeof v === "string" && v) (ficha as Record<string, string>)[k] = v; }
  const persona = datosDeCliente(ficha, `${c.nombre ?? ""} ${c.apellidos ?? ""}`.trim(), c.telefono, c.email);

  let bytes: Uint8Array;
  if (modelo === "03") {
    // Los datos del permiso guardados en la carta del canje (sin la columna: casillas en blanco).
    const { data: cj } = await admin.from("Expediente").select("canje").eq("id", id).maybeSingle();
    const canje = datosCanjeValidos((cj as { canje?: unknown } | null)?.canje);
    bytes = await rellenarMod03({ datos: persona, canje, lugar: datos.lugar, fecha: datos.fecha });
  } else {
    // Representante: el profesional que firma los mandatos (Ajustes) o, sin él, el despacho.
    const m = datos.mandatario;
    const representante: RepresentanteDgt = m.nombre && m.dni
      ? { documento: m.dni, ...partirNombreProfesional(m.nombre) }
      : { documento: datos.despacho.nif, nombre: datos.despacho.nombre, apellidos: "" };
    bytes = await rellenarMod24({ datos: persona, representante, lugar: datos.lugar, fecha: datos.fecha });
  }
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="DGT_Mod${modelo}_${modelo === "03" ? "canje" : "representacion"}_${nombreArchivo(exp.referencia)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
