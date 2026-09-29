import "server-only";
import { randomUUID as uuid } from "node:crypto";
import type { createSupabaseAdmin } from "@/lib/supabase/admin";
import { IaNoDisponible } from "@/lib/extraction";
import { bovedaDisponible, cifrarParaDespacho, descifrarDelDespacho } from "@/lib/dehu/boveda";
import { CertificadoInvalido, leerCertificado, type CertificadoLeido } from "@/lib/dehu/certificado";
import { ClienteDehu, type UsoDehu } from "@/lib/dehu/cliente";
import { ErrorDehu, esCodigoExito, type EnvioDehu, type Entorno, type RefEnvio } from "@/lib/dehu/soap";
import { REALIZADA_CON_DOCUMENTO, REALIZADA_SIN_ABRIR, avisoDeEnvio, diaMadrid, esDeExtranjeria, huellaLema, numeroOficialEnTexto } from "@/lib/dehu/envios";
import { COLS_NOTIFICACION, avisoQueCierra, mapFilaNotificacion, sugerirExpediente, type NotificacionDehu } from "@/lib/notificaciones-dehu";
import { candidatosDeWorkspace, faltaMigracionDehu, importarNotificacion } from "@/lib/notificaciones-dehu-guardar";

// DEHú AUTOMÁTICA (Gran Destinatario / LEMA) — Matthias, 29/09/2026: «si c'est ce que font
// les concurrents, alors il faut le faire». El despacho confía a Aproba su certificado
// (cifrado, lib/dehu/boveda.ts) y Aproba:
//   · consulta su DEHú (al entrar alguien en la app, como mucho cada 20 min, y cada mañana):
//     cada notificación pendiente de extranjería entra en la pestaña DEHú y en la campana
//     con sus 10 días naturales. Listar NO la abre: ningún efecto jurídico;
//   · si el despacho la abre en la DEHú, trae su PDF solo (LocalizaRealizadas +
//     ConsultaRealizadas) y la IA lo lee como cualquier PDF importado;
//   · la ABRE desde Aproba solo cuando un miembro lo pide y lo confirma (abrirNotificacionDehu).
// Cada uso del certificado queda en DehuUsoCertificado.

type Admin = ReturnType<typeof createSupabaseAdmin>;
export const ERROR_MIGRACION_DEHU_AUTO = "Falta la migración: ejecuta supabase/dehu-automatico.sql.";
const faltaTabla = (msg: string) => /DehuConexion|DehuUsoCertificado|relation|schema cache|does not exist|PGRST205/i.test(msg);

const CADA_MIN = 20;                 // consulta automática como mucho cada 20 minutos
const DIAS_PENDIENTES = 12;          // los pendientes caducan a los 10 días naturales
const DIAS_REALIZADAS_PRIMERA = 30;  // primera revisión de las ya abiertas
const MAX_DOCUMENTOS_POR_CONSULTA = 3; // cada uno es una lectura IA de varios segundos
const MAX_PAGINAS_REALIZADAS = 5;

export type ConexionDehu = {
  id: string; workspaceId: string; estado: "ACTIVA" | "ERROR" | "PAUSADA"; entorno: Entorno;
  certificadoCifrado: string; claveCifrada: string;
  titularNombre: string | null; titularNif: string | null; receptorNombre: string | null; receptorNif: string | null;
  certTipo: string | null; certEmisor: string | null; certSerie: string | null; certCaducaAt: string | null;
  ultimaConsultaAt: string | null; ultimoExitoAt: string | null; ultimoError: string | null; erroresSeguidos: number;
  realizadasDesde: string | null; creadoPorId: string | null; createdAt: string;
};

// Lo que ve el navegador: nunca el certificado ni su contraseña, ni siquiera cifrados.
export type EstadoDehuAutomatica = {
  disponible: boolean; migracion: boolean; conectada: boolean;
  estado?: ConexionDehu["estado"]; entorno?: Entorno;
  titularNombre?: string | null; titularNif?: string | null; receptorNombre?: string | null;
  certTipo?: string | null; certEmisor?: string | null; certCaducaAt?: string | null;
  ultimaConsultaAt?: string | null; ultimoExitoAt?: string | null; ultimoError?: string | null; createdAt?: string;
};

