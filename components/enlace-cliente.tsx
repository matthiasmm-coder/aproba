"use client";

import { useState } from "react";
import { copiarTexto } from "@/lib/copiar";
import { useT } from "@/components/lang-provider";

// El enlace del portal, copiable. Vivía SOLO dentro de «Información»; al retirar esa
// sección en los expedientes familiares (redundante con «Familia») el gestor se
// quedaba sin manera de copiar el enlace — así que ahora es su propio bloque y la
// sección Familia lo enseña.
export function EnlaceCliente({ portalToken }: { portalToken: string }) {
  const t = useT();
  const [copiado, setCopiado] = useState(false);
  const [enClaro, setEnClaro] = useState<string | null>(null);

  async function copiar() {
    const url = `${window.location.origin}/j/${portalToken}`;
    if (await copiarTexto(url)) {
      setCopiado(true); setEnClaro(null);
      window.setTimeout(() => setCopiado(false), 4000);
    } else {
      // Nunca dejar al gestor sin el enlace: si el navegador bloquea el portapapeles,
      // se enseña en claro para seleccionarlo a mano.
      setEnClaro(url);
    }
  }

  return (
    <div className="text-center">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{t("Enlace del cliente")}</p>
      <button onClick={copiar} className="mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:border-aproba-400 hover:text-aproba-700">
        {copiado ? t("¡Copiado!") : t("Copiar enlace del cliente")}
      </button>
      {enClaro && (
        <input
          readOnly
          value={enClaro}
          onFocus={(ev) => ev.currentTarget.select()}
          aria-label={t("Enlace del cliente")}
          className="mt-2 w-full bg-transparent text-center font-mono text-[16px] text-slate-700 outline-none sm:text-xs"
        />
      )}
    </div>
  );
}
