import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { bovedaDisponible, cifrarParaDespacho, descifrarDelDespacho } from "@/lib/dehu/boveda";

const antes = process.env.DEHU_CLAVE_CERTIFICADOS;
afterEach(() => { if (antes === undefined) delete process.env.DEHU_CLAVE_CERTIFICADOS; else process.env.DEHU_CLAVE_CERTIFICADOS = antes; });

describe("caja fuerte de certificados", () => {
  it("sin clave en el servidor no se guarda nada", () => {
    delete process.env.DEHU_CLAVE_CERTIFICADOS;
    expect(bovedaDisponible()).toBe(false);
    expect(() => cifrarParaDespacho(Buffer.from("x"), "ws1", "certificado")).toThrow(/no está configurada/);
    process.env.DEHU_CLAVE_CERTIFICADOS = "corta";
    expect(bovedaDisponible()).toBe(false);
  });

  it("ida y vuelta; atado al despacho y al uso; cualquier cambio lo invalida", () => {
    process.env.DEHU_CLAVE_CERTIFICADOS = crypto.randomBytes(32).toString("base64");
    const p12 = crypto.randomBytes(3000);
    const enc = cifrarParaDespacho(p12, "ws1", "certificado");
    expect(enc.startsWith("v1:")).toBe(true);
    expect(enc).not.toContain(p12.toString("base64").slice(0, 40));
    expect(descifrarDelDespacho(enc, "ws1", "certificado")?.equals(p12)).toBe(true);
    expect(descifrarDelDespacho(enc, "ws2", "certificado")).toBeNull();
    expect(descifrarDelDespacho(enc, "ws1", "clave")).toBeNull();
    const bytes = Buffer.from(enc.slice(3), "base64");
    bytes[40] ^= 1;
    const roto = `v1:${bytes.toString("base64")}`;
    expect(descifrarDelDespacho(roto, "ws1", "certificado")).toBeNull();
    process.env.DEHU_CLAVE_CERTIFICADOS = crypto.randomBytes(32).toString("base64");
    expect(descifrarDelDespacho(enc, "ws1", "certificado")).toBeNull(); // otra clave maestra
  });
});
