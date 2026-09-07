import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { BASE_052, UA_052, cuerpoLatin1, decodificarLatin1, fechaLarga052, importe052, type Epigrafe052 } from "@/lib/tasa790052";

// Tasa 790-052 — paso 3: se reenvían a la Sede TODOS los campos del impreso oficial con
// la misma sesión, el justificante asignado y el captcha tecleado por el gestor, y se
// recupera el PDF oficial con código de barras. Si la Sede devuelve HTML (captcha
// erróneo, dato rechazado) se extrae su mensaje. Archivo: {expedienteId}/tasa-790-052
// [-{clienteId}].pdf — ruta determinista como la 026; tasaPath (012) no se toca.

type Campos = Record<string, string>;

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  let body: { expedienteId?: string; clienteId?: string; sid?: string; idProvincia?: string; reglamento?: string; justificante?: string; campos?: Campos; epigrafe?: Epigrafe052 };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const sid = body.sid ?? "";
  const c = body.campos ?? {};
  const e = body.epigrafe;
  const expedienteId = body.expedienteId ?? "";
  const clienteId = body.clienteId?.trim() || "";
  const idProvincia = String(body.idProvincia ?? "").padStart(2, "0");
  const reglamento = String(body.reglamento ?? "");
  const justificante = String(body.justificante ?? "").replace(/\D/g, "");
  if (!/JSESSIONID/i.test(sid) || !c.captcha?.trim()) return NextResponse.json({ error: "Sesión o código de seguridad ausentes." }, { status: 400 });
  if (!/^\d{2}$/.test(idProvincia) || !/^\d{10,15}$/.test(justificante) || !e?.id) return NextResponse.json({ error: "Faltan la provincia, el justificante o la línea de tasa." }, { status: 400 });
  for (const k of ["numId", "apellido1", "nombre", "tipoVia", "via", "numero", "municipio", "provinciaDom", "cp", "ciudad", "nacionalidad"] as const) {
    if (!String(c[k] ?? "").trim()) return NextResponse.json({ error: `Falta un dato obligatorio (${k}).` }, { status: 400 });
  }
  if (!/^\d{5}$/.test(c.cp)) return NextResponse.json({ error: "El código postal debe tener 5 cifras." }, { status: 400 });
  const imp = importe052(e, c.fechaEfectos, c.fechaCaducidad);
  if (!imp) return NextResponse.json({ error: "Para esta línea hacen falta las fechas de efectos y de caducidad (la caducidad posterior a los efectos)." }, { status: 400 });

  // Todos los campos del formulario oficial (los deshabilitados por «PRINCIPAL» no viajan).
  const up = (v?: string) => String(v ?? "").trim().toUpperCase();
  const form: Campos = {
    idProvincia, Ctrl_Id: "", Ctrl_CodigoTasa: "052", Ctrl_Ejercicio: String(new Date().getFullYear()), Ctrl_NumJustificante: justificante,
    Ctrl_NIFRem: up(c.numId), Ctrl_Apellido1: up(c.apellido1), Ctrl_Apellido2: up(c.apellido2), Ctrl_NombreRem: up(c.nombre),
    Ctrl_SelNacionalidad: up(c.nacionalidad), Ctrl_Nacionalidad: up(c.nacionalidad),
    Ctrl_TipoViaDom: up(c.tipoVia), Ctrl_ViaDom: up(c.via), Ctrl_NumeroDom: up(c.numero).slice(0, 3), Ctrl_EscaleraDom: up(c.escalera).slice(0, 3), Ctrl_PisoDom: up(c.piso).slice(0, 3), Ctrl_PuertaDom: up(c.puerta).slice(0, 3),
    Ctrl_MunicipioDom: up(c.municipio), Ctrl_ProvinciaDom: up(c.provinciaDom), Ctrl_CPostalDom: c.cp, Ctrl_TelefonoDom: String(c.telefono ?? "").replace(/\D/g, "").slice(0, 9),
    Ctrl_TipoAutoliquidacionP: "on", Ctrl_NumJustificantePr: "",
    [e.id]: "on",
    ...(e.porDia ? { Ctrl_Importe052_1_2_1_0: e.porDia, Ctrl_FechaEfectos: c.fechaEfectos ?? "", Ctrl_FechaCaducidad: c.fechaCaducidad ?? "" } : { Ctrl_FechaEfectos: "", Ctrl_FechaCaducidad: "" }),
    Ctrl_NumExpediente: up(c.numExpediente).slice(0, 15),
    Ctrl_Ciudad: up(c.ciudad), Ctrl_FechaActual: fechaLarga052(), Ctrl_NumSeguridad: c.captcha.trim(), "33": "I",
    Ctrl_Importe_Euros: imp.euros, Ctrl_Importe_Centimos: imp.centimos,
    Ctrl_IBAN_1: "", Ctrl_IBAN_2: "", Ctrl_IBAN_3: "", Ctrl_IBAN_4: "", Ctrl_IBAN_5: "", Ctrl_IBAN_6: "",
    reglamento,
  };

  let res: Response;
  try {
    res = await fetch(`${BASE_052}/generaDocPDF`, {
      method: "POST",
      headers: { "User-Agent": UA_052, Cookie: sid, "Content-Type": "application/x-www-form-urlencoded", Referer: `${BASE_052}/prepareTasa?idTasa=052&idModelo=790&idProvincia=${idProvincia}&reglamento=${encodeURIComponent(reglamento)}` },
      body: cuerpoLatin1(form), redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(30000),
    });
  } catch {
    return NextResponse.json({ error: "No se pudo contactar con la Sede de Administraciones Públicas." }, { status: 502 });
  }

  const raw = await res.arrayBuffer();
  const buf = Buffer.from(raw);
  const esPdf = buf.subarray(0, 5).toString("latin1") === "%PDF-";
  if (!esPdf) {
    // HTML de vuelta: la Sede responde con una página «mostrarError()» cuyo código va en
    // cdError (001 = captcha incorrecto, 030 = justificante ya impreso, 020/021 = servicio
    // caído; comprobado 08/09/2026). Cualquier otro caso: su aviso literal o el captcha.
    const html = decodificarLatin1(raw);
    const cod = (html.match(/cdError\s*=\s*"(\d+)"/) || [])[1] ?? "";
    const aviso = (html.match(/mensajeAviso\s*=\s*"([^"]{5,300})"/) || html.match(/alert\(["']([^"']{8,200})["']\)/) || [])[1]?.trim();
    const MENSAJES: Record<string, string> = {
      "001": "El código de seguridad no coincide (es de un solo uso). Escribe el nuevo código que aparece e inténtalo otra vez.",
      "030": "La Sede dice que ese número de justificante ya se ha impreso. Se ha abierto un impreso nuevo: vuelve a escribir el código.",
      "020": "La Sede de Administraciones Públicas no puede generar impresos en este momento (error 020, no es Aproba). Inténtalo en un rato.",
      "021": "La Sede no puede asignar un número de justificante ahora mismo (error 021, no es Aproba). Inténtalo en un rato.",
    };
    const error = MENSAJES[cod] ?? (aviso ? `La Sede ha rechazado el impreso: ${aviso}` : MENSAJES["001"]);
    return NextResponse.json({ error, captcha: true, codigo: cod || undefined }, { status: 422 });
  }

  // Archiva la tasa para el expediente (portal del cliente + ZIP): RLS verifica la
  // propiedad y un fallo de guardado nunca rompe la descarga.
  if (expedienteId) {
    try {
      const { data: own } = await supabase.from("Expediente").select("id, familiaId").eq("id", expedienteId).maybeSingle();
      if (own) {
        const admin = createSupabaseAdmin();
        const famId = (own as { familiaId?: string | null }).familiaId;
        if (clienteId && famId) {
          const { data: m } = await supabase.from("Cliente").select("id").eq("id", clienteId).eq("familiaId", famId).maybeSingle();
          if (m) await admin.storage.from("documentos").upload(`${expedienteId}/tasa-790-052-${clienteId}.pdf`, buf, { contentType: "application/pdf", upsert: true });
        } else {
          await admin.storage.from("documentos").upload(`${expedienteId}/tasa-790-052.pdf`, buf, { contentType: "application/pdf", upsert: true });
        }
      }
    } catch (err) { console.warn("[tasa790052] no se pudo guardar la tasa:", err instanceof Error ? err.message : err); }
  }

  return new Response(buf, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="tasa-790-052.pdf"', "Cache-Control": "no-store" },
  });
}
