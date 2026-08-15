"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { COOKIE_OFICINA } from "@/lib/oficinas";
import { useT } from "@/components/lang-provider";

// Pastillas de sede sur les écrans de travail (Inicio, Expedientes, Clientes,
// Vencimientos, Facturas) — remplacent le select de l'en-tête. Même mécanique :
// cookie + refresh, le filtrage reste côté serveur dans la requête de chaque écran.
//
// « Todas » en tête : la vue consolidée est la raison d'être du multi-oficina pour
// un administrateur (la demande d'origine de Jennifer). Un membre verrouillé sur
// sa sede ne voit pas les pastillas (resolverOficina ne lui donne qu'une option).
export function PastillasOficina({
  oficinas, activa,
}: {
  oficinas: { id: string; nombre: string }[];
  activa: string | null;
}) {
  const t = useT();
  const router = useRouter();
  const [pendiente, empezar] = useTransition();

  if (oficinas.length < 2) return null;

  function elegir(valor: string | null) {
    document.cookie = `${COOKIE_OFICINA}=${valor ?? "todas"}; path=/; max-age=${60 * 60 * 24 * 180}; samesite=lax`;
    empezar(() => router.refresh());
  }

  const pastilla = (id: string | null, nombre: string) => (
    <button
      key={id ?? "todas"}
      type="button"
      disabled={pendiente}
      onClick={() => elegir(id)}
      title={id === null ? t("Vista de lectura: para crear, elige una oficina concreta") : undefined}
      className={`inline-flex items-center rounded-full border px-4 py-1.5 text-sm font-semibold transition disabled:opacity-60 ${
        (activa ?? null) === id
          ? "border-aproba-600 bg-aproba-600 text-white shadow-sm"
          : "border-slate-300 bg-white text-slate-600 hover:border-aproba-400 hover:text-aproba-700"
      }`}
    >
      <span className="max-w-[14rem] truncate">{nombre}</span>
    </button>
  );

  return (
    <div className="mb-5 flex flex-wrap items-center justify-center gap-2">
      {pastilla(null, t("Todas"))}
      {oficinas.map((o) => pastilla(o.id, o.nombre))}
    </div>
  );
}
