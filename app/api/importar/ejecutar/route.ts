import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sembrarVencimiento } from "@/lib/vencimientos";
import { fetchServiciosDeWorkspace } from "@/lib/data/config";
import { SERVICIO_A_TIPO, TIPO_LABEL } from "@/lib/tramites";
import { FICHA_KEYS } from "@/lib/ficha";
import { aplicarMapeo, aplicarOverrides, marcarDuplicadosInternos, ESTADOS_EXPEDIENTE, type Mapeo, type OverrideFila, type FilaImportada } from "@/lib/importar";

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

// Import de MIGRACIÓN: crea/completa clientes y familias, registra el HISTORIAL de
// servicios (trámites ya realizados — NO expedientes: sin kanban, sin portal, sin cuota)
// y siembra Vigía.
// - Idempotente: por NIE/pasaporte/email (clientes), nombre (familias), referencia o
//   (cliente+servicio+fecha) (historial). Reimportar el mismo archivo no duplica nada.
// - NUNCA toca UsoMensual: migrar 200 dosieres no puede costar 600 € de overage.
// - Vigía: caducidad EXPLÍCITA (columna) = REAL; DERIVADA (servicio + fecha de resolución
//   × validez legal) = ESTIMADA. Nacionalidad/NIE no generan vencimiento.
export async function POST(req: Request) {
  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const { data: mem } = await supa.from("Membership").select("workspaceId").eq("userId", user.id).limit(1).maybeSingle();
  if (!mem?.workspaceId) return NextResponse.json({ error: "Sin despacho." }, { status: 403 });
  const workspaceId = mem.workspaceId as string;

  let body: { filas?: unknown; mapeo?: Mapeo; primeraFilaEsCabecera?: boolean; overrides?: Record<number, OverrideFila>; oficinaId?: string | null };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const brutas = Array.isArray(body.filas) ? (body.filas as string[][]).slice(0, MAX_FILAS + 1) : [];
  const mapeo = body.mapeo;
  if (!brutas.length || !mapeo || !Array.isArray(mapeo.columnas)) return NextResponse.json({ error: "Faltan filas o mapeo." }, { status: 400 });

  // Defensa: claves de servicio y estados validados contra la realidad, no el cliente.
  const admin = createSupabaseAdmin();

  // MULTI-OFICINA: una sede para TODO el fichero. Es como llega el trabajo real —
  // cada oficina exporta SU cartera. Una columna «oficina» por fila obligaría a
  // adivinar nombres mal escritos; aquí el gestor la elige una vez y no hay ambigüedad.
  let oficinaImport: string | null = null;
  if (body.oficinaId) {
    const { data: ofi } = await admin.from("Oficina").select("id").eq("id", String(body.oficinaId)).eq("workspaceId", workspaceId).maybeSingle();
    if (!ofi) return NextResponse.json({ error: "Oficina no encontrada." }, { status: 404 });
    oficinaImport = String(body.oficinaId);
  }
  const serviciosWs = await fetchServiciosDeWorkspace(admin, workspaceId, oficinaImport);
  const catalogo = new Set(serviciosWs.map((s) => s.id));
  const catalogoLabel = new Map(serviciosWs.map((s) => [s.id, s.label] as const));
  for (const [k, v] of Object.entries(mapeo.tramites ?? {})) if (v && !catalogo.has(v)) mapeo.tramites[k] = null;
  for (const [k, v] of Object.entries(mapeo.estados ?? {})) if (!(ESTADOS_EXPEDIENTE as readonly string[]).includes(v)) delete mapeo.estados[k];
  // Validez por trámite: solo meses plausibles (1-240) o null («no caduca»). Nunca se fía del cliente.
  const validez: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(mapeo.validezMeses ?? {})) {
    if (v === null) { validez[k] = null; continue; }
    const n = Number(v);
    if (Number.isFinite(n) && n > 0 && n <= 240) validez[k] = Math.round(n);
  }
  mapeo.validezMeses = validez;

  const datos = body.primeraFilaEsCabecera === false ? brutas : brutas.slice(1);
  const filas = aplicarMapeo(datos.map((f) => f.map((c) => String(c ?? ""))), mapeo);
  marcarDuplicadosInternos(filas);
  aplicarOverrides(filas, body.overrides); // correcciones del gestor en la revisión

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

  const r = { clientesCreados: 0, clientesActualizados: 0, clientesOmitidos: 0, familias: 0, serviciosCreados: 0, serviciosOmitidos: 0, vencimientos: 0, avisos: [] as string[] };
  const avisosExtra: string[] = [];
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
    if (f.excluir) { r.clientesOmitidos++; continue; } // descartada por el gestor en la revisión
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
      const efectivaCad = f.fechaCaducidad || f.caducidadDerivada; // migración nunca pisa una caducidad ya trabajada
      if (efectivaCad && !actual?.fechaCaducidad) { patch.fechaCaducidad = efectivaCad; patch.tipoVencimiento = "TIE"; }
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
        ...((f.fechaCaducidad || f.caducidadDerivada) ? { fechaCaducidad: f.fechaCaducidad || f.caducidadDerivada, tipoVencimiento: "TIE" } : {}),
        ...(oficinaImport ? { oficinaId: oficinaImport } : {}),
      });
    }
  }
  for (let i = 0; i < nuevos.length; i += 100) {
    const lote = nuevos.slice(i, i + 100);
    let { error } = await admin.from("Cliente").insert(lote);
    // Repli si oficinaId no está migrada: la cartera entra igual, sin sede.
    if (error && oficinaImport && /oficinaId|column|schema cache|does not exist/i.test(error.message)) {
      ({ error } = await admin.from("Cliente").insert(lote.map(({ oficinaId: _o, ...rest }) => rest)));
    }
    if (error) return NextResponse.json({ error: `Clientes: ${error.message}`, parcial: r }, { status: 500 });
  }
  r.clientesCreados = nuevos.length;

  // ── 3. Historial de servicios (trámites del PASADO — NI expediente, NI portal, NI cuota) ──
  if (mapeo.crearHistorial) {
    try {
      const { data: histExist } = await admin
        .from("ServicioHistorico")
        .select("id, clienteId, servicioClave, fecha, referencia, importe")
        .eq("workspaceId", workspaceId);
      // Índices por referencia y por (cliente+servicio+fecha) → id + importe: sirven para
      // dedup Y para RELLENAR huecos al reimportar (p. ej. añadir el importe a un servicio
      // ya migrado sin él). El reimport enriquece, no duplica.
      type Rec = { id: string; importe: number | null; sinFecha?: boolean };
      const porRef = new Map<string, Rec>();
      const porCombo = new Map<string, Rec>();
      // Índice extra SIN fecha: un servicio ya migrado al que solo le falta la fecha.
      // Caso real (Gesadmbcn, 12/08): primero se importó la columna de trámite sin fecha
      // y después se añadió la fecha al Excel. Sin este índice, la fecha nueva cambia la
      // clave de dedup y el reimport DUPLICARÍA el historial en vez de completarlo.
      const porClienteServicio = new Map<string, Rec>();
      for (const e of (histExist ?? []) as { id: string; clienteId: string; servicioClave: string | null; fecha: string | null; referencia: string | null; importe: number | string | null }[]) {
        const rec: Rec = { id: e.id, importe: e.importe != null ? Number(e.importe) : null, sinFecha: !e.fecha };
        if (e.referencia) porRef.set(e.referencia, rec);
        porCombo.set(`${e.clienteId}|${e.servicioClave ?? ""}|${(e.fecha ?? "").slice(0, 10)}`, rec);
        if (!e.fecha) porClienteServicio.set(`${e.clienteId}|${e.servicioClave ?? ""}`, rec);
      }
      const lote: Record<string, unknown>[] = [];
      const rellenos: { id: string; importe: number }[] = [];
      const fechasRellenadas: { id: string; fecha: string }[] = [];
      for (let i = 0; i < filas.length; i++) {
        const f = filas[i];
        const clienteId = clienteDe.get(i);
        if (!clienteId || !f.servicio) continue;
        const fechaSrv = f.fechaResolucion || ""; // fecha en que se realizó/resolvió
        const combo = `${clienteId}|${f.servicio}|${fechaSrv}`;
        // El mismo servicio ya migrado SIN fecha cuenta como el mismo: se completa, no se duplica.
        const existente = (f.referencia ? porRef.get(f.referencia) : undefined)
          ?? porCombo.get(combo)
          ?? (fechaSrv ? porClienteServicio.get(`${clienteId}|${f.servicio}`) : undefined);
        if (existente) {
          r.serviciosOmitidos++;
          if (existente.importe == null && f.importe != null) { existente.importe = f.importe; rellenos.push({ id: existente.id, importe: f.importe }); }
          if (existente.sinFecha && fechaSrv) {
            existente.sinFecha = false;
            porClienteServicio.delete(`${clienteId}|${f.servicio}`);
            porCombo.set(combo, existente);            // ya tiene fecha: la próxima fila igual sí es un duplicado
            fechasRellenadas.push({ id: existente.id, fecha: fechaSrv });
          }
          continue;
        }
        const tipo = SERVICIO_A_TIPO[f.servicio] ?? "OTRO";
        const rec: Rec = { id: uid(), importe: f.importe };
        if (f.referencia) porRef.set(f.referencia, rec);
        porCombo.set(combo, rec);
        lote.push({
          id: rec.id, workspaceId, clienteId,
          tipo, servicioClave: f.servicio,
          etiqueta: catalogoLabel.get(f.servicio) ?? TIPO_LABEL[tipo] ?? f.servicio,
          fecha: fechaSrv ? `${fechaSrv}T00:00:00.000Z` : null,
          estado: f.estado || "FINALIZADO",
          referencia: f.referencia || null,
          notas: f.notas ? f.notas.slice(0, 1000) : null,
          importe: f.importe,
          origen: "MIGRACION",
          updatedAt: ahora(),
        });
      }
      for (let i = 0; i < lote.length; i += 100) {
        const { error } = await admin.from("ServicioHistorico").insert(lote.slice(i, i + 100));
        if (error) throw error;
      }
      for (const rl of rellenos) await admin.from("ServicioHistorico").update({ importe: rl.importe, updatedAt: ahora() }).eq("id", rl.id);
      for (const fr of fechasRellenadas) await admin.from("ServicioHistorico").update({ fecha: `${fr.fecha}T00:00:00.000Z`, updatedAt: ahora() }).eq("id", fr.id);
      r.serviciosCreados = lote.length;
      if (rellenos.length) avisosExtra.push(`${rellenos.length} importes añadidos a servicios ya migrados.`);
      if (fechasRellenadas.length) avisosExtra.push(`${fechasRellenadas.length} fechas añadidas a servicios ya migrados (no se han duplicado).`);
    } catch (e) {
      // Repli propre: si falta la migración servicio-historico.sql, el resto del import no se cae.
      avisosExtra.push(`Historial de servicios no registrado (¿falta ejecutar servicio-historico.sql?): ${(e instanceof Error ? e.message : String(e)).slice(0, 120)}`);
    }
  }

  // ── 4. Vigía: caducidad → vencimiento. Explícita (columna del Excel) = REAL; derivada
  //     del servicio + fecha de resolución (validez legal de la tarjeta) = ESTIMADA. ──
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i];
    const clienteId = clienteDe.get(i);
    if (!clienteId) continue;
    const efectiva = f.fechaCaducidad || f.caducidadDerivada;
    if (!efectiva) continue;
    try {
      await sembrarVencimiento(admin, { workspaceId, clienteId, fecha: `${efectiva}T00:00:00.000Z`, tipo: "TIE", fuente: f.fechaCaducidad ? "REAL" : "ESTIMADA" });
      r.vencimientos++;
    } catch { /* Vigía sin migrar → sin vencimientos, el import no se cae */ }
  }

  const avisosFilas = filas.flatMap((f, i) => f.avisos.map((a) => `Fila ${i + 1}: ${a}`));
  const todos = [...avisosExtra, ...avisosFilas];
  r.avisos = todos.slice(0, 40);
  if (todos.length > 40) r.avisos.push(`… y ${todos.length - 40} avisos más`);
  return NextResponse.json(r);
}
