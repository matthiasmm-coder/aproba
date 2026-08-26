-- ───────────────────── MIGRATION 2026-08-26 : la prueba pasa a 15 días ─────────────────────
-- Por qué (medido sobre TODOS los despachos dados de alta desde junio): ninguna cuenta
-- ha arrancado nunca después del 2º día. Juan actuó el día 0 y sigue ahí 58 días
-- después; Jennifer el día 2; el resto, o el día 0-1 y nada más, o nunca. Los días 3
-- a 30 no han producido una sola activación en toda la historia del producto.
--
-- 30 días no salvaban a nadie: solo retrasaban la decisión de quien sí iba a decidir.
-- Con 4,5 meses por delante, 15 días duplican el número de ciclos de conversión.
--
-- ⚠️ Solo afecta a las ALTAS NUEVAS: trialEndsAt se estampa en el momento del alta.
-- Las pruebas en curso conservan su fecha — Gesnet sigue venciendo el 10/09.
--
-- Se reemplazan las DOS sobrecargas que existen en la base (2 y 3 argumentos): la app
-- llama a la de 3, pero dejar la otra en 30 días sería una trampa para el día en que
-- alguien la invoque. Copia exacta de las funciones activas — solo cambia la duración.
-- Aditiva e idempotente.
-- ─────────────────────────────────────────────────────────────────────────────────────

-- Sobrecarga de 3 argumentos — la que usa el formulario de alta (onboarding-form.tsx).
create or replace function public.create_workspace(p_nombre text, p_tipo text default 'GESTORIA', p_plan text default 'STARTER')
returns text language plpgsql security definer set search_path = public as $$
declare v_ws text := gen_random_uuid()::text; v_uid text := auth.uid()::text;
begin
  if v_uid is null then raise exception 'no authenticated user'; end if;
  insert into public."Workspace" (id, nombre, tipo, "createdAt", "updatedAt")
    values (v_ws, p_nombre, p_tipo::"WorkspaceTipo", now(), now());
  insert into public."Membership" (id, "userId", "workspaceId", role, "createdAt")
    values (gen_random_uuid()::text, v_uid, v_ws, 'OWNER', now());
  insert into public."Subscription" (id, "workspaceId", plan, estado, "trialEndsAt", "createdAt")
    values (gen_random_uuid()::text, v_ws, coalesce(nullif(p_plan,''),'STARTER')::"Plan", 'TRIAL', now() + interval '15 days', now());
  return v_ws;
end; $$;
grant execute on function public.create_workspace(text, text, text) to authenticated;

-- Sobrecarga de 2 argumentos — heredada, aún viva en la base. Misma duración.
create or replace function public.create_workspace(p_nombre text, p_tipo text default 'GESTORIA')
returns text language plpgsql security definer set search_path = public as $$
declare v_ws text := gen_random_uuid()::text; v_uid text := auth.uid()::text;
begin
  if v_uid is null then raise exception 'no authenticated user'; end if;
  insert into public."Workspace" (id, nombre, tipo, "createdAt", "updatedAt")
    values (v_ws, p_nombre, p_tipo::"WorkspaceTipo", now(), now());
  insert into public."Membership" (id, "userId", "workspaceId", role, "createdAt")
    values (gen_random_uuid()::text, v_uid, v_ws, 'OWNER', now());
  insert into public."Subscription" (id, "workspaceId", plan, estado, "trialEndsAt", "createdAt")
    values (gen_random_uuid()::text, v_ws, 'STARTER'::"Plan", 'TRIAL', now() + interval '15 days', now());
  return v_ws;
end; $$;
grant execute on function public.create_workspace(text, text) to authenticated;
