// CANJE DEL PERMISO DE CONDUCIR EXTRANJERO (DGT) — Jennifer y Samara, 03/10/2026.
//
// El canje se pide en la sede de la DGT (en línea: Cl@ve, certificado o un representante del
// Registro de apoderamientos) o en la Jefatura con cita, con la solicitud en IMPRESO OFICIAL
// (Mod. 03) y, si lo presenta otro, la representación (Mod. 24). (Corregido el 03/10/2026: la
// primera versión decía «solo en línea, sin impreso», y no es así.) Lo que hace Aproba: guardar
// los datos del permiso, sacar los dos impresos rellenados (lib/dgt-forms.ts), dar los datos
// para copiarlos en la sede, avisar de lo que impide el canje y de sus plazos, y seguir el
// trámite (solicitud presentada → permiso original entregado en la Jefatura, con autorización
// provisional → permiso español recibido = resolución favorable).
// Fuente de los países y reglas: dgt.es, «Países con convenio de canjes», consultado el
// 03/10/2026. Tasas DGT 2026: 2.3 (canje sin pruebas) y 2.1 (con pruebas). Revisar cada enero.

export const PAISES_CONVENIO = [
  "Andorra", "Argelia", "Argentina", "Bolivia", "Brasil", "Chile", "Colombia", "Corea del Sur", "Costa Rica",
  "Ecuador", "El Salvador", "Filipinas", "Georgia", "Guatemala", "Honduras", "Japón", "Macedonia del Norte",
  "Marruecos", "Moldavia", "Mónaco", "Nicaragua", "Nueva Zelanda", "Panamá", "Paraguay", "Perú", "Reino Unido",
  "República Dominicana", "Serbia", "Suiza", "Túnez", "Turquía", "Ucrania", "Uruguay",
] as const;

// Un permiso de la UE o del EEE vale en España tal cual: su canje es voluntario y es otro trámite.
export const PAISES_UE_EEE = [
  "Alemania", "Austria", "Bélgica", "Bulgaria", "Chipre", "Croacia", "Dinamarca", "Eslovaquia", "Eslovenia",
  "Estonia", "Finlandia", "Francia", "Grecia", "Hungría", "Irlanda", "Italia", "Letonia", "Lituania",
  "Luxemburgo", "Malta", "Países Bajos", "Polonia", "Portugal", "República Checa", "Rumanía", "Suecia",
  "Islandia", "Liechtenstein", "Noruega",
] as const;

export const CLASES_PERMISO = ["AM", "A1", "A2", "A", "B", "B+E", "C1", "C1+E", "C", "C+E", "D1", "D1+E", "D", "D+E"] as const;
export const TASA_CANJE_SIN_PRUEBAS = { codigo: "2.3", importe: 28.87 }; // moto y coche (A, B)
export const TASA_CANJE_CON_PRUEBAS = { codigo: "2.1", importe: 94.05 }; // camión y autobús (C, D)
export const MESES_PERMISO_EXTRANJERO = 6; // vale para conducir en España desde que se adquiere la residencia
export const DIAS_INFORME_MEDICO = 90;      // validez del informe de aptitud psicofísica
export const URL_SEDE_CANJE = "https://www.dgt.es/.galleries/enlaces/sede/permisos/canjes-extranjeros.html";
export const URL_INFO_CANJE = "https://www.dgt.es/nuestros-servicios/permisos-de-conducir/permisos-extranjeros-y-de-fuerzas-y-cuerpos-de-seguridad/canjes-de-permisos/canjes-de-permisos-extranjeros/canje-de-permisos-de-otros-paises";

export type DatosCanje = {
  pais: string;            // país que expidió el permiso
  numero: string;          // nº del permiso
  clases: string[];        // A, B, C…
  expedicion: string;      // AAAA-MM-DD
  caducidad: string;       // AAAA-MM-DD
  residenciaDesde: string; // AAAA-MM-DD: desde cuándo reside en España (su TIE)
  informeMedicoEl: string; // AAAA-MM-DD: informe de aptitud psicofísica (centro de reconocimiento)
  entregadoEl: string;     // AAAA-MM-DD: permiso original entregado en la Jefatura (autorización provisional)
};
export const CANJE_VACIO: DatosCanje = { pais: "", numero: "", clases: [], expedicion: "", caducidad: "", residenciaDesde: "", informeMedicoEl: "", entregadoEl: "" };

