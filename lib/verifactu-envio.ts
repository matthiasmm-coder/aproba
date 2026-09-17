import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { descifrarSecreto, SAL_VERIFACTI } from "@/lib/cifrado";
import { verifacti, esErrorCenso, type EstadoVerifacti } from "@/lib/verifacti";
import {
  ESTADOS_ENVIADOS, claveIdempotencia, construirAlta, construirAnulacion, ddmmyyyy, fechaMadrid, mapEstadoVerifacti, normalizarNif,
  registroBloqueaEdicion, type EstadoRegistro, type IdentidadDestinatario, type PayloadAlta, type TipoRegistro,
} from "@/lib/verifactu";
import { emisorParaOficina, oficinaDeFacturaFila } from "@/lib/facturacion-oficina";

// VERI*FACTU — capa de ENVÍO (base + red). Principios:
//   · La factura se emite SIEMPRE (el flujo del despacho y el cobro no dependen de la AEAT);
//     el registro se intenta justo después y, si algo falla, queda ERROR_ENVIO/BLOQUEADO
//     con un motivo legible y se reintenta (cron diario, apertura de la ficha, botón).
//   · Un registro por (factura, tipo). El alta enviada congela la factura (ver
//     registroBloqueaEdicion); la anulación local siempre va seguida del registro de anulación.
//   · Sin tabla (migración pendiente) o sin configuración activa → no hace nada, en silencio.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Cli = SupabaseClient<any, any, any>;
const FALTA_TABLA = /relation|does not exist|schema cache|PGRST205/i;
const FALTA_COLUMNA = /column|schema cache|does not exist/i;

export type ConfigVerifactu = {
  id: string; workspaceId: string; nif: string; entorno: "test" | "prod"; apiKeyEnc: string | null; activo: boolean;
  ultimaComprobacion: string | null; ultimoError: string | null; updatedAt: string;
};
export type FilaRegistro = {
  id: string; workspaceId: string; facturaId: string; tipo: TipoRegistro; entorno: "test" | "prod"; nif: string; serie: string; numero: string;
  fechaExpedicion: string; estado: EstadoRegistro; uuid: string | null; url: string | null; huella: string | null;
  codigoError: string | null; mensajeError: string | null; motivo: string | null; intentos: number;
  proximoIntentoAt: string | null; enviadoAt: string | null; confirmadoAt: string | null; updatedAt: string;
};
const COLS_REGISTRO = "id, workspaceId, facturaId, tipo, entorno, nif, serie, numero, fechaExpedicion, estado, uuid, url, huella, codigoError, mensajeError, motivo, intentos, proximoIntentoAt, enviadoAt, confirmadoAt, updatedAt";

export async function fetchConfigsVerifactu(admin: Cli, workspaceId: string): Promise<ConfigVerifactu[]> {
  const { data, error } = await admin.from("VerifactuConfig").select("id, workspaceId, nif, entorno, apiKeyEnc, activo, ultimaComprobacion, ultimoError, updatedAt").eq("workspaceId", workspaceId).order("createdAt");
  if (error) { if (FALTA_TABLA.test(error.message)) return []; throw new Error(error.message); }
  return (data ?? []) as ConfigVerifactu[];
}
export const claveDeConfig = (c: ConfigVerifactu): string | null => (c.apiKeyEnc ? descifrarSecreto(c.apiKeyEnc, SAL_VERIFACTI) : null);

// ¿Hay VERI*FACTU en marcha en este despacho (algún NIF activo con clave)?
export async function verifactuActivoEnWorkspace(admin: Cli, workspaceId: string): Promise<boolean> {
  try { return (await fetchConfigsVerifactu(admin, workspaceId)).some((c) => c.activo && c.apiKeyEnc); } catch { return false; }
}

// Configuración activa para el NIF que EMITE esta factura (la sede si tiene identidad
// fiscal propia, si no el despacho — misma regla que el encabezado impreso).
export async function configParaFactura(admin: Cli, f: { workspaceId: string; oficinaId?: string | null; expedienteId?: string | null }): Promise<{ config: ConfigVerifactu; apiKey: string; nif: string } | null> {
  const configs = (await fetchConfigsVerifactu(admin, f.workspaceId)).filter((c) => c.activo && c.apiKeyEnc);
  if (!configs.length) return null;
  let nif = "";
  try {
    const sede = await oficinaDeFacturaFila(admin, { oficinaId: f.oficinaId ?? null, expedienteId: f.expedienteId ?? null });
    nif = normalizarNif((await emisorParaOficina(admin, f.workspaceId, sede)).nif);
  } catch { nif = ""; }
  if (!nif) return null;
  const config = configs.find((c) => normalizarNif(c.nif) === nif);
  if (!config) return null;
  const apiKey = claveDeConfig(config);
  return apiKey ? { config, apiKey, nif } : null;
}

