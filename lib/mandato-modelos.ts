// MANDATO OFICIAL DEL CONSEJO GENERAL DE GESTORES ADMINISTRATIVOS (pedido por Juan, 26/09/2026).
//
// Juan (gestor colegiado) usa TRES modelos de «mandato con representación» del Consejo: uno
// ESPECÍFICO de extranjería, otro de nacionalidad por residencia y uno GENERAL (ante todas las
// Administraciones y en particular la DGT: el canje de un permiso de conducir, una
// homologación…). Quiere que Aproba rellene EL IMPRESO OFICIAL que toque a cada trámite —con
// su formato y su logo— en lugar de su mandato maquetado. «siempre» = el mandato que maqueta
// Aproba (etiqueta «El de Aproba»), por si un servicio no debe llevar ninguno del Consejo.
//
// Módulo PURO: qué modelo toca a cada servicio y qué va en cada casilla. El relleno del PDF
// vive en lib/mandato-consejo.ts; la decisión final, en lib/mandato.ts.
//
// Plantillas: forms/mandatos/consejo-{extranjeria,nacionalidad,general}.pdf, VACÍAS. Los
// ejemplares de Juan venían rellenos (sus datos y, en el general, los de un cliente suyo): se
// vaciaron y se quitaron los objetos huérfanos. El general era un PDF PLANO: sus 30 campos se
// crearon en las posiciones de las cajas de ese ejemplar (escaladas ×0,9417, el encaje de A4 en
// Letter que aplica su primer flujo), con nombres legibles (mandante1, gestor1_colegiado…).

export type ModeloMandato = "extranjeria" | "nacionalidad" | "general" | "siempre";
export type ModeloConsejo = Exclude<ModeloMandato, "siempre">;

// Config del despacho (Workspace.mandatoConsejo, jsonb): activo + excepciones por servicio.
export type MandatoConsejoConfig = { activo: boolean; porServicio: Record<string, ModeloMandato> };

const MODELOS: ModeloMandato[] = ["extranjeria", "nacionalidad", "general", "siempre"];

export function mandatoConsejoValido(x: unknown): MandatoConsejoConfig | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const v = x as { activo?: unknown; porServicio?: unknown };
  const por: Record<string, ModeloMandato> = {};
  if (v.porServicio && typeof v.porServicio === "object" && !Array.isArray(v.porServicio)) {
    for (const [clave, m] of Object.entries(v.porServicio as Record<string, unknown>)) {
      if (clave && clave.length <= 80 && MODELOS.includes(m as ModeloMandato)) por[clave] = m as ModeloMandato;
    }
  }
  return { activo: v.activo === true, porServicio: por };
}

// Trámites que NO son de extranjería aunque un despacho de extranjería los lleve (catálogo real
// de Juan, 26/09): tráfico, títulos, certificados, registros, Seguridad Social, Hacienda.
const NO_EXTRANJERIA = /(conduc|tr[aá]fico|\bdgt\b|homolog|equivalen|fnmt|certificado digital|aut[oó]nom|nota simple|registr(o|al) (civil|de la propiedad)|pareja de hecho|matrimonio|casamiento|antecedentes penales espa|hacienda|\birpf\b|\brenta\b|n[oó]mina)/i;

// Modelo por defecto de un servicio: la nacionalidad tiene el suyo; lo claramente ajeno a
// extranjería, el GENERAL del Consejo; todo lo demás (arraigos, TIE, NIE, CUE, estudios, UGE,
// requerimientos, recursos…), el de extranjería. El despacho lo corrige servicio a servicio
// («siempre» solo por elección expresa).
export function modeloPorDefecto(s: { id: string; label: string }): ModeloMandato {
  if (s.id === "nacionalidad" || /nacionalidad/i.test(s.label)) return "nacionalidad";
  if (NO_EXTRANJERIA.test(s.label)) return "general";
  return "extranjeria";
}

export function modeloDeServicio(s: { id: string; label: string }, cfg: MandatoConsejoConfig | null): ModeloMandato {
  if (!cfg?.activo) return "siempre";
  return cfg.porServicio[s.id] ?? modeloPorDefecto(s);
}

// «AV. DE LAS CORTES VALENCIANAS 46, 5 E, CP 46015 - VALENCIA» → calle, número, CP y
// localidad, que el impreso pide en casillas separadas. Si no se reconoce, todo a «calle».
export function partirDomicilio(domicilio: string): { calle: string; numero: string; cp: string; localidad: string } {
  const s = domicilio.replace(/\s+/g, " ").trim();
  if (!s) return { calle: "", numero: "", cp: "", localidad: "" };
  const cpM = s.match(/\b(\d{5})\b/);
  let antes = s, localidad = "", cp = "";
  if (cpM && cpM.index !== undefined) {
    cp = cpM[1];
    antes = s.slice(0, cpM.index);
    localidad = s.slice(cpM.index + cp.length).replace(/^[\s,.\-–—()]+/, "").replace(/[\s,.\-–—]+$/, "").trim();
  } else {
    const partes = s.split(",").map((p) => p.trim()).filter(Boolean);
    if (partes.length > 1 && !/\d/.test(partes[partes.length - 1])) {
      localidad = partes.pop() as string;
      antes = partes.join(", ");
    }
  }
  antes = antes.replace(/[\s,.\-–—]*\b(c\.?\s?p\.?)\s*$/i, "").replace(/[\s,.\-–—]+$/, "").trim();
  const m = antes.match(/^(.+?)[\s,]+(?:n[º°o]\.?\s*)?(\d.*)$/i);
  return m
    ? { calle: m[1].replace(/[\s,]+$/, ""), numero: m[2].trim(), cp, localidad }
    : { calle: antes, numero: "", cp, localidad };
}

