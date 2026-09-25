# Kit de migration

La procédure complète, avec ses règles et ses portes, est dans [`MIGRACION.md`](../../MIGRACION.md). Les scripts TypeScript se lancent depuis `web/` avec `scripts/migracion/correr.sh <script>`, qui charge les clés de `.env.local` et fait tourner la vraie route d'import hors de Next.

| Script | Phase | Rôle | Écrit ? |
|---|---|---|---|
| `perfilar.py` | 3 | Profil du fichier du client : colonnes, personnes, entreprises, colonnes sensibles, totaux de contrôle | non |
| `ejecutar.ts` | 5 · 7 | À blanc par défaut. Avec `MIGRA_CONFIRMAR=si` et le nom exact du cabinet : import en passes, photos avant et après, journal | uniquement avec la double clé |
| `foto.ts` | 7 | Ids de tout ce qu'une migration peut créer | non (écrit un JSON local) |
| `verificar.ts` | 8 | Rapproche Aproba des totaux de contrôle et cherche les anomalies | non |
| `deshacer.ts` | — | Liste ce qui a été créé entre deux photos, et le supprime seulement avec la double clé | uniquement avec la double clé |
| `e2e-motor.ts` | — | Teste le moteur de bout en bout sur « Gestoría de Carmen » (25 vérifications, puis nettoyage) | test uniquement |

Les fichiers du client ne vont **jamais** dans ce dépôt. On les range dans `~/aproba/documentos-cliente/<cliente>/migracion/` (`origen/`, `trabajo/`, `salida/`).
