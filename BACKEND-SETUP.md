# Aproba — Connexion du backend Supabase

Runbook pour passer des données mockées (localStorage) à un vrai backend.
Architecture : **Supabase Auth + Postgres (RLS)** ; requêtes via `@supabase/ssr`
(respectent le RLS) ; **Prisma** uniquement pour créer le schéma.

## Ce dont j'ai besoin de toi (étape bloquante)

1. **Crée un projet Supabase** sur https://supabase.com → *New project*.
   - Région : **EU (Frankfurt `eu-central-1` ou Paris `eu-west-3`)** — RGPD, données sensibles (extranjería).
   - Note bien le **mot de passe de la base** affiché à la création.
2. **Récupère 4 valeurs** et envoie-les moi (je les mets dans `.env.local` / `.env`, gitignorés) :
   - `Project Settings → API` →
     - **Project URL** (`https://xxxx.supabase.co`)
     - **anon public** key
     - **service_role** key (secret)
   - `Project Settings → Database → Connection string → URI` →
     - **DATABASE_URL** (connexion directe/session, port 5432)

> Les deux premières sont publiques par nature. La `service_role` et `DATABASE_URL`
> sont sensibles : elles restent côté serveur, jamais dans le bundle client.

## Ce que je fais ensuite (automatisé)

3. Écrire `.env.local` (clés Supabase) + `.env` (DATABASE_URL).
4. Créer le schéma : `npx prisma db push` (génère toutes les tables depuis `prisma/schema.prisma`).
5. Appliquer la sécurité dans **SQL Editor** :
   - `prisma/rls.sql` (isolation multi-tenant)
   - `supabase/onboarding.sql` (miroir Auth→User + `create_workspace`)
6. **Auth** : activer Email (magic link / mot de passe), régler les *Redirect URLs*
   (`http://localhost:3210/**` + le domaine prod).
7. **Storage** : bucket privé `documentos` (upload des pièces clients), policies RLS par workspace.
8. **Seed** : recréer la gestoría de démo (Gestoría Vallès) + quelques expedientes.
9. **Câblage progressif** (sans casser la démo) :
   - `lib/servicios.ts`, `lib/avisos.ts` : localStorage → table `WorkspaceFeature`/config.
   - `expedientes`, `clientes`, `facturas` : mock → requêtes Supabase RLS.
   - login/signup réels → onboarding (`create_workspace`).

## État actuel (déjà posé)

- ✅ `.gitignore` (protège `.env*`)
- ✅ `lib/supabase/{client,server,admin}.ts`
- ✅ `.env.example`
- ✅ `supabase/onboarding.sql` (brouillon)
- ✅ `prisma/schema.prisma` + `prisma/rls.sql`
- ⏳ Migration, auth, câblage des données → après réception des clés
