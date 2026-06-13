# Déploiement d'Aproba en production

Guide pas-à-pas pour mettre `aproba-software.com` en ligne sur **Vercel**, avec
Supabase (déjà hébergé), Stripe (passage en live) et Resend (déjà prod).

> Légende : 🤖 = fait/préparé côté code · 👤 = action manuelle (ton compte/tes accès)

---

## 0. Pré-requis (👤)

- Un compte **Vercel** (gratuit pour commencer) : https://vercel.com
- Un compte **GitHub** (recommandé) pour connecter le repo, OU le **Vercel CLI**.
- Accès au **dashboard Cloudflare** (DNS de aproba-software.com) — déjà utilisé pour Resend.
- Accès au **dashboard Stripe** du compte **Aproba** (pas AXIOM).
- Accès au **dashboard Supabase** (projet `qoaieiuscwpspbcxwolf`).

---

## 1. Mettre le code sur GitHub (👤, recommandé)

Le dossier `web/` n'est pas encore un repo git. Depuis `aproba/web` :

```bash
git init
git add -A
git commit -m "Aproba — version de lancement"
# crée un repo privé sur github.com puis :
git remote add origin git@github.com:TON-USER/aproba.git
git push -u origin main
```

`.gitignore` exclut déjà `.env`, `.env.local`, `node_modules`, `.next` — **aucun
secret ne part sur GitHub.** ✅ (vérifié)

> Alternative sans GitHub : `npm i -g vercel && vercel` depuis `aproba/web`
> (déploie le dossier local ; `vercel login` requis).

---

## 2. Créer le projet Vercel (👤)

1. Vercel → **Add New… → Project** → importe le repo `aproba`.
2. **Root Directory** : `web` (si le repo contient le dossier `web/`).
3. Framework : **Next.js** (détecté). Build/Output : valeurs par défaut.
4. **NE PAS déployer encore** : d'abord les variables d'environnement (étape 3).

---

## 3. Variables d'environnement Vercel (👤)

Project → **Settings → Environment Variables**. Ajoute, pour l'environnement
**Production** (modèle complet dans `.env.example`) :

| Variable | Valeur |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://qoaieiuscwpspbcxwolf.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (clé anon, publique) |
| `SUPABASE_SERVICE_ROLE_KEY` | (clé service_role — **secret**) |
| `NEXT_PUBLIC_APP_URL` | `https://aproba-software.com` |
| `ANTHROPIC_API_KEY` | `sk-ant-…` |
| `STRIPE_SECRET_KEY` | `sk_live_…` (voir étape 5) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` du endpoint prod (étape 5) |
| `RESEND_API_KEY` | `re_…` (clé `aproba-prod`) |
| `AVISOS_EMAIL_FROM` | `avisos@aproba-software.com` |

> Les valeurs réelles sont dans ton `.env.local` actuel (sauf Stripe live, à créer).
> Ne mets PAS `NEXT_PUBLIC_SHOW_DEMO_LOGIN` (l'encadré démo restera masqué en prod).

Lance ensuite le **premier déploiement**.

---

## 4. Domaine personnalisé (👤)

1. Vercel → Project → **Settings → Domains** → ajoute `aproba-software.com` (+ `www`).
2. Vercel affiche les enregistrements DNS à créer. Dans **Cloudflare** :
   - `A` `@` → `76.76.21.21` (ou le `CNAME`/IP indiqué par Vercel), **proxy désactivé** (nuage gris) au début.
   - `CNAME` `www` → `cname.vercel-dns.com`.
3. Attends la vérification Vercel (quelques minutes). HTTPS est automatique.

> Les enregistrements Resend (MX/TXT `send`, DKIM `resend._domainkey`, `_dmarc`)
> sont **déjà en place** et indépendants — ne pas y toucher.

---

## 5. Stripe : passage en LIVE (👤 + 🤖)

Aujourd'hui tout est en **test** (`sk_test_…`). Pour encaisser réellement :

1. **Activer le compte** (👤) : Stripe Dashboard (compte Aproba) → activer le compte
   = KYC (identité/société) + **IBAN** de versement. Obligatoire avant `sk_live`.
2. **Créer les produits/prix en live** (🤖 script prêt) : bascule la clé sur live et
   relance le script idempotent depuis `aproba/web` :
   ```bash
   STRIPE_SECRET_KEY=sk_live_… node scripts/stripe-setup.mjs
   ```
   → crée les 3 prix (`lookup_key` `aproba_{starter,pro,business}_mensual`) + le
   Customer Portal en live. Le code résout les prix **par lookup_key**, donc rien
   d'autre à changer.
3. **Webhook de production** (👤) : Stripe → **Developers → Webhooks → Add endpoint**
   - URL : `https://aproba-software.com/api/billing/webhook`
   - Événements : `customer.subscription.created`, `.updated`, `.deleted`
   - Copie le **Signing secret** (`whsec_…`) → variable `STRIPE_WEBHOOK_SECRET` sur Vercel.
   > En prod on n'utilise plus `stripe listen` (c'était le tunnel de dev).
