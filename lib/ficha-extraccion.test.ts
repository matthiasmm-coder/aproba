import { describe, it, expect } from "vitest";
import { camposParaFicha, esDocumentoDeIdentidad, fechaISO, fichaDesdeCampos, huecosDeFicha, nombreEscrito, pideClienteNuevo, sexoFicha } from "./ficha-extraccion";
import { FICHA_KEYS } from "./ficha";

describe("ficha desde la extracción de un pasaporte", () => {
  it("mapea nombre, apellidos, sexo ICAO, nacionalidad, fecha y número", () => {
    const f = fichaDesdeCampos([
      { label: "Nombre", value: "DANIEL" }, { label: "Apellidos", value: "RAMÍREZ SOTO" }, { label: "Sexo", value: "M" },
      { label: "Nacionalidad", value: "COLOMBIA" }, { label: "Fecha de nacimiento", value: "12/03/1991" }, { label: "Nº pasaporte", value: "AV 123456" },
    ]);
    expect(f).toMatchObject({ nombre: "Daniel", apellidos: "Ramírez Soto", sexo: "H", nacionalidad: "Colombia", fechaNacimiento: "1991-03-12", pasaporte: "AV123456", paisNacimiento: "Colombia" });
  });
  it("un NIE va a numeroDocumento, nunca a pasaporte; F es mujer", () => {
    const f = fichaDesdeCampos([{ label: "Nombre completo", value: "FATIMA EL AMRANI" }, { label: "NIE", value: "Y-0429317-K" }, { label: "Nº documento", value: "Y0429317K" }, { label: "Sexo", value: "F" }]);
    expect(f).toMatchObject({ nombre: "Fatima", apellidos: "El Amrani", numeroDocumento: "Y0429317K", sexo: "M" });
    expect(f.pasaporte).toBeUndefined();
  });
  it("fechas en varios formatos y valores vacíos", () => {
    expect(fechaISO("14 MAR 1992")).toBe("1992-03-14"); expect(fechaISO("1992-03-14")).toBe("1992-03-14"); expect(fechaISO("14.3.1992")).toBe("1992-03-14"); expect(fechaISO("ayer")).toBeUndefined();
    expect(sexoFicha("Mujer")).toBe("M"); expect(sexoFicha("Hombre")).toBe("H"); expect(sexoFicha("")).toBeUndefined();
    expect(fichaDesdeCampos([{ label: "Nombre", value: "N/A" }]).nombre).toBeUndefined();
  });
  it("reconoce la orden «es nuevo» y el nombre escrito por el gestor", () => {
    expect(pideClienteNuevo("Es nuevo: Daniel Ramírez Soto")).toBe(true);
    expect(pideClienteNuevo("Es de Fatima")).toBe(false);
    expect(nombreEscrito("Cliente nuevo: Daniel Ramírez Soto, gracias")).toEqual({ nombre: "Daniel", apellidos: "Ramírez Soto" });
    expect(nombreEscrito("es nuevo")).toBeNull();
    expect(esDocumentoDeIdentidad("pasaporte")).toBe(true); expect(esDocumentoDeIdentidad("contrato_trabajo")).toBe(false);
  });
});

// ── Sincronización ficha ← extracción (08/09/2026, queja de Asenjo Global) ──────────
describe("huecosDeFicha", () => {
  const leido = {
    nombre: "Aicha", apellidos: "Diallo Diaz", sexo: "M" as const, fechaNacimiento: "1992-03-14",
    nacionalidad: "Senegalesa", numeroDocumento: "Y1234567L", municipio: "Barcelona",
  };

  it("rellena solo lo que está vacío", () => {
    const actual = { nombre: "Aïcha", apellidos: "", fechaNacimiento: null, municipio: "   " };
    expect(huecosDeFicha(actual, leido)).toEqual({
      apellidos: "Diallo Diaz", sexo: "M", fechaNacimiento: "1992-03-14",
      nacionalidad: "Senegalesa", numeroDocumento: "Y1234567L", municipio: "Barcelona",
    });
  });

  it("NUNCA pisa un dato escrito por una persona, aunque la IA lea otra cosa", () => {
    const actual = { nombre: "Aicha", apellidos: "Diallo", numeroDocumento: "X9999999R", fechaNacimiento: "1990-01-01" };
    const huecos = huecosDeFicha(actual, leido);
    expect(huecos.nombre).toBeUndefined();
    expect(huecos.apellidos).toBeUndefined();
    expect(huecos.numeroDocumento).toBeUndefined();
    expect(huecos.fechaNacimiento).toBeUndefined();
  });

  it("ficha completa o extracción vacía → nada que escribir", () => {
    expect(huecosDeFicha({ nombre: "A", apellidos: "B" }, {})).toEqual({});
    expect(huecosDeFicha(null, {})).toEqual({});
  });

  it("todas las claves que produce vienen de la ficha oficial (nada inventado)", () => {
    const claves = Object.keys(huecosDeFicha({}, leido));
    for (const k of claves) expect(FICHA_KEYS, `«${k}» no es un campo de la ficha`).toContain(k);
  });
});

