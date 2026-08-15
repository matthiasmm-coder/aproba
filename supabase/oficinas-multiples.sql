-- ═══ ADMINS = TODO · GESTORES/ASISTENTES = UNA O VARIAS OFICINAS ═══
-- Regla de Matthias (15/08): quien administra nunca está anclado a una sede —
-- ver todo es el sentido de ser admin. Gestores y asistentes pueden estar
-- afiliados a UNA O VARIAS oficinas y ven solo esas.

-- 1) Los administradores actuales quedan desanclados (Marta incluida).
update "Membership" set "oficinaId" = null
 where role in ('OWNER', 'ADMIN') and "oficinaId" is not null;

-- 2) Varias oficinas por miembro. `oficinaId` se conserva como PRIMARIA (la
--    primera del array): el estampado de clientes nuevos y los contadores la
--    siguen leyendo; la API escribe siempre las dos columnas en coherencia.
alter table "Membership" add column if not exists "oficinaIds" text[];
update "Membership" set "oficinaIds" = array["oficinaId"]
 where "oficinaId" is not null and "oficinaIds" is null;

-- 3) RLS. app_ve_oficina es la ÚNICA puerta que usan las políticas (cli/exp/
--    venc/fac): redefinirla basta, cero cambios de política.
create or replace function app_mis_oficinas(ws text) returns text[]
language sql stable security definer set search_path = public as $$
  select case
           when m.role in ('OWNER', 'ADMIN') then null                -- admin: sin ancla, ve todo
           when m."oficinaIds" is not null and array_length(m."oficinaIds", 1) > 0 then m."oficinaIds"
           when m."oficinaId" is not null then array[m."oficinaId"]   -- compat filas viejas
           else null
         end
    from "Membership" m
   where m."userId" = auth.uid()::text and m."workspaceId" = ws
   limit 1
$$;

create or replace function app_ve_oficina(ws text, fila text) returns boolean
language sql stable security definer set search_path = public as $$
  select mis is null                -- sin ancla (admin o miembro en «todas») → todo
      or fila is null               -- filas sin sede: visibles para todos (regla de siempre)
      or fila = any(mis)            -- una de MIS sedes
    from (select app_mis_oficinas(ws) as mis) s
$$;
