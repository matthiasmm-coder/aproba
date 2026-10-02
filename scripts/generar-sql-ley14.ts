// Genera supabase/servicios-ley14.sql a partir de lib/servicios.ts (DEFAULT_SERVICIOS):
// los servicios de la Ley 14/2013 entran INACTIVOS en el catálogo de cada despacho que ya
// tiene el suyo (los nuevos los reciben por defecto), en la carpeta «Movilidad
// internacional». Una sola fuente: el SQL se regenera si cambia el catálogo.
//   npx tsx scripts/generar-sql-ley14.ts
import { writeFileSync } from "node:fs";
import { DEFAULT_SERVICIOS } from "../lib/servicios";
import { SERVICIOS_LEY14 } from "../lib/ley14";

const q = (s: unknown) => (s == null ? "null" : `'${String(s).replace(/'/g, "''")}'`);
const arr = (xs: string[]) => `array[${xs.map(q).join(", ")}]::text[]`;
// El genérico de septiembre (movilidad_internacional) ya está donde lo activaron: no se toca.
const nuevos = DEFAULT_SERVICIOS.filter((s) => (SERVICIOS_LEY14 as readonly string[]).includes(s.id) && s.id !== "movilidad_internacional");
const valores = nuevos.map((s, i) => `    (${q(s.id)}, ${q(s.label)}, ${q(s.desc)}, ${arr(s.docs)}, ${s.anticipo}, ${s.resto}, ${s.citaPresencial}, ${q(s.citaQuien)}, ${q(JSON.stringify(s.suplidos ?? []))}::jsonb, ${i + 1})`).join(",\n");
const TEMA = "Movilidad internacional";
const sql = `-- ────────────────────────────────────────────────────────────────────────────────────
-- LEY 14/2013 EN EL CATÁLOGO DE CADA DESPACHO (01/10/2026) — GENERADO por
-- scripts/generar-sql-ley14.ts desde lib/servicios.ts: no editar a mano.
--
-- Los despachos creados a partir de hoy reciben estos servicios por defecto. Los que ya
-- tienen catálogo propio (filas en ServicioConfig) los reciben aquí, INACTIVOS: aparecen
-- en Ajustes › Servicios, carpeta «${TEMA}», y cada despacho activa los que lleve.
-- En cada ámbito (gestoría y oficinas con catálogo propio) que aún no los tenga.
--
-- Idempotente: se puede pegar varias veces.
-- ────────────────────────────────────────────────────────────────────────────────────

with ambitos as (
  select "workspaceId", "oficinaId", coalesce(max("orden"), 0) as orden_max
  from public."ServicioConfig"
  group by "workspaceId", "oficinaId"
), nuevos (clave, label, descripcion, docs, anticipo, resto, cita, quien, suplidos, pos) as (
  values
${valores}
)
insert into public."ServicioConfig" (
  "id", "workspaceId", "oficinaId", "clave", "label", "descripcion", "docs", "active",
  "anticipo", "resto", "citaPresencial", "citaQuien", "suplidos", "categoria", "temaId", "orden", "updatedAt"
)
select
  -- El MISMO id que escribe Ajustes (lib/config-browser): con un md5, el editor no
  -- encontraba la fila y su guardado chocaba con el índice único por clave (02/10/2026).
  'svc_' || a."workspaceId" || '_' || coalesce(a."oficinaId" || '_', '') || n.clave,
  a."workspaceId", a."oficinaId", n.clave, n.label, n.descripcion, n.docs, false,
  n.anticipo, n.resto, n.cita, n.quien, n.suplidos, '${TEMA}',
  -- Carpeta solo donde hay árbol (el update de abajo la crea); sin árbol, manda «categoria».
  case when w."temas" is not null and jsonb_array_length(w."temas") > 0
       then 'tema_' || md5(a."workspaceId" || '|' || '${TEMA}') end,
  a.orden_max + n.pos, now()
from ambitos a
join public."Workspace" w on w."id" = a."workspaceId"
cross join nuevos n
where not exists (
  select 1 from public."ServicioConfig" s
  where s."workspaceId" = a."workspaceId"
    and s."oficinaId" is not distinct from a."oficinaId"
    and s."clave" = n.clave
);

-- La carpeta, en el árbol de los despachos que ya tienen carpetas (los demás agrupan por
-- «categoria»): al final, a la raíz, visible para todo el equipo.
update public."Workspace" w
set "temas" = w."temas" || jsonb_build_array(jsonb_build_object(
  'id', 'tema_' || md5(w."id" || '|' || '${TEMA}'),
  'nombre', '${TEMA}',
  'parentId', null,
  'orden', coalesce((select max((t->>'orden')::int) from jsonb_array_elements(w."temas") t), 0) + 1,
  'usuarios', '[]'::jsonb
))
where w."temas" is not null and jsonb_array_length(w."temas") > 0
  and not exists (
    select 1 from jsonb_array_elements(w."temas") t
    where t->>'id' = 'tema_' || md5(w."id" || '|' || '${TEMA}')
  );

-- Comprobación:
-- select "clave", count(*) from public."ServicioConfig" where "clave" like 'ley14_%' group by 1 order by 1;
`;
writeFileSync("supabase/servicios-ley14.sql", sql);
console.log(`supabase/servicios-ley14.sql — ${nuevos.length} servicios`);
