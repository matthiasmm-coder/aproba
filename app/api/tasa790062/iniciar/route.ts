import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { fetchExpedienteDetalle } from "@/lib/data/expedientes";
import { datosNormalizados, datosDeCliente } from "@/lib/formularios";
import { FICHA_KEYS, type ClienteFicha } from "@/lib/ficha";
import {
  PROVINCIAS_062, REGLAMENTOS_062, TIPOS_VIA_062, PROVINCIAS_CATALUNA, codigoProvincia, partirDomicilio062, sinAcentos,
  nombreTrabajador062, direccionTrabajador062,
} from "@/lib/tasa790062";

// Tasa 790-062 (autorizaciones de TRABAJO, Delegaciones del Gobierno) — paso 1: prefill.
// Sin red. Dos bloques: el SUJETO PASIVO (quien paga: la empresa que contrata en cuenta ajena,
// el propio trabajador en cuenta propia) y los DATOS DEL TRABAJADOR. Se devuelven los dos
// juegos de datos para la cabecera (empresa del expediente, si la hay, y trabajador) y el
// modal deja elegir quién paga; todo editable. La sesión + captcha se abren en ./preparar.
// En familia la tasa es NOMINATIVA (una por trabajador), como las demás.

type Cabecera = { numId: string; apellido1: string; apellido2: string; nombre: string; tipoVia: string; via: string; numero: string; piso: string; municipio: string; provinciaDom: string; cp: string; telefono: string };

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

  // Cabecera cuando paga el trabajador (cuenta propia, o sin empresa en el expediente).
  const dom = partirDomicilio062(d.domicilio);
  const nie = d.nie1 ? `${d.nie1}${d.nie2}${d.nie3}` : "";
  const trabajadorCabecera: Cabecera = {
    numId: nie || d.pasaporte, apellido1: d.apellido1, apellido2: d.apellido2, nombre: d.nombre,
    tipoVia: dom.tipoVia, via: dom.via, numero: d.numero || dom.numero, piso: d.piso || dom.piso,
    municipio: d.localidad, provinciaDom: sinAcentos(d.provincia), cp: d.cp,
    telefono: d.telefono.replace(/^\+34/, "").replace(/\D/g, "").slice(0, 9),
  };

  // Cabecera cuando paga la EMPRESA (cliente-empresa del expediente): razón social en el
  // primer apellido, NIF de la empresa y su domicilio. Carga tolerante (RLS; columnas de
  // domicilio opcionales).
  let empresaCabecera: Cabecera | null = null;
  let empresaNombre: string | null = null;
  if (exp?.empresaId) {
    try {
      const { data: e } = await supabase.from("Empresa").select("razonSocial, nif, domicilio, codigoPostal, municipio, provincia, contactoTelefono").eq("id", exp.empresaId).maybeSingle();
      if (e) {
        const r = e as { razonSocial?: string | null; nif?: string | null; domicilio?: string | null; codigoPostal?: string | null; municipio?: string | null; provincia?: string | null; contactoTelefono?: string | null };
        const de = partirDomicilio062(r.domicilio ?? "");
        empresaNombre = (r.razonSocial ?? "").trim() || null;
        empresaCabecera = {
          numId: (r.nif ?? "").replace(/[\s-]/g, "").toUpperCase(), apellido1: (r.razonSocial ?? "").trim().slice(0, 50), apellido2: "", nombre: "",
          tipoVia: de.tipoVia, via: de.via, numero: de.numero, piso: de.piso,
          municipio: (r.municipio ?? "").trim(), provinciaDom: sinAcentos(r.provincia ?? ""), cp: (r.codigoPostal ?? "").replace(/\D/g, "").slice(0, 5),
          telefono: (r.contactoTelefono ?? "").replace(/^\+34/, "").replace(/\D/g, "").slice(0, 9),
        };
      }
    } catch { /* sin empresa legible → solo trabajador */ }
  }

  // Provincia donde se presenta: la del TRABAJO. Con empresa en el expediente, la de la
  // empresa (cuenta ajena: se presenta donde está el centro de trabajo); si no, la del
  // trabajador. Editable en el modal.
  let empresaProvincia = "";
  if (empresaCabecera) empresaProvincia = codigoProvincia(empresaCabecera.provinciaDom, empresaCabecera.cp);
  const idProvincia = empresaProvincia || codigoProvincia(d.provincia, d.cp) || "28";
  return NextResponse.json({
    prefill: {
      ...(empresaCabecera ?? trabajadorCabecera),
      pagador: empresaCabecera ? "empresa" : "trabajador",
      trabajadorNombre: nombreTrabajador062(d.apellido1, d.apellido2, d.nombre),
      trabajadorNacionalidad: sinAcentos(nacionalidadRaw || d.nacionalidad || d.paisNac),
      trabajadorDireccion: direccionTrabajador062(d),
      ciudad: d.localidad,
      idProvincia,
    },
    cabeceras: { empresa: empresaCabecera, trabajador: trabajadorCabecera },
    empresaNombre,
    reglamentos: REGLAMENTOS_062,
    provincias: PROVINCIAS_062.map(([id, nombre]) => ({ id, nombre })),
    tiposVia: TIPOS_VIA_062,
    provinciasCataluna: PROVINCIAS_CATALUNA,
  });
}
