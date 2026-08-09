import { describe, expect, it, vi, beforeAll } from "vitest";

// El email de confirmación de cita con COBRO: comprobamos el HTML que sale, sin
// enviar nada. Resend se sustituye por un doble que guarda el mensaje.
const enviados: { html: string; text: string; subject: string }[] = [];
vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (m: { html: string; text: string; subject: string }) => {
        enviados.push(m);
        return { error: null };
      },
    };
  },
}));

beforeAll(() => { process.env.RESEND_API_KEY = "re_test_fake"; });

const base = {
  nombre: "Julia Pérez", email: "julia@example.com", gestoria: "Gestoría Vallès",
  fecha: "2026-09-15", hora: "10:00", duracion: 30, precio: 60, lugar: "Oficina", motivo: "Consulta inicial",
};
const cobroBase = {
  facturaId: "fac-123", numero: "2026-0042", total: 60, baseUrl: "https://aproba-software.com",
  cuenta: { titular: "Gestoría Vallès SL", iban: "ES91 2100 0418 4502 0005 1332", banco: "CaixaBank" },
};

async function enviar(cobro: Parameters<typeof import("./notificaciones").enviarConfirmacionCitaPrevia>[0]["cobro"]) {
  enviados.length = 0;
  const { enviarConfirmacionCitaPrevia } = await import("./notificaciones");
  const ok = await enviarConfirmacionCitaPrevia({ ...base, cobro });
  return { ok, msg: enviados[0] };
}

describe("email de cita con cobro", () => {
  it("sin cobro no habla de pagar (solo informa del precio)", async () => {
    const { ok, msg } = await enviar(null);
    expect(ok).toBe(true);
    expect(msg.html).toContain("60,00 €"); // la fila «Precio» sigue ahí
    expect(msg.html).not.toContain("Importe a pagar");
    expect(msg.html).not.toContain("/api/pagos/checkout");
  });

  it("transferencia: IBAN, titular y el número de factura como concepto", async () => {
    const { msg } = await enviar({ ...cobroBase, transferencia: true, tarjeta: false });
    expect(msg.html).toContain("Importe a pagar");
    expect(msg.html).toContain("ES91 2100 0418 4502 0005 1332");
    expect(msg.html).toContain("Gestoría Vallès SL");
    expect(msg.html).toContain("2026-0042");
    expect(msg.html).not.toContain("con tarjeta"); // no se anuncia un medio no elegido
    expect(msg.text).toContain("IBAN: ES91 2100 0418 4502 0005 1332");
  });

  it("tarjeta: botón de pago hacia el checkout de ESA factura", async () => {
    const { msg } = await enviar({ ...cobroBase, transferencia: false, tarjeta: true });
    expect(msg.html).toContain("https://aproba-software.com/api/pagos/checkout?f=fac-123");
    expect(msg.html).toContain("Pagar 60,00 € con tarjeta");
    expect(msg.html).not.toContain("IBAN"); // transferencia no elegida
  });

  it("los dos medios conviven en el mismo bloque", async () => {
    const { msg } = await enviar({ ...cobroBase, transferencia: true, tarjeta: true });
    expect(msg.html).toContain("ES91 2100 0418 4502 0005 1332");
    expect(msg.html).toContain("/api/pagos/checkout?f=fac-123");
  });

  it("videollamada + cobro: el botón de unirse va ENCIMA del bloque de pago, y una sola vez", async () => {
    enviados.length = 0;
    const { enviarConfirmacionCitaPrevia } = await import("./notificaciones");
    await enviarConfirmacionCitaPrevia({
      ...base, videoProveedor: "meet", videoEnlace: "https://meet.google.com/abc-defg-hij",
      cobro: { ...cobroBase, transferencia: true, tarjeta: true },
    });
    const html = enviados[0].html;
    const unirse = html.indexOf("Unirse a la videollamada");
    const pago = html.indexOf("Importe a pagar");
    expect(unirse).toBeGreaterThan(-1);
    expect(pago).toBeGreaterThan(-1);
    expect(unirse).toBeLessThan(pago); // el botón, primero
    expect(html.split("meet.google.com/abc-defg-hij").length - 1).toBe(1); // un solo botón
  });

  it("videollamada SIN cobro: el botón sigue al final, como siempre", async () => {
    enviados.length = 0;
    const { enviarConfirmacionCitaPrevia } = await import("./notificaciones");
    await enviarConfirmacionCitaPrevia({
      ...base, videoProveedor: "meet", videoEnlace: "https://meet.google.com/abc-defg-hij", cobro: null,
    });
    expect(enviados[0].html).toContain("Unirse a la videollamada (Google Meet)");
    expect(enviados[0].html).not.toContain("Importe a pagar");
  });

  it("transferencia sin cuenta bancaria: no inventa un IBAN", async () => {
    const { msg } = await enviar({ ...cobroBase, cuenta: null, transferencia: true, tarjeta: false });
    expect(msg.html).toContain("Tu gestoría te facilitará los datos");
    expect(msg.html).not.toContain("IBAN");
  });
});
