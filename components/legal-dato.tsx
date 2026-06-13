// Resalta en ámbar los valores que aún son marcadores de posición ("[...]").
// En cuanto se rellenan los datos reales en lib/legal.ts, el resaltado desaparece.
export function Dato({ children }: { children: string }) {
  const esPlaceholder = typeof children === "string" && children.trim().startsWith("[");
  return esPlaceholder ? <span className="placeholder">{children}</span> : <>{children}</>;
}
