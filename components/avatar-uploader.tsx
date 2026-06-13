"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Avatar cliquable : ouvre le sélecteur de fichier, uploade vers /api/perfil/avatar,
// puis rafraîchit le layout (la photo remplace les initiales).
export function AvatarUploader({ iniciales, avatarUrl }: { iniciales: string; avatarUrl?: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permettre de re-choisir le même fichier
    if (!file) return;
    setSubiendo(true);
    setError(false);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/perfil/avatar", { method: "POST", body: fd });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setError(true);
      window.setTimeout(() => setError(false), 2500);
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        title={error ? "Error al subir — reintenta" : "Cambiar foto de perfil"}
        aria-label="Cambiar foto de perfil"
        className={`group relative h-8 w-8 shrink-0 overflow-hidden rounded-full ring-offset-2 transition focus:outline-none focus:ring-2 focus:ring-aproba-300 ${error ? "ring-2 ring-red-300" : ""}`}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-aproba-100 text-xs font-semibold text-aproba-700">{iniciales}</span>
        )}
        {/* Overlay caméra au survol / spinner pendant l'upload */}
        <span className={`absolute inset-0 flex items-center justify-center bg-slate-900/45 text-white transition-opacity ${subiendo ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
          {subiendo ? (
            <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.56" /></svg>
          ) : (
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></svg>
          )}
        </span>
      </button>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onFile} />
    </>
  );
}
