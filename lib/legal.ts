// Fuente única de los datos legales de Aproba.
// ⚠️ Los valores entre [corchetes] DEBEN completarse con los datos reales del
// titular antes de la puesta en producción (razón social, NIF, domicilio,
// datos registrales). El resto del texto legal referencia estos campos.

export const TITULAR = {
  // Identidad del prestador (LSSI-CE art. 10) — completar:
  razonSocial: "[RAZÓN SOCIAL O NOMBRE Y APELLIDOS DEL TITULAR]",
  nif: "[NIF / CIF]",
  domicilio: "[DOMICILIO FISCAL COMPLETO, España]",
  // Datos registrales (solo si es sociedad mercantil) — dejar como "" si autónomo:
  registro: "[Registro Mercantil de ___, Tomo ___, Folio ___, Hoja ___]",

  // Marca y contacto (operativos):
  nombreComercial: "Aproba",
  dominio: "aproba-software.com",
  web: "https://aproba-software.com",
  email: "hola@aproba-software.com",
  emailPrivacidad: "privacidad@aproba-software.com",
  emailLegal: "legal@aproba-software.com",
} as const;

export const ULTIMA_ACTUALIZACION = "13 de junio de 2026";

// Autoridad de control (para el derecho de reclamación, RGPD/LOPDGDD).
export const AEPD = {
  nombre: "Agencia Española de Protección de Datos (AEPD)",
  web: "https://www.aepd.es",
  direccion: "C/ Jorge Juan, 6, 28001 Madrid",
};

// Subencargados del tratamiento (proveedores que tratan datos por cuenta de
// Aproba). Se publican en la Política de Privacidad y en el DPA (RGPD art. 28).
export type Subencargado = {
  nombre: string;
  finalidad: string;
  ubicacion: string;
  garantia: string; // base de la transferencia internacional, si aplica
};

export const SUBENCARGADOS: Subencargado[] = [
  {
    nombre: "Supabase (Supabase Inc.)",
    finalidad: "Alojamiento de la base de datos, autenticación y almacenamiento cifrado de documentos.",
    ubicacion: "Unión Europea (infraestructura en región europea).",
    garantia: "Datos alojados en la UE. Acuerdo de encargado (DPA) de Supabase.",
  },
  {
    nombre: "Anthropic (Anthropic PBC) — Claude",
    finalidad: "Validación y extracción asistida por IA de los documentos del expediente (p. ej. pasaporte, NIE). No se usan los datos para entrenar modelos.",
    ubicacion: "EE. UU.",
    garantia: "Cláusulas Contractuales Tipo (SCC) de la UE. Conservación cero / no entrenamiento por contrato comercial.",
  },
  {
    nombre: "Stripe (Stripe Payments Europe, Ltd.)",
    finalidad: "Procesamiento de los pagos de la suscripción a Aproba.",
    ubicacion: "Irlanda (UE) y EE. UU.",
    garantia: "SCC de la UE. Stripe está certificada PCI-DSS nivel 1.",
  },
  {
    nombre: "Resend (Resend, Inc.)",
    finalidad: "Envío de notificaciones y correos transaccionales a los clientes del despacho.",
    ubicacion: "EE. UU. (entrega a través de servidores en la UE, eu-west-1).",
    garantia: "SCC de la UE.",
  },
  {
    nombre: "Vercel (Vercel Inc.)",
    finalidad: "Alojamiento y entrega de la aplicación web.",
    ubicacion: "EE. UU. con red de distribución global (edge).",
    garantia: "SCC de la UE.",
  },
  {
    nombre: "Cloudflare (Cloudflare, Inc.)",
    finalidad: "Gestión de DNS y protección de la red del dominio.",
    ubicacion: "EE. UU. con red global.",
    garantia: "SCC de la UE.",
  },
];

// Cookies utilizadas (solo técnicas/necesarias mientras no se añada analítica).
export type Cookie = {
  nombre: string;
  titular: string;
  finalidad: string;
  duracion: string;
  tipo: "Técnica" | "Analítica" | "Preferencias";
};

export const COOKIES: Cookie[] = [
  {
    nombre: "sb-<proyecto>-auth-token",
    titular: "Aproba (Supabase)",
    finalidad: "Mantener la sesión iniciada del usuario de forma segura. Imprescindible para acceder al panel.",
    duracion: "Sesión / hasta 7 días",
    tipo: "Técnica",
  },
  {
    nombre: "aproba-cookie-aviso",
    titular: "Aproba",
    finalidad: "Recordar que ya se ha mostrado el aviso de cookies para no volver a mostrarlo.",
    duracion: "1 año",
    tipo: "Técnica",
  },
];

// Rutas y etiquetas de las páginas legales (footer + enlaces cruzados).
export const PAGINAS_LEGALES = [
  { href: "/legal/aviso-legal", label: "Aviso legal" },
  { href: "/legal/privacidad", label: "Privacidad" },
  { href: "/legal/cookies", label: "Cookies" },
  { href: "/legal/terminos", label: "Términos" },
  { href: "/legal/dpa", label: "Encargado del tratamiento (DPA)" },
] as const;
