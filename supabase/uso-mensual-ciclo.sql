-- ─────────────────────────────────────────────────────────────────────────────
-- La ventana de la cuota pasa del MES NATURAL al CICLO DE FACTURACIÓN del despacho:
-- la cuota se renueva el día en que paga (día 17 → del 17 al 16), no el día 1.
-- La clave de "UsoMensual"."mes" pasa de 'AAAA-MM' a 'AAAA-MM-DD' (primer día del
-- ciclo vigente) — la columna es texto libre, así que NO hay cambio de esquema.
--
-- Este script SIEMBRA el ciclo en curso de cada despacho a partir de las filas vivas
-- de Expediente, para que nadie estrene la nueva ventana con el contador a cero (sería
-- regalar cuota a quien ya está por encima del límite).
--
-- La siembra sale de las filas VIVAS: si alguien borró expedientes dentro del ciclo en
-- curso, ese arranque los pierde (una sola vez, y a favor del despacho). No se puede
-- reaprovechar el contador viejo 'AAAA-MM': mide una ventana distinta, no comparable.
--
-- Idempotente y seguro DESPUÉS del despliegue: `greatest` nunca baja un contador que
-- el código nuevo ya haya empezado a incrementar. Ejecutar una vez en Supabase.
-- (Mismo día ancla que lib/cuota.ts: currentPeriodEnd → trialEndsAt → día 1.)
-- ─────────────────────────────────────────────────────────────────────────────

-- `distinct on`: un despacho con dos filas de Subscription duplicaría la clave y
-- reventaría el `on conflict` ("cannot affect row a second time"). Gana la más reciente.
with ancla as (
  select distinct on (w."id")
         w."id" as ws,
         coalesce(
           extract(day from s."currentPeriodEnd")::int,
           extract(day from s."trialEndsAt")::int,
           1
         )::int as dia
  from "Workspace" w
  left join "Subscription" s on s."workspaceId" = w."id"
  order by w."id", s."currentPeriodEnd" desc nulls last
),
-- Último día de este mes y del anterior, para recortar un ancla 29/30/31.
limites as (
  select ws, dia,
    date_trunc('month', now() at time zone 'utc') as m0,
    date_trunc('month', (now() at time zone 'utc') - interval '1 month') as m1,
    extract(day from (date_trunc('month', now() at time zone 'utc') + interval '1 month' - interval '1 day'))::int as fin0,
    extract(day from (date_trunc('month', (now() at time zone 'utc') - interval '1 month') + interval '1 month' - interval '1 day'))::int as fin1
  from ancla
),
calc as (
  select ws,
    case
      when (m0 + (least(dia, fin0) - 1) * interval '1 day') <= (now() at time zone 'utc')
        then (m0 + (least(dia, fin0) - 1) * interval '1 day')   -- el ancla ya pasó este mes
      else   (m1 + (least(dia, fin1) - 1) * interval '1 day')   -- el ciclo vigente empezó el mes pasado
    end as inicio
  from limites
)
insert into "UsoMensual" ("workspaceId", "mes", "expedientesCreados")
select c.ws,
       to_char(c.inicio, 'YYYY-MM-DD'),
       (select count(*) from "Expediente" e where e."workspaceId" = c.ws and e."createdAt" >= c.inicio)::int
from calc c
on conflict ("workspaceId", "mes")
do update set "expedientesCreados" = greatest("UsoMensual"."expedientesCreados", excluded."expedientesCreados");