export async function leerConexion(admin: Admin, workspaceId: string): Promise<{ conexion: ConexionDehu | null; migracion: boolean }> {
  const { data, error } = await admin.from("DehuConexion").select("*").eq("workspaceId", workspaceId).maybeSingle();
  if (error) {
    if (faltaTabla(error.message)) return { conexion: null, migracion: false };
    throw new Error(error.message);
  }
  return { conexion: (data as ConexionDehu | null) ?? null, migracion: true };
}

export async function estadoDehuAutomatica(admin: Admin, workspaceId: string): Promise<EstadoDehuAutomatica> {
  const { conexion: c, migracion } = await leerConexion(admin, workspaceId);
  const base = { disponible: bovedaDisponible(), migracion };
  if (!c) return { ...base, conectada: false };
  return {
    ...base, conectada: true, estado: c.estado, entorno: c.entorno,
    titularNombre: c.titularNombre, titularNif: c.titularNif, receptorNombre: c.receptorNombre,
    certTipo: c.certTipo, certEmisor: c.certEmisor, certCaducaAt: c.certCaducaAt,
    ultimaConsultaAt: c.ultimaConsultaAt, ultimoExitoAt: c.ultimoExitoAt, ultimoError: c.ultimoError, createdAt: c.createdAt,
  };
}

function certificadoDe(c: ConexionDehu): CertificadoLeido {
  const p12 = descifrarDelDespacho(c.certificadoCifrado, c.workspaceId, "certificado");
  const clave = descifrarDelDespacho(c.claveCifrada, c.workspaceId, "clave");
  if (!p12 || !clave) throw new CertificadoInvalido("No se puede abrir el certificado guardado: vuelve a conectarlo.");
  return leerCertificado(p12, clave.toString("utf8"));
}

// Además de las llamadas a la DEHú, el registro guarda cuándo se conectó y retiró el certificado.
type UsoRegistro = Omit<UsoDehu, "operacion"> & { operacion: string };
async function registrarUsos(admin: Admin, workspaceId: string, usos: UsoRegistro[], userId: string | null) {
  if (!usos.length) return;
  const filas = usos.map((u) => ({
    id: uuid(), workspaceId, operacion: u.operacion, identificador: u.identificador, resultado: u.ok ? "OK" : "ERROR",
    codigoRespuesta: u.codigo, detalle: u.detalle ? `${u.detalle} · ${u.ms} ms` : `${u.ms} ms`, userId,
  }));
  const { error } = await admin.from("DehuUsoCertificado").insert(filas);
  if (error) console.error("[dehu auto] registro de usos:", error.message);
}

const unicos = (l: EnvioDehu[]) => {
  const vistos = new Set<string>();
  return l.filter((e) => (vistos.has(e.identificador) ? false : (vistos.add(e.identificador), true)));
};
// La DEHú exige nifTitular y/o nifDestinatario (código 4202, comprobado en pruebas el
// 29/09/2026). Se pregunta por los dos: lo que llega A NOMBRE del despacho y lo que le llega
// como destinatario de otro titular (el cliente al que representa).
type FiltroNif = { nifTitular: string } | { nifDestinatario: string };
const filtrosDe = (nif: string): FiltroNif[] => [{ nifTitular: nif }, { nifDestinatario: nif }];

// Localiza entre dos fechas; si la DEHú dice que hay más, parte el intervalo en dos.
async function localizaTramo(cliente: ClienteDehu, filtro: FiltroNif, desde: Date, hasta: Date, nivel = 0): Promise<EnvioDehu[]> {
  const r = await cliente.localiza({ ...filtro, fechaDesde: desde, fechaHasta: hasta });
  if (!r.hayMas || nivel >= 3) return r.envios;
  const medio = new Date((desde.getTime() + hasta.getTime()) / 2);
  return unicos([...r.envios, ...await localizaTramo(cliente, filtro, desde, medio, nivel + 1), ...await localizaTramo(cliente, filtro, medio, hasta, nivel + 1)]);
}
async function pendientes(cliente: ClienteDehu, nif: string, desde: Date, hasta: Date): Promise<EnvioDehu[]> {
  const todos: EnvioDehu[] = [];
  for (const f of filtrosDe(nif)) todos.push(...await localizaTramo(cliente, f, desde, hasta));
  return unicos(todos);
}

type Resumen = { nuevas: number; importadas: number; otras: number; cerradas: number };

