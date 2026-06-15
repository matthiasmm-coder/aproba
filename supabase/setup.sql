-- ═══════════════════════════════════════════════════════════════════════════
-- Aproba — setup complet de la base (à coller dans Supabase → SQL Editor → Run)
-- 1) Schéma (tables + enums)  2) RLS (isolation multi-tenant)  3) Onboarding
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────── 1. SCHÉMA ─────────────────────────
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'GESTOR', 'ASISTENTE');

-- CreateEnum
CREATE TYPE "WorkspaceTipo" AS ENUM ('GESTORIA', 'DESPACHO_JURIDICO', 'MIXTO');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('STARTER', 'PRO', 'BUSINESS');

-- CreateEnum
CREATE TYPE "SubscriptionEstado" AS ENUM ('TRIAL', 'ACTIVA', 'PAST_DUE', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoTramite" AS ENUM ('NIE', 'TIE', 'ARRAIGO_SOCIAL', 'ARRAIGO_LABORAL', 'ARRAIGO_FAMILIAR', 'REAGRUPACION', 'RENOVACION', 'RESIDENCIA_LARGA', 'NACIONALIDAD', 'OTRO');

-- CreateEnum
CREATE TYPE "ExpedienteEstado" AS ENUM ('BORRADOR', 'DOCS_PENDIENTES', 'DOCS_VALIDADOS', 'FORM_GENERADO', 'PRESENTADO', 'RESUELTO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "DocumentoTipo" AS ENUM ('PASAPORTE', 'TARJETA_RESIDENCIA_TIE', 'CERTIFICADO_NIE', 'EMPADRONAMIENTO', 'CONTRATO_TRABAJO', 'NOMINA', 'ANTECEDENTES_PENALES', 'CERTIFICADO_BANCARIO', 'LIBRO_FAMILIA', 'TITULO_ESTUDIOS', 'OTRO');

-- CreateEnum
CREATE TYPE "DocumentoEstado" AS ENUM ('PENDIENTE', 'PROCESANDO', 'VALIDADO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "FormularioTipo" AS ENUM ('EX15', 'EX17', 'EX18', 'EX19', 'TASA_790_012');

-- CreateEnum
CREATE TYPE "FacturaEstado" AS ENUM ('BORRADOR', 'EMITIDA', 'PAGADA', 'VENCIDA', 'ANULADA');

-- CreateEnum
CREATE TYPE "EventoTipo" AS ENUM ('CREADO', 'DOC_SUBIDO', 'DOC_VALIDADO', 'DOC_RECHAZADO', 'FORM_GENERADO', 'ESTADO_CAMBIADO', 'PRESENTADO', 'NOTIFICACION_ENVIADA', 'COMENTARIO');

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "WorkspaceTipo" NOT NULL DEFAULT 'GESTORIA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nombre" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'GESTOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceFeature" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "habilitado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "WorkspaceFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'STARTER',
    "estado" "SubscriptionEstado" NOT NULL DEFAULT 'TRIAL',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellidos" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "nacionalidad" TEXT,
    "numeroDocumento" TEXT,
    "idioma" TEXT DEFAULT 'es',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expediente" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "referencia" TEXT NOT NULL,
    "tipo" "TipoTramite" NOT NULL,
    "estado" "ExpedienteEstado" NOT NULL DEFAULT 'BORRADOR',
    "asignadoAId" TEXT,
    "notas" TEXT,
    "fechaPresentacion" TIMESTAMP(3),
    "fechaLimite" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expediente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Documento" (
    "id" TEXT NOT NULL,
    "expedienteId" TEXT NOT NULL,
    "tipo" "DocumentoTipo" NOT NULL,
    "estado" "DocumentoEstado" NOT NULL DEFAULT 'PENDIENTE',
    "nombreArchivo" TEXT,
    "storagePath" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "uploadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Documento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Extraction" (
    "id" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "tipoDetectado" TEXT NOT NULL,
    "confianzaGlobal" DOUBLE PRECISION NOT NULL,
    "legibilidad" TEXT NOT NULL,
    "datos" JSONB NOT NULL,
    "alertas" TEXT[],
    "modelo" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Extraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Formulario" (
    "id" TEXT NOT NULL,
    "expedienteId" TEXT NOT NULL,
    "tipo" "FormularioTipo" NOT NULL,
    "pdfPath" TEXT,
    "datos" JSONB NOT NULL,
    "generadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Formulario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpedienteEvento" (
    "id" TEXT NOT NULL,
    "expedienteId" TEXT NOT NULL,
    "tipo" "EventoTipo" NOT NULL,
    "descripcion" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpedienteEvento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Factura" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "expedienteId" TEXT,
    "numero" TEXT NOT NULL,
    "clienteNombre" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "baseImponible" DECIMAL(10,2) NOT NULL,
    "iva" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "estado" "FacturaEstado" NOT NULL DEFAULT 'BORRADOR',
    "origen" TEXT NOT NULL DEFAULT 'MANUAL',
    "momento" TEXT,
    "metodoPago" TEXT,
    "fechaEmision" TIMESTAMP(3),
    "fechaVencimiento" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Factura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Membership_workspaceId_idx" ON "Membership"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_workspaceId_key" ON "Membership"("userId", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceFeature_workspaceId_feature_key" ON "WorkspaceFeature"("workspaceId", "feature");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_workspaceId_key" ON "Subscription"("workspaceId");

-- CreateIndex
CREATE INDEX "Cliente_workspaceId_idx" ON "Cliente"("workspaceId");

-- CreateIndex
CREATE INDEX "Expediente_workspaceId_estado_idx" ON "Expediente"("workspaceId", "estado");

-- CreateIndex
CREATE INDEX "Expediente_clienteId_idx" ON "Expediente"("clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "Expediente_workspaceId_referencia_key" ON "Expediente"("workspaceId", "referencia");

-- CreateIndex
CREATE INDEX "Documento_expedienteId_idx" ON "Documento"("expedienteId");

-- CreateIndex
CREATE UNIQUE INDEX "Extraction_documentoId_key" ON "Extraction"("documentoId");

-- CreateIndex
CREATE INDEX "Formulario_expedienteId_idx" ON "Formulario"("expedienteId");

-- CreateIndex
CREATE INDEX "ExpedienteEvento_expedienteId_idx" ON "ExpedienteEvento"("expedienteId");

-- CreateIndex
CREATE INDEX "Factura_workspaceId_estado_idx" ON "Factura"("workspaceId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "Factura_workspaceId_numero_key" ON "Factura"("workspaceId", "numero");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceFeature" ADD CONSTRAINT "WorkspaceFeature_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expediente" ADD CONSTRAINT "Expediente_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expediente" ADD CONSTRAINT "Expediente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expediente" ADD CONSTRAINT "Expediente_asignadoAId_fkey" FOREIGN KEY ("asignadoAId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_expedienteId_fkey" FOREIGN KEY ("expedienteId") REFERENCES "Expediente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Extraction" ADD CONSTRAINT "Extraction_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "Documento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Formulario" ADD CONSTRAINT "Formulario_expedienteId_fkey" FOREIGN KEY ("expedienteId") REFERENCES "Expediente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpedienteEvento" ADD CONSTRAINT "ExpedienteEvento_expedienteId_fkey" FOREIGN KEY ("expedienteId") REFERENCES "Expediente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpedienteEvento" ADD CONSTRAINT "ExpedienteEvento_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_expedienteId_fkey" FOREIGN KEY ("expedienteId") REFERENCES "Expediente"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- ───────────────────────── 2. ROW LEVEL SECURITY ─────────────────────────
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
create or replace function app_workspace_ids()
returns setof text
language sql stable
security definer set search_path = public
as $$
  select "workspaceId" from "Membership" where "userId" = auth.uid()::text
$$;

-- Activer RLS sur chaque table scopée tenant.
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


-- ───────────────────────── 3. ONBOARDING (auth → user, create_workspace) ─────────────────────────
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
-- Config par workspace : servicios (tarifas + docs) et avisos automáticos.
CREATE TABLE "ServicioConfig" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "descripcion" TEXT,
    "docs" TEXT[] DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "anticipo" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "resto" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServicioConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ServicioConfig_workspaceId_clave_key" ON "ServicioConfig"("workspaceId","clave");
CREATE INDEX "ServicioConfig_workspaceId_idx" ON "ServicioConfig"("workspaceId");
ALTER TABLE "ServicioConfig" ADD CONSTRAINT "ServicioConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AvisoConfig" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "evento" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "canal" TEXT NOT NULL DEFAULT 'whatsapp',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AvisoConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AvisoConfig_workspaceId_clave_key" ON "AvisoConfig"("workspaceId","clave");
CREATE INDEX "AvisoConfig_workspaceId_idx" ON "AvisoConfig"("workspaceId");
ALTER TABLE "AvisoConfig" ADD CONSTRAINT "AvisoConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS (Supabase l'active par défaut : sans policy, table invisible).
ALTER TABLE "ServicioConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AvisoConfig" ENABLE ROW LEVEL SECURITY;
CREATE POLICY svc_tenant ON "ServicioConfig"
  FOR ALL USING ("workspaceId" IN (SELECT app_workspace_ids()));
CREATE POLICY avi_tenant ON "AvisoConfig"
  FOR ALL USING ("workspaceId" IN (SELECT app_workspace_ids()));
-- Comptes bancaires du despacho (un seul actif par workspace).
CREATE TABLE "CuentaBancaria" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "titular" TEXT NOT NULL,
    "iban" TEXT NOT NULL,
    "banco" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CuentaBancaria_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CuentaBancaria_workspaceId_idx" ON "CuentaBancaria"("workspaceId");
-- Garde-fou : impossible d'avoir deux comptes actifs dans le même workspace.
CREATE UNIQUE INDEX "CuentaBancaria_ws_activa_key" ON "CuentaBancaria"("workspaceId") WHERE "activa";
ALTER TABLE "CuentaBancaria" ADD CONSTRAINT "CuentaBancaria_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CuentaBancaria" ENABLE ROW LEVEL SECURITY;
CREATE POLICY cta_tenant ON "CuentaBancaria"
  FOR ALL USING ("workspaceId" IN (SELECT app_workspace_ids()));
-- Lien portail client : token unique par expediente.
ALTER TABLE "Expediente" ADD COLUMN "portalToken" TEXT;
CREATE UNIQUE INDEX "Expediente_portalToken_key" ON "Expediente"("portalToken") WHERE "portalToken" IS NOT NULL;

-- ───────────────────────── MIGRATION 2026-06-12 : facturation Stripe ─────────────────────────
-- L'essai gratuit a désormais une vraie échéance : create_workspace pose trialEndsAt = J+14.
-- (Les colonnes stripeCustomerId / stripeSubscriptionId / trialEndsAt / currentPeriodEnd
--  existaient déjà dans le schéma initial — seul ce remplacement de fonction est nécessaire.)
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

  insert into public."Subscription" (id, "workspaceId", plan, estado, "trialEndsAt", "createdAt")
  values (gen_random_uuid()::text, v_ws, 'STARTER', 'TRIAL', now() + interval '14 days', now());

  return v_ws;
end;
$$;

-- ───────────────────────── MIGRATION 2026-06-13 : ficha del solicitante ─────────────────────────
-- Le client remplit ces données dans le portail ; les formulaires (EX/790) les lisent.
ALTER TABLE "Cliente"
  ADD COLUMN IF NOT EXISTS "sexo" TEXT,
  ADD COLUMN IF NOT EXISTS "fechaNacimiento" TEXT,
  ADD COLUMN IF NOT EXISTS "lugarNacimiento" TEXT,
  ADD COLUMN IF NOT EXISTS "paisNacimiento" TEXT,
  ADD COLUMN IF NOT EXISTS "estadoCivil" TEXT,
  ADD COLUMN IF NOT EXISTS "via" TEXT,
  ADD COLUMN IF NOT EXISTS "numeroVia" TEXT,
  ADD COLUMN IF NOT EXISTS "piso" TEXT,
  ADD COLUMN IF NOT EXISTS "codigoPostal" TEXT,
  ADD COLUMN IF NOT EXISTS "provincia" TEXT,
  ADD COLUMN IF NOT EXISTS "municipio" TEXT,
  ADD COLUMN IF NOT EXISTS "nombrePadre" TEXT,
  ADD COLUMN IF NOT EXISTS "nombreMadre" TEXT;

-- ───────────────────────── MIGRATION 2026-06-13 : durcissement RLS (RBAC) ─────────────────────────
-- Avant : policies `for all using (tenant)` → n'importe quel membre pouvait muter équipe/
-- abonnement/workspace/ajustes via l'API REST directe. Après : gouvernance en lecture seule
-- (écritures = service_role / SECURITY DEFINER), ajustes réservés aux admins (OWNER/ADMIN).

-- 1) Helper : l'utilisateur courant est-il admin du workspace ?
create or replace function public.app_is_admin(p_ws text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public."Membership"
    where "userId" = auth.uid()::text and "workspaceId" = p_ws and role in ('OWNER','ADMIN')
  );
$$;

-- 2) create_workspace prend le plan (plus aucun write Subscription côté client).
drop function if exists public.create_workspace(text, text);
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
    values (gen_random_uuid()::text, v_ws, coalesce(nullif(p_plan,''),'STARTER')::"Plan", 'TRIAL', now() + interval '14 days', now());
  return v_ws;
end; $$;
grant execute on function public.create_workspace(text, text, text) to authenticated;

-- 3) Gouvernance → LECTURE SEULE côté client.
drop policy if exists ws_member  on public."Workspace";
create policy ws_member  on public."Workspace"        for select using (id in (select app_workspace_ids()));
drop policy if exists mem_tenant on public."Membership";
create policy mem_tenant on public."Membership"       for select using ("workspaceId" in (select app_workspace_ids()));
drop policy if exists sub_tenant on public."Subscription";
create policy sub_tenant on public."Subscription"     for select using ("workspaceId" in (select app_workspace_ids()));
drop policy if exists wf_tenant  on public."WorkspaceFeature";
create policy wf_tenant  on public."WorkspaceFeature" for select using ("workspaceId" in (select app_workspace_ids()));

-- 4) Ajustes → lecture pour les membres, écriture pour les admins (OWNER/ADMIN).
drop policy if exists svc_tenant on public."ServicioConfig";
create policy svc_read  on public."ServicioConfig" for select using ("workspaceId" in (select app_workspace_ids()));
create policy svc_write on public."ServicioConfig" for all using (app_is_admin("workspaceId")) with check (app_is_admin("workspaceId"));
drop policy if exists avi_tenant on public."AvisoConfig";
create policy avi_read  on public."AvisoConfig" for select using ("workspaceId" in (select app_workspace_ids()));
create policy avi_write on public."AvisoConfig" for all using (app_is_admin("workspaceId")) with check (app_is_admin("workspaceId"));
drop policy if exists cta_tenant on public."CuentaBancaria";
create policy cta_read  on public."CuentaBancaria" for select using ("workspaceId" in (select app_workspace_ids()));
create policy cta_write on public."CuentaBancaria" for all using (app_is_admin("workspaceId")) with check (app_is_admin("workspaceId"));

-- ── Lot feedback 2 (2026-06-15) ──────────────────────────────────────────────
-- Résiliation programmée (fin de période) + NIF du despacho (onboarding complet).
alter table public."Subscription" add column if not exists "cancelAtPeriodEnd" boolean not null default false;
alter table public."Workspace"   add column if not exists "nif" text;
