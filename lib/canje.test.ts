import { describe, expect, it } from "vitest";
import { CANJE_VACIO, PAISES_CONVENIO, avisosCanje, datosCanjeValidos, datosParaSede, esServicioCanje, esUeEee, tieneConvenio } from "@/lib/canje";
import { claveDelCatalogo } from "@/lib/servicios";

// Canje del permiso de conducir (Jennifer y Samara, 03/10/2026). Fuente: dgt.es, 03/10/2026.
const HOY = new Date("2026-10-03T10:00:00Z");
const base = { ...CANJE_VACIO, pais: "Perú", numero: "Q12345678", clases: ["B"], expedicion: "2018-05-10", caducidad: "2028-05-10" };

describe("canje del permiso de conducir", () => {
  it("los 33 países con convenio de la DGT; con o sin tildes; la UE aparte", () => {
    expect(PAISES_CONVENIO).toHaveLength(33);
    expect(tieneConvenio("peru")).toBe(true);
    expect(tieneConvenio("República Dominicana")).toBe(true);
    expect(tieneConvenio("Venezuela")).toBe(false); // ya no está en la lista de la DGT
    expect(tieneConvenio("Reino Unido")).toBe(true);
    expect(esUeEee("Francia")).toBe(true);
    expect(tieneConvenio("Francia")).toBe(false);
  });

  it("reconoce el servicio del catálogo y los propios por su nombre", () => {
    expect(esServicioCanje("canje_permiso")).toBe(true);
    expect(esServicioCanje("srv_hh5sssg", "Canje de licencia de conducir extranjera")).toBe(true);
    expect(esServicioCanje("arraigo_social", "Arraigo social")).toBe(false);
  });

  it("lee con cuidado: clases válidas y en orden, fechas reales, textos recortados", () => {
    const d = datosCanjeValidos({ pais: "  Perú ", clases: ["c", "B", "x", "b"], expedicion: "2018-02-31", caducidad: "2028-05-10", numero: 123 });
    expect(d.pais).toBe("Perú");
    expect(d.clases).toEqual(["B", "C"]);
    expect(d.expedicion).toBe("");
    expect(d.numero).toBe("");
    expect(datosCanjeValidos(null)).toEqual(CANJE_VACIO);
  });

  it("sin convenio o caducado: lo que impide el canje sale primero", () => {
    const a = avisosCanje({ ...base, pais: "Venezuela", caducidad: "2026-01-01" }, { hoy: HOY });
    expect(a.map((x) => x.nivel)).toEqual(["bloqueo", "bloqueo"]);
    expect(a[0].clave).toContain("Sin convenio");
    expect(a[1].fecha).toBe("2026-01-01");
  });

  it("los dos plazos: 6 meses desde la residencia y 90 días del informe médico", () => {
    const a = avisosCanje({ ...base, residenciaDesde: "2026-05-20", informeMedicoEl: "2026-09-01" }, { hoy: HOY });
    const seis = a.find((x) => x.clave.includes("6 meses"))!;
    expect(seis.fecha).toBe("2026-11-20");
    expect(seis.nivel).toBe("info"); // quedan 48 días
    // A 30 días o menos, en ámbar; pasado el plazo, aviso de que ya no puede conducir con él.
    expect(avisosCanje({ ...base, residenciaDesde: "2026-04-20" }, { hoy: HOY }).find((x) => x.clave.includes("6 meses"))!.nivel).toBe("atencion");
    expect(avisosCanje({ ...base, residenciaDesde: "2026-01-10" }, { hoy: HOY }).find((x) => x.clave.includes("6 meses"))!.clave).toContain("ya no vale para conducir");
    const informe = a.find((x) => x.clave.includes("informe médico"))!;
    expect(informe.fecha).toBe("2026-11-30");
    expect(informe.nivel).toBe("info");
  });

  it("presentado: el informe médico ya no importa; entregado en la Jefatura: autorización provisional", () => {
    const a = avisosCanje({ ...base, informeMedicoEl: "2026-01-01", residenciaDesde: "2026-01-01", entregadoEl: "2026-09-30" }, { presentado: true, hoy: HOY });
    expect(a.map((x) => x.nivel)).toEqual(["ok"]);
  });

  it("camión o autobús: pruebas posibles y tasa 2.1; Argentina y Nueva Zelanda, su nota", () => {
    expect(avisosCanje({ ...base, clases: ["B", "C"] }, { hoy: HOY }).some((x) => x.n === 94.05)).toBe(true);
    expect(avisosCanje({ ...base, pais: "Argentina" }, { hoy: HOY })[0].clave).toContain("legalidad y antigüedad");
    expect(avisosCanje({ ...base, pais: "Nueva Zelanda" }, { hoy: HOY })[0].clave).toContain("solo se canjean moto y coche");
  });

  it("datos para la sede, en el orden del formulario y sin vacíos", () => {
    expect(datosParaSede(base, { nombre: "Ana Ruiz", documento: "Y1234567X", fechaNacimiento: "1990-05-02" })).toEqual([
      ["Nombre y apellidos", "Ana Ruiz"], ["NIE o pasaporte", "Y1234567X"], ["Fecha de nacimiento", "02/05/1990"],
      ["País de expedición", "Perú"], ["Nº del permiso", "Q12345678"], ["Clases", "B"],
      ["Fecha de expedición", "10/05/2018"], ["Fecha de caducidad", "10/05/2028"],
    ]);
  });
});

describe("servicio propio de canje", () => {
  it("se trata como el del catálogo: sin modelos EX que proponer", () => {
    expect(claveDelCatalogo("srv_hh5sssg", "Canje de licencia de conducir extranjera")).toBe("canje_permiso");
    expect(claveDelCatalogo("srv_x1", "Canje carnet de conducir")).toBe("canje_permiso");
    expect(claveDelCatalogo("srv_x2", "Arraigo social")).toBe("srv_x2");
  });
});
