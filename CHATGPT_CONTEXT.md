## Projet : Gestion Passage Cluedo LCDB

## Utilisation avec ChatGPT
- À coller en début de chaque nouvelle conversation
- Ne pas modifier sans décision technique claire

---

## 1. Objectif du projet
Outil de gestion de files d’attente pour des interactions physiques entre des **équipes de joueurs** et des **personnages**, utilisé en environnement terrain (jeux, colos, événements).

Le système garantit :
- une interaction équitable
- non contournable
- compréhensible pour tous les acteurs

---

## 2. Acteurs du système

### Équipes (côté joueurs)
- Une équipe correspond à **un scan de QR code**
- L’équipe saisit un **nom d’équipe** (libellé utilisateur)
- Le nom d’équipe :
  - est purement déclaratif
  - peut être erroné
  - **doit pouvoir être corrigé**
  - **ne sert jamais d’identifiant**
- Une équipe ne peut être présente que dans **une seule file à la fois**

### Personnages (animateurs)
- Un personnage correspond à :
  - une personne physique
  - une file d’attente unique
- Le **nom du personnage est défini exclusivement dans `cluedo/admin.html`**
- Le nom du personnage :
  - est fixe pendant la session
  - **ne doit jamais être saisi ou modifié côté play**

### Administrateurs
- Créent et nomment les personnages
- Ajustent :
  - durée d’interaction
  - temps tampon
- Ont une vision globale des files

---

## 3. Principe fondamental (règle non négociable)
> **Une seule équipe peut interagir avec un personnage à la fois.**

Cette règle est garantie **exclusivement côté serveur**.

Le serveur est l’unique source de vérité pour :
- les files
- les positions
- les durées
- les autorisations de passage

---

## 4. Modèle conceptuel

### Personnage
- id
- nom (défini dans admin.html)
- paramètres de durée
- file d’attente FIFO

### Équipe
- id interne (stable)
- nom (modifiable)
- session / token

### Entrée de file
- lie une équipe à un personnage
- conserve :
  - position
  - heure d’entrée
  - état (`waiting` / `active`)

⚠️ L’identité d’une équipe repose sur son **id / token**, jamais sur son nom.

---

## 5. Flux utilisateur

1. Scan d’un QR code → sélection implicite du personnage
2. Saisie du nom d’équipe (une seule fois)
3. Entrée dans la file du personnage
4. Affichage :
   - personnage à rencontrer
   - nom de l’équipe
   - position
   - temps estimé
   - équipe précédente
5. Possibilité de corriger le nom d’équipe **sans quitter la file**
6. Passage avec le personnage
7. Sortie de la file

---

## 6. Architecture technique

- Frontend : HTML + JavaScript vanilla
- Backend : PHP
- Stockage : fichiers JSON
- Hébergement : mutualisé (PlanetHoster)

Aucune base de données.  
Aucun framework.  
Aucune surcouche inutile.

---

## 7. Contraintes explicites

Le projet doit éviter absolument :
- Frameworks frontend (React, Vue, etc.)
- Bases de données
- WebSockets
- Refactorisation lourde

Priorités :
- robustesse terrain
- clarté fonctionnelle
- maintenance simple

---

## 8. Philosophie générale

- Logique serveur forte
- Client simple et passif
- Règles explicites
- Aucun comportement implicite

Toute évolution doit respecter ces principes.

---

## 9. API contract

### `GET /api/status.php`

**Entrée**
- `id` (personnage)
- `token` (identifiant stable d’équipe)
- `team_name` (optionnel, utilisé uniquement pour initialiser le nom à la première entrée)

**Distinction métier obligatoire (initialisation vs modification)**
- **Initialisation** : lors de la première saisie (état UI `need_name`), le front doit appeler
  `status.php` avec `team_name` pour créer/initialiser l’entrée de file avec ce nom.
- **Modification** : `rename_team.php` ne doit être utilisé que pour corriger le nom d’une
  équipe déjà présente dans la file (action utilisateur `Modifier`).
- La première saisie ne doit jamais passer par `rename_team.php`, sinon l’API peut refuser
  légitimement (équipe non encore initialisée) et afficher une erreur inutile.