export async function fetchRegistrosDeFacturas(cli: Cli, facturaIds: string[]): Promise<Record<string, FilaRegistro[]>> {
  const out: Record<string, FilaRegistro[]> = {};
  if (!facturaIds.length) return out;
  for (let i = 0; i < facturaIds.length; i += 200) {
    const { data, error } = await cli.from("VerifactuRegistro").select(COLS_REGISTRO).in("facturaId", facturaIds.slice(i, i + 200));
    if (error) { if (FALTA_TABLA.test(error.message)) return out; throw new Error(error.message); }
    for (const r of (data ?? []) as FilaRegistro[]) (out[r.facturaId] ??= []).push(r);
  }
  return out;
}
export async function fetchRegistroAlta(cli: Cli, facturaId: string): Promise<FilaRegistro | null> {
  return ((await fetchRegistrosDeFacturas(cli, [facturaId]))[facturaId] ?? []).find((r) => r.tipo === "ALTA") ?? null;
}
// URL de verificación (contenido del QR) de cada factura con alta enviada — para el PDF
// y la vista. Vacío si la tabla no existe o nada se registró: el documento sale como siempre.
export async function urlsQrDeFacturas(cli: Cli, facturaIds: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    const regs = await fetchRegistrosDeFacturas(cli, facturaIds);
    for (const [fid, lista] of Object.entries(regs)) {
      const alta = lista.find((r) => r.tipo === "ALTA");
      if (alta?.url && (ESTADOS_ENVIADOS as string[]).includes(alta.estado)) out[fid] = alta.url;
    }
  } catch { /* sin migrar */ }
  return out;
}
// Alta enviada → la factura es inmutable (PUT/DELETE/realineado la rechazan).
export async function facturaCongeladaPorVerifactu(cli: Cli, facturaId: string): Promise<FilaRegistro | null> {
  try { const r = await fetchRegistroAlta(cli, facturaId); return registroBloqueaEdicion(r) ? r : null; } catch { return null; }
}

// ── Escritura del registro ───────────────────────────────────────────────────
async function guardarRegistro(admin: Cli, fila: Record<string, unknown>): Promise<void> {
  const { error } = await admin.from("VerifactuRegistro").upsert({ ...fila, updatedAt: new Date().toISOString() }, { onConflict: "facturaId,tipo" });
  if (error) throw new Error(`VerifactuRegistro: ${error.message}`);
}

type FacturaFila = {
  id: string; workspaceId: string; numero: string; clienteNombre: string; concepto: string; baseImponible: number | string; total: number | string;
  estado: string; fechaEmision: string | null; lineas?: { concepto: string; base: number }[] | null; suplidos?: { concepto: string; importe: number }[] | null;
  clienteDatos?: { documento?: string } | null; clienteId?: string | null; empresaId?: string | null; oficinaId?: string | null; expedienteId?: string | null;
};
async function cargarFactura(admin: Cli, facturaId: string): Promise<FacturaFila | null> {
  const sel = (cols: string) => admin.from("Factura").select(cols).eq("id", facturaId).maybeSingle();
  let res = await sel("id, workspaceId, numero, clienteNombre, concepto, baseImponible, total, estado, fechaEmision, lineas, suplidos, clienteDatos, clienteId, empresaId, oficinaId, expedienteId");
  if (res.error && FALTA_COLUMNA.test(res.error.message)) res = await sel("id, workspaceId, numero, clienteNombre, concepto, baseImponible, total, estado, fechaEmision, lineas, suplidos, clienteDatos, clienteId, oficinaId, expedienteId");
  if (res.error && FALTA_COLUMNA.test(res.error.message)) res = await sel("id, workspaceId, numero, clienteNombre, concepto, baseImponible, total, estado, fechaEmision, expedienteId");
  if (res.error) throw new Error(`Factura ${facturaId}: ${res.error.message}`);
  return (res.data as unknown as FacturaFila | null) ?? null;
}

