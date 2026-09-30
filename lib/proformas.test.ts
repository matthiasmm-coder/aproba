import { describe, expect, it } from "vitest";
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { calcularSiguiente } from "@/lib/factura-numero";
import { facturaToPdf } from "@/lib/export-pdf";
import { pdfDeProforma } from "@/lib/proformas-servidor";
import { importesDeCuerpo } from "@/lib/factura-manual";
import {
  AVISO_PROFORMA, cuerpoFacturaDeProforma, mapFilaProforma, proformaBorrable, proformaComoFactura, proformaViva, type Proforma,
} from "@/lib/proformas";

// 29/09/2026 — Juan (Gestoría Valencia) hacía sus proformas como facturas numeradas
// «PROFORMA»: contaban como emitidas y el número no se podía repetir. Una proforma es otro
// documento, con su serie, que se CONVIERTE en factura al cobrar.

const fila = (o: Record<string, unknown> = {}) => ({
  id: "p1", numero: "PRO-2026-0003", estado: "ENVIADA", clienteNombre: "Ahmed Benali", concepto: "Arraigo social",
  baseImponible: "450.00", iva: "94.50", total: "572.58", lineas: [{ concepto: "Arraigo social — honorarios", base: 450 }],
  suplidos: [{ concepto: "Tasa 790-052", importe: 28.08 }], notas: "Válida 30 días", clienteDatos: { documento: "NIE/DNI X1234567L", direccion: "C/ Colón 1 · 46004 Valencia" },
  clienteId: "c1", empresaId: null, retencionPct: null, retencion: null, emisorDatos: { nombre: "Gestoría Valencia", nif: "12345678Z", domicilio: null, email: null },
  oficinaId: "o1", expedienteId: null, fechaEmision: "2026-09-29T08:00:00Z", validaHasta: "2026-10-29T12:00:00Z",
  facturaId: null, enviadaAt: "2026-09-29T09:00:00Z", enviadaA: "ahmed@email.com", convertidaAt: null, createdAt: "2026-09-29T08:00:00Z", factura: null,
  ...o,
});

describe("proforma: lectura y reglas", () => {
  it("lee la fila (importes como números, fechas españolas, factura enlazada)", () => {
    const p = mapFilaProforma(fila({ estado: "CONVERTIDA", facturaId: "f9", factura: { numero: "2026-0045" } }));
    expect(p).toMatchObject({ numero: "PRO-2026-0003", estado: "CONVERTIDA", base: 450, iva: 94.5, total: 572.58, fecha: "29/09/2026", fechaIso: "2026-09-29", validaHasta: "29/10/2026", facturaNumero: "2026-0045" });
    expect(mapFilaProforma(fila({ estado: "RARO" })).estado).toBe("PENDIENTE");
  });

  it("se edita, envía o convierte mientras está viva; se borra solo si nunca salió del despacho", () => {
    expect(["PENDIENTE", "ENVIADA", "CONVERTIDA", "ANULADA"].map((e) => proformaViva(e as Proforma["estado"]))).toEqual([true, true, false, false]);
    expect(["PENDIENTE", "ENVIADA", "CONVERTIDA", "ANULADA"].map((e) => proformaBorrable(e as Proforma["estado"]))).toEqual([true, false, false, true]);
  });

  it("serie propia: PRO-AAAA-NNNN, independiente de la de facturas", () => {
    expect(calcularSiguiente(["PRO-2026-0001", "PRO-2026-0009"], 2026, "PRO")).toBe("PRO-2026-0010");
    expect(calcularSiguiente([], 2026, "PRO")).toBe("PRO-2026-0001");
    expect(calcularSiguiente(["2026-0044"], 2026)).toBe("2026-0045");
  });
});

describe("proforma → factura", () => {
  it("la factura lleva los mismos importes y el mismo receptor; sin número (lo pone la serie) ni las notas", () => {
    const b = cuerpoFacturaDeProforma(mapFilaProforma(fila()));
    expect(b).toEqual({
      oficinaId: "o1", cliente: "Ahmed Benali", concepto: "Arraigo social",
      avanzada: true, lineas: [{ concepto: "Arraigo social — honorarios", base: 450 }], suplidos: [{ concepto: "Tasa 790-052", importe: 28.08 }], notas: null,
      documento: "NIE/DNI X1234567L", direccion: "C/ Colón 1 · 46004 Valencia", clienteId: "c1", empresaId: null, retencionPct: null,
    });
    const imp = importesDeCuerpo(b);
    expect(imp.ok && [imp.baseImponible, imp.iva, imp.total]).toEqual([450, 94.5, 572.58]);
  });

  it("una proforma simple (sin líneas) sale como factura simple", () => {
    const b = cuerpoFacturaDeProforma(mapFilaProforma(fila({ lineas: null, suplidos: null, baseImponible: 150 })));
    expect(b.avanzada).toBeUndefined();
    expect(b.baseImponible).toBe(150);
    const imp = importesDeCuerpo(b);
    expect(imp.ok && [imp.baseImponible, imp.iva, imp.total]).toEqual([150, 31.5, 181.5]);
  });

  it("empresa como receptor, con retención", () => {
    const b = cuerpoFacturaDeProforma(mapFilaProforma(fila({ clienteId: null, empresaId: "e1", retencionPct: 15 })));
    expect([b.clienteId, b.empresaId, b.retencionPct]).toEqual([null, "e1", 15]);
    const imp = importesDeCuerpo(b);
    expect(imp.ok && imp.retencion).toBe(67.5);
  });

  it("importes: sin importe no hay documento", () => {
    expect(importesDeCuerpo({ baseImponible: 0 })).toMatchObject({ ok: false, status: 400 });
  });
});