// El servicio del catálogo o uno propio del despacho cuyo nombre lo dice (Juan tiene el suyo:
// «Canje de licencia de conducir extranjera»).
export function esServicioCanje(clave: string | null | undefined, label?: string | null): boolean {
  if (clave === "canje_permiso") return true;
  return /\bcanje\b|permiso de conduc|licencia de conduc|carn[eé] de conduc|carnet de conduc/i.test(label ?? "");
}

const fecha = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`)) && new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v ? v : "");
const texto = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

// Lectura defensiva (jsonb o cuerpo de la petición): lo que no vale se queda vacío.
export function datosCanjeValidos(x: unknown): DatosCanje {
  if (!x || typeof x !== "object" || Array.isArray(x)) return { ...CANJE_VACIO };
  const v = x as Record<string, unknown>;
  const clases = Array.isArray(v.clases) ? [...new Set(v.clases.map((c) => String(c).toUpperCase().replace(/\s+/g, "")).filter((c) => (CLASES_PERMISO as readonly string[]).includes(c)))] : [];
  clases.sort((a, b) => CLASES_PERMISO.indexOf(a as never) - CLASES_PERMISO.indexOf(b as never));
  return {
    pais: texto(v.pais, 60), numero: texto(v.numero, 40), clases,
    expedicion: fecha(v.expedicion), caducidad: fecha(v.caducidad), residenciaDesde: fecha(v.residenciaDesde),
    informeMedicoEl: fecha(v.informeMedicoEl), entregadoEl: fecha(v.entregadoEl),
  };
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const enLista = (lista: readonly string[], pais: string) => lista.some((p) => sinTildes(p) === sinTildes(pais) || (sinTildes(pais).length > 3 && sinTildes(p).startsWith(sinTildes(pais))));
export const tieneConvenio = (pais: string) => enLista(PAISES_CONVENIO, pais) || /^(gran bretana|inglaterra|uk)$/i.test(sinTildes(pais));
export const esUeEee = (pais: string) => enLista(PAISES_UE_EEE, pais);

const sumarMeses = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
const sumarDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const diasHasta = (iso: string, hoy: Date) => Math.round((Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${hoy.toISOString().slice(0, 10)}T12:00:00Z`)) / 86_400_000);
const conPruebas = (clases: string[]) => clases.some((c) => /^[CD]/.test(c));

