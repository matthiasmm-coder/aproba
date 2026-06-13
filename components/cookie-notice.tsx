"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const COOKIE = "aproba-cookie-aviso";

export function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Solo cookies técnicas → aviso informativo, no bloqueante.
    if (!document.cookie.split("; ").some((c) => c.startsWith(`${COOKIE}=`))) {
      setVisible(true);
    }
  }, []);

  function aceptar() {
    document.cookie = `${COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4">
      <div className="mx-auto flex max-w-3xl flex-col items-start gap-3 rounded-2xl border border-slate-200 bg-white/95 px-5 py-4 shadow-card backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">
          Usamos solo cookies técnicas necesarias para que la plataforma funcione. Más información en la{" "}
          <Link href="/legal/cookies" className="font-medium text-aproba-700 underline underline-offset-2">
            Política de cookies
          </Link>
          .
        </p>
        <button
          onClick={aceptar}
          className="shrink-0 rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700"
        >
          Entendido
        </button>
      </div>
    </div>
  );
}
