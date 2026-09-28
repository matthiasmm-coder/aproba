"use client";

import Link from "next/link";
import { useT } from "@/components/lang-provider";
import { TIPO_NOTIFICACION_LABEL, type NotificacionDehu } from "@/lib/notificaciones-dehu";

// Las notificaciones de la DEHú vinculadas a ESTE expediente (28/09/2026): qué llegó,
// cuándo, su PDF y si ya se gestionó. Se gestionan en la pestaña DEHú; aquí, el rastro.
const fecha = (iso: string | null) => {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Madrid" });
};

export function NotificacionesExpediente({ items }: { items: NotificacionDehu[] }) {
  const t = useT();
  if (!items.length) return null;
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{t("Notificaciones DEHú")}</p>
      <ul className="mt-1.5 divide-y divide-slate-100">
        {items.map((n) => (
          <li key={n.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
            <span className="font-semibold text-slate-800">{t(TIPO_NOTIFICACION_LABEL[n.tipo])}</span>
            <span className="text-xs text-slate-400">{fecha(n.fechaNotificacion ?? n.fechaActo ?? n.createdAt)}</span>
            {n.asunto && <span className="min-w-0 flex-1 truncate text-slate-600" title={n.asunto}>{n.asunto}</span>}
            <span className="ml-auto flex items-center gap-3 text-xs">
              {n.estado === "GESTIONADA"
                ? <span className="font-semibold text-aproba-700">{t("Gestionada")}</span>
                : <Link href="/app/dehu" className="font-semibold text-amber-700 hover:underline">{t("Por gestionar")}</Link>}
              {n.tieneArchivo && <a href={`/api/dehu/${n.id}/archivo`} target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-500 hover:text-slate-800">{t("Ver el PDF")}</a>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
