import { describe, expect, it } from "vitest";
import { camposMandatoConsejo, colegioTerritorial, mandatoConsejoValido, modeloDeServicio, modeloPorDefecto, partirDomicilio } from "@/lib/mandato-modelos";

describe("mandato del Consejo · qué modelo toca", () => {
  it("catálogo real de Juan: extranjería por defecto, nacionalidad aparte, lo ajeno con el de siempre", () => {
    const m = (id: string, label: string) => modeloPorDefecto({ id, label });
    expect(m("nacionalidad", "Nacionalidad española")).toBe("nacionalidad");
    expect(m("arraigo_social", "Residencia por arraigo")).toBe("extranjeria");
    expect(m("renovacion_tie", "Gestión de TIE")).toBe("extranjeria");
    expect(m("residencia_ue", "Permiso de residencia de ciudadano de la UE (CUE)")).toBe("extranjeria");
    expect(m("srv_yp112w4", "NIE + NUSS")).toBe("extranjeria");
    expect(m("srv_hbfp2gt", "Contestación a requerimiento de Extranjería")).toBe("extranjeria");
    expect(m("srv_hh5sssg", "Canje de licencia de conducir extranjera")).toBe("general");
    expect(m("srv_x9m50zu", "Homologación de titulo de bachiller")).toBe("general");
    expect(m("srv_u2tc9vb", "Equivalencia de título universitario extranjero")).toBe("general");
    expect(m("srv_7tz8dbf", "Certificado digital FNMT")).toBe("general");
    expect(m("srv_vnoteyu", "Alta de autónomo / coordinación alta autónomo")).toBe("general");
    expect(m("srv_l4qvso8", "Nota simple registral")).toBe("general");
    expect(m("srv_nud6hei", "Registro de pareja de hecho o casamiento")).toBe("general");
    expect(m("srv_04ztiti", "Antecedentes penales españoles apostillados")).toBe("general");
  });

  it("desactivado → siempre el de siempre; activo → la excepción del despacho manda", () => {
    const svc = { id: "srv_55uwf6x", label: "ROMANE - GESTIONES VARIAS" };
    expect(modeloDeServicio(svc, null)).toBe("general");
    expect(modeloDeServicio(svc, { activo: false, porServicio: {} })).toBe("general");
    expect(modeloDeServicio(svc, { activo: true, porServicio: {} })).toBe("extranjeria");
    expect(modeloDeServicio(svc, { activo: true, porServicio: { srv_55uwf6x: "general" } })).toBe("general");
  });

  it("config leída con defensa", () => {
    expect(mandatoConsejoValido({ activo: true, porServicio: { a: "nacionalidad", b: "otro", c: "general" } })).toEqual({ activo: true, porServicio: { a: "nacionalidad", c: "general" } });
    expect(mandatoConsejoValido(null)).toBeNull();
    expect(mandatoConsejoValido({ activo: "sí" })).toEqual({ activo: false, porServicio: {} });
  });
});

describe("mandato del Consejo · casillas", () => {
  it("domicilio del despacho partido como lo pide el impreso", () => {
    expect(partirDomicilio("AV. DE LAS CORTES VALENCIANAS 46, 5 E, CP 46015 - VALENCIA")).toEqual({ calle: "AV. DE LAS CORTES VALENCIANAS", numero: "46, 5 E", cp: "46015", localidad: "VALENCIA" });
    expect(partirDomicilio("Calle Falsa 1, 46001 Valencia")).toEqual({ calle: "Calle Falsa", numero: "1", cp: "46001", localidad: "Valencia" });
    expect(partirDomicilio("C/ Mayor, nº 12, 3º B, 28013 Madrid")).toEqual({ calle: "C/ Mayor", numero: "12, 3º B", cp: "28013", localidad: "Madrid" });
    expect(partirDomicilio("Plaza Sin Número, Sabadell")).toEqual({ calle: "Plaza Sin Número", numero: "", cp: "", localidad: "Sabadell" });
    expect(partirDomicilio("")).toEqual({ calle: "", numero: "", cp: "", localidad: "" });
  });

  it("el Colegio, solo su territorio", () => {
    expect(colegioTerritorial("Colegio Oficial de Gestores Administrativos de Valencia")).toBe("Valencia");
    expect(colegioTerritorial("Ilustre Colegio Oficial de Gestores Administrativos de Madrid")).toBe("Madrid");
    expect(colegioTerritorial("Col·legi Oficial de Gestors Administratius de Catalunya")).toBe("Catalunya");
    expect(colegioTerritorial("VALENCIA")).toBe("VALENCIA");
  });

  it("extranjería: cliente, gestor, colegio dos veces y lugar de firma; nacionalidad sin «y al Colegio»", () => {
    const d = {
      mandante: { nombre: "Ana", apellidos: "Pérez Gómez", nie: "Y1234567Z", pasaporte: "", domicilio: "Calle Luna, 12, 3º B", via: "Calle Luna", numeroVia: "12", piso: "3º B", municipio: "Valencia", cp: "46002", telefono: "600111222", email: "ana@example.com" },
      mandatario: { nombre: "Gestor Prueba", dni: "00000000T", colegiado: "1234", colegio: "Colegio Oficial de Gestores Administrativos de Valencia" },
      despachoDomicilio: "Calle Falsa 1, 46001 Valencia",
    };
    const ex = camposMandatoConsejo("extranjeria", d);
    expect(ex).toMatchObject({
      "Dña": "Ana Pérez Gómez", "DNI": "Y1234567Z", "y domicilio a efectos de notificaciones en": "Valencia",
      "n": "Calle Luna, 3º B", "n0001": "12", "CP": "46002", "número de teléfono": "600111222", "email": "ana@example.com",
      "DDña 1": "Gestor Prueba", "con NIFNIE": "00000000T", "DDña 2": "1234",
      "perteneciente al Colegio Oficial de Gestores Administrativos de": "Valencia", "Administrativos de": "Valencia",
      "con domicilio en": "Valencia", "calle": "Calle Falsa", "n_2": "1", "CP_2": "46001", "En": "Valencia", "En_2": "Valencia",
    });
    const nac = camposMandatoConsejo("nacionalidad", d);
    expect(nac.conDNI).toBe("Y1234567Z");
    expect(nac).not.toHaveProperty("DNI");
    expect(nac).not.toHaveProperty("Administrativos de");
    expect(nac).not.toHaveProperty("n0001");
    expect(nac.n).toBe("Calle Luna 12, 3º B"); // sin casilla de nº en el de nacionalidad
  });

  it("sin calle desglosada, el domicilio entero va a la calle", () => {
    const d = {
      mandante: { nombre: "Li", apellidos: "Wei", nie: "", pasaporte: "E1234567", domicilio: "Av. del Puerto 7, 2ª", municipio: "Valencia", cp: "46011", telefono: "", email: "" },
      mandatario: { nombre: "G", dni: "", colegiado: "", colegio: "" },
      despachoDomicilio: "",
    };
    const ex = camposMandatoConsejo("extranjeria", d);
    expect(ex.n).toBe("Av. del Puerto 7, 2ª");
    expect(ex.n0001).toBe("");
    expect(ex.DNI).toBe("E1234567");
  });
});
