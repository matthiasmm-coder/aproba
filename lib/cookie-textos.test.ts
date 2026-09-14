import { describe, it, expect } from "vitest";
import { LANGS_COOKIE, textosCookie, esLangCookie } from "./cookie-textos";
import { makeT, LANGS, esLangSoportada } from "./portal-i18n";

// El aviso de cookies tiene su copia de las frases para no cargar el diccionario del portal
// en todas las páginas: esta prueba impide que las dos copias se separen.
describe("textos del aviso de cookies = diccionario del portal", () => {
  it("mismos idiomas que el portal", () => {
    expect([...LANGS_COOKIE].sort()).toEqual(LANGS.map((l) => l.code).sort());
    for (const v of ["es", "ro", "zh", "ca", "", null]) expect(esLangCookie(v)).toBe(esLangSoportada(v));
  });
  it("mismas frases (incluido el repliegue al español)", () => {
    for (const lang of LANGS_COOKIE) {
      const t = makeT(lang), c = textosCookie(lang);
      expect(c.texto, lang).toBe(t("cookies.texto"));
      expect(c.politica, lang).toBe(t("cookies.politica"));
      expect(c.ok, lang).toBe(t("cookies.ok"));
    }
  });
});
