import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { resumirOrigen, type Origen } from "@/lib/origen";

// SONDA DE PIPELINE — cron diario (vercel.json).
//
// Por qué existe (18/08/2026): el producto tiene tests, e2e, Sentry y una veille EX que
// avisa cuando un formulario rompe. El pipeline comercial no tenía NINGÚN sensor, y la
// prueba está en los datos: una gestoría de extranjería se dio de alta el 12/08 y seguía
// a cero clientes seis días después sin que nadie la llamara; y Gesadmbcn importó 187
// clientes pero solo abrió 7 expedientes — importar no es adoptar, y eso no se ve por
// email. Ambas cosas eran detectables con una consulta el mismo día.
//
// Cuatro señales, todas accionables por teléfono:
//   ALTA SIN ARRANQUE  se registró hace ≥2 días y sigue a 0 clientes → nunca empezó.
//   IMPORTÓ SIN TRABAJAR  ≥20 clientes pero <10 % con expediente → cartera aparcada.
//   SE ENFRIÓ  hubo trabajo real y lleva ≥7 días sin crear nada.
//   LA PRUEBA VENCE  quedan ≤7 días de prueba y no hay suscripción.
//   VENCIÓ SIN CONVERTIR  la prueba caducó hace 1-5 días tras un uso REAL → última bala.
//
// Lo que NO es: un CRM. No guarda estado, no puntúa, no decide. Lee la base cada mañana
// y dice a quién llamar hoy. Si una señal molesta, es que el prospecto está muerto o
// atendido — en ambos casos se apaga sola en cuanto la realidad cambia.
//
// ⚠️ CADENCIA (24/08/2026). El supuesto de arriba era falso: un prospecto puede quedarse
// en el MISMO estado indefinidamente. Gretell llevaba 11 días «alta sin arranque» y el
// mismo correo salía cada mañana — que es justo lo que este cron intenta evitar cuando
// excluye los workspaces internos: enseñar a no abrirlo. Una señal VERDADERA hoy no es
// una señal NUEVA. Ahora cada señal habla el día en que APARECE y luego los lunes; solo
// la ventana de dinero (prueba a ≤2 días de vencer, o recién vencida) habla a diario.
// Sin estado que guardar: todo se deriva de los contadores que ya se calculan.
//
// ⚠️ El cron corre de lunes a viernes (vercel.json «0 7 * * 1-5»), así que una cadencia
// «cada 7 días» sería una TRAMPA: el día 0 y el día 7 caen siempre en el MISMO día de la
// semana — si ese día es sábado, la señal no sonaría JAMÁS. De ahí el ancla en lunes.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEST = process.env.VEILLE_ALERT_EMAIL || "matthias.merlemounier@gmail.com";

