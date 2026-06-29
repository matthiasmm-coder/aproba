import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// Proxy 790-012 — étape 2 : on renvoie au générateur officiel TOUS les champs +
// le captcha tapé par le gestor, avec la même session, et on récupère le PDF
// officiel barcodé. Si le captcha est faux, la Sede renvoie du HTML → on le signale.

const BASE = "https://sede.policia.gob.es/Tasa790_012";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

type Campos = Record<string, string>;

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  let body: { expedienteId?: string; sid?: string; campos?: Campos };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const sid = body.sid ?? "";
  const c = body.campos ?? {};
  const expedienteId = body.expedienteId ?? "";
  if (!/JSESSIONID/.test(sid) || !c.codSeguridadForm) {
    return NextResponse.json({ error: "Sesión o código de seguridad ausentes." }, { status: 400 });
  }

  // Tous les champs du formulaire officiel (valeurs gestor + valeurs par défaut).
  const form: Campos = {
    nif: c.nif ?? "", nombre: c.nombre ?? "",
    calle: c.calle ?? "", via: c.via ?? "", numero: c.numero ?? "", escalera: c.escalera ?? "", piso: c.piso ?? "", puerta: c.puerta ?? "",
    telefono: c.telefono ?? "", municipio: c.municipio ?? "", provincia: c.provincia ?? "", codigoPostal: c.codigoPostal ?? "",
    principalOComplementaria: "principal",
    numJustificante7: "", numJustificante6: "", numJustificante5: "", numJustificante4: "", numJustificante3: "", numJustificante2: "", numJustificante1: "",
    complementariaImporteEntero: "", complementariaImporteDecimal: "",
    numeroDiasProrrogaEstanciaSinVisado: "", numeroCertificadosInformes: "",
    tramiteSeleccionado: c.tramiteSeleccionado ?? "", // sin línea por defecto: la elige el gestor (no auto-marcar una casilla)
    localidad: c.localidad ?? "", fecha: c.fecha ?? "", total: c.total ?? "",
    efectivoOAdeudo: c.efectivoOAdeudo ?? "efectivo", iban: c.iban ?? "",
    tipoCaptcha: "", codSeguridadForm: c.codSeguridadForm,
  };

  let res: Response;
  try {
    res = await fetch(`${BASE}/ImpresoRellenarDescargar`, {
      method: "POST",
      headers: { "User-Agent": UA, Cookie: sid, "Content-Type": "application/x-www-form-urlencoded", Referer: `${BASE}/ImpresoRellenar` },
      body: new URLSearchParams(form).toString(),
      redirect: "follow",
    });
  } catch {
    return NextResponse.json({ error: "No se pudo contactar con la Sede de la Policía Nacional." }, { status: 502 });
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const esPdf = buf.subarray(0, 5).toString("latin1") === "%PDF-";
  const ctype = res.headers.get("content-type") ?? "";

  if (!esPdf && !/pdf/i.test(ctype)) {
    // La Sede a renvoyé le formulaire (pas un PDF). Avec des champs obligatoires
    // déjà validés côté client, la cause quasi systématique est le captcha (à usage
    // unique et sensible à la casse). On recharge un captcha et on invite à réécrire.
    return NextResponse.json(
      { error: "El código de seguridad no coincide (distingue mayúsculas/minúsculas y es de un solo uso). Escribe el nuevo código que aparece e inténtalo otra vez.", captcha: true },
      { status: 422 },
    );
  }

  // Guarda la tasa para que el cliente la descargue desde su seguimiento. Defensivo:
  // verifica que el gestor es dueño del expediente (RLS) y nunca rompe la descarga.
  if (expedienteId) {
    try {
      const { data: own } = await supabase.from("Expediente").select("id").eq("id", expedienteId).maybeSingle();
      if (own) {
        const admin = createSupabaseAdmin();
        const path = `${expedienteId}/tasa-790-012.pdf`;
        await admin.storage.from("documentos").upload(path, buf, { contentType: "application/pdf", upsert: true });
        const { error: errU } = await admin.from("Expediente").update({ tasaPath: path }).eq("id", expedienteId);
        if (errU) console.warn("[tasa790] no se pudo guardar tasaPath (¿migración pendiente?):", errU.message);
      }
    } catch (e) { console.warn("[tasa790] no se pudo guardar la tasa:", e instanceof Error ? e.message : e); }
  }

  return new Response(buf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="tasa-790-012.pdf"',
      "Cache-Control": "no-store",
    },
  });
}
