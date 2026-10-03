import { describe, expect, it } from "vitest";
import { CANJE_VACIO, PAISES_CONVENIO, avisosCanje, avisosCanjeEnviados, claveAvisoCanje, datosCanjeValidos, datosParaSede, esServicioCanje, esUeEee, fraseAvisoCanje, hitoCanje, plazosCanje, situacionCanje, tieneConvenio } from "@/lib/canje";
import { DEFAULT_SERVICIOS, claveDelCatalogo } from "@/lib/servicios";
import { LANGS, SERVICIO_I18N, docLabel, temaLabel } from "@/lib/portal-i18n";

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
  it("el portal del cliente lo enseña en sus 8 idiomas (servicio y carpeta «Tráfico»)", () => {
    const s = DEFAULT_SERVICIOS.find((x) => x.id === "canje_permiso")!;
    expect(s.active).toBe(true);
    expect(SERVICIO_I18N.canje_permiso.label.es).toBe(s.label);
    expect(SERVICIO_I18N.canje_permiso.desc.es).toBe(s.desc);
    for (const { code } of LANGS) {
      expect(SERVICIO_I18N.canje_permiso.label[code], code).toBeTruthy();
      expect(SERVICIO_I18N.canje_permiso.desc[code], code).toBeTruthy();
    }
    expect(temaLabel(s.categoria!, "fr")).toBe("Permis et véhicules");
    expect(temaLabel("trafico", "en")).toBe("Driving & vehicles");
    expect(temaLabel("Tráfico", "es")).toBe("Tráfico");
  });
  it("plazos vigilados: 6 meses hasta la entrega en la Jefatura; informe y caducidad hasta presentar", () => {
    const d = { ...base, residenciaDesde: "2026-05-01", informeMedicoEl: "2026-09-01", caducidad: "2026-10-20" };
    expect(plazosCanje(d, { presentado: false, hoy: HOY })).toEqual([
      { tipo: "seis_meses", fecha: "2026-11-01", dias: 29 },
      { tipo: "informe", fecha: "2026-11-30", dias: 58 },
      { tipo: "caducidad", fecha: "2026-10-20", dias: 17 },
    ]);
    // Presentada la solicitud: solo quedan los 6 meses; entregado el permiso: nada.
    expect(plazosCanje(d, { presentado: true, hoy: HOY }).map((p) => p.tipo)).toEqual(["seis_meses"]);
    expect(plazosCanje({ ...d, entregadoEl: "2026-10-01" }, { presentado: true, hoy: HOY })).toEqual([]);
  });

  it("hitos: cada plazo avisa en sus umbrales (30/7/0, 15/0, 30/0) y la clave lleva la fecha", () => {
    const p = (tipo: "seis_meses" | "informe" | "caducidad", dias: number) => ({ tipo, fecha: "2026-11-01", dias });
    expect(hitoCanje(p("seis_meses", 31))).toBeNull();
    expect(hitoCanje(p("seis_meses", 30))).toBe(30);
    expect(hitoCanje(p("seis_meses", 8))).toBe(30);
    expect(hitoCanje(p("seis_meses", 7))).toBe(7);
    expect(hitoCanje(p("seis_meses", 0))).toBe(0);
    expect(hitoCanje(p("seis_meses", -40))).toBe(0);
    expect(hitoCanje(p("informe", 16))).toBeNull();
    expect(hitoCanje(p("informe", 15))).toBe(15);
    expect(hitoCanje(p("caducidad", 12))).toBe(30);
    expect(claveAvisoCanje(p("informe", 3), 15)).toBe("informe|2026-11-01|15");
  });

  it("los avisos enviados se leen del jsonb sin tocar los datos del formulario", () => {
    const guardado = { ...base, avisos: ["seis_meses|2026-11-01|30", 7, "x".repeat(80)] };
    expect(avisosCanjeEnviados(guardado)).toEqual(["seis_meses|2026-11-01|30"]);
    expect(avisosCanjeEnviados(null)).toEqual([]);
    expect(datosCanjeValidos(guardado)).not.toHaveProperty("avisos");
  });

  it("situación: presentado por fecha o por estado; resuelto, rechazado o finalizado = terminado", () => {
    expect(situacionCanje("EN_PREPARACION", null)).toEqual({ presentado: false, terminado: false });
    expect(situacionCanje("EN_PREPARACION", "2026-10-01T12:00:00Z")).toEqual({ presentado: true, terminado: false });
    expect(situacionCanje("PRESENTADO", null)).toEqual({ presentado: true, terminado: false });
    expect(situacionCanje("RESUELTO", null).terminado).toBe(true);
    expect(situacionCanje("FINALIZADO", null).terminado).toBe(true);
  });

  it("la frase del aviso dice la fecha, cuánto falta y qué hacer", () => {
    expect(fraseAvisoCanje({ tipo: "seis_meses", fecha: "2026-11-01", dias: 7 })).toBe("su permiso deja de valer para conducir en España el 01/11/2026 (en 7 días; 6 meses desde la residencia)");
    expect(fraseAvisoCanje({ tipo: "seis_meses", fecha: "2026-09-01", dias: -32 })).toContain("ya no vale para conducir en España desde el 01/09/2026 (hace 32 días)");
    expect(fraseAvisoCanje({ tipo: "informe", fecha: "2026-10-03", dias: 0 })).toBe("el informe médico caduca el 03/10/2026 (hoy): pide el canje antes");
    expect(fraseAvisoCanje({ tipo: "caducidad", fecha: "2026-10-04", dias: 1 })).toBe("el permiso extranjero caduca el 04/10/2026 (mañana): para canjearlo tiene que estar en vigor");
  });
  it("permiso expedido después de empezar a residir en España: aviso (no bloqueo, por las renovaciones)", () => {
    const tarde = avisosCanje({ ...base, expedicion: "2026-06-01", residenciaDesde: "2026-04-10" }, { hoy: HOY });
    expect(tarde.find((a) => a.clave.startsWith("Expedido el"))).toMatchObject({ nivel: "atencion", fecha: "2026-06-01" });
    const antes = avisosCanje({ ...base, residenciaDesde: "2026-04-10" }, { hoy: HOY }); // expedido en 2018
    expect(antes.some((a) => a.clave.startsWith("Expedido el"))).toBe(false);
  });
  it("el portal traduce las dos piezas propias del canje en sus 8 idiomas (Pasaporte y TIE, por su tipo)", () => {
    const s = DEFAULT_SERVICIOS.find((x) => x.id === "canje_permiso")!;
    // («TIE actual» en rumano se dice igual: por eso solo se exige que cambien las dos propias.)
    const propias = s.docs.filter((d) => /conducir|psicof/i.test(d));
    expect(propias).toHaveLength(2);
    for (const doc of propias) for (const { code } of LANGS) {
      if (code === "es") continue;
      expect(docLabel(doc, code), `${doc} · ${code}`).not.toBe(doc);
    }
    expect(docLabel("Permiso de conducir extranjero (anverso y reverso)", "fr")).toBe("Permis de conduire étranger (recto et verso)");
    expect(docLabel("Informe de aptitud psicofísica (centro de reconocimiento)", "en")).toBe("Driver fitness medical report (approved test centre)");
  });
});
