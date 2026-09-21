"use client";

import Link from "next/link";
import { useT } from "@/components/lang-provider";

// Las TRES vistas de Expedientes: lo que está en curso, lo terminado (Historial) y lo
// que viene (Renovaciones — el radar Vigía, hasta el 20/09 un menú aparte llamado
// «Vencimientos»; Matthias lo quiso aquí, como una vista más del mismo cuadro).
// Dentro de la lista, «En curso» e «Historial» cambian de vista sin recargar (onCambiar);
// desde la pantalla de renovaciones son enlaces. La ruta /app/vencimientos NO cambia:
// los enlaces del KPI «Caducan pronto», de los emails y de la guía siguen valiendo.
export type VistaExpedientes = "curso" | "historial" | "renovaciones" | "requerimientos";

export function ArchiveIcon({ className = "" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="5" x="2" y="3" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4" /></svg>;
}
function RenovacionesIcon({ className = "" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M8 16H3v5" /></svg>;
}

const RUTAS: Record<VistaExpedientes, string> = { curso: "/app/expedientes", historial: "/app/expedientes?vista=historial", renovaciones: "/app/vencimientos", requerimientos: "/app/requerimientos" };

// Requerimientos (21/09/2026, petición de Jennifer): un reloj, porque lo que define a
// esta vista es el plazo. El contador va en ROJO cuando hay alguno vencido o que vence
// hoy: es la única cifra de la pantalla que puede tumbar un expediente.
function RequerimientosIcon({ className = "" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
}

export function VistasExpedientes({ activa, totalHistorial = 0, totalRenovaciones = 0, totalRequerimientos = 0, requerimientosUrgentes = false, onCambiar }: {
  activa: VistaExpedientes;
  totalHistorial?: number;
  totalRenovaciones?: number;
  totalRequerimientos?: number;
  requerimientosUrgentes?: boolean;
  onCambiar?: (vista: "curso" | "historial") => void;
}) {
  const t = useT();
  const cls = (v: VistaExpedientes) => `flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${activa === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`;
  const n = (x: number) => x > 0 ? <span className="text-xs text-slate-400">{x}</span> : null;
  const contenido: Record<VistaExpedientes, React.ReactNode> = {
    curso: t("En curso"),
    historial: <><ArchiveIcon className="h-3.5 w-3.5" />{t("Historial")} {n(totalHistorial)}</>,
    renovaciones: <><RenovacionesIcon className="h-3.5 w-3.5" />{t("Renovaciones")} {n(totalRenovaciones)}</>,
    requerimientos: <><RequerimientosIcon className="h-3.5 w-3.5" />{t("Requerimientos")} {totalRequerimientos > 0 ? <span className={`text-xs ${requerimientosUrgentes ? "font-bold text-red-600" : "text-slate-400"}`}>{totalRequerimientos}</span> : null}</>,
  };
  return (
    <div className="inline-flex gap-1 rounded-lg bg-slate-100 p-1">
      {(["curso", "historial", "renovaciones", "requerimientos"] as const).map((v) =>
        onCambiar && v !== "renovaciones" && v !== "requerimientos"
          ? <button key={v} type="button" onClick={() => onCambiar(v)} className={cls(v)} aria-current={activa === v ? "page" : undefined}>{contenido[v]}</button>
          : <Link key={v} href={RUTAS[v]} className={cls(v)} aria-current={activa === v ? "page" : undefined}>{contenido[v]}</Link>,
      )}
    </div>
  );
}