**Sortie contractuelle à consommer côté front**
- `state`: `need_name` | `waiting` | `active`
- `legacy_state`: `waiting` | `done` (compatibilité rétroactive)
- `personnage`: `{ id, nom }`
- `equipe`: `{ id, nom }`
- `file`: `{ position, total, equipe_precedente, temps_attente_estime_seconds }`
- `timers`: `{ active_remaining_before_takeover_seconds, courtesy_remaining_seconds, time_per_player_seconds, buffer_before_next_seconds }`

**Exemple JSON réel**
```json
{
  "state": "waiting",
  "personnage": { "id": "1", "nom": "Juju" },
  "equipe": { "id": "7b81a767-2304-42d3-9763-6c00304ae83c", "nom": "Les Defifou" },
  "file": {
    "position": 1,
    "total": 2,
    "equipe_precedente": "Equipe sans nom",
    "temps_attente_estime_seconds": 97
  }
}
```

### `POST /api/rename_team.php`

**Entrée**
- `id` (personnage)
- `team_id` (ou `token`) : identifiant stable de l’équipe
- `nouveau_nom`

**Sortie**
- `ok`
- `equipe`: `{ id, nom }`
- `file`: `{ position, total }`

**Contraintes métier**
- réservé à la **modification** d’une équipe déjà initialisée dans la file
- aucune recréation d’entrée de file
- aucune duplication d’équipe
- position inchangée

### Règles métier verrouillées (need_name / timer / visibilité)

- Une équipe en état `need_name` (nom absent/invalide) :
  - **n’occupe pas** le personnage,
  - **ne déclenche aucun timer**,
  - **n’est pas visible** dans la file des autres équipes (`total`, `position`, `equipe_precedente`).
- Le placeholder `Équipe sans nom` est interdit côté affichage file : il ne doit jamais être exposé aux autres équipes.
- Le passage à l’état `active` n’est possible qu’après initialisation d’un nom valide.
- Si la file visible est vide et qu’une première équipe initialise un nom valide, elle passe immédiatement en `active` (sans countdown d’attente).

---

## 10. UI rendering rules


### Hub (`index.html`)
- Le Hub liste les personnages **1 à 15**.
- Chaque personnage affiche son **ID** et son **nom courant** issu de `data/personnages.json`.
- Chaque personnage expose deux accès explicites :
  - joueur : `play.html?id=X`
  - personnage : `character.html?id=X`
- Sur desktop, chaque personnage propose un bouton **Télécharger le QR code** pour l’accès joueur (`play.html?id=X`).
- Sur desktop, le Hub propose aussi un bouton **Télécharger tous les QR codes** pour récupérer les QR des personnages 1 à 15 en une seule action.
- Les fichiers de QR téléchargés sont nommés avec l’ID et le nom courant du personnage (`qr_{id}_{nom}.png`).


Sur `play` :
- Afficher strictement :
  - `Vous allez voir : {personnage.nom}`
  - `Votre équipe : {equipe.nom}` + bouton `Modifier`
- Ne jamais demander/saisir le nom du personnage côté play
- Afficher les informations de file depuis `file` :
  - `position`
  - `temps_attente_estime_seconds`
  - `equipe_precedente`
- En état `active` :
  - ne pas afficher la notion de file (`position`, `1/1`, etc.)
  - afficher **systématiquement** un countdown `⏱️ Temps réservé`
  - afficher un bouton `Je ne suis plus avec ce personnage` pour quitter volontairement l’interaction (retour à l’état supervision `free` via les règles existantes)
  - afficher un compteur `Temps passé` strictement informatif, cumulatif pendant tout l’état `active` (y compris après `00:00`)
  - ce countdown représente le **temps minimum réservé** à l’équipe active (`time_per_player`), indépendamment de la file derrière
  - ce countdown démarre dès l’accès au personnage et peut atteindre `00:00` sans action serveur tant qu’aucune autre équipe n’attend
  - ne jamais afficher littéralement le mot `personnage` dans les messages UI : utiliser systématiquement `{personnage.nom}`
  - message principal (fond vert) à afficher en permanence en `active` :
    `Échangez avec {personnage.nom} en toute tranquillité jusqu’à la fin du temps. Si aucune équipe n’arrive, vous pouvez continuer autant de temps que vous le souhaitez.`
  - message d’alerte (⚠️) **uniquement** s’il existe une équipe derrière (`queueTotal > 1`) :
    `⚠️ L’équipe « {équipe_suivante} » attend et pourra prendre la place à la fin du temps.`
