import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { fetchExpedienteDetalle } from "@/lib/data/expedientes";
import { datosNormalizados, datosDeCliente } from "@/lib/formularios";
import { FICHA_KEYS, type ClienteFicha } from "@/lib/ficha";
import { IMPORTE_026, partirDomicilio026 } from "@/lib/tasa790026";

// Tasa 790-026 (nacionalidad por residencia) — paso 1: prefill. Sin sesión ni captcha
// (la Sede de Justicia no los pide): aquí solo se calculan los datos del solicitante,
// editables en el modal. La descarga del impreso fresco ocurre en ./descargar.
// Misma lógica de acceso que la 790-012: expediente (RLS) o ficha de cliente, y en
// familia la tasa es NOMINATIVA (una por solicitante).

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

  const cargarFicha = async (id: string, filtroFamilia?: string) => {
    let q = supabase.from("Cliente").select(FICHA_KEYS.join(", ")).eq("id", id);
    if (filtroFamilia) q = q.eq("familiaId", filtroFamilia);
    const { data: m } = await q.maybeSingle(); // RLS: si no es de su despacho, no existe
    if (!m) return null;
    const row = m as unknown as Record<string, string | null>;
    const ficha: ClienteFicha = {};
    for (const k of FICHA_KEYS) { const v = row[k]; if (typeof v === "string" && v) (ficha as Record<string, string>)[k] = v; }
    return datosDeCliente(ficha, `${row.nombre ?? ""} ${row.apellidos ?? ""}`.trim(), row.telefono, row.email);
  };

  let d;
  if (!exp) {
    const desdeCliente = await cargarFicha(clienteId);
    if (!desdeCliente) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });
    d = desdeCliente;
  } else {
    d = datosNormalizados(exp);
  }
  if (exp && clienteId && exp.familiaId) {
    const miembro = await cargarFicha(clienteId, exp.familiaId);
    if (!miembro) return NextResponse.json({ error: "Miembro no encontrado." }, { status: 404 });
    d = miembro;
  }

  const dom = partirDomicilio026(d.domicilio);
  const nie = d.nie1 ? `${d.nie1}${d.nie2}${d.nie3}` : "";
  return NextResponse.json({
    prefill: {
      tipoDoc: nie ? "nie" : "pasaporte",
      numId: nie || d.pasaporte,
      apellido1: d.apellido1, apellido2: d.apellido2, nombre: d.nombre,
      domicilio: dom.domicilio,
      numero: d.numero || dom.numero, piso: d.piso || dom.piso,
      municipio: d.localidad, provincia: d.provincia, pais: "España", cp: d.cp,
      fechaNac: d.fechaD && d.fechaM && d.fechaA ? `${d.fechaD.padStart(2, "0")}/${d.fechaM.padStart(2, "0")}/${d.fechaA}` : "",
      telefono: d.telefono, email: d.email,
      importe: IMPORTE_026,
      firmaLugar: d.localidad,
    },
  });
}
