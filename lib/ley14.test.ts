import { describe, expect, it } from "vitest";
import { claveLey14, esLey14, mesesValidezLey14 } from "./ley14";
import { claveDelCatalogo } from "./servicios";
import { formulariosDelTramite } from "./ex-forms";
import { sugerirServicioRenovacion } from "./renovacion-servicio";

// Ley 14/2013 — movilidad internacional (01/10/2026).
describe("qué es Ley 14/2013", () => {
  it("las claves del catálogo y las antiguas", () => {
    for (const k of ["ley14_cualificado", "ley14_traslado", "ley14_teletrabajo", "ley14_emprendedor", "ley14_renovacion", "movilidad_internacional", "ley_14_2013", "nomada_digital"]) {
      expect(esLey14(k)).toBe(true);
    }
  });
  it("una clave del régimen general nunca lo es, diga lo que diga el nombre", () => {
    expect(esLey14("arraigo_laboral", "Arraigo para altamente cualificados")).toBe(false);
    expect(esLey14("renovacion_tie")).toBe(false);
  });
  it("un servicio propio se reconoce por su nombre, sin falsos positivos", () => {
    expect(esLey14("srv_1", "Permiso de residencia para nómada digital")).toBe(true);
    expect(esLey14("srv_2", "Profesional altamente cualificado (UGE)")).toBe(true);
    expect(esLey14("srv_3", "Traslado intraempresarial")).toBe(true);
    expect(esLey14("srv_4", "Visado de emprendedor (ENISA)")).toBe(true);
    expect(esLey14("srv_5", "CUE - trabajador cuenta ajena")).toBe(false);
    expect(esLey14("srv_6", "Alta de autónomo")).toBe(false);
    expect(esLey14("srv_7", "Arraigo socioformativo")).toBe(false);
  });
  it("cada nombre cae en su supuesto", () => {
    expect(claveLey14("srv_1", "Permiso de residencia para nómada digital")).toBe("ley14_teletrabajo");
    expect(claveLey14("srv_2", "PAC - altamente cualificado")).toBe("ley14_cualificado");
    expect(claveLey14("srv_3", "Renovación nómada digital")).toBe("ley14_renovacion");
    expect(claveLey14("srv_4", "Ley 14/2013 investigador")).toBe("movilidad_internacional");
    expect(claveLey14("nomada_digital")).toBe("ley14_teletrabajo");
    expect(claveLey14("arraigo_social")).toBeNull();
  });
});

describe("integración en el producto", () => {
  it("los modelos MI salen para cada supuesto y para un propio reconocido", () => {
    expect(formulariosDelTramite("OTRO", "ley14_cualificado")).toEqual(["MI-T", "MI-TIE", "MI-F"]);
    expect(formulariosDelTramite("OTRO", claveDelCatalogo("srv_9", "Nómada digital"))).toEqual(["MI-T", "MI-TIE", "MI-F"]);
  });
  it("Vigía conoce la validez de cada autorización", () => {
    expect(mesesValidezLey14("ley14_cualificado")).toBeGreaterThan(0);
    expect(mesesValidezLey14("srv_1", "Nómada digital")).toBeGreaterThan(0);
    expect(mesesValidezLey14("arraigo_social")).toBeNull();
  });
  it("la renovación propone el servicio de la Ley 14/2013, no la de TIE", () => {
    const cat = [{ id: "renovacion_tie", label: "Renovación de TIE", active: true }, { id: "ley14_renovacion", label: "Renovación Ley 14/2013", active: true }];
    expect(sugerirServicioRenovacion("LEY14", cat)).toEqual({ id: "ley14_renovacion", certeza: "seguro" });
    expect(sugerirServicioRenovacion("TIE", cat)).toEqual({ id: "renovacion_tie", certeza: "seguro" });
    expect(sugerirServicioRenovacion("LEY14", [{ id: "srv_r", label: "Renovación PAC (UGE)", active: true }])).toEqual({ id: "srv_r", certeza: "probable" });
  });
});

describe("portal del cliente en su idioma", () => {
  it("cada casilla de los servicios de la Ley 14/2013 sale traducida al inglés", async () => {
    const { DEFAULT_SERVICIOS } = await import("./servicios");
    const { docLabel } = await import("./portal-i18n");
    const { SERVICIOS_LEY14 } = await import("./ley14");
    const docs = DEFAULT_SERVICIOS.filter((s) => (SERVICIOS_LEY14 as readonly string[]).includes(s.id)).flatMap((s) => s.docs);
    expect(docs.length).toBeGreaterThan(20);
    for (const d of docs) expect(docLabel(d, "en"), d).not.toBe(d);
  });
  it("«todas las páginas» no se pierde ni hereda la ayuda del pasaporte genérico", async () => {
    const { docLabel, docHelp } = await import("./portal-i18n");
    expect(docLabel("Pasaporte completo (todas las páginas)", "en")).toBe("Full passport (all pages)");
    expect(docHelp("Pasaporte completo (todas las páginas)", "en")).toBe("");
    expect(docLabel("Pasaporte", "en")).toBe("Passport");
  });
});
