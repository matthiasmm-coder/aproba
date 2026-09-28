import { describe, expect, it } from "vitest";
import { novedadesDe } from "./novedades";
import { translate } from "./app-i18n";

// 28/09/2026 — aviso dirigido a AG Global: el EX-24 de su trámite de familiar de español.
const AG_GLOBAL = "81e5194e-dd74-48f1-a877-dfbcfedeb479";

describe("novedades dirigidas", () => {
  it("solo le sale al despacho al que va dirigida", () => {
    const antes = new Date("2026-09-29T09:00:00+02:00");
    expect(novedadesDe(AG_GLOBAL, antes).map((n) => n.id)).toEqual(["ex24-familiar-espanol"]);
    expect(novedadesDe("otro-despacho", antes)).toEqual([]);
    expect(novedadesDe(null, antes)).toEqual([]);
  });
  it("caduca sola en su fecha", () => {
    expect(novedadesDe(AG_GLOBAL, new Date("2026-10-16T23:59:00+02:00"))).toHaveLength(1);
    expect(novedadesDe(AG_GLOBAL, new Date("2026-10-17T00:00:00+02:00"))).toEqual([]);
  });
  it("lleva al Formularios de su expediente y tiene sus textos en catalán", () => {
    const [n] = novedadesDe(AG_GLOBAL, new Date("2026-09-29T09:00:00+02:00"));
    expect(n.href).toMatch(/^\/app\/expedientes\/[0-9a-f-]{36}\/formularios$/);
    for (const s of [n.titulo, n.texto, n.cta, "Novedad"]) expect(translate("ca", s), s).not.toBe(s);
  });
});
