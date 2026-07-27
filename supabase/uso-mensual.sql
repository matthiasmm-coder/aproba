-- ─────────────────────────────────────────────────────────────────────────────
-- Uso mensual MONÓTONO de expedientes — cierra la fuga del cobro del excedente
-- (3 €/expediente). Antes, lib/overage.ts contaba las filas VIVAS de Expediente
-- del mes: con el borrado definitivo, crear N → borrar k → crear k nunca pagaba
-- los k reales. Este contador solo sube al crear y NUNCA baja al borrar.
-- Migración aditiva e idempotente: ejecutar una vez en el editor SQL de Supabase.
-- Hasta entonces, el código cae al count vivo de siempre (repli, no rompe nada).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists "UsoMensual" (
  "workspaceId"        text    not null references "Workspace"("id") on delete cascade,
  -- Clave de la ventana en UTC. Hoy es 'YYYY-MM-DD' = primer día del CICLO DE
  -- FACTURACIÓN del despacho (lib/cuota.ts), no del mes natural. Texto libre: el
  -- cambio de formato no toca el esquema (ver supabase/uso-mensual-ciclo.sql).
  "mes"                text    not null,
  "expedientesCreados" integer not null default 0,
  primary key ("workspaceId", "mes")
);

-- RLS: los miembros LEEN su uso (contador de cuota en la UI). Escribir, solo el
-- servidor (service role vía la función de abajo) — sin policy de escritura.
alter table "UsoMensual" enable row level security;
drop policy if exists usomensual_tenant_select on "UsoMensual";
create policy usomensual_tenant_select on "UsoMensual"
  for select using ("workspaceId" in (select app_workspace_ids()));

-- Incremento atómico (upsert). Devuelve el contador YA incluyendo el expediente
-- recién creado — misma semántica que el count vivo al que sustituye.
create or replace function public.incrementar_uso_mensual(p_workspace_id text, p_mes text)
returns integer
language sql
set search_path = public
as $$
  insert into "UsoMensual" ("workspaceId", "mes", "expedientesCreados")
  values (p_workspace_id, p_mes, 1)
  on conflict ("workspaceId", "mes")
  do update set "expedientesCreados" = "UsoMensual"."expedientesCreados" + 1
  returning "expedientesCreados";
$$;

-- SOLO el servidor incrementa: un usuario autenticado no debe poder inflar el
-- contador de un workspace ajeno (le generaría cobros de excedente indebidos).
revoke execute on function public.incrementar_uso_mensual(text, text) from public, anon, authenticated;
grant execute on function public.incrementar_uso_mensual(text, text) to service_role;

-- Arranque: siembra el mes en curso desde las filas vivas (lo que contaba el código
-- viejo), para no regalar un reset de cuota a los workspaces ya por encima del
-- límite. `do nothing` mantiene la idempotencia: re-ejecutar no pisa un contador
-- ya en marcha. (Expediente.createdAt es TIMESTAMP sin zona, guardado en UTC.)
insert into "UsoMensual" ("workspaceId", "mes", "expedientesCreados")
select "workspaceId", to_char(now() at time zone 'utc', 'YYYY-MM'), count(*)::int
from "Expediente"
where "createdAt" >= date_trunc('month', now() at time zone 'utc')
group by "workspaceId"
on conflict ("workspaceId", "mes") do nothing;