// Workspaces internos (demos, pruebas propias, familia). Se excluyen SIEMPRE: alertar
// sobre ellos entrenaría a ignorar el email. Por nombre para no meter correos de
// terceros en el repo; ampliable sin desplegar con PIPELINE_IGNORAR (nombres, comas).
const INTERNOS = [/vall[eè]s/i, /carmen/i, /ckna/i, /^gestoria m{1,2}$/i];
const esInterno = (nombre: string) => {
  const extra = (process.env.PIPELINE_IGNORAR ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return INTERNOS.some((r) => r.test(nombre)) || extra.some((e) => nombre.toLowerCase().includes(e.toLowerCase()));
};

const DIAS_SIN_ARRANQUE = 2;   // margen para que se registre y vuelva al día siguiente
const DIAS_ENFRIADO = 7;
const MIN_CARTERA = 20;        // por debajo, un ratio bajo no significa nada
const RATIO_TRABAJO = 0.1;     // expedientes/clientes: <10 % = cartera importada y aparcada
const VENCE_EN = 7;
const VENCIDA_HASTA = 5;   // días tras caducar en los que aún merece una llamada
const URGENTE = 2;         // días de margen en los que la señal sí habla a diario

// El día que aparece la señal, y después los lunes. Si aparece en fin de semana (el cron
// no corre), el lunes la recoge con 1-2 días de retraso en vez de perderla.
function vigente(dias: number | null, desde: number, esLunes: boolean): boolean {
  if (dias === null) return false;
  return dias >= desde && (dias === desde || esLunes);
}

function autorizado(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // solo lee y avisa (mismo criterio que veille-ex/uso-ia)
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

type Señal = { orden: number; etiqueta: string; detalle: string };
type Ficha = {
  nombre: string; correos: string[]; origen: string; plan: string; estado: string;
  clientes: number; expedientes: number; altaDias: number;
  quedan: number | null; inactivoDias: number | null; señales: Señal[];
};

const dias = (desde: string | Date, hasta = new Date()) =>
  Math.floor((hasta.getTime() - new Date(desde).getTime()) / 86400000);

export async function GET(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const admin = createSupabaseAdmin();

  const { data: wss } = await admin.from("Workspace").select("id, nombre, createdAt");
  const { data: subs } = await admin.from("Subscription")
    .select("workspaceId, plan, estado, trialEndsAt, stripeSubscriptionId");
  const porWs = new Map((subs ?? []).map((s) => [s.workspaceId as string, s]));

  // Correos de contacto: se resuelven de una vez, no por workspace.
  const { data: authList } = await admin.auth.admin.listUsers();
  const correoDe = new Map((authList?.users ?? []).map((u) => [u.id, u.email ?? ""]));
  // De dónde vino cada persona (se anota al registrarse desde el 19/08). Sirve para
  // saber qué canal trae a los que llegan solos — el más productivo de agosto.
  const origenDe = new Map((authList?.users ?? []).map((u) => [u.id, resumirOrigen((u.user_metadata as { origen?: Origen } | undefined)?.origen)]));
  const { data: mems } = await admin.from("Membership").select("workspaceId, userId, role");
  const miembros = new Map<string, string[]>();
  const origenWs = new Map<string, string>();
  for (const m of (mems ?? []) as { workspaceId: string; userId: string; role: string }[]) {
    const c = correoDe.get(m.userId);
    if (!c) continue;
    const l = miembros.get(m.workspaceId) ?? [];
    // El administrador primero: es a quien hay que llamar.
    m.role === "ADMIN" ? l.unshift(c) : l.push(c);
    miembros.set(m.workspaceId, l);
    if (m.role === "ADMIN" || !origenWs.has(m.workspaceId)) {
      const o = origenDe.get(m.userId);
      if (o && o !== "origen desconocido") origenWs.set(m.workspaceId, o);
    }
  }

  // Ancla de la cadencia semanal. UTC: el cron dispara a las 07:00 UTC, así que el día
  // de la semana en UTC es el mismo que ve el destinatario en España.
  const esLunes = new Date().getUTCDay() === 1;

  const fichas: Ficha[] = [];
  for (const w of (wss ?? []) as { id: string; nombre: string; createdAt: string }[]) {
    const nombre = w.nombre ?? "(sin nombre)";
    if (esInterno(nombre)) continue;
    const sub = porWs.get(w.id) as { plan?: string; estado?: string; trialEndsAt?: string; stripeSubscriptionId?: string } | undefined;
    // Un cliente que paga no es pipeline: sale del radar (su salud es otro asunto).
    if (sub?.estado === "ACTIVA" && sub?.stripeSubscriptionId) continue;
    if (sub?.estado === "CANCELADA") continue;

    const { count: clientes } = await admin.from("Cliente").select("id", { count: "exact", head: true }).eq("workspaceId", w.id);
    const { count: expedientes } = await admin.from("Expediente").select("id", { count: "exact", head: true }).eq("workspaceId", w.id);
    const { data: ult } = await admin.from("Expediente").select("createdAt")
      .eq("workspaceId", w.id).order("createdAt", { ascending: false }).limit(1).maybeSingle();

    const cli = clientes ?? 0, exp = expedientes ?? 0;
    const altaDias = dias(w.createdAt);
    const quedan = sub?.trialEndsAt ? -dias(sub.trialEndsAt) : null;
    const inactivoDias = ult?.createdAt ? dias(ult.createdAt as string) : null;
    const enPrueba = sub?.estado === "TRIAL" && quedan !== null && quedan >= 0;

    const señales: Señal[] = [];
    if (cli === 0 && altaDias <= 45 && vigente(altaDias, DIAS_SIN_ARRANQUE, esLunes)) {
      señales.push({ orden: 1, etiqueta: "ALTA SIN ARRANQUE",
        detalle: `se registró hace ${altaDias} días y sigue sin dar de alta ningún cliente` });
    }
    if (cli >= MIN_CARTERA && exp / cli < RATIO_TRABAJO && enPrueba && vigente(altaDias, DIAS_SIN_ARRANQUE, esLunes)) {
      señales.push({ orden: 2, etiqueta: "IMPORTÓ SIN TRABAJAR",
        detalle: `${cli} clientes cargados pero solo ${exp} expedientes (${Math.round((exp / cli) * 100)} %): la cartera está aparcada` });
    }
    if (exp >= 3 && enPrueba && vigente(inactivoDias, DIAS_ENFRIADO, esLunes)) {
      señales.push({ orden: 3, etiqueta: "SE ENFRIÓ",
        detalle: `trabajó de verdad (${exp} expedientes) y lleva ${inactivoDias} días sin crear nada` });
    }
    // La prueba es el momento del dinero: a ≤2 días habla todos los días, antes solo los lunes.
    if (enPrueba && quedan! <= VENCE_EN && (quedan! <= URGENTE || esLunes)) {
      señales.push({ orden: quedan! <= 2 ? 0 : 4, etiqueta: "LA PRUEBA VENCE",
        detalle: `quedan ${quedan} días de prueba y no hay suscripción` });
    }
    // Ventana corta y con uso real: se avisa del que MERECÍA convertir y no lo hizo,
    // no de todos los abandonos acumulados desde junio.
    if (sub?.estado === "TRIAL" && quedan !== null && quedan < 0 && quedan >= -VENCIDA_HASTA && exp >= 3
        && (-quedan <= URGENTE || esLunes)) {
      señales.push({ orden: 0, etiqueta: "VENCIÓ SIN CONVERTIR",
        detalle: `la prueba caducó hace ${-quedan} días tras abrir ${exp} expedientes: es ahora o nunca` });
    }
    if (!señales.length) continue;

    fichas.push({
      nombre, correos: miembros.get(w.id) ?? [], origen: origenWs.get(w.id) ?? "origen desconocido",
      plan: sub?.plan ?? "—", estado: sub?.estado ?? "—",
      clientes: cli, expedientes: exp, altaDias, quedan, inactivoDias,
      señales: señales.sort((a, b) => a.orden - b.orden),
    });
  }

  fichas.sort((a, b) => a.señales[0].orden - b.señales[0].orden);

  let avisado = false;
  if (fichas.length && process.env.RESEND_API_KEY) {
    const bloques = fichas.map((f) => {
      const cab = f.señales.map((s) => s.etiqueta).join(" · ");
      const cifras = `${f.clientes} clientes · ${f.expedientes} expedientes` +
        (f.quedan !== null ? ` · prueba ${f.plan} ${f.quedan >= 0 ? `${f.quedan} días` : "vencida"}` : "");
      return `▸ ${f.nombre} — ${cab}\n  ${f.señales.map((s) => s.detalle).join("\n  ")}\n  ${cifras}\n  ${f.correos.join(", ") || "(sin correo)"}\n  vino de: ${f.origen}`;
    }).join("\n\n");
    const primera = fichas[0];
    const cuerpo =
      `A quién llamar hoy (${fichas.length} ${fichas.length === 1 ? "despacho" : "despachos"}):\n\n${bloques}\n\n` +
      `— Cada señal habla el día que aparece y luego los lunes; una prueba a punto de vencer habla a diario.\n` +
      `Si hoy no hay correo, es que no hay nada nuevo — no que no pase nada.\n` +
      `Las señales se apagan solas en cuanto el prospecto arranca, trabaja o se suscribe.\n` +
      `Se excluyen los workspaces internos y los clientes de pago.`;
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: `Aproba <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`,
      to: DEST,
      subject: `📞 Pipeline: ${primera.nombre} — ${primera.señales[0].etiqueta.toLowerCase()}${fichas.length > 1 ? ` (+${fichas.length - 1})` : ""}`,
      text: cuerpo,
    });
    avisado = !error;
  }

  return NextResponse.json({
    ok: true, avisado, despachos: fichas.length,
    pipeline: fichas.map((f) => ({
      nombre: f.nombre, señales: f.señales.map((s) => s.etiqueta), origen: f.origen,
      clientes: f.clientes, expedientes: f.expedientes, quedanDias: f.quedan, correos: f.correos,
    })),
  });
}
