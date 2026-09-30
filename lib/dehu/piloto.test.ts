import { describe, it, expect, afterEach } from "vitest";
import crypto from "node:crypto";
import { DESPACHOS_PILOTO_DEHU, dehuAutomaticaPermitida } from "./piloto";
import { ConexionRechazada, conectarDehu, estadoDehuAutomatica } from "./sincronizar";

// 30/09/2026 — con la clave y la migración en producción, la tarjeta «DEHú automática ·
// Conectar» salía a TODOS los despachos. Fase piloto: solo los espacios de demostración.
const CARMEN = "db135ffb-e0b8-442c-b654-795ede089185";
const CLIENTES_REALES = [
  "f8b46f76-d577-435f-b49b-76e1747838a8", // Gestoría Extranjería Valencia
  "65bc1e7e-0000-0000-0000-000000000000", // un despacho cualquiera fuera del piloto
  "367a2240-8c86-40ed-82a0-52e8d9c96011", // Asenjo
];

const antes = process.env.DEHU_CLAVE_CERTIFICADOS;
afterEach(() => { if (antes === undefined) delete process.env.DEHU_CLAVE_CERTIFICADOS; else process.env.DEHU_CLAVE_CERTIFICADOS = antes; });

// Admin falso: DehuConexion existe (migración hecha) y el despacho aún no se ha conectado.
const adminSinConexion = {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
} as never;

describe("DEHú automática: fase piloto", () => {
  it("solo los espacios de demostración", () => {
    expect([...DESPACHOS_PILOTO_DEHU]).toHaveLength(3);
    expect(dehuAutomaticaPermitida(CARMEN)).toBe(true);
    expect(dehuAutomaticaPermitida("ws_lc054xg1az")).toBe(true);
    for (const ws of CLIENTES_REALES) expect(dehuAutomaticaPermitida(ws)).toBe(false);
    expect(dehuAutomaticaPermitida(null)).toBe(false);
    expect(dehuAutomaticaPermitida("")).toBe(false);
  });

  it("con clave y migración, la tarjeta se ve en el piloto y NO en un despacho cliente", async () => {
    process.env.DEHU_CLAVE_CERTIFICADOS = crypto.randomBytes(32).toString("base64");
    expect(await estadoDehuAutomatica(adminSinConexion, CARMEN)).toMatchObject({ disponible: true, migracion: true, conectada: false });
    for (const ws of CLIENTES_REALES) {
      expect(await estadoDehuAutomatica(adminSinConexion, ws)).toMatchObject({ disponible: false, conectada: false });
    }
  });

  it("un despacho fuera del piloto no puede conectar, ni siquiera llamando a la API directamente", async () => {
    process.env.DEHU_CLAVE_CERTIFICADOS = crypto.randomBytes(32).toString("base64");
    const intento = conectarDehu(adminSinConexion, { workspaceId: CLIENTES_REALES[0], p12: Buffer.from("no-es-un-p12"), clave: "x", entorno: "PRODUCCION", userId: "u1" });
    await expect(intento).rejects.toBeInstanceOf(ConexionRechazada);
    await expect(conectarDehu(adminSinConexion, { workspaceId: CLIENTES_REALES[0], p12: Buffer.from("no-es-un-p12"), clave: "x", entorno: "PRODUCCION", userId: "u1" }))
      .rejects.toThrow("aún no está disponible para tu despacho");
  });
});
