import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sembrarVencimiento } from "@/lib/vencimientos";
import { fetchServiciosDeWorkspace } from "@/lib/data/config";
import { SERVICIO_A_TIPO } from "@/lib/tramites";
import { FICHA_KEYS } from "@/lib/ficha";
import { aplicarMapeo, marcarDuplicadosInternos, ESTADOS_EXPEDIENTE, type Mapeo, type FilaImportada } from "@/lib/importar";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILAS = 1500;
const uid = () => crypto.randomUUID();

// Parentesco libre → valores del modelo Familia (lib/familia PARENTESCOS).
const PARENTESCO: Record<string, string> = {
  titular: "TITULAR", solicitante: "TITULAR", principal: "TITULAR",
  conyuge: "CONYUGE", esposa: "CONYUGE", esposo: "CONYUGE", mujer: "CONYUGE", marido: "CONYUGE",
  pareja: "PAREJA", hijo: "HIJO", hija: "HIJO", hijos: "HIJO",
  padre: "ASCENDIENTE", madre: "ASCENDIENTE", ascendiente: "ASCENDIENTE",
};
const normParentesco = (v: string) => PARENTESCO[v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()] ?? (v ? "OTRO" : "");

// Import de MIGRACIÓN: crea/completa clientes, familias y expedientes históricos.
// - Idempotente: por NIE/pasaporte/email (clientes), nombre (familias), referencia o
//   (cliente+servicio) (expedientes). Reimportar el mismo archivo no duplica nada.
// - Los expedientes migrados NO tocan UsoMensual (esta ruta jamás incrementa el
//   contador): migrar 200 dosieres no puede costar 600 € de overage.
// - Caducidades → Vigía (fuente REAL), como el alta manual.
export async function POST(req: Request) {
  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const { data: mem } = await supa.from("Membership").select("workspaceId").eq("userId", user.id).limit(1).maybeSingle();
  if (!mem?.workspaceId) return NextResponse.json({ error: "Sin despacho." }, { status: 403 });
  const workspaceId = mem.workspaceId as string;

  let body: { filas?: unknown; mapeo?: Mapeo; primeraFilaEsCabecera?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const brutas = Array.isArray(body.filas) ? (body.filas as string[][]).slice(0, MAX_FILAS + 1) : [];
  const mapeo = body.mapeo;
  if (!brutas.length || !mapeo || !Array.isArray(mapeo.columnas)) return NextResponse.json({ error: "Faltan filas o mapeo." }, { status: 400 });

  // Defensa: claves de servicio y estados validados contra la realidad, no el cliente.
  const admin = createSupabaseAdmin();
  const catalogo = new Set((await fetchServiciosDeWorkspace(admin, workspaceId)).map((s) => s.id));
  for (const [k, v] of Object.entries(mapeo.tramites ?? {})) if (v && !catalogo.has(v)) mapeo.tramites[k] = null;
  for (const [k, v] of Object.entries(mapeo.estados ?? {})) if (!(ESTADOS_EXPEDIENTE as readonly string[]).includes(v)) delete mapeo.estados[k];

  const datos = body.primeraFilaEsCabecera === false ? brutas : brutas.slice(1);
  const filas = aplicarMapeo(datos.map((f) => f.map((c) => String(c ?? ""))), mapeo);
  marcarDuplicadosInternos(filas);

  // ── Clientes existentes del despacho (match en memoria: 1 select, no N) ──
  const { data: existentes } = await admin
    .from("Cliente")
    .select("id, nombre, apellidos, email, numeroDocumento, pasaporte, fechaNacimiento, familiaId")
    .eq("workspaceId", workspaceId);
  const porNie = new Map<string, string>();
  const porPasaporte = new Map<string, string>();
  const porEmail = new Map<string, string>();
  const porIdentidad = new Map<string, string>();
  const claveId = (n?: string | null, a?: string | null, f?: string | null) =>
    `${(n ?? "").trim().toLowerCase()}|${(a ?? "").trim().toLowerCase()}|${(f ?? "").trim()}`;
  for (const c of (existentes ?? []) as { id: string; nombre: string | null; apellidos: string | null; email: string | null; numeroDocumento: string | null; pasaporte: string | null; fechaNacimiento: string | null; familiaId: string | null }[]) {
    if (c.numeroDocumento) porNie.set(c.numeroDocumento.toUpperCase(), c.id);
    if (c.pasaporte) porPasaporte.set(c.pasaporte.toLowerCase(), c.id);
    if (c.email) porEmail.set(c.email.toLowerCase(), c.id);
    if (c.nombre) porIdentidad.set(claveId(c.nombre, c.apellidos, c.fechaNacimiento), c.id);
  }

  // ── Familias del despacho (idempotencia por nombre) ──
  const familiasPorNombre = new Map<string, string>();
  if (mapeo.crearFamilias) {
    const { data: fams } = await admin.from("Familia").select("id, nombre").eq("workspaceId", workspaceId);
    for (const f of (fams ?? []) as { id: string; nombre: string }[]) familiasPorNombre.set(f.nombre.trim().toLowerCase(), f.id);
  }

  const r = { clientesCreados: 0, clientesActualizados: 0, clientesOmitidos: 0, familias: 0, expedientesCreados: 0, expedientesOmitidos: 0, vencimientos: 0, avisos: [] as string[] };
  const ahora = () => new Date().toISOString();

  // ── 1. Familias nuevas ──
  const nuevasFamilias: { id: string; workspaceId: string; nombre: string; updatedAt: string }[] = [];
  if (mapeo.crearFamilias) {
    for (const f of filas) {
      const k = f.familia.trim().toLowerCase();
      if (!k || familiasPorNombre.has(k)) continue;
      const id = uid();
      familiasPorNombre.set(k, id);
      nuevasFamilias.push({ id, workspaceId, nombre: f.familia.trim(), updatedAt: ahora() });
    }
    if (nuevasFamilias.length) {
      const { error } = await admin.from("Familia").insert(nuevasFamilias);
      if (error) return NextResponse.json({ error: `Familias: ${error.message}` }, { status: 500 });
      r.familias = nuevasFamilias.length;
    }
  }

  // ── 2. Clientes: upsert (rellenar huecos, nunca machacar lo existente) ──
  const clienteDe = new Map<number, string>(); // índice de fila → clienteId
  const nuevos: Record<string, unknown>[] = [];
  const titularDeFamilia = new Set<string>();
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i];
    if (!f.ficha.nombre?.trim()) { r.clientesOmitidos++; continue; }
    if (f.avisos.some((a) => a.startsWith("Duplicado en el archivo"))) { r.clientesOmitidos++; continue; }
    const nie = f.ficha.numeroDocumento?.toUpperCase();
    const idExistente =
      (nie && porNie.get(nie)) ||
      (f.ficha.pasaporte && porPasaporte.get(f.ficha.pasaporte.toLowerCase())) ||
      (f.ficha.email && porEmail.get(f.ficha.email.toLowerCase())) ||
      porIdentidad.get(claveId(f.ficha.nombre, f.ficha.apellidos, f.ficha.fechaNacimiento));

    const familiaId = mapeo.crearFamilias && f.familia ? familiasPorNombre.get(f.familia.trim().toLowerCase()) ?? null : null;
    let parentesco = normParentesco(f.parentesco);
    if (familiaId && !parentesco) {
      parentesco = titularDeFamilia.has(familiaId) ? "OTRO" : "TITULAR";
    }
    if (familiaId && parentesco === "TITULAR") titularDeFamilia.add(familiaId);

    if (idExistente) {
      // Solo rellena campos vacíos (una migración nunca pisa datos ya trabajados).
      const actual = (existentes ?? []).find((c) => c.id === idExistente) as Record<string, unknown> | undefined;
      const patch: Record<string, unknown> = {};
      for (const k of FICHA_KEYS) {
        const v = (f.ficha as Record<string, string | undefined>)[k];
        if (v && !(actual?.[k] ?? "")) patch[k] = v;
      }
      if (familiaId && !actual?.familiaId) { patch.familiaId = familiaId; if (parentesco) patch.parentesco = parentesco; }
      if (f.fechaCaducidad) { patch.fechaCaducidad = f.fechaCaducidad; patch.tipoVencimiento = "TIE"; }
      if (Object.keys(patch).length) {
        const { error } = await admin.from("Cliente").update({ ...patch, updatedAt: ahora() }).eq("id", idExistente);
        if (!error) r.clientesActualizados++;
      } else r.clientesOmitidos++;
      clienteDe.set(i, idExistente);
    } else {
      const id = uid();
      clienteDe.set(i, id);
      if (nie) porNie.set(nie, id);
      if (f.ficha.email) porEmail.set(f.ficha.email.toLowerCase(), id);
      porIdentidad.set(claveId(f.ficha.nombre, f.ficha.apellidos, f.ficha.fechaNacimiento), id);
      nuevos.push({
        id, workspaceId, updatedAt: ahora(),
        ...Object.fromEntries(FICHA_KEYS.map((k) => [k, (f.ficha as Record<string, string | undefined>)[k] ?? null])),
        ...(f.idioma ? { idioma: f.idioma } : {}),
        ...(familiaId ? { familiaId, parentesco: parentesco || "OTRO", esSolicitante: false } : { esSolicitante: false }),
        ...(f.fechaCaducidad ? { fechaCaducidad: f.fechaCaducidad, tipoVencimiento: "TIE" } : {}),
      });
    }
  }
  for (let i = 0; i < nuevos.length; i += 100) {
    const { error } = await admin.from("Cliente").insert(nuevos.slice(i, i + 100));
    if (error) return NextResponse.json({ error: `Clientes: ${error.message}`, parcial: r }, { status: 500 });
  }
  r.clientesCreados = nuevos.length;

  // ── 3. Expedientes históricos (SIN portalToken, SIN contador) ──
  if (mapeo.crearExpedientes) {
    const { data: expsExist } = await admin.from("Expediente").select("id, referencia, clienteId, servicioClave").eq("workspaceId", workspaceId);
    const refsUsadas = new Set(((expsExist ?? []) as { referencia: string }[]).map((e) => e.referencia));
    const combos = new Set(((expsExist ?? []) as { clienteId: string | null; servicioClave: string | null }[]).map((e) => `${e.clienteId}|${e.servicioClave}`));
    const lote: Record<string, unknown>[] = [];
    const eventos: Record<string, unknown>[] = [];
    let n = refsUsadas.size + 1;
    for (let i = 0; i < filas.length; i++) {
      const f = filas[i];
      const clienteId = clienteDe.get(i);
      if (!clienteId || !f.servicio) continue;
      if (f.referencia && refsUsadas.has(f.referencia)) { r.expedientesOmitidos++; continue; }
      if (!f.referencia && combos.has(`${clienteId}|${f.servicio}`)) { r.expedientesOmitidos++; continue; }
      let referencia = f.referencia;
      if (!referencia) { do { referencia = `MIG-${String(n++).padStart(4, "0")}`; } while (refsUsadas.has(referencia)); }
      refsUsadas.add(referencia);
      combos.add(`${clienteId}|${f.servicio}`);
      const id = uid();
      const familiaId = mapeo.crearFamilias && f.familia ? familiasPorNombre.get(f.familia.trim().toLowerCase()) ?? null : null;
      lote.push({
        id, workspaceId, clienteId, referencia,
        tipo: SERVICIO_A_TIPO[f.servicio] ?? "OTRO", servicioClave: f.servicio,
        estado: f.estado || "FINALIZADO",
        ...(familiaId ? { familiaId } : {}),
        updatedAt: ahora(),
      });
      eventos.push({ id: uid(), expedienteId: id, tipo: "COMENTARIO", descripcion: f.notas ? `Importado (migración). Notas: ${f.notas.slice(0, 500)}` : "Importado (migración)", userId: user.id });
    }
    for (let i = 0; i < lote.length; i += 100) {
      const { error } = await admin.from("Expediente").insert(lote.slice(i, i + 100));
      if (error) return NextResponse.json({ error: `Expedientes: ${error.message}`, parcial: r }, { status: 500 });
    }
    for (let i = 0; i < eventos.length; i += 100) await admin.from("ExpedienteEvento").insert(eventos.slice(i, i + 100));
    r.expedientesCreados = lote.length;
  }

  // ── 4. Vigía: caducidades → vencimientos (fuente REAL, como el alta manual) ──
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i];
    const clienteId = clienteDe.get(i);
    if (!clienteId || !f.fechaCaducidad) continue;
    try {
      await sembrarVencimiento(admin, { workspaceId, clienteId, fecha: `${f.fechaCaducidad}T00:00:00.000Z`, tipo: "TIE", fuente: "REAL" });
      r.vencimientos++;
    } catch { /* Vigía sin migrar → sin vencimientos, el import no se cae */ }
  }

  const avisosFilas = filas.flatMap((f, i) => f.avisos.map((a) => `Fila ${i + 1}: ${a}`));
  r.avisos = avisosFilas.slice(0, 40);
  if (avisosFilas.length > 40) r.avisos.push(`… y ${avisosFilas.length - 40} avisos más`);
  return NextResponse.json(r);
}
