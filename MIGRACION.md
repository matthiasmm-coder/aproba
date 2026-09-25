# Procédure de migration — standard Aproba

À suivre pour **toute migration faite par nous** (offre Despegue). Elle est critique : on écrit
dans la base d'un cabinet réel, avec les données personnelles de ses clients.

Née de la migration de Luis (Asenjo, 24-25/09/2026) : un listado de factures au lieu d'une
cartera, des contournements à la main, des défauts du moteur découverts en production. Tout ce
qui a été appris est ici, et les outils sont dans [`scripts/migracion/`](scripts/migracion/),
tous testés sur le cabinet de test « Gestoría de Carmen ».

---

## Les 8 règles non négociables

1. **Pas un fichier avant le DPA signé.** Pas de données personnelles sans contrat de sous-traitance (RGPD).
2. **Écrire dans le compte d'un client = ordre explicite de Matthias**, pour ce client et ce jour-là. Tout le reste se fait en lecture seule.
3. **Jamais d'argent hors facture.** Les colonnes de suivi interne des encaissements (« OBSERVACIONES », « FALTA », « B », espèces, « a cuenta ») ne s'importent pas, même en partie. `perfilar.py` les signale et on ne les mappe jamais, pas même vers « notas ».
4. **L'échantillon est validé avant le reste** : 15 à 20 lignes représentatives, revues en visio avec le client.
5. **Rien sans simulation** : on lance `ejecutar.ts` à blanc, on lit chaque avis et on explique chaque chiffre.
6. **Une photo avant et une photo après.** `ejecutar.ts` les prend. Sans elles, impossible de vérifier ni d'annuler.
7. **On écrit « cuadra con tu Excel » seulement si `verificar.ts` le montre** : totaux de contrôle du fichier = totaux dans Aproba, et chaque écart expliqué.
8. **Ce que voit le client est vrai** : les captures sont prises sur ses données réelles, et on n'annonce que ce qui est en production.

## Vue d'ensemble

| Phase | Quoi | Outil | Porte (on ne passe pas sans) |
|---|---|---|---|
| 0 | Préalables | — | DPA et devis signés, compte créé, catalogue prêt |
| 1 | Cadrage (appel de 30 min) | modèle B | le client a validé par écrit ce qui sera importé et ce qui ne le sera pas |
| 2 | Collecte | modèle A | fichiers reçus et rangés hors dépôt |
| 3 | Profil | `perfilar.py` | colonnes comprises, colonnes sensibles écartées, totaux de contrôle notés |
| 4 | Préparation | adaptateur + mapping | `entrada.json` relu, exclusions documentées |
| 5 | Simulation | `ejecutar.ts` à blanc | aucune surprise dans les chiffres ni dans les avis |
| 6 | Échantillon | `ejecutar.ts` sur 15-20 lignes | validé en visio par le client |
| 7 | Import complet | `ejecutar.ts` + `MIGRA_CONFIRMAR` | photos et journal enregistrés |
| 8 | Vérification | `verificar.ts` + écrans | tout ✓, ou chaque écart expliqué |
| 9 | Livraison | modèle C + captures | mail envoyé, rappel à J+2 prévu |
| 10 | Clôture | mémoire, rangement | fichiers source supprimés à J+30 |

Tous les scripts TypeScript se lancent depuis `web/` avec `scripts/migracion/correr.sh <script>`.
Ce lanceur charge `.env.local` et fait tourner la **vraie** route d'import hors de Next.

---

## Phase 0 — Préalables

