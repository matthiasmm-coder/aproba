// Cohete «Aproba Despegue»: ilustración vectorial en la paleta (verde 600/400, crema,
// llama ámbar). Sirve de repli cuando no existe public/despegue-cohete.png (versión IA,
// scripts/imagen-despegue.mjs); el trazo es limpio a cualquier tamaño.
export function Cohete({ className = "h-16 w-16" }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="c-cuerpo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#34D399" /><stop offset="1" stopColor="#0D6E4D" />
        </linearGradient>
        <linearGradient id="c-llama" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FDE68A" /><stop offset="1" stopColor="#F59E0B" />
        </linearGradient>
        <radialGradient id="c-halo" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#0E8C5F" stopOpacity="0.18" /><stop offset="1" stopColor="#0E8C5F" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="48" cy="50" r="46" fill="url(#c-halo)" />
      <g transform="rotate(45 48 48)">
        {/* llama */}
        <path d="M48 66c-5 6-6 12-4 19 2-3 4-5 4-5s2 2 4 5c2-7 1-13-4-19z" fill="url(#c-llama)" />
        {/* aletas */}
        <path d="M36 52l-9 9c-1 1 0 3 1 3l9-3z" fill="#0D6E4D" />
        <path d="M60 52l9 9c1 1 0 3-1 3l-9-3z" fill="#0D6E4D" />
        {/* cuerpo */}
        <path d="M48 12c9 7 14 19 14 32 0 8-2 15-5 20H39c-3-5-5-12-5-20 0-13 5-25 14-32z" fill="url(#c-cuerpo)" />
        <path d="M48 12c-3 5-6 11-8 18h16c-2-7-5-13-8-18z" fill="#A7F3D0" opacity="0.55" />
        {/* ventana */}
        <circle cx="48" cy="40" r="6.5" fill="#FAFAF7" />
        <circle cx="48" cy="40" r="4" fill="#0B3D2E" />
        <circle cx="46.5" cy="38.5" r="1.2" fill="#A7F3D0" />
        {/* base */}
        <rect x="41" y="62" width="14" height="4" rx="2" fill="#0B3D2E" />
      </g>
    </svg>
  );
}