// El impreso dice «Colegio Oficial de Gestores Administrativos de ____»: solo el territorio.
export function colegioTerritorial(colegio: string): string {
  return colegio.replace(/\s+/g, " ").trim()
    .replace(/^(el\s+|l['’])?(ilustre\s+|il·lustre\s+)?(colegio|col·legi)\s+oficial\s+de\s+(gestores\s+administrativos|gestors\s+administratius)\s+(de\s+(la\s+|las\s+|los\s+)?|d['’])/i, "")
    .trim();
}

export type PersonaMandato = {
  nombre: string; apellidos: string; nie: string; pasaporte: string;
  domicilio: string; via?: string; numeroVia?: string; piso?: string;
  municipio: string; cp: string; telefono: string; email: string;
};

export type DatosMandatoConsejo = {
  mandante: PersonaMandato;
  mandatario: { nombre: string; dni: string; colegiado: string; colegio: string };
  despachoNombre: string;      // el general lo pide: «y al despacho profesional ____»
  despachoDomicilio: string;
};

// Valor de cada casilla del impreso (nombres REALES del AcroForm, sondeados el 26/09/2026 con
// scripts/probe-campos-acroform.mjs). Lo que se deja vacío lo completa el gestor o se firma a
// mano: el segundo mandante, la representación de un tercero y las fechas de firma.
export function camposMandatoConsejo(modelo: ModeloConsejo, d: DatosMandatoConsejo): Record<string, string> {
  if (modelo === "general") return camposGeneral(d);
  const p = d.mandante;
  // Extranjería tiene casilla propia para el nº de la calle («n0001», 16 pt); el de
  // nacionalidad no: allí el número va con la calle.
  const via = (p.via ?? "").trim(), num = (p.numeroVia ?? "").trim(), piso = (p.piso ?? "").trim();
  const calleCliente = via
    ? [modelo === "nacionalidad" ? `${via} ${num}`.trim() : via, piso].filter(Boolean).join(", ")
    : p.domicilio;
  const g = partirDomicilio(d.despachoDomicilio);
  const colegio = colegioTerritorial(d.mandatario.colegio);
  const campos: Record<string, string> = {
    "Dña": `${p.nombre} ${p.apellidos}`.replace(/\s+/g, " ").trim(),
    [modelo === "nacionalidad" ? "conDNI" : "DNI"]: p.nie || p.pasaporte,
    "y domicilio a efectos de notificaciones en": p.municipio,
    "n": calleCliente || p.domicilio,
    "CP": p.cp,
    "número de teléfono": p.telefono,
    "email": p.email,
    "DDña 1": d.mandatario.nombre,
    "con NIFNIE": d.mandatario.dni,
    "DDña 2": d.mandatario.colegiado,
    "perteneciente al Colegio Oficial de Gestores Administrativos de": colegio,
    "con domicilio en": g.localidad,
    "calle": g.calle,
    "n_2": g.numero,
    "CP_2": g.cp,
    // Lugar de firma (la fecha, a mano o con la firma): donde está el despacho.
    "En": g.localidad,
    "En_2": g.localidad,
  };
  if (modelo === "extranjeria") {
    campos["n0001"] = via ? num : "";
    campos["Administrativos de"] = colegio; // «…y al Colegio Oficial de Gestores Administrativos de ____, en concepto de MANDATARIOS»
  }
  for (const k of Object.keys(campos)) campos[k] = (campos[k] ?? "").trim();
  return campos;
}

// Modelo GENERAL (campos creados por nosotros sobre el PDF plano del Consejo). Tres gestores
// posibles: va el mandatario de Ajustes; los otros dos, en blanco para completar a mano.
function camposGeneral(d: DatosMandatoConsejo): Record<string, string> {
  const p = d.mandante;
  const via = (p.via ?? "").trim(), num = (p.numeroVia ?? "").trim(), piso = (p.piso ?? "").trim();
  const g = partirDomicilio(d.despachoDomicilio);
  const campos: Record<string, string> = {
    mandante1: `${p.nombre} ${p.apellidos}`.replace(/\s+/g, " ").trim(),
    mandante1_dni: p.nie || p.pasaporte,
    notif_localidad: p.municipio,
    notif_calle: via ? [via, piso].filter(Boolean).join(", ") : p.domicilio,
    notif_num: via ? num : "",
    notif_cp: p.cp,
    gestor1: d.mandatario.nombre,
    gestor1_dni: d.mandatario.dni,
    gestor1_colegiado: d.mandatario.colegiado,
    colegio: colegioTerritorial(d.mandatario.colegio),
    despacho: d.despachoNombre,
    despacho_localidad: g.localidad,
    despacho_calle: g.calle,
    despacho_num: g.numero,
    despacho_cp: g.cp,
    firma1_lugar: g.localidad,
    firma2_lugar: g.localidad,
  };
  for (const k of Object.keys(campos)) campos[k] = (campos[k] ?? "").trim();
  return campos;
}
