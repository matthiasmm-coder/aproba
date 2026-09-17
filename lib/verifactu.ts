import { IVA, totalesFactura, type LineaFactura, type Suplido } from "@/lib/facturas";
import { paisIsoDeNacionalidad } from "@/lib/verifactu-paises";

// VERI*FACTU — capa PURA (sin red, sin base): construye el registro de alta que se manda a
// Verifacti a partir de una factura de Aproba, decide cómo se identifica al destinatario
// y traduce los estados de la AEAT. Todo lo que toca red o base vive en
// lib/verifactu-envio.ts (server-only). Reglas de negocio:
//   · F1 (factura completa) cuando el cliente se identifica: NIE/DNI/CIF → `nif`;
//     pasaporte → `id_otro` tipo 03 + país ISO de su nacionalidad.
//   · Sin identificación y total ≤ 400 € → F2 (factura simplificada, art. 6.1.d RD 1619/2012).
//     Por encima de 400 € NO se inventa nada: el registro queda BLOQUEADO con el motivo y
//     el gestor completa la ficha del cliente (la factura sigue emitida: el flujo del
//     despacho no se para por la AEAT).
//   · Honorarios = una línea S1 al 21 %; suplidos (tasas, sin IVA) = una línea N1 (no
//     sujeta) para que `importe_total` cuadre con el total impreso.
//   · La fecha de expedición es la de emisión de la factura (hora de Madrid); si el envío
//     se hace otro día, va marcado con `incidencia: "S"` como manda la Orden HAC/1177/2024.

export type TipoRegistro = "ALTA" | "ANULACION";
export type EstadoRegistro =
  | "PENDIENTE"            // aceptado por Verifacti, en cola hacia la AEAT
  | "CORRECTO"             // registrado en la AEAT
  | "ACEPTADO_CON_ERRORES" // la AEAT lo guardó pero señala errores → subsanar o rectificar
  | "INCORRECTO"           // rechazado por la AEAT
  | "DUPLICADO"            // ya existía un registro con (serie, número, fecha)
  | "ANULADO"              // anulación registrada correctamente
  | "NO_REGISTRADO"        // rechazado por la AEAT sin registro
  | "ERROR_ENVIO"          // Verifacti/red rechazaron la llamada: nada llegó a la AEAT, se reintenta
  | "BLOQUEADO";           // falta un dato del cliente: no se puede construir el registro

export const ESTADOS_ENVIADOS: EstadoRegistro[] = ["PENDIENTE", "CORRECTO", "ACEPTADO_CON_ERRORES", "INCORRECTO", "DUPLICADO", "ANULADO", "NO_REGISTRADO"];

export type EstadoMeta = { label: string; pill: string; tono: "ok" | "pendiente" | "problema" | "bloqueado" };
export const ESTADO_REGISTRO_META: Record<EstadoRegistro, EstadoMeta> = {
  PENDIENTE: { label: "Enviando a la AEAT", pill: "bg-amber-50 text-amber-700", tono: "pendiente" },
  CORRECTO: { label: "Registrada en la AEAT", pill: "bg-emerald-50 text-emerald-700", tono: "ok" },
  ACEPTADO_CON_ERRORES: { label: "Aceptada con errores", pill: "bg-amber-100 text-amber-800", tono: "problema" },
  INCORRECTO: { label: "Rechazada por la AEAT", pill: "bg-rose-50 text-rose-700", tono: "problema" },
  DUPLICADO: { label: "Duplicada en la AEAT", pill: "bg-rose-50 text-rose-700", tono: "problema" },
  ANULADO: { label: "Anulación registrada", pill: "bg-slate-100 text-slate-600", tono: "ok" },
  NO_REGISTRADO: { label: "No registrada", pill: "bg-rose-50 text-rose-700", tono: "problema" },
  ERROR_ENVIO: { label: "Envío pendiente", pill: "bg-amber-50 text-amber-700", tono: "problema" },
  BLOQUEADO: { label: "Falta un dato del cliente", pill: "bg-amber-50 text-amber-700", tono: "bloqueado" },
};

