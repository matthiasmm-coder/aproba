import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { fetchExpedienteDetalle } from "@/lib/data/expedientes";
import { buildFormularios, datosNormalizados, datosDeCliente, formularioParaMiembro, type ExtraFormulario } from "@/lib/formularios";
import { FICHA_KEYS, type ClienteFicha } from "@/lib/ficha";
import { formularioToPdf } from "@/lib/formularios-pdf";
import { rellenarOficial, P2_OPCIONES, formulariosDisponibles } from "@/lib/ex-forms";
import { fetchP2Overrides } from "@/lib/p2-overrides";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { dispararAviso } from "@/lib/notificaciones";
import { baseUrlFromRequest } from "@/lib/base-url";

const nombreArchivo = (s: string) => s.replace(/[^a-zA-Z0-9_-]+/g, "_");

async function gestoriaDe(supabase: Awaited<ReturnType<typeof createSupabaseServer>>): Promise<string> {
  const { data } = await supabase.from("Membership").select("Workspace(nombre)").limit(1).maybeSingle();
  const ws = (data as { Workspace?: { nombre?: string } | { nombre?: string }[] } | null)?.Workspace;
  const w = Array.isArray(ws) ? ws[0] : ws;
  return w?.nombre ?? "Tu gestoría";
}

// GET ?tipo=EX-10  → télécharge le PDF du formulaire (RLS : membre du workspace seulement).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tipo = new URL(req.url).searchParams.get("tipo") ?? "";

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const exp = await fetchExpedienteDetalle(id); // RLS → null si pas membre
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  // Mode « oficial » : on remplit le vrai PDF officiel (AcroForm) au lieu du brouillon.
  if (new URL(req.url).searchParams.get("modo") === "oficial") {
    // Expediente familiar: ?clienteId=<miembro> → rellena el formulario con LOS DATOS DE ESE
    // solicitante (no del titular). Se valida que el miembro es de la familia del expediente.
    const clienteId = new URL(req.url).searchParams.get("clienteId")?.trim() || "";
    let datos = datosNormalizados(exp);
    let extra: ExtraFormulario | undefined;
    let sufijo = "";
    if (clienteId && exp.familiaId) {
      const { data: m } = await supabase.from("Cliente").select(FICHA_KEYS.join(", ")).eq("id", clienteId).eq("familiaId", exp.familiaId).maybeSingle();
      if (!m) return NextResponse.json({ error: "Miembro no encontrado." }, { status: 404 });
      const row = m as unknown as Record<string, string | null>;
      const ficha: ClienteFicha = {};
      for (const k of FICHA_KEYS) { const v = row[k]; if (typeof v === "string" && v) (ficha as Record<string, string>)[k] = v; }
      const nombreCompleto = `${row.nombre ?? ""} ${row.apellidos ?? ""}`.trim();
      const datosMiembro = datosDeCliente(ficha, nombreCompleto, row.telefono, row.email);
      sufijo = nombreCompleto ? `_${nombreArchivo(nombreCompleto)}` : "";
      // Lógica compartida (EX-02 reagrupante/reagrupado, EX-31/32 menor, resto = applicant).
      ({ datos, extra } = formularioParaMiembro(tipo, datosNormalizados(exp), datosMiembro, ficha.fechaNacimiento));
    }
    // Casilla p.2: query param (selector en vivo) → override persistido → automático
    // (tipo del expediente). Solo valores conocidos del modelo.
    const p2 = new URL(req.url).searchParams.get("p2")?.trim() ?? "";
    const valido = (v?: string) => Boolean(v && P2_OPCIONES[tipo]?.some((o) => o.value === v));
    const persistido = (await fetchP2Overrides(supabase, id))[tipo];
    const tramite = valido(p2) ? p2 : valido(persistido) ? persistido : exp.tipoEnum;
    // editable: el gestor puede corregir/añadir datos en cualquier visor (pedido por Juan).
    const oficial = await rellenarOficial(tipo, datos, tramite, extra, { editable: true });
    if (!oficial) return NextResponse.json({ error: "Formulario oficial no disponible para este modelo." }, { status: 404 });
    return new Response(Buffer.from(oficial), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${nombreArchivo(tipo)}_oficial_${nombreArchivo(exp.referencia)}${sufijo}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const formulario = buildFormularios(exp).find((f) => f.tipo === tipo);
  if (!formulario) return NextResponse.json({ error: "Formulario no encontrado." }, { status: 404 });

  const gestoria = await gestoriaDe(supabase);
  const bytes = await formularioToPdf(formulario, {
    referencia: exp.referencia, clienteNombre: exp.clienteNombre, gestoria, fecha: exp.creado,
  });

  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nombreArchivo(tipo)}_${nombreArchivo(exp.referencia)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

// DELETE → quita UN formulario de los generados (chip × en la ficha). No toca el estado
// del expediente ni dispara avisos: es una corrección de la lista, no una regresión.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { code?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const code = (body.code ?? "").trim();
  if (!code) return NextResponse.json({ error: "Falta el formulario." }, { status: 400 });

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  // Bajo RLS (anti-IDOR) + lectura defensiva de la columna.
  const { data: exp, error: eSel } = await supabase.from("Expediente").select("id, formulariosGenerados").eq("id", id).maybeSingle();
  if (eSel) return NextResponse.json({ error: "Falta la migración de formulariosGenerados." }, { status: 409 });
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  const actuales = (exp.formulariosGenerados as string[] | null) ?? [];
  if (!actuales.includes(code)) return NextResponse.json({ ok: true }); // ya no está
  // .select("id") → un update a 0 filas (expediente borrado entre medias, RLS futura) se
  // trata como fallo en lugar de responder ok + evento mentiroso.
  const { data: upd, error } = await supabase.from("Expediente")
    .update({ formulariosGenerados: actuales.filter((c) => c !== code) })
    .eq("id", id).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!upd?.length) return NextResponse.json({ error: "No se pudo quitar." }, { status: 409 });

  await supabase.from("ExpedienteEvento").insert({
    id: crypto.randomUUID(), expedienteId: id, tipo: "COMENTARIO",
    descripcion: `Formulario ${code} quitado de los generados`, userId: user.id,
  });
  return NextResponse.json({ ok: true });
}

