import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { fetchExpedienteDetalle } from "@/lib/data/expedientes";
import { datosNormalizados, datosDeCliente } from "@/lib/formularios";
import { FICHA_KEYS, type ClienteFicha } from "@/lib/ficha";
import { PROVINCIAS_052, REGLAMENTOS_052, TIPOS_VIA_052, codigoProvincia, partirDomicilio052, sinAcentos } from "@/lib/tasa790052";

// Tasa 790-052 (autorizaciones de residencia, Delegaciones del Gobierno) — paso 1: prefill.
// Sin red: solo se calculan los datos del solicitante desde el expediente (RLS) o la ficha
// del cliente, editables en el modal. La sesión + captcha de la Sede se abren en ./preparar
// (dependen de la provincia y del reglamento que elija el gestor). En familia la tasa es
// NOMINATIVA (una por solicitante), como la 012 y la 026.

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  let body: { expedienteId?: string; clienteId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const exp = body.expedienteId ? await fetchExpedienteDetalle(body.expedienteId) : null; // RLS
  const clienteId = body.clienteId?.trim() || "";
  if (!exp && !clienteId) return NextResponse.json({ error: "Indica un expediente o un cliente." }, { status: 400 });
  if (body.expedienteId && !exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  // Nacionalidad en bruto de la ficha (la Sede quiere el PAÍS: «COLOMBIA», no «colombiana»).
  let nacionalidadRaw = "";
  const cargarFicha = async (id: string, filtroFamilia?: string) => {
    let q = supabase.from("Cliente").select(FICHA_KEYS.join(", ")).eq("id", id);
    if (filtroFamilia) q = q.eq("familiaId", filtroFamilia);
    const { data: m } = await q.maybeSingle(); // RLS: si no es de su despacho, no existe
    if (!m) return null;
    const row = m as unknown as Record<string, string | null>;
    const ficha: ClienteFicha = {};
    for (const k of FICHA_KEYS) { const v = row[k]; if (typeof v === "string" && v) (ficha as Record<string, string>)[k] = v; }
    nacionalidadRaw = ficha.nacionalidad ?? "";
    return datosDeCliente(ficha, `${row.nombre ?? ""} ${row.apellidos ?? ""}`.trim(), row.telefono, row.email);
  };

  let d;
  if (!exp) {
    const desdeCliente = await cargarFicha(clienteId);
    if (!desdeCliente) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });
    d = desdeCliente;
  } else {
    d = datosNormalizados(exp);
    nacionalidadRaw = exp.clienteFicha?.nacionalidad ?? "";
  }
  if (exp && clienteId && exp.familiaId) {
    const miembro = await cargarFicha(clienteId, exp.familiaId);
    if (!miembro) return NextResponse.json({ error: "Miembro no encontrado." }, { status: 404 });
    d = miembro;
  }

  const dom = partirDomicilio052(d.domicilio);
  const nie = d.nie1 ? `${d.nie1}${d.nie2}${d.nie3}` : "";
  return NextResponse.json({
    prefill: {
      tipoDoc: nie ? "nie" : "pasaporte",
      numId: nie || d.pasaporte,
      apellido1: d.apellido1, apellido2: d.apellido2, nombre: d.nombre,
      tipoVia: dom.tipoVia, via: dom.via,
      numero: d.numero || dom.numero, piso: d.piso || dom.piso,
      municipio: d.localidad, provinciaDom: sinAcentos(d.provincia), cp: d.cp,
      telefono: d.telefono.replace(/^\+34/, "").replace(/\D/g, "").slice(0, 9),
      ciudad: d.localidad,
      // Candidatas de nacionalidad (país): la ficha en bruto, luego el país de nacimiento.
      nacionalidadCandidatas: [sinAcentos(nacionalidadRaw), sinAcentos(d.paisNac)].filter(Boolean),
      idProvincia: codigoProvincia(d.provincia, d.cp) || "28",
    },
    reglamentos: REGLAMENTOS_052,
    provincias: PROVINCIAS_052.map(([id, nombre]) => ({ id, nombre })),
    tiposVia: TIPOS_VIA_052,
  });
}
