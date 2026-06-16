import Link from "next/link";
import { createSupabaseServer } from "@/lib/supabase/server";
import { TIPO_LABEL } from "@/lib/tramites";
import { ClientesList, type Cli } from "@/components/clientes-list";

export const metadata = { title: "Clientes" };

// Première page branchée sur la vraie base (Supabase + RLS) :
// chaque gestor ne voit que les clientes de SON workspace.

type Row = {
  id: string;
  nombre: string;
  apellidos: string | null;
  nacionalidad: string | null;
  expedientes: { tipo: string; createdAt: string }[];
};

export default async function Clientes() {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("Cliente")
    .select("id, nombre, apellidos, nacionalidad, expedientes:Expediente(tipo, createdAt)")
    .order("nombre");

  const lista: Cli[] = ((data ?? []) as Row[]).map((c) => {
    const exps = [...(c.expedientes ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return {
      id: c.id,
      nombre: `${c.nombre} ${c.apellidos ?? ""}`.trim(),
      nacionalidad: c.nacionalidad ?? "—",
      expedientes: exps.length,
      ultimo: exps[0] ? TIPO_LABEL[exps[0].tipo] ?? exps[0].tipo : "—",
    };
  }).sort((a, b) => a.nombre.localeCompare(b.nombre));

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tightest text-slate-900">Clientes</h1>
          <p className="text-sm text-slate-500">
            {lista.length} clientes
            <span className="ml-2 rounded-full bg-aproba-100 px-2 py-0.5 text-xs font-semibold text-aproba-700">datos reales</span>
          </p>
        </div>
        <Link href="/app/clientes/nuevo" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400">+ Nuevo cliente</Link>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Error al cargar los clientes: {error.message}
        </p>
      ) : (
        <ClientesList lista={lista} />
      )}
    </div>
  );
}
