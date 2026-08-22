// Catalogue de services configurable par le gestor.
// Persisté en localStorage (en attendant Supabase) pour que la config faite dans
// Ajustes se reflète dans le portail client, dans le même navigateur.

export type CitaQuien = "cliente" | "gestor";

export type Servicio = {
  oficinaId?: string | null; // sede propietaria de la fila (null = catálogo común)
  id: string;
  label: string;
  desc: string;
  docs: string[];
  active: boolean;
  precio: number; // total honorarios (sin IVA) = anticipo + resto
  anticipo: number; // € sin IVA, pagadero al iniciar (a la firma)
  resto: number; // € sin IVA, pagadero al finalizar el trámite
  citaPresencial?: boolean; // ce trámite implique-t-il un rendez-vous physique ?
  citaQuien?: CitaQuien; // si oui : qui s'y rend (le client, ou le gestor pour lui)
  noIncluye?: string; // «servicios no incluidos» de la hoja de encargo (varía por trámite)
  // Tasas oficiales y otros suplidos del trámite (SIN IVA, fuera de los honorarios —
  // art. 78.Tres.3º LIVA). Van al presupuesto (portal + hoja de encargo) y a la PRIMERA
  // factura automática del expediente (anticipo si lo hay; si no, el pago final).
  suplidos?: { concepto: string; importe: number }[];
  // Honorarios variables ADEMÁS del fijo: «1,5 % sobre el precio de compraventa».
  // Solo informativo (portal + hoja); la facturación automática usa anticipo/resto.
  porcentaje?: number; // p. ej. 1.5 = 1,5 %
  porcentajeSobre?: string; // sobre qué se aplica (texto libre del gestor)
  // «Precio a consultar»: el portal del cliente no muestra importes de este servicio.
  precioOculto?: boolean;
  // Tema del catálogo («Empresa», «Nacionalidad»…), texto libre del despacho. Vacío =
  // «Otros trámites». En el portal cada tema es un desplegable plegado.
  categoria?: string;
};

// Pack: agrupación de servicios. Su precio NO se teclea: es la suma de los
// servicios incluidos menos un descuento en % — así el importe del pack y lo
// que se factura no pueden divergir. Persistido en Workspace.packs (JSONB) —
// NO en ServicioConfig, para no contaminar a los consumidores de esa tabla.
export type Pack = {
  id: string;
  nombre: string;
  desc: string;
  servicioIds: string[];
  precioDesde: number; // LEGADO: importe «desde…» tecleado a mano. Ya no se usa ni se edita.
  descuentoPct?: number; // 0-100 sobre la suma de los servicios
  // Honorarios variables del pack, misma pareja que en un servicio: informativo de
  // cara al cliente (la facturación automática solo usa los importes fijos).
  porcentaje?: number;
  porcentajeSobre?: string;
  precioOculto?: boolean;
  categoria?: string; // mismo tema libre que los servicios
};

export function newPack(): Pack {
  return { id: "pack_" + Math.random().toString(36).slice(2, 9), nombre: "", desc: "", servicioIds: [], precioDesde: 0 };
}

// Descuento del pack, saneado (nunca > 100 ni negativo: un total negativo
// pasaría a la factura).
export const packPct = (pk: Pack): number => Math.min(100, Math.max(0, Number(pk.descuentoPct) || 0));

// Aplica el descuento del pack a un importe BRUTO. El llamante decide qué es
// bruto según su superficie: con IVA en el portal, sin IVA en Ajustes y /c.
export const packRebajado = (bruto: number, pk: Pack): number =>
  Math.round(bruto * (1 - packPct(pk) / 100) * 100) / 100;

// Suma (sin IVA) de los servicios VIVOS del pack + total con el descuento.
export function packPrecio(pk: Pack, servicios: { id: string; precio: number }[]): { suma: number; total: number; pct: number } {
  const suma = Math.round(pk.servicioIds.reduce((a, id) => a + (servicios.find((s) => s.id === id)?.precio ?? 0), 0) * 100) / 100;
  return { suma, total: packRebajado(suma, pk), pct: packPct(pk) };
}

// «1,5 %» sin decimales de ruido (1.5 → "1,5", 2 → "2").
export function fmtPct(v: number): string {
  return (Math.round(v * 100) / 100).toString().replace(".", ",");
}

export const STORAGE_KEY = "aproba.servicios.v1";