// Quién recibe la factura, con lo que hay en base: empresa (CIF) > ficha del cliente
// (NIE/DNI, pasaporte, nacionalidad) > solo el nombre impreso (+ snapshot fiscal).
async function destinatarioDe(admin: Cli, f: FacturaFila): Promise<IdentidadDestinatario> {
  const nombre = String(f.clienteNombre ?? "").trim();
  if (f.empresaId) {
    const { data } = await admin.from("Empresa").select("razonSocial, nif").eq("id", f.empresaId).maybeSingle();
    const e = data as { razonSocial?: string | null; nif?: string | null } | null;
    if (e) return { nombre: nombre || String(e.razonSocial ?? ""), nif: e.nif ?? null };
  }
  if (f.clienteId) {
    let res = await admin.from("Cliente").select("nombre, apellidos, numeroDocumento, pasaporte, nacionalidad").eq("id", f.clienteId).maybeSingle();
    if (res.error && FALTA_COLUMNA.test(res.error.message)) res = await admin.from("Cliente").select("nombre, apellidos, numeroDocumento, nacionalidad").eq("id", f.clienteId).maybeSingle();
    const c = res.data as { nombre?: string; apellidos?: string; numeroDocumento?: string | null; pasaporte?: string | null; nacionalidad?: string | null } | null;
    if (c) return { nombre: nombre || `${c.nombre ?? ""} ${c.apellidos ?? ""}`.trim(), nif: c.numeroDocumento ?? null, pasaporte: c.pasaporte ?? null, nacionalidad: c.nacionalidad ?? null };
  }
  return { nombre };
}

const ahoraIso = () => new Date().toISOString();
const dentroDe = (min: number) => new Date(Date.now() + min * 60_000).toISOString();
const esEjemplo = (numero: string) => /^EJEMPLO-/i.test(String(numero ?? ""));

export type ResultadoEnvio = { hecho: boolean; estado?: EstadoRegistro; motivo?: string; url?: string | null };

