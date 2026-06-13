"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PAGINAS_LEGALES } from "@/lib/legal";

export function LegalNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-x-1 gap-y-1.5 text-sm">
      {PAGINAS_LEGALES.map((p) => {
        const activo = pathname === p.href;
        return (
          <Link
            key={p.href}
            href={p.href}
            aria-current={activo ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 transition ${
              activo
                ? "bg-aproba-600 font-semibold text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {p.label}
          </Link>
        );
      })}
    </nav>
  );
}
