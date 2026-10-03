import "server-only";
import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emailLayout, emailsAdministradores, fotoDeUsuario } from "@/lib/notificaciones";
import { normalizarEstado } from "@/lib/progreso";
import { avisosCanjeEnviados, claveAvisoCanje, datosCanjeValidos, fraseAvisoCanje, hitoCanje, plazosCanje, situacionCanje, type PlazoCanje } from "@/lib/canje";

// AVISO DE LOS PLAZOS DEL CANJE AL DESPACHO (03/10/2026, Matthias: «Aproba vigila los plazos»).
//
// Corre en el MISMO tick diario que Vigía y los requerimientos (cron reconciliar-pagos):
// Vercel Hobby limita el número de crons. Avisa por HITOS (lib/canje.ts: 30, 7 y 0 días
// antes del fin de los 6 meses; 15 y 0 del informe médico; 30 y 0 de la caducidad del
// permiso), cada uno una sola vez: lo enviado se apunta en canje.avisos del expediente.
// Va a TODOS los administradores del despacho, NUNCA al cliente: el despacho decide.

const esFaltaMigracion = (msg: string) => /canje|column|schema cache/i.test(msg);
const uuid = () => crypto.randomUUID();

type Fila = {
  id: string; workspaceId: string; referencia: string | null; estado: string; fechaPresentacion: string | null; canje: unknown;
  cliente: { nombre: string | null; apellidos: string | null } | { nombre: string | null; apellidos: string | null }[] | null;
};

export async function escanearCanjes(admin: SupabaseClient, hoy: Date = new Date()): Promise<{ avisados: number; workspaces: number }> {
  const resumen = { avisados: 0, workspaces: 0 };
  let filas: Fila[] = [];
  try {
    const { data, error } = await admin.from("Expediente")
      .select("id, workspaceId, referencia, estado, fechaPresentacion, canje, cliente:Cliente(nombre, apellidos)")
      .not("canje", "is", null).is("archivadoAt", null).limit(2000);
    if (error) throw new Error(error.message);
    filas = (data ?? []) as unknown as Fila[];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!esFaltaMigracion(msg)) console.error("[canje escanear]", msg);
    return resumen; // columna sin migrar → nada que hacer
  }

  // Lo que hoy toca: por expediente, los plazos que entran en un hito aún no avisado.
  type Toca = { f: Fila; plazo: PlazoCanje; clave: string };
  const porWs = new Map<string, Toca[]>();
  for (const f of filas) {
    const sit = situacionCanje(normalizarEstado(f.estado), f.fechaPresentacion);
    if (sit.terminado) continue;
    const enviados = new Set(avisosCanjeEnviados(f.canje));
    for (const plazo of plazosCanje(datosCanjeValidos(f.canje), { presentado: sit.presentado, hoy })) {
      const hito = hitoCanje(plazo);
      if (hito === null) continue;
      const clave = claveAvisoCanje(plazo, hito);
      if (enviados.has(clave)) continue;
      porWs.set(f.workspaceId, [...(porWs.get(f.workspaceId) ?? []), { f, plazo, clave }]);
    }
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://aproba-software.com").replace(/\/$/, "");
  for (const [workspaceId, lista] of porWs) {
    resumen.workspaces += 1;
    const nombreDe = (f: Fila) => { const c = Array.isArray(f.cliente) ? f.cliente[0] : f.cliente; return `${c?.nombre ?? ""} ${c?.apellidos ?? ""}`.trim() || "Cliente"; };
    const lineas = lista.map(({ f, plazo }) => `• ${nombreDe(f)}${f.referencia ? ` (${f.referencia})` : ""} — ${fraseAvisoCanje(plazo)}`);
    const vencidos = lista.filter(({ plazo }) => plazo.dias < 0).length;
    const expedientes = [...new Set(lista.map(({ f }) => f.id))];

    // Si el ENVÍO falla no se apunta nada: mañana se reintenta entero, sin duplicar.
    let envioFallido = false;
    try {
      const destinatarios = await emailsAdministradores(admin, workspaceId);
      if (!destinatarios.length || !process.env.RESEND_API_KEY) continue;
      const { data: owner } = await admin.from("Membership").select("userId").eq("workspaceId", workspaceId).eq("role", "OWNER").limit(1).maybeSingle();
      const { data: wsRow } = await admin.from("Workspace").select("nombre").eq("id", workspaceId).maybeSingle();
      const gestoria = (wsRow as { nombre?: string } | null)?.nombre ?? "Tu gestoría";
      const uno = expedientes.length === 1;
      const url = uno ? `${appUrl}/app/expedientes/${expedientes[0]}#canje` : `${appUrl}/app/expedientes`;
      const n = lista.length;
      const titulo = vencidos
        ? `Canje: ${vencidos === 1 ? "un plazo vencido" : `${vencidos} plazos vencidos`}`
        : `Canje: ${n === 1 ? "un plazo cerca" : `${n} plazos cerca`}`;
      const html = emailLayout({
        avatarUrl: await fotoDeUsuario(admin, owner?.userId as string | undefined),
        gestoria,
        titulo,
        cuerpoHtml: `<p style="margin:0 0 10px;text-align:left">${lineas.map((l) => l.replace(/&/g, "&amp;").replace(/</g, "&lt;")).join("<br>")}</p>`,
        cta: { url, label: uno ? "Ver el canje" : "Ver los expedientes" },
        footerNota: `Aviso de Aproba para ${gestoria}. Los plazos salen de los datos del permiso que guardáis en cada expediente de canje.`,
        preheader: titulo,
      });
      const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
        from: `Aproba <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`,
        to: destinatarios,
        subject: `${vencidos ? "🔴" : "🚗"} ${titulo}`,
        text: `${lineas.join("\n")}\n\n${uno ? "Ver el canje" : "Ver los expedientes"}:\n${url}`,
        html,
      });
      if (error) { console.error("[canje aviso]", error.message ?? error); envioFallido = true; }
    } catch (e) {
      console.error("[canje aviso]", e instanceof Error ? e.message : e);
      envioFallido = true;
    }
    if (envioFallido) continue;

    // Enviado: al historial de cada expediente, y apuntado para no repetirlo.
    for (const { f, plazo } of lista) {
      const { error } = await admin.from("ExpedienteEvento").insert({ id: uuid(), expedienteId: f.id, tipo: "COMENTARIO", descripcion: `⏰ Canje: ${fraseAvisoCanje(plazo)}.` });
      if (error) console.error("[canje evento]", error.message);
    }
    for (const id of expedientes) {
      const f = lista.find((x) => x.f.id === id)!.f;
      const nuevas = lista.filter((x) => x.f.id === id).map((x) => x.clave);
      const avisos = [...avisosCanjeEnviados(f.canje), ...nuevas].slice(-30);
      const base = f.canje && typeof f.canje === "object" && !Array.isArray(f.canje) ? f.canje as Record<string, unknown> : {};
      const { error } = await admin.from("Expediente").update({ canje: { ...base, avisos } }).eq("id", id);
      if (error) console.error("[canje marcar]", error.message);
      else resumen.avisados += nuevas.length;
    }
  }
  return resumen;
}
