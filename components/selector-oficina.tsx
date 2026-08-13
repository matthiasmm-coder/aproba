"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { COOKIE_OFICINA } from "@/lib/oficinas";
import { useT } from "@/components/lang-provider";

// Sélecteur de sede, dans l'en-tête. Écrit un cookie puis rafraîchit : le filtrage
// se fait côté serveur, dans la requête de chaque écran — pas en masquant des lignes
// déjà chargées (sur 187 clients, ça se verrait).
//
// « todas » est stocké explicitement : sans ça, effacer le cookie ramènerait le membre
// à SA sede, et il ne pourrait jamais choisir de tout voir.
export function SelectorOficina({
  oficinas, activa,
}: {
  oficinas: { id: string; nombre: string }[];
  activa: string | null;
}) {
  const t = useT();
  const router = useRouter();
  const [pendiente, empezar] = useTransition();

  if (oficinas.length < 2) return null; // une seule sede : rien à choisir

  function elegir(valor: string) {
    // 180 jours, portée à toute l'app. Pas d'info sensible : un id de sede.
    document.cookie = `${COOKIE_OFICINA}=${valor || "todas"}; path=/; max-age=${60 * 60 * 24 * 180}; samesite=lax`;
    empezar(() => router.refresh());
  }

  return (
    <select
      value={activa ?? "todas"}
      onChange={(e) => elegir(e.target.value)}
      disabled={pendiente}
      aria-label={t("Oficina")}
      className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[16px] font-medium text-slate-700 outline-none transition focus:border-aproba-600 disabled:opacity-60 sm:text-sm"
    >
      <option value="todas">{t("Todas las oficinas")}</option>
      {oficinas.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
    </select>
  );
}