// ALTA de una factura emitida. Idempotente: si ya hay un alta enviada, no reenvía.
export async function registrarAlta(admin: Cli, facturaId: string, opts: { reintento?: boolean } = {}): Promise<ResultadoEnvio> {
  const f = await cargarFactura(admin, facturaId);
  if (!f) return { hecho: false, motivo: "Factura no encontrada." };
  if (f.estado === "BORRADOR" || f.estado === "ANULADA" || esEjemplo(f.numero)) return { hecho: false, motivo: "No se registra (borrador, anulada o ejemplo)." };
  const cfg = await configParaFactura(admin, f);
  if (!cfg) return { hecho: false, motivo: "VERI*FACTU no está activo para el NIF emisor de esta factura." };

  let previo: FilaRegistro | null = null;
  try { previo = await fetchRegistroAlta(admin, facturaId); } catch (e) { return { hecho: false, motivo: e instanceof Error ? e.message : String(e) }; }
  if (previo && (ESTADOS_ENVIADOS as string[]).includes(previo.estado)) return { hecho: false, estado: previo.estado, url: previo.url, motivo: "Ya enviada." };

  const dest = await destinatarioDe(admin, f);
  const hoy = new Date();
  const r = construirAlta(
    { numero: f.numero, fechaEmision: f.fechaEmision, concepto: f.concepto, base: Number(f.baseImponible), lineas: f.lineas ?? null, suplidos: f.suplidos ?? null, clienteDatos: f.clienteDatos ?? null },
    dest,
    { hoy, entorno: cfg.config.entorno, incidencia: Boolean(opts.reintento && previo?.intentos) },
  );
  const comun = {
    id: previo?.id ?? crypto.randomUUID(), workspaceId: f.workspaceId, facturaId, tipo: "ALTA" as const, entorno: cfg.config.entorno, nif: cfg.nif,
    serie: "", numero: String(f.numero), fechaExpedicion: r.ok ? r.fechaExpedicion : (f.fechaEmision ? fechaMadrid(new Date(f.fechaEmision)) : fechaMadrid(hoy)),
  };
  if (!r.ok) {
    await guardarRegistro(admin, { ...comun, estado: "BLOQUEADO", motivo: r.motivo, codigoError: r.codigo, mensajeError: null, payload: null, proximoIntentoAt: null, intentos: previo?.intentos ?? 0 });
    return { hecho: false, estado: "BLOQUEADO", motivo: r.motivo };
  }

  let intento = (previo?.intentos ?? 0) + 1;
  let payload: PayloadAlta = r.payload;
  let res = await verifacti.crear(cfg.apiKey, payload, claveIdempotencia(facturaId, "ALTA", intento));
  // Destinatario no censado / nombre no coincidente → la AEAT admite IDOtro 07 «No censado».
  if (!res.ok && res.status === 400 && payload.nif && esErrorCenso(res)) {
    intento += 1;
    const { nif, validar_destinatario: _v, ...resto } = payload;
    payload = { ...resto, id_otro: { codigo_pais: "ES", id_type: "07", id: nif } };
    res = await verifacti.crear(cfg.apiKey, payload, claveIdempotencia(facturaId, "ALTA", intento));
  }
  if (res.ok) {
    const estado = mapEstadoVerifacti(res.data.estado);
    await guardarRegistro(admin, {
      ...comun, estado, uuid: res.data.uuid ?? null, url: res.data.url ?? null, huella: res.data.huella ?? null,
      codigoError: null, mensajeError: null, motivo: null, payload, respuesta: res.data, intentos: intento, proximoIntentoAt: null, enviadoAt: ahoraIso(),
    });
    // Registrada otro día: la fecha de expedición legal es la del registro → la factura
    // impresa la adopta (papel = AEAT) y queda constancia en el expediente.
    if (r.reexpedida) {
      const antes = f.fechaEmision ? fechaMadrid(new Date(f.fechaEmision)) : "";
      await admin.from("Factura").update({ fechaEmision: hoy.toISOString() }).eq("id", facturaId);
      if (f.expedienteId) {
        await admin.from("ExpedienteEvento").insert({
          id: crypto.randomUUID(), expedienteId: f.expedienteId, tipo: "COMENTARIO",
          descripcion: `📄 Factura ${f.numero} registrada en VERI*FACTU con fecha de expedición ${ddmmyyyy(r.fechaExpedicion).replace(/-/g, "/")}${antes ? ` (emitida el ${ddmmyyyy(antes).replace(/-/g, "/")}, envío pendiente hasta hoy)` : ""}`,
        });
      }
    }
    return { hecho: true, estado, url: res.data.url ?? null };
  }
  const red = res.status === 0 || res.status >= 500 || res.status === 409;
  const motivo = red ? `No se pudo contactar con Verifacti (${res.error}). Se reintentará.` : `Verifacti rechazó el registro: ${res.error}`;
  await guardarRegistro(admin, {
    ...comun, estado: "ERROR_ENVIO", uuid: null, url: null, huella: null, codigoError: res.codigo ?? (res.status ? `HTTP ${res.status}` : "RED"), mensajeError: res.error, motivo,
    payload, respuesta: res.data ?? null, intentos: intento, proximoIntentoAt: red ? dentroDe(30) : null,
  });
  return { hecho: false, estado: "ERROR_ENVIO", motivo };
}

