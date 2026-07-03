"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { VencimientoRow } from "@/lib/data/vencimientos";
import { fmtFechaCorta } from "@/lib/tramites";
import { useT } from "@/components/lang-provider";

// VIGÍA — lista agrupada de vencimientos + acción «Iniciar renovación».
// Al iniciar: (1) POST /api/vencimientos/[id]/renovar → expediente nuevo + aviso al
// cliente en su idioma; (2) POST /api/pagos ANTICIPO (mejor esfuerzo: si el servicio
// no tiene anticipo configurado, se ignora — la lógica financiera vive en /api/pagos).

type Grupo = { key: string; titulo: string; tono: string; items: VencimientoRow[] };

export function VencimientosList({ vencimientos }: { vencimientos: VencimientoRow[] }) {
  const t = useT();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [lanzando, setLanzando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creado, setCreado] = useState<{ vencId: string; expedienteId: string; referencia: string } | null>(null);

  const grupos = useMemo<Grupo[]>(() => {
    const filtro = q.trim().toLowerCase();
    const vs = filtro ? vencimientos.filter((v) => v.clienteNombre.toLowerCase().includes(filtro)) : vencimientos;
    const enMarcha = vs.filter((v) => v.estado === "TRAMITANDO");
    const resto = vs.filter((v) => v.estado !== "TRAMITANDO");
    return [
      { key: "vencidos", titulo: t("Ya caducadas"), tono: "text-red-600", items: resto.filter((v) => v.dias < 0) },
      { key: "urgentes", titulo: t("Caducan en menos de 60 días"), tono: "text-amber-600", items: resto.filter((v) => v.dias >= 0 && v.dias <= 60) },
      { key: "proximos", titulo: t("En los próximos 6 meses"), tono: "text-slate-600", items: resto.filter((v) => v.dias > 60 && v.dias <= 183) },
      { key: "lejanos", titulo: t("Más adelante"), tono: "text-slate-400", items: resto.filter((v) => v.dias > 183) },
      { key: "tramitando", titulo: t("Renovación en marcha"), tono: "text-aproba-700", items: enMarcha },
    ].filter((g) => g.items.length > 0);
  }, [vencimientos, q, t]);

  async function iniciar(v: VencimientoRow) {
    setLanzando(v.id);
    setError(null);
    try {
      const res = await fetch(`/api/vencimientos/${v.id}/renovar`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo iniciar la renovación."));
      // Anticipo (mejor esfuerzo): si el servicio tiene tarifa, emite la factura + email IBAN.
      if (d.expedienteId && !d.yaExistia) {
        await fetch("/api/pagos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expedienteId: d.expedienteId, momento: "ANTICIPO" }),
        }).catch(() => {});
      }
      setCreado({ vencId: v.id, expedienteId: d.expedienteId, referencia: d.referencia ?? "" });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo iniciar la renovación."));
    } finally {
      setLanzando(null);
    }
  }

  if (!vencimientos.length) {
    return (
      <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <p className="text-3xl">🌱</p>
        <p className="mt-3 font-semibold text-slate-700">{t("Aún no hay vencimientos registrados")}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          {t("Se rellenan solos: cuando la IA valida un TIE en el portal, o cuando finalizas un trámite que produce una tarjeta nueva.")}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("Buscar cliente…")}
        className="w-full max-w-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-aproba-600"
      />
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {creado && (
        <p className="mt-3 rounded-lg border border-aproba-200 bg-aproba-50 px-3 py-2 text-sm text-aproba-700">
          ✓ {t("Renovación iniciada")} — <Link href={`/app/expedientes/${creado.expedienteId}`} className="font-semibold underline">{creado.referencia || t("ver expediente")}</Link>. {t("El cliente ha recibido el enlace para revisar sus datos.")}
        </p>
      )}

      <div className="mt-4 space-y-6">
        {grupos.map((g) => (
          <div key={g.key}>
            <h2 className={`text-sm font-semibold uppercase tracking-wide ${g.tono}`}>{g.titulo} ({g.items.length})</h2>
            <ul className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
              {g.items.map((v) => {
                const cuando = v.dias < 0
                  ? t("caducó hace {n} días").replace("{n}", String(-v.dias))
                  : v.dias === 0 ? t("caduca hoy")
                  : t("caduca en {n} días").replace("{n}", String(v.dias));
                return (
                  <li key={v.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${v.dias < 0 ? "bg-red-500" : v.dias <= 60 ? "bg-amber-400" : "bg-slate-300"}`} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/app/clientes/${v.clienteId}`} className="truncate text-sm font-semibold text-slate-800 hover:underline">{v.clienteNombre}</Link>
                      <p className="text-xs text-slate-500">{v.tipo} · {cuando} ({fmtFechaCorta(v.fecha)})</p>
                    </div>
                    {v.estado === "TRAMITANDO" && v.renovacion ? (
                      <Link href={`/app/expedientes/${v.renovacion.id}`} className="shrink-0 rounded-lg border border-aproba-300 px-3 py-1.5 text-xs font-semibold text-aproba-700 transition hover:bg-aproba-50">
                        {v.renovacion.referencia} →
                      </Link>
                    ) : (
                      <button
                        onClick={() => iniciar(v)}
                        disabled={lanzando === v.id}
                        className="shrink-0 rounded-lg bg-aproba-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300"
                      >
                        {lanzando === v.id ? t("Iniciando…") : t("Iniciar renovación")}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
