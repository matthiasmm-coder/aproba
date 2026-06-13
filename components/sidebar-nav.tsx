"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/app", label: "Inicio", icon: "home" },
  { href: "/app/expedientes", label: "Expedientes", icon: "board" },
  { href: "/app/clientes", label: "Clientes", icon: "users" },
  { href: "/app/facturas", label: "Facturas", icon: "invoice" },
  { href: "/app/ajustes", label: "Ajustes", icon: "settings" },
];

function NavIcon({ name }: { name: string }) {
  const c = "h-[18px] w-[18px]";
  if (name === "home") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>;
  if (name === "board") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></svg>;
  if (name === "users") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></svg>;
  if (name === "invoice") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h6" /></svg>;
  return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
}

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => (href === "/app" ? pathname === "/app" : pathname.startsWith(href));
}

export function SidebarNav() {
  const isActive = useIsActive();
  return (
    <nav className="flex-1 space-y-1 px-3 py-2">
      {NAV.map((n) => {
        const active = isActive(n.href);
        return (
          <Link key={n.href} href={n.href} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${active ? "bg-aproba-50 text-aproba-700" : "text-slate-600 hover:bg-cream-50 hover:text-slate-900"}`}>
            <span className={active ? "text-aproba-600" : "text-slate-400"}><NavIcon name={n.icon} /></span>
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNav() {
  const isActive = useIsActive();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white/95 backdrop-blur md:hidden">
      {NAV.map((n) => {
        const active = isActive(n.href);
        return (
          <Link key={n.href} href={n.href} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition ${active ? "text-aproba-700" : "text-slate-400"}`}>
            <NavIcon name={n.icon} />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
