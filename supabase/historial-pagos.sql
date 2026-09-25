-- ─────────────────────────────────────────────────────────────────────────────
-- HISTORIAL: UN SERVICIO COBRADO EN VARIAS FACTURAS SALE UNA SOLA VEZ, CON SU CONCEPTO
-- (25/09/2026)
--
-- Lo migrado (ServicioHistorico) es una fila por FACTURA. En Expedientes › Historial,
-- Luis veía «duplicados»:
--   · un servicio cobrado en dos facturas («Primer pago (1-2)», «Segundo pago (2-2)»)
--     salía dos veces → nueva columna "pagoDeId": la 2ª factura apunta a la 1ª, y el
--     Historial enseña una sola línea con los dos números («AGC0262 + AGC0271»);
--   · dos servicios distintos pagados por el mismo cliente (sus dos hijos) parecían
--     iguales porque el concepto de la factura no se veía → historial_filas devuelve
--     "detalle" (el concepto, primera línea de "notas" sin «Factura: ») y "pagos".
-- La ficha de la empresa sigue listando TODAS las facturas: esto solo agrupa servicios.
--
-- Idempotente: se puede pegar varias veces en el SQL Editor. Sustituye las funciones de
-- supabase/historial-migrados.sql (mismas firmas; historial_filas gana dos columnas, por
-- eso se borra y se crea). SECURITY INVOKER: la RLS acota al despacho.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public."ServicioHistorico"
  add column if not exists "pagoDeId" text references public."ServicioHistorico"("id") on delete set null;
create index if not exists "ServicioHistorico_pagoDeId_idx" on public."ServicioHistorico"("pagoDeId");
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ServicioHistorico_pagoDe_check') then
    alter table public."ServicioHistorico" add constraint "ServicioHistorico_pagoDe_check"
      check ("pagoDeId" is null or "pagoDeId" <> "id");
  end if;
end $$;

create or replace function public.historial_resumen(
  p_oficinas text[] default null,
  p_incluir_sin_sede boolean default false
) returns table (servicio text, tipo text, anio text, salida text, asignado text, n bigint)
language sql stable security invoker
set search_path = public
as $$
  select
    coalesce(e."servicioClave", '')::text,
    coalesce(e."tipo"::text, '')::text,
    public.anio_historial(coalesce(e."fechaPresentacion", pev.presentado), e."archivadoAt"::timestamp, e."createdAt"),
    public.salida_historial(e."salida", e."estado"::text),
    coalesce(u."nombre", '')::text,
    count(*)
  from public."Expediente" e
  left join public."User" u on u."id" = e."asignadoAId"
  left join lateral (
    select min(ev."createdAt") as presentado
    from public."ExpedienteEvento" ev
    where ev."expedienteId" = e."id" and ev."tipo" = 'PRESENTADO'
  ) pev on true
  where e."archivadoAt" is not null
    and (
      p_oficinas is null
      or e."oficinaId" = any(p_oficinas)
      or (p_incluir_sin_sede and e."oficinaId" is null)
    )
  group by 1, 2, 3, 4, 5
  union all
  -- Lo migrado: un servicio por línea (los pagos siguientes no cuentan aparte).
  select
    coalesce(h."servicioClave", '')::text,
    coalesce(h."tipo", '')::text,
    coalesce(to_char(h."fecha", 'YYYY'), '')::text,
    ''::text,
    ''::text,
    count(*)
  from public."ServicioHistorico" h
  left join public."Cliente" c on c."id" = h."clienteId"
  left join public."Empresa" em on em."id" = h."empresaId"
  where h."pagoDeId" is null
    and (
      p_oficinas is null
      or coalesce(c."oficinaId", em."oficinaId") = any(p_oficinas)
      or (p_incluir_sin_sede and coalesce(c."oficinaId", em."oficinaId") is null)
    )
  group by 1, 2, 3;
$$;

