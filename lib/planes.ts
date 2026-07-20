// Plans & rôles — source unique pour l'inscription, l'onboarding et la gestion d'équipe.
// Les sièges (maxUsuarios) reprennent exactement la landing : Starter 1 · Pro 5 · Business ∞.

export type PlanId = "STARTER" | "PRO" | "BUSINESS";

export const PLANES: Record<PlanId, {
  label: string;
  precio: number; // €/mois
  maxUsuarios: number; // Infinity = ilimitado
  maxExpedientes: number; // límite mensual (Infinity = ilimitado); por encima → PRECIO_EXPEDIENTE_EXTRA €/expediente
  para: string;
  features: string[];
}> = {
  STARTER: {
    label: "Starter",
    precio: 49,
    maxUsuarios: 1,
    maxExpedientes: 20,
    para: "Autónomo · hasta 20 expedientes/mes",
    features: ["1 usuario", "Validación IA de documentos", "Formularios EX + 790-012", "Portal del cliente", "Soporte por email"],
  },
  PRO: {
    label: "Pro",
    precio: 99,
    maxUsuarios: 5,
    maxExpedientes: 50,
    para: "Equipo · hasta 50 expedientes/mes",
    features: ["Hasta 5 usuarios", "Todo lo de Starter", "Avisos automáticos al cliente", "Pagos en plataforma", "Soporte prioritario"],
  },
  BUSINESS: {
    label: "Business",
    precio: 199,
    maxUsuarios: Infinity,
    // Ilimitado (decisión 2026-07-20): creadosMes > Infinity nunca es cierto → el
    // cobro de overage (lib/overage) no aplica jamás a BUSINESS, sin tocar su código.
    maxExpedientes: Infinity,
    para: "Multi-oficina · expedientes ilimitados",
    features: ["Expedientes ilimitados", "Usuarios ilimitados", "Todo lo de Pro", "Facturación integrada", "Multi-oficina", "Onboarding dedicado"],
  },
};

export const PLAN_IDS: PlanId[] = ["STARTER", "PRO", "BUSINESS"];

// Coste por expediente por encima del límite mensual del plan (no aplica en prueba gratuita).
export const PRECIO_EXPEDIENTE_EXTRA = 3; // €/expediente

// Límite mensual de expedientes del plan (repli STARTER si el plan es desconocido).
export function limiteExpedientes(plan: string | null | undefined): number {
  return PLANES[plan as PlanId]?.maxExpedientes ?? PLANES.STARTER.maxExpedientes;
}

// Type de despacho (enum WorkspaceTipo) — pour l'onboarding et l'affichage.
export const TIPOS: { id: string; label: string; desc: string }[] = [
  { id: "GESTORIA", label: "Gestoría", desc: "Trámites administrativos y de extranjería" },
  { id: "DESPACHO_JURIDICO", label: "Despacho jurídico", desc: "Abogacía y representación legal" },
  { id: "MIXTO", label: "Mixto", desc: "Gestoría y servicios jurídicos" },
];
export const TIPO_LABEL: Record<string, string> = {
  GESTORIA: "Gestoría",
  DESPACHO_JURIDICO: "Despacho jurídico",
  MIXTO: "Mixto",
};
export const planLabel = (plan: string | null | undefined) =>
  plan && PLANES[plan as PlanId] ? PLANES[plan as PlanId].label : "Starter";

export function plyMax(plan: string): number {
  return PLANES[(plan as PlanId)] ? PLANES[plan as PlanId].maxUsuarios : 1;
}

export function seatsLabel(usados: number, plan: string): string {
  const max = plyMax(plan);
  return max === Infinity ? `${usados} usuarios` : `${usados} de ${max} usuarios`;
}

// ── Rôles ───────────────────────────────────────────────────────────────────
export type RolId = "OWNER" | "ADMIN" | "GESTOR" | "ASISTENTE";

// OWNER (fondateur) et ADMIN (socio promu) sont le MÊME rôle visible « Administrador »,
// avec exactement les mêmes pouvoirs (plan, facturación, equipo). La seule différence est
// interne : l'OWNER est l'ancre du despacho côté DB (non supprimable / non modifiable),
// pour garantir qu'il reste toujours au moins un chef.
export const ROLES: Record<RolId, { label: string; desc: string; pill: string }> = {
  OWNER: { label: "Administrador", desc: "Jefe del despacho: plan, facturación y equipo", pill: "bg-aproba-100 text-aproba-700" },
  ADMIN: { label: "Administrador", desc: "Jefe del despacho: plan, facturación y equipo", pill: "bg-aproba-100 text-aproba-700" },
  GESTOR: { label: "Gestor", desc: "Trabaja en expedientes, clientes y facturas", pill: "bg-slate-100 text-slate-600" },
  ASISTENTE: { label: "Asistente", desc: "Acceso de apoyo, sin ajustes", pill: "bg-slate-100 text-slate-500" },
};

// Rôles assignables (invitation / changement) : Administrador (= ADMIN), Gestor, Asistente.
// L'OWNER fondateur n'est jamais assignable (il reste l'ancre du despacho).
export const ROLES_ASIGNABLES: RolId[] = ["ADMIN", "GESTOR", "ASISTENTE"];

// Un « chef » (Administrador) = OWNER ou ADMIN : mêmes droits sur le plan et l'équipe.
export const puedeGestionarEquipo = (rol: string | null | undefined) => rol === "OWNER" || rol === "ADMIN";
export const esChef = puedeGestionarEquipo;
export const esOwner = (rol: string | null | undefined) => rol === "OWNER";

// Facturación avanzada (líneas, suplidos, nº y notas personalizables): Pro y Business.
export const facturacionAvanzada = (plan: string | null | undefined) => plan === "PRO" || plan === "BUSINESS";

// Qui peut asignar quel rôle : un chef (OWNER/ADMIN) peut nommer Administrador / Gestor / Asistente.
export function puedeAsignarRol(miRol: string, rolDestino: string): boolean {
  if (rolDestino === "OWNER") return false; // OWNER = fondateur interne, jamais assignable
  if (miRol === "OWNER" || miRol === "ADMIN") return ROLES_ASIGNABLES.includes(rolDestino as RolId);
  return false;
}
