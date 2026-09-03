import { createSupabaseServer } from "@/lib/supabase/server";
import { getT } from "@/lib/app-lang";
import { BandejaEntrada, type FilaBandeja, type ClienteOpcion, type ExpedienteOpcion } from "@/components/bandeja-entrada";
import Link from "next/link";

export const dynamic = "force-dynamic";

// Bandeja de entrada (03/09/2026): emails con documentos recibidos en la dirección
// docs-<token>@… que Aproba no ha podido atribuir a un cliente, más los últimos
// colocados. Todo bajo RLS (la tabla es multi-tenant).
export default async function BandejaPage() {
  const t = await getT();
  const supabase = await createSupabaseServer();
  const cols = "id, remitente, remitenteNombre, asunto, texto, recibidoAt, adjuntos, clienteId, expedienteId, estado, motivo";
  const [pend, rec, cli, exps] = await Promise.all([
    supabase.from("BandejaEntrada").select(cols).eq("estado", "PENDIENTE").order("recibidoAt", { ascending: false }).limit(100),
    supabase.from("BandejaEntrada").select(cols).neq("estado", "PENDIENTE").order("updatedAt", { ascending: false }).limit(15),
    supabase.from("Cliente").select("id, nombre, apellidos").order("nombre", { ascending: true }).limit(2000),
    supabase.from("Expediente").select("id, clienteId, referencia, tipo, archivadoAt").is("archivadoAt", null).limit(2000),
  ]);
  const faltaMigracion = Boolean(pend.error && /BandejaEntrada|relation|schema cache/i.test(pend.error.message));
  const pendientes = (pend.data ?? []) as FilaBandeja[];
  const recientes = (rec.data ?? []) as FilaBandeja[];
  const clientes = (cli.data ?? []) as ClienteOpcion[];
  const expedientes = ((exps.data ?? []) as (ExpedienteOpcion & { archivadoAt: string | null })[]).filter((e) => e.clienteId);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t("Bandeja de entrada")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("Documentos recibidos por email que esperan a que digas de qué cliente son.")}</p>
        </div>
        <Link href="/app/ajustes?abrir=notificaciones" className="text-sm font-medium text-aproba-700 underline underline-offset-2">{t("Mi dirección de recepción")}</Link>
      </div>
      {faltaMigracion ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{t("La recepción por email estará disponible cuando se aplique la migración de la base de datos.")}</p>
      ) : (
        <BandejaEntrada pendientes={pendientes} recientes={recientes} clientes={clientes} expedientes={expedientes} />
      )}
    </div>
  );
}
