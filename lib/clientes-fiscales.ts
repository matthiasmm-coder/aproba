import { createSupabaseBrowser } from "@/lib/supabase/client";
import { datosFiscalesDeCliente, documentoSinEtiqueta } from "@/lib/facturas";
import { datosFiscalesDeEmpresa } from "@/lib/empresa";

// Clientes y empresas del despacho con su NIF y su domicilio fiscal, para «+ Nueva
// factura» y la edición de una factura manual (24/09/2026): el gestor elige a quién
// factura y los datos fiscales se rellenan solos (los mismos que congela una factura de
// expediente). Lectura bajo RLS: solo lo del propio despacho.

export type ClienteFiscalOpcion = {
  tipo: "cliente" | "empresa";
  id: string;
  nombre: string;
  documento: string; // sin etiqueta, tal cual va en el campo del formulario
  direccion: string;
};

export async function cargarClientesFiscales(): Promise<ClienteFiscalOpcion[]> {
  const sb = createSupabaseBrowser();
  const out: ClienteFiscalOpcion[] = [];
  try {
    const { data } = await sb.from("Cliente")
      .select("id, nombre, apellidos, numeroDocumento, pasaporte, via, numeroVia, piso, codigoPostal, municipio, provincia")
      .order("nombre").limit(3000);
    for (const c of (data ?? []) as Record<string, string | null>[]) {
      const d = datosFiscalesDeCliente(c);
      out.push({ tipo: "cliente", id: String(c.id), nombre: [c.nombre, c.apellidos].filter(Boolean).join(" ").trim() || "—", documento: documentoSinEtiqueta(d?.documento), direccion: d?.direccion ?? "" });
    }
  } catch { /* sin clientes: el gestor escribe los datos a mano */ }
  try {
    const { data, error } = await sb.from("Empresa").select("id, razonSocial, nif, domicilio, codigoPostal, municipio, provincia").order("razonSocial").limit(1000);
    if (!error) for (const e of (data ?? []) as Record<string, string | null>[]) {
      const d = datosFiscalesDeEmpresa(e);
      out.push({ tipo: "empresa", id: String(e.id), nombre: String(e.razonSocial ?? "").trim() || "Empresa", documento: documentoSinEtiqueta(d?.documento), direccion: d?.direccion ?? "" });
    }
  } catch { /* sin empresas (migración ausente) */ }
  return out;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Coincidencias por nombre o por documento, las empresas primero cuando empatan.
export function buscarClientesFiscales(opciones: ClienteFiscalOpcion[], q: string, max = 6): ClienteFiscalOpcion[] {
  const n = norm(q.trim());
  if (n.length < 2) return [];
  return opciones
    .filter((o) => norm(o.nombre).includes(n) || (o.documento && norm(o.documento).includes(n)))
    .sort((a, b) => Number(norm(b.nombre).startsWith(n)) - Number(norm(a.nombre).startsWith(n)) || (a.tipo === b.tipo ? 0 : a.tipo === "empresa" ? -1 : 1))
    .slice(0, max);
}
