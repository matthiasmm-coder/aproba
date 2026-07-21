import { describe, expect, it } from "vitest";
import { dedupDocs } from "./tramites";
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
