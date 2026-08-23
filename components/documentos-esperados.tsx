"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DOC_LABEL } from "@/lib/tramites";
import { useT } from "@/components/lang-provider";

// «¿Qué hay que reunir en este expediente?» — la pregunta que la ficha no contestaba.
// El servicio trae su lista; aquí el gestor añade lo que falte (trámite «Otro», un
// servicio propio del despacho sin lista, o un papel puntual de ESTE caso). Lo que
// añade aparece IGUAL en el portal del cliente, en el progreso y en el recordatorio.

export function DocumentosEsperados({
  expedienteId,
  docsServicio,
  docsExtra,
  sugerencias,
}: {
  expedienteId: string;
  docsServicio: string[];   // los que vienen del servicio (no se pueden quitar aquí)
  docsExtra: string[];      // los añadidos a mano en este expediente
  sugerencias: string[];    // lista estándar del trámite, para el arranque en 1 clic
}) {
  const t = useT();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [libre, setLibre] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = docsServicio.length + docsExtra.length;
  const yaEstan = new Set([...docsServicio, ...docsExtra].map((d) => d.toLowerCase()));
  const catalogo = Object.values(DOC_LABEL).filter((l) => !yaEstan.has(l.toLowerCase()));
  const sugerenciasUtiles = sugerencias.filter((l) => !yaEstan.has(l.toLowerCase()));

  async function guardar(nuevos: string[]) {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/expedientes/${expedienteId}/docs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docs: nuevos }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? t("No se pudo guardar."));
      setLibre("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo guardar."));
    } finally {
      setGuardando(false);
    }
  }

  const añadir = (label: string) => guardar([...docsExtra, label]);

  // Sin NINGÚN documento esperado: el caso que dejaba la ficha muda. Se dice
  // claramente y se ofrece el arranque en un clic.
  if (total === 0) {
    return (
      <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-5 text-center">
        <p className="text-sm font-semibold text-amber-900">{t("Aún no sabemos qué documentos pedir")}</p>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-amber-800">
          {t("Este servicio no trae lista de documentos. Elige los que el cliente (o tú) tenéis que reunir: aparecerán aquí y en el enlace del cliente.")}
        </p>
        {sugerenciasUtiles.length > 0 && (
          <button
            type="button"
            onClick={() => guardar(sugerenciasUtiles)}
            disabled={guardando}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-aproba-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-60"
          >
            {t("Usar la lista habitual")} ({sugerenciasUtiles.length})
          </button>
        )}
        <div className="mt-3">
          <Selector catalogo={catalogo} libre={libre} setLibre={setLibre} onAñadir={añadir} guardando={guardando} t={t} />
        </div>
        {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-3 text-center">
      {!abierto ? (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="text-xs font-medium text-slate-400 transition hover:text-aproba-700"
        >
          {t("+ Pedir otro documento")}
        </button>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="mb-2 text-xs text-slate-500">{t("Se añadirá a las casillas de arriba y al enlace del cliente.")}</p>
          <Selector catalogo={catalogo} libre={libre} setLibre={setLibre} onAñadir={añadir} guardando={guardando} t={t} />
          <button type="button" onClick={() => { setAbierto(false); setError(null); }} className="mt-2 text-[11px] text-slate-400 hover:text-slate-600">
            {t("Cancelar")}
          </button>
          {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

// Elegir de la lista estándar o escribir uno propio («Certificado médico», «Título
// homologado»…): en extranjería cada caso trae su papel raro.
function Selector({
  catalogo, libre, setLibre, onAñadir, guardando, t,
}: {
  catalogo: string[];
  libre: string;
  setLibre: (v: string) => void;
  onAñadir: (label: string) => void;
  guardando: boolean;
  t: (s: string) => string;
}) {
  const [elegido, setElegido] = useState("");
  const valor = libre.trim() || elegido;
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <select
        value={elegido}
        onChange={(e) => { setElegido(e.target.value); setLibre(""); }}
        aria-label={t("Documento a pedir")}
        className="min-w-0 max-w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[16px] text-slate-700 outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100 sm:text-sm"
      >
        <option value="">{t("Elegir de la lista…")}</option>
        {catalogo.map((l) => <option key={l} value={l}>{t(l)}</option>)}
      </select>
      <input
        type="text"
        value={libre}
        onChange={(e) => { setLibre(e.target.value); if (e.target.value) setElegido(""); }}
        placeholder={t("…o escríbelo")}
        maxLength={60}
        className="w-40 min-w-0 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[16px] text-slate-700 outline-none placeholder:text-slate-400 focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100 sm:text-sm"
      />
      <button
        type="button"
        onClick={() => { if (valor) { onAñadir(valor); setElegido(""); } }}
        disabled={guardando || !valor}
        className="rounded-lg bg-aproba-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-60"
      >
        {guardando ? "…" : t("Añadir")}
      </button>
    </div>
  );
}
