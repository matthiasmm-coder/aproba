import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { fetchExpedienteDetalle } from "@/lib/data/expedientes";
import { datosNormalizados } from "@/lib/formularios";

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

  let body: { expedienteId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const exp = body.expedienteId ? await fetchExpedienteDetalle(body.expedienteId) : null; // RLS
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });
  const d = datosNormalizados(exp);

  // 1) Ouvre le formulaire officiel → cookies de session + HTML.
  let res: Response;
  try {
    res = await fetch(`${BASE}/ImpresoRellenar`, { headers: { "User-Agent": UA }, redirect: "follow" });
  } catch {
    return NextResponse.json({ error: "No se pudo contactar con la Sede de la Policía Nacional.", fallback: `${BASE}/` }, { status: 502 });
  }
  if (!res.ok) return NextResponse.json({ error: "La Sede de la Policía Nacional no responde ahora mismo.", fallback: `${BASE}/` }, { status: 502 });

  const setCookies = res.headers.getSetCookie?.() ?? [];
  const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
  if (!/JSESSIONID/.test(cookie)) return NextResponse.json({ error: "Sesión no disponible (la web oficial ha cambiado).", fallback: `${BASE}/` }, { status: 502 });
  const html = await res.text();
  const tramites = parseTramites(html);

  // 2) Récupère l'image du captcha (liée à la session).
  let captcha = "";
  try {
    const cap = await fetch(`${BASE}/jcaptcha.jpg`, { headers: { "User-Agent": UA, Cookie: cookie } });
    if (cap.ok) captcha = `data:image/jpeg;base64,${Buffer.from(await cap.arrayBuffer()).toString("base64")}`;
  } catch { /* sin captcha → fallback abajo */ }
  if (!captcha) return NextResponse.json({ error: "No se pudo cargar el código de seguridad.", fallback: `${BASE}/` }, { status: 502 });

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
