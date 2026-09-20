import { describe, expect, it } from "vitest";
import { TRAMITES, PAGINAS_TRAMITES } from "@/lib/tramites-paginas";
import { DEFAULT_SERVICIOS } from "@/lib/servicios";
import { tasasDelTramite } from "@/lib/tasas";
import { formulariosParaTramite } from "@/lib/ex-forms";

// Las páginas públicas de trámite copian lo que hace el producto. Si el catálogo, los
// modelos o las tasas cambian, esto falla: nunca una página prometiendo lo que no hay.
describe("páginas de trámite · fieles al producto", () => {
  it.each(TRAMITES.map((t) => [t.slug, t] as const))("%s", (_slug, t) => {
    const s = DEFAULT_SERVICIOS.find((x) => x.id === t.servicioId);
    expect(s, `servicio ${t.servicioId} en el catálogo por defecto`).toBeDefined();
    expect(t.docs).toEqual(s!.docs);
    expect(t.tasas).toEqual(tasasDelTramite(t.tipoEnum ?? null, [t.servicioId]));
    expect(t.formularios.map((f) => f.code)).toEqual(formulariosParaTramite(t.tipoEnum ?? "OTRO", t.servicioId));
  });
  it("títulos ≤ 65 y descripciones ≤ 160 caracteres, rutas únicas", () => {
    for (const p of PAGINAS_TRAMITES) {
      expect(p.titulo.length, p.ruta).toBeLessThanOrEqual(65);
      expect(p.descripcion.length, p.ruta).toBeLessThanOrEqual(160);
    }
    expect(new Set(PAGINAS_TRAMITES.map((p) => p.ruta)).size).toBe(PAGINAS_TRAMITES.length);
  });
  it("los trámites relacionados existen", () => {
    const slugs = new Set(TRAMITES.map((t) => t.slug));
    for (const t of TRAMITES) for (const r of t.relacionados) expect(slugs.has(r), `${t.slug} → ${r}`).toBe(true);
  });
});
