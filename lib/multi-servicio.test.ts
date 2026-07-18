import { describe, expect, it } from "vitest";
import { aplicarDescuento, asignacionValida, descuentoValido, etiquetaDescuento, miembrosDeServicio, restoPendiente, suplidosAsignados, tarifaAsignada } from "./multi-servicio";
import type { Servicio } from "./servicios";

// Invariante central del descuento: anticipo + resto == bruto − rebaja AL CÉNTIMO,
// en todas las combinaciones (el realineado de facturas compara totales exactos).

describe("descuentoValido", () => {
  it("acepta porcentaje 1-100 y rechaza fuera de rango", () => {
    expect(descuentoValido({ tipo: "PORCENTAJE", valor: 10 })).toEqual({ tipo: "PORCENTAJE", valor: 10 });
    expect(descuentoValido({ tipo: "PORCENTAJE", valor: 0 })).toBeNull();
    expect(descuentoValido({ tipo: "PORCENTAJE", valor: 101 })).toBeNull();
  });
  it("redondea el importe y rechaza los que quedan en 0", () => {
    expect(descuentoValido({ tipo: "IMPORTE", valor: 99.999 })).toEqual({ tipo: "IMPORTE", valor: 100 });
    expect(descuentoValido({ tipo: "IMPORTE", valor: 0.004 })).toBeNull();
  });
  it("rechaza Infinity/NaN y basura", () => {
    expect(descuentoValido({ tipo: "IMPORTE", valor: Infinity })).toBeNull();
    expect(descuentoValido({ tipo: "PORCENTAJE", valor: NaN })).toBeNull();
    expect(descuentoValido(null)).toBeNull();
    expect(descuentoValido("10%")).toBeNull();
  });
  it("recorta el motivo y omite el vacío", () => {
    expect(descuentoValido({ tipo: "PORCENTAJE", valor: 5, motivo: "  pack  " })).toEqual({ tipo: "PORCENTAJE", valor: 5, motivo: "pack" });
    expect(descuentoValido({ tipo: "PORCENTAJE", valor: 5, motivo: "   " })).toEqual({ tipo: "PORCENTAJE", valor: 5 });
  });
});

describe("aplicarDescuento", () => {
  it("sin descuento devuelve el bruto ×N", () => {
    expect(aplicarDescuento({ anticipo: 150, resto: 200 }, 1, null)).toEqual({ anticipo: 150, resto: 200, bruto: 350, rebaja: 0, anticipoBruto: 150 });
    expect(aplicarDescuento({ anticipo: 150, resto: 200 }, 3, undefined)).toEqual({ anticipo: 450, resto: 600, bruto: 1050, rebaja: 0, anticipoBruto: 450 });
  });
  it("porcentaje simple (el caso del e2e: 150/200 al −10 %)", () => {
    expect(aplicarDescuento({ anticipo: 150, resto: 200 }, 1, { tipo: "PORCENTAJE", valor: 10 }))
      .toEqual({ anticipo: 135, resto: 180, bruto: 350, rebaja: 35, anticipoBruto: 150 });
  });
  it("importe con familia: reparto proporcional exacto (3×150/200 −100 €)", () => {
    const r = aplicarDescuento({ anticipo: 150, resto: 200 }, 3, { tipo: "IMPORTE", valor: 100 });
    expect(r).toEqual({ anticipo: 407.14, resto: 542.86, bruto: 1050, rebaja: 100, anticipoBruto: 450 });
    expect(Math.round((r.anticipo + r.resto) * 100)).toBe(95000); // == bruto − rebaja exacto
  });
  it("importe mayor que el bruto se recorta (total 0, nunca negativo)", () => {
    const r = aplicarDescuento({ anticipo: 150, resto: 200 }, 1, { tipo: "IMPORTE", valor: 5000 });
    expect(r).toEqual({ anticipo: 0, resto: 0, bruto: 350, rebaja: 350, anticipoBruto: 150 });
  });
  it("anticipo 0: toda la rebaja cae en el resto", () => {
    expect(aplicarDescuento({ anticipo: 0, resto: 350 }, 1, { tipo: "PORCENTAJE", valor: 10 }))
      .toEqual({ anticipo: 0, resto: 315, bruto: 350, rebaja: 35, anticipoBruto: 0 });
  });
  it("céntimos conflictivos: anticipo+resto == total exacto (33,33/33,33 al −10 %)", () => {
    const r = aplicarDescuento({ anticipo: 33.33, resto: 33.33 }, 1, { tipo: "PORCENTAJE", valor: 10 });
    expect(Math.round((r.anticipo + r.resto) * 100)).toBe(Math.round((r.bruto - r.rebaja) * 100));
  });
  it("descuento inválido se ignora (bruto intacto)", () => {
    expect(aplicarDescuento({ anticipo: 150, resto: 200 }, 1, { tipo: "PORCENTAJE", valor: 0 } as never).rebaja).toBe(0);
  });
});

