/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import { idDeFilaMigrada, moverHistorialAServicio } from "./historial-mover";

// 30/09/2026 — Luis: la migración dejó en «Otros trámites de extranjería» servicios con el suyo
// propio; se mueven fila a fila (cabecera + pagos) desde Expedientes › Historial.

// Cliente falso en memoria: select/update + eq + maybeSingle/limit, y `await` directo tras update().select().
function cliFalso(tablas: Record<string, Record<string, unknown>[]>) {
  return {
    from(t: string) {
      const filas = tablas[t] ?? (tablas[t] = []);
      const filtros: [string, unknown][] = [];
      let cambios: Record<string, unknown> | null = null;
      const aplica = () => filas.filter((r) => filtros.every(([k, v]) => r[k] === v));
      const q: any = {
        select: () => q,
        update: (c: Record<string, unknown>) => { cambios = c; return q; },
        eq: (k: string, v: unknown) => { filtros.push([k, v]); return q; },
        maybeSingle: async () => ({ data: aplica()[0] ?? null, error: null }),
        limit: async (n: number) => ({ data: aplica().slice(0, n), error: null }),
        then: (ok: (v: unknown) => unknown) => {
          const hit = aplica();
          if (cambios) for (const r of hit) Object.assign(r, cambios);
          return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null }).then(ok);
        },
      };
      return q;
    },
  } as never;
}

const base = () => ({
  ServicioHistorico: [
    { id: "h1", workspaceId: "ws", pagoDeId: null, servicioClave: "srv_otros", tipo: "OTRO", etiqueta: "Otros trámites de extranjería", notas: "Factura: Desistimiento de asilo" },
    { id: "h1b", workspaceId: "ws", pagoDeId: "h1", servicioClave: "srv_otros", tipo: "OTRO", etiqueta: "Otros trámites de extranjería", notas: "Factura: 2º pago" },
    { id: "h2", workspaceId: "ws", pagoDeId: null, servicioClave: "srv_otros", tipo: "OTRO", etiqueta: "Otros trámites de extranjería", notas: "Factura: Desplazamientos rumanos" },
    { id: "x1", workspaceId: "otro", pagoDeId: "h1", servicioClave: "srv_otros", tipo: "OTRO", etiqueta: "ajeno", notas: "" },
  ],
  ServicioConfig: [
    { workspaceId: "ws", clave: "srv_asilo", label: "Desistimiento de asilo" },
    { workspaceId: "ws", clave: "nacionalidad", label: "Nacionalidad española" },
    { workspaceId: "otro", clave: "srv_ajeno", label: "De otro despacho" },
  ],
});

describe("historial migrado: cambiar de servicio", () => {
  it("mueve la fila entera (cabecera + sus pagos), sin tocar las notas ni otro despacho", async () => {
    const t = base();
    const r = await moverHistorialAServicio(cliFalso(t), "sh_h1", "srv_asilo");
    expect(r).toMatchObject({ ok: true, movidas: 2, label: "Desistimiento de asilo" });
    const [h1, h1b, h2, x1] = t.ServicioHistorico;
    expect([h1.servicioClave, h1b.servicioClave]).toEqual(["srv_asilo", "srv_asilo"]);
    expect([h1.etiqueta, h1.tipo, h1.notas]).toEqual(["Desistimiento de asilo", "OTRO", "Factura: Desistimiento de asilo"]);
    expect(h2.servicioClave).toBe("srv_otros");
    expect(x1.servicioClave).toBe("srv_otros");
  });

  it("desde un pago suelto mueve a toda su fila; una clave del catálogo trae su tipo", async () => {
    const t = base();
    const r = await moverHistorialAServicio(cliFalso(t), "h1b", "nacionalidad");
    expect(r).toMatchObject({ ok: true, movidas: 2 });
    expect(t.ServicioHistorico[0]).toMatchObject({ servicioClave: "nacionalidad", tipo: "NACIONALIDAD", etiqueta: "Nacionalidad española" });
  });

  it("solo a un servicio del catálogo del despacho; la fila tiene que existir", async () => {
    expect(await moverHistorialAServicio(cliFalso(base()), "h1", "srv_ajeno")).toMatchObject({ ok: false, status: 400 });
    expect(await moverHistorialAServicio(cliFalso(base()), "h1", "")).toMatchObject({ ok: false, status: 400 });
    expect(await moverHistorialAServicio(cliFalso(base()), "sh_nada", "srv_asilo")).toMatchObject({ ok: false, status: 404 });
  });

  it("las filas migradas llegan como «sh_<id>»", () => {
    expect(idDeFilaMigrada("sh_abc")).toBe("abc");
    expect(idDeFilaMigrada("abc")).toBe("abc");
  });
});
