import { beforeAll, describe, expect, it, vi } from "vitest";
import { aplicarCambioEmail, emailDelToken, emailValido, firmarCambio, leerCambio, VIDA_ENLACE_MS, type DepsCambio } from "./cambio-email";

beforeAll(() => { process.env.SUPABASE_SERVICE_ROLE_KEY = "clave-de-prueba"; });

describe("cambio de email · enlace firmado", () => {
  it("ida y vuelta: quién y a qué email", () => {
    const t = firmarCambio("u1", "info@asenjo.test", 1_000);
    expect(leerCambio(t, 2_000)).toEqual({ userId: "u1", email: "info@asenjo.test", caduca: 1_000 + VIDA_ENLACE_MS });
    expect(emailDelToken(t)).toBe("info@asenjo.test");
  });
  it("caduca a la hora", () => {
    const t = firmarCambio("u1", "a@b.es", 0);
    expect(leerCambio(t, VIDA_ENLACE_MS - 1)).not.toBeNull();
    expect(leerCambio(t, VIDA_ENLACE_MS + 1)).toBeNull();
  });
  it("un token retocado (otro email, otro usuario) no vale", () => {
    const t = firmarCambio("u1", "a@b.es", 0);
    const [, firma] = t.split(".");
    const otro = Buffer.from(JSON.stringify({ u: "u2", e: "a@b.es", x: VIDA_ENLACE_MS })).toString("base64url");
    expect(leerCambio(`${otro}.${firma}`, 1)).toBeNull();
    expect(leerCambio(t + "x", 1)).toBeNull();
    expect(leerCambio("", 1)).toBeNull();
    expect(leerCambio("a.b.c", 1)).toBeNull();
  });
  it("otra clave de servidor → no vale", () => {
    const t = firmarCambio("u1", "a@b.es", 0);
    process.env.SUPABASE_SERVICE_ROLE_KEY = "otra";
    expect(leerCambio(t, 1)).toBeNull();
    process.env.SUPABASE_SERVICE_ROLE_KEY = "clave-de-prueba";
  });
  it("formato de email", () => {
    expect(emailValido("info@asenjoglobalconsulting.com")).toBe(true);
    for (const e of ["", "sin-arroba", "a@b", "a b@c.es", "@c.es"]) expect(emailValido(e)).toBe(false);
  });
});

function deps(o: Partial<DepsCambio> & { actual?: string } = {}) {
  const llamadas: string[] = [];
  const d: DepsCambio = {
    leerUsuario: async () => ({ email: o.actual ?? "viejo@b.es" }),
    emailEnUso: async () => false,
    cambiarEmailAuth: vi.fn(async (_id: string, email: string) => { llamadas.push(`auth:${email}`); return null; }),
    cambiarEmailTabla: vi.fn(async (_id: string, email: string) => { llamadas.push(`tabla:${email}`); return null; }),
    sincronizarStripe: vi.fn(async () => { llamadas.push("stripe"); }),
    avisarAnterior: vi.fn(async (anterior: string) => { llamadas.push(`aviso:${anterior}`); }),
    ...o,
  };
  return { d, llamadas };
}
const c = { userId: "u1", email: "nuevo@b.es", caduca: 0 };

describe("cambio de email · aplicar", () => {
  it("cambia Auth y User, sincroniza Stripe y avisa al email anterior", async () => {
    const { d, llamadas } = deps();
    expect(await aplicarCambioEmail(c, d)).toEqual({ ok: true, email: "nuevo@b.es", anterior: "viejo@b.es" });
    expect(llamadas).toEqual(["auth:nuevo@b.es", "tabla:nuevo@b.es", "stripe", "aviso:viejo@b.es"]);
  });
  it("segundo clic en el mismo enlace: nada que hacer", async () => {
    const { d, llamadas } = deps({ actual: "nuevo@b.es" });
    expect(await aplicarCambioEmail(c, d)).toMatchObject({ ok: true, yaAplicado: true });
    expect(llamadas).toEqual([]);
  });
  it("email ya usado por otra cuenta → no toca nada", async () => {
    const { d, llamadas } = deps({ emailEnUso: async () => true });
    expect(await aplicarCambioEmail(c, d)).toEqual({ ok: false, codigo: "en_uso", status: 409 });
    expect(llamadas).toEqual([]);
  });
  it("Auth rechaza (ya registrado) → en_uso, la tabla no se toca", async () => {
    const { d, llamadas } = deps({ cambiarEmailAuth: async () => "A user with this email address has already been registered" });
    expect(await aplicarCambioEmail(c, d)).toMatchObject({ ok: false, codigo: "en_uso" });
    expect(llamadas).toEqual([]);
  });
  it("si la tabla falla, se deshace Auth (nunca quedan distintos)", async () => {
    const { d, llamadas } = deps({ cambiarEmailTabla: async () => "duplicate key value violates unique constraint" });
    expect(await aplicarCambioEmail(c, d)).toMatchObject({ ok: false, codigo: "en_uso" });
    expect(llamadas).toEqual(["auth:nuevo@b.es", "auth:viejo@b.es"]);
  });
  it("Stripe o el aviso fallan: el cambio ya está hecho y se confirma igual", async () => {
    const { d } = deps({ sincronizarStripe: async () => { throw new Error("stripe caído"); }, avisarAnterior: async () => { throw new Error("resend caído"); } });
    expect(await aplicarCambioEmail(c, d)).toMatchObject({ ok: true, email: "nuevo@b.es" });
  });
  it("cuenta inexistente → 404", async () => {
    const { d } = deps({ leerUsuario: async () => null });
    expect(await aplicarCambioEmail(c, d)).toEqual({ ok: false, codigo: "no_encontrado", status: 404 });
  });
});
