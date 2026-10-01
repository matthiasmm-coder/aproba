import { describe, expect, it } from "vitest";
import { construirAlertas, plazoCaducidad, type NotifFuente, type ReqFuente, type VencFuente } from "@/lib/alertas";

const HOY = new Date(2026, 8, 26, 10, 0, 0);
const dia = (n: number) => new Date(2026, 8, 26 + n).toISOString();
const req = (id: string, dias: number, avisarDias = 3): ReqFuente => ({ id, expedienteId: `e${id}`, clienteNombre: `Cliente ${id}`, asunto: "Pasaporte", fechaLimite: dia(dias), avisarDias });
const venc = (id: string, dias: number, estado = "PENDIENTE", extra: Partial<VencFuente> = {}): VencFuente => ({ id, clienteNombre: `Cliente ${id}`, tipo: "TIE", dias, estado, propuestaAt: null, solicitadoAt: null, ...extra });

describe("campana · qué es una alerta", () => {
  it("un requerimiento solo avisa dentro de su «Avisarme (días antes)» o vencido", () => {
    const a = construirAlertas([req("lejos", 12), req("umbral", 3), req("hoy", 0), req("vencido", -2), req("seis", 6, 7)], [], HOY);
    expect(a.map((x) => x.id)).toEqual(["req-vencido", "req-hoy", "req-umbral", "req-seis"]);
    expect(a.find((x) => x.id === "req-vencido")!.nivel).toBe("critico");
    expect(a.find((x) => x.id === "req-hoy")!.plazo.clave).toBe("Vence hoy");
    expect(a.find((x) => x.id === "req-umbral")!.nivel).toBe("urgente");
    expect(a.find((x) => x.id === "req-seis")!.nivel).toBe("aviso");
    expect(a.find((x) => x.id === "req-umbral")!.href).toBe("/app/expedientes/eumbral#requerimientos");
  });

  it("una renovación por proponer avisa a 60 días o menos, y caducada es crítica", () => {
    const a = construirAlertas([], [venc("90", 90), venc("45", 45), venc("20", 20), venc("caducada", -12), venc("avisado", 10, "AVISADO")], HOY);
    expect(a.map((x) => x.id)).toEqual(["ren-caducada", "ren-avisado", "ren-20", "ren-45"]);
    expect(a[0].nivel).toBe("critico");
    expect(a[0].plazo).toEqual({ clave: "Caducó hace {n} días", n: 12 });
    expect(a.find((x) => x.id === "ren-45")!.nivel).toBe("aviso");
    expect(a[0].detalle).toBe("TIE");
  });

  it("en marcha, rechazada o hecha no molesta; la propuesta o el documento sin respuesta, a los 7 días", () => {
    const a = construirAlertas([], [
      venc("tramitando", 5, "TRAMITANDO"), venc("rechazada", 5, "RECHAZADA"),
      venc("prop3", 20, "PROPUESTA", { propuestaAt: dia(-3) }),
      venc("prop9", 20, "PROPUESTA", { propuestaAt: dia(-9) }),
      venc("doc8", 20, "SOLICITADO", { tipo: "PASAPORTE", solicitadoAt: dia(-8) }),
      venc("sinfecha", 20, "PROPUESTA"),
    ], HOY);
    expect(a.map((x) => x.id)).toEqual(["sr-prop9", "sr-doc8"]);
    expect(a[0].plazo).toEqual({ clave: "Propuesta sin respuesta · {n} días", n: 9 });
    expect(a[1].plazo).toEqual({ clave: "Documento pedido sin respuesta · {n} días", n: 8 });
    expect(a[1].detalle).toBe("Pasaporte");
  });

  it("lo crítico primero: requerimiento vencido, luego tarjeta caducada, luego lo urgente", () => {
    const a = construirAlertas([req("r", 2)], [venc("c", -1), venc("v", 25)], HOY);
    const b = construirAlertas([req("x", -1)], [venc("c", -30)], HOY);
    expect(a.map((x) => x.id)).toEqual(["ren-c", "req-r", "ren-v"]);
    expect(b.map((x) => x.id)).toEqual(["req-x", "ren-c"]);
  });

  it("DEHú: aviso sin abrir (10 días naturales), notificación sin vincular y requerimiento sin registrar", () => {
    const nf = (id: string, extra: Partial<NotifFuente>): NotifFuente => ({ id, origen: "PDF", estado: "PENDIENTE", tipo: "REQUERIMIENTO", titularNombre: `Persona ${id}`, organismo: "Oficina de Extranjería", asunto: "Requerimiento", fechaLimite: null, requerimientoId: null, ...extra });
    const a = construirAlertas([], [], HOY, [
      nf("aviso1", { origen: "AVISO_EMAIL", tipo: "AVISO", titularNombre: null, fechaLimite: dia(1) }),
      nf("aviso8", { origen: "AVISO_EMAIL", tipo: "AVISO", fechaLimite: dia(8) }),
      nf("sinv", { fechaLimite: dia(6) }),
      nf("vinc", { estado: "VINCULADA", fechaLimite: dia(2) }),
      nf("hecho", { estado: "VINCULADA", fechaLimite: dia(2), requerimientoId: "r1" }),
      nf("resol", { estado: "VINCULADA", tipo: "RESOLUCION_FAVORABLE" }),
      nf("gest", { estado: "GESTIONADA", fechaLimite: dia(1) }),
      nf("verif", { origen: "AVISO_EMAIL", tipo: "VERIFICACION" }),
    ]);
    expect(a.map((x) => x.id)).toEqual(["dehu-aviso1", "dehu-verif", "dehu-vinc", "dehu-sinv", "dehu-aviso8"]);
    expect(a[0]).toMatchObject({ nivel: "critico", cliente: "Oficina de Extranjería", plazo: { clave: "Ábrela mañana como tarde", n: 1 }, href: "/app/dehu" });
    expect(a.find((x) => x.id === "dehu-aviso8")!.plazo).toEqual({ clave: "Quedan {n} días para abrirla", n: 8 });
    expect(a.find((x) => x.id === "dehu-vinc")!.nivel).toBe("urgente");
    expect(a.find((x) => x.id === "dehu-sinv")!.plazo).toEqual({ clave: "Quedan {n} días", n: 6 });
  });

  it("la caducidad en palabras", () => {
    expect(plazoCaducidad(-5)).toEqual({ clave: "Caducó hace {n} días", n: 5 });
    expect(plazoCaducidad(-1).clave).toBe("Caducó ayer");
    expect(plazoCaducidad(0).clave).toBe("Caduca hoy");
    expect(plazoCaducidad(1).clave).toBe("Caduca mañana");
    expect(plazoCaducidad(40)).toEqual({ clave: "Caduca en {n} días", n: 40 });
  });
});