- Affichage photo côté play :
  - si une photo est configurée dans l’admin (upload runtime), `play.html` l’affiche
  - si aucune photo n’est configurée, aucun bloc photo n’est affiché
  - aucun fallback visuel ou changement de contrat JSON

- États UI :
  - `need_name` : nom d’équipe absent
  - `waiting` : équipe dans la file en attente
  - `active` : interaction autorisée (signal explicite serveur)
  - Le front ne doit jamais déduire l’état `active` à partir du temps restant.
  - En absence de signal explicite, l’état par défaut est `waiting`.

Transition attendue :
- `waiting` → `active` lorsque l’équipe est première dans la file et peut accéder au personnage.
- Le front ne déduit pas cet état : il consomme le signal explicite envoyé par `status.php`.
  - `done` : interaction autorisée
- Une équipe sans nom utilisateur valide est traitée comme `need_name`
  et ne doit jamais afficher un nom par défaut à l’écran
- Dès réception de `state=need_name`, le front doit déclencher automatiquement la saisie du nom
  (sans attendre une action supplémentaire) et rester bloqué hors file tant que le nom n’est pas valide.
- En `need_name` initial, la saisie du nom réalise une **initialisation** via `status.php?team_name=...`
  (pas un renommage). Le bouton `Modifier` utilise `rename_team.php` uniquement après initialisation.
- **Verrou front requis sur la saisie auto** : la demande automatique du nom d'équipe ne doit se déclencher
  qu'une seule fois par phase `need_name`, puis rester verrouillée dès qu'un nom valide existe.
  Le polling ne doit jamais réouvrir ce prompt tant que le nom valide est conservé.
- **Countdown front local obligatoire** : l'affichage du décompte doit être piloté côté front avec
  un timer local (décrément fluide `-1/s`) basé sur `temps_attente_estime_seconds` (ou `my_remaining`
  en `active`).
- **Polling non destructif** : le polling met à jour l'état métier/valeurs serveur mais ne recrée pas le
  timer local à chaque tick ; il ne fait qu'ajuster/synchroniser la valeur si nécessaire.
- **Sémantique countdown en `active` (règle définitive)** :
  - le countdown en `active` est toujours affiché et vaut `time_per_player - temps_passé` (borné à 0)
  - il exprime un **temps réservé minimal**, pas une prise de place effective
  - il ne déclenche jamais, à lui seul, une action serveur
- **Relève automatique (conditions strictes)** :
  - une relève est autorisée uniquement si `countdown <= 0` **et** `queueTotal > 1`
  - si `queueTotal <= 1`, aucune relève automatique, même avec `countdown = 0`

Règles d’identité :
- utiliser `equipe.id` (token) comme identifiant technique
- ne jamais utiliser `equipe.nom` comme identifiant

---

## 11. Gestion des fichiers runtime vs code (règle Git)

### Fichiers de code (versionnés)
- `api/*.php`
- `js/*.js`
- `css/*.css`
- `*.html`
- `data/personnages.sample.json` (jeu de données de base)
- `CHATGPT_CONTEXT.md`

### Fichiers de données runtime (non versionnés)
- `data/personnages.json` : état vivant des files, noms d’équipes, photos et timing pendant l’exploitation terrain.
- `uploads/` : fichiers uploadés en exploitation (ex: photos de personnages), jamais versionnés.

### Règle terrain à appliquer
1. Garder `data/personnages.sample.json` comme référence Git.
2. Ne jamais committer `data/personnages.json` (fichier ignoré par Git).
3. Ne jamais committer les fichiers uploadés dans `uploads/` (seul un placeholder `.gitkeep` est autorisé).
4. En environnement terrain, l’application lit/écrit `data/personnages.json` et `uploads/`.
5. Si `data/personnages.json` est absent, il est recréé automatiquement depuis `data/personnages.sample.json`.