// Lo que hay que saber antes de pedir el canje, en orden de gravedad. `clave` es el texto
// (traducible) con {fecha} o {n}; `fecha` va en AAAA-MM-DD.
export type AvisoCanje = { nivel: "bloqueo" | "atencion" | "info" | "ok"; clave: string; fecha?: string; n?: number };
export function avisosCanje(d: DatosCanje, o: { presentado?: boolean; hoy?: Date } = {}): AvisoCanje[] {
  const hoy = o.hoy ?? new Date();
  const out: AvisoCanje[] = [];
  if (d.pais) {
    if (esUeEee(d.pais)) out.push({ nivel: "info", clave: "Permiso de la UE o del EEE: vale en España tal cual. Su canje es voluntario y es otro trámite." });
    else if (!tieneConvenio(d.pais)) out.push({ nivel: "bloqueo", clave: "Sin convenio de canje con España: este permiso no se puede canjear; hay que sacar el permiso español." });
    else {
      if (sinTildes(d.pais).startsWith("nueva zelanda")) out.push({ nivel: "info", clave: "Nueva Zelanda: solo se canjean moto y coche (A y B)." });
      if (sinTildes(d.pais) === "argentina") out.push({ nivel: "info", clave: "Argentina: la DGT pide el «Certificado de legalidad y antigüedad» del permiso." });
    }
  }
  if (d.caducidad && diasHasta(d.caducidad, hoy) < 0) out.push({ nivel: "bloqueo", clave: "El permiso caducó el {fecha}: para canjearlo tiene que estar en vigor.", fecha: d.caducidad });
  // La DGT exige «acreditación de que no se residía en España cuando se obtuvo el permiso»
  // (sede, 03/10/2026). Aviso y no bloqueo: un permiso RENOVADO lleva una fecha de expedición
  // reciente aunque se obtuviera mucho antes.
  if (d.expedicion && d.residenciaDesde && d.expedicion > d.residenciaDesde) out.push({ nivel: "atencion", clave: "Expedido el {fecha}, después de empezar a residir en España: la DGT pide acreditar que se obtuvo cuando aún no residía aquí. Si es una renovación, prepara la prueba de la fecha en que se obtuvo.", fecha: d.expedicion });
  if (conPruebas(d.clases)) out.push({ nivel: "atencion", clave: "Camión o autobús (C, D): la DGT puede exigir prueba práctica y, según el país, teórica. Tasa 2.1 ({n} €).", n: TASA_CANJE_CON_PRUEBAS.importe });
  if (d.residenciaDesde && !d.entregadoEl) {
    const limite = sumarMeses(d.residenciaDesde, MESES_PERMISO_EXTRANJERO);
    const dias = diasHasta(limite, hoy);
    out.push(dias < 0
      ? { nivel: "atencion", clave: "Desde el {fecha} (6 meses desde la residencia) su permiso ya no vale para conducir en España, hasta tener la autorización provisional.", fecha: limite }
      : { nivel: dias <= 30 ? "atencion" : "info", clave: "Puede conducir con su permiso hasta el {fecha} (6 meses desde la residencia): pide el canje antes.", fecha: limite });
  }
  if (d.informeMedicoEl && !o.presentado) {
    const limite = sumarDias(d.informeMedicoEl, DIAS_INFORME_MEDICO);
    out.push(diasHasta(limite, hoy) < 0
      ? { nivel: "bloqueo", clave: "El informe médico caducó el {fecha} (vale 90 días): hace falta uno nuevo antes de pedir el canje.", fecha: limite }
      : { nivel: "info", clave: "El informe médico vale hasta el {fecha} (90 días): pide el canje antes.", fecha: limite });
  }
  if (d.entregadoEl) out.push({ nivel: "ok", clave: "Permiso original entregado en la Jefatura el {fecha}: conduce con la autorización provisional hasta recibir el español.", fecha: d.entregadoEl });
  const peso = { bloqueo: 0, atencion: 1, info: 2, ok: 3 } as const;
  return out.sort((a, b) => peso[a.nivel] - peso[b.nivel]);
}

// LOS PLAZOS QUE APROBA VIGILA (03/10/2026, Matthias: «Aproba vigila los plazos» tiene que ser
// verdad, no solo una carta que hay que abrir):
//  · seis_meses: el permiso extranjero vale para conducir 6 meses desde la residencia; cuenta
//    hasta que el permiso original se entrega en la Jefatura (autorización provisional);
//  · informe: el informe de aptitud psicofísica vale 90 días; cuenta hasta presentar la solicitud;
//  · caducidad: para canjearlo, el permiso tiene que estar en vigor; cuenta hasta presentarla.
// Se avisa por HITOS, como los requerimientos, cada uno una sola vez: en la campana mientras
// dura la ventana, y por correo a los administradores el día que se entra en un hito
// (lib/canje-escaner.ts, cron diario). Un expediente resuelto o archivado ya no avisa.
export type TipoPlazoCanje = "seis_meses" | "informe" | "caducidad";
export type PlazoCanje = { tipo: TipoPlazoCanje; fecha: string; dias: number };
export const HITOS_CANJE: Record<TipoPlazoCanje, readonly number[]> = { seis_meses: [30, 7, 0], informe: [15, 0], caducidad: [30, 0] };

export function plazosCanje(d: DatosCanje, o: { presentado: boolean; hoy?: Date }): PlazoCanje[] {
  const hoy = o.hoy ?? new Date();
  const out: PlazoCanje[] = [];
  if (d.residenciaDesde && !d.entregadoEl) {
    const fecha = sumarMeses(d.residenciaDesde, MESES_PERMISO_EXTRANJERO);
    out.push({ tipo: "seis_meses", fecha, dias: diasHasta(fecha, hoy) });
  }
  if (!o.presentado && d.informeMedicoEl) {
    const fecha = sumarDias(d.informeMedicoEl, DIAS_INFORME_MEDICO);
    out.push({ tipo: "informe", fecha, dias: diasHasta(fecha, hoy) });
  }
  if (!o.presentado && d.caducidad) out.push({ tipo: "caducidad", fecha: d.caducidad, dias: diasHasta(d.caducidad, hoy) });
  return out;
}