- **Contrat** : le DPA est signé par les deux parties (générateur : `documentos-cliente/generar_dpa_cliente.py`) et le devis Despegue est accepté.
- **Compte** : le cabinet existe et ses sedes sont créées. Un import met tout le fichier dans **une** sede : on fait donc un fichier par sede.
- **Catalogue prêt** : chaque trámite du fichier doit correspondre à un service. On crée les services manquants **avant** l'import, avec l'accord du client, car ils apparaîtront dans son catalogue et son portail. Prix et documents sont à compléter par lui.
- **Série de factures** : dans Ajustes › Facturación, régler « la serie continúa desde el nº X » pour que ses prochaines factures suivent sa numérotation.
- **Identifiants** : `MIGRA_WS` (l'id du cabinet) et `MIGRA_USER` (un admin du cabinet, responsable des dossiers en cours importés).

## Phase 1 — Cadrage avec le client (appel de 30 min, compte rendu écrit)

1. **D'où viennent ses données ?** Excel maison, logiciel (lequel ?), dossiers Drive, OneDrive ou HiDrive.
2. **Que veut-il retrouver dans Aproba ?** Clients, familles, entreprises et leurs salariés, dossiers **en cours** avec leur état, historique des services, renouvellements (dates d'expiration), facturation d'avant (montant et encaissement), factures reçues.
3. **Qu'est-ce qui est en cours aujourd'hui, et où cela est-il écrit ?**
   - Sans colonne d'état, tout part en historique.
   - C'est le malentendu de Luis : « je vois les clients mais pas les dossiers ». Son fichier était une liste de factures.

On envoie ensuite le **modèle B** (« Qué se importa y qué no ») et on attend un « OK » écrit.

**Ce qu'Aproba n'importe pas** (à dire dès le cadrage) :
- les documents et PDF des dossiers ;
- les emails ;
- l'historique interne de chaque dossier ;
- les notes internes d'encaissement ;
- les mots de passe et les accès aux administrations.

## Phase 2 — Collecte

- On envoie le **modèle A** (« Qué necesitamos »), avec en pièce jointe la plantilla `documentos-cliente/Plantilla-migracion-Aproba.xlsx` s'il part de zéro.
- **Rangement**, hors du dépôt git et jamais commité : `~/aproba/documentos-cliente/<cliente>/migracion/`
  - `origen/` : les fichiers reçus, **jamais modifiés** ;
  - `trabajo/` : profil, `control.json`, adaptateur, `entrada.json` ;
  - `salida/` : photos et journaux d'exécution.

## Phase 3 — Profil (lecture seule)

```bash
python3 scripts/migracion/perfilar.py origen/<fichier>.xlsx --salida trabajo/perfil.md --control trabajo/control.json
```

Options : `--hoja` pour choisir une feuille, `--cabecera N` si l'en-tête n'est pas trouvé tout seul.

À lire dans `perfil.md` :
- **Colonnes sensibles** : elles sont exclues d'office (règle 3).
- **La même personne sur plusieurs lignes** : c'est un listado de factures, et c'est normal. Le moteur crée la personne une seule fois, et chaque ligne reste un service.
- **Homonymes, et documents qui diffèrent d'un seul caractère** : on décide à la main s'il s'agit d'une personne ou de deux, et on note la décision.
  - Exemple chez Luis : PAPIS TECKAGNE, Z2850008S et Z2850009S.
- **CIF valides** : ce sont des entreprises. Une ligne avec un CIF mais sans personne est une facture à l'entreprise (consulta, informe).
- **Paiements fractionnés** (« Primer pago (1-2) ») : le moteur les regroupe tout seul.
- **Totaux de contrôle** : dans `control.json`, on corrige les exclusions décidées et on les justifie dans une clé `_nota`.
  - Exemple chez Luis : la ligne « PTE. HACER », une facture pas encore émise.

## Phase 4 — Préparation de `entrada.json`

Format : `{ cabecera, filas, mapeo }`, voir `Mapeo` dans `lib/importar.ts`.

**Cas 1 — le client a rempli la plantilla.**
- L'écran « Importar datos » propose un mapping par l'IA, que le client peut appliquer lui-même.
- Pour un Despegue, on écrit le mapping à la main dans le JSON : une colonne correspond à un champ.

**Cas 2 — un export maison (Luis).**
- On écrit un petit adaptateur **par client** dans `trabajo/`. Il lit l'original et écrit `entrada.json` au format de la plantilla.
- Il ne touche jamais aux colonnes sensibles.

**Règles de mapping** (apprises sur Luis) :
- **Une ligne = un service (une facture).** On ne dédoublonne pas à la main : le moteur reconnaît la personne.
- **Nom** : on mappe vers `nombreCompleto`. L'adaptateur nettoie les ajouts comme « (DAMIAN A. GRAFF) » ou « e hija ».
- **Entreprise** : `empresa` = celle qui paie.
  - Ligne avec entreprise **et** personne : le salarié est titulaire et l'entreprise paie.
  - Ligne avec entreprise **sans** personne : la facture va dans la fiche de l'entreprise.
  - On ne tire un salarié du libellé que si le prénom et le nom sont sûrs.
- **CIF ou passeport ?** On valide le chiffre de contrôle (`perfilar.py` le fait) : un regex seul attrape aussi des passeports.
- **Trámite** : le texte d'origine (le libellé de la facture) va dans `tramite`.
  - Chaque valeur est rattachée à un service du catalogue.
  - Une valeur « sin mapear » crée le client, mais pas le service.
  - Le moteur conserve le libellé d'origine quand il dit plus que le service (« CUENTA AJENA – BAKARY MANNEH »).
- **Date** de facture ou de résolution : `fechaResolucion`.
- **Référence** = n° de facture : `referencia`. C'est la clé d'idempotence : réimporter ne crée pas de doublon.
- **Importe** (TTC) et **Estado del cobro** (Cobrada ou Pendiente) : jamais les montants « a cuenta » ni « falta ».
- **Dossiers en cours** : seulement si le client fournit leur état, avec `crearEnCurso`.
- **Renouvellements** :
  - `validezMeses[trámite] = null` quand la ligne est une facture et non une résolution (Luis : tout à null, car une facture ne prouve pas une carte) ;
  - une vraie date d'expiration va dans `fechaCaducidad` (REAL).

## Phase 5 — Simulation (rien n'est écrit)

```bash
MIGRA_WS=… MIGRA_USER=… MIGRA_ARCHIVO=trabajo/entrada.json scripts/migracion/correr.sh scripts/migracion/ejecutar.ts
```

La simulation lit la base du cabinet et annonce :
- les personnes nouvelles, et celles déjà dans le cabinet (complétées, jamais écrasées) ;
- les cas douteux (homonymes) ;
- le nombre de services, et ceux déjà présents ;
- les entreprises, les dossiers en cours et les renouvellements ;
- les trámites sans service ;
- tous les avis, regroupés par type.

On corrige `entrada.json` jusqu'à ce que chaque chiffre s'explique.

## Phase 6 — Échantillon

- **Sélection** : 15 à 20 lignes, une de chaque cas.
  - un particulier et une famille ;
  - un salarié avec son entreprise, et une entreprise seule ;
  - une facture impayée et un paiement fractionné ;
  - un dossier en cours.
- **Import** : on les met dans `trabajo/entrada-muestra.json` et on lance la phase 7 dessus.
- **Visio avec le client**, sur son compte : Clientes, une fiche client, une fiche entreprise, Expedientes › Historial et Facturas › Cobros pendientes.
- **Ajustements**, puis import complet. Les mêmes lignes seront reconnues sans doublon, grâce aux références.

## Phase 7 — Import complet

```bash
MIGRA_WS=… MIGRA_USER=… MIGRA_ARCHIVO=trabajo/entrada.json \
MIGRA_CONFIRMAR=si MIGRA_DESPACHO="<nom EXACT du cabinet>" MIGRA_SALIDA=…/migracion/salida \
  scripts/migracion/correr.sh scripts/migracion/ejecutar.ts
```

- **Double clé** : `MIGRA_DESPACHO` doit être le nom exact du cabinet. Un id mal copié n'écrit donc jamais ailleurs.
- **Plus de 1 500 lignes** : le script passe tout seul en plusieurs passes. La même personne sur deux passes est reconnue.
- **Traçabilité** : photos avant et après, plus un journal, dans `salida/`.
- **Si une passe échoue**, tout s'arrête, et ce qui a été écrit figure dans la photo « après ». On corrige, puis on relance : l'import est idempotent.

## Phase 8 — Vérification

```bash
MIGRA_WS=… MIGRA_CONTROL=trabajo/control.json scripts/migracion/correr.sh scripts/migracion/verificar.ts
```

**Ce que le script vérifie** :
- les factures, le montant total, les impayés en nombre et en euros, comparés aux totaux de contrôle ;
- les homonymes sans rien qui les distingue (doublons possibles) ;
- les services sans date, sans montant ou sans service du catalogue ;
- les fiches sans contact (c'est normal : le client les complète par son lien).

Chaque ✗ doit être expliqué avant d'écrire au client.

**Contrôle à l'écran** (Matthias connecté, ou page locale temporaire en lecture seule pour les captures) :
- **Clientes et Empresas** : le nombre de fiches.
- **Une fiche client** : son historique et ses montants.
- **Une fiche entreprise** : les cartes « Facturado », avant Aproba compris, et le bloc « Facturado antes de Aproba ».
- **Expedientes › Historial** : le compteur, et un service à « 2 pagos » s'il y en a.
- **Facturas › Cobros pendientes** : « Anteriores a Aproba » égale le total des impayés.
- **Facturas › Estadísticas**, si les factures sont importées, et **Renovaciones**.

## Phase 9 — Livraison

- **Mail (modèle C)** : en espagnol, au tutoiement, court. Il contient :
  - les chiffres ;
  - une capture par point ;
  - ce qui n'a pas été importé, et pourquoi ;
  - les prochaines étapes pour lui : compléter prix et documents des nouveaux services, et relire deux ou trois fiches.
- **Rappel à J+2** : un appel pour recueillir ses remarques. Chaque remarque devient une correction, jamais un contournement.

## Phase 10 — Clôture

- **Mémoire** : noter dans la fiche mémoire du client ce qui a été importé, les chiffres, les décisions et les exclusions.
- **Fichiers source** : supprimer `origen/` 30 jours après la validation du client (minimisation RGPD ; délai à confirmer avec le DPA).
- **Photos et journaux** : on les garde. Ils ne contiennent que des identifiants.

---

## Retour arrière (dernier recours)

```bash
MIGRA_WS=… MIGRA_ANTES=salida/foto-antes-….json MIGRA_DESPUES=salida/foto-despues-….json \
  scripts/migracion/correr.sh scripts/migracion/deshacer.ts
```

- **Par défaut, le script liste seulement.** Pour supprimer, il faut l'ordre de Matthias, `MIGRA_CONFIRMAR=borrar` et `MIGRA_DESPACHO="<nom exact>"`.
- **Il supprime** ce qui a été **créé** entre les deux photos, rien d'autre.
- **Il laisse** toute fiche qui a déjà une vie propre dans Aproba (factures, nouveaux dossiers, documents).
- **Il ne défait pas** ce que l'import a complété dans des fiches existantes. Ce sont seulement des cases vides remplies.
- **Contrôle** : après l'annulation, prendre une photo (`foto.ts`) et la comparer à celle d'avant. Sur Carmen, les 6 tables redeviennent identiques.

## Ce que fait le moteur (`/api/importar/ejecutar`)

**Personnes** (`lib/importar-personas.ts`) :
- Un même NIE/DNI ou passeport, c'est la même personne.
- Un même nom et prénoms, sans rien qui se contredise, aussi, mais seulement si **aucun homonyme** n'existe (sinon on n'essaie pas de deviner : fiche à part et avis).
- L'email seul ne suffit jamais, car une famille partage souvent celui du titulaire.
- La personne est créée ou complétée **une fois**, avec tout ce qu'apportent ses lignes. Elle n'est jamais écrasée : la fiche entière est lue, sur toutes les pages.

**Historique** :
- **Une ligne = un service.**
- On reconnaît un service déjà importé par sa référence, ou par titulaire + service + date quand il n'y a pas deux références différentes.
- Le libellé d'origine est conservé quand il dit plus que le service.

**Paiements** (`lib/historial-pagos.ts`) :
- Les factures « (1-2) / (2-2) » d'un même service sont reliées par `pagoDeId`.
- L'Historial les affiche sur une ligne ; la fiche entreprise les liste une par une.

**Entreprises** :
- Création idempotente, rattachée à la raison sociale.
- Le salarié est titulaire du service, l'entreprise celle qui paie.
- Une facture sans personne va dans la fiche de l'entreprise.

**Encaissements d'avant** :
- `cobro` Cobrada ou Pendiente, visible dans Facturas › Cobros pendientes › « Anteriores a Aproba ».
- Aucune facture Aproba n'est créée.

**Renouvellements** :
- Un seul par personne : la date la plus récente, la date réelle l'emportant sur l'estimée.
- Une date déjà saisie dans une fiche n'est jamais écrasée.

**Quota** : l'import ne consomme jamais de dossiers (`UsoMensual`).

**Après toute modification du moteur** :

```bash
MIGRA_WS=db135ffb-e0b8-442c-b654-795ede089185 MIGRA_USER=35cb55c3-14f2-45d7-95fc-4206161f5d5d \
  scripts/migracion/correr.sh scripts/migracion/e2e-motor.ts
```

Cette commande teste la vraie route sur « Gestoría de Carmen » en 25 vérifications, puis efface tout ce qu'elle a créé.

---

## Annexes — modèles de messages (espagnol, tutoiement)

### A. « Qué necesitamos » (après le cadrage)

> Hola {nombre}:
>
> Para migrar tu despacho a Aproba necesitamos, en Excel o CSV (lo que tengas, no hace falta rehacerlo):
> 1. Tus clientes, con NIE/DNI o pasaporte y, si los tienes, email y teléfono.
> 2. Los expedientes que tienes EN CURSO, con su estado (en preparación o presentado) y, si la hay, la fecha de presentación.
> 3. Las fechas de caducidad de las tarjetas de tus clientes, para avisarte de las renovaciones.
> 4. Tu facturación: nº de factura, fecha, cliente, concepto, importe y si está cobrada.
>
> Si partes de cero, te adjunto nuestra plantilla. No incluyas anotaciones internas de cobros: no se importan.
>
> Un saludo,
> Matthias

### B. « Qué se importa y qué no » (à valider par écrit)

> Hola {nombre}:
>
> Con lo que me has enviado, esto es lo que tendrás en Aproba:
> - {N} clientes (y {M} empresas con sus trabajadores).
> - Tus servicios de {periodo} en Expedientes › Historial, con su nº de factura, su importe y si están cobrados.
> - Las facturas pendientes en Facturas › Cobros pendientes.
> - {Si procede: tus {K} expedientes en curso en el tablero / las renovaciones de {R} clientes.}
>
> No se importan los documentos de los expedientes ni las notas internas. Si algo de esto no es lo que esperas, dímelo antes de empezar.
>
> ¿Me confirmas que seguimos así?

### C. Livraison (avec une capture par point)

> Hola {nombre}:
>
> Tu migración está hecha (te adjunto una captura de cada punto):
> 1. {N} clientes y {M} empresas en Clientes.
> 2. Tus servicios en Expedientes › Historial, marcados «Anterior a Aproba».
> 3. {P} facturas pendientes ({importe}) en Facturas › Cobros pendientes.
>
> Cuadra con tu Excel: {n} facturas y {total}{, salvo …}.
> Te queda: poner precio y documentos a los servicios nuevos ({lista}).
>
> Un saludo,
> Matthias
