// Todas las filas de una consulta, por páginas de 1.000 (el tope de la API de Supabase),
// con un techo de páginas para que un despacho enorme no bloquee la función. La consulta
// debe llevar un orden estable (p. ej. .order("id")) para que las páginas no se solapen.
export async function leerPaginado<T>(
  pagina: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  maxPaginas = 20,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const out: T[] = [];
  for (let i = 0; i < maxPaginas; i++) {
    const { data, error } = await pagina(i * 1000, i * 1000 + 999);
    if (error) return { data: out, error };
    const filas = (data ?? []) as T[];
    out.push(...filas);
    if (filas.length < 1000) break;
  }
  return { data: out, error: null };
}
