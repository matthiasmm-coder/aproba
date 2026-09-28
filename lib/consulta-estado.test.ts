import { describe, expect, it } from "vitest";
import { datosConsultaCliente, diaMadrid, enlaceSms, esCiudadanoUE, expeParaSms, fechaDMA, nieParaSms } from "./consulta-estado";

// 28/09/2026 — la «Guía para clientes» de GESADM (Jennifer), hecha pantalla en el
// seguimiento del cliente. Reglas de la página oficial infoext2 leídas ese día.

const base = { nie: "X1234567L", numeroOficial: "", fechaPresentacion: "2026-08-22T09:00:00Z", fechaNacimiento: "1993-10-27", nacionalidad: "Marruecos" };

describe("datos para que el cliente consulte su expediente", () => {
  it("con NIE, fecha de presentación y año de nacimiento: todo listo, SMS incluido", () => {
    expect(datosConsultaCliente(base)).toEqual({ nie: "X1234567L", numeroExpediente: "", fechaPresentacion: "2026-08-22", anioNacimiento: "1993", sms: "NIE X01234567L" });
  });
  it("sin NIE vale el nº de expediente; el SMS solo si tiene 15 caracteres", () => {
    expect(datosConsultaCliente({ ...base, nie: "", numeroOficial: "08/203456/2026" })).toMatchObject({ nie: "", numeroExpediente: "08/203456/2026", sms: null });
    expect(datosConsultaCliente({ ...base, nie: "", numeroOficial: "280020101234567" })?.sms).toBe("EXPE 280020101234567");
  });
  it("si falta algo de lo que pide la web oficial, no hay tarjeta", () => {
    expect(datosConsultaCliente({ ...base, fechaPresentacion: null })).toBeNull();
    expect(datosConsultaCliente({ ...base, fechaNacimiento: "" })).toBeNull();
    expect(datosConsultaCliente({ ...base, nie: "AB123456", numeroOficial: "" })).toBeNull(); // un pasaporte no es un NIE
  });
  it("ciudadanos de la UE, EEE o Suiza: el servicio oficial no es para ellos", () => {
    for (const n of ["Rumanía", "RUMANO", "italiana", "ROU", "Portugal", "suizo", "noruego", "estonio", "Países Bajos"]) expect(datosConsultaCliente({ ...base, nacionalidad: n }), n).toBeNull();
    for (const n of ["Marruecos", "sudanés", "Colombia", "checheno", "Venezuela", "", null]) expect(esCiudadanoUE(n), String(n)).toBe(false);
  });
});

describe("formatos oficiales", () => {
  it("NIE para SMS con 8 dígitos", () => {
    expect(nieParaSms("x-1234567-l")).toBe("X01234567L");
    expect(nieParaSms("Y00000123K")).toBe("Y00000123K");
    expect(nieParaSms("12345678Z")).toBeNull(); // un DNI no
  });
  it("EXPE exactamente de 15 caracteres", () => {
    expect(expeParaSms("2800 2010 1234 567")).toBe("280020101234567");
    expect(expeParaSms("08/203456/2026")).toBeNull();
  });
  it("fecha dd/mm/aaaa y enlace sms con el texto puesto", () => {
    expect(fechaDMA("2026-08-22")).toBe("22/08/2026");
    expect(enlaceSms("NIE X01234567L")).toBe("sms:651714610?&body=NIE%20X01234567L");
  });
  it("día de presentación en hora de Madrid, venga como venga", () => {
    expect(diaMadrid("2026-09-23T22:30:00")).toBe("2026-09-24");       // UTC sin «Z»: 00:30 en Madrid
    expect(diaMadrid("2026-09-24T09:00:00+00:00")).toBe("2026-09-24");
    expect(diaMadrid("2026-09-24")).toBe("2026-09-24");
    expect(diaMadrid(null)).toBe("");
  });
});