// Catalogue par défaut. Les 4 premiers actifs ; les autres proposés à activer.
export const DEFAULT_SERVICIOS: Servicio[] = [
  { id: "arraigo_social", label: "Arraigo social", desc: "Residencia por arraigo", active: true, precio: 350, anticipo: 150, resto: 200, docs: ["Pasaporte", "Certificado de empadronamiento", "Contrato de trabajo", "Antecedentes penales"], citaPresencial: true, citaQuien: "cliente" },
  { id: "renovacion_tie", label: "Renovación de TIE", desc: "Renovar tu tarjeta de residencia", active: true, precio: 180, anticipo: 80, resto: 100, docs: ["TIE actual", "Certificado de empadronamiento", "Justificante de medios económicos"], citaPresencial: true, citaQuien: "cliente" },
  { id: "reagrupacion", label: "Reagrupación familiar", desc: "Traer a tu familia", active: true, precio: 420, anticipo: 200, resto: 220, docs: ["Pasaporte", "Libro de familia", "Justificante de vivienda", "Justificante de medios económicos"], citaPresencial: true, citaQuien: "cliente" },
  { id: "nacionalidad", label: "Nacionalidad española", desc: "Solicitar la nacionalidad", active: true, precio: 600, anticipo: 300, resto: 300, docs: ["Pasaporte", "Certificado de nacimiento", "Certificado de empadronamiento", "Antecedentes penales"], citaPresencial: true, citaQuien: "cliente" },
  { id: "arraigo_laboral", label: "Arraigo laboral", desc: "Residencia por arraigo laboral", active: false, precio: 350, anticipo: 150, resto: 200, docs: ["Pasaporte", "Informe de vida laboral", "Certificado de empadronamiento", "Antecedentes penales"], citaPresencial: true, citaQuien: "cliente" },
  { id: "larga_duracion", label: "Residencia de larga duración", desc: "Residencia permanente", active: false, precio: 300, anticipo: 150, resto: 150, docs: ["TIE actual", "Certificado de empadronamiento", "Justificante de medios económicos"], citaPresencial: true, citaQuien: "cliente" },
  { id: "nie", label: "Asignación de NIE", desc: "Obtener tu número de identidad", active: false, precio: 90, anticipo: 90, resto: 0, docs: ["Pasaporte"], citaPresencial: true, citaQuien: "cliente" },
  // Trámites con sus modelos EX propios (mapeados en lib/ex-forms.ts por clave). Inactivos
  // por defecto: el despacho los activa en Ajustes si los ofrece. Conserva estas claves
  // (residencia_ue / brexit / modificacion) para que el formulario correcto se autocomplete.
  { id: "residencia_ue", label: "Residencia ciudadano UE", desc: "Tarjeta de residencia de familiar de ciudadano de la UE (RD 240/2007)", active: false, precio: 300, anticipo: 150, resto: 150, docs: ["Pasaporte", "Documento de identidad del ciudadano UE", "Certificado de empadronamiento", "Justificante del vínculo familiar"], citaPresencial: true, citaQuien: "cliente" },
  { id: "brexit", label: "Tarjeta Acuerdo de Retirada (Brexit)", desc: "Documentación para británicos y sus familiares (art. 18.4)", active: false, precio: 250, anticipo: 120, resto: 130, docs: ["Pasaporte", "Justificante de residencia anterior a 2021", "Certificado de empadronamiento"], citaPresencial: true, citaQuien: "cliente" },
  { id: "modificacion", label: "Modificación de autorización", desc: "Cambiar el tipo de autorización de residencia/trabajo", active: false, precio: 280, anticipo: 140, resto: 140, docs: ["TIE actual", "Pasaporte", "Justificante del nuevo supuesto"], citaPresencial: true, citaQuien: "cliente" },
];

// Garantit que chaque service a anticipo/resto/precio cohérents, même si la config
// a été persistée avant l'ajout du fractionnement du paiement. Invariant : precio = anticipo + resto.
function normalize(list: Servicio[]): Servicio[] {
  return list.map((s) => {
    const def = DEFAULT_SERVICIOS.find((d) => d.id === s.id);
    const precioBase = typeof s.precio === "number" ? s.precio : def?.precio ?? 0;
    const anticipo = typeof s.anticipo === "number" ? Math.max(0, s.anticipo) : def?.anticipo ?? Math.round(precioBase / 2);
    const resto = typeof s.resto === "number" ? Math.max(0, s.resto) : def?.resto ?? Math.max(0, precioBase - anticipo);
    return { ...s, anticipo, resto, precio: anticipo + resto };
  });
}

export function loadServicios(): Servicio[] {
  if (typeof window === "undefined") return DEFAULT_SERVICIOS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return normalize(parsed as Servicio[]);
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_SERVICIOS;
}

export function saveServicios(list: Servicio[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function newServicio(): Servicio {
  return {
    id: "srv_" + Math.random().toString(36).slice(2, 9),
    label: "",
    desc: "",
    docs: [],
    active: true,
    precio: 0,
    anticipo: 0,
    resto: 0,
    citaPresencial: false,
    citaQuien: "cliente",
  };
}

// ── Temas del catálogo ───────────────────────────────────────────────────────
// Un tema es texto libre; se compara NORMALIZADO (sin acentos, sin may/min, sin
// espacios de sobra) para que «Nacionalidad» y «nacionalidad » sean el mismo tema,
// pero se MUESTRA con la primera grafía que escribió el despacho.
export const normTema = (v: string | null | undefined): string =>
  (v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

export type Tema<T> = { clave: string; titulo: string; items: T[] };

// Agrupa preservando el ORDEN del catálogo: el tema aparece donde aparece su primer
// elemento (así el arrastre de los servicios ordena también los temas). Los elementos
// sin tema van a un grupo final con clave "" (el llamante le pone su título traducido).
export function agruparPorTema<T extends { categoria?: string }>(items: T[]): Tema<T>[] {
  const grupos: Tema<T>[] = [];
  const indice = new Map<string, number>();
  for (const it of items) {
    const clave = normTema(it.categoria);
    const i = indice.get(clave);
    if (i === undefined) {
      indice.set(clave, grupos.length);
      grupos.push({ clave, titulo: (it.categoria ?? "").trim(), items: [it] });
    } else {
      grupos[i].items.push(it);
    }
  }
  // «Sin tema» siempre al final, pase lo que pase en el orden del catálogo.
  return [...grupos.filter((g) => g.clave), ...grupos.filter((g) => !g.clave)];
}

// Lista de temas ya usados (para el datalist del gestor), en orden de catálogo.
export function temasUsados(...listas: { categoria?: string }[][]): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const lista of listas) {
    for (const it of lista) {
      const t = (it.categoria ?? "").trim();
      if (!t) continue;
      const k = normTema(t);
      if (vistos.has(k)) continue;
      vistos.add(k);
      out.push(t);
    }
  }
  return out;
}
