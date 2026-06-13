-- ─────────────────────────────────────────────────────────────────────────────
-- Aproba — Row Level Security (Supabase / Postgres)
--
-- Prisma ne gère PAS les policies RLS : on les applique en migration SQL brute.
-- Objectif : un user ne voit JAMAIS les données d'un workspace dont il n'est pas
-- membre. C'est la garantie d'isolation multi-tenant — à tester en E2E dès le J1.
--
-- Hypothèse : auth.uid() (Supabase Auth) == User.id. On dérive les workspaces
-- autorisés via la table Membership.
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper : workspaces dont l'utilisateur courant est membre.
-- SECURITY DEFINER obligatoire : la policy de "Membership" appelle cette fonction,
-- qui lit "Membership" — sans definer, le RLS se ré-applique récursivement
-- (erreur 54001 "stack depth limit exceeded").
create or replace function app_workspace_ids()
returns setof text
language sql stable
security definer set search_path = public
as $$
  select "workspaceId" from "Membership" where "userId" = auth.uid()::text
$$;

-- Activer RLS sur chaque table scopée tenant.
-- NB : Supabase active désormais le RLS par défaut sur toute table du schéma public —
-- chaque table doit donc avoir une policy, sinon elle est invisible (deny-all).
alter table "User"             enable row level security;
alter table "Workspace"        enable row level security;
alter table "Membership"       enable row level security;
alter table "WorkspaceFeature" enable row level security;
alter table "Subscription"     enable row level security;
alter table "Cliente"          enable row level security;
alter table "Expediente"       enable row level security;
alter table "Documento"        enable row level security;
alter table "Extraction"       enable row level security;
alter table "Formulario"       enable row level security;
alter table "ExpedienteEvento" enable row level security;
alter table "Factura"          enable row level security;

-- Workspaces : accès aux workspaces dont on est membre.
create policy ws_member on "Workspace"
  for all using (id in (select app_workspace_ids()));

-- Tables directement scopées par workspaceId.
create policy cli_tenant on "Cliente"
  for all using ("workspaceId" in (select app_workspace_ids()));
create policy exp_tenant on "Expediente"
  for all using ("workspaceId" in (select app_workspace_ids()));
create policy fac_tenant on "Factura"
  for all using ("workspaceId" in (select app_workspace_ids()));
create policy wf_tenant on "WorkspaceFeature"
  for all using ("workspaceId" in (select app_workspace_ids()));
create policy sub_tenant on "Subscription"
  for all using ("workspaceId" in (select app_workspace_ids()));

-- Membership : on voit les memberships de ses propres workspaces.
create policy mem_tenant on "Membership"
  for all using ("workspaceId" in (select app_workspace_ids()));

-- User : soi-même + les membres de ses workspaces (noms des asignados, équipe).
create policy user_visible on "User"
  for select using (
    id = auth.uid()::text
    or id in (
      select "userId" from "Membership"
      where "workspaceId" in (select app_workspace_ids())
    )
  );

-- Tables scopées indirectement (via Expediente → workspaceId).
create policy doc_tenant on "Documento"
  for all using ("expedienteId" in (
    select id from "Expediente" where "workspaceId" in (select app_workspace_ids())
  ));
create policy form_tenant on "Formulario"
  for all using ("expedienteId" in (
    select id from "Expediente" where "workspaceId" in (select app_workspace_ids())
  ));
create policy evt_tenant on "ExpedienteEvento"
  for all using ("expedienteId" in (
    select id from "Expediente" where "workspaceId" in (select app_workspace_ids())
  ));
create policy ext_tenant on "Extraction"
  for all using ("documentoId" in (
    select d.id from "Documento" d
    join "Expediente" e on e.id = d."expedienteId"
    where e."workspaceId" in (select app_workspace_ids())
  ));

-- ⚠️ Test E2E obligatoire (J1) : créer 2 workspaces A et B, un user dans A,
--    vérifier qu'une requête de A ne retourne JAMAIS un Expediente de B.
