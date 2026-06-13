-- ─────────────────────────────────────────────────────────────────────────────
-- Aproba — onboarding & liaison Auth  (à appliquer APRÈS `prisma db push` ET rls.sql)
--
-- Hypothèse RLS : auth.uid() == "User".id. On garde Supabase Auth comme source de
-- vérité ; public."User" en est un miroir (id = auth uid).
--
-- ⚠️ BROUILLON : à exécuter dans Supabase → SQL Editor une fois les tables créées,
--    puis vérifier (les noms de colonnes/enums viennent de Prisma, casse exacte).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Miroir auth.users → public."User" à l'inscription.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public."User" (id, email, nombre, "createdAt")
  values (
    new.id::text,
    new.email,
    nullif(new.raw_user_meta_data->>'nombre', ''),
    now()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) Création d'un espace de travail.
--    L'INSERT direct d'un Workspace est bloqué par RLS (pas encore membre) :
--    cette fonction SECURITY DEFINER crée Workspace + Membership(OWNER) + Subscription(TRIAL).
create or replace function public.create_workspace(p_nombre text, p_tipo text default 'GESTORIA')
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_ws  text := gen_random_uuid()::text;
  v_uid text := auth.uid()::text;
begin
  if v_uid is null then
    raise exception 'no authenticated user';
  end if;

  insert into public."Workspace" (id, nombre, tipo, "createdAt", "updatedAt")
  values (v_ws, p_nombre, p_tipo::"WorkspaceTipo", now(), now());

  insert into public."Membership" (id, "userId", "workspaceId", role, "createdAt")
  values (gen_random_uuid()::text, v_uid, v_ws, 'OWNER', now());

  insert into public."Subscription" (id, "workspaceId", plan, estado, "createdAt")
  values (gen_random_uuid()::text, v_ws, 'STARTER', 'TRIAL', now());

  return v_ws;
end;
$$;

grant execute on function public.create_workspace(text, text) to authenticated;
