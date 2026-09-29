import "server-only";
import https from "node:https";
import type { CertificadoLeido } from "@/lib/dehu/certificado";
import {
  ACCION_SOAP, ENDPOINTS, ErrorDehu, cuerpoConsultaRealizadas, cuerpoLocaliza, cuerpoLocalizaRealizadas, cuerpoPeticionAcceso,
  elementoRespuesta, leerDocumento, leerLocaliza, leerLocalizaRealizadas, separarMultipart, servicioDe, sobreFirmado,
  type Entorno, type FiltroLocaliza, type Operacion, type RefEnvio, type RespuestaDocumento, type RespuestaLocaliza, type RespuestaLocalizaRealizadas,
} from "@/lib/dehu/soap";

// DEHú AUTOMÁTICA — las llamadas a la DEHú con el certificado del despacho (29/09/2026).
// Cada llamada se firma (WS-Security) y presenta además el certificado en TLS. El registro
// de usos lo lleva quien llama (lib/dehu/sincronizar.ts): aquí solo se informa de cada una.

export type UsoDehu = { operacion: Operacion; identificador: string | null; ok: boolean; codigo: string | null; detalle: string | null; ms: number };
const TIEMPO_MAX = 25_000;
const MAX_RESPUESTA = 40 * 1024 * 1024;

function post(url: string, accion: string, sobre: string, cert: CertificadoLeido): Promise<{ status: number; contentType: string; cuerpo: Buffer }> {
  return new Promise((resolve, reject) => {
    const cuerpo = Buffer.from(sobre, "utf8");
    const req = https.request(url, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"${accion}"`, "Content-Length": String(cuerpo.length), Accept: "text/xml, multipart/related" },
      key: cert.clavePrivadaPem, cert: cert.certificadoPem,
      timeout: TIEMPO_MAX,
    }, (res) => {
      const trozos: Buffer[] = [];
      let total = 0;
      res.on("data", (c: Buffer) => { total += c.length; if (total > MAX_RESPUESTA) { req.destroy(new ErrorDehu("La respuesta de la DEHú es demasiado grande.")); return; } trozos.push(c); });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, contentType: String(res.headers["content-type"] ?? ""), cuerpo: Buffer.concat(trozos) }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new ErrorDehu("La DEHú no responde (tiempo agotado).")));
    req.on("error", (e) => reject(e instanceof ErrorDehu ? e : new ErrorDehu(`No se pudo conectar con la DEHú: ${e.message}`)));
    req.end(cuerpo);
  });
}

export class ClienteDehu {
  constructor(
    private readonly cert: CertificadoLeido,
    private readonly entorno: Entorno,
    private readonly alUsar: (u: UsoDehu) => void = () => {},
  ) {}

  private async llamar(op: Operacion, cuerpo: string, identificador: string | null) {
    const t0 = Date.now();
    try {
      const sobre = sobreFirmado(cuerpo, this.cert);
      const r = await post(ENDPOINTS[this.entorno][servicioDe(op)], ACCION_SOAP[op], sobre, this.cert);
      const { xml, adjuntos } = separarMultipart(r.cuerpo, r.contentType);
      // Un error HTTP puede traer un SOAP Fault con el motivo: se lee antes de rendirse.
      let respuesta;
      try { respuesta = elementoRespuesta(xml); }
      catch (e) { throw r.status >= 400 && !(e instanceof ErrorDehu && /rechazó/.test(e.message)) ? new ErrorDehu(`La DEHú respondió con un error ${r.status}.`, null, r.status) : e; }
      return { respuesta, adjuntos, t0 };
    } catch (e) {
      const err = e instanceof ErrorDehu ? e : new ErrorDehu(e instanceof Error ? e.message : String(e));
      this.alUsar({ operacion: op, identificador, ok: false, codigo: err.codigo ?? (err.http ? String(err.http) : null), detalle: err.message.slice(0, 300), ms: Date.now() - t0 });
      throw err;
    }
  }

  private informar(op: Operacion, identificador: string | null, r: { codigo: string | null; descripcion: string | null }, t0: number, extra = "") {
    this.alUsar({ operacion: op, identificador, ok: true, codigo: r.codigo, detalle: `${r.descripcion ?? ""}${extra}`.trim().slice(0, 300) || null, ms: Date.now() - t0 });
  }

  async localiza(f: FiltroLocaliza): Promise<RespuestaLocaliza> {
    const { respuesta, t0 } = await this.llamar("Localiza", cuerpoLocaliza(f), null);
    const r = leerLocaliza(respuesta);
    this.informar("Localiza", null, r, t0, ` · ${r.envios.length} envío(s)${r.hayMas ? " (hay más)" : ""}`);
    return r;
  }

  async localizaRealizadas(f: FiltroLocaliza & { pagina?: number }): Promise<RespuestaLocalizaRealizadas> {
    const { respuesta, t0 } = await this.llamar("LocalizaRealizadas", cuerpoLocalizaRealizadas(f), null);
    const r = leerLocalizaRealizadas(respuesta);
    this.informar("LocalizaRealizadas", null, r, t0, ` · ${r.envios.length} envío(s), página ${r.paginaActual}/${r.totalPaginas}`);
    return r;
  }

  // ABRE la notificación: vale como comparecencia. Solo a petición expresa de un miembro.
  async peticionAcceso(ref: RefEnvio): Promise<RespuestaDocumento> {
    const { respuesta, adjuntos, t0 } = await this.llamar("PeticionAcceso", cuerpoPeticionAcceso(ref, this.cert.receptor), ref.identificador);
    const r = leerDocumento(respuesta, adjuntos);
    this.informar("PeticionAcceso", ref.identificador, r, t0);
    return r;
  }

  // El documento de una notificación ya abierta (por Aproba o en la DEHú): sin nuevo efecto.
  async consultaRealizadas(ref: RefEnvio): Promise<RespuestaDocumento> {
    const { respuesta, adjuntos, t0 } = await this.llamar("ConsultaRealizadas", cuerpoConsultaRealizadas(ref, this.cert.receptor), ref.identificador);
    const r = leerDocumento(respuesta, adjuntos);
    this.informar("ConsultaRealizadas", ref.identificador, r, t0);
    return r;
  }
}
