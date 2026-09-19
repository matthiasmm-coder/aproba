-- ─────────────────────────────────────────────────────────────────────────────
-- CARPETAS DEL CATÁLOGO (20/09/2026)
--
-- Ajustes › Servicios pasa a ser un explorador: carpetas (temas) con subcarpetas,
-- y dentro los servicios Y los packs, en una sola lista. Tres piezas:
--
--   1. Workspace."temas"          → el árbol de carpetas (jsonb):
--        [{ id, nombre, parentId, orden, usuarios:[userId] }]   usuarios vacío = todo el equipo
--   2. ServicioConfig."temaId"    → en qué carpeta vive cada servicio/pack
--   3. ServicioConfig."servicioIds" + "descuentoPct" → un servicio CON servicios dentro
--      ES un pack. Su clave no cambia nunca, así que los expedientes que ya lo citan
--      siguen resolviendo su nombre.
--
-- NADA se borra ni se mueve: `categoria` se sigue escribiendo (el nombre de la carpeta),
-- así el portal del cliente, el árbol de expedientes y el importador no se enteran.
-- Los packs existentes de Workspace."packs" se COPIAN a ServicioConfig (misma id como
-- clave) y la columna original se mantiene en sincronía al guardar: los enlaces
-- ?pack=… y el portal siguen funcionando igual.
--
-- Idempotente: se puede pegar varias veces.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public."Workspace"      add column if not exists "temas" jsonb;
alter table public."ServicioConfig" add column if not exists "temaId" text;
alter table public."ServicioConfig" add column if not exists "servicioIds" text[];
alter table public."ServicioConfig" add column if not exists "descuentoPct" integer;

-- ── 1 · Carpetas a partir de las categorías que ya usa cada despacho ─────────
-- Una carpeta por categoría distinta (respetando la grafía y el orden de aparición
-- del catálogo). Solo para los despachos que aún no tienen árbol.
with cats as (
  select s."workspaceId",
         btrim(s."categoria") as nombre,
         min(coalesce(s."orden", 0)) as orden
  from public."ServicioConfig" s
  where coalesce(btrim(s."categoria"), '') <> ''
  group by s."workspaceId", btrim(s."categoria")
), numeradas as (
  -- La numeración va en su propio paso: un agregado no puede llevar dentro una
  -- función de ventana (42803).
  select c.*, row_number() over (partition by c."workspaceId" order by c.orden, c.nombre) as pos
  from cats c
), arbol as (
  select n."workspaceId",
         jsonb_agg(jsonb_build_object(
           'id', 'tema_' || md5(n."workspaceId" || '|' || n.nombre),
           'nombre', n.nombre,
           'parentId', null,
           'orden', n.pos,
           'usuarios', '[]'::jsonb
         ) order by n.pos) as temas
  from numeradas n
  group by n."workspaceId"
)
update public."Workspace" w
set "temas" = a.temas
from arbol a
where w."id" = a."workspaceId"
  and (w."temas" is null or jsonb_array_length(w."temas") = 0);

-- ── 2 · Cada servicio, en su carpeta ────────────────────────────────────────
update public."ServicioConfig" s
set "temaId" = 'tema_' || md5(s."workspaceId" || '|' || btrim(s."categoria"))
where s."temaId" is null
  and coalesce(btrim(s."categoria"), '') <> '';

-- ── 3 · Los packs existentes entran en la misma lista ───────────────────────
-- Copia, no mudanza: Workspace."packs" se queda como está (el portal y los enlaces
-- ?pack=… lo siguen leyendo) y el guardado lo mantiene en sincronía a partir de aquí.
insert into public."ServicioConfig" (
  "id", "workspaceId", "clave", "label", "descripcion", "docs", "active",
  "anticipo", "resto", "orden", "categoria", "temaId", "servicioIds", "descuentoPct",
  "precioOculto", "porcentaje", "porcentajeSobre", "updatedAt"
)
select
  'svc_' || w."id" || '_' || (p->>'id'),
  w."id",
  p->>'id',
  coalesce(nullif(btrim(p->>'nombre'), ''), 'Pack'),
  nullif(btrim(coalesce(p->>'desc', '')), ''),
  '{}',
  true,
  0, 0,
  900 + (p_idx - 1),
  nullif(btrim(coalesce(p->>'categoria', '')), ''),
  case when coalesce(btrim(p->>'categoria'), '') <> ''
       then 'tema_' || md5(w."id" || '|' || btrim(p->>'categoria')) end,
  coalesce((select array_agg(x) from jsonb_array_elements_text(p->'servicioIds') x), '{}'),
  coalesce(nullif(p->>'descuentoPct', '')::int, 0),
  coalesce(nullif(p->>'precioOculto', '')::boolean, false),
  nullif(nullif(p->>'porcentaje', '')::numeric, 0),
  nullif(btrim(coalesce(p->>'porcentajeSobre', '')), ''),
  now()