describe("restoPendiente", () => {
  const reb10 = (t: { anticipo: number; resto: number }) => aplicarDescuento(t, 1, { tipo: "PORCENTAJE", valor: 10 });

  it("anticipo sin pagar: la parte proporcional (se realinea sola)", () => {
    // 200/200 −10 % → 180/180: el cliente ve −20 arriba y −20 abajo.
    const r = reb10({ anticipo: 200, resto: 200 });
    expect(restoPendiente(r, null)).toBe(180);
  });

  it("anticipo pagado YA rebajado: idéntico al reparto proporcional", () => {
    // Invariante clave: la regla nueva GENERALIZA la antigua, no la contradice.
    const r = reb10({ anticipo: 200, resto: 200 });
    expect(restoPendiente(r, r.anticipo)).toBe(r.resto);
    const r2_ = reb10({ anticipo: 150, resto: 200 });
    expect(restoPendiente(r2_, r2_.anticipo)).toBe(r2_.resto);
  });

  it("anticipo pagado a precio PLENO: todo el descuento cae en el final", () => {
    // Caso de Matthias: 200 + 200, el cliente paga 200 y DESPUÉS se aplica −10 %.
    // Total rebajado 360 − 200 pagados = 160 pendientes (los 40 € enteros abajo).
    const r = reb10({ anticipo: 200, resto: 200 });
    expect(restoPendiente(r, 200)).toBe(160);
    // El cliente acaba pagando exactamente el total rebajado.
    expect(200 + restoPendiente(r, 200)).toBe(r.bruto - r.rebaja);
  });

  it("nunca negativo: si ya pagó más que el total rebajado, 0 (hay devolución)", () => {
    const r = aplicarDescuento({ anticipo: 200, resto: 200 }, 1, { tipo: "PORCENTAJE", valor: 60 });
    expect(r.bruto - r.rebaja).toBe(160);
    expect(restoPendiente(r, 200)).toBe(0);
  });

  it("sin descuento y anticipo pagado: el resto intacto", () => {
    const r = aplicarDescuento({ anticipo: 200, resto: 200 }, 1, null);
    expect(restoPendiente(r, 200)).toBe(200);
  });

  // Los dos casos que destapó la revisión: el traslado SOLO mueve la rebaja del
  // anticipo, nunca desvíos ajenos al descuento (si no, el final los absorbía).
  it("factura del anticipo EDITADA al alza y sin descuento: el final no devuelve el trabajo extra", () => {
    // 200/200 sin descuento; el gestor añadió «Traducción jurada 60 €» → cobró 260.
    // El final debe seguir siendo 200, no 400−260=140.
    const r = aplicarDescuento({ anticipo: 200, resto: 200 }, 1, null);
    expect(restoPendiente(r, 260)).toBe(200);
  });

  it("tarifa SUBIDA después de cobrar el anticipo: no se recobra retroactivamente", () => {
    // Cobró 200 con la tarifa vieja (200/200); ahora la tarifa es 250/250, sin descuento.
    // El final es el resto actual (250), no 500−200=300.
    const r = aplicarDescuento({ anticipo: 250, resto: 250 }, 1, null);
    expect(restoPendiente(r, 200)).toBe(250);
  });

  it("anticipo editado al alza CON descuento: traslada la rebaja, no el trabajo extra", () => {
    // 200/200 −10 % (reb 180/180, rebaja del anticipo = 20). El gestor cobró 260
    // (180 + 80 de trabajo extra). Traslado = min(260−180, 20) = 20 → final 160.
    // El cliente paga 260 + 160 = 420 = 400 − 40 de descuento + 60 de extra. ✔
    const r = reb10({ anticipo: 200, resto: 200 });
    expect(restoPendiente(r, 260)).toBe(160);
  });

  it("tarifa subida tras cobrar, CON descuento: el traslado no compensa la subida", () => {
    // Cobró 200 con la tarifa vieja; tarifa nueva 250/250 −10 % → reb 225/225.
    // Pagó MENOS que el anticipo rebajado (200 < 225) → no hay rebaja que trasladar.
    const r = reb10({ anticipo: 250, resto: 250 });
    expect(restoPendiente(r, 200)).toBe(225);
  });

  it("familia ×3 con anticipo pagado pleno: el descuento entero abajo", () => {
    // 3×(150/200) = 1050 bruto, −100 € → 950 total. Pagado 450 pleno → 500 pendientes.
    const r = aplicarDescuento({ anticipo: 150, resto: 200 }, 3, { tipo: "IMPORTE", valor: 100 });
    expect(restoPendiente(r, 450)).toBe(500);
    expect(450 + restoPendiente(r, 450)).toBe(950);
  });
});

