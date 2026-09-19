-- ─────────────────────────────────────────────────────────────────────────────
-- HISTORIAL POR AÑO, LEÍDO EN EL SERVIDOR (19/09/2026)
--
-- Hasta hoy la pantalla Expedientes descargaba los 800 expedientes más recientes
-- y separaba archivo y trabajo en el navegador. Con los 15 años que Luis va a
-- importar, el final del archivo sencillamente NO llegaba (y el buscador tampoco
-- lo encontraba, porque solo mira lo descargado).
--
-- Estas dos funciones parten el problema en dos:
--   · historial_resumen → los RECUENTOS (servicio × año × salida). Son las carpetas.
--   · historial_filas   → las FILAS de una carpeta, solo cuando el gestor la abre.
--
-- SECURITY INVOKER a propósito: la RLS de "Expediente" (tenant + asistente + sede)
-- se aplica igual que en cualquier otra consulta. Los parámetros de oficina son el
-- filtro EXPLÍCITO de la pastilla de sede, que no es RLS.
--
-- Idempotente: se puede pegar varias veces en el SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- El AÑO de un expediente archivado: el de la presentación (es como lo recuerda el
-- gestor, «la nacionalidad de 2023»); si nunca se presentó, el del cierre; y si no,
-- el de apertura. Nunca se inventa: sin ninguna fecha, cadena vacía = «Sin fecha».
create or replace function public.anio_historial(
  p_presentacion timestamp, p_archivado timestamp, p_creado timestamp
) returns text language sql immutable as $$
  select coalesce(to_char(coalesce(p_presentacion, p_archivado, p_creado), 'YYYY'), '');
$$;

-- La SALIDA de un expediente archivado: la columna si está, y si no la que se deduce
-- del estado. Misma regla que lib/types.ts (salidaDeEstado): si divergen, los recuentos
-- del archivo dirían una cosa y las fichas otra.
create or replace function public.salida_historial(p_salida text, p_estado text)
returns text language sql immutable as $$
  select coalesce(
    nullif(p_salida, ''),
    case
      when p_estado in ('RESUELTO', 'FINALIZADO') then 'concedido'
      when p_estado = 'RECHAZADO' then 'denegado'
      when p_estado in ('PRESENTADO', 'CITA_HUELLAS') then 'en_tramite'
    end,
    ''
  );
$$;

-- Los expedientes presentados ANTES de que existiera "fechaPresentacion" guardan su
-- fecha únicamente en el evento PRESENTADO. Se recupera igual que en el tablero: si no,
-- la misma ficha diría «presentado el 02/06/2026» y el archivo no diría nada.
drop function if exists public.historial_resumen(text[], boolean);
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
  group by 1, 2, 3, 4, 5;
$$;

drop function if exists public.historial_filas(text[], boolean, text, text, text, text, int, int);
drop function if exists public.historial_filas(text[], boolean, text, text, text, text, text, int, int);
drop function if exists public.historial_filas(text[], boolean, text, text, text, text, text, text, int, int);
create or replace function public.historial_filas(
  p_oficinas text[] default null,
  p_incluir_sin_sede boolean default false,
  p_servicio text default null,   -- '' = expedientes sin servicioClave (antiguos/importados)
  p_tipo text default null,       -- se usa junto a p_servicio = '' para separarlos por tipo
  p_anio text default null,       -- '' = sin fecha
  p_q text default null,          -- búsqueda: cliente, empresa o referencia
  p_asignado text default null,   -- nombre del responsable ('' = sin asignar)
  p_salida text default null,     -- concedido/denegado/desistido/en_tramite; '' = sin clasificar
  p_limit int default 50,
  p_offset int default 0
) returns table (
  id text, referencia text, cliente text, empresa text, tipo text, servicio text,
  salida text, estado text, presentacion text, anio text, asignado text
)
language sql stable security invoker
set search_path = public
as $$
  select
    e."id"::text,
    e."referencia"::text,
    coalesce(nullif(f."nombre", ''), nullif(btrim(concat_ws(' ', c."nombre", c."apellidos")), ''), '—')::text,
    coalesce(em."razonSocial", '')::text,
    coalesce(e."tipo"::text, '')::text,
    coalesce(e."servicioClave", '')::text,
    public.salida_historial(e."salida", e."estado"::text),
    coalesce(e."estado"::text, '')::text,
    coalesce(to_char(coalesce(e."fechaPresentacion", pev.presentado), 'DD/MM/YYYY'), '')::text,
    public.anio_historial(coalesce(e."fechaPresentacion", pev.presentado), e."archivadoAt"::timestamp, e."createdAt"),
    coalesce(u."nombre", '')::text
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
  order by coalesce(e."fechaPresentacion", pev.presentado) desc nulls last, e."archivadoAt" desc
  limit greatest(1, least(p_limit, 200)) offset greatest(0, p_offset);
$$;

grant execute on function public.anio_historial(timestamp, timestamp, timestamp) to authenticated;
grant execute on function public.historial_resumen(text[], boolean) to authenticated;
grant execute on function public.salida_historial(text, text) to authenticated;
grant execute on function public.historial_filas(text[], boolean, text, text, text, text, text, text, int, int) to authenticated;

-- El archivo se recorre por servicio y por año: sin este índice, cada apertura de
-- carpeta barría la tabla entera del despacho.
create index if not exists "Expediente_archivo_idx"
  on public."Expediente" ("workspaceId", "archivadoAt")
  where "archivadoAt" is not null;
