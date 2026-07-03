import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchServiciosDeWorkspace } from "@/lib/data/config";
import { cobrarOverageSiProcede } from "@/lib/overage";
import { enviarAvisoRenovacion } from "@/lib/notificaciones";
import { baseUrlFromRequest } from "@/lib/base-url";

export const runtime = "nodejs";
const uuid = () => crypto.randomUUID();

// VIGÍA — «Iniciar renovación»: a partir de un vencimiento, crea el expediente de
// renovación pre-anclado al cliente + avisa al cliente EN SU IDIOMA (enlace /j) +
// marca el vencimiento TRAMITANDO. La factura de anticipo la pide la UI después vía
// POST /api/pagos (misma lógica financiera de siempre, sin duplicarla aquí).
//
// Autorización: el vencimiento se resuelve BAJO SESIÓN (RLS) — si el usuario no es
// miembro del workspace, no existe (anti-IDOR). Solo después se usa el admin.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: venc, error: eV } = await supa
    .from("Vencimiento")
    .select("id, workspaceId, clienteId, fecha, tipo, estado, expedienteRenovacionId")
    .eq("id", id)
    .maybeSingle();
  if (eV) return NextResponse.json({ error: eV.message }, { status: 500 });
  if (!venc) return NextResponse.json({ error: "Vencimiento no encontrado." }, { status: 404 });

  // Idempotencia: si ya hay una renovación en marcha, devolvemos esa (doble clic, recarga…).
  if (venc.expedienteRenovacionId) {
    return NextResponse.json({ ok: true, yaExistia: true, expedienteId: venc.expedienteRenovacionId });
  }
  if (venc.estado === "HECHO") {
    return NextResponse.json({ error: "Este vencimiento ya está renovado." }, { status: 409 });
  }

  const admin = createSupabaseAdmin();
  const workspaceId = String(venc.workspaceId);
  const clienteId = String(venc.clienteId);
  const expedienteId = uuid();

  // Servicio «Renovación de TIE» del workspace (si está activo) → tarifa/docs correctos
  // desde el primer momento. Repli: tipo RENOVACION sin clave (el cliente elige en /j).
  let servicioClave: string | null = null;
  try {
    const servicios = await fetchServiciosDeWorkspace(admin, workspaceId);
    if (servicios.some((s) => s.id === "renovacion_tie" && s.active)) servicioClave = "renovacion_tie";
  } catch { /* repli */ }

  // (1) Crear el expediente PRIMERO (la FK de Vencimiento.expedienteRenovacionId exige que
  // exista). Mismo patrón que POST /api/expedientes: referencia secuencial con reintento,
  // portalToken de 128 bits. Aún sin efectos visibles para el cliente (eventos/aviso después).
  const year = new Date().getFullYear();
  const portalToken = uuid().replace(/-/g, "");
  let referencia = "";
  for (let intento = 0; ; intento++) {
    const { data: last } = await admin
      .from("Expediente")
      .select("referencia")
      .eq("workspaceId", workspaceId)
      .like("referencia", `EXP-${year}-%`)
      .order("referencia", { ascending: false })
      .limit(1)
      .maybeSingle();
    const n = last ? Number(String(last.referencia).split("-")[2]) + 1 : 1;
    referencia = `EXP-${year}-${String(n).padStart(4, "0")}`;
    const fila: Record<string, unknown> = {
      id: expedienteId, workspaceId, clienteId, referencia, portalToken,
      tipo: "RENOVACION", estado: "BORRADOR", asignadoAId: user.id, updatedAt: new Date().toISOString(),
      ...(servicioClave ? { servicioClave } : {}),
    };
    const { error: eExp } = await admin.from("Expediente").insert(fila);
    if (!eExp) break;
    if (/duplicate|unique/i.test(eExp.message) && intento < 4) continue; // referencia en carrera → recalcula
    return NextResponse.json({ error: eExp.message }, { status: 500 }); // vencimiento intacto
  }

  // (2) CLAIM ATÓMICO anti-carrera: solo UNA petición concurrente consigue enlazar su
  // expediente (las demás ven expedienteRenovacionId ya puesto). Cubre el caso "TRAMITANDO
  // huérfano" (expediente borrado → SetNull): vuelve a ser reclamable.
  const { data: claim, error: eClaim } = await admin
    .from("Vencimiento")
    .update({ estado: "TRAMITANDO", expedienteRenovacionId: expedienteId, updatedAt: new Date().toISOString() })
    .eq("id", venc.id)
    .is("expedienteRenovacionId", null)
    .neq("estado", "HECHO")
    .select("id");
  if (eClaim || !claim?.length) {
    // Perdimos la carrera (u otro error): retiramos el expediente recién creado, aún sin
    // eventos ni cobros ni emails, y devolvemos la renovación del ganador.
    await admin.from("Expediente").delete().eq("id", expedienteId);
    if (eClaim) return NextResponse.json({ error: eClaim.message }, { status: 500 });
    const { data: otro } = await admin.from("Vencimiento").select("expedienteRenovacionId").eq("id", venc.id).maybeSingle();
    return NextResponse.json({ ok: true, yaExistia: true, expedienteId: otro?.expedienteRenovacionId ?? null });
  }

  const fechaTxt = new Date(venc.fecha as string).toLocaleDateString("es-ES");
  await admin.from("ExpedienteEvento").insert([
    { id: uuid(), expedienteId, tipo: "COMENTARIO", descripcion: `🔄 Renovación iniciada desde Vigía (${venc.tipo} caduca el ${fechaTxt})`, userId: user.id },
    { id: uuid(), expedienteId, tipo: "NOTIFICACION_ENVIADA", descripcion: "Enlace del portal generado para el cliente", userId: user.id },
  ]);

  // La renovación es un expediente normal: cuenta para la cuota mensual (overage compartido).
  const extra = await cobrarOverageSiProcede(admin, { workspaceId, expedienteId, referencia });

  // Aviso al cliente en su idioma (mejor esfuerzo — sin email no rompe).
  const aviso = await enviarAvisoRenovacion(admin, {
    expedienteId,
    tipoVencimiento: String(venc.tipo ?? "TIE"),
    fechaCaducidad: venc.fecha as string,
    baseUrl: baseUrlFromRequest(req),
  });

  return NextResponse.json({ ok: true, expedienteId, referencia, extra, avisoEnviado: aviso.enviado });
}
