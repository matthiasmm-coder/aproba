import "server-only";
import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emailLayout, fotoDeUsuario } from "@/lib/notificaciones";
import { avisoPendiente, etiquetaPlazo, diasRestantes, type EstadoRequerimiento } from "@/lib/requerimientos";

// RECORDATORIO DE REQUERIMIENTOS AL DESPACHO (petición de Jennifer, 21/09/2026).
//
// Corre en el MISMO tick diario que Vigía (cron reconciliar-pagos): Vercel Hobby limita
// el número de crons, así que se engancha ahí en vez de pedir uno propio.
//
// Diferencia deliberada con Vigía: Vigía avisa UNA vez y marca AVISADO. Con diez días de
// plazo eso no sirve — un solo correo el primer día se pierde. Aquí se avisa por HITOS
// decrecientes (el umbral que eligió la gestoría, luego 3, 1, el día del plazo y uno al
// pasarse), cada uno una sola vez. Las reglas viven en lib/requerimientos.ts, puras.
//
// El correo va SIEMPRE al despacho (owner), NUNCA al cliente: un requerimiento es trabajo
// de la gestoría, y ella decide si pide algo al cliente y cuándo.

const esFaltaMigracion = (msg: string) => /relation .*Requerimiento.* does not exist|schema cache|PGRST205|column/i.test(msg);
const uuid = () => crypto.randomUUID();

type Fila = {
  id: string; workspaceId: string; expedienteId: string; asunto: string;
  fechaLimite: string; avisarDias: number; ultimoAviso: number | null; estado: EstadoRequerimiento;
  expediente: { referencia: string | null; cliente: { nombre: string | null; apellidos: string | null } | null; empresa: { razonSocial: string | null } | null } | null;
};

export async function escanearRequerimientos(admin: SupabaseClient): Promise<{ avisados: number; workspaces: number }> {
  const resumen = { avisados: 0, workspaces: 0 };
  let filas: Fila[] = [];
  try {
    const { data, error } = await admin
      .from("Requerimiento")
      .select("id, workspaceId, expedienteId, asunto, fechaLimite, avisarDias, ultimoAviso, estado, expediente:Expediente(referencia, cliente:Cliente(nombre, apellidos), empresa:Empresa(razonSocial))")
      .eq("estado", "PENDIENTE")
      .order("fechaLimite", { ascending: true })
      .limit(500);
    if (error) throw error;
    filas = (data ?? []) as unknown as Fila[];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!esFaltaMigracion(msg)) console.error("[requerimientos escanear]", msg);
    return resumen; // tabla sin migrar → nada que hacer
  }
  if (!filas.length) return resumen;

  const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
  const hoy = new Date();

  // Solo las que hoy tocan (las reglas deciden; aquí no se inventa nada).
  const tocan = filas
    .map((f) => ({ f, hito: avisoPendiente({ estado: f.estado, fechaLimite: f.fechaLimite, avisarDias: f.avisarDias, ultimoAviso: f.ultimoAviso }, hoy) }))
    .filter((x): x is { f: Fila; hito: number } => x.hito !== null);
  if (!tocan.length) return resumen;

  const porWs = new Map<string, typeof tocan>();
  for (const x of tocan) {
    const l = porWs.get(x.f.workspaceId) ?? [];
    l.push(x);
    porWs.set(x.f.workspaceId, l);
  }

  for (const [workspaceId, lista] of porWs) {
    resumen.workspaces += 1;
    const lineas: string[] = [];
    const eventos: { expedienteId: string; descripcion: string }[] = [];
    let vencidos = 0;

    for (const { f } of lista) {
      const exp = uno(f.expediente);
      const c = uno(exp?.cliente);
      const em = uno(exp?.empresa);
      const nombre = c ? `${c.nombre ?? ""} ${c.apellidos ?? ""}`.trim() : (em?.razonSocial ?? "").trim();
      const plazo = etiquetaPlazo({ estado: f.estado, fechaLimite: f.fechaLimite, avisarDias: f.avisarDias }, hoy);
      if (diasRestantes(f.fechaLimite, hoy) < 0) vencidos++;
      const fecha = new Date(f.fechaLimite).toLocaleDateString("es-ES");
      lineas.push(`• ${nombre || "Cliente"}${exp?.referencia ? ` (${exp.referencia})` : ""} — ${f.asunto} · ${plazo.toLowerCase()} (${fecha})`);
      eventos.push({ expedienteId: f.expedienteId, descripcion: `⏰ Requerimiento: ${f.asunto} · ${plazo.toLowerCase()} (${fecha}).` });
    }

    // Si el ENVÍO falla no se marca nada: mañana se reintenta entero, sin duplicar.
    let envioFallido = false;
    try {
      const { data: owner } = await admin.from("Membership").select("userId").eq("workspaceId", workspaceId).eq("role", "OWNER").limit(1).maybeSingle();
      const email = owner ? (await admin.auth.admin.getUserById(owner.userId as string)).data.user?.email ?? null : null;
      if (email && process.env.RESEND_API_KEY) {
        const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://aproba-software.com").replace(/\/$/, "");
        const url = `${appUrl}/app/expedientes?filtro=requerimientos`;
        const { data: wsRow } = await admin.from("Workspace").select("nombre").eq("id", workspaceId).maybeSingle();
        const gestoria = (wsRow as { nombre?: string } | null)?.nombre ?? "Tu gestoría";
        const n = lista.length;
        const titulo = vencidos
          ? `${vencidos} ${vencidos === 1 ? "requerimiento VENCIDO" : "requerimientos VENCIDOS"}`
          : `${n} ${n === 1 ? "requerimiento por aportar" : "requerimientos por aportar"}`;
        const html = emailLayout({
          avatarUrl: await fotoDeUsuario(admin, owner?.userId as string | undefined),
          gestoria,
          titulo,
          cuerpoHtml: `<p style="margin:0 0 10px">${lineas.map((l) => l.replace(/&/g, "&amp;").replace(/</g, "&lt;")).join("<br>")}</p>`,
          cta: { url, label: "Ver los requerimientos" },
          footerNota: `Aviso de Aproba para ${gestoria}. El plazo y el momento del aviso los fijas tú en cada requerimiento.`,
          preheader: titulo,
        });
        const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
          from: `Aproba <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`,
          to: email,
          subject: `${vencidos ? "🔴" : "⏰"} ${titulo}`,
          text: `${lineas.join("\n")}\n\nVer los requerimientos:\n${url}`,
          html,
        });
        if (error) { console.error("[requerimientos digest]", error.message ?? error); envioFallido = true; }
      }
    } catch (e) {
      console.error("[requerimientos digest]", e instanceof Error ? e.message : e);
      envioFallido = true;
    }
    if (envioFallido) continue; // reintento mañana, sin eventos ni marcas

    for (const ev of eventos) {
      const { error } = await admin.from("ExpedienteEvento").insert({ id: uuid(), expedienteId: ev.expedienteId, tipo: "COMENTARIO", descripcion: ev.descripcion });
      if (error) console.error("[requerimientos evento]", error.message);
    }
    // Cada fila guarda SU hito: así el siguiente (3 → 1 → 0 → vencido) sí podrá salir.
    for (const { f, hito } of lista) {
      const { error } = await admin.from("Requerimiento").update({ ultimoAviso: hito, updatedAt: new Date().toISOString() }).eq("id", f.id);
      if (!error) resumen.avisados += 1;
    }
  }

  return resumen;
}