4. Mets `STRIPE_SECRET_KEY=sk_live_…` sur Vercel et redéploie.

---

## 6. Supabase : autoriser le domaine de prod (👤)

Supabase → **Authentication → URL Configuration** :
- **Site URL** : `https://aproba-software.com`
- **Redirect URLs** : ajoute `https://aproba-software.com/**`

La base, le RLS, les buckets (`documentos` privé, `avatares`) et les migrations
sont **déjà en place** (région UE). Rien à recréer.

---

## 7. Resend (✅ déjà prod)

Domaine `aproba-software.com` **vérifié** (DKIM/SPF/DMARC OK), envoi réel testé.
Rien à faire — juste renseigner `RESEND_API_KEY` + `AVISOS_EMAIL_FROM` sur Vercel (étape 3).

---

## 8. Avant d'ouvrir au public — check-list (👤)

- [ ] **Pages légales** : compléter les `[...]` dans `lib/legal.ts` (raison sociale,
      NIF, domicilio, datos registrales). Les valeurs encore en placeholder
      s'affichent **surlignées en ambre** sur les pages `/legal/*`.
- [ ] Créer/rediriger les boîtes **hola@**, **privacidad@**, **legal@** aproba-software.com.
- [ ] **Faire relire les textes légaux par un juriste** (templates pro mais non validés).
- [ ] **Données de démo** : décider si on garde le workspace « Gestoría Vallès »
      (Julia, etc.) ou si on repart propre. L'encadré démo sur `/login` est déjà
      **masqué en prod** (réactivable via `NEXT_PUBLIC_SHOW_DEMO_LOGIN=1`).
- [ ] Réactiver (optionnel) la **vérification d'email** à l'inscription si souhaité.

---

## 9. Smoke-test post-déploiement (👤)

Sur `https://aproba-software.com` :
1. `/` charge, footer → pages `/legal/*` OK.
2. `/signup` → crée un compte test → onboarding (choix du plan) → `/app`.
3. Ajustes → **Activar suscripción** → Checkout Stripe **live** (utilise une vraie
   carte ou annule). Vérifie que le webhook passe (Stripe → Webhooks → Logs = 200).
4. Crée un expediente → ouvre le lien portail `/j/[token]` → upload un document →
   email reçu depuis `avisos@aproba-software.com`.
5. Supprime le compte/expediente de test.

---

### Récap de l'état

| Brique | État |
|---|---|
| Code (build, RLS, légal, URLs prod) | 🤖 prêt |
| Supabase (base/RLS/storage, UE) | ✅ en place — ajouter Site URL prod |
| Resend (emails) | ✅ prod |
| Vercel (hébergement) | 👤 à créer + env vars |
| Domaine (Cloudflare → Vercel) | 👤 DNS à pointer |
| Stripe (live) | 👤 KYC+IBAN, puis 🤖 script + webhook |
| Textes légaux | 👤 compléter `[...]` + relecture juriste |
