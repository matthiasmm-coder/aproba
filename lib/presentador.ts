// Bloque «DATOS DEL REPRESENTANTE A EFECTOS DE PRESENTACIÓN DE LA SOLICITUD» de los
// formularios oficiales: el DESPACHO que presenta el expediente.
//
// ⚠️ No confundir con la casilla «Representante legal, en su caso» de la sección 1, que
// es el representante legal del EXTRANJERO (la EX-11 la titula «Representante legal
// (menor/tutelado…)» y la nota oficial pone de ejemplo «Padre/Madre del menor, Tutor»).
// Ahí nunca va el despacho.
//
// Los datos salen de la oficina del expediente si la tiene configurada y, si no, del
// despacho — la misma cascada que la hoja de encargo, para que el formulario y el mandato
// digan lo mismo. Pedido por Andrés de Ceballos (18/09/2026).

export type Presentador = {
  nombre: string;      // razón social del despacho
  documento: string;   // su NIF
  domicilio: string; numero: string; piso: string;
  localidad: string; cp: string; provincia: string;
  telefono: string; email: string;
  repNombre: string;   // el profesional (persona física) que firma la representación
  repDoc: string;      // su DNI/NIE
  repTitulo: string;   // el título por el que representa: «Gestor administrativo», «Abogado»…
};

export type FuentePresentador = {
  nombre?: string | null; razonSocial?: string | null; nif?: string | null;
  domicilio?: string | null; domicilioActividad?: string | null;
  direccion?: string | null; telefono?: string | null; emailFacturacion?: string | null;
  mandatarioNombre?: string | null; mandatarioDni?: string | null;
  mandatarioColegiado?: string | null; mandatarioColegio?: string | null;
};

const limpio = (v: unknown) => String(v ?? "").trim();

// El título por el que se ostenta la representación. Sale del colegio profesional que el
// despacho ya declara para la hoja de encargo: no hay que preguntárselo otra vez.
// Va CORTO a propósito: la casilla «Título» del impreso mide entre 35 y 50 pt —está
// pensada para «Padre», «Tutor», «Abogado», que es el ejemplo de la nota oficial—, y
// «Gestor administrativo» entero solo cabría a 4,7 pt, ilegible.
export function tituloRepresentacion(colegio?: string | null, colegiado?: string | null): string {
  const c = limpio(colegio).toLowerCase();
  if (/abogad|icab|colegio de la abogac/.test(c)) return "Abogado";
  if (/gestor/.test(c)) return "Gestor";
  if (/graduad[oa]s? social/.test(c)) return "Graduado social";
  if (/procurador/.test(c)) return "Procurador";
  if (/^\s*$/.test(c)) return limpio(colegiado) ? "Colegiado" : "Representante";
  return "Representante";
}

// «C/ Mallorca 245, 3º 2ª · 08013 Barcelona» → vía / número / piso / C.P. / localidad.
// Best-effort deliberado: el PDF sale editable y el gestor corrige lo que haga falta. Lo
// que NO se hace es inventar provincia: se deja en blanco si no se puede leer.
export function partirDomicilioDespacho(entrada?: string | null) {
  const s = limpio(entrada).replace(/\s+/g, " ");
  if (!s) return { domicilio: "", numero: "", piso: "", cp: "", localidad: "" };
  const mCp = /\b(\d{5})\b/.exec(s);
  const cp = mCp?.[1] ?? "";
  // Lo que sigue al C.P. es la localidad; si no hay C.P., no se adivina.
  let localidad = "";
  if (mCp) {
    localidad = s.slice(mCp.index + 5).replace(/^[\s,.·-]+/, "").replace(/[\s,.·-]+$/, "").split(/[,(]/)[0].trim();
  }
  const antes = (mCp ? s.slice(0, mCp.index) : s).replace(/[\s,.·-]+$/, "");
  const piso = (antes.match(/(\d+\s*[ºo]\s*\d*\s*[ªa]?)/i) || [])[1]?.replace(/\s+/g, "") ?? "";
  const sinPiso = antes.replace(/,?\s*\d+\s*[ºo]\s*\d*\s*[ªa]?.*$/i, "").replace(/[\s,]+$/, "");
  const numero = (sinPiso.match(/\b(\d{1,4})\s*$/) || [])[1] || (sinPiso.match(/\b(\d{1,4})\b/) || [])[1] || "";
  const domicilio = sinPiso.replace(/\b\d{1,4}\s*$/, "").replace(/[\s,]+$/, "").trim();
  return { domicilio: domicilio || sinPiso.trim(), numero, piso, cp, localidad };
}

// Construye el bloque a partir de la oficina (si tiene datos propios) y del despacho.
// Devuelve null si no hay ni razón social ni profesional: mejor un hueco en blanco que
// un formulario que dice que representa alguien que el despacho no ha configurado.
export function presentadorDe(despacho: FuentePresentador, oficina?: FuentePresentador | null): Presentador | null {
  const de = (k: keyof FuentePresentador) => limpio(oficina?.[k]) || limpio(despacho[k]);
  const nombre = limpio(oficina?.razonSocial) || limpio(oficina?.nombre) || limpio(despacho.razonSocial) || limpio(despacho.nombre);
  const repNombre = de("mandatarioNombre");
  const documento = de("nif");
  if (!nombre && !repNombre) return null;
  const dir = partirDomicilioDespacho(de("domicilioActividad") || de("domicilio") || de("direccion"));
  return {
    nombre, documento,
    domicilio: dir.domicilio, numero: dir.numero, piso: dir.piso,
    localidad: dir.localidad, cp: dir.cp, provincia: "",
    telefono: de("telefono"), email: de("emailFacturacion"),
    repNombre, repDoc: de("mandatarioDni"),
    repTitulo: repNombre ? tituloRepresentacion(de("mandatarioColegio"), de("mandatarioColegiado")) : "",
  };
}

// Los modelos MI (Ley 14/2013) piden a la PERSONA autorizada, no a la razón social:
// apellidos y nombre por separado. Convención española: primer token = nombre.
export function partirNombreProfesional(completo: string): { nombre: string; apellidos: string } {
  const p = limpio(completo).split(/\s+/).filter(Boolean);
  if (p.length <= 1) return { nombre: p[0] ?? "", apellidos: "" };
  return { nombre: p[0], apellidos: p.slice(1).join(" ") };
}

// ¿Está el bloque lo bastante completo como para que valga la pena estamparlo?
export const presentadorCompleto = (p: Presentador | null) => Boolean(p && p.nombre && p.documento && p.repNombre && p.repDoc);