### Comportement attendu au démarrage (admin)
- `admin.html` consomme `GET /api/get.php`, qui lit **toujours** `data/personnages.json`.
- Au premier accès (ou si le runtime est absent / invalide), le backend initialise `data/personnages.json` depuis `data/personnages.sample.json`.
- Toute sauvegarde depuis l’admin (`POST /api/save.php`) écrit **uniquement** dans `data/personnages.json`.

Objectif : conserver un dépôt propre tout en laissant les animateurs modifier les données en direct sans conflit Git.

---

## 11. Hub + supervision + interfaces personnages

### Nouvelles pages
- `index.html` : hub de navigation uniquement
  - 🔐 Administration (`admin.html`)
  - 🎭 Personnage 1 à 5 (`character.html?id=X`)
  - 📊 Supervision (`monitor.html`)
- `monitor.html` : vue lecture seule de toutes les équipes actives/en attente
- `character.html?id=X` : interface terrain par personnage

### Sécurité administration
- Seule l'interface admin est protégée par PIN.
- Vérification **front** : `js/admin.js` demande le PIN puis vérifie via `api/admin_auth.php`.
- Vérification **API** : endpoints admin valident `X-Admin-Pin` (ou `admin_pin` en query).
- Le code admin est lu dans `data/config.json` (clé recommandée : `admin_code`, rétrocompatibilité `admin_pin`).
- **Protection activée uniquement si un code non vide est configuré**. Si la clé est absente / vide / `null`, l'admin est en accès libre (sans prompt PIN).

### Endpoints ajoutés
- `GET /api/admin_auth.php` : vérifie le PIN admin.
- `GET /api/supervision.php` : expose la liste globale des équipes en jeu (lecture seule).
- `GET /api/character_status.php?id=X` : état courant d’un personnage (équipe active + file).
- `POST /api/character_control.php` : actions terrain personnage (`plus_30`, `minus_30`, `eject`).

### Endpoints admin sécurisés (PIN requis)
- `GET /api/get.php`
- `POST /api/save.php`
- `POST /api/upload.php`
- `POST /api/grant.php`
- `POST /api/reset.php`

### Contraintes d'architecture conservées
- Aucun framework frontend.
- Pas de base de données.
- Polling simple côté supervision/personnage.
- Changements incrémentaux sans refonte lourde.

## 11. Règles serveur de rotation (source de vérité)

Ces règles sont **non négociables** et doivent rester alignées avec `api/status.php` :

- Le serveur est l’unique autorité pour déterminer l’équipe `active`.
- `time_per_player` représente le quota avant qu’une relève puisse être déclenchée, **pas** une expulsion immédiate.
- Tant qu’aucune équipe valide n’est en attente, l’équipe active peut rester indéfiniment (`timers.active_remaining_before_takeover_seconds = null`).
- Quand une équipe attend et que le quota de l’équipe active est dépassé :
  - le serveur démarre une fenêtre de courtoisie de `buffer_before_next` secondes ;
  - cette fenêtre est persistée côté serveur (`handover`) ;
  - à l’expiration, le serveur retire l’équipe active et promeut automatiquement la suivante en tête de file.
- Le front ne doit **jamais** expulser une équipe : il n’affiche que l’état et les timers calculés par le serveur.

### Sémantique des timers contractuels

- `timers.active_remaining_before_takeover_seconds`
  - `number` : temps restant avant prise de place automatique (inclut la courtoisie si elle est en cours) ;
  - `null` : aucune équipe en attente, donc aucune transition planifiée.
- `timers.courtesy_remaining_seconds`
  - `number` pendant la fenêtre de courtoisie ;
  - `null` hors courtoisie.
- `file.temps_attente_estime_seconds`
  - estimation serveur pour les équipes en attente, compatible avec la logique de rotation automatique.


---

## 11. Supervision : historique équipes & état temps réel

### Historique des équipes (runtime JSON)
- La supervision maintient un **historique par équipe** en runtime JSON.
- Chaque passage historisé conserve :
  - personnage rencontré
  - timestamp de début
  - timestamp de fin
