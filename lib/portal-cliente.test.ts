import { describe, expect, it } from "vitest";
import { temaLabel } from "./portal-i18n";
import { dedupDocs } from "./tramites";
import { isoDesdeDigitos, visualDesdeIso } from "./fecha";

describe("temaLabel — temas del catálogo en el idioma del cliente", () => {
  it("traduce los temas habituales, sea cual sea la grafía del gestor", () => {
    expect(temaLabel("Nacionalidad", "fr")).toBe("Nationalité");
    expect(temaLabel("NACIONALIDAD", "en")).toBe("Citizenship");
    expect(temaLabel("  empresa  ", "de")).toBe("Unternehmen");
    expect(temaLabel("Residencia", "zh")).toBe("居留");
  });

  it("reconoce las variantes más obvias (singular/plural, sinónimos)", () => {
    expect(temaLabel("Renovación", "fr")).toBe("Renouvellements");
    expect(temaLabel("Visados", "it")).toBe("Visti");
    expect(temaLabel("Ciudadanía", "en")).toBe("Citizenship");
  });

  it("un tema propio del despacho se queda TAL CUAL (nada inventado)", () => {
    expect(temaLabel("Compraventa de inmuebles", "fr")).toBe("Compraventa de inmuebles");
    expect(temaLabel("Pack Verano 2026", "en")).toBe("Pack Verano 2026");
  });

  it("en castellano y en vacío no cambia nada", () => {
    expect(temaLabel("Nacionalidad", "es")).toBe("Nacionalidad");
    expect(temaLabel("", "fr")).toBe("");
  });
});

describe("fecha tecleada (dd/mm/aaaa)", () => {
  it("8 cifras → ISO", () => {
    expect(isoDesdeDigitos("15031990")).toBe("1990-03-15");
    expect(isoDesdeDigitos("01012000")).toBe("2000-01-01");
  });

  it("incompleta o imposible → vacío (no se da por rellenada)", () => {
    expect(isoDesdeDigitos("1503")).toBe("");
    expect(isoDesdeDigitos("31021990")).toBe(""); // 31 de febrero
    expect(isoDesdeDigitos("15131990")).toBe(""); // mes 13
    expect(isoDesdeDigitos("00031990")).toBe("");
    expect(isoDesdeDigitos("15031800")).toBe(""); // antes de 1900
  });

  it("ISA → texto visible, ida y vuelta", () => {
    expect(visualDesdeIso("1990-03-15")).toBe("15/03/1990");
    expect(visualDesdeIso("")).toBe("");
    expect(isoDesdeDigitos(visualDesdeIso("1990-03-15").replace(/\D/g, ""))).toBe("1990-03-15");
  });
});

describe("documentos de un pack: una casilla por documento", () => {
  it("el mismo documento con etiquetas distintas no se pide tres veces", () => {
    const docs = ["Pasaporte", "Certificado de empadronamiento", "Copia del pasaporte", "Pasaporte en vigor", "Antecedentes penales"];
    expect(dedupDocs(docs)).toEqual(["Pasaporte", "Certificado de empadronamiento", "Antecedentes penales"]);
  });

  it("conserva la PRIMERA etiqueta y el orden (los slots se indexan por posición)", () => {
    expect(dedupDocs(["Copia del pasaporte", "Pasaporte"])).toEqual(["Copia del pasaporte"]);
  });

  it("los documentos propios del despacho (tipo OTRO) se distinguen por su texto", () => {
    const docs = ["Contrato de alquiler", "Contrato de alquiler", "Carta de invitación"];
    expect(dedupDocs(docs)).toEqual(["Contrato de alquiler", "Carta de invitación"]);
  });
});
