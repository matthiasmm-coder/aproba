"use client";

import { useEffect, useState } from "react";
import { loadArchivados, saveArchivados } from "@/lib/archivo";
import { useT } from "@/components/lang-provider";

export function ArchivarButton({ id }: { id: string }) {
  const t = useT();
  const [archived, setArchived] = useState(false);

  useEffect(() => { setArchived(loadArchivados().has(id)); }, [id]);

  function toggle() {
    const s = loadArchivados();
    if (s.has(id)) s.delete(id); else s.add(id);
    saveArchivados(s);
    setArchived(s.has(id));
  }

  if (archived) {
    return (
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">{t("Archivado")}</span>
        <button onClick={toggle} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-aproba-400 hover:text-aproba-700">{t("Restaurar")}</button>
      </div>
    );
  }

  return (
    <button onClick={toggle} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-800">
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="5" rx="1" /><path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9M10 13h4" /></svg>
      {t("Archivar")}
    </button>
  );
}