// Pendientes → avisos «LEMA» (una fila por envío, idempotente por huella).
async function guardarPendientes(admin: Admin, c: ConexionDehu, envios: EnvioDehu[], r: Resumen) {
  const utiles = envios.filter(esDeExtranjeria);
  r.otras += envios.length - utiles.length;
  if (!utiles.length) return;
  const huellas = utiles.map((e) => huellaLema(e.identificador));
  const { data: ya } = await admin.from("NotificacionDehu").select("huella").eq("workspaceId", c.workspaceId).in("huella", huellas);
  const existentes = new Set(((ya ?? []) as { huella: string }[]).map((x) => x.huella));
  const nuevos = utiles.filter((e) => !existentes.has(huellaLema(e.identificador)));
  if (!nuevos.length) return;
  const cands = await candidatosDeWorkspace(admin, c.workspaceId);
  // Avisos por email de estas mismas notificaciones: quedan resueltos (la DEHú automática manda).
  const { data: emails } = await admin.from("NotificacionDehu").select("id, organismo, fechaPuestaDisposicion, numeroExpediente, nie, aviso, createdAt")
    .eq("workspaceId", c.workspaceId).eq("origen", "AVISO_EMAIL").eq("tipo", "AVISO").eq("estado", "PENDIENTE").limit(300);
  let avisosEmail = ((emails ?? []) as Record<string, unknown>[]).map((a) => ({
    id: String(a.id), organismo: (a.organismo as string | null) ?? null,
    fechaPuestaDisposicion: typeof a.fechaPuestaDisposicion === "string" ? a.fechaPuestaDisposicion.slice(0, 10) : null,
    identificador: typeof (a.aviso as Record<string, unknown> | null)?.identificador === "string" ? String((a.aviso as Record<string, unknown>).identificador) : null,
    numeroExpediente: (a.numeroExpediente as string | null) ?? null, nie: (a.nie as string | null) ?? null, createdAt: String(a.createdAt),
  }));
  const ahora = new Date().toISOString();
  for (const e of nuevos) {
    const a = avisoDeEnvio(e, c.titularNif);
    const numero = numeroOficialEnTexto(`${e.concepto} ${e.descripcion ?? ""} ${e.metadatosPublicos ?? ""}`, cands);
    const sugerencia = numero || a.nie ? sugerirExpediente({ numeroExpediente: numero, nie: a.nie, pasaporte: null, titularNombre: null }, cands) : null;
    const id = uuid();
    const ins = await admin.from("NotificacionDehu").insert({
      id, workspaceId: c.workspaceId, origen: "LEMA", estado: "PENDIENTE", ...a, numeroExpediente: numero,
      expedienteSugeridoId: sugerencia?.expedienteId ?? null, motivoSugerencia: sugerencia?.motivo ?? null,
      iaDatos: { sugerencia }, updatedAt: ahora,
    });
    if (ins.error) { if (!/duplicate key|unique/i.test(ins.error.message)) console.error("[dehu auto] aviso:", ins.error.message); continue; }
    r.nuevas++;
    const duplicado = avisoQueCierra({ identificador: e.identificador, numeroExpediente: numero, nie: a.nie, organismo: a.organismo, fechaPuestaDisposicion: a.fechaPuestaDisposicion }, avisosEmail);
    if (duplicado) {
      await admin.from("NotificacionDehu").update({ estado: "GESTIONADA", gestionadaAt: ahora, gestionadaPor: "Aproba (la misma, en la DEHú automática)", updatedAt: ahora }).eq("id", duplicado);
      avisosEmail = avisosEmail.filter((x) => x.id !== duplicado);
    }
  }
}

