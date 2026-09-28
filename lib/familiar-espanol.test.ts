import { describe, expect, it } from "vitest";
import { DEFAULT_SERVICIOS, claveDelCatalogo } from "./servicios";
import { formulariosDelTramite, formulariosParaTramite } from "./ex-forms";
import { tasasDelTramite } from "./tasas";
import { TEMA_POR_CLAVE } from "./temas";
import { dedupDocs } from "./tramites";
import { SERVICIO_I18N } from "./portal-i18n";

// 28/09/2026 — «Familiar de ciudadano español» (RD 1155/2024, arts. 93-98; Hoja 18 del
// Ministerio): los cuatro despachos que lo tramitaban se habían creado el servicio a mano,
// sin EX-24. Un despacho en prueba lo montó así y vio la pantalla Formularios vacía.

describe("catálogo: familiar de ciudadano español", () => {
  const s = DEFAULT_SERVICIOS.find((x) => x.id === "familiar_espanol");
  it("existe, activo por defecto, en la carpeta Familia", () => {
    expect(s).toMatchObject({ label: "Familiar de ciudadano español", active: true, categoria: "Familia" });
    expect(TEMA_POR_CLAVE.familiar_espanol).toBe("Familia");
    expect(s!.precio).toBe(s!.anticipo + s!.resto);
  });
  it("propone el EX-24 (sirve para la inicial y la renovación)", () => {
    expect(formulariosDelTramite("OTRO", ["familiar_espanol"])).toEqual(["EX-24"]);
    expect(formulariosParaTramite("OTRO", "familiar_espanol")).toEqual(["EX-24"]);
  });
  it("no propone tasa: el procedimiento es gratuito (la 790-012 de la TIE llega después)", () => {
    expect(tasasDelTramite("OTRO", ["familiar_espanol"])).toEqual([]);
  });
  it("pide los documentos de la Hoja 18, y el DNI del familiar no se funde con el pasaporte", () => {
    expect(s!.docs).toEqual(["Pasaporte", "DNI del familiar español", "Justificante del vínculo familiar", "Antecedentes penales"]);
    expect(dedupDocs(s!.docs)).toEqual(s!.docs);
    expect(s!.docs.join(" ")).not.toMatch(/empadronamiento|medios econ/i);
  });
  it("el portal del cliente lo traduce con el mismo texto en español", () => {
    expect(SERVICIO_I18N.familiar_espanol.label.es).toBe(s!.label);
    expect(SERVICIO_I18N.familiar_espanol.desc.es).toBe(s!.desc);
  });
});

describe("claveDelCatalogo — servicios propios con nombre de trámite", () => {
  it("los nombres que usan los despachos → familiar_espanol", () => {
    for (const n of [
      "Familiar Español", "Familiar de Ciudadano Español", "Residencia de familiar de ciudadano español",
      "Permiso de residencia de familiar de ciudadano español",
      "Residencia de familiares de personas con nacionalidad española", "RENOVACIÓN FAMILIAR ESPAÑOL",
    ]) expect(claveDelCatalogo("srv_abc1234", n), n).toBe("familiar_espanol");
  });
  it("ante la duda, se queda la clave propia (no se propone nada)", () => {
    for (const n of [
      "Modificacion de Residencia de Familiar Español o Ciudadano Comunitario", "Tarjeta de familiar de ciudadano UE",
      "Arraigo familiar (hijo de español)", "Reagrupación familiar", "Nacionalidad española",
      "Nacionalidad española para familiar de español", "Familiar de ciudadano de la Unión Europea",
    ]) expect(claveDelCatalogo("srv_abc1234", n), n).toBe("srv_abc1234");
  });
  it("no toca las claves del catálogo ni las especiales; sin nombre, tampoco", () => {
    expect(claveDelCatalogo("arraigo_social", "Familiar español")).toBe("arraigo_social");
    expect(claveDelCatalogo("cuenta_ajena", "Familiar español")).toBe("cuenta_ajena");
    expect(claveDelCatalogo("srv_abc1234", null)).toBe("srv_abc1234");
    expect(claveDelCatalogo(null, "Familiar español")).toBeNull();
  });
  it("un servicio propio reconocido recibe el EX-24 en la pantalla Formularios", () => {
    const c = claveDelCatalogo("srv_u0g9nqp", "Familiar de Ciudadano Español");
    expect(formulariosDelTramite("OTRO", [c])).toEqual(["EX-24"]);
  });
});