// El hito en el que está hoy un plazo (el menor ya alcanzado), o null si aún queda lejos.
export function hitoCanje(p: PlazoCanje): number | null {
  const alcanzados = HITOS_CANJE[p.tipo].filter((h) => p.dias <= h);
  return alcanzados.length ? Math.min(...alcanzados) : null;
}
// Con la fecha dentro: si el despacho corrige una fecha, los avisos vuelven a salir.
export const claveAvisoCanje = (p: PlazoCanje, hito: number) => `${p.tipo}|${p.fecha}|${hito}`;

// Los avisos ya enviados viven en el mismo jsonb (canje.avisos), fuera del formulario.
export function avisosCanjeEnviados(x: unknown): string[] {
  const v = x && typeof x === "object" && !Array.isArray(x) ? (x as { avisos?: unknown }).avisos : null;
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && s.length <= 60).slice(-30) : [];
}

// En qué punto del trámite está el expediente, para saber qué plazos cuentan todavía.
export function situacionCanje(estado5: string, fechaPresentacion: string | null | undefined): { presentado: boolean; terminado: boolean } {
  return {
    presentado: Boolean(fechaPresentacion) || estado5 !== "EN_PREPARACION",
    terminado: estado5 === "RESUELTO" || estado5 === "RECHAZADO" || estado5 === "FINALIZADO",
  };
}

// La frase del aviso (correo e historial del expediente), en español: la lee el despacho.
const fechaEs = (iso: string) => { const [a, m, d] = iso.slice(0, 10).split("-"); return `${d}/${m}/${a}`; };
export function fraseAvisoCanje(p: PlazoCanje): string {
  const f = fechaEs(p.fecha);
  const cuando = p.dias === 0 ? "hoy" : p.dias === 1 ? "mañana" : p.dias > 1 ? `en ${p.dias} días` : p.dias === -1 ? "ayer" : `hace ${-p.dias} días`;
  if (p.tipo === "seis_meses") return p.dias >= 0
    ? `su permiso deja de valer para conducir en España el ${f} (${cuando}; 6 meses desde la residencia)`
    : `su permiso ya no vale para conducir en España desde el ${f} (${cuando}), hasta la autorización provisional de la Jefatura`;
  if (p.tipo === "informe") return p.dias >= 0
    ? `el informe médico caduca el ${f} (${cuando}): pide el canje antes`
    : `el informe médico caducó el ${f} (${cuando}): hace falta uno nuevo antes de pedir el canje`;
  return p.dias >= 0
    ? `el permiso extranjero caduca el ${f} (${cuando}): para canjearlo tiene que estar en vigor`
    : `el permiso extranjero caducó el ${f} (${cuando}): para canjearlo tiene que estar en vigor`;
}

// Los datos tal como los pide el formulario de la sede, para copiarlos uno a uno.
export function datosParaSede(d: DatosCanje, persona: { nombre?: string | null; documento?: string | null; fechaNacimiento?: string | null }): [string, string][] {
  const f = (iso: string | null | undefined) => { const [a, m, dd] = (iso ?? "").slice(0, 10).split("-"); return a && m && dd ? `${dd}/${m}/${a}` : ""; };
  return ([
    ["Nombre y apellidos", persona.nombre ?? ""],
    ["NIE o pasaporte", persona.documento ?? ""],
    ["Fecha de nacimiento", f(persona.fechaNacimiento)],
    ["País de expedición", d.pais],
    ["Nº del permiso", d.numero],
    ["Clases", d.clases.join(", ")],
    ["Fecha de expedición", f(d.expedicion)],
    ["Fecha de caducidad", f(d.caducidad)],
  ] as [string, string][]).filter(([, v]) => v);
}
