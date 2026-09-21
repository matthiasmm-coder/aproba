import { NextResponse } from "next/server";
import { esLangSoportada } from "@/lib/portal-i18n";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { FICHA_KEYS, type ClienteFicha } from "@/lib/ficha";
import { cobrarOverageSiProcede } from "@/lib/overage";

export const runtime = "nodejs";
const uuid = () => crypto.randomUUID();
const MAX_TRABAJADORES = 30;

// Portal de un expediente DE EMPRESA (/j/[token] con empresaId y sin titular persona): la
// empresa añade a sus trabajadores con la ficha completa de cada uno, la corrige y quita
// al que sobra. El token del expediente es la credencial; cada trabajador se verifica
// contra ExpedienteTrabajador de ESE expediente (anti-IDOR). No hay sesión.
async function resolverExpediente(token: string) {
  const admin = createSupabaseAdmin();
  const { data } = await admin.from("Expediente").select("id, workspaceId, clienteId, empresaId, oficinaId, referencia").eq("portalToken", token).maybeSingle();
  const exp = data as { id: string; workspaceId: string; clienteId: string | null; empresaId: string | null; oficinaId: string | null; referencia: string } | null;
  // Solo el modelo nuevo (la empresa es el cliente). Un expediente de trabajador con
  // empresa pagadora sigue con el portal de la persona.
  const deEmpresa = Boolean(exp?.empresaId) && !exp?.clienteId;
  return { admin, exp: deEmpresa ? exp : null };
}

function fichaAPatch(ficha: ClienteFicha | undefined): Record<string, string> {
  const patch: Record<string, string> = {};
  for (const k of FICHA_KEYS) { const v = (ficha as Record<string, unknown> | undefined)?.[k]; if (typeof v === "string") patch[k] = v.trim().slice(0, 200); }
  return patch;
}

