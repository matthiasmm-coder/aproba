import { describe, expect, it } from "vitest";
import { construirAlertas, plazoCaducidad, type ReqFuente, type VencFuente } from "@/lib/alertas";

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

  it("la caducidad en palabras", () => {
    expect(plazoCaducidad(-5)).toEqual({ clave: "Caducó hace {n} días", n: 5 });
    expect(plazoCaducidad(-1).clave).toBe("Caducó ayer");
    expect(plazoCaducidad(0).clave).toBe("Caduca hoy");
    expect(plazoCaducidad(1).clave).toBe("Caduca mañana");
    expect(plazoCaducidad(40)).toEqual({ clave: "Caduca en {n} días", n: 40 });
  });
});
