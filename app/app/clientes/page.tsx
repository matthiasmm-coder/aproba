import Link from "next/link";
import { createSupabaseServer } from "@/lib/supabase/server";
import { TIPO_LABEL } from "@/lib/tramites";
import { ordenParentesco } from "@/lib/familia";
import { ClientesList, type Cli } from "@/components/clientes-list";
import { getT } from "@/lib/app-lang";

export const metadata = { title: "Clientes" };

// Première page branchée sur la vraie base (Supabase + RLS) :
// chaque gestor ne voit que les clientes de SON workspace.
// Les membres d'une FAMILLE sont regroupés sous UNE entrée (dépliable), pas listés à plat.

type Row = {
  id: string;
  nombre: string;
  apellidos: string | null;
  nacionalidad: string | null;
  parentesco?: string | null;
  familiaId?: string | null;
  familia?: { id: string; nombre: string } | { id: string; nombre: string }[] | null;
  expedientes: { tipo: string; createdAt: string }[];
};

const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export default async function Clientes() {
  const t = await getT();
  const supabase = await createSupabaseServer();
  // Avec la famille ; repli sans elle si la migration n'est pas appliquée.
  const conFam = await supabase
    .from("Cliente")
    .select("id, nombre, apellidos, nacionalidad, parentesco, familiaId, familia:Familia(id, nombre), expedientes:Expediente(tipo, createdAt)")
    .order("nombre");
  const res = conFam.error
    ? await supabase.from("Cliente").select("id, nombre, apellidos, nacionalidad, expedientes:Expediente(tipo, createdAt)").order("nombre")
    : conFam;
  const { data, error } = res;

  const rows = ((data ?? []) as unknown[]) as Row[];
  const aCli = (c: Row) => {
    const exps = [...(c.expedientes ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return {
      id: c.id,
      nombre: `${c.nombre} ${c.apellidos ?? ""}`.trim() || "—",
      nacionalidad: c.nacionalidad ?? "—",
      expedientes: exps.length,
      ultimo: exps[0] ? TIPO_LABEL[exps[0].tipo] ?? exps[0].tipo : "—",
      _ultimoAt: exps[0]?.createdAt ?? "",
    };
  };

  // Regroupe les membres par famille ; les clients sans famille restent des entrées simples.
  const individuales: Cli[] = [];
  const familias = new Map<string, { nombre: string; miembros: (ReturnType<typeof aCli> & { parentesco: string | null })[] }>();
  for (const c of rows) {
    const fam = uno(c.familia);
    if (c.familiaId && fam) {
      const g = familias.get(fam.id) ?? { nombre: fam.nombre || "Familia", miembros: [] };
      g.miembros.push({ ...aCli(c), parentesco: c.parentesco ?? null });
      familias.set(fam.id, g);
    } else {
      const { _ultimoAt, ...cli } = aCli(c);
      void _ultimoAt;
      individuales.push(cli);
    }
  }

  const entradasFamilia: Cli[] = [...familias.entries()].map(([id, g]) => {
    const miembros = g.miembros.sort((a, b) => ordenParentesco(a.parentesco) - ordenParentesco(b.parentesco));
    const masReciente = [...miembros].sort((a, b) => b._ultimoAt.localeCompare(a._ultimoAt))[0];
    return {
      id,
      nombre: g.nombre,
      nacionalidad: miembros.find((m) => m.nacionalidad !== "—")?.nacionalidad ?? "—",
      expedientes: miembros.reduce((n, m) => n + m.expedientes, 0),
      ultimo: masReciente && masReciente._ultimoAt ? masReciente.ultimo : "—",
      miembros: miembros.map((m) => ({ id: m.id, nombre: m.nombre, parentesco: m.parentesco, nacionalidad: m.nacionalidad, expedientes: m.expedientes })),
    };
  });

  const lista: Cli[] = [...individuales, ...entradasFamilia].sort((a, b) => a.nombre.localeCompare(b.nombre));

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tightest text-slate-900">{t("Clientes")}</h1>
          <p className="text-sm text-slate-500">
            {lista.length} {t("clientes")}
            <span className="ml-2 rounded-full bg-aproba-100 px-2 py-0.5 text-xs font-semibold text-aproba-700">{t("datos reales")}</span>
          </p>
        </div>
        <Link href="/app/clientes/nuevo" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400">{t("+ Nuevo cliente")}</Link>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {t("Error al cargar los clientes")}: {error.message}
        </p>
      ) : (
        <ClientesList lista={lista} />
      )}
    </div>
  );
}
