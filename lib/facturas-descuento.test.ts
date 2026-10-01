import { describe, expect, it } from "vitest";
import { descuentoDeLineas, desgloseConDescuento, importesRectificativa, lineaDescuento, lineasDeCuerpo, totalesFactura } from "./facturas";
import { construirAlta } from "./verifactu";

// DESCUENTO EN LA FACTURA — Luis (Asenjo), 01/10/2026: «el precio del servicio es 515, le
// aplicamos un descuento (en este caso del 15 %, aunque podría ser una cantidad determinada
// no sujeta a porcentaje), para que luego minore la base imponible». Su factura AGC 0272:
// Subtotal sin IVA 515,00 · Descuento 15 % 77,25 · Base imponible 437,75 · IVA 91,93 · Total 529,68.
const servicio = { concepto: "Certificado de registro de ciudadano de la UE", base: 515 };

describe("la línea del descuento", () => {
  it("15 % sobre 515 → −77,25, y la factura de Luis cuadra al céntimo", () => {
    const d = lineaDescuento({ concepto: "Descuento", modo: "PORCENTAJE", valor: 15 }, 515);
    expect(d).toEqual({ concepto: "Descuento 15 %", base: -77.25 });
    expect(totalesFactura([servicio, d!])).toEqual({ base: 437.75, iva: 91.93, suplidosTotal: 0, total: 529.68 });
  });
  it("una cantidad fija, sin porcentaje", () => {
    const d = lineaDescuento({ concepto: "Descuento cliente habitual", modo: "IMPORTE", valor: 50 }, 515);
    expect(d).toEqual({ concepto: "Descuento cliente habitual", base: -50 });
    expect(totalesFactura([servicio, d!]).base).toBe(465);
  });
  it("los suplidos no se descuentan ni llevan IVA", () => {
    const d = lineaDescuento({ concepto: "Descuento", modo: "PORCENTAJE", valor: 15 }, 515)!;
    expect(totalesFactura([servicio, d], [{ concepto: "Tasa 790-012", importe: 12 }])).toEqual({ base: 437.75, iva: 91.93, suplidosTotal: 12, total: 541.68 });
  });
  it("decimales en el %, y nunca por encima del subtotal", () => {
    expect(lineaDescuento({ concepto: "Descuento", modo: "PORCENTAJE", valor: 12.5 }, 515)).toEqual({ concepto: "Descuento 12,5 %", base: -64.38 });
    expect(lineaDescuento({ concepto: "Descuento", modo: "IMPORTE", valor: 900 }, 515)?.base).toBe(-515);
    expect(lineaDescuento({ concepto: "Descuento", modo: "PORCENTAJE", valor: 150 }, 515)?.base).toBe(-515);
  });
  it("sin valor, o sin honorarios, no hay línea", () => {
    expect(lineaDescuento({ concepto: "Descuento", modo: "PORCENTAJE", valor: 0 }, 515)).toBeNull();
    expect(lineaDescuento({ concepto: "Descuento", modo: "IMPORTE", valor: 20 }, 0)).toBeNull();
    expect(lineaDescuento(null, 515)).toBeNull();
  });
  it("sin concepto, «Descuento»; un concepto largo se recorta", () => {
    expect(lineaDescuento({ concepto: "  ", modo: "IMPORTE", valor: 10 }, 515)?.concepto).toBe("Descuento");
    expect(lineaDescuento({ concepto: "x".repeat(200), modo: "IMPORTE", valor: 10 }, 515)?.concepto).toHaveLength(60);
  });
});

