"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";

// Foto de perfil EDITABLE desde Ajustes → Despacho y cuenta.
//
// El avatar de la barra lateral ya permitía cambiarla, pero con un objetivo de 32 px
// y una cámara que solo aparece al pasar el ratón: invisible en el móvil, donde ni
// hay hover ni se ve la barra. Aquí es un bloque explícito, con botones de verdad.
//
// `accept="image/*"` (y no la lista de MIME) para que el móvil ofrezca cámara Y
// galería; el formato real lo valida el servidor (JPG, PNG o WebP, máx. 2 MB).

const MAX_BYTES = 2 * 1024 * 1024;

export function FotoPerfil({ nombre, avatarUrl }: { nombre: string; avatarUrl?: string | null }) {
  const t = useT();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"subir" | "quitar" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const iniciales = (nombre || "")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase() || "··";

  async function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo fichero
    if (!file) return;
    // Se avisa ANTES de subir 5 MB por una red móvil para que el servidor los rechace.
    if (file.size > MAX_BYTES) { setError(t("La imagen supera los 2 MB.")); return; }
    setBusy("subir");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/perfil/avatar", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo subir la foto."));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("No se pudo subir la foto."));
    } finally {
      setBusy(null);
    }
  }

  async function quitar() {
    setBusy("quitar");
    setError(null);
    try {
      const res = await fetch("/api/perfil/avatar", { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo quitar la foto."));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("No se pudo quitar la foto."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-4 border-t border-slate-200 pt-4">
      <div className="flex flex-wrap items-center gap-4">
        <span className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-aproba-100 text-lg font-bold text-aproba-700">{iniciales}</span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-800">{t("Foto de perfil")}</p>
          <p className="mt-0.5 text-xs text-slate-500">{t("Tus clientes la ven en la cabecera de los emails que les envías. JPG, PNG o WebP · máx. 2 MB.")}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy !== null}
              className="rounded-lg bg-aproba-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300"
            >
              {busy === "subir" ? t("Subiendo…") : avatarUrl ? t("Cambiar foto") : t("Subir foto")}
            </button>
            {avatarUrl && (
              <button
                type="button"
                onClick={quitar}
                disabled={busy !== null}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              >
                {busy === "quitar" ? t("Quitando…") : t("Quitar")}
              </button>
            )}
          </div>
        </div>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={subir} />
    </div>
  );
}
