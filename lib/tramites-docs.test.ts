import { describe, expect, it } from "vitest";
import { dedupDocs, labelADocTipo } from "./tramites";
import { docLabel } from "./portal-i18n";

describe("dedupDocs", () => {
  it("colapsa etiquetas distintas del mismo tipo y conserva la primera", () => {
    expect(dedupDocs(["Pasaporte completo", "Pasaporte en vigor", "TIE actual"])).toEqual(["Pasaporte completo", "TIE actual"]);
  });
  it("los personalizados (OTRO) no se colapsan entre sí, pero sí sus duplicados exactos", () => {
    expect(dedupDocs(["Carta de la parroquia", "Informe del ayuntamiento", "carta de la PARROQUIA"]))
      .toEqual(["Carta de la parroquia", "Informe del ayuntamiento"]);
  });
});

describe("docLabel — documentos personalizados", () => {
  it("un doc custom (OTRO) muestra SU nombre configurado, no «Documento»", () => {
    expect(docLabel("Certificado de subvención municipal", "es")).toBe("Certificado de subvención municipal");
    expect(docLabel("Certificado de subvención municipal", "fr")).toBe("Certificado de subvención municipal");
  });
  it("los tipos conocidos se siguen traduciendo", () => {
    expect(docLabel("Pasaporte completo", "es")).toBe("Pasaporte");
  });
});


// 21/09/2026: «Informe de vida laboral» y «Antecedentes penales» van juntos en el arraigo
// laboral; con el mismo tipo el dedup se comía uno (la ficha uno, el portal el otro).
describe("vida laboral ≠ antecedentes penales", () => {
  it("los dos sobreviven al dedup del servicio", () => {
    const lista = ["Pasaporte", "Informe de vida laboral", "Certificado de empadronamiento", "Antecedentes penales"];
    expect(dedupDocs(lista)).toEqual(lista);
    expect(labelADocTipo("Informe de vida laboral")).toBe("OTRO");
    expect(labelADocTipo("Certificado de antecedentes penales")).toBe("ANTECEDENTES_PENALES");
  });
});