describe("campana — VERI*FACTU (01/10/2026)", () => {
  it("rechazada = crítico, falta un dato = urgente; enlace a la factura; la anulación se nombra", () => {
    const a = construirAlertas([], [], new Date("2026-10-01T10:00:00Z"), [], [
      { id: "r1", facturaId: "f1", numero: "2026-0056", clienteNombre: "Oksana Koval", tipo: "ALTA", estado: "INCORRECTO" },
      { id: "r2", facturaId: "f2", numero: "2026-0060", clienteNombre: "Li Wei", tipo: "ALTA", estado: "BLOQUEADO" },
      { id: "r3", facturaId: "f3", numero: "2026-0057", clienteNombre: "", tipo: "ANULACION", estado: "NO_REGISTRADO" },
      { id: "r4", facturaId: "f4", numero: "2026-0058", clienteNombre: "X", tipo: "ALTA", estado: "RARO" },
    ]);
    expect(a.map((x) => x.id)).toEqual(["vf-r1", "vf-r3", "vf-r2"]);
    expect(a[0]).toMatchObject({ clase: "verifactu", href: "/app/facturas/f1", cliente: "Oksana Koval", detalle: "Factura 2026-0056", nivel: "critico", plazo: { clave: "Rechazada por la AEAT" } });
    expect(a[1]).toMatchObject({ cliente: "2026-0057", detalle: "Anulación de la factura 2026-0057", nivel: "critico" });
    expect(a[2]).toMatchObject({ nivel: "urgente", plazo: { clave: "Falta un dato del cliente" } });
  });
});