// Estado tal y como lo devuelve Verifacti (/status, /create, webhooks) → el nuestro.
export function mapEstadoVerifacti(estado: string | null | undefined): EstadoRegistro {
  const e = String(estado ?? "").trim().toLowerCase();
  if (!e || e === "pendiente" || e.startsWith("error servidor")) return "PENDIENTE"; // la AEAT falló: Verifacti reintenta
  if (e === "correcto" || e === "correcta") return "CORRECTO";
  if (e.startsWith("aceptad")) return "ACEPTADO_CON_ERRORES";
  if (e === "incorrecto" || e === "incorrecta" || e.startsWith("factura inexistente")) return "INCORRECTO";
  if (e === "duplicado" || e === "duplicada") return "DUPLICADO";
  if (e === "anulado" || e === "anulada") return "ANULADO";
  if (e.startsWith("no registrad")) return "NO_REGISTRADO";
  return "PENDIENTE";
}

// ── Identificación fiscal ────────────────────────────────────────────────────
export const normalizarNif = (s: string | null | undefined) => String(s ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
const LETRAS = "TRWAGMYFPDXBNJZSQVHLCKE";
export function esDniValido(v: string): boolean {
  const m = /^(\d{8})([A-Z])$/.exec(v);
  return Boolean(m) && LETRAS[Number(m![1]) % 23] === m![2];
}
export function esNieValido(v: string): boolean {
  const m = /^([XYZ])(\d{7})([A-Z])$/.exec(v);
  if (!m) return false;
  const n = Number(({ X: "0", Y: "1", Z: "2" } as Record<string, string>)[m[1]] + m[2]);
  return LETRAS[n % 23] === m[3];
}
export const esCifFormato = (v: string) => /^[ABCDEFGHJKLMNPQRSUVW]\d{7}[0-9A-J]$/.test(v);
// NIF español aceptable como `nif` del destinatario (DNI/NIE con letra correcta, o CIF).
export function nifEspanolValido(s: string | null | undefined): string | null {
  const v = normalizarNif(s);
  if (!v) return null;
  return esDniValido(v) || esNieValido(v) || esCifFormato(v) ? v : null;
}

// ── Fechas (hora de Madrid) ──────────────────────────────────────────────────
export function fechaMadrid(d: Date): string {
  // yyyy-mm-dd del instante en Europe/Madrid (una factura emitida a las 23:30 es de ese día).
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}
export const ddmmyyyy = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}-${m}-${y}`; };

// ── Registro de alta ─────────────────────────────────────────────────────────
export type LineaVerifacti = { base_imponible: string; tipo_impositivo?: string; cuota_repercutida?: string; calificacion_operacion?: "S1" | "N1"; impuesto?: "01" };
export type IdOtro = { codigo_pais: string; id_type: "03" | "07"; id: string };
export type PayloadAlta = {
  serie: string; numero: string; fecha_expedicion: string; fecha_operacion?: string;
  tipo_factura: "F1" | "F2"; descripcion: string; lineas: LineaVerifacti[]; importe_total: string;
  nif?: string; id_otro?: IdOtro; nombre?: string; validar_destinatario?: boolean; incidencia?: "S";
  especial?: { factura_sin_identif_destinatario_art_61d: "S" };
};
export type IdentidadDestinatario = {
  nombre: string;
  nif?: string | null;          // NIE / DNI / CIF
  pasaporte?: string | null;
  nacionalidad?: string | null; // texto libre de la ficha → país ISO
};
export type FacturaRegistrable = {
  numero: string; fechaEmision: string | null; concepto: string; base: number;
  lineas?: LineaFactura[] | null; suplidos?: Suplido[] | null;
  clienteDatos?: { documento?: string } | null;
};
export type CodigoBloqueo = "SIN_IDENTIFICACION" | "PAIS_DESCONOCIDO" | "IMPORTE" | "NUMERO";
export type ResultadoAlta =
  // `fechaExpedicion` (yyyy-mm-dd) es la que queda registrada; `reexpedida` avisa de que
  // difiere de la fecha de emisión guardada (envío en un día posterior).
  | { ok: true; payload: PayloadAlta; identificacion: "nif" | "pasaporte" | "simplificada"; fechaExpedicion: string; reexpedida: boolean }
  | { ok: false; codigo: CodigoBloqueo; motivo: string };

export const LIMITE_SIMPLIFICADA = 400; // € (art. 4 RD 1619/2012)
const fmt = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const compacta = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);

// El snapshot fiscal impreso en la factura («NIE/DNI X…», «Pasaporte …», «CIF/NIF B…»)
// sirve de identificación cuando la factura no está ligada a una ficha de cliente.
export function identidadDesdeSnapshot(documento: string | null | undefined): { nif?: string; pasaporte?: string } {
  const d = String(documento ?? "").trim();
  let m = /^(?:NIE\/DNI|CIF\/NIF|NIF\/CIF|NIF|NIE|DNI|CIF)\s+(.+)$/i.exec(d);
  if (m) return { nif: m[1].trim() };
  m = /^Pasaporte\s+(.+)$/i.exec(d);
  if (m) return { pasaporte: m[1].trim() };
  return {};
}

export function construirAlta(
  f: FacturaRegistrable,
  dest: IdentidadDestinatario,
  opts: { hoy: Date; entorno: "test" | "prod"; incidencia?: boolean },
): ResultadoAlta {
  const numero = String(f.numero ?? "").trim();
  if (!numero) return { ok: false, codigo: "NUMERO", motivo: "La factura no tiene número." };
  if (numero.length > 60) return { ok: false, codigo: "NUMERO", motivo: "El número de factura supera los 60 caracteres que admite la AEAT." };

  const lineas = f.lineas?.length ? f.lineas : [{ concepto: f.concepto, base: f.base }];
  const { base, iva, suplidosTotal, total } = totalesFactura(lineas, f.suplidos ?? []);
  if (base < 0 || suplidosTotal < 0) return { ok: false, codigo: "IMPORTE", motivo: "Importe negativo: una factura rectificativa se registra aparte (pendiente en Aproba)." };
  if (total <= 0) return { ok: false, codigo: "IMPORTE", motivo: "La factura no tiene importe." };
  const lineasV: LineaVerifacti[] = [];
  if (base > 0) lineasV.push({ base_imponible: fmt(base), tipo_impositivo: String(Math.round(IVA * 100)), cuota_repercutida: fmt(iva) });
  if (suplidosTotal > 0) lineasV.push({ base_imponible: fmt(suplidosTotal), calificacion_operacion: "N1" });

  // Identificación: NIF de la ficha → pasaporte de la ficha → snapshot impreso.
  const snap = identidadDesdeSnapshot(f.clienteDatos?.documento);
  const nif = nifEspanolValido(dest.nif) ?? nifEspanolValido(snap.nif);
  const pasaporte = compacta(String(dest.pasaporte ?? snap.pasaporte ?? ""), 20).replace(/\s+/g, "");
  const nombre = compacta(dest.nombre ?? "", 120) || "Cliente";
  // Verifacti exige que `fecha_expedicion` sea HOY (código vf-verifactu-fecha_expedicion_hoy):
  // bajo VERI*FACTU la expedición es el propio registro. Si la factura se emitió otro día
  // (envío fallido, ficha incompleta…), se registra hoy con `fecha_operacion` = día de la
  // emisión e `incidencia: S`, y el llamante actualiza la fecha impresa (reexpedida).
  const hoyIso = fechaMadrid(opts.hoy);
  const emisionIso = f.fechaEmision ? fechaMadrid(new Date(f.fechaEmision)) : hoyIso;
  const reexpedida = emisionIso !== hoyIso;
  const incidencia = Boolean(opts.incidencia) || emisionIso < hoyIso;
  const comun = {
    serie: "", numero, fecha_expedicion: ddmmyyyy(hoyIso),
    ...(emisionIso < hoyIso ? { fecha_operacion: ddmmyyyy(emisionIso) } : {}),
    descripcion: compacta(f.concepto ?? "", 500) || "Servicios profesionales",
    lineas: lineasV, importe_total: fmt(total),
    ...(incidencia ? { incidencia: "S" as const } : {}),
  };
  const okBase = { ok: true as const, fechaExpedicion: hoyIso, reexpedida };

  if (nif) {
    return { ...okBase, identificacion: "nif", payload: { ...comun, tipo_factura: "F1", nif, nombre, validar_destinatario: opts.entorno === "prod" } };
  }
  if (pasaporte) {
    const pais = paisIsoDeNacionalidad(dest.nacionalidad);
    if (!pais) {
      const nac = String(dest.nacionalidad ?? "").trim();
      return {
        ok: false, codigo: "PAIS_DESCONOCIDO",
        motivo: nac
          ? `El cliente se identifica con pasaporte y su nacionalidad «${nac}» no se reconoce como país. Corrige la nacionalidad en su ficha (p. ej. «Colombia»).`
          : "El cliente se identifica con pasaporte y su ficha no tiene nacionalidad. Rellénala para poder registrar la factura.",
      };
    }
    return { ...okBase, identificacion: "pasaporte", payload: { ...comun, tipo_factura: "F1", id_otro: { codigo_pais: pais, id_type: "03", id: pasaporte }, nombre } };
  }
  const malformado = normalizarNif(dest.nif ?? snap.nif);
  if (total <= LIMITE_SIMPLIFICADA) {
    return { ...okBase, identificacion: "simplificada", payload: { ...comun, tipo_factura: "F2", especial: { factura_sin_identif_destinatario_art_61d: "S" } } };
  }
  return {
    ok: false, codigo: "SIN_IDENTIFICACION",
    motivo: malformado
      ? `El documento del cliente («${malformado}») no es un NIE, DNI o CIF válido. Corrígelo en su ficha (o añade su pasaporte y nacionalidad).`
      : `Una factura de más de ${LIMITE_SIMPLIFICADA} € necesita identificar al cliente: añade su NIE/DNI, o su pasaporte y nacionalidad, en la ficha del cliente.`,
  };
}

// Registro de anulación: referencia al alta tal y como se registró.
export function construirAnulacion(reg: { serie: string; numero: string; fechaExpedicion: string }): { serie: string; numero: string; fecha_expedicion: string } {
  return { serie: reg.serie ?? "", numero: reg.numero, fecha_expedicion: ddmmyyyy(reg.fechaExpedicion.slice(0, 10)) };
}

// Clave de idempotencia por (factura, operación, intento): un reintento tras fallo de red
// replica la respuesta; un intento con payload distinto usa clave nueva (Verifacti → 422).
export const claveIdempotencia = (facturaId: string, tipo: TipoRegistro, intento: number) => `aproba-${tipo.toLowerCase()}-${facturaId}-${intento}`;

// Con un alta ENVIADA (aunque la AEAT aún no haya contestado) la factura es inmutable:
// cambiarla exigiría subsanación o rectificativa. BLOQUEADO/ERROR_ENVIO no llegaron a
// ningún sitio → se puede editar y se reenvía después.
export function registroBloqueaEdicion(reg: { tipo: string; estado: string } | null | undefined): boolean {
  return Boolean(reg && reg.tipo === "ALTA" && (ESTADOS_ENVIADOS as string[]).includes(reg.estado));
}

// Texto corto para la lista/ficha: qué pasa con esta factura respecto a la AEAT.
export function resumenRegistro(reg: { estado: EstadoRegistro; motivo?: string | null; mensajeError?: string | null } | null | undefined): string | null {
  if (!reg) return null;
  const meta = ESTADO_REGISTRO_META[reg.estado];
  if (reg.estado === "BLOQUEADO" || reg.estado === "ERROR_ENVIO") return reg.motivo || reg.mensajeError || meta.label;
  if (reg.estado === "INCORRECTO" || reg.estado === "ACEPTADO_CON_ERRORES" || reg.estado === "NO_REGISTRADO") return reg.mensajeError ? `${meta.label}: ${reg.mensajeError}` : meta.label;
  return meta.label;
}
