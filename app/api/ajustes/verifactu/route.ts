import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { puedeGestionarEquipo } from "@/lib/planes";
import { cifrarSecreto, SAL_VERIFACTI } from "@/lib/cifrado";
import { verifacti } from "@/lib/verifacti";
import { normalizarNif } from "@/lib/verifactu";
import { claveDeConfig, fetchConfigsVerifactu, resumenRegistros, type ConfigVerifactu } from "@/lib/verifactu-envio";

// Ajustes › Facturación › VERI*FACTU. Una clave de empresa Verifacti por NIF emisor
// (el del despacho y, si facturan con NIF propio, el de cada oficina). Solo administradores.
// La clave se comprueba contra /verifactu/health (debe pertenecer a ESE NIF), se cifra y se
// guarda con service_role; el navegador nunca la recibe de vuelta.
//   GET    → NIFs emisores, configuración por NIF (sin claves) y recuento de registros.
//   POST   → { nif, apiKey }  guarda y activa · { accion: "solicitar" } avisa a Aproba.
//   PATCH  → { nif, activo }  pausa / reanuda el envío.
//   DELETE → ?nif=            retira la clave (los registros ya hechos se conservan).
export const dynamic = "force-dynamic";

async function adminYWorkspace() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado.", status: 401 as const };
  const admin = createSupabaseAdmin();
  const { data: mem } = await admin.from("Membership").select("workspaceId, role").eq("userId", user.id).limit(1).maybeSingle();
  if (!mem) return { error: "No perteneces a ningún despacho.", status: 403 as const };
  if (!puedeGestionarEquipo(mem.role as string)) return { error: "Solo un administrador puede configurar VERI*FACTU.", status: 403 as const };
  return { admin, workspaceId: mem.workspaceId as string, email: user.email ?? "" };
}

// NIFs que emiten facturas en este despacho: el del despacho + oficinas con NIF propio.
async function nifsEmisores(admin: ReturnType<typeof createSupabaseAdmin>, workspaceId: string): Promise<{ nif: string; nombre: string; origen: "despacho" | "oficina" }[]> {
  const out: { nif: string; nombre: string; origen: "despacho" | "oficina" }[] = [];
  const { data: ws } = await admin.from("Workspace").select("nombre, nif").eq("id", workspaceId).maybeSingle();
  const w = ws as { nombre?: string; nif?: string | null } | null;
  const nifWs = normalizarNif(w?.nif);
  if (nifWs) out.push({ nif: nifWs, nombre: w?.nombre ?? "Despacho", origen: "despacho" });
  try {
    const { data: ofs } = await admin.from("Oficina").select("nombre, razonSocial, nif, orden").eq("workspaceId", workspaceId).order("orden");
    for (const o of (ofs ?? []) as { nombre: string; razonSocial?: string | null; nif?: string | null; orden: number }[]) {
      const n = normalizarNif(o.nif);
      if (n && o.orden !== -1 && !out.some((x) => x.nif === n)) out.push({ nif: n, nombre: o.razonSocial?.trim() || o.nombre, origen: "oficina" });
    }
  } catch { /* sin migrar */ }
  return out;
}

const publica = (c: ConfigVerifactu) => ({ nif: c.nif, entorno: c.entorno, activo: c.activo, configurado: Boolean(c.apiKeyEnc), ultimaComprobacion: c.ultimaComprobacion, ultimoError: c.ultimoError });

async function estado(admin: ReturnType<typeof createSupabaseAdmin>, workspaceId: string) {
  let configs: ConfigVerifactu[] = [];
  // ¿Existe la tabla? (fetchConfigsVerifactu devuelve [] sin ella, a propósito: el resto
  // de la app no debe romperse; aquí sí queremos decirlo para que se ejecute la migración).
  // (select real, no HEAD: PostgREST responde 204 sin error a un HEAD sobre una tabla inexistente.)
  const sonda = await admin.from("VerifactuConfig").select("id").eq("workspaceId", workspaceId).limit(1);
  const migracion = !(sonda.error && /relation|does not exist|schema cache|PGRST205/i.test(sonda.error.message));
  try { configs = await fetchConfigsVerifactu(admin, workspaceId); } catch { /* se informa vía migracion */ }
  const [nifs, resumen] = await Promise.all([nifsEmisores(admin, workspaceId), resumenRegistros(admin, workspaceId)]);
  // Declaración responsable del sistema (la publica Verifacti como SIF): primera clave válida.
  let declaracion: string | null = null;
  const conClave = configs.find((c) => c.apiKeyEnc);
  if (conClave) {
    const k = claveDeConfig(conClave);
    if (k) { const d = await verifacti.declaracion(k); if (d.ok && d.data?.url) declaracion = d.data.url; }
  }
  return { nifs, configs: configs.map(publica), resumen, declaracion, migracion };
}

export async function GET() {
  const r = await adminYWorkspace();
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(await estado(r.admin, r.workspaceId));
}

