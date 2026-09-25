// DOCUMENTOS DE LA EMPRESA — módulo PURO (cliente y servidor).
//
// Petición de Luis (Asenjo, 25/09/2026): en la ficha de una empresa, todos los documentos
// que se presentaron — los de sus trabajadores, las hojas de encargo, los mandatos… — a
// mano y rápidos de encontrar. Aquí vive lo que no depende de la base: los tipos de
// documento de una empresa, a qué grupo va cada documento, la búsqueda y la ruta que
// lleva cada archivo dentro del ZIP.

export type GrupoDocEmpresa = "ENCARGO" | "EMPRESA" | "TRABAJADOR";
export type OrigenDocEmpresa = "EXPEDIENTE" | "CLIENTE" | "EMPRESA";

export type DocEmpresaItem = {
  id: string;               // único en la lista (el id del documento en su tabla)
  origen: OrigenDocEmpresa; // de un expediente, suelto de un trabajador o de la empresa
  grupo: GrupoDocEmpresa;
  tipo: string;             // enum del expediente o etiqueta libre
  label: string;            // nombre humano del tipo
  nombreArchivo: string | null;
  mimeType: string | null;
  fecha: string | null;     // ISO
  estado: string | null;    // VALIDADO, RECHAZADO, PENDIENTE… (solo los de expediente)
  trabajadorId: string | null;
  trabajador: string | null;
  expedienteId: string | null;
  expedienteRef: string | null;
  href: string;             // descarga (con ?ver=1 se abre en el navegador)
  borrable: boolean;        // solo los subidos a la ficha de la empresa se borran desde aquí
};

// Tipos que se proponen al subir un documento A LA EMPRESA (los de un trabajador usan los
// de su ficha: pasaporte, TIE…).
export const TIPOS_DOC_EMPRESA = [
  "CIF / NIF de la empresa",
  "Escritura de constitución",
  "Poderes del representante",
  "DNI / NIE del representante",
  "Alta de la empresa en la Seguridad Social",
  "Certificado de estar al corriente con Hacienda",
  "Certificado de estar al corriente con la Seguridad Social",
  "Contrato de trabajo",
  "Oferta de empleo / memoria del puesto",
  "Hoja de encargo firmada",
  "Mandato de representación firmado",
  "Resolución",
  "Otro documento",
];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Hojas de encargo y mandatos van juntos, vengan de un expediente (enum) o subidos a mano.
export function esEncargoOMandato(tipo: string, label = ""): boolean {
  if (tipo === "HOJA_ENCARGO" || tipo === "MANDATO") return true;
  const n = norm(`${tipo} ${label}`);
  return n.includes("hoja de encargo") || n.includes("mandato");
}

export function grupoDe(tipo: string, label: string, trabajadorId: string | null): GrupoDocEmpresa {
  if (esEncargoOMandato(tipo, label)) return "ENCARGO";
  return trabajadorId ? "TRABAJADOR" : "EMPRESA";
}

// Búsqueda instantánea: tipo, archivo, trabajador o referencia del expediente, sin acentos.
export function filtrarDocs(items: DocEmpresaItem[], q: string): DocEmpresaItem[] {
  const t = norm(q.trim());
  if (!t) return items;
  return items.filter((d) => norm([d.label, d.nombreArchivo, d.trabajador, d.expedienteRef].filter(Boolean).join(" ")).includes(t));
}

const masReciente = (a: DocEmpresaItem, b: DocEmpresaItem) => (b.fecha ?? "").localeCompare(a.fecha ?? "") || a.label.localeCompare(b.label, "es");

export type DocsAgrupados = {
  encargo: DocEmpresaItem[];
  empresa: DocEmpresaItem[];
  trabajadores: { id: string; nombre: string; docs: DocEmpresaItem[] }[];
};

export function agruparDocs(items: DocEmpresaItem[]): DocsAgrupados {
  const porTrab = new Map<string, { id: string; nombre: string; docs: DocEmpresaItem[] }>();
  const encargo: DocEmpresaItem[] = [];
  const empresa: DocEmpresaItem[] = [];
  for (const d of items) {
    if (d.grupo === "ENCARGO") encargo.push(d);
    else if (d.grupo === "TRABAJADOR" && d.trabajadorId) {
      const g = porTrab.get(d.trabajadorId) ?? { id: d.trabajadorId, nombre: d.trabajador || "—", docs: [] };
      g.docs.push(d);
      porTrab.set(d.trabajadorId, g);
    } else empresa.push(d);
  }
  return {
    encargo: encargo.sort(masReciente),
    empresa: empresa.sort(masReciente),
    trabajadores: [...porTrab.values()].map((g) => ({ ...g, docs: g.docs.sort(masReciente) })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
  };
}

// Ruta de un documento dentro del ZIP de la empresa: una carpeta por grupo (y por
// trabajador), fecha delante para que el orden sea el cronológico, y sin nombres repetidos.
const seguro = (s: string) => (s || "archivo").replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 90) || "archivo";
export function rutasZip(items: DocEmpresaItem[], mimeAExt: (mime: string | null, nombre: string | null) => string): Map<string, string> {
  const usadas = new Set<string>();
  const out = new Map<string, string>();
  for (const d of [...items].sort(masReciente)) {
    const carpeta = d.grupo === "ENCARGO" ? "Hojas de encargo y mandatos"
      : d.grupo === "TRABAJADOR" ? `Trabajadores/${seguro(d.trabajador ?? "Trabajador")}`
      : "Empresa";
    const fecha = (d.fecha ?? "").slice(0, 10);
    const quien = d.grupo === "ENCARGO" && d.trabajador ? ` - ${d.trabajador}` : "";
    const ref = d.expedienteRef ? ` (${d.expedienteRef})` : "";
    const base = seguro(`${fecha ? `${fecha} ` : ""}${d.label}${quien}${ref}`);
    const ext = mimeAExt(d.mimeType, d.nombreArchivo);
    let nombre = `${carpeta}/${base}.${ext}`;
    for (let k = 2; usadas.has(nombre.toLowerCase()); k++) nombre = `${carpeta}/${base} (${k}).${ext}`;
    usadas.add(nombre.toLowerCase());
    out.set(`${d.origen}:${d.id}`, nombre);
  }
  return out;
}

export function extensionDe(mime: string | null, nombre: string | null): string {
  const deNombre = (nombre ?? "").match(/\.([a-zA-Z0-9]{2,5})$/)?.[1];
  if (deNombre) return deNombre.toLowerCase();
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "bin";
}