from public."Workspace" w
cross join lateral jsonb_array_elements(coalesce(w."packs", '[]'::jsonb)) with ordinality as t(p, p_idx)
where coalesce(p->>'id', '') <> ''
  -- Sin ON CONFLICT: el índice único (workspaceId, clave) fue sustituido por dos
  -- PARCIALES en config-por-oficina.sql, y un on conflict no los encontraría.
  and not exists (
    select 1 from public."ServicioConfig" s
    where s."workspaceId" = w."id" and s."clave" = p->>'id' and s."oficinaId" is null
  );

-- Carpetas que faltan: categorías que ningún servicio usaba (las de los packs, por
-- ejemplo) o temaId que no existe en el árbol. Sin esto, un pack apuntaría a una carpeta
-- inexistente y aparecería «sin carpeta» aunque tuviera tema.
with faltan as (
  select s."workspaceId", btrim(s."categoria") as nombre
  from public."ServicioConfig" s
  join public."Workspace" w on w."id" = s."workspaceId"
  where coalesce(btrim(s."categoria"), '') <> ''
    and not exists (
      select 1 from jsonb_array_elements(coalesce(w."temas", '[]'::jsonb)) t
      where t->>'id' = s."temaId"
    )
  group by 1, 2
), añadidas as (
  select f."workspaceId",
         jsonb_agg(jsonb_build_object(
           'id', 'tema_' || md5(f."workspaceId" || '|' || f.nombre),
           'nombre', f.nombre, 'parentId', null,
           'orden', 500, 'usuarios', '[]'::jsonb
         )) as nuevas
  from faltan f group by f."workspaceId"
)
update public."Workspace" w
set "temas" = coalesce(w."temas", '[]'::jsonb) || a.nuevas
from añadidas a
where w."id" = a."workspaceId";

update public."ServicioConfig" s
set "temaId" = 'tema_' || md5(s."workspaceId" || '|' || btrim(s."categoria"))
where coalesce(btrim(s."categoria"), '') <> ''
  and (s."temaId" is null or s."temaId" <> 'tema_' || md5(s."workspaceId" || '|' || btrim(s."categoria")));

create index if not exists "ServicioConfig_temaId_idx" on public."ServicioConfig" ("workspaceId", "temaId");


-- ─────────────────────────────────────────────────────────────────────────────
-- VUELTA ATRÁS (si hubiera que revertir el código)
--
-- El código anterior no conoce `temaId` ni `servicioIds`: seguiría leyendo `categoria`
-- (que se mantiene al día) y Workspace."packs" (intacto), así que revertir el despliegue
-- basta. LO ÚNICO a deshacer son las filas-pack copiadas a ServicioConfig: el código
-- viejo no sabe distinguirlas y las enseñaría como servicios normales, duplicando los
-- packs en el portal. Este borrado es seguro: cada una sigue viva en Workspace."packs".
--
--   delete from public."ServicioConfig" s
--   using public."Workspace" w
--   where s."workspaceId" = w."id"
--     and s."servicioIds" is not null
--     and array_length(s."servicioIds", 1) > 0
--     and exists (
--       select 1 from jsonb_array_elements(coalesce(w."packs", '[]'::jsonb)) p
--       where p->>'id' = s."clave"
--     );
--
-- Las columnas nuevas pueden quedarse: nadie las lee. Y para volver al catálogo exacto
-- de antes del despliegue: node scripts/catalogo-backup.mjs restaurar <copia.json>
-- ─────────────────────────────────────────────────────────────────────────────
