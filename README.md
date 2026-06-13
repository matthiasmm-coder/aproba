# Aproba — Web

App Next.js 15 (App Router) du produit Aproba. **Build vérifié, tourne en local.**

## Lancer

```bash
cd /Users/matthiasadmin/aproba/web
npm install        # déjà fait
npm run dev        # → http://localhost:3000
```

Pages :
- `/` — landing (marketing)
- `/login` — connexion
- `/app` — board des expedientes (kanban)
- `/app/expedientes/[id]` — détail + **extraction IA des documents** (ex. `/app/expedientes/exp-0042`)
- `/app/clientes`, `/app/facturas`, `/app/ajustes`

## État actuel

| Couche | État |
|--------|------|
| UI / branding | ✅ réel (tokens Aproba, Geist, logo) |
| Données | 🟡 **mock** (`lib/mock-data.ts`) — pas encore de DB |
| Auth | 🟡 maquette (le bouton « Entrar » va direct au dashboard) |
| Schéma de données | ✅ `prisma/schema.prisma` (canonique, multi-tenant) |
| RLS multi-tenant | ✅ `prisma/rls.sql` (à appliquer en migration Supabase) |

## Stack

Next.js 15 · React 19 · TypeScript · Tailwind 3 · Geist · (Prisma + Supabase à brancher).

## Prochaines étapes pour le rendre « vivant »

1. **Supabase** : créer le projet, coller `DATABASE_URL` dans `.env`, `npx prisma migrate dev`, appliquer `prisma/rls.sql`.
2. **Auth** : Supabase Auth (magic link + Google) → remplacer la maquette `/login`.
3. **Remplacer les mocks** : les pages lisent `lib/mock-data.ts` → basculer sur des requêtes Prisma scopées au workspace.
4. **Brancher le module IA** : le POC `../poc-vision` devient une route serveur (upload doc → extraction → `Extraction` en base).
5. **Storage** : Supabase Storage pour les documents uploadés.
