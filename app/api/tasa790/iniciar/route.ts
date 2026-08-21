import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { fetchExpedienteDetalle } from "@/lib/data/expedientes";
import { datosNormalizados, datosDeCliente } from "@/lib/formularios";
import { FICHA_KEYS, type ClienteFicha } from "@/lib/ficha";

// Proxy de génération de la tasa 790-012 (Sede de la Policía Nacional).
// 1) iniciar : on ouvre le formulaire officiel (session + captcha), on renvoie au
//    gestor l'image du captcha + les données pré-remplies + la liste des trámites.
// Le code-barres/número ne peuvent venir QUE du générateur officiel → on le pilote.

const BASE = "https://sede.policia.gob.es/Tasa790_012";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Parse les options de trámite du formulaire officiel. Structure :
// <tr id="tasaN"><td>LIBELLÉ</td>…<td><input ... title="38.28 €" value="N"></td></tr>
function parseTramites(html: string): { value: string; importe: string; label: string }[] {
  const out: { value: string; importe: string; label: string }[] = [];
  const re = /<tr id="tasa\d+">([\s\S]*?)<input[^>]*name="tramiteSeleccionado"[^>]*?title="([\d.,]+)[^>]*?value="(\d+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const label = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(/^[.\s·]+/, "").trim();
    if (label) out.push({ value: m[3], importe: m[2], label: label.slice(0, 95) });
  }
  return out;
}

// Découpe « C/ Mallorca 245, 3º 2ª » → via / número / piso (best-effort, éditable).
function partirDomicilio(d: string) {
  const num = (d.match(/\b(\d{1,4})\b/) || [])[1] ?? "";
  const piso = (d.match(/(\d+\s*[ºo]\s*\d*\s*[ªa]?)/i) || [])[1]?.replace(/\s+/g, "") ?? "";
  const via = d.replace(/,?\s*\d+\s*[ºo].*$/i, "").replace(/\b\d{1,4}\b\s*$/, "").replace(/^(c\/|calle|avda?\.?|av\.|plaza|pza\.?|paseo|po\.)\s*/i, "").replace(/[,.]$/, "").trim();
  const tipo = (d.match(/^(c\/|calle|avda?\.?|av\.|plaza|pza\.?|paseo)/i) || [])[1] ?? "CALLE";
  return { tipoVia: tipo.toUpperCase().replace("C/", "CALLE"), via, numero: num, piso };
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  let body: { expedienteId?: string; clienteId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const exp = body.expedienteId ? await fetchExpedienteDetalle(body.expedienteId) : null; // RLS
  const clienteId = body.clienteId?.trim() || "";
  // SIN expediente: la tasa se genera desde la ficha del cliente (pedido por Gesadmbcn,
  // 20/08/2026 — «puedo generarle el EX-17 pero las tasas no»). Es la 790-012 de esa
  // persona: no necesita un expediente para existir. Sin expediente no se archiva en
  // ninguna parte (descargar/route.ts ya lo contempla: guarda solo si hay expedienteId).
  if (!exp && !clienteId) return NextResponse.json({ error: "Indica un expediente o un cliente." }, { status: 400 });
  if (body.expedienteId && !exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  // Prefill desde el cliente: es lo que hace falta cuando no hay expediente, y también
  // en un expediente FAMILIAR, donde la tasa es NOMINATIVA (una por solicitante).
  const cargarFicha = async (id: string, filtroFamilia?: string) => {
    let q = supabase.from("Cliente").select(FICHA_KEYS.join(", ")).eq("id", id);
    if (filtroFamilia) q = q.eq("familiaId", filtroFamilia);
    const { data: m } = await q.maybeSingle();   // RLS: si no es de su despacho, no existe
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

  // Los datos ya están calculados: si la Sede no responde, se devuelven igualmente
  // para que el gestor los copie en el generador oficial sin volver a teclearlos.
  // 20/08/2026: la Sede filtra desde esta semana los clientes que no son un navegador
  // (funcionó hasta el 16/08, 39 tasas generadas) — el navegador del gestor SÍ entra.
  const dom0 = partirDomicilio(d.domicilio);
  const prefillManual = {
    nif: d.nie1 ? `${d.nie1}${d.nie2}${d.nie3}` : d.pasaporte,
    nombre: `${d.apellido1} ${d.apellido2} ${d.nombre}`.replace(/\s+/g, " ").trim(),
    calle: dom0.tipoVia, via: dom0.via,
    numero: d.numero || dom0.numero, piso: d.piso || dom0.piso,
    municipio: d.localidad, provincia: d.provincia, codigoPostal: d.cp, telefono: d.telefono,
  };
  const noDisponible = (motivo: string) => NextResponse.json(
    { error: motivo, fallback: `${BASE}/`, prefill: prefillManual }, { status: 502 });

  // 1) Ouvre le formulaire officiel → cookies de session + HTML.
  let res: Response;
  try {
    res = await fetch(`${BASE}/ImpresoRellenar`, { headers: { "User-Agent": UA }, redirect: "follow" });
  } catch {
    return noDisponible("La Sede no acepta ahora mismo la generación automática. Abajo tienes los datos del cliente listos para copiar en el generador oficial.");
  }
  if (!res.ok) return noDisponible("La Sede de la Policía Nacional no responde ahora mismo. Abajo tienes los datos del cliente listos para copiar en el generador oficial.");

  const setCookies = res.headers.getSetCookie?.() ?? [];
  const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
  if (!/JSESSIONID/.test(cookie)) return noDisponible("La web oficial ha cambiado y no admite el rellenado automático. Abajo tienes los datos del cliente para copiarlos a mano.");
  const html = await res.text();
  const tramites = parseTramites(html);

  // 2) Récupère l'image du captcha (liée à la session).
  let captcha = "";
  try {
    const cap = await fetch(`${BASE}/jcaptcha.jpg`, { headers: { "User-Agent": UA, Cookie: cookie } });
    if (cap.ok) captcha = `data:image/jpeg;base64,${Buffer.from(await cap.arrayBuffer()).toString("base64")}`;
  } catch { /* sin captcha → fallback abajo */ }
  if (!captcha) return noDisponible("No se pudo cargar el código de seguridad de la Sede. Abajo tienes los datos del cliente para el generador oficial.");

  const dom = partirDomicilio(d.domicilio);
  return NextResponse.json({
    sid: cookie,
    captcha,
    tramites,
    prefill: {
      nif: d.nie1 ? `${d.nie1}${d.nie2}${d.nie3}` : d.pasaporte,
      nombre: `${d.apellido1} ${d.apellido2} ${d.nombre}`.replace(/\s+/g, " ").trim(),
      calle: dom.tipoVia, via: dom.via,
      // número/piso : champs dédiés de la ficha en priorité, sinon parse de l'adresse.
      numero: d.numero || dom.numero, piso: d.piso || dom.piso,
      municipio: d.localidad, provincia: d.provincia, codigoPostal: d.cp, telefono: d.telefono,
    },
  });
}
