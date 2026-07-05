// Traducciones ADICIONALES del portal (árabe, rumano, chino) — claves namespaceadas
// («ui:s2.errorSubir», «field:nombre», «doc:PASAPORTE.label»…). Generadas a partir de
// las estructuras de portal-i18n.ts (scripts/i18n-extra). Clave ausente → español.
import type { Lang } from "@/lib/portal-i18n";
import { AR } from "@/lib/i18n/ar";
import { RO } from "@/lib/i18n/ro";
import { ZH } from "@/lib/i18n/zh";

export const EXTRA: Partial<Record<Lang, Record<string, string>>> = { ar: AR, ro: RO, zh: ZH };
