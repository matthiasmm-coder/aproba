import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { emisorParaOficina } from "./facturacion-oficina";

// Domicilio de ACTIVIDAD ≠ domicilio FISCAL (petición de Asenjo Global, 08/09/2026).
// El invariante que hay que proteger es fiscal, no cosmético: una FACTURA lleva siempre
// la dirección fiscal del emisor. El domicilio de actividad solo puede salir en la hoja
// de encargo, el presupuesto y el mandato.

/* eslint-disable @typescript-eslint/no-explicit-any */
const cliente = (tablas: Record<string, Record<string, unknown> | null>) => ({
  from: (t: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: tablas[t] ?? null, error: null }) }) }),
  }),
}) as any;

const DESPACHO = { nombre: "Gestoría Vallès", nif: "B12345678", domicilio: "C/ Fiscal 1, Sabadell", domicilioActividad: "C/ Actividad 9, Terrassa", emailFacturacion: "hola@v.es", logoUrl: null };

describe("emisorParaOficina · domicilio de actividad", () => {
  it("sin oficina: el fiscal para facturar y el de actividad aparte", async () => {
    const em = await emisorParaOficina(cliente({ Workspace: DESPACHO }), "ws", null);
    expect(em.domicilio).toBe("C/ Fiscal 1, Sabadell");        // factura
    expect(em.domicilioActividad).toBe("C/ Actividad 9, Terrassa"); // hoja de encargo
  });

  it("sin domicilio de actividad declarado, queda null (los documentos usan el fiscal)", async () => {
    const em = await emisorParaOficina(cliente({ Workspace: { ...DESPACHO, domicilioActividad: "  " } }), "ws", null);
    expect(em.domicilioActividad).toBeNull();
  });

  it("oficina con identidad propia: manda SU pareja de direcciones, sin mezclar empresas", async () => {
    const em = await emisorParaOficina(cliente({
      Workspace: DESPACHO,
      Oficina: { razonSocial: "Vallès Diagonal SL", nif: "B99999999", domicilio: "Av. Diagonal 1, Barcelona", domicilioActividad: "C/ Consell 22, Barcelona", emailFacturacion: "bcn@v.es", prefijoSerie: "DG", logoUrl: null },
    }), "ws", "of1");
    expect(em.deOficina).toBe(true);
    expect(em.domicilio).toBe("Av. Diagonal 1, Barcelona");
    expect(em.domicilioActividad).toBe("C/ Consell 22, Barcelona");
  });

  it("oficina sin identidad fiscal: factura y actividad son las del despacho", async () => {
    const em = await emisorParaOficina(cliente({
      Workspace: DESPACHO,
      Oficina: { razonSocial: null, nif: null, domicilio: null, domicilioActividad: "C/ Ignorada 3", emailFacturacion: null, prefijoSerie: null, logoUrl: null },
    }), "ws", "of1");
    expect(em.deOficina).toBe(false);
    expect(em.domicilio).toBe("C/ Fiscal 1, Sabadell");
    expect(em.domicilioActividad).toBe("C/ Actividad 9, Terrassa");
  });
});

describe("invariante: la factura nunca lleva el domicilio de actividad", () => {
  const leer = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");
  it.each([
    "lib/export-pdf.ts",           // PDF de factura (descarga y ZIP)
    "components/factura-view.tsx", // factura en pantalla
  ])("%s no menciona domicilioActividad", (f) => {
    expect(leer(f), `${f} imprime una factura: ahí solo puede ir el domicilio FISCAL`).not.toContain("domicilioActividad");
  });

  it("la hoja de encargo sí lo prefiere, con repli al fiscal", () => {
    const enc = leer("lib/encargo.ts");
    expect(enc).toContain("s(ws.domicilioActividad) || s(ws.domicilio)");
    expect(enc).toContain("s(em.domicilioActividad) || s(em.domicilio)");
  });
});