// POST → marque les formulaires comme generados (avance l'expediente + evento).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const exp = await fetchExpedienteDetalle(id);
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  // Modelos que el gestor declara como generados (curados en la UI), validados contra el
  // catálogo (una cadena arbitraria en tipos contaminaría la ficha y el portal). Repli
  // sur le set auto UNIQUEMENT si le corps est absent (compat) — un [] explicite est une
  // curation légitime («ningún modelo aplica») et doit être persisté tel quel.
  const catalogo = new Set(formulariosDisponibles().map((f) => f.code));
  let seleccion: string[] | null = null;
  try { const b = await req.json(); if (Array.isArray(b?.tipos)) seleccion = b.tipos.filter((x: unknown): x is string => typeof x === "string" && catalogo.has(x)); } catch { /* sans corps */ }
  if (seleccion === null) seleccion = buildFormularios(exp).map((f) => f.tipo);

  // Persiste la selección EXACTA → el cliente verá solo esos (defensivo: la columna
  // puede no existir antes de la migración; en ese caso se ignora sin romper nada).
  const { error: errSel } = await supabase.from("Expediente").update({ formulariosGenerados: seleccion }).eq("id", id);
  if (errSel) console.warn("[formularios] no se pudo persistir la selección (¿migración pendiente?):", errSel.message);

  const tipos = seleccion.join(", ");

  // Avance d'état seulement depuis DOCS_VALIDADOS (idempotent : ne régresse jamais).
  if (exp.estado === "DOCS_VALIDADOS") {
    await supabase.from("Expediente").update({ estado: "FORM_GENERADO", updatedAt: new Date().toISOString() }).eq("id", id);
    // Avise le client (selon Ajustes) que ses formulaires sont prêts — uniquement à la
    // transition, donc une seule fois. Ne casse jamais le flux.
    try {
      const admin = createSupabaseAdmin();
      const { data: w } = await admin.from("Expediente").select("workspaceId").eq("id", id).maybeSingle();
      if (w?.workspaceId) await dispararAviso(admin, { workspaceId: w.workspaceId as string, expedienteId: id, clave: "form_generado", baseUrl: baseUrlFromRequest(req) });
    } catch { /* un aviso ne doit jamais empêcher la génération */ }
  }
  await supabase.from("ExpedienteEvento").insert({
    id: crypto.randomUUID(), expedienteId: id, tipo: "FORM_GENERADO",
    descripcion: `Formularios generados: ${tipos}`, userId: user.id,
  });

  return NextResponse.json({ ok: true, estado: exp.estado === "DOCS_VALIDADOS" ? "FORM_GENERADO" : exp.estado });
}
