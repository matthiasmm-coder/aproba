import { describe, it, expect } from "vitest";
import { agruparDocs, esEncargoOMandato, extensionDe, filtrarDocs, grupoDe, rutasZip, type DocEmpresaItem } from "./documentos-empresa";

const doc = (o: Partial<DocEmpresaItem>): DocEmpresaItem => ({
  id: "d1", origen: "EXPEDIENTE", grupo: "EMPRESA", tipo: "OTRO", label: "Otro documento", nombreArchivo: null, mimeType: "application/pdf",
  fecha: "2026-09-01T10:00:00Z", estado: null, trabajadorId: null, trabajador: null, expedienteId: null, expedienteRef: null, href: "/x", borrable: false, ...o,
});

describe("documentos de la empresa", () => {
  it("hojas de encargo y mandatos van juntos, vengan del expediente o subidos a mano", () => {
    expect(esEncargoOMandato("HOJA_ENCARGO")).toBe(true);
    expect(esEncargoOMandato("MANDATO")).toBe(true);
    expect(esEncargoOMandato("Mandato de representación firmado")).toBe(true);
    expect(esEncargoOMandato("OTRO", "Hoja de encargo firmada")).toBe(true);
    expect(esEncargoOMandato("PASAPORTE", "Pasaporte")).toBe(false);
    expect(grupoDe("MANDATO", "", "w1")).toBe("ENCARGO");
    expect(grupoDe("PASAPORTE", "Pasaporte", "w1")).toBe("TRABAJADOR");
    expect(grupoDe("CIF / NIF de la empresa", "CIF / NIF de la empresa", null)).toBe("EMPRESA");
  });

  it("agrupa por grupo y por trabajador, de lo más reciente a lo más antiguo", () => {
    const g = agruparDocs([
      doc({ id: "a", grupo: "TRABAJADOR", trabajadorId: "w2", trabajador: "Zoe", fecha: "2026-01-01" }),
      doc({ id: "b", grupo: "TRABAJADOR", trabajadorId: "w1", trabajador: "Ana", fecha: "2026-02-01" }),
      doc({ id: "c", grupo: "TRABAJADOR", trabajadorId: "w1", trabajador: "Ana", fecha: "2026-03-01" }),
      doc({ id: "d", grupo: "ENCARGO" }),
      doc({ id: "e", grupo: "EMPRESA" }),
    ]);
    expect(g.trabajadores.map((t) => t.nombre)).toEqual(["Ana", "Zoe"]);
    expect(g.trabajadores[0].docs.map((d) => d.id)).toEqual(["c", "b"]);
    expect(g.encargo.map((d) => d.id)).toEqual(["d"]);
    expect(g.empresa.map((d) => d.id)).toEqual(["e"]);
  });

  it("la búsqueda mira tipo, archivo, trabajador y expediente, sin acentos", () => {
    const items = [
      doc({ id: "1", label: "Pasaporte", trabajador: "José Pérez" }),
      doc({ id: "2", label: "Escritura de constitución", expedienteRef: "EXP-2026-0042" }),
      doc({ id: "3", label: "Otro documento", nombreArchivo: "poderes-notaria.pdf" }),
    ];
    expect(filtrarDocs(items, "jose").map((d) => d.id)).toEqual(["1"]);
    expect(filtrarDocs(items, "constitucion").map((d) => d.id)).toEqual(["2"]);
    expect(filtrarDocs(items, "0042").map((d) => d.id)).toEqual(["2"]);
    expect(filtrarDocs(items, "notaria").map((d) => d.id)).toEqual(["3"]);
    expect(filtrarDocs(items, "  ")).toHaveLength(3);
  });

  it("rutas del ZIP: carpeta por grupo y trabajador, fecha delante y sin repetidos", () => {
    const rutas = rutasZip([
      doc({ id: "m", grupo: "ENCARGO", label: "Mandato de representación firmado", trabajador: "Ana", fecha: "2026-05-02", expedienteRef: "EXP-1" }),
      doc({ id: "p1", grupo: "TRABAJADOR", trabajadorId: "w1", trabajador: "Ana", label: "Pasaporte", fecha: "2026-05-01" }),
      doc({ id: "p2", grupo: "TRABAJADOR", trabajadorId: "w1", trabajador: "Ana", label: "Pasaporte", fecha: "2026-05-01" }),
      doc({ id: "c", origen: "EMPRESA", grupo: "EMPRESA", label: "CIF / NIF de la empresa", fecha: null, mimeType: "image/png" }),
    ], extensionDe);
    expect(rutas.get("EXPEDIENTE:m")).toBe("Hojas de encargo y mandatos/2026-05-02 Mandato de representación firmado - Ana (EXP-1).pdf");
    expect([rutas.get("EXPEDIENTE:p1"), rutas.get("EXPEDIENTE:p2")].sort()).toEqual(["Trabajadores/Ana/2026-05-01 Pasaporte (2).pdf", "Trabajadores/Ana/2026-05-01 Pasaporte.pdf"]);
    expect(rutas.get("EMPRESA:c")).toBe("Empresa/CIF _ NIF de la empresa.png");
  });

  it("extensión: la del nombre, si no la del tipo MIME", () => {
    expect(extensionDe(null, "foto.JPG")).toBe("jpg");
    expect(extensionDe("application/pdf", null)).toBe("pdf");
    expect(extensionDe("image/webp", "sin-extension")).toBe("webp");
    expect(extensionDe(null, null)).toBe("bin");
  });
});
