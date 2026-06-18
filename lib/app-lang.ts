import "server-only";
import { cookies } from "next/headers";
import { LANG_COOKIE, translate, type Lang } from "@/lib/app-i18n";

// Langue de l'interface lue côté serveur (cookie). Défaut : espagnol.
export async function getLang(): Promise<Lang> {
  const c = await cookies();
  return c.get(LANG_COOKIE)?.value === "ca" ? "ca" : "es";
}

// Helper pratique pour les Server Components : const t = await getT(); t("texto").
export async function getT(): Promise<(es: string) => string> {
  const lang = await getLang();
  return (es: string) => translate(lang, es);
}
