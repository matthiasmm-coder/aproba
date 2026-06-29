"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import type { Despacho } from "@/lib/data/config";

// Ajustes › datos de facturación del despacho (encabezado de la factura) + logo.
// Lo que se rellena aquí aparece en la cabecera de cada factura (PDF/impresión).
export function DespachoFacturacion({ inicial }: { inicial: Despacho }) {
  const t = useT();
  const router = useRouter();
  const [nombre, setNombre] = useState(inicial.nombre === "Mi despacho" ? "" : inicial.nombre);
  const [nif, setNif] = useState(inicial.nif ?? "");
  const [domicilio, setDomicilio] = useState(inicial.domicilio ?? "");
  const [email, setEmail] = useState(inicial.emailFacturacion ?? "");
  const [logoUrl, setLogoUrl] = useState<string | null>(inicial.logoUrl);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(inicial.logoUrl);
  const fileRef = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  function elegirLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setLogoFile(f);
    setPreview(URL.createObjectURL(f));
  }
  function quitar() {
    setLogoFile(null); setPreview(null); setLogoUrl(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function guardar() {
    setEstado("saving"); setError(null);
    try {
      const fd = new FormData();
      fd.set("nombre", nombre); fd.set("nif", nif); fd.set("domicilio", domicilio); fd.set("emailFacturacion", email);
      if (logoFile) fd.set("logo", logoFile);
      else if (!preview && logoUrl === null) fd.set("quitarLogo", "1");
      const res = await fetch("/api/ajustes/despacho", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo guardar."));
      setLogoUrl(d.logoUrl ?? null); setLogoFile(null);
      setEstado("saved"); window.setTimeout(() => setEstado((s) => (s === "saved" ? "idle" : s)), 1500);
      router.refresh();
    } catch (e) {
      setEstado("error"); setError(e instanceof Error ? e.message : t("No se pudo guardar."));
    }
  }

  const inp = "mt-1 w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100";

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-cream-50/60 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">{t("Datos de facturación")}</h3>
        <span className={`text-xs font-medium transition-opacity ${estado === "idle" ? "opacity-0" : "opacity-100"} ${estado === "error" ? "text-red-600" : "text-aproba-700"}`}>
          {estado === "saving" ? t("Guardando…") : estado === "saved" ? t("Guardado ✓") : estado === "error" ? t("Error") : ""}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">{t("Aparecen en la cabecera de tus facturas (PDF).")}</p>

      <div className="mt-4 flex items-start gap-4">
        {/* Logo */}
        <div className="shrink-0">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="logo" className="h-full w-full object-contain" />
            ) : (
              <span className="text-[10px] text-slate-300">{t("Sin logo")}</span>
            )}
          </div>
          <div className="mt-1.5 flex flex-col gap-0.5">
            <button onClick={() => fileRef.current?.click()} className="text-[11px] font-semibold text-aproba-700 hover:underline">{preview ? t("Cambiar") : t("Subir logo")}</button>
            {preview && <button onClick={quitar} className="text-[11px] text-slate-400 hover:text-red-500">{t("Quitar")}</button>}
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={elegirLogo} />
        </div>

        {/* Datos */}
        <div className="grid flex-1 grid-cols-1 gap-2.5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Razón social / nombre")}</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={t("Nombre del despacho")} className={inp} />
          </div>
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("NIF / CIF")}</label>
            <input value={nif} onChange={(e) => setNif(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Email de facturación")}</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inp} />
          </div>
          <div className="sm:col-span-2">
            <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Domicilio")}</label>
            <input value={domicilio} onChange={(e) => setDomicilio(e.target.value)} placeholder={t("Calle, nº, CP, ciudad")} className={inp} />
          </div>
        </div>
      </div>

      {error && <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      <div className="mt-4 flex justify-end">
        <button onClick={guardar} disabled={estado === "saving"} className="rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300">
          {estado === "saving" ? t("Guardando…") : t("Guardar datos de facturación")}
        </button>
      </div>
    </div>
  );
}
