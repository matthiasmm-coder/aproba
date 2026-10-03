// Genera supabase/servicios-canje.sql a partir de lib/servicios.ts (DEFAULT_SERVICIOS): el
// servicio «Canje de permiso de conducir» (03/10/2026, Jennifer y Samara) entra INACTIVO en
// el catálogo de cada despacho que ya tiene el suyo (los nuevos lo reciben por defecto), en la
// carpeta «Tráfico». Salvo donde ya hay un servicio propio de canje (Juan tiene el suyo).
// Mismo patrón que scripts/generar-sql-ley14.ts. Una sola fuente: se regenera si cambia.
//   npx tsx scripts/generar-sql-canje.ts
import { writeFileSync } from "node:fs";
import { DEFAULT_SERVICIOS } from "../lib/servicios";

const q = (s: unknown) => (s == null ? "null" : `'${String(s).replace(/'/g, "''")}'`);
const arr = (xs: string[]) => `array[${xs.map(q).join(", ")}]::text[]`;
const s = DEFAULT_SERVICIOS.find((x) => x.id === "canje_permiso");
if (!s) throw new Error("canje_permiso no está en DEFAULT_SERVICIOS");
const TEMA = s.categoria ?? "Tráfico";
const sql = `-- ────────────────────────────────────────────────────────────────────────────────────
-- CANJE DEL PERMISO DE CONDUCIR EN EL CATÁLOGO DE CADA DESPACHO (03/10/2026) — GENERADO por
-- scripts/generar-sql-canje.ts desde lib/servicios.ts: no editar a mano.
--
-- Los despachos creados a partir de hoy lo reciben por defecto. Los que ya tienen catálogo
-- propio (filas en ServicioConfig) lo reciben aquí, INACTIVO: aparece en Ajustes › Servicios,
-- carpeta «${TEMA}», y cada despacho lo activa si lo lleva. En cada ámbito (gestoría y oficinas
-- con catálogo propio) que aún no lo tenga, y no donde ya hay un servicio propio de canje.
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
  "anticipo", "resto", "citaPresencial", "citaQuien", "suplidos", "categoria", "temaId", "orden", "updatedAt"
)
select
  -- El MISMO id que escribe Ajustes (lib/config-browser), como en servicios-ley14.sql.
  'svc_' || a."workspaceId" || '_' || coalesce(a."oficinaId" || '_', '') || ${q(s.id)},
  a."workspaceId", a."oficinaId", ${q(s.id)}, ${q(s.label)}, ${q(s.desc)}, ${arr(s.docs)}, false,
  ${s.anticipo}, ${s.resto}, ${s.citaPresencial}, ${q(s.citaQuien)}, ${q(JSON.stringify(s.suplidos ?? []))}::jsonb, ${q(TEMA)},
  case when w."temas" is not null and jsonb_array_length(w."temas") > 0
       then 'tema_' || md5(a."workspaceId" || '|' || ${q(TEMA)}) end,
  a.orden_max + 1, now()
from ambitos a
join public."Workspace" w on w."id" = a."workspaceId"
where not exists (
  select 1 from public."ServicioConfig" x
  where x."workspaceId" = a."workspaceId"
    and x."oficinaId" is not distinct from a."oficinaId"
    and (x."clave" = ${q(s.id)}
         -- un servicio propio de canje (p. ej. «Canje de licencia de conducir extranjera»)
         or (x."label" ilike '%canje%' and (x."label" ilike '%conduc%' or x."label" ilike '%permiso%' or x."label" ilike '%licencia%' or x."label" ilike '%carn%')))
);

-- La carpeta, en el árbol de los despachos que ya tienen carpetas y recibieron el servicio.
update public."Workspace" w
set "temas" = w."temas" || jsonb_build_array(jsonb_build_object(
  'id', 'tema_' || md5(w."id" || '|' || ${q(TEMA)}),
  'nombre', ${q(TEMA)},
  'parentId', null,
  'orden', coalesce((select max((t->>'orden')::int) from jsonb_array_elements(w."temas") t), 0) + 1,
  'usuarios', '[]'::jsonb
))
where w."temas" is not null and jsonb_array_length(w."temas") > 0
  and exists (select 1 from public."ServicioConfig" s where s."workspaceId" = w."id" and s."clave" = ${q(s.id)})
  and not exists (
    select 1 from jsonb_array_elements(w."temas") t
    where t->>'id' = 'tema_' || md5(w."id" || '|' || ${q(TEMA)})
  );

-- Comprobación:
-- select count(*) from public."ServicioConfig" where "clave" = ${q(s.id)};
`;
writeFileSync("supabase/servicios-canje.sql", sql);
console.log("supabase/servicios-canje.sql — 1 servicio, carpeta «" + TEMA + "»");
