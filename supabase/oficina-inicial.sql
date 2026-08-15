-- ═══ LA GESTORÍA ES UNA OFICINA (modelo definitivo) ═══
-- Al crear la cuenta, el despacho ya es una oficina real: aparece en la lista,
-- se renombra, se le asignan miembros y clientes, y factura como cualquier otra.
-- El marcador orden = -1 identifica la fila creada automáticamente (siempre
-- primera al ordenar); todo lo demás la trata EXACTAMENTE igual que a las otras.

-- 0) Logo de facturación PROPIO por oficina (cae al del despacho si es null).
alter table "Oficina" add column if not exists "logoUrl" text;

-- 1) Backfill: una oficina por workspace existente, con el nombre del despacho.
insert into "Oficina" (id, "workspaceId", nombre, orden, "createdAt", "updatedAt")
select gen_random_uuid()::text, w.id, w.nombre, -1, now(), now()
from "Workspace" w
where not exists (select 1 from "Oficina" o where o."workspaceId" = w.id and o.orden = -1);

-- 2) Y para los workspaces FUTUROS: trigger tras el insert (cubre create_workspace
--    y cualquier vía futura sin tener que tocar cada función).
create or replace function crear_oficina_inicial() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into "Oficina" (id, "workspaceId", nombre, orden, "createdAt", "updatedAt")
  values (gen_random_uuid()::text, new.id, new.nombre, -1, now(), now());
  return new;
end $$;
drop trigger if exists workspace_oficina_inicial on "Workspace";
create trigger workspace_oficina_inicial
  after insert on "Workspace"
  for each row execute function crear_oficina_inicial();
