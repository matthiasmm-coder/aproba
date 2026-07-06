// Logo Aproba — la lettre grecque α (alpha) en blanc, dans un carré vert.

export function AprobaMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-label="Aproba" role="img">
      <rect width="120" height="120" rx="28" fill="#0E8C5F" />
      {/* Centrage sur l'ENCRE du glyphe (mesurée au canvas), pas sur la boîte
          typographique : le α n'a pas d'ascendante, une em-box centrée le fait
          paraître bas. Pas de dominant-baseline (rendu variable) : baseline
          explicite. Police = la vraie Geist du site (var --font-geist-sans). */}
      <text
        x="60"
        y="86.6"
        textAnchor="middle"
        style={{ fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}
        fontSize="100"
        fontWeight="800"
        fill="#FFFFFF"
      >
        α
      </text>
    </svg>
  );
}

export function AprobaLogo({ size = 30 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <AprobaMark size={size} />
      <span className="font-bold tracking-tightest text-slate-900" style={{ fontSize: size * 0.78 }}>
        aproba
      </span>
    </span>
  );
}
