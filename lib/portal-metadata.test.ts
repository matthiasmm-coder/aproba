import { describe, it, expect } from "vitest";
import { metadataPortal, TEXTOS_PORTAL } from "./portal-metadata";

describe("metadataPortal · marca del despacho en el enlace del cliente", () => {
  it("con logo: título absoluto del despacho, favicon = logo, sin indexar", () => {
    const m = metadataPortal({ gestoria: "Gestoría Vallès", logoUrl: "https://x/logo.png" }, TEXTOS_PORTAL.j);
    expect(m.title).toEqual({ absolute: "Gestoría Vallès · Tu trámite de extranjería" });
    expect(m.openGraph).toMatchObject({ siteName: "Gestoría Vallès", title: "Gestoría Vallès · Tu trámite de extranjería" });
    expect(m.icons).toEqual({ icon: "https://x/logo.png", apple: "https://x/logo.png" });
    expect(m.robots).toEqual({ index: false, follow: false });
    expect(JSON.stringify(m)).not.toMatch(/Aproba/); // ni en título ni en descripción
  });
  it("sin logo ni despacho: «Tu gestoría» y los iconos del layout raíz", () => {
    const m = metadataPortal(null, TEXTOS_PORTAL.s);
    expect(m.title).toEqual({ absolute: "Tu gestoría · Seguimiento de tu expediente" });
    expect(m.icons).toBeUndefined();
  });
});