// El PDF de una notificación ya abierta → la bandeja (lectura IA) y su aviso, cerrado.
async function traerDocumento(admin: Admin, c: ConexionDehu, cliente: ClienteDehu, e: EnvioDehu, aviso: { id: string; aviso: Record<string, unknown>; expedienteId: string | null } | null, r: Resumen) {
  const ref: RefEnvio = { identificador: e.identificador, codigoOrigen: e.codigoOrigen, concepto: e.concepto };
  const d = await cliente.consultaRealizadas(ref);
  if (!d.documento?.bytes?.length) { if (!esCodigoExito(d.codigo)) console.warn("[dehu auto] sin documento:", d.codigo, d.descripcion); return; }
  const imp = await importarNotificacion(admin, {
    workspaceId: c.workspaceId, buffer: d.documento.bytes, mime: d.documento.mime || "application/pdf",
    nombre: d.documento.nombre || `notificacion-${e.identificador}.pdf`, creadoPorId: null, siNoEs: "ignorar",
    fechaNotificacion: diaMadrid(d.fecha), expedienteVinculado: aviso?.expedienteId ?? null,
  });
  const docId = imp.fila?.id ?? null;
  const ahora = new Date().toISOString();
  const datos = { documentoId: docId, estadoDehu: e.estado, abiertaAt: d.fecha, cerradaPor: docId };
  if (aviso) {
    await admin.from("NotificacionDehu").update({ estado: "GESTIONADA", gestionadaAt: ahora, gestionadaPor: "Aproba (DEHú automática)", aviso: { ...aviso.aviso, ...datos }, updatedAt: ahora }).eq("id", aviso.id);
  } else {
    // Abierta en la DEHú antes de que Aproba la viera pendiente: se deja constancia igual.
    const a = avisoDeEnvio(e, c.titularNif);
    await admin.from("NotificacionDehu").insert({ id: uuid(), workspaceId: c.workspaceId, origen: "LEMA", estado: "GESTIONADA", ...a, fechaLimite: null, aviso: { ...a.aviso, ...datos }, gestionadaAt: ahora, gestionadaPor: "Aproba (DEHú automática)", updatedAt: ahora });
  }
  if (imp.estado === "importada") r.importadas++;
}

// Las ya abiertas, rechazadas o expiradas desde la última revisión.
async function revisarRealizadas(admin: Admin, c: ConexionDehu, cliente: ClienteDehu, r: Resumen) {
  const hasta = new Date();
  const desde = c.realizadasDesde ? new Date(c.realizadasDesde) : new Date(hasta.getTime() - DIAS_REALIZADAS_PRIMERA * 86_400_000);
  const envios: EnvioDehu[] = [];
  for (const f of filtrosDe(c.titularNif ?? "")) {
    for (let pagina = 1; pagina <= MAX_PAGINAS_REALIZADAS; pagina++) {
      const res = await cliente.localizaRealizadas({ ...f, fechaDesde: desde, fechaHasta: hasta, pagina });
      envios.push(...res.envios);
      if (res.paginaActual >= res.totalPaginas || !res.envios.length) break;
    }
  }
  const utiles = unicos(envios).filter(esDeExtranjeria);
  if (!utiles.length) return true;
  const { data } = await admin.from("NotificacionDehu").select("id, estado, aviso, expedienteId, huella").eq("workspaceId", c.workspaceId).in("huella", utiles.map((e) => huellaLema(e.identificador)));
  const porHuella = new Map(((data ?? []) as { id: string; estado: string; aviso: Record<string, unknown> | null; expedienteId: string | null; huella: string }[]).map((x) => [x.huella, x]));
  let documentos = 0;
  let completo = true;
  const ahora = new Date().toISOString();
  for (const e of utiles) {
    const fila = porHuella.get(huellaLema(e.identificador)) ?? null;
    const aviso = (fila?.aviso ?? {}) as Record<string, unknown>;
    if (REALIZADA_CON_DOCUMENTO.has(String(e.estado))) {
      if (aviso.documentoId) continue;
      if (documentos >= MAX_DOCUMENTOS_POR_CONSULTA) { completo = false; continue; }
      documentos++;
      try { await traerDocumento(admin, c, cliente, e, fila ? { id: fila.id, aviso, expedienteId: fila.expedienteId } : null, r); }
      catch (err) { if (err instanceof IaNoDisponible) { completo = false; continue; } throw err; }
    } else if (REALIZADA_SIN_ABRIR.has(String(e.estado)) && fila && (fila.estado === "PENDIENTE" || fila.estado === "VINCULADA") && aviso.estadoDehu !== e.estado) {
      // Expirada: se da por notificada (rechazada) y el procedimiento sigue. Queda a la vista.
      const rechazadaAposta = e.estado === "RECHAZADA";
      await admin.from("NotificacionDehu").update({
        aviso: { ...aviso, estadoDehu: e.estado }, updatedAt: ahora,
        ...(rechazadaAposta ? { estado: "GESTIONADA", gestionadaAt: ahora, gestionadaPor: "Rechazada en la DEHú" } : {}),
      }).eq("id", fila.id);
      r.cerradas++;
    }
  }
  return completo;
}

