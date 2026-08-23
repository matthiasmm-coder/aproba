import { describe, it, expect } from "vitest";
import { emparejarDocs } from "@/lib/tramites";

// El caso que rompía el portal: dos documentos pedidos a mano caen los dos en OTRO.
describe("emparejarDocs", () => {
  it("da a cada casilla propia SU documento (no las dos a la vez)", () => {
    const labels = ["Certificado médico oficial", "Foto tamaño carnet"];
    const docs = [{ tipo: "OTRO", etiqueta: "Foto tamaño carnet", id: "a" }];
    const r = emparejarDocs(labels, docs);
    expect(r[0]).toBeNull();
    expect(r[1]?.id).toBe("a");
  });

  it("un documento no llena dos casillas", () => {
    const docs = [{ tipo: "PASAPORTE", etiqueta: null, id: "p" }];
    const r = emparejarDocs(["Pasaporte", "Pasaporte completo"], docs);
    expect(r.filter(Boolean)).toHaveLength(1);
  });

  it("las filas antiguas (sin etiqueta) siguen casando por tipo", () => {
    const docs = [{ tipo: "EMPADRONAMIENTO", etiqueta: null, id: "e" }];
    expect(emparejarDocs(["Certificado de empadronamiento"], docs)[0]?.id).toBe("e");
  });

  it("la etiqueta manda sobre el tipo", () => {
    const docs = [
      { tipo: "TITULO_ESTUDIOS", etiqueta: "Título homologado", id: "h" },
      { tipo: "TITULO_ESTUDIOS", etiqueta: null, id: "t" },
    ];
    const r = emparejarDocs(["Título de estudios", "Título homologado"], docs);
    expect(r[0]?.id).toBe("t");
    expect(r[1]?.id).toBe("h");
  });

  it("un documento con etiqueta de OTRA casilla no se usa por tipo", () => {
    const docs = [{ tipo: "OTRO", etiqueta: "Foto tamaño carnet", id: "f" }];
    expect(emparejarDocs(["Certificado médico oficial"], docs)[0]).toBeNull();
  });
});
