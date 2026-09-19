import { describe, expect, it } from "vitest";
import { temaSugerido, temaEfectivo, unificarTemas } from "./temas";

describe("temas del catálogo", () => {
  it("las claves del catálogo tienen tema fijo", () => {
    expect(temaSugerido("arraigo_social", "Residencia por arraigo")).toBe("Arraigo");
    expect(temaSugerido("nacionalidad", "Lo que sea")).toBe("Nacionalidad");
    expect(temaSugerido("renovacion_tie", "Gestión de TIE")).toBe("Residencia");
    expect(temaSugerido("movilidad_internacional", "")).toBe("Trabajo");
  });

  // Los nombres REALES del catálogo de Juan (40 servicios propios, ninguno con tema).
  it.each([
    ["Estancia de estudios", "Estudios"],
    ["Prórroga de estancia de estudios", "Estudios"],
    ["Homologación de título universitario", "Estudios"],
    ["CUE ESTUDIANTES", "Estudios"],
    ["Modificación de estancia por estudios a residencia", "Residencia"],
    ["Autorización de regreso", "Residencia"],
    ["Permiso de residencia de familiar de ciudadano de la UE", "Familia"],
    ["Residencia de menor nacido en España", "Familia"],
    ["Registro de pareja de hecho o casamiento", "Familia"],
    ["Permiso de residencia para nómada digital", "Trabajo"],
    ["CUE - trabajador cuenta ajena", "Trabajo"],
    ["Alta de autónomo / coordinación alta autónomo", "Trabajo"],
    ["Recurso de reposición en extranjería", "Recursos"],
    ["Contestación a requerimiento de Extranjería", "Recursos"],
    ["Carta de invitación", "Visados"],
    ["NIE + NUSS", "Residencia"],
  ])("deduce el tema de «%s» → %s", (label, tema) => {
    expect(temaSugerido("srv_" + label.length, label)).toBe(tema);
  });

  it("no inventa tema cuando el nombre no dice nada", () => {
    expect(temaSugerido("srv_x", "ROMANE - GESTIONES VARIAS")).toBeNull();
    expect(temaSugerido("srv_y", "Certificado digital FNMT")).toBeNull();
    expect(temaSugerido("srv_z", "")).toBeNull();
    expect(temaSugerido(null, null)).toBeNull();
  });

  it("lo que escribió el despacho manda sobre la propuesta", () => {
    expect(temaEfectivo("Mis arraigos", "arraigo_social", "Arraigo social")).toBe("Mis arraigos");
    expect(temaEfectivo("  ", "arraigo_social", "Arraigo social")).toBe("Arraigo");
    expect(temaEfectivo(null, "srv_1", "Consulta online")).toBeNull();
  });

  it("une las grafías de un mismo tema y conserva la primera", () => {
    const { lista, canon } = unificarTemas(["ARRAIGO", "Residencia", "arraigo ", null, "  ", "Árraigo"]);
    expect(lista).toEqual(["ARRAIGO", "Residencia"]);
    expect(canon.get("arraigo")).toBe("ARRAIGO");
  });
});
