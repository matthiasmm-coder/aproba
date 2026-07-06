// Logo Aproba — la lettre grecque α (alpha) en blanc, dans un carré vert.

export function AprobaMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-label="Aproba" role="img">
      <rect width="120" height="120" rx="28" fill="#0E8C5F" />
      {/* y=60 + central = glyphe centré verticalement dans le carré (mesuré
          via getBBox : centre à 60,60). L'ancien y=45 le remontait de 15px. */}
      <text
        x="61"
        y="60"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Geist, Inter, -apple-system, system-ui, sans-serif"
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
