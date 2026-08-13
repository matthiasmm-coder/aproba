import Link from "next/link";
import { createSupabaseServer } from "@/lib/supabase/server";
import { TIPO_LABEL } from "@/lib/tramites";
import { ordenParentesco } from "@/lib/familia";
import { ClientesList, type Cli } from "@/components/clientes-list";
import { BorrarTodosClientes } from "@/components/borrar-todos-clientes";
import { puedeGestionarEquipo } from "@/lib/planes";
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
  oficinaId?: string | null; // multi-oficina (ausente si la migración no está aplicada)
  familia?: { id: string; nombre: string } | { id: string; nombre: string }[] | null;
  expedientes: { tipo: string; createdAt: string }[];
  // Trámites del PASADO traídos por la migración: no son expedientes, pero son lo único
  // que tiene una cartera recién importada. Sin ellos la columna «Último trámite» sale
  // vacía para todo el mundo justo después de migrar (caso Gesadmbcn, 12/08).
  historial?: { etiqueta: string | null; tipo: string | null; fecha: string | null; createdAt: string }[] | null;
};

const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export default async function Clientes() {
  const t = await getT();
  const supabase = await createSupabaseServer();
  // Trois niveaux de repli : avec l'historique migré, puis avec la famille seule, puis nu.
  // Chaque cran ne retire QUE le morceau le plus récent (mêmes règles que fetchDespacho).
  const q = (cols: string) => supabase.from("Cliente").select(cols).order("nombre");
  let res = await q("id, nombre, apellidos, nacionalidad, parentesco, familiaId, oficinaId, familia:Familia(id, nombre), expedientes:Expediente(tipo, createdAt), historial:ServicioHistorico(etiqueta, tipo, fecha, createdAt)");
  if (res.error) res = await q("id, nombre, apellidos, nacionalidad, parentesco, familiaId, familia:Familia(id, nombre), expedientes:Expediente(tipo, createdAt), historial:ServicioHistorico(etiqueta, tipo, fecha, createdAt)");
  if (res.error) res = await q("id, nombre, apellidos, nacionalidad, parentesco, familiaId, familia:Familia(id, nombre), expedientes:Expediente(tipo, createdAt)");
  if (res.error) res = await q("id, nombre, apellidos, nacionalidad, expedientes:Expediente(tipo, createdAt)");
  const { data, error } = res;

  const rows = ((data ?? []) as unknown[]) as Row[];
  const dia = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-ES"); };
  const aCli = (c: Row) => {
    const exps = [...(c.expedientes ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    // Sin expediente en curso, el último trámite es el que trae el historial migrado:
    // se ordena por la fecha REAL del trámite (la del Excel), no por la de importación.
    const hist = [...(c.historial ?? [])].sort((a, b) => (b.fecha ?? b.createdAt).localeCompare(a.fecha ?? a.createdAt));
    const h = hist[0];
    const ultimoHist = h ? `${h.etiqueta || TIPO_LABEL[h.tipo ?? ""] || "—"}${h.fecha ? ` · ${dia(h.fecha)}` : ""}` : "—";
    return {
      id: c.id,
      nombre: `${c.nombre} ${c.apellidos ?? ""}`.trim() || "—",
      nacionalidad: c.nacionalidad ?? "—",
      expedientes: exps.length,
      ultimo: exps[0] ? TIPO_LABEL[exps[0].tipo] ?? exps[0].tipo : ultimoHist,
      oficinaId: c.oficinaId ?? null,
      _ultimoAt: exps[0]?.createdAt ?? h?.fecha ?? h?.createdAt ?? "",
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

  // Vaciado en masa: mismas reglas que el borrado unitario — solo administradores, y solo
  // fichas sin expedientes y fuera de una familia. Se cuentan aquí porque la página ya tiene
  // los expedientes de cada cliente: ni una consulta de más.
  const { data: miMem } = await supabase.from("Membership").select("role").limit(1).maybeSingle();
  const esAdmin = puedeGestionarEquipo((miMem as { role?: string } | null)?.role);
  // Sedes du despacho : vide = mono-oficina → ni cases à cocher ni barre de réaffectation.
  const { data: ofis } = await supabase.from("Oficina").select("id, nombre").order("orden");
  const oficinas = (ofis ?? []) as { id: string; nombre: string }[];
  const conExpedientes = rows.filter((c) => (c.expedientes?.length ?? 0) > 0).length;
  const enFamilia = rows.filter((c) => c.familiaId && (c.expedientes?.length ?? 0) === 0).length;
  const borrables = rows.length - conExpedientes - enFamilia;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tightest text-slate-900">{t("Clientes")}</h1>
          <p className="text-sm text-slate-500">
            {individuales.length} {individuales.length === 1 ? t("cliente") : t("clientes")}
            {entradasFamilia.length > 0 && <> · {entradasFamilia.length} {entradasFamilia.length === 1 ? t("familia") : t("familias")}</>}
            <span className="ml-2 rounded-full bg-aproba-100 px-2 py-0.5 text-xs font-semibold text-aproba-700">{t("datos reales")}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/app/importar" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400">{t("Importar datos")}</Link>
          <Link href="/app/clientes/nuevo" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400">{t("+ Nuevo cliente")}</Link>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {t("Error al cargar los clientes")}: {error.message}
        </p>
      ) : (
        <>
          <ClientesList lista={lista} oficinas={oficinas} />
          {esAdmin && <BorrarTodosClientes borrables={borrables} conExpedientes={conExpedientes} enFamilia={enFamilia} />}
        </>
      )}
    </div>
  );
}
