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
  let body: { code?: string; clienteId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const code = (body.code ?? "").trim();
  const clienteId = (body.clienteId ?? "").trim() || null;
  if (!code) return NextResponse.json({ error: "Falta el formulario." }, { status: 400 });

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  // Bajo RLS (anti-IDOR) + lectura defensiva de las columnas (repli sin el mapa por miembro).
  let resSel = await supabase.from("Expediente").select("id, formulariosGenerados, formulariosPorMiembro").eq("id", id).maybeSingle();
  if (resSel.error && /formulariosPorMiembro|column|schema cache/i.test(resSel.error.message)) {
    resSel = await supabase.from("Expediente").select("id, formulariosGenerados").eq("id", id).maybeSingle() as typeof resSel;
  }
  const { data: exp, error: eSel } = resSel;
  if (eSel) return NextResponse.json({ error: "Falta la migración de formulariosGenerados." }, { status: 409 });
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  const actuales = (exp.formulariosGenerados as string[] | null) ?? [];
  const pmRaw = (exp as { formulariosPorMiembro?: unknown }).formulariosPorMiembro;
  const pm = pmRaw && typeof pmRaw === "object" && !Array.isArray(pmRaw) ? pmRaw as Record<string, string[]> : null;
  if (!actuales.includes(code)) return NextResponse.json({ ok: true }); // ya no está
  // .select("id") → un update a 0 filas (expediente borrado entre medias, RLS futura) se
  // trata como fallo en lugar de responder ok + evento mentiroso.
  const { data: upd, error } = await supabase.from("Expediente")
    .update((() => {
      // Familia: quitar SOLO del miembro indicado; la lista plana queda = unión restante.
      if (clienteId && pm && Array.isArray(pm[clienteId])) {
        const pm2 = { ...pm, [clienteId]: pm[clienteId].filter((c: string) => c !== code) };
        const union = [...new Set(Object.values(pm2).flat())];
        return { formulariosPorMiembro: pm2, formulariosGenerados: actuales.filter((c) => c === code ? union.includes(code) : true) };
      }
      return { formulariosGenerados: actuales.filter((c) => c !== code) };
    })())
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
  let porMiembro: Record<string, string[]> | null = null;
  let anadir: { code: string; clienteId: string | null } | null = null;
  try {
    const b = await req.json();
    // INCREMENTAL (descarga de UN formulario): añade SOLO ese código — al miembro si
    // viene clienteId — sin tocar el resto de lo ya generado. Antes, descargar uno
    // marcaba la selección ENTERA de la página (bug real de Matthias: un EX para
    // Antoine persistía también los defaults, y la atribución de Fred se perdía).
    if (b?.anadir && typeof b.anadir === "object") {
      const code = typeof b.anadir.code === "string" && catalogo.has(b.anadir.code) ? b.anadir.code : "";
      if (!code) return NextResponse.json({ error: "Formulario no válido." }, { status: 400 });
      anadir = { code, clienteId: typeof b.anadir.clienteId === "string" && b.anadir.clienteId.trim() ? b.anadir.clienteId.trim() : null };
    }
    if (Array.isArray(b?.tipos)) seleccion = b.tipos.filter((x: unknown): x is string => typeof x === "string" && catalogo.has(x));
    // Curación POR miembro (familia heterogénea): {clienteId: codes[]} filtrada al catálogo.
    if (b?.porMiembro && typeof b.porMiembro === "object" && !Array.isArray(b.porMiembro)) {
      porMiembro = {};
      for (const [k, v] of Object.entries(b.porMiembro as Record<string, unknown>)) {
        if (Array.isArray(v)) porMiembro[k] = v.filter((x): x is string => typeof x === "string" && catalogo.has(x));
      }
    }
  } catch { /* sans corps */ }
  let anadirNuevo = true;
  if (anadir) {
    // Lee el estado actual (ambas columnas, con repli) y fusiona.
    let resAct = await supabase.from("Expediente").select("formulariosGenerados, formulariosPorMiembro").eq("id", id).maybeSingle();
    if (resAct.error) resAct = await supabase.from("Expediente").select("formulariosGenerados").eq("id", id).maybeSingle() as typeof resAct;
    const act = resAct.data as { formulariosGenerados?: string[] | null; formulariosPorMiembro?: unknown } | null;
    const flatAct = Array.isArray(act?.formulariosGenerados) ? act!.formulariosGenerados! : [];
    const pmAct = act?.formulariosPorMiembro && typeof act.formulariosPorMiembro === "object" && !Array.isArray(act.formulariosPorMiembro)
      ? { ...(act.formulariosPorMiembro as Record<string, string[]>) } : null;
    seleccion = flatAct.includes(anadir.code) ? flatAct : [...flatAct, anadir.code];
    if (anadir.clienteId && exp.familiaId) {
      const pm2 = pmAct ?? {};
      const propios = Array.isArray(pm2[anadir.clienteId]) ? pm2[anadir.clienteId] : [];
      anadirNuevo = !propios.includes(anadir.code);
      pm2[anadir.clienteId] = anadirNuevo ? [...propios, anadir.code] : propios;
      porMiembro = pm2;
    } else {
      anadirNuevo = !flatAct.includes(anadir.code);
      if (pmAct) porMiembro = pmAct; // no pisar la curación existente al añadir un código global
    }
  }
  if (seleccion === null) seleccion = buildFormularios(exp).map((f) => f.tipo);

  // Persiste la selección EXACTA → el cliente verá solo esos (defensivo: la columna
  // puede no existir antes de la migración; en ese caso se ignora sin romper nada).
  let { error: errSel } = await supabase.from("Expediente").update({ formulariosGenerados: seleccion, ...(porMiembro ? { formulariosPorMiembro: porMiembro } : {}) }).eq("id", id);
  if (errSel && porMiembro && /formulariosPorMiembro|column|schema cache/i.test(errSel.message)) {
    ({ error: errSel } = await supabase.from("Expediente").update({ formulariosGenerados: seleccion }).eq("id", id));
  }
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
  // Re-descarga de un código ya generado → sin evento (evita el ruido en el historial).
  if (!anadir || anadirNuevo) {
    await supabase.from("ExpedienteEvento").insert({
      id: crypto.randomUUID(), expedienteId: id, tipo: "FORM_GENERADO",
      descripcion: anadir ? `Formulario ${anadir.code} generado` : `Formularios generados: ${tipos}`, userId: user.id,
    });
  }

  return NextResponse.json({ ok: true, estado: exp.estado === "DOCS_VALIDADOS" ? "FORM_GENERADO" : exp.estado });
}
