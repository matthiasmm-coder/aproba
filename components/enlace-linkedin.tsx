import { LINKEDIN_EMPRESA } from "@/lib/contacto";

// Enlace a la página de empresa de Aproba en LinkedIn, para los pies de página (02/10/2026,
// Matthias). Hereda color y tamaño del pie; el icono se escala con el texto.
export function EnlaceLinkedIn({ className = "" }: { className?: string }) {
  return (
    <a href={LINKEDIN_EMPRESA} target="_blank" rel="noopener noreferrer" aria-label="Aproba en LinkedIn (se abre en una pestaña nueva)"
      className={`inline-flex items-center gap-1.5 hover:text-slate-700 ${className}`}>
      <svg className="h-[1.1em] w-[1.1em] shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z" />
      </svg>
      LinkedIn
    </a>
  );
}