export async function POST(req: Request) {
  const r = await adminYWorkspace();
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  let body: { nif?: string; apiKey?: string; accion?: string; mensaje?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }

  if (body.accion === "solicitar") {
    // «Quiero activarlo»: Aproba da de alta el NIF en Verifacti, gestiona el modelo de
    // representación y configura la clave — el gestor no tiene que abrir ninguna cuenta.
    const nifs = await nifsEmisores(r.admin, r.workspaceId);
    const { data: ws } = await r.admin.from("Workspace").select("nombre").eq("id", r.workspaceId).maybeSingle();
    if (process.env.RESEND_API_KEY) {
      try {
        await new Resend(process.env.RESEND_API_KEY).emails.send({
          from: `Aproba <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`,
          to: process.env.VEILLE_ALERT_EMAIL || "matthias.merlemounier@gmail.com",
          subject: `🧾 VERI*FACTU: ${(ws as { nombre?: string } | null)?.nombre ?? r.workspaceId} pide la activación`,
          text: [
            `Despacho: ${(ws as { nombre?: string } | null)?.nombre ?? "—"} (${r.workspaceId})`,
            `Solicitante: ${r.email}`,
            `NIF emisores: ${nifs.map((n) => `${n.nif} (${n.nombre})`).join(", ") || "sin NIF en Ajustes"}`,
            body.mensaje?.trim() ? `Mensaje: ${body.mensaje.trim().slice(0, 1000)}` : "",
            "",
            "Pasos: alta del NIF en Verifacti → modelo de representación firmado → scripts/verifactu-config.mjs con la clave de empresa.",
          ].filter(Boolean).join("\n"),
        });
      } catch (e) { console.error("[verifactu solicitar]", e instanceof Error ? e.message : e); }
    }
    return NextResponse.json({ ok: true, solicitado: true });
  }

  const nif = normalizarNif(body.nif);
  const apiKey = String(body.apiKey ?? "").trim();
  if (!nif) return NextResponse.json({ error: "Indica el NIF emisor." }, { status: 400 });
  if (apiKey.length < 16 || /\s/.test(apiKey)) return NextResponse.json({ error: "La clave no parece válida." }, { status: 400 });
  if (!(await nifsEmisores(r.admin, r.workspaceId)).some((n) => n.nif === nif)) {
    return NextResponse.json({ error: "Ese NIF no es el de tu despacho ni el de una de tus oficinas (Ajustes → Facturación)." }, { status: 400 });
  }
  // Comprobación real: la clave debe responder y pertenecer a ESTE NIF.
  const salud = await verifacti.salud(apiKey);
  if (!salud.ok) return NextResponse.json({ error: `Verifacti no acepta esa clave: ${salud.error}` }, { status: 400 });
  const nifClave = normalizarNif(salud.data?.nif);
  if (nifClave && nifClave !== nif) return NextResponse.json({ error: `Esa clave pertenece al NIF ${nifClave}, no a ${nif}.` }, { status: 400 });
  const entorno: "test" | "prod" = /prod/i.test(String(salud.data?.entorno ?? "")) ? "prod" : "test";

  let apiKeyEnc: string;
  try { apiKeyEnc = cifrarSecreto(apiKey, SAL_VERIFACTI); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo cifrar la clave." }, { status: 500 }); }
  const ahora = new Date().toISOString();
  const patch = { entorno, apiKeyEnc, activo: true, ultimaComprobacion: ahora, ultimoError: null, updatedAt: ahora };
  const { data: existente, error: eSel } = await r.admin.from("VerifactuConfig").select("id").eq("workspaceId", r.workspaceId).eq("nif", nif).maybeSingle();
  if (eSel) return NextResponse.json({ error: /relation|does not exist|schema cache/i.test(eSel.message) ? "Falta la migración: ejecuta supabase/verifactu.sql." : eSel.message }, { status: 500 });
  const { error } = existente
    ? await r.admin.from("VerifactuConfig").update(patch).eq("id", (existente as { id: string }).id)
    : await r.admin.from("VerifactuConfig").insert({ id: crypto.randomUUID(), workspaceId: r.workspaceId, nif, ...patch });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, entorno, ...(await estado(r.admin, r.workspaceId)) });
}

export async function PATCH(req: Request) {
  const r = await adminYWorkspace();
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  let body: { nif?: string; activo?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const nif = normalizarNif(body.nif);
  const { error } = await r.admin.from("VerifactuConfig").update({ activo: Boolean(body.activo), updatedAt: new Date().toISOString() }).eq("workspaceId", r.workspaceId).eq("nif", nif);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ...(await estado(r.admin, r.workspaceId)) });
}

export async function DELETE(req: Request) {
  const r = await adminYWorkspace();
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  const nif = normalizarNif(new URL(req.url).searchParams.get("nif"));
  if (!nif) return NextResponse.json({ error: "Indica el NIF." }, { status: 400 });
  const { error } = await r.admin.from("VerifactuConfig").delete().eq("workspaceId", r.workspaceId).eq("nif", nif);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ...(await estado(r.admin, r.workspaceId)) });
}
