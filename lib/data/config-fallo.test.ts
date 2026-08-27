import { describe, it, expect } from "vitest";
import { esFalloPasajero } from "./config";

describe("esFalloPasajero — pasajero vs bug de esquema", () => {
  it("el caso real de Sentry (27/08): JWT issued at future", () => {
    expect(esFalloPasajero("JWT issued at future")).toBe(true);
  });
  it("otros fallos de token/red", () => {
    for (const m of ["JWT expired", "invalid signature", "fetch failed", "ETIMEDOUT", "socket hang up", "503 Service Unavailable"])
      expect(esFalloPasajero(m)).toBe(true);
  });
  it("un bug de esquema NO se traga: debe seguir explotando", () => {
    for (const m of ['column "suplidos" does not exist', "relation \"AvisoConfig\" does not exist", "permission denied for table", "could not find the schema cache"])
      expect(esFalloPasajero(m)).toBe(false);
  });
});
