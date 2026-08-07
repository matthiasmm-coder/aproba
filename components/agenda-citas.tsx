"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { confirmar } from "@/components/confirm-dialog";
import { NuevaCitaModal } from "@/components/nueva-cita-modal";
import type { ItemAgenda, ClienteMin } from "@/lib/data/citas";

// Agenda SEMANAL del Inicio — sustituye a la lista «Próximas citas» conservando TODO
// su ciclo: crear (modal con aviso por email al cliente), editar, eliminar, y las citas
// de administración siguen enlazando a su expediente. Novedad de presentación: la
// semana se ve entera (las citas ya pasadas quedan atenuadas, no desaparecen) y se
// navega con ← Hoy →.
//
// `hoy` llega del servidor (misma fuente que la ventana de datos) para que SSR e
// hidratación pinten la MISMA semana — Date.now() aquí daría un mismatch a medianoche.

const DIAS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Aritmética de fechas ISO (YYYY-MM-DD) en UTC: sin sorpresas de zona horaria.
const aDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const addDias = (iso: string, n: number) => { const d = aDate(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const lunesDe = (iso: string) => addDias(iso, -((aDate(iso).getUTCDay() + 6) % 7));

export function AgendaCitas({ citas, clientes, hoy }: { citas: ItemAgenda[]; clientes: ClienteMin[]; hoy: string }) {
  const t = useT();
  const router = useRouter();
  const [offset, setOffset] = useState(0); // semanas respecto a la actual
  const [diaSel, setDiaSel] = useState<string | null>(null); // móvil: día elegido en la tira
  const [abierto, setAbierto] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [ahora, setAhora] = useState<number | null>(null);

  // Solo para ATENUAR citas pasadas (null en SSR → sin atenuación, sin mismatch).
  useEffect(() => {
    setAhora(Date.now());
    const id = setInterval(() => setAhora(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const lunes = addDias(lunesDe(hoy), offset * 7);
  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => addDias(lunes, i)), [lunes]);
  // Día activo de la tira móvil: el elegido si pertenece a la semana visible; si no
  // (se cambió de semana), hoy cuando cae en esa semana, o el lunes. Derivado, sin efecto.
  const diaActivo = diaSel && dias.includes(diaSel) ? diaSel : dias.includes(hoy) ? hoy : dias[0];

  const porDia = useMemo(() => {
    const m = new Map<string, ItemAgenda[]>();
    for (const c of citas) {
      if (!m.has(c.fecha)) m.set(c.fecha, []);
      m.get(c.fecha)!.push(c);
    }
    for (const lista of m.values()) lista.sort((a, b) => (a.hora ?? "99:99").localeCompare(b.hora ?? "99:99"));
    return m;
  }, [citas]);

  const etiqueta = (d0: string, d6: string) => {
    const a = aDate(d0), b = aDate(d6);
    if (a.getUTCFullYear() !== b.getUTCFullYear()) return `${a.getUTCDate()} ${t(MESES[a.getUTCMonth()])} ${a.getUTCFullYear()} – ${b.getUTCDate()} ${t(MESES[b.getUTCMonth()])} ${b.getUTCFullYear()}`;
    if (a.getUTCMonth() !== b.getUTCMonth()) return `${a.getUTCDate()} ${t(MESES[a.getUTCMonth()])} – ${b.getUTCDate()} ${t(MESES[b.getUTCMonth()])} ${b.getUTCFullYear()}`;
    return `${a.getUTCDate()} – ${b.getUTCDate()} ${t(MESES[a.getUTCMonth()])} ${a.getUTCFullYear()}`;
  };

  // Cita pasada → atenuada (la semana entera sigue visible: es una agenda, no una lista).
  const pasada = (c: ItemAgenda) => {
    if (ahora === null) return false;
    const fin = c.hora
      ? new Date(`${c.fecha}T${c.hora}`).getTime() + (c.tipo === "previa" ? (c.duracion ?? 60) : 60) * 60000
      : new Date(`${c.fecha}T23:59:59`).getTime();
    return Number.isNaN(fin) ? false : fin < ahora;
  };

  async function borrar(id: string) {
    if (!(await confirmar({ mensaje: t("¿Eliminar esta cita?"), peligro: true, confirmarLabel: t("Eliminar") }))) return;
    setBorrando(id);
    try {
      const r = await fetch("/api/citas-previas", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (r.ok) router.refresh();
    } finally { setBorrando(null); }
  }

  // Fin de la cita (HH:MM) a partir de hora + duración — solo previas con ambas.
  const horaFin = (c: ItemAgenda) => {
    if (!c.hora || c.tipo !== "previa" || !c.duracion) return null;
    const [h, m] = c.hora.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    const tot = (h * 60 + m + c.duracion) % 1440;
    return `${String(Math.floor(tot / 60)).padStart(2, "0")}:${String(tot % 60).padStart(2, "0")}`;
  };
  const tooltip = (c: ItemAgenda) => (c.tipo === "administracion"
    ? [t("Cita administración"), c.referencia, c.hora, c.lugar]
    : [c.clienteNombre, c.motivo || t("Consulta"), c.hora, c.lugar]
  ).filter(Boolean).join(" · ");

  // Tarjeta de cita, 3 líneas: franja horaria (14:00 – 14:30) / nombre / motivo, lugar.
  // Un solo color (verde) para ambos tipos — pedido de Matthias: sin leyenda ni índigo.
  const Chip = ({ c }: { c: ItemAgenda }) => {
    const fin = horaFin(c);
    const sub = (c.tipo === "administracion"
      ? [t("Administración"), c.referencia, c.lugar]
      : [c.motivo || t("Consulta"), c.lugar]
    ).filter(Boolean).join(", ");
    const inner = (
      <>
        {c.hora && <p className="text-[11px] font-bold leading-tight">{c.hora}{fin ? ` – ${fin}` : ""}</p>}
        <p className="truncate text-[11px] font-medium leading-tight">{c.clienteNombre}</p>
        <p className="truncate text-[10px] opacity-70">{sub}</p>
      </>
    );
    if (c.tipo === "administracion" && c.expedienteId) {
      return (
        <Link
          href={`/app/expedientes/${c.expedienteId}`}
          title={tooltip(c)}
          className={`block rounded-md border border-aproba-100 bg-aproba-50 px-1.5 py-1 text-center text-aproba-900 transition hover:border-aproba-300 ${pasada(c) ? "opacity-45" : ""}`}
        >
          {inner}
        </Link>
      );
    }
    return (
      <div className={`group relative ${pasada(c) ? "opacity-45" : ""}`}>
        <button
          onClick={() => setEditId(c.id)}
          title={`${tooltip(c)} — ${t("Editar")}`}
          className="w-full rounded-md border border-aproba-100 bg-aproba-50 px-7 py-1 text-center text-aproba-900 transition hover:border-aproba-300 md:px-1.5"
        >
          {inner}
        </button>
        {/* Eliminar: visible en móvil (sin hover), al pasar el ratón en escritorio. */}
        <button
          onClick={() => borrar(c.id)}
          disabled={borrando === c.id}
          aria-label={t("Eliminar")}
          className="absolute right-0.5 top-1/2 flex -translate-y-1/2 rounded-md p-1 text-slate-300 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-50 md:hidden md:group-hover:flex"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
        </button>
      </div>
    );
  };

  const totalSemana = dias.reduce((n, d) => n + (porDia.get(d)?.length ?? 0), 0);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="font-semibold text-slate-900">{t("Agenda")}</h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center overflow-hidden rounded-lg border border-slate-200">
            <button onClick={() => setOffset((o) => o - 1)} aria-label={t("Semana anterior")} className="p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <button onClick={() => setOffset(0)} disabled={offset === 0} className="border-x border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-aproba-700 disabled:cursor-default disabled:text-slate-300 disabled:hover:bg-white">
              {t("Hoy")}
            </button>
            <button onClick={() => setOffset((o) => o + 1)} aria-label={t("Semana siguiente")} className="p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </button>
          </div>
          <span className="hidden min-w-[9.5rem] text-center text-sm font-medium text-slate-600 lg:block">{etiqueta(dias[0], dias[6])}</span>
          <button onClick={() => setAbierto(true)} className="inline-flex items-center gap-1 rounded-lg bg-aproba-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-aproba-700">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
            {t("Nueva cita")}
          </button>
        </div>
      </div>

      <p className="mb-2 text-center text-sm font-medium text-slate-600 lg:hidden">{etiqueta(dias[0], dias[6])}</p>

      {/* ── Móvil: tira de 7 días (puntos = citas) + lista del día elegido ──
          Apilar las 7 columnas hacía scrollear seis filas vacías para ver una cita;
          la tira es el patrón de los calendarios móviles: todo el contexto en una
          fila, el detalle del día debajo. El día elegido vive en diaSel y se
          RE-DERIVA al cambiar de semana (si ya no pertenece, cae en hoy o lunes). */}
      <div className="md:hidden">
        <div className="grid grid-cols-7 gap-1">
          {dias.map((d, i) => {
            const del = porDia.get(d) ?? [];
            const esHoy = d === hoy;
            const sel = d === diaActivo;
            return (
              <button
                key={d}
                onClick={() => setDiaSel(d)}
                aria-pressed={sel}
                className={`flex min-h-[3.5rem] flex-col items-center rounded-xl py-1.5 transition ${sel ? "bg-aproba-600" : esHoy ? "bg-aproba-50" : "active:bg-slate-100"}`}
              >
                <span className={`text-[10px] font-semibold uppercase tracking-wide ${sel ? "text-aproba-100" : "text-slate-400"}`}>{t(DIAS[i])}</span>
                <span className={`text-sm font-bold ${sel ? "text-white" : esHoy ? "text-aproba-700" : "text-slate-700"}`}>{aDate(d).getUTCDate()}</span>
                <span className="mt-1 flex h-1.5 items-center gap-0.5">
                  {del.slice(0, 3).map((c) => (
                    <span key={c.id} className={`h-1.5 w-1.5 rounded-full ${sel ? "bg-white/80" : "bg-aproba-500"}`} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 space-y-1.5">
          {(porDia.get(diaActivo) ?? []).map((c) => <Chip key={c.id} c={c} />)}
          {totalSemana === 0 ? (
            <p className="py-3 text-center text-sm text-slate-400">{t("Sin citas esta semana. Crea una para empezar tu agenda.")}</p>
          ) : (porDia.get(diaActivo) ?? []).length === 0 && (
            <p className="py-3 text-center text-sm text-slate-400">{t("Sin citas este día.")}</p>
          )}
        </div>
      </div>

      {/* ── Escritorio: rejilla semanal de 7 columnas ── */}
      <div className="hidden md:grid md:grid-cols-7 md:divide-x md:divide-slate-100 md:overflow-hidden md:rounded-xl md:border md:border-slate-100">
        {dias.map((d, i) => {
          const del = porDia.get(d) ?? [];
          const esHoy = d === hoy;
          return (
            <div key={d} className={`min-h-[8.5rem] px-1.5 py-2 ${esHoy ? "bg-aproba-50/60" : ""}`}>
              <div className="flex flex-col items-center gap-0.5 px-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t(DIAS[i])}</span>
                <span className={`text-sm font-bold ${esHoy ? "flex h-6 w-6 items-center justify-center rounded-full bg-aproba-600 text-white" : "text-slate-700"}`}>
                  {aDate(d).getUTCDate()}
                </span>
              </div>
              {del.length > 0 && <div className="mt-1.5 space-y-1.5">{del.map((c) => <Chip key={c.id} c={c} />)}</div>}
            </div>
          );
        })}
      </div>

      {totalSemana === 0 && (
        <p className="mt-3 hidden text-center text-sm text-slate-400 md:block">{t("Sin citas esta semana. Crea una para empezar tu agenda.")}</p>
      )}

      {abierto && <NuevaCitaModal clientes={clientes} onClose={() => setAbierto(false)} />}
      {editId && <NuevaCitaModal clientes={clientes} citaId={editId} onClose={() => setEditId(null)} />}
    </div>
  );
}
