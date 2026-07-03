-- ───────────────────────── MIGRATION 2026-07-03 : essai unifié à 30 jours ─────────────────────────
-- La landing annonce « Prueba 1 mes gratis » mais create_workspace posait trialEndsAt = J+15
-- (et le mode testeur, lui, donne déjà 30 jours). On unifie : 1 mois d'essai partout.
-- Copie exacte de la fonction active (setup.sql, version 3 args) — seule la durée change.

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
    values (gen_random_uuid()::text, v_ws, coalesce(nullif(p_plan,''),'STARTER')::"Plan", 'TRIAL', now() + interval '30 days', now());
  return v_ws;
end; $$;
grant execute on function public.create_workspace(text, text, text) to authenticated;
