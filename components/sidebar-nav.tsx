"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/components/lang-provider";

const NAV = [
  { href: "/app", label: "Inicio", icon: "home" },
  { href: "/app/expedientes", label: "Expedientes", icon: "board" },
  { href: "/app/clientes", label: "Clientes", icon: "users" },
  { href: "/app/vencimientos", label: "Vencimientos", icon: "calendar" },
  { href: "/app/facturas", label: "Facturas", icon: "invoice" },
  { href: "/app/ajustes", label: "Ajustes", icon: "settings" },
];

// ICONOS DEL MENÚ — duotono: una silueta rellena muy suave bajo un trazo fino. Da
// densidad sin gritar, y al estar activo (verde) el relleno tiñe el icono entero.
// Dos metáforas cambiaron con el producto (20/09): Expedientes es una CARPETA (ya no un
// tablero de columnas) y Vencimientos, un calendario con reloj (lo que caduca).
function NavIcon({ name }: { name: string }) {
  const c = "h-[18px] w-[18px]";
  const props = {
    className: c, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
    strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  };
  const relleno = { fill: "currentColor", stroke: "none", opacity: 0.18 };

  if (name === "home") return (
    <svg {...props}>
      <path {...relleno} d="M12 3.3 20.4 10v9.2a1.3 1.3 0 0 1-1.3 1.3H4.9a1.3 1.3 0 0 1-1.3-1.3V10z" />
      <path d="M3.6 10 12 3.3 20.4 10v9.2a1.3 1.3 0 0 1-1.3 1.3H4.9a1.3 1.3 0 0 1-1.3-1.3z" />
      <path d="M9.6 20.5v-5.4a1 1 0 0 1 1-1h2.8a1 1 0 0 1 1 1v5.4" />
    </svg>
  );
  if (name === "board") return (
    <svg {...props}>
      <path {...relleno} d="M3.4 8.3h17.2v9.9a1.4 1.4 0 0 1-1.4 1.4H4.8a1.4 1.4 0 0 1-1.4-1.4z" />
      <path d="M3.4 18.2V6.4A1.4 1.4 0 0 1 4.8 5h4.3l1.8 2.4h8.3a1.4 1.4 0 0 1 1.4 1.4v9.4a1.4 1.4 0 0 1-1.4 1.4H4.8a1.4 1.4 0 0 1-1.4-1.4z" />
    </svg>
  );
  if (name === "users") return (
    <svg {...props}>
      <circle {...relleno} cx="9.3" cy="8.4" r="3.4" />
      <circle cx="9.3" cy="8.4" r="3.4" />
      <path d="M3.2 19.9v-1.1a4.3 4.3 0 0 1 4.3-4.3h3.6a4.3 4.3 0 0 1 4.3 4.3v1.1" />
      <circle cx="17.3" cy="9.2" r="2.4" />
      <path d="M17.9 14.6h.6a3.3 3.3 0 0 1 3.3 3.3v2" />
    </svg>
  );
  if (name === "calendar") return (
    <svg {...props}>
      <path {...relleno} d="M3.5 10h17v8.6a1.4 1.4 0 0 1-1.4 1.4H4.9a1.4 1.4 0 0 1-1.4-1.4z" />
      <path d="M3.5 18.6V6.9a1.4 1.4 0 0 1 1.4-1.4h14.2a1.4 1.4 0 0 1 1.4 1.4v11.7a1.4 1.4 0 0 1-1.4 1.4H4.9a1.4 1.4 0 0 1-1.4-1.4z" />
      <path d="M8 3.4v4M16 3.4v4M3.5 10h17" />
      <circle cx="15.7" cy="15.6" r="2.9" fill="white" />
      <circle cx="15.7" cy="15.6" r="2.9" />
      <path d="M15.7 14.2v1.6l1.1.8" />
    </svg>
  );
  if (name === "invoice") return (
    <svg {...props}>
      <path {...relleno} d="M6.2 3.6h7.3l6 6v10.1a1.3 1.3 0 0 1-1.3 1.3H6.2a1.3 1.3 0 0 1-1.3-1.3V4.9a1.3 1.3 0 0 1 1.3-1.3z" />
      <path d="M13.5 3.6H6.2a1.3 1.3 0 0 0-1.3 1.3v14.8a1.3 1.3 0 0 0 1.3 1.3h12a1.3 1.3 0 0 0 1.3-1.3V9.6z" />
      <path d="M13.5 3.6v6h6M8.4 14.2h7.2M8.4 17.4h4.6" />
    </svg>
  );
  if (name === "family") return (
    <svg {...props}>
      <circle {...relleno} cx="8" cy="8" r="3" />
      <circle cx="8" cy="8" r="3" /><circle cx="17" cy="10" r="2.2" />
      <path d="M2.5 20v-1.5A4.5 4.5 0 0 1 7 14h2a4.5 4.5 0 0 1 4.5 4.5V20" />
      <path d="M15.5 20v-1a3.5 3.5 0 0 1 3.5-3.5h.5" />
    </svg>
  );
  // Ajustes: engranaje con dientes de verdad (seis rayos sueltos se leían como un sol).
  return (
    <svg {...props}>
      <circle {...relleno} cx="12" cy="12" r="3" />
      <path d="M19.9 14.6a8.2 8.2 0 0 0 0-5.2l1.9-1.5-2-3.4-2.2 1a8.2 8.2 0 0 0-2.7-1.6L14.5 1.6h-4l-.4 2.3a8.2 8.2 0 0 0-2.7 1.6l-2.2-1-2 3.4 1.9 1.5a8.2 8.2 0 0 0 0 5.2l-1.9 1.5 2 3.4 2.2-1a8.2 8.2 0 0 0 2.7 1.6l.4 2.3h4l.4-2.3a8.2 8.2 0 0 0 2.7-1.6l2.2 1 2-3.4z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => (href === "/app" ? pathname === "/app" : pathname.startsWith(href));
}

export function SidebarNav() {
  const isActive = useIsActive();
  const t = useT();
  return (
    <nav className="flex-1 space-y-1 px-3 py-2">
      {NAV.map((n) => {
        const active = isActive(n.href);
        return (
          <Link key={n.href} href={n.href} data-guia={n.href === "/app/expedientes" ? "menu-expedientes" : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${active ? "bg-aproba-50 text-aproba-700" : "text-slate-600 hover:bg-cream-50 hover:text-slate-900"}`}>
            <span className={active ? "text-aproba-600" : "text-slate-400"}><NavIcon name={n.icon} /></span>
            {t(n.label)}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNav() {
  const isActive = useIsActive();
  const t = useT();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {NAV.map((n) => {
        const active = isActive(n.href);
        return (
          <Link key={n.href} href={n.href} data-guia={n.href === "/app/expedientes" ? "menu-expedientes" : undefined} className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition ${active ? "text-aproba-700" : "text-slate-400"}`}>
            <NavIcon name={n.icon} />
            {t(n.label)}
          </Link>
        );
      })}
    </nav>
  );
}
