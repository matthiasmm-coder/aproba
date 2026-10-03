-- ────────────────────────────────────────────────────────────────────────────────────
-- CANJE DEL PERMISO DE CONDUCIR EN EL CATÁLOGO DE CADA DESPACHO (03/10/2026) — GENERADO por
-- scripts/generar-sql-canje.ts desde lib/servicios.ts: no editar a mano.
--
-- Los despachos creados a partir de hoy lo reciben por defecto. Los que ya tienen catálogo
-- propio (filas en ServicioConfig) lo reciben aquí, ACTIVO y con «precio a consultar» (sus
-- clientes no ven un precio que el despacho no ha elegido), carpeta «Tráfico». En cada ámbito
-- (gestoría y oficinas con catálogo propio) que aún no lo tenga, y no donde ya hay un servicio
-- propio de canje. (Las filas de la 1ª versión, inactivas: supabase/servicios-canje-activar.sql.)
--
-- Idempotente: se puede pegar varias veces.
-- ────────────────────────────────────────────────────────────────────────────────────

with ambitos as (
  select "workspaceId", "oficinaId", coalesce(max("orden"), 0) as orden_max
  from public."ServicioConfig"
  group by "workspaceId", "oficinaId"
)
insert into public."ServicioConfig" (
  "id", "workspaceId", "oficinaId", "clave", "label", "descripcion", "docs", "active",
  "anticipo", "resto", "precioOculto", "citaPresencial", "citaQuien", "suplidos", "categoria", "temaId", "orden", "updatedAt"
)
select
  -- El MISMO id que escribe Ajustes (lib/config-browser), como en servicios-ley14.sql.
  'svc_' || a."workspaceId" || '_' || coalesce(a."oficinaId" || '_', '') || 'canje_permiso',
  a."workspaceId", a."oficinaId", 'canje_permiso', 'Canje de permiso de conducir', 'Canjear un permiso de conducir extranjero por el español (DGT)', array['Pasaporte', 'TIE actual', 'Permiso de conducir extranjero (anverso y reverso)', 'Informe de aptitud psicofísica (centro de reconocimiento)']::text[], true,
  60, 60, true, true, 'cliente', '[{"concepto":"Tasa DGT 2.3 (canje de permiso)","importe":28.87}]'::jsonb, 'Tráfico',
  case when w."temas" is not null and jsonb_array_length(w."temas") > 0
       then 'tema_' || md5(a."workspaceId" || '|' || 'Tráfico') end,
  a.orden_max + 1, now()
from ambitos a
join public."Workspace" w on w."id" = a."workspaceId"
where not exists (
  select 1 from public."ServicioConfig" x
  where x."workspaceId" = a."workspaceId"
    and x."oficinaId" is not distinct from a."oficinaId"
    and (x."clave" = 'canje_permiso'
         -- un servicio propio de canje (p. ej. «Canje de licencia de conducir extranjera»)
         or (x."label" ilike '%canje%' and (x."label" ilike '%conduc%' or x."label" ilike '%permiso%' or x."label" ilike '%licencia%' or x."label" ilike '%carn%')))
);

-- La carpeta, en el árbol de los despachos que ya tienen carpetas y recibieron el servicio.
update public."Workspace" w
set "temas" = w."temas" || jsonb_build_array(jsonb_build_object(
  'id', 'tema_' || md5(w."id" || '|' || 'Tráfico'),
  'nombre', 'Tráfico',
  'parentId', null,
  'orden', coalesce((select max((t->>'orden')::int) from jsonb_array_elements(w."temas") t), 0) + 1,
  'usuarios', '[]'::jsonb
))
where w."temas" is not null and jsonb_array_length(w."temas") > 0
  and exists (select 1 from public."ServicioConfig" s where s."workspaceId" = w."id" and s."clave" = 'canje_permiso')
  and not exists (
    select 1 from jsonb_array_elements(w."temas") t
    where t->>'id' = 'tema_' || md5(w."id" || '|' || 'Tráfico')
  );

-- Comprobación: el editor de Supabase enseña el resultado de esta última consulta.
select count(*) as servicios_canje, count("temaId") as en_carpeta
from public."ServicioConfig" where "clave" = 'canje_permiso';