// ── camposParaFicha — qué se lleva a la ficha (21/09/2026, caso Asenjo Global) ────────
// Un PDF que mezcla el pasaporte y la resolución de arraigo se clasifica «otro»: hasta
// hoy eso tiraba TODO lo que la IA había leído y la ficha del cliente seguía vacía.
describe("camposParaFicha", () => {
  const identificacion = [
    { label: "Nombre completo", value: "ALBA YASOHARA DAVILA RODRIGUEZ" },
    { label: "Nombre", value: "ALBA YASOHARA" },
    { label: "Apellidos", value: "DAVILA RODRIGUEZ" },
    { label: "Sexo", value: "F" },
    { label: "Nacionalidad", value: "NICARAGÜENSE" },
    { label: "Fecha de nacimiento", value: "1997-05-29" },
    { label: "Lugar de nacimiento", value: "ESTELI, NICARAGUA" },
    { label: "NIE", value: "Z3989639H" },
    { label: "Nº pasaporte", value: "C02569900" },
    { label: "Municipio", value: "Madrid" },
    { label: "Provincia", value: "Madrid" },
    { label: "País", value: "España" },
  ];

  it("un escaneo mixto («otro») con NIE y pasaporte SÍ rellena la identidad", () => {
    const r = camposParaFicha("otro", fichaDesdeCampos(identificacion));
    expect(r.nombre).toBe("Alba Yasohara");
    expect(r.apellidos).toBe("Davila Rodriguez");
    expect(r.numeroDocumento).toBe("Z3989639H");
    expect(r.pasaporte).toBe("C02569900");
    expect(r.fechaNacimiento).toBe("1997-05-29");
    expect(r.sexo).toBe("M");
  });

  it("…pero no se queda con el domicilio ni el país del documento", () => {
    const r = camposParaFicha("otro", fichaDesdeCampos(identificacion));
    // «Madrid» es la Delegación del Gobierno que firma la resolución, no donde vive.
    expect(r.municipio).toBeUndefined();
    expect(r.provincia).toBeUndefined();
    expect(r.paisNacimiento).toBeUndefined();
    // Lo que sí dice el documento de ella: dónde nació.
    expect(r.lugarNacimiento).toBe("Esteli, Nicaragua");
  });

  it("un documento de identidad de verdad sigue rellenando TODO (sin regresión)", () => {
    const r = camposParaFicha("pasaporte", fichaDesdeCampos(identificacion));
    expect(r.municipio).toBe("Madrid");
    expect(r.paisNacimiento).toBe("España");
  });

  it("el nº de expediente de una resolución no se guarda como pasaporte", () => {
    const r = camposParaFicha("otro", fichaDesdeCampos([
      { label: "Nombre completo", value: "ALBA YASOHARA DAVILA RODRIGUEZ" },
      { label: "NIE", value: "Z3989639H" },
      { label: "Nº documento", value: "280120250124827" },
    ]));
    expect(r.numeroDocumento).toBe("Z3989639H");
    expect(r.pasaporte).toBeUndefined(); // 15 cifras no es un pasaporte
    expect(r.nombre).toBe("Alba"); // sin «Nombre»/«Apellidos» separados, parte el completo
  });

  it("sin identificación leída no se toca la ficha", () => {
    const r = camposParaFicha("otro", fichaDesdeCampos([
      { label: "Nombre completo", value: "ALEJO MARIA AMADEO BARON" },
      { label: "Municipio", value: "Madrid" },
    ]));
    expect(r).toEqual({});
  });

  it("un documento de OTRA persona nunca rellena la ficha del titular", () => {
    const campos = [{ label: "Nombre completo", value: "HIJO RECIEN NACIDO" }, { label: "NIE", value: "Z3989639H" }];
    for (const tipo of ["certificado_nacimiento", "certificado_matrimonio", "libro_familia"]) {
      expect(camposParaFicha(tipo, fichaDesdeCampos(campos))).toEqual({});
    }
  });
});