async function anotar(admin: Admin, c: ConexionDehu, cambios: Record<string, unknown>) {
  await admin.from("DehuConexion").update({ ...cambios, updatedAt: new Date().toISOString() }).eq("id", c.id);
}

export type ResultadoSync = { hecha: boolean; motivo?: string; error?: string } & Partial<Resumen>;

// La consulta. Sin `forzar`, como mucho una cada CADA_MIN por despacho: el candado es la
// propia fecha (si otra consulta la acaba de mover, esta no hace nada).
export async function sincronizarDehu(admin: Admin, workspaceId: string, o: { forzar?: boolean; userId?: string | null } = {}): Promise<ResultadoSync> {
  const { conexion: c } = await leerConexion(admin, workspaceId);
  if (!c) return { hecha: false, motivo: "sin conexión" };
  if (c.estado === "PAUSADA") return { hecha: false, motivo: "pausada" };
  const ahora = new Date();
  const limite = new Date(ahora.getTime() - (o.forzar ? 60_000 : CADA_MIN * 60_000)).toISOString();
  const { data: tomada } = await admin.from("DehuConexion").update({ ultimaConsultaAt: ahora.toISOString() })
    .eq("id", c.id).or(`ultimaConsultaAt.is.null,ultimaConsultaAt.lt.${limite}`).select("id");
  if (!tomada?.length) return { hecha: false, motivo: "reciente" };

  const usos: UsoDehu[] = [];
  const r: Resumen = { nuevas: 0, importadas: 0, otras: 0, cerradas: 0 };
  try {
    const cert = certificadoDe(c);
    const cliente = new ClienteDehu(cert, c.entorno, (u) => usos.push(u));
    if (!c.titularNif) throw new CertificadoInvalido("Falta el NIF del titular: vuelve a conectar el certificado.");
    await guardarPendientes(admin, c, await pendientes(cliente, c.titularNif, new Date(ahora.getTime() - DIAS_PENDIENTES * 86_400_000), ahora), r);
    const completo = await revisarRealizadas(admin, c, cliente, r);
    // Si quedaron documentos por traer, la próxima revisión vuelve a mirar el mismo tramo.
    await anotar(admin, c, {
      estado: "ACTIVA", ultimoExitoAt: new Date().toISOString(), ultimoError: null, erroresSeguidos: 0,
      ...(completo ? { realizadasDesde: new Date(ahora.getTime() - 2 * 86_400_000).toISOString() } : {}),
    });
    return { hecha: true, ...r };
  } catch (e) {
    const msg = e instanceof CertificadoInvalido || e instanceof ErrorDehu ? e.message : "Error inesperado al consultar la DEHú.";
    if (!(e instanceof CertificadoInvalido || e instanceof ErrorDehu)) console.error("[dehu auto]", e);
    const errores = (c.erroresSeguidos ?? 0) + 1;
    await anotar(admin, c, { ultimoError: msg.slice(0, 300), erroresSeguidos: errores, ...(errores >= 3 || e instanceof CertificadoInvalido ? { estado: "ERROR" } : {}) });
    return { hecha: false, error: msg, ...r };
  } finally {
    await registrarUsos(admin, workspaceId, usos, o.userId ?? null);
  }
}

// ── Conectar / desconectar ───────────────────────────────────────────────────
export class ConexionRechazada extends Error {
  constructor(message: string) { super(message); this.name = "ConexionRechazada"; }
}

