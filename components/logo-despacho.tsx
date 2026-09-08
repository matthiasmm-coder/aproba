"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";

// LOGO del despacho, en Ajustes › Despacho y cuenta (columna Despacho). Es la marca que
// ven los clientes: su portal, los emails de aviso, la tarjeta del enlace compartido por
// WhatsApp y las facturas. No confundir con la foto del USUARIO (círculo de la barra
// lateral, abajo a la izquierda): esa es de la persona, esta es de la empresa.
// `accept="image/*"` para que el móvil ofrezca cámara y galería; el servidor valida.

const MAX_BYTES = 2 * 1024 * 1024;

export function LogoDespacho({ logoUrl, puedeEditar }: { logoUrl?: string | null; puedeEditar: boolean }) {
  const t = useT();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"subir" | "quitar" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_BYTES) { setError(t("La imagen supera los 2 MB.")); return; }
    setBusy("subir"); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/ajustes/logo", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo subir el logo."));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("No se pudo subir el logo."));
    } finally { setBusy(null); }
  }

  async function quitar() {
    setBusy("quitar"); setError(null);
    try {
      const res = await fetch("/api/ajustes/logo", { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo quitar el logo."));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("No se pudo quitar el logo."));
    } finally { setBusy(null); }
  }

  return (
    <div className="mt-4 border-t border-slate-200 pt-4">
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white px-2">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={t("Logo del despacho")} className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-[11px] text-slate-300">{t("Sin logo")}</span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-800">{t("Logo del despacho")}</p>
          <p className="mt-0.5 text-xs text-slate-500">{t("Tus clientes lo ven en su portal, en los emails que les envías, en la vista previa del enlace y en tus facturas. JPG, PNG o WebP · máx. 2 MB.")}</p>
          {puedeEditar ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => inputRef.current?.click()} disabled={busy !== null} className="rounded-lg bg-aproba-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300">
                {busy === "subir" ? t("Subiendo…") : logoUrl ? t("Cambiar logo") : t("Subir logo")}
              </button>
              {logoUrl && (
                <button type="button" onClick={quitar} disabled={busy !== null} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
                  {busy === "quitar" ? t("Quitando…") : t("Quitar")}
                </button>
              )}
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-400">{t("Solo un administrador puede cambiarlo.")}</p>
          )}
        </div>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={subir} />
    </div>
  );
}
