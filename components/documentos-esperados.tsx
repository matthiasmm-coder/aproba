"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DOC_LABEL } from "@/lib/tramites";
import { useT } from "@/components/lang-provider";

// «¿Qué hay que reunir en este expediente?» — la pregunta que la ficha no contestaba.
// El servicio trae su lista; aquí el gestor añade lo que falte (trámite «Otro», un
// servicio propio del despacho sin lista, o un papel puntual de ESTE caso). Lo que
// añade aparece IGUAL en el portal del cliente, en el progreso y en el recordatorio.
// Se eligen VARIOS de una vez (marcar y añadir): de uno en uno era un suplicio.

export function DocumentosEsperados({
  expedienteId,
  docsActuales,
  docsTramite,
  docsExtra,
  sugerencias,
  nServicios,
}: {
  expedienteId: string;
  docsActuales: string[];  // todo lo que ya se pide (firma + servicio + añadidos)
  docsTramite: string[];   // solo los del trámite: la hoja/mandato firmados salen SIEMPRE
                           // que el despacho use encargo, y no cuentan como «hay lista»
  docsExtra: string[];     // los añadidos a mano en este expediente
  sugerencias: string[];   // lista estándar del trámite, para el arranque en 1 clic
  nServicios: number;      // 0 = trámite «Otro» sin servicio → se habla de trámite
}) {
  const t = useT();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const yaEstan = new Set(docsActuales.map((d) => d.toLowerCase()));
  const catalogo = Object.values(DOC_LABEL).filter((l) => l !== DOC_LABEL.OTRO && !yaEstan.has(l.toLowerCase()));
  const sugerenciasUtiles = sugerencias.filter((l) => !yaEstan.has(l.toLowerCase()));

  async function guardar(nuevos: string[]) {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/expedientes/${expedienteId}/docs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docs: [...docsExtra, ...nuevos] }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? t("No se pudo guardar."));
      setAbierto(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo guardar."));
    } finally {
      setGuardando(false);
    }
  }

  // Sin NINGÚN documento esperado: el caso que dejaba la ficha muda.
  if (docsTramite.length === 0) {
    const sujeto = nServicios === 0 ? t("este trámite") : nServicios === 1 ? t("este servicio") : t("estos servicios");
    return (
      <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-5 text-center">
        <p className="text-sm font-semibold text-amber-900">
          {nServicios > 1 ? t("Ningún documento asociado a estos servicios") : nServicios === 1 ? t("Ningún documento asociado a este servicio") : t("Ningún documento asociado a este trámite")}
        </p>
        <p className="mt-1 text-xs text-amber-800">{t("Elige los documentos necesarios para")} {sujeto}.</p>
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
        <Selector catalogo={catalogo} onGuardar={guardar} guardando={guardando} t={t} />
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
          <p className="text-xs text-slate-500">{t("Se añadirán a las casillas de arriba y al enlace del cliente.")}</p>
          <Selector catalogo={catalogo} onGuardar={guardar} guardando={guardando} t={t} />
          <button type="button" onClick={() => { setAbierto(false); setError(null); }} className="mt-2 text-[11px] text-slate-400 hover:text-slate-600">
            {t("Cancelar")}
          </button>
          {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

// Marcar VARIOS de golpe y añadirlos de una vez. El campo libre cubre el papel raro
// que la extranjería saca siempre («Certificado médico», «Título homologado»…).
function Selector({
  catalogo, onGuardar, guardando, t,
}: {
  catalogo: string[];
  onGuardar: (docs: string[]) => void;
  guardando: boolean;
  t: (s: string) => string;
}) {
  const [marcados, setMarcados] = useState<string[]>([]);
  const [libre, setLibre] = useState("");

  const alterna = (l: string) => setMarcados((xs) => (xs.includes(l) ? xs.filter((x) => x !== l) : [...xs, l]));
  const añadeLibre = () => {
    const v = libre.trim();
    if (!v || marcados.some((m) => m.toLowerCase() === v.toLowerCase())) { setLibre(""); return; }
    setMarcados((xs) => [...xs, v]);
    setLibre("");
  };
  // Los escritos a mano también son chips: se ven y se quitan igual que los del catálogo.
  const propios = marcados.filter((m) => !catalogo.includes(m));

  return (
    <div className="mt-3">
      <div className="flex flex-wrap justify-center gap-1.5">
        {[...catalogo, ...propios].map((l) => {
          const on = marcados.includes(l);
          return (
            <button
              key={l}
              type="button"
              onClick={() => alterna(l)}
              aria-pressed={on}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${on ? "border-aproba-600 bg-aproba-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:border-aproba-400 hover:text-aproba-700"}`}
            >
              {on ? "✓ " : ""}{t(l)}
            </button>
          );
        })}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2">
        <input
          type="text"
          value={libre}
          onChange={(e) => setLibre(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); añadeLibre(); } }}
          placeholder={t("Otro documento…")}
          maxLength={60}
          className="w-44 min-w-0 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[16px] text-slate-700 outline-none placeholder:text-slate-400 focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100 sm:text-sm"
        />
        <button
          type="button"
          onClick={añadeLibre}
          disabled={!libre.trim()}
          aria-label={t("Añadir a la selección")}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-semibold text-slate-600 transition hover:border-aproba-400 hover:text-aproba-700 disabled:opacity-40"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => onGuardar(marcados)}
          disabled={guardando || marcados.length === 0}
          className="rounded-lg bg-aproba-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-60"
        >
          {guardando ? "…" : `${t("Añadir")}${marcados.length ? ` (${marcados.length})` : ""}`}
        </button>
      </div>
    </div>
  );
}
