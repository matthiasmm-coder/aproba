"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DOC_LABEL } from "@/lib/tramites";
import { PREFIJO_POR_PERSONA, PREFIJO_QUITADO } from "@/lib/familia";
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
  esFamilia = false,
}: {
  expedienteId: string;
  docsActuales: string[];  // todo lo que ya se pide (firma + servicio + añadidos)
  docsTramite: string[];   // solo los del trámite: la hoja/mandato firmados salen SIEMPRE
                           // que el despacho use encargo, y no cuentan como «hay lista»
  docsExtra: string[];     // los añadidos a mano en este expediente
  sugerencias: string[];   // lista estándar del trámite, para el arranque en 1 clic
  nServicios: number;      // 0 = trámite «Otro» sin servicio → se habla de trámite
  esFamilia?: boolean;     // familiar → el gestor elige: del dossier o de cada persona
}) {
  const t = useT();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const yaEstan = new Set(docsActuales.map((d) => d.toLowerCase()));
  const catalogo = Object.values(DOC_LABEL).filter((l) => l !== DOC_LABEL.OTRO && !yaEstan.has(l.toLowerCase()));
  const sugerenciasUtiles = sugerencias.filter((l) => !yaEstan.has(l.toLowerCase()));

  async function guardar(nuevos: string[], porPersona = false) {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/expedientes/${expedienteId}/docs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docs: [...docsExtra, ...nuevos.map((d) => (porPersona ? `${PREFIJO_POR_PERSONA}${d}` : d))] }),
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
    // Sin servicio, el gesto correcto NO es elegir documentos a mano: es elegir el
    // servicio (en «Cambiar servicio», junto al trámite) — sus documentos llegan solos.
    // Los servicios se deciden al crear el expediente o ahí; nunca en esta sección.
    if (nServicios === 0) {
      return (
        <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-5 text-center">
          <p className="text-sm font-semibold text-amber-900">{t("Este expediente aún no tiene servicio")}</p>
          <p className="mt-1 text-xs text-amber-800">{t("Elígelo en «Cambiar servicio», junto al trámite: sus documentos aparecerán aquí solos. ¿Un papel suelto? Pídelo abajo.")}</p>
          <Selector catalogo={catalogo} onGuardar={guardar} guardando={guardando} t={t} esFamilia={esFamilia} />
          {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      );
    }
    const sujeto = nServicios === 1 ? t("este servicio") : t("estos servicios");
    return (
      <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-5 text-center">
        <p className="text-sm font-semibold text-amber-900">
          {nServicios > 1 ? t("Ningún documento asociado a estos servicios") : t("Ningún documento asociado a este servicio")}
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
        <Selector catalogo={catalogo} onGuardar={guardar} guardando={guardando} t={t} esFamilia={esFamilia} />
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
          <Selector catalogo={catalogo} onGuardar={guardar} guardando={guardando} t={t} esFamilia={esFamilia} />
          <button type="button" onClick={() => { setAbierto(false); setError(null); }} className="mt-2 text-[11px] text-slate-400 hover:text-slate-600">
            {t("Cancelar")}
          </button>
          {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

// Desplegable con círculos: se marcan VARIOS y se añaden de una vez. El campo del
// final cubre el papel raro que la extranjería saca siempre («Certificado médico»,
// «Título homologado»…), y aparece en la lista como uno más para poder desmarcarlo.
function Selector({
  catalogo, onGuardar, guardando, t, esFamilia,
}: {
  catalogo: string[];
  onGuardar: (docs: string[], porPersona: boolean) => void;
  guardando: boolean;
  t: (s: string) => string;
  esFamilia: boolean;
}) {
  const [marcados, setMarcados] = useState<string[]>([]);
  const [libre, setLibre] = useState("");
  const [desplegado, setDesplegado] = useState(false);
  // Familiar: ¿un papel DEL DOSSIER (contrato de alquiler, se envía una vez) o uno
  // POR PERSONA (certificado médico de cada solicitante)? Lo decide el gestor aquí.
  const [porPersona, setPorPersona] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  // Cerrar al pulsar fuera o con Escape (un desplegable que se queda abierto tapa
  // las casillas de abajo).
  useEffect(() => {
    if (!desplegado) return;
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setDesplegado(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setDesplegado(false); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", esc); };
  }, [desplegado]);

  const alterna = (l: string) => setMarcados((xs) => (xs.includes(l) ? xs.filter((x) => x !== l) : [...xs, l]));
  const añadeLibre = () => {
    const v = libre.trim();
    if (!v || marcados.some((m) => m.toLowerCase() === v.toLowerCase())) { setLibre(""); return; }
    setMarcados((xs) => [...xs, v]);
    setLibre("");
  };
  const propios = marcados.filter((m) => !catalogo.includes(m));
  const opciones = [...catalogo, ...propios];

  return (
    <div className="mt-3 flex flex-wrap items-start justify-center gap-2">
      <div ref={caja} className="relative">
        <button
          type="button"
          onClick={() => setDesplegado((v) => !v)}
          aria-expanded={desplegado}
          aria-haspopup="listbox"
          className="flex w-[min(18rem,calc(100vw-3rem))] items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 transition hover:border-aproba-400"
        >
          <span className={marcados.length ? "font-medium text-slate-800" : "text-slate-400"}>
            {marcados.length === 0
              ? t("Elegir documentos…")
              : marcados.length === 1
                ? t(marcados[0])
                : `${marcados.length} ${t("documentos elegidos")}`}
          </span>
          <svg className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${desplegado ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </button>

        {desplegado && (
          <div
            role="listbox"
            aria-multiselectable
            // EN EL FLUJO, no flotando: la tarjeta de la sección es overflow-hidden y
            // recortaba el desplegable a media lista. Empuja lo de abajo, y así no hay
            // recorte posible ni desajuste al hacer scroll (móvil incluido).
            className="mt-1 w-[min(18rem,calc(100vw-3rem))] overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm"
          >
            <div className="max-h-64 overflow-y-auto py-1">
              {opciones.map((l) => {
                const on = marcados.includes(l);
                return (
                  <button
                    key={l}
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => alterna(l)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-cream-50"
                  >
                    <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition ${on ? "border-aproba-600 bg-aproba-600" : "border-slate-300"}`}>
                      {on && <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4L19 7" /></svg>}
                    </span>
                    <span className="min-w-0 flex-1 leading-snug">{t(l)}</span>
                  </button>
                );
              })}
            </div>
            {/* El papel que no está en la lista: se escribe y entra ya marcado. */}
            <div className="flex items-center gap-1.5 border-t border-slate-100 p-2">
              <input
                type="text"
                value={libre}
                onChange={(e) => setLibre(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); añadeLibre(); } }}
                placeholder={t("Otro documento…")}
                maxLength={60}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[16px] text-slate-700 outline-none placeholder:text-slate-400 focus:border-aproba-600 sm:text-sm"
              />
              <button
                type="button"
                onClick={añadeLibre}
                disabled={!libre.trim()}
                aria-label={t("Añadir a la selección")}
                className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-600 transition hover:border-aproba-400 hover:text-aproba-700 disabled:opacity-40"
              >
                +
              </button>
            </div>
          </div>
        )}
      </div>

      {esFamilia && (
        <label className="order-last flex w-full cursor-pointer items-center justify-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={porPersona} onChange={(e) => setPorPersona(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-aproba-600 focus:ring-aproba-500" />
          {t("Uno por cada persona de la familia")}
        </label>
      )}
      <button
        type="button"
        onClick={() => onGuardar(marcados, porPersona)}
        disabled={guardando || marcados.length === 0}
        className="rounded-lg bg-aproba-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-60"
      >
        {guardando ? "…" : `${t("Añadir")}${marcados.length ? ` (${marcados.length})` : ""}`}
      </button>
    </div>
  );
}

// × para dejar de pedir un documento propio en un expediente FAMILIAR (en individual
// vive en su casilla). Tolera el prefijo «uno por persona».
export function QuitarDocEsperado({ expedienteId, label, docsExtra }: { expedienteId: string; label: string; docsExtra: string[] }) {
  const t = useT();
  const router = useRouter();
  const [quitando, setQuitando] = useState(false);
  const limpio = (d: string) => (d.startsWith(PREFIJO_POR_PERSONA) ? d.slice(PREFIJO_POR_PERSONA.length).trim() : d);

  async function quitar() {
    setQuitando(true);
    try {
      const res = await fetch(`/api/expedientes/${expedienteId}/docs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docs: (() => {
          const norm = (x: string) => x.trim().toLowerCase();
          const eraPedido = docsExtra.some((d) => !d.startsWith(PREFIJO_QUITADO) && norm(limpio(d)) === norm(label));
          return eraPedido
            ? docsExtra.filter((d) => d.startsWith(PREFIJO_QUITADO) || norm(limpio(d)) !== norm(label))
            : [...docsExtra, `${PREFIJO_QUITADO}${label}`];
        })() }),
      });
      if (!res.ok) throw new Error("ko");
      router.refresh();
    } catch { setQuitando(false); }
  }

  return (
    <button
      type="button"
      onClick={quitar}
      disabled={quitando}
      title={t("Dejar de pedir este documento")}
      aria-label={t("Dejar de pedir este documento")}
      className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-slate-300 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
    >
      {quitando ? "…" : (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
      )}
    </button>
  );
}