// Fixtures mínimas (solo los campos que usan los helpers de dinero).
const svc = (id: string, anticipo: number, resto: number, suplidos: { concepto: string; importe: number }[] = []): Servicio =>
  ({ id, label: id, desc: "", docs: [], active: true, precio: anticipo + resto, anticipo, resto, suplidos } as unknown as Servicio);

describe("asignación de servicios a miembros (familia heterogénea)", () => {
  const arraigo = svc("arraigo", 150, 200, [{ concepto: "Tasa 790", importe: 16.08 }]);
  const renovacion = svc("renovacion", 80, 100);

  it("asignacionValida: limpia entradas inválidas, null si no queda nada", () => {
    expect(asignacionValida({ arraigo: ["c1"], renovacion: ["c2", "c2", " "] })).toEqual({ arraigo: ["c1"], renovacion: ["c2"] });
    expect(asignacionValida({ arraigo: [] })).toBeNull();
    expect(asignacionValida({ "": ["c1"] })).toBeNull();
    expect(asignacionValida(["c1"])).toBeNull();
    expect(asignacionValida(null)).toBeNull();
  });

  it("miembrosDeServicio: sin entrada → todos; con lista → su tamaño, capado a N", () => {
    expect(miembrosDeServicio(null, "arraigo", 3)).toBe(3);
    expect(miembrosDeServicio({ arraigo: ["c1"] }, "arraigo", 3)).toBe(1);
    expect(miembrosDeServicio({ arraigo: ["c1"] }, "renovacion", 3)).toBe(3);
    // asignación obsoleta (más ids que miembros) no puede cobrar de más
    expect(miembrosDeServicio({ arraigo: ["c1", "c2", "c3", "c4"] }, "arraigo", 3)).toBe(3);
  });

  it("RETROCOMPAT: sin asignación, tarifaAsignada == tarifaDeServicios ×N exacto", () => {
    expect(tarifaAsignada([arraigo, renovacion], null, 3)).toEqual({ anticipo: (150 + 80) * 3, resto: (200 + 100) * 3 });
    expect(tarifaAsignada([arraigo], null, 1)).toEqual({ anticipo: 150, resto: 200 });
  });

  it("el caso de Juan: padre arraigo + madre renovación en familia de 3 → cada servicio ×1", () => {
    const t = tarifaAsignada([arraigo, renovacion], { arraigo: ["padre"], renovacion: ["madre"] }, 3);
    expect(t).toEqual({ anticipo: 230, resto: 300 });
    // y el descuento se aplica SOBRE la tarifa ya multiplicada (nMiembros=1)
    const reb = aplicarDescuento(t, 1, { tipo: "PORCENTAJE", valor: 10 });
    expect(reb).toEqual({ anticipo: 207, resto: 270, bruto: 530, rebaja: 53, anticipoBruto: 230 });
  });

  it("mixto: un servicio asignado a 2, el otro a todos", () => {
    expect(tarifaAsignada([arraigo, renovacion], { arraigo: ["c1", "c2"] }, 3))
      .toEqual({ anticipo: 150 * 2 + 80 * 3, resto: 200 * 2 + 100 * 3 });
  });

  it("suplidosAsignados: la tasa sigue a los miembros de SU servicio", () => {
    expect(suplidosAsignados(null, [arraigo, renovacion], { arraigo: ["padre"] }, 3))
      .toEqual([{ concepto: "Tasa 790", importe: 16.08 }]);
    expect(suplidosAsignados(null, [arraigo], null, 3))
      .toEqual([{ concepto: "Tasa 790 (×3)", importe: 48.24 }]);
  });

  it("suplidosAsignados: el override manual sigue siendo global ×N (lista plana)", () => {
    expect(suplidosAsignados([{ concepto: "Tasa ajustada", importe: 12 }], [arraigo], { arraigo: ["c1"] }, 3))
      .toEqual([{ concepto: "Tasa ajustada (×3)", importe: 36 }]);
  });
});

describe("etiquetaDescuento", () => {
  it("porcentaje e importe con separador de miles", () => {
    expect(etiquetaDescuento({ tipo: "PORCENTAJE", valor: 10 })).toBe("−10 %");
    expect(etiquetaDescuento({ tipo: "IMPORTE", valor: 150 })).toBe("−150,00 €");
    expect(etiquetaDescuento({ tipo: "IMPORTE", valor: 1500 })).toBe("−1.500,00 €");
  });
  it("vacía si el descuento no es válido", () => {
    expect(etiquetaDescuento(null)).toBe("");
    expect(etiquetaDescuento({ tipo: "PORCENTAJE", valor: 0 } as never)).toBe("");
  });
});