// POST → añade un trabajador (Cliente con su ficha) al lote. Una unidad de cuota, como
// cualquier alta de trabajador. Devuelve su id (nunca su token de enlace individual).
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { token?: string; ficha?: ClienteFicha; idioma?: string };
  const token = (body.token ?? "").trim();
  if (!token) return NextResponse.json({ error: "Falta el enlace." }, { status: 400 });
  const { admin, exp } = await resolverExpediente(token);
  if (!exp) return NextResponse.json({ error: "Enlace no válido." }, { status: 404 });

  const patch = fichaAPatch(body.ficha);
  if (!patch.nombre) return NextResponse.json({ error: "Falta el nombre del trabajador." }, { status: 400 });

  const { count } = await admin.from("ExpedienteTrabajador").select("id", { count: "exact", head: true }).eq("expedienteId", exp.id);
  if ((count ?? 0) >= MAX_TRABAJADORES) return NextResponse.json({ error: "Demasiados trabajadores en este expediente." }, { status: 400 });

  const clienteId = uuid();
  const { error } = await admin.from("Cliente").insert({
    id: clienteId, workspaceId: exp.workspaceId, empresaId: exp.empresaId, ...patch,
    idioma: esLangSoportada(body.idioma) ? body.idioma : "es",
    updatedAt: new Date().toISOString(),
    ...(exp.oficinaId ? { oficinaId: exp.oficinaId } : {}),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { error: eT } = await admin.from("ExpedienteTrabajador").insert({ id: uuid(), workspaceId: exp.workspaceId, expedienteId: exp.id, clienteId, token: uuid().replace(/-/g, "") });
  if (eT) {
    await admin.from("Cliente").delete().eq("id", clienteId); // sin fila de lote no queda un cliente suelto
    return NextResponse.json({ error: eT.message }, { status: 500 });
  }
  await admin.from("ExpedienteEvento").insert({ id: uuid(), expedienteId: exp.id, tipo: "COMENTARIO", descripcion: `Trabajador añadido desde el portal de la empresa: ${[patch.nombre, patch.apellidos].filter(Boolean).join(" ")}` });
  await cobrarOverageSiProcede(admin, { workspaceId: exp.workspaceId, expedienteId: exp.id, referencia: exp.referencia, unidad: clienteId });
  return NextResponse.json({ ok: true, id: clienteId });
}

// PUT → guarda la ficha de un trabajador del lote.
export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({})) as { token?: string; clienteId?: string; ficha?: ClienteFicha; idioma?: string };
  const token = (body.token ?? "").trim();
  const clienteId = (body.clienteId ?? "").trim();
  if (!token || !clienteId) return NextResponse.json({ error: "Datos incompletos." }, { status: 400 });
  const { admin, exp } = await resolverExpediente(token);
  if (!exp) return NextResponse.json({ error: "Enlace no válido." }, { status: 404 });

  const { data: fila } = await admin.from("ExpedienteTrabajador").select("id").eq("expedienteId", exp.id).eq("clienteId", clienteId).maybeSingle();
  if (!fila) return NextResponse.json({ error: "Trabajador no encontrado." }, { status: 404 });

  const patch: Record<string, string> = fichaAPatch(body.ficha);
  if ("nombre" in patch && !patch.nombre) delete patch.nombre; // el nombre nunca se vacía
  if (typeof body.idioma === "string" && esLangSoportada(body.idioma)) patch.idioma = body.idioma;
  patch.updatedAt = new Date().toISOString();
  const { error } = await admin.from("Cliente").update(patch).eq("id", clienteId).eq("workspaceId", exp.workspaceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE → quita un trabajador del lote. Con documentos a su nombre en este expediente se
// rechaza (nada queda huérfano). La persona solo se borra de Clientes si no deja rastro en
// ningún sitio (otros expedientes, documentos sueltos, vencimientos): si no, se conserva.
export async function DELETE(req: Request) {
  const body = await req.json().catch(() => ({})) as { token?: string; clienteId?: string };
  const token = (body.token ?? "").trim();
  const clienteId = (body.clienteId ?? "").trim();
  if (!token || !clienteId) return NextResponse.json({ error: "Datos incompletos." }, { status: 400 });
  const { admin, exp } = await resolverExpediente(token);
  if (!exp) return NextResponse.json({ error: "Enlace no válido." }, { status: 404 });

  const { data: fila } = await admin.from("ExpedienteTrabajador").select("id").eq("expedienteId", exp.id).eq("clienteId", clienteId).maybeSingle();
  if (!fila) return NextResponse.json({ error: "Trabajador no encontrado." }, { status: 404 });

  const { count: nDocs } = await admin.from("Documento").select("id", { count: "exact", head: true }).eq("expedienteId", exp.id).eq("clienteId", clienteId);
  if ((nDocs ?? 0) > 0) return NextResponse.json({ error: "Este trabajador ya tiene documentos en el expediente. Pide a la gestoría que lo quite." }, { status: 409 });

  const { error } = await admin.from("ExpedienteTrabajador").delete().eq("id", fila.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ¿Queda rastro de la persona? Si no, se borra (alta hecha desde este mismo portal, por error).
  let conservar = false;
  try {
    const { count: otros } = await admin.from("ExpedienteTrabajador").select("id", { count: "exact", head: true }).eq("clienteId", clienteId);
    const { data: titular } = await admin.from("Expediente").select("id").eq("clienteId", clienteId).limit(1).maybeSingle();
    const { count: sueltos } = await admin.from("DocumentoCliente").select("id", { count: "exact", head: true }).eq("clienteId", clienteId);
    const { data: venc } = await admin.from("Vencimiento").select("id").eq("clienteId", clienteId).in("estado", ["PENDIENTE", "AVISADO", "TRAMITANDO"]).limit(1).maybeSingle();
    conservar = (otros ?? 0) > 0 || Boolean(titular) || (sueltos ?? 0) > 0 || Boolean(venc);
  } catch { conservar = true; }
  if (!conservar) await admin.from("Cliente").delete().eq("id", clienteId).eq("workspaceId", exp.workspaceId);
  await admin.from("ExpedienteEvento").insert({ id: uuid(), expedienteId: exp.id, tipo: "COMENTARIO", descripcion: "Trabajador quitado desde el portal de la empresa" });
  return NextResponse.json({ ok: true, conservado: conservar });
}
