import { diasRestantes, plazoClave, urgenciaDe } from "@/lib/requerimientos";
import { TIPO_VENCIMIENTO_LABEL } from "@/lib/renovacion-servicio";
import { DIAS_PARA_ABRIR, type NotificacionDehu } from "@/lib/notificaciones-dehu";
import { ESTADO_REGISTRO_META, type EstadoRegistro } from "@/lib/verifactu";
import { HITOS_CANJE, type TipoPlazoCanje } from "@/lib/canje";

// LA CAMPANA (26/09/2026, Matthias): lo que el despacho no puede dejar pasar, en un solo
// sitio del encabezado, a la izquierda de «+ Nuevo expediente». Ninguna tabla nueva: dos
// fuentes leídas bajo la sesión (RLS: cada gestor ve lo de sus sedes) —
//  · Requerimiento: los pendientes que ya entraron en su «Avisarme (días antes)» o vencieron;
//  · Vencimiento (Vigía): la renovación por proponer, caducada o que caduca en 60 días (la
//    regla del KPI «Caducan pronto»), y la propuesta o el documento pedido que el cliente
//    lleva 7 días o más sin contestar.
// Una alerta pide un gesto HOY; lo que puede esperar sigue en su vista (filtro, Renovaciones).
// Desde el 28/09 también la DEHú (NotificacionDehu): el aviso sin abrir con sus 10 días
// naturales, la notificación importada sin vincular y el requerimiento aún sin registrar.
// Desde el 01/10 también VERI*FACTU: la factura que la AEAT rechazó o aceptó con errores, la
// que no se pudo enviar por un dato del cliente y la anulación rechazada (se corrigen desde
// la factura con «Reenviar a la AEAT»).
// Desde el 03/10 también el trámite que un cliente pidió desde su espacio y que nadie del
// despacho ha cogido aún (Jennifer: «una alerta cuando un cliente crea un expediente»), y los
// plazos del canje del permiso de conducir (lib/canje.ts: 6 meses, informe médico, caducidad).

export const DIAS_RENOVACION = 60;
export const DIAS_SIN_RESPUESTA = 7;

export type ReqFuente = { id: string; expedienteId: string; clienteNombre: string; asunto: string; fechaLimite: string; avisarDias: number };
export type VencFuente = { id: string; clienteNombre: string; tipo: string; dias: number; estado: string; propuestaAt: string | null; solicitadoAt: string | null };
export type NotifFuente = Pick<NotificacionDehu, "id" | "origen" | "estado" | "tipo" | "titularNombre" | "organismo" | "asunto" | "fechaLimite" | "requerimientoId">;
// Un registro VERI*FACTU que pide un gesto (lib/data/verifactu-alertas.ts).
export type VfFuente = { id: string; facturaId: string; numero: string; clienteNombre: string; tipo: string; estado: string };
// Un trámite pedido por el cliente desde su espacio (lib/data/solicitudes-cliente.ts).
export type SolFuente = { expedienteId: string; clienteNombre: string; servicios: string; creadoAt: string };
// Un plazo del canje que ya entró en su ventana de aviso (lib/data/canjes-alertas.ts).
export type CanjeFuente = { expedienteId: string; clienteNombre: string; tipo: TipoPlazoCanje; dias: number };

export type NivelAlerta = "critico" | "urgente" | "aviso";
export type Alerta = {
  clase: "requerimiento" | "notificacion" | "renovacion" | "sin_respuesta" | "verifactu" | "solicitud" | "canje";
  id: string;
  href: string;
  cliente: string;
  detalle: string;                       // lo que piden (requerimiento) o el documento (TIE, Pasaporte…)
  plazo: { clave: string; n: number };   // clave traducible + número (como plazoClave)
  nivel: NivelAlerta;                    // color: rojo / ámbar intenso / ámbar
  orden: number;                         // menor = más arriba
};

const RANGO: Record<NivelAlerta, number> = { critico: 0, urgente: 1, aviso: 2 };
const CLASE: Record<Alerta["clase"], number> = { requerimiento: 0, notificacion: 1, verifactu: 2, renovacion: 3, sin_respuesta: 4, solicitud: 5, canje: 6 };
// Lo crítico arriba (y, dentro de cada nivel, requerimientos antes que renovaciones); luego
// lo que antes vence. Los días se desplazan para que un vencido (negativo) ordene bien.
const orden = (nivel: NivelAlerta, clase: Alerta["clase"], dias: number) =>
  RANGO[nivel] * 100_000 + CLASE[clase] * 10_000 + Math.max(0, Math.min(9_999, dias + 5_000));

