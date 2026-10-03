import { describe, expect, it } from "vitest";
import { MARCA_SOLICITUD_CLIENTE, descripcionSolicitud, serviciosDeDescripcion } from "@/lib/solicitudes-cliente";

// La campana encuentra el trámite pedido por el cliente por la marca del evento CREADO
// (Jennifer, 03/10/2026): la ruta la escribe y la campana la lee con las mismas reglas.
describe("trámite pedido por el cliente desde su espacio", () => {
  it("el evento lleva la marca y los servicios se recuperan tal cual", () => {
    const d = descripcionSolicitud(["Arraigo social", "Reagrupación familiar (cónyuge)"]);
    expect(d).toContain(MARCA_SOLICITUD_CLIENTE);
    expect(d).toBe("🧑‍💻 Trámite solicitado por el cliente desde su espacio (Arraigo social + Reagrupación familiar (cónyuge))");
    expect(serviciosDeDescripcion(descripcionSolicitud(["Arraigo social"]))).toBe("Arraigo social");
  });
  it("un texto sin paréntesis final no inventa servicios", () => {
    expect(serviciosDeDescripcion("Expediente creado")).toBe("");
  });
});