drop function if exists public.historial_filas(text[], boolean, text, text, text, text, text, text, int, int);
create or replace function public.historial_filas(
  p_oficinas text[] default null,
  p_incluir_sin_sede boolean default false,
  p_servicio text default null,   -- '' = sin servicioClave (antiguos/importados)
  p_tipo text default null,       -- se usa junto a p_servicio = '' para separarlos por tipo
  p_anio text default null,       -- '' = sin fecha
  p_q text default null,          -- búsqueda: cliente, empresa, referencia o concepto
  p_asignado text default null,   -- nombre del responsable ('' = sin asignar)
  p_salida text default null,     -- concedido/denegado/desistido/en_tramite; '' = sin clasificar
  p_limit int default 50,
  p_offset int default 0
) returns table (
  id text, referencia text, cliente text, empresa text, tipo text, servicio text,
  salida text, estado text, presentacion text, anio text, asignado text,
  origen text, enlace text, detalle text, pagos int
)
language sql stable security invoker
set search_path = public
as $$
  select t.id, t.referencia, t.cliente, t.empresa, t.tipo, t.servicio, t.salida, t.estado,
         t.presentacion, t.anio, t.asignado, t.origen, t.enlace, t.detalle, t.pagos
  from (
    select
      e."id"::text as id,
      e."referencia"::text as referencia,
      coalesce(nullif(f."nombre", ''), nullif(btrim(concat_ws(' ', c."nombre", c."apellidos")), ''), '—')::text as cliente,
      coalesce(em."razonSocial", '')::text as empresa,
      coalesce(e."tipo"::text, '')::text as tipo,
      coalesce(e."servicioClave", '')::text as servicio,
      public.salida_historial(e."salida", e."estado"::text) as salida,
      coalesce(e."estado"::text, '')::text as estado,
      coalesce(to_char(coalesce(e."fechaPresentacion", pev.presentado), 'DD/MM/YYYY'), '')::text as presentacion,
      public.anio_historial(coalesce(e."fechaPresentacion", pev.presentado), e."archivadoAt"::timestamp, e."createdAt") as anio,
      coalesce(u."nombre", '')::text as asignado,
      ''::text as origen,
      ''::text as enlace,
      ''::text as detalle,
      1::int as pagos,
      coalesce(e."fechaPresentacion", pev.presentado)::timestamp as orden1,
      e."archivadoAt"::timestamp as orden2
    from public."Expediente" e
    left join public."Cliente" c on c."id" = e."clienteId"
    left join public."User" u on u."id" = e."asignadoAId"
    left join public."Familia" f on f."id" = e."familiaId"
    left join public."Empresa" em on em."id" = e."empresaId"
    left join lateral (
      select min(ev."createdAt") as presentado
      from public."ExpedienteEvento" ev
      where ev."expedienteId" = e."id" and ev."tipo" = 'PRESENTADO'
    ) pev on true
    where e."archivadoAt" is not null
      and (
        p_oficinas is null
        or e."oficinaId" = any(p_oficinas)
        or (p_incluir_sin_sede and e."oficinaId" is null)
      )
      and (p_servicio is null or coalesce(e."servicioClave", '') = p_servicio)
      and (p_tipo is null or coalesce(e."tipo"::text, '') = p_tipo)
      and (p_anio is null or public.anio_historial(coalesce(e."fechaPresentacion", pev.presentado), e."archivadoAt"::timestamp, e."createdAt") = p_anio)
      and (p_asignado is null or coalesce(u."nombre", '') = p_asignado)
      and (p_salida is null or public.salida_historial(e."salida", e."estado"::text) = p_salida)
      and (
        p_q is null or p_q = '' or
        e."referencia" ilike '%' || p_q || '%' or
        btrim(concat_ws(' ', c."nombre", c."apellidos")) ilike '%' || p_q || '%' or
        coalesce(f."nombre", '') ilike '%' || p_q || '%' or
        coalesce(em."razonSocial", '') ilike '%' || p_q || '%'
      )

    union all

    -- Lo migrado: se abre la ficha del titular. Una línea por servicio: la 1ª factura
    -- y, detrás, los números de las siguientes («AGC0262 + AGC0271»).
    select
      ('sh_' || h."id")::text,
      concat_ws(' + ', nullif(h."referencia", ''), pg.refs)::text,
      coalesce(nullif(btrim(concat_ws(' ', c."nombre", c."apellidos")), ''), '—')::text,
      coalesce(em."razonSocial", '')::text,
      coalesce(h."tipo", '')::text,
      coalesce(h."servicioClave", '')::text,
      ''::text,
      ''::text,
      coalesce(to_char(h."fecha", 'DD/MM/YYYY'), '')::text,
      coalesce(to_char(h."fecha", 'YYYY'), '')::text,
      ''::text,
      'MIGRACION'::text,
      (case when h."clienteId" is not null then '/app/clientes/' || h."clienteId" else '/app/empresas/' || coalesce(h."empresaId", '') end)::text,
      btrim(regexp_replace(split_part(coalesce(h."notas", ''), E'\n', 1), '^\s*Factura:\s*', '', 'i'))::text,
      (1 + coalesce(pg.n, 0))::int,
      h."fecha"::timestamp,
      h."createdAt"::timestamp
    from public."ServicioHistorico" h
    left join public."Cliente" c on c."id" = h."clienteId"
    left join public."Empresa" em on em."id" = h."empresaId"
    left join lateral (
      select string_agg(nullif(p."referencia", ''), ' + ' order by p."fecha" nulls last, p."createdAt") as refs,
             count(*) as n
      from public."ServicioHistorico" p
      where p."pagoDeId" = h."id"
    ) pg on true
    where h."pagoDeId" is null
      and (
        p_oficinas is null
        or coalesce(c."oficinaId", em."oficinaId") = any(p_oficinas)
        or (p_incluir_sin_sede and coalesce(c."oficinaId", em."oficinaId") is null)
      )
      and (p_servicio is null or coalesce(h."servicioClave", '') = p_servicio)
      and (p_tipo is null or coalesce(h."tipo", '') = p_tipo)
      and (p_anio is null or coalesce(to_char(h."fecha", 'YYYY'), '') = p_anio)
      and (p_asignado is null or p_asignado = '')
      and (p_salida is null or p_salida = '')
      and (
        p_q is null or p_q = '' or
        coalesce(h."referencia", '') ilike '%' || p_q || '%' or
        coalesce(pg.refs, '') ilike '%' || p_q || '%' or
        btrim(concat_ws(' ', c."nombre", c."apellidos")) ilike '%' || p_q || '%' or
        coalesce(em."razonSocial", '') ilike '%' || p_q || '%' or
        coalesce(h."etiqueta", '') ilike '%' || p_q || '%' or
        coalesce(h."notas", '') ilike '%' || p_q || '%'
      )
  ) t
  order by t.orden1 desc nulls last, t.orden2 desc
  limit greatest(1, least(p_limit, 200)) offset greatest(0, p_offset);
$$;

grant execute on function public.historial_resumen(text[], boolean) to authenticated;
grant execute on function public.historial_filas(text[], boolean, text, text, text, text, text, text, int, int) to authenticated;

-- Que la API vea ya la columna nueva y la nueva forma de historial_filas:
notify pgrst, 'reload schema';
