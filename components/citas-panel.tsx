"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";

// Sección «Citas» de la ficha (22/08/2026, pedido de Matthias): el gestor apunta la
// cita del expediente — fecha, hora, dirección, quién acude (cliente / gestor / ambos)
// y notas libres (qué llevar, planta, ventanilla…). Guarda por la ruta /avanzar de
// siempre (accion "cita"): la cita es un HECHO del expediente, editable en cualquier
// punto del trámite, y al guardar se avisa al cliente. La idempotencia por contenido
// vive en el servidor: guardar sin cambiar nada no re-avisa a nadie.
export function CitasPanel({ expedienteId, inicial, quienPorDefecto }: {
  expedienteId: string;
  inicial: { fecha: string | null; hora: string | null; lugar: string | null; notas: string | null; quien: string | null };
  // Derivado del servicio (ServicioConfig.citaQuien): el valor histórico, ahora solo el defecto.
  quienPorDefecto: "cliente" | "gestor";
}) {
  const t = useT();
  const router = useRouter();
  const [fecha, setFecha] = useState(inicial.fecha ?? "");
  const [hora, setHora] = useState(inicial.hora ?? "");
  const [lugar, setLugar] = useState(inicial.lugar ?? "");
  const [notas, setNotas] = useState(inicial.notas ?? "");
  const [quien, setQuien] = useState<string>(inicial.quien ?? quienPorDefecto);
  const [estado, setEstado] = useState<"idle" | "guardando" | "ok" | "sin_cambios" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    if (!fecha || estado === "guardando") return;
    setEstado("guardando"); setError(null);
    try {
      const res = await fetch(`/api/expedientes/${expedienteId}/avanzar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "cita", fecha, hora: hora || undefined, lugar: lugar || undefined, notas: notas || undefined, quien }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? t("No se pudo guardar la cita."));
      setEstado(j.sinCambios ? "sin_cambios" : "ok");
      router.refresh();
    } catch (e) {
      setEstado("error");
      setError(e instanceof Error ? e.message : t("No se pudo guardar la cita."));
    }
  }

  const opciones: { valor: string; label: string }[] = [
    { valor: "cliente", label: t("El cliente") },
    { valor: "gestor", label: t("El gestor") },
    { valor: "ambos", label: t("Ambos") },
  ];
  // 16 px en móvil: por debajo, Safari de iOS hace zoom al enfocar el campo.
  const inp = "w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-[16px] sm:text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100";

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs text-slate-500">
          {t("Fecha")} *
          <input type="date" value={fecha} onChange={(e) => { setFecha(e.target.value); setEstado("idle"); }} className={`mt-1 ${inp}`} />
        </label>
        <label className="block text-xs text-slate-500">
          {t("Hora")}
          <input type="time" value={hora} onChange={(e) => { setHora(e.target.value); setEstado("idle"); }} className={`mt-1 ${inp}`} />
        </label>
        <div className="block text-xs text-slate-500">
          {t("¿Quién acude?")}
          <div className="mt-1 flex gap-1 rounded-lg bg-slate-100 p-1">
            {opciones.map((o) => (
              <button key={o.valor} type="button" onClick={() => { setQuien(o.valor); setEstado("idle"); }}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition ${quien === o.valor ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <label className="mt-3 block text-xs text-slate-500">
        {t("Lugar / dirección")}
        <input value={lugar} onChange={(e) => { setLugar(e.target.value); setEstado("idle"); }} placeholder={t("Oficina de Extranjería, C/ Murcia 42, Barcelona…")} className={`mt-1 ${inp}`} />
      </label>

      <label className="mt-3 block text-xs text-slate-500">
        {t("Notas para la cita")}
        <textarea value={notas} onChange={(e) => { setNotas(e.target.value); setEstado("idle"); }} rows={3}
          placeholder={t("Qué llevar: pasaporte, justificante de la tasa, foto carné… planta, ventanilla, a quién preguntar.")}
          className={`mt-1 ${inp} resize-y`} />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button onClick={guardar} disabled={!fecha || estado === "guardando"} className="rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-50">
          {estado === "guardando" ? "…" : t(inicial.fecha ? "Guardar cambios" : "Guardar cita")}
        </button>
        <p className="text-[11px] leading-relaxed text-slate-400">
          {quien === "gestor"
            ? t("Al guardar se avisa al cliente de que la gestoría acude por él.")
            : t("Al guardar se avisa al cliente con la fecha, la hora, el lugar y las notas.")}
        </p>
      </div>
      {estado === "ok" && <p className="mt-2 text-xs font-semibold text-aproba-700">{t("Cita guardada — cliente avisado.")}</p>}
      {estado === "sin_cambios" && <p className="mt-2 text-xs text-slate-400">{t("Sin cambios — no se ha reenviado ningún aviso.")}</p>}
      {estado === "error" && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
