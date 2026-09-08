import { describe, it, expect } from "vitest";
import { completarFichaDesdeExtraccion } from "./ficha-sync";

// Admin de mentira: una fila de Cliente en memoria + registro de los updates.
function adminFalso(fila: Record<string, unknown> | null) {
  const updates: Record<string, unknown>[] = [];
  const admin = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: fila }) }) }),
      update: (patch: Record<string, unknown>) => ({ eq: async () => { updates.push(patch); return { error: null }; } }),
    }),
  };
  return { admin: admin as unknown as Parameters<typeof completarFichaDesdeExtraccion>[0], updates };
}
const pasaporte = { estado: "VALIDADO", tipoDetectado: "PASAPORTE", campos: [
  { label: "Nº pasaporte", value: "AB123456" }, { label: "Fecha de nacimiento", value: "1990-01-01" }, { label: "Nacionalidad", value: "Colombia" },
] };

describe("completarFichaDesdeExtraccion", () => {
  it("rellena solo los huecos y devuelve sus etiquetas", async () => {
    const { admin, updates } = adminFalso({ pasaporte: "", fechaNacimiento: "1985-05-05", nacionalidad: null });
    const etiquetas = await completarFichaDesdeExtraccion(admin, "c1", pasaporte);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ pasaporte: "AB123456", nacionalidad: "Colombia" });
    expect(updates[0]).not.toHaveProperty("fechaNacimiento"); // lo escrito por una persona no se toca
    // Nacionalidad también deduce «País de nacimiento» (fichaDesdeCampos): 3 huecos.
    expect(etiquetas).toEqual(expect.arrayContaining(["Pasaporte / doc. de identidad", "Nacionalidad"]));
    expect(etiquetas.length).toBe(Object.keys(updates[0]).length);
  });
  it("no escribe nada sin cliente, sin validar o con un documento que no es de identidad", async () => {
    const { admin, updates } = adminFalso({ pasaporte: "" });
    expect(await completarFichaDesdeExtraccion(admin, null, pasaporte)).toEqual([]);
    expect(await completarFichaDesdeExtraccion(admin, "c1", { ...pasaporte, estado: "RECHAZADO" })).toEqual([]);
    expect(await completarFichaDesdeExtraccion(admin, "c1", { ...pasaporte, tipoDetectado: "EMPADRONAMIENTO" })).toEqual([]);
    expect(updates).toHaveLength(0);
  });
  it("ficha ya completa → ningún update", async () => {
    const { admin, updates } = adminFalso({ pasaporte: "X1", fechaNacimiento: "1990-01-01", nacionalidad: "Colombia", paisNacimiento: "Colombia" });
    expect(await completarFichaDesdeExtraccion(admin, "c1", pasaporte)).toEqual([]);
    expect(updates).toHaveLength(0);
  });
});
