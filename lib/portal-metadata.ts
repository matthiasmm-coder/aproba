import type { Metadata } from "next";
import type { MarcaPortal } from "@/lib/marca";

// <head> de los enlaces que recibe el CLIENTE (/j, /s, /c): pestaña, tarjeta al
// compartir (WhatsApp, iMessage, email…) y favicon con la marca del DESPACHO, no la
// de Aproba. Antes el enlace pegado en WhatsApp salía con «Aproba — Automatiza tus
// expedientes…» y el logo de la plataforma (pedido de Asenjo Global, 09/09/2026).
// Los tokens nunca se indexan. La imagen de la tarjeta la pone el opengraph-image.tsx
// de cada ruta (convención de ficheros de Next: se fusiona con esto).
export const TEXTOS_PORTAL = {
  j: { titulo: "Tu trámite de extranjería", descripcion: "Elige tu trámite y sube tus documentos desde el móvil. Enlace personal, válido solo para ti." },
  s: { titulo: "Seguimiento de tu expediente", descripcion: "Mira el avance de tu trámite, lo que falta y tus documentos." },
  c: { titulo: "Tus trámites", descripcion: "Todos tus trámites de extranjería en un solo sitio." },
} as const;

export function metadataPortal(m: MarcaPortal | null, t: { titulo: string; descripcion: string }): Metadata {
  const gestoria = (m?.gestoria ?? "").trim() || "Tu gestoría";
  const title = `${gestoria} · ${t.titulo}`;
  return {
    robots: { index: false, follow: false },
    title: { absolute: title }, // sin la plantilla «%s · Aproba» del layout raíz
    description: t.descripcion,
    applicationName: gestoria,
    openGraph: { type: "website", siteName: gestoria, locale: "es_ES", title, description: t.descripcion },
    twitter: { card: "summary_large_image", title, description: t.descripcion },
    appleWebApp: { capable: true, statusBarStyle: "default", title: gestoria },
    ...(m?.logoUrl ? { icons: { icon: m.logoUrl, apple: m.logoUrl } } : {}),
  };
}
