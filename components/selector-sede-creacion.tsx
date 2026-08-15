"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useT } from "@/components/lang-provider";

// «Creando en: …» — la sede à laquelle appartiendra CE qui va être créé.
//
// « Todas » est une vue de LECTURE : une création doit appartenir à une oficina.
// Règles : pastille active (cookie) → présélectionnée ; sur « Todas » avec ≥2
// oficinas → RIEN de présélectionné et le parent doit bloquer tant qu'on n'a pas
// choisi ; despacho mono-oficina → le composant s'efface (rien ne change).
// Un gestor multi-sedes ne voit que SES sedes ; un mono-sede n'a pas le choix.
//
// Le parent reçoit { sede, requerida } via onEstado : `requerida && !sede` = bloquer.
export function SelectorSedeCreacion({
  onEstado,
}: {
  onEstado: (estado: { sede: string | null; requerida: boolean }) => void;
}) {
  const t = useT();
  const [oficinas, setOficinas] = useState<{ id: string; nombre: string }[]>([]);
  const [sede, setSede] = useState<string | null>(null);
  const [requerida, setRequerida] = useState(false);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const supabase = createSupabaseBrowser();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        let mem = await supabase.from("Membership").select("role, oficinaId, oficinaIds").eq("userId", user.id).limit(1).maybeSingle();
        if (mem.error) mem = await supabase.from("Membership").select("role, oficinaId").eq("userId", user.id).limit(1).maybeSingle() as typeof mem;
        const m = mem.data as { role?: string; oficinaId?: string | null; oficinaIds?: string[] | null } | null;
        const esAdmin = m?.role === "OWNER" || m?.role === "ADMIN";
        const misSedes = m?.oficinaIds?.length ? m.oficinaIds : m?.oficinaId ? [m.oficinaId] : [];

        const { data: ofis } = await supabase.from("Oficina").select("id, nombre, orden").order("orden");
        const todas = (ofis ?? []) as { id: string; nombre: string; orden: number }[];
        // choix offerts : l'admin voit tout ; le gestor, SES sedes
        const elegibles = esAdmin ? todas : todas.filter((o) => misSedes.includes(o.id));
        if (todas.length < 2 || elegibles.length === 0) { setListo(true); onEstado({ sede: null, requerida: false }); return; }
        if (elegibles.length === 1) { setListo(true); onEstado({ sede: elegibles[0].id, requerida: false }); return; }

        const cookie = document.cookie.split("; ").find((c) => c.startsWith("aproba_oficina="))?.split("=")[1] ?? null;
        const activa = cookie && cookie !== "todas" && elegibles.some((o) => o.id === cookie) ? cookie : null;
        setOficinas(elegibles.map(({ id, nombre }) => ({ id, nombre })));
        setSede(activa);
        setRequerida(true);
        setListo(true);
        onEstado({ sede: activa, requerida: true });
      } catch { setListo(true); onEstado({ sede: null, requerida: false }); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!listo || !requerida) return null;

  return (
    <div className={`mb-4 rounded-xl border px-4 py-3 ${sede ? "border-slate-200 bg-cream-50/60" : "border-amber-300 bg-amber-50"}`}>
      <p className={`text-center text-xs font-semibold uppercase tracking-wide ${sede ? "text-slate-400" : "text-amber-700"}`}>
        {sede ? t("Creando en") : t("¿En qué oficina? — «Todas» es solo una vista de lectura")}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        {oficinas.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => { setSede(o.id); onEstado({ sede: o.id, requerida: true }); }}
            className={`inline-flex items-center rounded-full border px-3.5 py-1 text-sm font-semibold transition ${
              sede === o.id
                ? "border-aproba-600 bg-aproba-600 text-white shadow-sm"
                : "border-slate-300 bg-white text-slate-600 hover:border-aproba-400 hover:text-aproba-700"
            }`}
          >
            <span className="max-w-[12rem] truncate">{o.nombre}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
