"use client";

import { useState } from "react";
import { MESES } from "@/lib/facturas";

const DIAS = ["L", "M", "X", "J", "V", "S", "D"];
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function DateRangePicker({
  from,
  to,
  onChange,
  initialMonth,
}: {
  from: Date | null;
  to: Date | null;
  onChange: (from: Date, to: Date) => void;
  initialMonth: Date;
}) {
  const [view, setView] = useState(new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1));
  const [start, setStart] = useState<Date | null>(null); // début d'une sélection en cours

  const year = view.getFullYear();
  const month = view.getMonth();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // lundi = 0
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: days }, (_, i) => new Date(year, month, i + 1))];

  function pick(d: Date) {
    const day = startOfDay(d);
    if (start === null) {
      // 1er clic : on démarre une sélection, on ne valide pas encore (chiffres inchangés)
      setStart(day);
    } else {
      // 2e clic : on valide la plage complète
      const a = day < start ? day : start;
      const b = day < start ? start : day;
      setStart(null);
      onChange(a, b);
    }
  }

  function cell(d: Date) {
    if (start) {
      // sélection en cours : on met en avant uniquement le point de départ
      return { edge: sameDay(d, start), between: false };
    }
    const edge = (from && sameDay(d, from)) || (to && sameDay(d, to));
    const between = !!from && !!to && d > from && d < to;
    return { edge, between };
  }

  return (
    <div className="w-[280px] rounded-xl border border-slate-200 bg-white p-3 shadow-card">
      <div className="mb-2 flex items-center justify-between px-1">
        <button onClick={() => setView(new Date(year, month - 1, 1))} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Mes anterior">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <span className="text-sm font-semibold capitalize text-slate-800">{MESES[month]} {year}</span>
        <button onClick={() => setView(new Date(year, month + 1, 1))} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Mes siguiente">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </button>
      </div>
      {start && <p className="mb-1.5 px-1 text-[11px] text-aproba-700">Elige la fecha final…</p>}
      <div className="grid grid-cols-7 gap-0.5">
        {DIAS.map((d) => <span key={d} className="py-1 text-center text-[10px] font-semibold text-slate-400">{d}</span>)}
        {cells.map((d, i) => {
          if (!d) return <span key={i} />;
          const { edge, between } = cell(d);
          return (
            <button
              key={i}
              onClick={() => pick(d)}
              className={`flex h-8 items-center justify-center rounded-md text-[13px] transition ${
                edge ? "bg-aproba-600 font-semibold text-white" : between ? "bg-aproba-100 text-aproba-700" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
