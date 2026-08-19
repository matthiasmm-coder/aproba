// ORIGEN DE UN REGISTRO — de dónde viene quien se da de alta.
//
// Por qué (19/08/2026): en agosto las dos altas más interesantes —una gestoría de
// extranjería con dominio propio y otro despacho— llegaron SOLAS, sin campaña. Fue el
// canal más productivo del mes (2 altas en una semana frente a 160 emails en frío para
// 1 clienta), y no había forma de saber de dónde venían. Sin eso no se puede repetir.
//
// Diseño mínimo a propósito: PRIMER contacto (la fuente que trajo a la persona, no la
// última página antes de registrarse), guardado en el propio navegador 30 días, sin
// terceros, sin identificadores, sin perfilado. Solo viaja al servidor cuando alguien
// crea una cuenta — es decir, cuando ya hay una relación.

export type Origen = {
  fuente: string;        // google | linkedin | directo | dominio del referrer | valor de utm_source
  medio?: string;        // organico | referencia | utm_medium
  campana?: string;      // utm_campaign
  aterrizaje?: string;   // primera página vista (path, sin query: nada de datos personales)
  fecha?: string;
};

const CLAVE = "aproba.origen.v1";
const DIAS = 30;

// CONSENTIMIENTO. La política de cookies publicada promete: «Si incorporamos cookies
// analíticas o de terceros, solicitaremos tu consentimiento previo». La AEPD equipara
// localStorage a una cookie (art. 22.2 LSSI-CE), y esto NO es medición agregada —el
// origen acaba asociado a una persona al registrarse—, así que no cabe la excepción de
// analítica propia. Sin el aviso aceptado no se guarda nada: cumplir vale más que medir.
const COOKIE_AVISO = "aproba-cookie-aviso";
export const hayConsentimiento = (cookies: string): boolean =>
  cookies.split("; ").some((c) => c.startsWith(`${COOKIE_AVISO}=`));

// Buscadores y redes reconocidos → etiqueta legible; el resto, el dominio a secas.
const CONOCIDOS: [RegExp, string][] = [
  [/google\./i, "google"], [/bing\./i, "bing"], [/duckduckgo/i, "duckduckgo"],
  [/linkedin\./i, "linkedin"], [/facebook\.|fb\./i, "facebook"], [/instagram\./i, "instagram"],
  [/t\.co|twitter\.|x\.com/i, "twitter"], [/youtube\./i, "youtube"],
  [/whatsapp|wa\.me/i, "whatsapp"], [/chatgpt|openai/i, "chatgpt"], [/claude\.ai/i, "claude"],
];

const etiqueta = (host: string): string => {
  for (const [re, nombre] of CONOCIDOS) if (re.test(host)) return nombre;
  return host.replace(/^www\./, "");
};

// Deduce el origen de una URL de entrada + su referrer. Puro: testeable sin navegador.
export function deducirOrigen(href: string, referrer: string): Origen {
  let url: URL;
  try { url = new URL(href); } catch { return { fuente: "directo" }; }
  const p = url.searchParams;
  const utm = p.get("utm_source");
  if (utm) {
    return {
      fuente: utm.toLowerCase().slice(0, 40),
      medio: (p.get("utm_medium") ?? undefined)?.toLowerCase().slice(0, 40),
      campana: (p.get("utm_campaign") ?? undefined)?.slice(0, 60),
      aterrizaje: url.pathname.slice(0, 80),
    };
  }
  let refHost = "";
  try { refHost = referrer ? new URL(referrer).hostname : ""; } catch { /* referrer inválido */ }
  // Navegación interna: no es un origen, es un clic dentro de la casa.
  if (!refHost || refHost === url.hostname) {
    return { fuente: "directo", medio: "directo", aterrizaje: url.pathname.slice(0, 80) };
  }
  const nombre = etiqueta(refHost);
  const buscador = /google|bing|duckduckgo|yahoo|ecosia/.test(nombre);
  return {
    fuente: nombre,
    medio: buscador ? "organico" : "referencia",
    aterrizaje: url.pathname.slice(0, 80),
  };
}

// PRIMER contacto: si ya hay uno guardado y no ha caducado, no se pisa. Quien llega por
// Google, lee el blog, se va y vuelve directo tres días después, vino de Google.
export function recordarOrigen(href: string, referrer: string): void {
  try {
    if (!hayConsentimiento(document.cookie)) return;
    const guardado = localStorage.getItem(CLAVE);
    if (guardado) {
      const o = JSON.parse(guardado) as Origen;
      if (o.fecha && Date.now() - new Date(o.fecha).getTime() < DIAS * 864e5) return;
    }
    const nuevo = { ...deducirOrigen(href, referrer), fecha: new Date().toISOString() };
    localStorage.setItem(CLAVE, JSON.stringify(nuevo));
  } catch { /* modo privado o almacenamiento lleno: la medición no rompe la web */ }
}

export function leerOrigen(): Origen | null {
  try {
    const g = localStorage.getItem(CLAVE);
    return g ? (JSON.parse(g) as Origen) : null;
  } catch { return null; }
}

// Una línea legible para el email de aviso: es donde Matthias lo verá de verdad.
export function resumirOrigen(o: Origen | null | undefined): string {
  if (!o?.fuente) return "origen desconocido";
  const partes = [o.fuente];
  if (o.medio && o.medio !== o.fuente) partes.push(o.medio);
  if (o.campana) partes.push(`campaña ${o.campana}`);
  if (o.aterrizaje && o.aterrizaje !== "/") partes.push(`entró por ${o.aterrizaje}`);
  return partes.join(" · ");
}