describe("proforma: el documento", () => {
  async function textos(bytes: Uint8Array): Promise<string[]> {
    const doc = await PDFDocument.load(bytes);
    const c = doc.getPages()[0].node.Contents();
    const streams = c instanceof PDFArray ? c.asArray().map((r) => doc.context.lookup(r)) : [c];
    const src = streams.map((s) => Buffer.from(decodePDFRawStream(s as PDFRawStream).decode()).toString("latin1")).join("\n");
    return [...src.matchAll(/<([0-9A-F]*)> Tj/g)].map((m) => Buffer.from(m[1], "hex").toString("latin1"));
  }

  it("se pinta como una factura, pero dice que es una proforma, hasta cuándo vale y que no es una factura", async () => {
    const p = mapFilaProforma(fila());
    const f = proformaComoFactura(p);
    expect(f.vence).toBe("29/10/2026");
    const pdf = await facturaToPdf(f, { nombre: "Gestoría Valencia", nif: "12345678Z" }, { titulo: "FACTURA PROFORMA", etiquetaVence: "Válida hasta", aviso: AVISO_PROFORMA, pie: "Factura proforma" });
    const t = await textos(pdf);
    expect(t).toContain("FACTURA PROFORMA");
    expect(t).toContain("PRO-2026-0003");
    expect(t).toContain("Válida hasta: 29/10/2026");
    expect(t.join(" ")).toContain("Documento sin validez fiscal: no es una factura.");
    expect(t).toContain("Factura proforma");
    expect(t).not.toContain("FACTURA");
  });

  // 30/09/2026 — el PDF que recibe el cliente resuelve el emisor como la pantalla: la sede con
  // identidad propia (y su logo), y el emisor congelado al crear la proforma por encima.
  const adminFalso = (datos: Record<string, Record<string, unknown>>) => ({
    from: (tabla: string) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: datos[tabla] ?? null, error: null }) }) }) }),
  });
  const DESPACHO = { nombre: "Gestoría Ejemplo SL", nif: "B12345674", domicilio: "C/ Mayor 1, Madrid", domicilioActividad: null, emailFacturacion: "info@ejemplo.es", logoUrl: null };
  const SEDE = { razonSocial: "Laura Pérez Gil", nif: "12345678Z", domicilio: "C/ Mayor 1, 2º, Madrid", domicilioActividad: null, emailFacturacion: "laura@ejemplo.es", prefijoSerie: "LP", logoUrl: null };
  const pdfDe = async (p: Proforma, datos: Record<string, Record<string, unknown>>) =>
    (await textos(await pdfDeProforma(adminFalso(datos) as never, "ws1", p))).join(" ");

  it("PDF al cliente: el emisor es la sede con identidad fiscal propia, sin la marca de Aproba", async () => {
    const t = await pdfDe(mapFilaProforma(fila({ emisorDatos: null, oficinaId: "o1" })), { Workspace: DESPACHO, Oficina: SEDE });
    expect(t).toContain("Laura Pérez Gil");
    expect(t).toContain("12345678Z");
    expect(t).not.toContain("B12345674");
    expect(t).not.toContain("Aproba");
  });

  it("PDF al cliente: manda el emisor congelado al crear la proforma; sin sede, el despacho", async () => {
    const congelado = { nombre: "Laura Pérez Gil", nif: "12345678Z", domicilio: null, email: null };
    const t = await pdfDe(mapFilaProforma(fila({ emisorDatos: congelado, oficinaId: "o1" })), { Workspace: DESPACHO, Oficina: { ...SEDE, razonSocial: "Otro nombre posterior", nif: "87654321X" } });
    expect(t).toContain("Laura Pérez Gil");
    expect(t).not.toContain("87654321X");
    const d = await pdfDe(mapFilaProforma(fila({ emisorDatos: null, oficinaId: null })), { Workspace: DESPACHO });
    expect(d).toContain("Gestoría Ejemplo SL");
    expect(d).toContain("B12345674");
  });

  it("una factura normal sigue igual", async () => {
    const t = await textos(await facturaToPdf(proformaComoFactura(mapFilaProforma(fila({ numero: "2026-0045" }))), { nombre: "Gestoría", nif: null }));
    expect(t).toContain("FACTURA");
    expect(t.some((x) => x.startsWith("Vencimiento: "))).toBe(true);
    expect(t.join(" ")).not.toContain("sin validez fiscal");
  });
});