describe("al editar una factura con descuento", () => {
  it("«Descuento 15 %» vuelve a ser un 15 % y sale de las líneas", () => {
    expect(descuentoDeLineas([servicio, { concepto: "Descuento 15 %", base: -77.25 }])).toEqual({
      lineas: [servicio], descuento: { concepto: "Descuento", modo: "PORCENTAJE", valor: 15 },
    });
  });
  it("el «Descuento familiar (15%)» de la factura familiar también", () => {
    const r = descuentoDeLineas([{ concepto: "Ana", base: 300 }, { concepto: "Omar", base: 300 }, { concepto: "Descuento familiar (15%)", base: -90 }]);
    expect(r.descuento).toEqual({ concepto: "Descuento familiar", modo: "PORCENTAJE", valor: 15 });
    expect(r.lineas).toHaveLength(2);
  });
  it("si el % no da el importe guardado, se conserva el importe tal cual", () => {
    expect(descuentoDeLineas([servicio, { concepto: "Descuento 15 %", base: -50 }]).descuento).toEqual({ concepto: "Descuento 15 %", modo: "IMPORTE", valor: 50 });
  });
  it("editar y volver a guardar no cambia ni un céntimo", () => {
    const guardadas = [servicio, { concepto: "Descuento 12,5 %", base: -64.38 }];
    const { lineas, descuento } = descuentoDeLineas(guardadas);
    expect([...lineas, lineaDescuento(descuento, 515)!]).toEqual(guardadas);
  });
  it("sin línea negativa, nada que tocar", () => {
    expect(descuentoDeLineas([servicio])).toEqual({ lineas: [servicio], descuento: null });
  });
});

describe("lo que acepta el servidor", () => {
  it("líneas con concepto e importe ≠ 0, redondeadas; el descuento pasa", () => {
    expect(lineasDeCuerpo([servicio, { concepto: " Descuento 15 % ", base: -77.25 }, { concepto: "", base: 10 }, { concepto: "Cero", base: 0 }, { concepto: "Texto", base: "abc" }, null]))
      .toEqual([servicio, { concepto: "Descuento 15 %", base: -77.25 }]);
  });
  it("un descuento sin honorarios no es una factura", () => {
    expect(lineasDeCuerpo([{ concepto: "Descuento", base: -10 }])).toEqual([]);
    expect(lineasDeCuerpo("nada")).toEqual([]);
  });
});

describe("en el papel", () => {
  const d = { concepto: "Descuento 15 %", base: -77.25 };
  it("honorarios en la tabla; el descuento, entre el subtotal y la base", () => {
    expect(desgloseConDescuento([servicio, d])).toEqual({ honorarios: [servicio], descuentos: [d], subtotal: 515 });
  });
  it("sin descuento, o en una rectificativa, como siempre", () => {
    expect(desgloseConDescuento([servicio])).toBeNull();
    expect(desgloseConDescuento([servicio, d], true)).toBeNull();
  });
});

describe("rectificativa y VERI*FACTU", () => {
  it("la rectificativa devuelve el descuento en positivo y abona exactamente la base", () => {
    const r = importesRectificativa({ baseImponible: 437.75, iva: 91.93, total: 529.68, lineas: [servicio, { concepto: "Descuento 15 %", base: -77.25 }] });
    expect(r.lineas).toEqual([{ concepto: servicio.concepto, base: -515 }, { concepto: "Descuento 15 %", base: 77.25 }]);
    expect(totalesFactura(r.lineas!)).toEqual({ base: -437.75, iva: -91.93, suplidosTotal: 0, total: -529.68 });
  });
  it("la AEAT recibe la base ya descontada", () => {
    const alta = construirAlta(
      { numero: "AGC0273.2026", concepto: servicio.concepto, base: 437.75, lineas: [servicio, { concepto: "Descuento 15 %", base: -77.25 }], suplidos: [], clienteDatos: null, fechaEmision: "2026-10-01T10:00:00Z" },
      { nif: "12345678Z", nombre: "Cliente de prueba" },
      { hoy: new Date("2026-10-01T10:00:00Z"), entorno: "test" },
    );
    expect(alta.ok).toBe(true);
    if (!alta.ok) return;
    expect(alta.payload.lineas).toEqual([{ base_imponible: "437.75", tipo_impositivo: "21", cuota_repercutida: "91.93" }]);
    expect(alta.payload.importe_total).toBe("529.68");
  });
});
