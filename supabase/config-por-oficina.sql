-- ═══ SERVICIOS · AVISOS · HOJA DE ENCARGO POR OFICINA ═══
-- Mismo patrón que la facturación por sede: filas con oficinaId = ámbito de esa
-- oficina; filas con null = ámbito de la gestoría (las históricas). Una oficina
-- sin filas propias usa las de la gestoría — cascada, nunca un catálogo vacío.

-- 1) Servicios por sede
alter table "ServicioConfig" add column if not exists "oficinaId" text references "Oficina"(id) on delete cascade;
alter table "ServicioConfig" drop constraint if exists "ServicioConfig_workspaceId_clave_key";
drop index if exists "ServicioConfig_workspaceId_clave_key";
create unique index if not exists "ServicioConfig_comun_clave"
  on "ServicioConfig"("workspaceId", clave) where "oficinaId" is null;
create unique index if not exists "ServicioConfig_oficina_clave"
  on "ServicioConfig"("workspaceId", "oficinaId", clave) where "oficinaId" is not null;
create index if not exists "ServicioConfig_oficina_idx" on "ServicioConfig"("workspaceId", "oficinaId");

-- 2) Avisos por sede (misma mecánica) + puntero «usar los mismos que X»
alter table "AvisoConfig" add column if not exists "oficinaId" text references "Oficina"(id) on delete cascade;
alter table "AvisoConfig" drop constraint if exists "AvisoConfig_workspaceId_clave_key";
drop index if exists "AvisoConfig_workspaceId_clave_key";
create unique index if not exists "AvisoConfig_comun_clave"
  on "AvisoConfig"("workspaceId", clave) where "oficinaId" is null;
create unique index if not exists "AvisoConfig_oficina_clave"
  on "AvisoConfig"("workspaceId", "oficinaId", clave) where "oficinaId" is not null;

-- 3) Hoja de encargo/mandato por sede (null = heredar de la gestoría) + puntero
alter table "Oficina" add column if not exists "hojaEncargoActiva" boolean;
alter table "Oficina" add column if not exists "mandatarioNombre" text;
alter table "Oficina" add column if not exists "mandatarioDni" text;
alter table "Oficina" add column if not exists "mandatarioColegiado" text;
alter table "Oficina" add column if not exists "mandatarioColegio" text;
alter table "Oficina" add column if not exists "encargoFormasPago" text;
-- Punteros «mismas que otra oficina» (un salto, sin cadenas; el borrado del
-- destino los limpia a null → la sede vuelve a heredar de la gestoría).
alter table "Oficina" add column if not exists "avisosComoOficinaId"  text references "Oficina"(id) on delete set null;
alter table "Oficina" add column if not exists "encargoComoOficinaId" text references "Oficina"(id) on delete set null;
