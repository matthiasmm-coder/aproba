-- ─────────────────────────────────────────────────────────────────────────────
-- HISTORIAL: LO MIGRADO ENTRA EN EXPEDIENTES › HISTORIAL (25/09/2026)
--
-- Luis (Asenjo) migró su cartera desde su Excel de facturación: sus servicios del
-- pasado viven en "ServicioHistorico" (la ficha del cliente o de la empresa), no como
-- expedientes, y Expedientes › Historial solo leía expedientes archivados. Pidió verlos
-- ahí, en la carpeta de su servicio y su año, como el resto del archivo.
--
-- Las mismas dos funciones (supabase/historial-resumen.sql) con una segunda rama
-- (UNION ALL) que lee "ServicioHistorico":
--   · salida '' (sin clasificar): su resolución no consta — nunca se presume «concedido»;
--   · estado '' (la pantalla no deduce una categoría de él);
--   · origen 'MIGRACION' y enlace a la ficha del cliente o de la empresa: no hay
--     expediente que abrir;
--   · año y fecha: los del servicio (la de la factura, si es la única que se tenía);
--   · sede: la del titular (cliente o empresa).
-- historial_filas devuelve dos columnas nuevas (origen, enlace): se borra y se crea.
-- SECURITY INVOKER: la RLS de ServicioHistorico, Cliente y Empresa acota al despacho.
--
-- Idempotente: se puede pegar varias veces en el SQL Editor. Requiere haber ejecutado
-- antes supabase/historial-resumen.sql (anio_historial, salida_historial).
-- ─────────────────────────────────────────────────────────────────────────────

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
  -- Lo migrado de un sistema anterior (ServicioHistorico): sin salida ni responsable.
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
  where (
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
  p_q text default null,          -- búsqueda: cliente, empresa o referencia
  p_asignado text default null,   -- nombre del responsable ('' = sin asignar)
  p_salida text default null,     -- concedido/denegado/desistido/en_tramite; '' = sin clasificar
  p_limit int default 50,
  p_offset int default 0
) returns table (
  id text, referencia text, cliente text, empresa text, tipo text, servicio text,
  salida text, estado text, presentacion text, anio text, asignado text,
  origen text, enlace text
)
language sql stable security invoker
set search_path = public
as $$
  select t.id, t.referencia, t.cliente, t.empresa, t.tipo, t.servicio, t.salida, t.estado,
         t.presentacion, t.anio, t.asignado, t.origen, t.enlace
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

    -- Lo migrado de un sistema anterior: se abre la ficha del titular.
    select
      ('sh_' || h."id")::text,
      coalesce(h."referencia", '')::text,
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
      h."fecha"::timestamp,
      h."createdAt"::timestamp
    from public."ServicioHistorico" h
    left join public."Cliente" c on c."id" = h."clienteId"
    left join public."Empresa" em on em."id" = h."empresaId"
    where (
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
        btrim(concat_ws(' ', c."nombre", c."apellidos")) ilike '%' || p_q || '%' or
        coalesce(em."razonSocial", '') ilike '%' || p_q || '%' or
        coalesce(h."etiqueta", '') ilike '%' || p_q || '%'
      )
  ) t
  order by t.orden1 desc nulls last, t.orden2 desc
  limit greatest(1, least(p_limit, 200)) offset greatest(0, p_offset);
$$;

grant execute on function public.historial_resumen(text[], boolean) to authenticated;
grant execute on function public.historial_filas(text[], boolean, text, text, text, text, text, text, int, int) to authenticated;

-- Que la API vea ya la nueva forma de historial_filas:
notify pgrst, 'reload schema';