- Cet historique est exploité uniquement par la supervision (pas par le gameplay joueur).

### Nouvel état supervision : `free`
- En supervision, une équipe peut être :
  - `active`
  - `waiting`
  - `free`
- `free` signifie : équipe connue de la supervision mais actuellement **ni en attente ni active**.
- Cet état est **strictement observable en supervision** et ne modifie pas les états métier côté play (`need_name`, `waiting`, `active`).

### Temps passé avec un personnage
- Le temps par personnage est calculé à partir des timestamps `début` / `fin` de l’historique.
- Ce calcul est **strictement informatif**.
- Il n’a aucun impact sur :
  - les timers
  - les files FIFO
  - la logique de relève

### Remise à zéro de l’historique
- La supervision expose une action explicite **« Remettre l’historique à zéro »**.
- Cette action :
  - efface l’historique runtime
  - remet l’état supervision dans un état initial cohérent
  - n’affecte pas le code versionné
- Objectif : faciliter les tests terrain sans manipulation Git.

## 11. Navigation Hub

- `admin.html` dispose d’un bouton **Retour au Hub** redirigeant vers `index.html`.
- `supervision.html` (implémentée via `monitor.html`) dispose d’un bouton **Retour au Hub** redirigeant vers `index.html`.
---

## 11. Hub Cluedo (point d’entrée)

Le `Hub Cluedo` (`index.html`) est le point d’entrée terrain vers les interfaces de l’application.

Le Hub doit proposer des boutons d’accès rapides, visibles et adaptés au tactile pour :
- `Administration` (`admin.html`)
- `Supervision` (`monitor.html`)
- `play.html?id=X` pour chaque personnage (accès joueur)
- `character.html?id=X` pour chaque personnage (accès interface personnage)

Contraintes :
- changement UI uniquement
- aucune modification des règles métier
- aucun impact gameplay / états / files d’attente / identification
- aucune modification des routes existantes (URLs et paramètres conservés)
## 12. Admin UI : lisibilité PC, navigation rapide, actions globales (UI uniquement)

### Affichage responsive en grille
- La page `admin.html` affiche désormais les personnages en **grille responsive**.
- Comportement attendu :
  - mobile : **1 colonne** ;
  - écran large (PC) : **3 colonnes**.
- Cette adaptation est CSS-only (aucun impact sur la logique métier).

### Navigation rapide par personnage
- En haut de l’admin, une zone **Accès rapide** affiche un bouton par personnage.
- Format de libellé : `ID - Nom` (exemple : `1 - Juju`).
- Le clic fait défiler la page vers le bloc du personnage ciblé.
- Aucun renommage automatique, aucune logique serveur supplémentaire.

### Photo visible dans chaque bloc admin
- Si une photo est configurée pour un personnage, elle est affichée directement dans sa carte admin, y compris après ouverture initiale ou refresh de `admin.html`.
- Lorsqu’une photo est uploadée depuis `admin.html`, son aperçu est visible immédiatement dans la carte du personnage concerné, sans rechargement de page.
- Dans l’interface admin, la photo affichée est présentée sous forme circulaire.
- Le mécanisme d’upload existant reste inchangé.
- Aucun fallback visuel additionnel n’est ajouté.

### Bouton Enregistrer toujours accessible
- Sur `admin.html`, le bouton `Enregistrer` reste accessible en permanence sans nécessité de scroll.
- Le bouton déclenche strictement la même sauvegarde (`POST /api/save.php`) qu’auparavant, sans logique parallèle.

### Action globale sur `time_per_player`
- L’admin propose une action globale :
  - saisir une valeur en secondes ;
  - appliquer cette valeur à tous les personnages en un clic.
- Cette action remplace les valeurs affichées des champs `time_per_player` et est persistée via le bouton de sauvegarde existant.
- Aucun autre champ métier n’est modifié.

### Garanties métier inchangées
- Aucun impact sur le gameplay.
- Aucun impact sur les files d’attente.
- Aucun impact sur les états (`need_name`, `waiting`, `active`, `free`).
- Aucune nouvelle règle métier introduite.
