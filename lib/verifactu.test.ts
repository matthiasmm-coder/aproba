import { describe, expect, it } from "vitest";
import {
  construirAlta, construirAnulacion, claveIdempotencia, ddmmyyyy, esDniValido, esNieValido, fechaMadrid,
  identidadDesdeSnapshot, mapEstadoVerifacti, nifEspanolValido, registroBloqueaEdicion, resumenRegistro,
} from "./verifactu";
import { paisIsoDeNacionalidad } from "./verifactu-paises";

const HOY = new Date("2026-09-17T10:00:00+02:00");
const base = { numero: "2026-0012", fechaEmision: "2026-09-17T08:00:00.000Z", concepto: "Anticipo — Arraigo social (EXP-2026-0012)", base: 300 };

describe("VERI*FACTU — registro de alta", () => {
  it("cliente con NIE → F1 con nif, una línea S1 al 21 % y total cuadrado", () => {
    const r = construirAlta(base, { nombre: "Amadou Diallo", nif: "X1234567L" }, { hoy: HOY, entorno: "prod" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.identificacion).toBe("nif");
    expect(r.payload).toMatchObject({
      serie: "", numero: "2026-0012", fecha_expedicion: "17-09-2026", tipo_factura: "F1", nif: "X1234567L", nombre: "Amadou Diallo",
      validar_destinatario: true, importe_total: "363.00",
      lineas: [{ base_imponible: "300.00", tipo_impositivo: "21", cuota_repercutida: "63.00" }],
    });
    expect(r.payload.incidencia).toBeUndefined();
    expect(r.payload.id_otro).toBeUndefined();
  });

  it("en test no se valida el censo (los NIF de prueba no existen)", () => {
    const r = construirAlta(base, { nombre: "Amadou Diallo", nif: "X1234567L" }, { hoy: HOY, entorno: "test" });
    expect(r.ok && r.payload.validar_destinatario).toBe(false);
  });

  it("pasaporte + nacionalidad libre → id_otro tipo 03 con país ISO", () => {
    const r = construirAlta(base, { nombre: "Valentina Rojas", pasaporte: "AV 123 456", nacionalidad: "colombiana" }, { hoy: HOY, entorno: "prod" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.identificacion).toBe("pasaporte");
    expect(r.payload.id_otro).toEqual({ codigo_pais: "CO", id_type: "03", id: "AV123456" });
    expect(r.payload.nif).toBeUndefined();
    expect(r.payload.validar_destinatario).toBeUndefined();
  });

  it("pasaporte sin país reconocible → BLOQUEADO con motivo accionable", () => {
    const r = construirAlta(base, { nombre: "Li Wei", pasaporte: "E12345678", nacionalidad: "Marte" }, { hoy: HOY, entorno: "prod" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.codigo).toBe("PAIS_DESCONOCIDO");
    expect(r.motivo).toContain("«Marte»");
    const sin = construirAlta(base, { nombre: "Li Wei", pasaporte: "E12345678" }, { hoy: HOY, entorno: "prod" });
    expect(!sin.ok && sin.motivo).toContain("no tiene nacionalidad");
  });

  it("sin identificación y ≤ 400 € → F2 simplificada sin destinatario", () => {
    const r = construirAlta(base, { nombre: "Cliente" }, { hoy: HOY, entorno: "prod" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.identificacion).toBe("simplificada");
    expect(r.payload.tipo_factura).toBe("F2");
    expect(r.payload.especial).toEqual({ factura_sin_identif_destinatario_art_61d: "S" });
    expect(r.payload.nombre).toBeUndefined();
  });

  it("sin identificación y > 400 € → BLOQUEADO (nunca se inventa un destinatario)", () => {
    const r = construirAlta({ ...base, base: 500 }, { nombre: "Cliente" }, { hoy: HOY, entorno: "prod" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.codigo).toBe("SIN_IDENTIFICACION");
    expect(r.motivo).toMatch(/NIE\/DNI/);
  });

  it("NIE con letra incorrecta se rechaza y el motivo lo enseña", () => {
    const r = construirAlta({ ...base, base: 500 }, { nombre: "Cliente", nif: "X1234567A" }, { hoy: HOY, entorno: "prod" });
    expect(!r.ok && r.motivo).toContain("«X1234567A»");
  });

  it("empresa (CIF) → F1 con nif de la empresa", () => {
    const r = construirAlta(base, { nombre: "Perla Azul SL", nif: "B-22.993.539" }, { hoy: HOY, entorno: "prod" });
    expect(r.ok && r.payload.nif).toBe("B22993539");
  });

  it("líneas + suplidos: una S1 agregada y una N1 por las tasas; importe_total = total impreso", () => {
    const f = { ...base, lineas: [{ concepto: "Honorarios", base: 200 }, { concepto: "Gestión", base: 50 }], suplidos: [{ concepto: "Tasa 790-052", importe: 16.08 }] };
    const r = construirAlta(f, { nombre: "Amadou Diallo", nif: "X1234567L" }, { hoy: HOY, entorno: "prod" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.lineas).toEqual([
      { base_imponible: "250.00", tipo_impositivo: "21", cuota_repercutida: "52.50" },
      { base_imponible: "16.08", calificacion_operacion: "N1" },
    ]);
    expect(r.payload.importe_total).toBe("318.58");
  });

  it("snapshot fiscal impreso sirve de identificación si no hay ficha", () => {
    const r = construirAlta({ ...base, clienteDatos: { documento: "NIE/DNI Y7654321G" } }, { nombre: "Marcos Pérez" }, { hoy: HOY, entorno: "prod" });
    expect(r.ok && r.payload.nif).toBe("Y7654321G");
    expect(identidadDesdeSnapshot("Pasaporte AB123")).toEqual({ pasaporte: "AB123" });
    expect(identidadDesdeSnapshot("CIF/NIF B22993539")).toEqual({ nif: "B22993539" });
    expect(identidadDesdeSnapshot("")).toEqual({});
  });

  it("emitida otro día → se expide HOY con fecha_operacion = emisión, incidencia S y aviso reexpedida", () => {
    const r = construirAlta({ ...base, fechaEmision: "2026-09-15T22:30:00.000Z" }, { nombre: "A", nif: "X1234567L" }, { hoy: HOY, entorno: "prod" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.fecha_expedicion).toBe("17-09-2026");
    expect(r.payload.fecha_operacion).toBe("16-09-2026"); // 00:30 del 16 en Madrid
    expect(r.payload.incidencia).toBe("S");
    expect(r.reexpedida).toBe(true);
    expect(r.fechaExpedicion).toBe("2026-09-17");
    const hoyMismo = construirAlta(base, { nombre: "A", nif: "X1234567L" }, { hoy: HOY, entorno: "prod" });
    expect(hoyMismo.ok && hoyMismo.reexpedida).toBe(false);
    expect(hoyMismo.ok && hoyMismo.payload.fecha_operacion).toBeUndefined();
    const futura = construirAlta({ ...base, fechaEmision: "2026-09-20T10:00:00.000Z" }, { nombre: "A", nif: "X1234567L" }, { hoy: HOY, entorno: "prod" });
    expect(futura.ok && futura.payload.fecha_expedicion).toBe("17-09-2026");
    expect(futura.ok && futura.payload.fecha_operacion).toBeUndefined();
  });

  it("importe cero o negativo → IMPORTE; número vacío → NUMERO", () => {
    expect(construirAlta({ ...base, base: 0 }, { nombre: "A" }, { hoy: HOY, entorno: "prod" })).toMatchObject({ ok: false, codigo: "IMPORTE" });
    expect(construirAlta({ ...base, base: -10 }, { nombre: "A" }, { hoy: HOY, entorno: "prod" })).toMatchObject({ ok: false, codigo: "IMPORTE" });
    expect(construirAlta({ ...base, numero: " " }, { nombre: "A" }, { hoy: HOY, entorno: "prod" })).toMatchObject({ ok: false, codigo: "NUMERO" });
  });

  it("descripción y nombre se recortan a los máximos de la AEAT", () => {
    const r = construirAlta({ ...base, concepto: "x".repeat(600) }, { nombre: `${"n".repeat(130)}`, nif: "X1234567L" }, { hoy: HOY, entorno: "prod" });
    expect(r.ok && r.payload.descripcion.length).toBe(500);
    expect(r.ok && r.payload.nombre?.length).toBe(120);
  });
});

describe("VERI*FACTU — utilidades", () => {
  it("anulación referencia el alta tal cual se registró", () => {
    expect(construirAnulacion({ serie: "", numero: "2026-0012", fechaExpedicion: "2026-09-17" })).toEqual({ serie: "", numero: "2026-0012", fecha_expedicion: "17-09-2026" });
  });
  it("estados de Verifacti → estados de Aproba", () => {
    expect(mapEstadoVerifacti("Pendiente")).toBe("PENDIENTE");
    expect(mapEstadoVerifacti("Correcto")).toBe("CORRECTO");
    expect(mapEstadoVerifacti("Aceptado con errores")).toBe("ACEPTADO_CON_ERRORES");
    expect(mapEstadoVerifacti("Incorrecto")).toBe("INCORRECTO");
    expect(mapEstadoVerifacti("Duplicado")).toBe("DUPLICADO");
    expect(mapEstadoVerifacti("Anulado")).toBe("ANULADO");
    expect(mapEstadoVerifacti("Factura inexistente")).toBe("INCORRECTO");
    expect(mapEstadoVerifacti("No registrado")).toBe("NO_REGISTRADO");
    expect(mapEstadoVerifacti("Error servidor AEAT")).toBe("PENDIENTE");
    expect(mapEstadoVerifacti(undefined)).toBe("PENDIENTE");
  });
  it("validación de documentos", () => {
    expect(esDniValido("12345678Z")).toBe(true);
    expect(esDniValido("12345678A")).toBe(false);
    expect(esNieValido("X1234567L")).toBe(true);
    expect(esNieValido("Y7654321G")).toBe(true);
    expect(esNieValido("X1234567A")).toBe(false);
    expect(nifEspanolValido(" x-1234567-l ")).toBe("X1234567L");
    expect(nifEspanolValido("AB123456")).toBeNull();
    expect(nifEspanolValido("")).toBeNull();
  });
  it("fecha de Madrid y formato AEAT", () => {
    expect(fechaMadrid(new Date("2026-09-15T22:30:00.000Z"))).toBe("2026-09-16");
    expect(ddmmyyyy("2026-01-05")).toBe("05-01-2026");
  });
  it("idempotencia por factura, operación e intento", () => {
    expect(claveIdempotencia("abc", "ALTA", 1)).toBe("aproba-alta-abc-1");
    expect(claveIdempotencia("abc", "ANULACION", 2)).toBe("aproba-anulacion-abc-2");
  });
  it("un alta enviada bloquea la edición; bloqueada o con error de envío, no", () => {
    expect(registroBloqueaEdicion({ tipo: "ALTA", estado: "PENDIENTE" })).toBe(true);
    expect(registroBloqueaEdicion({ tipo: "ALTA", estado: "CORRECTO" })).toBe(true);
    expect(registroBloqueaEdicion({ tipo: "ALTA", estado: "BLOQUEADO" })).toBe(false);
    expect(registroBloqueaEdicion({ tipo: "ALTA", estado: "ERROR_ENVIO" })).toBe(false);
    expect(registroBloqueaEdicion({ tipo: "ANULACION", estado: "PENDIENTE" })).toBe(false);
    expect(registroBloqueaEdicion(null)).toBe(false);
  });
  it("resumen legible por estado", () => {
    expect(resumenRegistro({ estado: "BLOQUEADO", motivo: "Falta el NIE" })).toBe("Falta el NIE");
    expect(resumenRegistro({ estado: "INCORRECTO", mensajeError: "NIF no válido" })).toBe("Rechazada por la AEAT: NIF no válido");
    expect(resumenRegistro({ estado: "CORRECTO" })).toBe("Registrada en la AEAT");
    expect(resumenRegistro(null)).toBeNull();
  });
  it("nacionalidad libre → ISO (tal como la escriben los despachos)", () => {
    const casos: [string, string | null][] = [
      ["colombia", "CO"], ["Colombiana", "CO"], ["venezolano", "VE"], ["Perú", "PE"], ["peruana", "PE"], ["República Dominicana", "DO"],
      ["deutsch", "DE"], ["Reino Unido", "GB"], ["estadounidense", "US"], ["EE.UU.", "US"], ["marroquí", "MA"], ["Senegal", "SN"],
      ["nacionalidad argentina", "AR"], ["Colombia / Venezuela", "CO"], ["CO", "CO"], ["china", "CN"], ["brasil", "BR"], ["", null], ["Marte", null],
    ];
    for (const [entrada, iso] of casos) expect(paisIsoDeNacionalidad(entrada), entrada).toBe(iso);
  });
});
