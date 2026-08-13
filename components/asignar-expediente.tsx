"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";

// Quién lleva este expediente. No es un adorno: un ASISTENTE solo ve los suyos
// (supabase/roles-asistente.sql), así que asignar ES la forma de encargarle trabajo.
// El ASISTENTE no ve este selector — reparte quien dirige.
export function AsignarExpediente({
  expedienteId, miembros, inicial, puedeAsignar,
}: {
  expedienteId: string;
  miembros: { userId: string; nombre: string }[];
  inicial: string | null;
  puedeAsignar: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [valor, setValor] = useState(inicial ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nombreDe = (id: string) => miembros.find((m) => m.userId === id)?.nombre ?? t("Sin asignar");

  if (!puedeAsignar) {
    return <span className="font-medium text-slate-700">{nombreDe(valor)}</span>;
  }

  async function asignar(userId: string) {
    const previo = valor;
    setValor(userId);          // optimista : le sélecteur ne doit pas « sauter »
    setError(null);
    setGuardando(true);
    const res = await fetch(`/api/expedientes/${expedienteId}/asignado`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: userId || null }),
    });
    setGuardando(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setValor(previo);        // l'écran ne ment pas : on revient à l'état réel
      setError(String(d.error ?? t("No se pudo asignar.")));
      return;
    }
    router.refresh();          // le tablero et la carga del equipo suivent
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <select
        value={valor}
        disabled={guardando}
        onChange={(e) => asignar(e.target.value)}
        aria-label={t("Asignado a")}
        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[16px] font-medium text-slate-700 outline-none transition focus:border-aproba-600 disabled:opacity-60 sm:text-sm"
      >
        <option value="">{t("Sin asignar")}</option>
        {miembros.map((m) => <option key={m.userId} value={m.userId}>{m.nombre}</option>)}
      </select>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