// Guarda el certificado SOLO si la DEHú lo acepta: una primera consulta real lo prueba.
export async function conectarDehu(admin: Admin, o: { workspaceId: string; p12: Buffer; clave: string; entorno: Entorno; userId: string }): Promise<EstadoDehuAutomatica> {
  if (!bovedaDisponible()) throw new ConexionRechazada("La DEHú automática aún no está disponible en este servidor.");
  const { migracion } = await leerConexion(admin, o.workspaceId);
  if (!migracion) throw new ConexionRechazada(ERROR_MIGRACION_DEHU_AUTO);
  let cert: CertificadoLeido;
  try { cert = leerCertificado(o.p12, o.clave); }
  catch (e) { throw new ConexionRechazada(e instanceof Error ? e.message : "El certificado no es válido."); }

  const usos: UsoDehu[] = [];
  const ahora = new Date();
  let envios: EnvioDehu[];
  try {
    envios = await pendientes(new ClienteDehu(cert, o.entorno, (u) => usos.push(u)), cert.titular.nif, new Date(ahora.getTime() - DIAS_PENDIENTES * 86_400_000), ahora);
  } catch (e) {
    await registrarUsos(admin, o.workspaceId, usos, o.userId);
    const motivo = e instanceof Error ? e.message : String(e);
    throw new ConexionRechazada(`La DEHú no acepta este certificado todavía (${motivo}). Comprueba que lo diste de alta como «Gran Destinatario» en la DEHú.`);
  }

  const fila = {
    workspaceId: o.workspaceId, estado: "ACTIVA", entorno: o.entorno,
    certificadoCifrado: cifrarParaDespacho(o.p12, o.workspaceId, "certificado"),
    claveCifrada: cifrarParaDespacho(Buffer.from(o.clave, "utf8"), o.workspaceId, "clave"),
    titularNombre: cert.titular.nombre, titularNif: cert.titular.nif, receptorNombre: cert.receptor.nombre, receptorNif: cert.receptor.nif,
    certTipo: cert.tipo, certEmisor: cert.emisor, certSerie: cert.serie, certCaducaAt: cert.caducaAt.toISOString(),
    ultimaConsultaAt: ahora.toISOString(), ultimoExitoAt: ahora.toISOString(), ultimoError: null, erroresSeguidos: 0,
    creadoPorId: o.userId, updatedAt: ahora.toISOString(),
  };
  const { conexion: previa } = await leerConexion(admin, o.workspaceId);
  const up = previa
    ? await admin.from("DehuConexion").update(fila).eq("id", previa.id)
    : await admin.from("DehuConexion").insert({ id: uuid(), ...fila });
  if (up.error) throw new Error(faltaTabla(up.error.message) ? ERROR_MIGRACION_DEHU_AUTO : up.error.message);
  await registrarUsos(admin, o.workspaceId, [...usos, { operacion: "Conexion", identificador: null, ok: true, codigo: null, detalle: `Certificado ${cert.tipo} de ${cert.receptor.nombre}, caduca el ${cert.caducaAt.toISOString().slice(0, 10)}`, ms: 0 }], o.userId);

  // Lo pendiente que ya ha visto la prueba entra enseguida en la bandeja.
  const { conexion } = await leerConexion(admin, o.workspaceId);
  if (conexion) await guardarPendientes(admin, conexion, envios, { nuevas: 0, importadas: 0, otras: 0, cerradas: 0 }).catch((e) => console.error("[dehu auto] primeros avisos:", e));
  return estadoDehuAutomatica(admin, o.workspaceId);
}

export async function desconectarDehu(admin: Admin, workspaceId: string, userId: string): Promise<void> {
  const { error } = await admin.from("DehuConexion").delete().eq("workspaceId", workspaceId);
  if (error && !faltaTabla(error.message)) throw new Error(error.message);
  await registrarUsos(admin, workspaceId, [{ operacion: "Desconexion", identificador: null, ok: true, codigo: null, detalle: "Certificado retirado y borrado por el despacho", ms: 0 }], userId);
}

// ── Abrir desde Aproba (comparecencia) ───────────────────────────────────────
export class AperturaImposible extends Error {
  constructor(message: string) { super(message); this.name = "AperturaImposible"; }
}