// La caducidad en palabras, partida en clave traducible + número (como plazoClave).
export function plazoCaducidad(dias: number): { clave: string; n: number } {
  if (dias < -1) return { clave: "Caducó hace {n} días", n: -dias };
  if (dias === -1) return { clave: "Caducó ayer", n: 1 };
  if (dias === 0) return { clave: "Caduca hoy", n: 0 };
  if (dias === 1) return { clave: "Caduca mañana", n: 1 };
  return { clave: "Caduca en {n} días", n: dias };
}

// Qué es cada plazo del canje, en la campana (texto traducible; la caducidad, con plazoCaducidad).
export const DETALLE_CANJE: Record<TipoPlazoCanje, string> = {
  seis_meses: "Permiso válido para conducir (6 meses)",
  informe: "Informe médico del canje (90 días)",
  caducidad: "Permiso extranjero en vigor",
};

export function construirAlertas(reqs: ReqFuente[], vencs: VencFuente[], hoy: Date = new Date(), notifs: NotifFuente[] = [], vfs: VfFuente[] = [], sols: SolFuente[] = [], canjes: CanjeFuente[] = []): Alerta[] {
  const out: Alerta[] = [];

  // Canje: desde el primer hito de cada plazo (30 días; 15 el informe médico) hasta que el
  // plazo deja de contar (permiso entregado, solicitud presentada, expediente resuelto).
  for (const c of canjes) {
    if (c.dias > Math.max(...HITOS_CANJE[c.tipo])) continue;
    const nivel: NivelAlerta = c.dias <= 0 ? "critico" : c.dias <= 7 ? "urgente" : "aviso";
    out.push({
      clase: "canje", id: `canje-${c.expedienteId}-${c.tipo}`, href: `/app/expedientes/${c.expedienteId}#canje`,
      cliente: c.clienteNombre, detalle: DETALLE_CANJE[c.tipo], plazo: plazoCaducidad(c.dias), nivel,
      orden: orden(nivel, "canje", c.dias),
    });
  }

  // Trámite pedido por el cliente: un aviso (no vence nada), hasta que alguien lo coge.
  for (const s of sols) {
    const hace = Math.max(0, -diasRestantes(s.creadoAt, hoy));
    out.push({
      clase: "solicitud", id: `sol-${s.expedienteId}`, href: `/app/expedientes/${s.expedienteId}`,
      cliente: s.clienteNombre, detalle: s.servicios,
      plazo: hace === 0 ? { clave: "Pedido hoy por el cliente", n: 0 } : hace === 1 ? { clave: "Pedido ayer por el cliente", n: 1 } : { clave: "Pedido por el cliente hace {n} días", n: hace },
      nivel: "aviso", orden: orden("aviso", "solicitud", -hace),
    });
  }

  // VERI*FACTU: rechazada o no registrada = crítico (la factura no consta en la AEAT); con
  // errores, sin un dato del cliente o con el envío parado = urgente.
  for (const v of vfs) {
    const meta = ESTADO_REGISTRO_META[v.estado as EstadoRegistro];
    if (!meta) continue;
    const nivel: NivelAlerta = v.estado === "INCORRECTO" || v.estado === "NO_REGISTRADO" || v.estado === "DUPLICADO" ? "critico" : "urgente";
    out.push({
      clase: "verifactu", id: `vf-${v.id}`, href: `/app/facturas/${v.facturaId}`,
      cliente: v.clienteNombre || v.numero, detalle: `${v.tipo === "ANULACION" ? "Anulación de la factura" : "Factura"} ${v.numero}`,
      plazo: { clave: meta.label, n: 0 }, nivel, orden: orden(nivel, "verifactu", 0),
    });
  }

  for (const n of notifs) {
    if (n.estado !== "PENDIENTE" && n.estado !== "VINCULADA") continue;
    const base = { clase: "notificacion" as const, id: `dehu-${n.id}`, href: "/app/dehu", cliente: n.titularNombre ?? n.organismo ?? "DEHú", detalle: n.asunto ?? n.organismo ?? "" };
    if (n.tipo === "VERIFICACION") {
      if (n.estado === "PENDIENTE") out.push({ ...base, cliente: "DEHú", detalle: "", plazo: { clave: "Verifica tu dirección de avisos", n: 0 }, nivel: "urgente", orden: orden("urgente", "notificacion", 0) });
      continue;
    }
    if (n.tipo === "AVISO") {
      // Sin abrir en la DEHú: a los 10 días naturales se da por rechazada.
      const d = n.fechaLimite ? diasRestantes(n.fechaLimite, hoy) : DIAS_PARA_ABRIR;
      const nivel: NivelAlerta = d <= 1 ? "critico" : d <= 4 ? "urgente" : "aviso";
      const plazo = d < 0 ? { clave: "Sin abrir · plazo vencido", n: -d } : d === 0 ? { clave: "Ábrela hoy", n: 0 } : d === 1 ? { clave: "Ábrela mañana como tarde", n: 1 } : { clave: "Quedan {n} días para abrirla", n: d };
      out.push({ ...base, plazo, nivel, orden: orden(nivel, "notificacion", d) });
      continue;
    }
    // PDF: sin vincular, o requerimiento vinculado que aún no se ha registrado.
    if (n.estado === "VINCULADA" && (n.tipo !== "REQUERIMIENTO" || n.requerimientoId)) continue;
    const d = n.fechaLimite ? diasRestantes(n.fechaLimite, hoy) : null;
    const nivel: NivelAlerta = d === null ? "aviso" : d <= 0 ? "critico" : d <= 3 ? "urgente" : "aviso";
    const plazo = d === null || !n.fechaLimite
      ? { clave: n.estado === "PENDIENTE" ? "Sin vincular" : "Sin registrar", n: 0 }
      : plazoClave({ estado: "PENDIENTE", fechaLimite: n.fechaLimite, avisarDias: 3 }, hoy);
    out.push({ ...base, plazo, nivel, orden: orden(nivel, "notificacion", d ?? 999) });
  }

  for (const r of reqs) {
    const base = { estado: "PENDIENTE" as const, fechaLimite: r.fechaLimite, avisarDias: r.avisarDias };
    const u = urgenciaDe(base, hoy);
    if (u !== "VENCIDO" && u !== "HOY" && u !== "URGENTE" && u !== "PROXIMO") continue; // aún con tiempo
    const nivel: NivelAlerta = u === "VENCIDO" || u === "HOY" ? "critico" : u === "URGENTE" ? "urgente" : "aviso";
    out.push({
      clase: "requerimiento", id: `req-${r.id}`, href: `/app/expedientes/${r.expedienteId}#requerimientos`,
      cliente: r.clienteNombre, detalle: r.asunto, plazo: plazoClave(base, hoy), nivel,
      orden: orden(nivel, "requerimiento", diasRestantes(r.fechaLimite, hoy)),
    });
  }

  for (const v of vencs) {
    const doc = TIPO_VENCIMIENTO_LABEL[String(v.tipo).toUpperCase()] ?? v.tipo;
    if ((v.estado === "PENDIENTE" || v.estado === "AVISADO") && v.dias <= DIAS_RENOVACION) {
      const nivel: NivelAlerta = v.dias < 0 ? "critico" : v.dias <= 30 ? "urgente" : "aviso";
      out.push({
        clase: "renovacion", id: `ren-${v.id}`, href: "/app/vencimientos",
        cliente: v.clienteNombre, detalle: doc, plazo: plazoCaducidad(v.dias), nivel,
        orden: orden(nivel, "renovacion", v.dias),
      });
      continue;
    }
    if (v.estado === "PROPUESTA" || v.estado === "SOLICITADO") {
      const desde = v.estado === "PROPUESTA" ? v.propuestaAt : v.solicitadoAt;
      if (!desde) continue;
      const transcurridos = -diasRestantes(desde, hoy);
      if (transcurridos < DIAS_SIN_RESPUESTA) continue;
      out.push({
        clase: "sin_respuesta", id: `sr-${v.id}`, href: "/app/vencimientos",
        cliente: v.clienteNombre, detalle: doc,
        plazo: { clave: v.estado === "PROPUESTA" ? "Propuesta sin respuesta · {n} días" : "Documento pedido sin respuesta · {n} días", n: transcurridos },
        nivel: "aviso", orden: orden("aviso", "sin_respuesta", -transcurridos),
      });
    }
  }

  return out.sort((a, b) => a.orden - b.orden);
}