// ANULACIÓN: solo tiene sentido si el alta llegó a la AEAT (o está en cola).
export async function registrarAnulacion(admin: Cli, facturaId: string): Promise<ResultadoEnvio> {
  let alta: FilaRegistro | null = null;
  try { alta = await fetchRegistroAlta(admin, facturaId); } catch (e) { return { hecho: false, motivo: e instanceof Error ? e.message : String(e) }; }
  if (!alta || !(ESTADOS_ENVIADOS as string[]).includes(alta.estado)) return { hecho: false, motivo: "El alta no se había enviado: nada que anular en la AEAT." };
  const { data: previoRaw } = await admin.from("VerifactuRegistro").select(COLS_REGISTRO).eq("facturaId", facturaId).eq("tipo", "ANULACION").maybeSingle();
  const previo = (previoRaw as FilaRegistro | null) ?? null;
  if (previo && (ESTADOS_ENVIADOS as string[]).includes(previo.estado)) return { hecho: false, estado: previo.estado, motivo: "Anulación ya enviada." };

  const configs = (await fetchConfigsVerifactu(admin, alta.workspaceId)).filter((c) => c.apiKeyEnc && normalizarNif(c.nif) === normalizarNif(alta!.nif));
  const config = configs.find((c) => c.entorno === alta!.entorno) ?? configs[0];
  const apiKey = config ? claveDeConfig(config) : null;
  const comun = { id: previo?.id ?? crypto.randomUUID(), workspaceId: alta.workspaceId, facturaId, tipo: "ANULACION" as const, entorno: alta.entorno, nif: alta.nif, serie: alta.serie ?? "", numero: alta.numero, fechaExpedicion: alta.fechaExpedicion };
  if (!apiKey) {
    const motivo = "No hay clave Verifacti para este NIF: la anulación no se ha comunicado a la AEAT.";
    await guardarRegistro(admin, { ...comun, estado: "ERROR_ENVIO", motivo, codigoError: "SIN_CLAVE", intentos: previo?.intentos ?? 0, proximoIntentoAt: dentroDe(60) });
    return { hecho: false, estado: "ERROR_ENVIO", motivo };
  }
  const intento = (previo?.intentos ?? 0) + 1;
  const payload = construirAnulacion({ serie: alta.serie ?? "", numero: alta.numero, fechaExpedicion: alta.fechaExpedicion });
  const res = await verifacti.anular(apiKey, payload, claveIdempotencia(facturaId, "ANULACION", intento));
  if (res.ok) {
    const estado = mapEstadoVerifacti(res.data.estado);
    await guardarRegistro(admin, { ...comun, estado, uuid: res.data.uuid ?? null, huella: res.data.huella ?? null, codigoError: null, mensajeError: null, motivo: null, payload, respuesta: res.data, intentos: intento, proximoIntentoAt: null, enviadoAt: ahoraIso() });
    return { hecho: true, estado };
  }
  const red = res.status === 0 || res.status >= 500 || res.status === 409;
  const motivo = red ? `No se pudo contactar con Verifacti (${res.error}). Se reintentará.` : `Verifacti rechazó la anulación: ${res.error}`;
  await guardarRegistro(admin, { ...comun, estado: "ERROR_ENVIO", codigoError: res.codigo ?? (res.status ? `HTTP ${res.status}` : "RED"), mensajeError: res.error, motivo, payload, respuesta: res.data ?? null, intentos: intento, proximoIntentoAt: red ? dentroDe(30) : null });
  return { hecho: false, estado: "ERROR_ENVIO", motivo };
}

// Hook de emisión: nunca lanza, nunca frena la factura.
export async function registrarAltaSiActivo(admin: Cli, facturaId: string): Promise<ResultadoEnvio | null> {
  try { return await registrarAlta(admin, facturaId); }
  catch (e) { console.error("[verifactu alta]", facturaId, e instanceof Error ? e.message : e); return null; }
}
export async function registrarAnulacionSiActivo(admin: Cli, facturaId: string): Promise<ResultadoEnvio | null> {
  try { return await registrarAnulacion(admin, facturaId); }
  catch (e) { console.error("[verifactu anulación]", facturaId, e instanceof Error ? e.message : e); return null; }
}

// ── Estado (polling y webhook) ───────────────────────────────────────────────
const FINALES: EstadoRegistro[] = ["CORRECTO", "ACEPTADO_CON_ERRORES", "INCORRECTO", "DUPLICADO", "ANULADO", "NO_REGISTRADO"];

export async function aplicarEstadoVerifacti(admin: Cli, reg: Pick<FilaRegistro, "id" | "estado">, e: EstadoVerifacti): Promise<EstadoRegistro> {
  const estado = mapEstadoVerifacti(e.estado);
  const patch: Record<string, unknown> = { estado, respuesta: e, updatedAt: ahoraIso() };
  if (e.url) patch.url = e.url;
  patch.codigoError = e.codigo_error || null;
  patch.mensajeError = e.mensaje_error || null;
  if (FINALES.includes(estado)) patch.confirmadoAt = ahoraIso();
  const { error } = await admin.from("VerifactuRegistro").update(patch).eq("id", reg.id);
  if (error) throw new Error(`VerifactuRegistro: ${error.message}`);
  return estado;
}