// Solo tras el «sí» explícito de un miembro en la pantalla (el aviso legal va allí).
export async function abrirNotificacionDehu(admin: Admin, o: { workspaceId: string; notificacionId: string; userId: string; userNombre: string }): Promise<{ fila: NotificacionDehu | null; avisoId: string; sinLectura: boolean }> {
  const { data: n, error } = await admin.from("NotificacionDehu").select("id, workspaceId, origen, estado, tipo, aviso, expedienteId")
    .eq("id", o.notificacionId).eq("workspaceId", o.workspaceId).maybeSingle();
  if (error) throw new Error(faltaMigracionDehu(error.message) ? ERROR_MIGRACION_DEHU_AUTO : error.message);
  if (!n || n.origen !== "LEMA" || n.tipo !== "AVISO") throw new AperturaImposible("Esta notificación no llegó por la DEHú automática.");
  if (n.estado !== "PENDIENTE" && n.estado !== "VINCULADA") throw new AperturaImposible("Esta notificación ya está gestionada.");
  const aviso = (n.aviso ?? {}) as Record<string, unknown>;
  if (aviso.estadoDehu === "EXPIRADA") throw new AperturaImposible("La DEHú ya la da por expirada: no se puede abrir.");
  const identificador = typeof aviso.identificador === "string" ? aviso.identificador : null;
  const codigoOrigen = aviso.codigoOrigen !== undefined && aviso.codigoOrigen !== null ? String(aviso.codigoOrigen) : null;
  if (!identificador || !codigoOrigen) throw new AperturaImposible("Faltan los datos de la DEHú de esta notificación.");

  const { conexion: c } = await leerConexion(admin, o.workspaceId);
  if (!c) throw new AperturaImposible("La DEHú automática no está conectada.");
  const usos: UsoDehu[] = [];
  const ahora = new Date().toISOString();
  try {
    const cert = certificadoDe(c);
    const cliente = new ClienteDehu(cert, c.entorno, (u) => usos.push(u));
    const d = await cliente.peticionAcceso({ identificador, codigoOrigen, concepto: typeof aviso.concepto === "string" ? aviso.concepto : "Notificación" });
    // Desde aquí la notificación ESTÁ abierta, llegue o no el documento: se anota ya.
    const abierta = { ...aviso, abiertaAt: d.fecha ?? ahora, abiertaPor: o.userId, estadoDehu: "ACEPTADA" };
    await admin.from("NotificacionDehu").update({ aviso: abierta, updatedAt: ahora }).eq("id", n.id);
    if (!d.documento?.bytes?.length) {
      throw new AperturaImposible(`La notificación se ha abierto, pero la DEHú no ha entregado el documento${d.descripcion ? ` (${d.descripcion})` : ""}. Descárgalo desde la DEHú; Aproba lo volverá a intentar en la próxima consulta.`);
    }
    let fila: NotificacionDehu | null = null;
    let sinLectura = false;
    try {
      const imp = await importarNotificacion(admin, {
        workspaceId: o.workspaceId, buffer: d.documento.bytes, mime: d.documento.mime || "application/pdf",
        nombre: d.documento.nombre || `notificacion-${identificador}.pdf`, creadoPorId: o.userId, siNoEs: "ignorar",
        fechaNotificacion: diaMadrid(d.fecha ?? ahora), expedienteVinculado: (n.expedienteId as string | null) ?? null,
      });
      fila = imp.fila;
    } catch (e) {
      // Sin IA ahora mismo: el documento se trae en la próxima consulta (ya está abierta).
      if (!(e instanceof IaNoDisponible)) throw e;
      sinLectura = true;
    }
    if (fila) {
      await admin.from("NotificacionDehu").update({
        estado: "GESTIONADA", gestionadaAt: ahora, gestionadaPor: `${o.userNombre} (abierta desde Aproba)`,
        aviso: { ...abierta, documentoId: fila.id, cerradaPor: fila.id }, updatedAt: ahora,
      }).eq("id", n.id);
    }
    return { fila, avisoId: n.id as string, sinLectura };
  } catch (e) {
    if (e instanceof CertificadoInvalido) throw new AperturaImposible(e.message);
    if (e instanceof ErrorDehu) throw new AperturaImposible(`La DEHú no ha podido abrirla: ${e.message}`);
    throw e;
  } finally {
    await registrarUsos(admin, o.workspaceId, usos, o.userId);
  }
}

export async function leerNotificacion(admin: Admin, id: string): Promise<NotificacionDehu | null> {
  const { data } = await admin.from("NotificacionDehu").select(COLS_NOTIFICACION).eq("id", id).maybeSingle();
  return data ? mapFilaNotificacion(data as Record<string, unknown>) : null;
}

// Despachos con la DEHú automática activa (para el cron de cada mañana).
export async function despachosConDehu(admin: Admin): Promise<string[]> {
  const { data, error } = await admin.from("DehuConexion").select("workspaceId").neq("estado", "PAUSADA").limit(500);
  if (error) return [];
  return ((data ?? []) as { workspaceId: string }[]).map((x) => x.workspaceId);
}