export async function refrescarRegistro(admin: Cli, reg: FilaRegistro, apiKey?: string): Promise<EstadoRegistro> {
  if (!reg.uuid) return reg.estado;
  let clave = apiKey ?? null;
  if (!clave) {
    const configs = (await fetchConfigsVerifactu(admin, reg.workspaceId)).filter((c) => c.apiKeyEnc && normalizarNif(c.nif) === normalizarNif(reg.nif));
    const c = configs.find((x) => x.entorno === reg.entorno) ?? configs[0];
    clave = c ? claveDeConfig(c) : null;
  }
  if (!clave) return reg.estado;
  const res = await verifacti.estado(clave, reg.uuid);
  if (!res.ok) return reg.estado;
  return aplicarEstadoVerifacti(admin, reg, res.data);
}

// Registros PENDIENTE con más de `edadSeg` segundos: se consultan a Verifacti.
export async function refrescarPendientes(admin: Cli, opts: { workspaceId?: string; facturaIds?: string[]; edadSeg?: number; limite?: number } = {}): Promise<{ revisados: number; cambiados: number }> {
  const corte = new Date(Date.now() - (opts.edadSeg ?? 45) * 1000).toISOString();
  let q = admin.from("VerifactuRegistro").select(COLS_REGISTRO).eq("estado", "PENDIENTE").not("uuid", "is", null).lte("enviadoAt", corte).order("enviadoAt").limit(opts.limite ?? 100);
  if (opts.workspaceId) q = q.eq("workspaceId", opts.workspaceId);
  if (opts.facturaIds?.length) q = q.in("facturaId", opts.facturaIds);
  const { data, error } = await q;
  if (error) { if (FALTA_TABLA.test(error.message)) return { revisados: 0, cambiados: 0 }; throw new Error(error.message); }
  let cambiados = 0;
  for (const reg of (data ?? []) as FilaRegistro[]) {
    try { if ((await refrescarRegistro(admin, reg)) !== "PENDIENTE") cambiados++; } catch (e) { console.error("[verifactu status]", reg.id, e instanceof Error ? e.message : e); }
  }
  return { revisados: (data ?? []).length, cambiados };
}

// Reintentos: ERROR_ENVIO vencidos (red) y BLOQUEADO (por si la ficha ya está completa).
export async function reintentarRegistros(admin: Cli, opts: { workspaceId?: string; limite?: number } = {}): Promise<{ reintentados: number; enviados: number }> {
  const ahora = ahoraIso();
  let q = admin.from("VerifactuRegistro").select(COLS_REGISTRO).or(`and(estado.eq.ERROR_ENVIO,proximoIntentoAt.lte.${ahora}),estado.eq.BLOQUEADO`).lt("intentos", 12).order("updatedAt").limit(opts.limite ?? 50);
  if (opts.workspaceId) q = q.eq("workspaceId", opts.workspaceId);
  const { data, error } = await q;
  if (error) { if (FALTA_TABLA.test(error.message)) return { reintentados: 0, enviados: 0 }; throw new Error(error.message); }
  let enviados = 0;
  for (const reg of (data ?? []) as FilaRegistro[]) {
    try {
      const r = reg.tipo === "ALTA" ? await registrarAlta(admin, reg.facturaId, { reintento: true }) : await registrarAnulacion(admin, reg.facturaId);
      if (r.hecho) enviados++;
    } catch (e) { console.error("[verifactu reintento]", reg.id, e instanceof Error ? e.message : e); }
  }
  return { reintentados: (data ?? []).length, enviados };
}

// Barrido diario (cron reconciliar-pagos): consulta pendientes y reintenta fallidos.
export async function barrerVerifactu(admin: Cli): Promise<{ revisados: number; cambiados: number; reintentados: number; enviados: number }> {
  const a = await refrescarPendientes(admin, { edadSeg: 60, limite: 300 });
  const b = await reintentarRegistros(admin, { limite: 100 });
  return { ...a, ...b };
}

// Resumen por despacho para Ajustes (cuenta por estado).
export async function resumenRegistros(admin: Cli, workspaceId: string): Promise<Record<string, number>> {
  const { data, error } = await admin.from("VerifactuRegistro").select("estado, tipo").eq("workspaceId", workspaceId).limit(5000);
  if (error) return {};
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as { estado: string; tipo: string }[]) if (r.tipo === "ALTA") out[r.estado] = (out[r.estado] ?? 0) + 1;
  return out;
}
