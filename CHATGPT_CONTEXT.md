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
- **statut métier `active` (`true`/`false`)**
  - `true` : personnage visible et exploitable dans toutes les interfaces non-admin
  - `false` : personnage masqué hors admin et indisponible côté serveur
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

### Comportement UX play.html après sortie (état `free`)
- Le front de `play.html` doit réagir uniquement sur le signal serveur (`state = free`).
- Dès le passage en `free` (sortie volontaire confirmée côté serveur ou relève automatique), le front doit :
  1. tenter immédiatement `window.close()`,
  2. si la fermeture est bloquée par le navigateur, afficher des actions explicites :
     - `Aller à la page équipe` (redirection vers `team.html`),
     - `Fermer cette page` (nouvelle tentative de fermeture).
- La session équipe (token) et le nom d’équipe restent conservés (pas de recréation d’équipe, pas de ressaisie de nom).
- Aucun état bloquant ne doit subsister côté joueur après passage en `free` (mobile et desktop, Safari iOS inclus).

### Complément UX team.html (scan QR PC / mobile)
- `team.html` propose un scan QR adapté au mobile, à la tablette et au PC.
- Les libellés et actions de scan sont localisés en français pour un usage terrain clair.
- Conditions de démarrage attendues du scanner caméra :
  - page en contexte sécurisé (HTTPS),
  - autorisation caméra accordée,
  - démarrage vidéo immédiat avec attachement stable du flux dans `#team-qr-reader`,
  - compatibilité mobile Safari assurée via vidéo inline (`playsinline` / `webkit-playsinline`) et lecture `autoplay`/`muted`.
- Si la caméra est autorisée mais indisponible (timeout de source, device occupé/incompatible), afficher un message explicite d'échec de démarrage caméra sans crash JS.
- Le fallback par import d'image reste disponible comme solution secondaire uniquement (pas comme comportement principal masquant un bug caméra).
- Comportement officiel attendu du scan caméra (`team.html`) :
  - bouton principal libellé **« Scanner un QR code (caméra) »**,
  - l'UI ne déclare la caméra « activée » que si un flux vidéo actif est réellement attaché et lisible,
  - la zone vidéo (`#team-qr-reader`) est visible uniquement quand ce flux est actif.
- Gestion d'erreurs caméra officielle :
  - timeout réel de démarrage (`getUserMedia` / `start` / `Timeout starting video source`) ⇒ message explicite d'échec caméra,
  - autorisation refusée par l'utilisateur ⇒ message explicite distinct,
  - aucune relance silencieuse infinie ; tentatives bornées puis arrêt propre.
- Fallback officiel : en cas d'échec caméra réel, proposer explicitement **« Importer une image »** comme parcours secondaire.
- Le bouton crayon sur `team.html` ouvre bien l'édition du nom d'équipe (section Participants), permet la saisie/validation sans rechargement et affiche un retour explicite en cas d'échec.

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

- Si le personnage est inactif, l'API doit répondre en refus explicite (`character unavailable`).

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
- `state`: `need_name` | `waiting` | `active` | `free`
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
- en front, l’appel du bouton `Modifier` doit transmettre l’identité stable existante (`team_id` ou `token` = token d’équipe), jamais le nom d’équipe

### Règles métier verrouillées (need_name / timer / visibilité)

- Une équipe en état `need_name` (nom absent/invalide) :
  - **n’occupe pas** le personnage,
  - **ne déclenche aucun timer**,
  - **n’est pas visible** dans la file des autres équipes (`total`, `position`, `equipe_precedente`).
- Le placeholder `Équipe sans nom` est interdit côté affichage file : il ne doit jamais être exposé aux autres équipes.
- Le passage à l’état `active` n’est possible qu’après initialisation d’un nom valide.
- Si la file visible est vide et qu’une première équipe initialise un nom valide, elle passe immédiatement en `active` (sans countdown d’attente).
- Lors d’une relève (`active` expiré avec au moins une équipe en attente), l’équipe précédemment `active` est retirée immédiatement de la file FIFO côté serveur ; elle n’apparaît plus ni en `active` ni en `waiting`, et est donc `free` en supervision.
- Cette sortie de l’équipe précédemment `active` est **définitive** :
  - interdiction de réinsérer automatiquement l’équipe sortante en fin de file,
  - interdiction de la conserver dans les structures runtime de file,
  - retour dans une file uniquement via un nouvel accès volontaire (scan / intention explicite de rejoindre).

---


---

## 10 bis. Règle métier transversale : statut actif / inactif

- Chaque personnage possède un attribut métier explicite `active` persistant dans `data/personnages.json`.
- Ce statut est piloté depuis `admin.html` (toggle/checkbox), modifiable à chaud.
- Le serveur reste la source de vérité : aucune logique front seule n'est suffisante.

### Personnage actif (`active = true`)
- Visible dans :
  - Hub (`index.html`)
  - Team (`team.html` : scan + statistiques)
  - Supervision (`monitor.html`)
  - QR codes générés
  - Player (`play.html`)
  - Interface personnage (`character.html`)
- Autorisé à :
  - recevoir des équipes
  - maintenir une file
  - être scanné/rejoint

### Personnage inactif (`active = false`)
- Visible **uniquement** dans l’admin (`admin.html`) pour rester configurable.
- Hors admin, le personnage :
  - n’apparaît jamais dans les listes/UI,
  - ne peut plus être rejoint,
  - ne maintient pas de file active.
- En cas d’accès direct (URL/scan ancien), le serveur refuse proprement avec un message explicite (`character unavailable` / "Personnage indisponible").

Contraintes :
- ne jamais supprimer automatiquement la configuration d’un personnage inactif,
- ne pas purger automatiquement l’historique,
- ne pas déduire implicitement ce statut depuis d’autres données.

## 10. UI rendering rules


### Hub (`index.html`)
- Le Hub liste uniquement les personnages **actifs** (les inactifs restent visibles seulement en admin).
- Chaque personnage est affiché sous forme de **carte** avec une zone d’identité unique contenant **ID + nom courant**.
- Chaque carte personnage affiche la **photo** du personnage (si configurée) sous forme **ronde**.
- Chaque personnage expose deux accès explicites :
  - joueur : `play.html?id=X`
  - personnage : `character.html?id=X`
- Les actions par carte sont limitées à **3 actions** : **Joueur**, **Personnage**, **QR Code**.
- Le bouton **QR Code** conserve strictement le même contenu/route (`play.html?id=X`) avec un comportement visuel différent selon device :
  - desktop : téléchargement du PNG QR ;
  - mobile/tablette tactile : affichage du QR à l’écran.
- Sur desktop, les cartes personnages du Hub sont affichées en **grille 3 colonnes**.
- Le Hub propose une zone **Accès rapide** avec un bouton par personnage (`ID - Nom`) pour naviguer directement vers sa carte.
- Le Hub propose des exports QR codes à la demande :
  - **unitaire** (par personnage)
  - **groupé en ZIP** (`Télécharger tous les QR codes (ZIP)`)
  - **en PDF A4** à raison de **6 QR codes par page** (`Télécharger en PDF (A4 – 6 QR codes par page)`)
- Les fichiers PNG de QR téléchargés sont nommés avec l’ID et le nom courant du personnage (`qr_{id}_{nom}.png`).
- Les QR codes encodent strictement l’URL joueur existante (`play.html?id=X`).

Sur `character` :
- La photo d’un personnage peut être modifiée depuis `admin.html` **et** depuis `character.html?id=X`.
- Les deux interfaces réutilisent strictement le **même pipeline d’upload** (`api/upload.php`) : crop carré obligatoire, compression/standardisation JPEG, suppression éventuelle de l’ancienne photo dans `uploads/`, puis persistance de la référence dans `data/personnages.json`.
- La photo reste une donnée de configuration runtime (source de vérité unique : `uploads/` + `data/personnages.json`).

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
  - le polling `status.php` est **non destructif** : il ne doit jamais recréer/stopper la boucle du timer local à chaque tick, seulement resynchroniser la valeur en cas de dérive significative
  - ne jamais afficher littéralement le mot `personnage` dans les messages UI : utiliser systématiquement `{personnage.nom}`
  - message principal en `active` (UX uniquement, sans impact logique serveur) :
    - **vert** s’il n’y a aucune équipe derrière (`queueTotal <= 1`) :
      `Échangez avec {personnage.nom} en toute tranquillité jusqu’à la fin du temps. Si aucune équipe n’arrive, vous pouvez continuer autant de temps que vous le souhaitez.`
    - **orange** s’il existe une équipe derrière (`queueTotal > 1`) :
      `L’équipe {équipe_suivante} attend et prendra votre place à la fin du temps.`
    - **rouge** s’il existe une équipe derrière (`queueTotal > 1`) et qu’il reste `<= 15s` avant la relève :
      - la bulle principale passe en rouge,
      - le countdown devient rouge clignotant (lisible, non agressif),
      - sans créer de nouvel état métier ni déclencher d’action serveur.
  - le message secondaire (⚠️) peut rester affiché, mais le message principal doit porter l’information clé sans contradiction
- Affichage photo côté play :
  - si une photo est configurée dans l’admin (upload runtime), `play.html` l’affiche
  - si aucune photo n’est configurée, aucun bloc photo n’est affiché
  - aucun fallback visuel ou changement de contrat JSON

- Upload photo côté admin (`admin.html`) :
  - chaque upload est persisté en runtime (`uploads/` + référence `data/personnages.json`)
  - lors de l’upload d’une nouvelle photo pour un personnage, l’ancienne photo associée est supprimée du dossier `uploads/`
  - une seule photo par personnage est conservée en runtime (aucun versioning, aucun historique)
  - chaque photo personnage est **obligatoirement cropée en carré (ratio 1:1)** lors de l'upload avec validation explicite de l'admin
  - l'image persistée est l'image cropée finale, au **format standardisé** pour tous les usages (admin / play / QR / PDF)
  - au chargement, `admin.html` relit `data/personnages.json` et réaffiche la photo configurée
  - la photo reste visible après refresh, sans fallback ni stockage temporaire côté front

### Ordre impératif de persistance photo (admin)
1. Upload: `POST /api/upload.php` écrit d'abord le fichier final dans `uploads/` avec un nom stable.
2. Persistance JSON: après écriture disque réussie, `api/upload.php` met à jour `data/personnages.json` avec le chemin exact `uploads/...`.
3. Suppression ancienne photo: l'ancienne photo n'est supprimée qu'après validation des étapes 1 et 2, et seulement si elle n'est plus référencée ailleurs.
4. Sauvegarde admin: `POST /api/save.php` ne doit jamais écraser `photo` avec une valeur vide si une photo runtime existe déjà.
5. Refresh: `admin.html` relit `data/personnages.json`; le chemin `photo` doit pointer vers un fichier réellement présent dans `uploads/`.

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
- En `active`, le bouton doit afficher `Je ne suis plus avec {personnage.nom}` (jamais le mot générique `personnage`).
- Sur sortie volontaire validée, `play.html` déclenche l’action serveur existante puis tente la fermeture automatique de la fenêtre (UX uniquement), sans perte de session équipe.
- Sur sortie automatique (transition `active` -> non-`active` reçue du serveur), `play.html` tente la fermeture automatique de la fenêtre sans déclencher d’action serveur.
- Le token équipe stable est persistant entre scans (`play.html?id=X` puis `play.html?id=Y`) et ne doit jamais être recréé tant qu’un token valide existe localement.
- Le nom d’équipe déjà initialisé est conservé entre scans via ce token ; il ne doit pas être redemandé inutilement.
- L’autorisation sonore est demandée une seule fois côté utilisateur puis mémorisée pour toutes les pages `play.html` (pas de redemande systématique à chaque ouverture).
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
  - consomme uniquement `GET /api/character_status.php?id=X` (API personnage dédiée), jamais `status.php` ni `supervision.php`.
  - affiche en temps réel l'équipe `active` remontée par le serveur et la file FIFO `waiting` remontée par le serveur.

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
- Sur `character.html`, les actions manuelles de temps sont strictement alignées avec leurs libellés : `+30s` envoie `plus_30` et ajoute 30s réelles, `-30s` envoie `minus_30` et retire 30s réelles.

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

- `admin.html` dispose d’un bouton **Retour au Hub** redirigeant vers `index.html`, visible en permanence en haut de l’interface admin.
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

## 13. Persistance des photos admin (runtime)

- La persistance d’une photo est garantie côté serveur dans `api/upload.php` :
  - le fichier final traité (crop validé + normalisation) est écrit dans `uploads/` ;
  - le chemin relatif `uploads/<fichier>` est écrit dans `data/personnages.json` (`$data[$id]['photo']`).
- `admin.html` relit systématiquement les données runtime au chargement via `GET /api/get.php` (dans `js/admin.js`), puis utilise le champ `photo` du JSON pour afficher l’image.
- `POST /api/save.php` persiste l’objet admin courant tel qu’envoyé par le front, sans format alternatif ni fallback.
- Aucune règle métier n’est modifiée : pas de cache forcé, pas de fallback image, pas de changement de structure JSON.

## 11. Pipeline officiel d'upload photo admin (verrouillé)

Flux obligatoire, sans fallback :
1. Sélection d'un fichier image dans `admin.html`.
2. **Crop carré 1:1 obligatoire** côté admin (`js/admin.js`) avec validation explicite utilisateur (`Valider le crop`).
3. Génération d'un fichier **final** (non original) en JPEG carré standardisé `600x600`.
4. Envoi du fichier final vers `POST /api/upload.php`.
5. Contrôles serveur bloquants :
   - upload valide (`is_uploaded_file`),
   - MIME image autorisé (jpeg/png/webp),
   - image carrée obligatoire,
   - extension GD disponible,
   - dossier `uploads/` accessible en écriture.
6. Recompression/normalisation serveur en JPEG qualité 84 et écriture du fichier final dans `uploads/`.
7. Écriture du chemin runtime (`uploads/...jpg`) dans `data/personnages.json`.
8. Remplacement visuel immédiat côté admin + persistance après refresh (source JSON).

Contraintes non négociables :
- Aucune référence JSON sans fichier réel écrit dans `uploads/`.
- Aucun enregistrement d'image brute sans traitement crop + normalisation.
- Une photo active par personnage ; lors d'un remplacement, l'ancienne photo n'est supprimée que si elle n'est plus référencée.

### Spécificité iOS (HEIC/HEIF) et crop mobile

- Sur iPhone, le recadrage carré doit rester **obligatoire et visible** avant tout upload : aucun envoi serveur sans validation explicite du crop.
- Les formats `HEIC/HEIF` fournis par iOS ne sont pas traités dans le pipeline client actuel sans bibliothèque externe dédiée ; ils sont donc **refusés explicitement** côté UI avec un message clair demandant une image `JPEG/PNG`.
- En cas de format non supporté, `admin.html` doit bloquer l'appel à `POST /api/upload.php` et afficher une explication utilisateur (pas de message générique `error upload`).

## 11. Page équipe unique (`team.html`) — hub joueur permanent

- `team.html` est le **point d’entrée joueur unique** qui peut rester ouvert avant, pendant et après les passages.
- La page conserve l’identité d’équipe avec le **token stable existant** (stockage local/session déjà utilisé), sans login, sans compte, sans session PHP et sans identifiant alternatif.
- Cette page n’introduit **aucune redirection forcée** et ne remplace pas les règles serveur de file.
- Organisation UI en **accordéon front-only** (sans impact métier), avec une section ouverte à la fois.
- Ordre de priorité UX obligatoire des sections :
  1. **Scanner de QR code** (ouverte par défaut, action principale),
  2. **Statistiques et récapitulatif** (lecture seule),
  3. **Informations d’équipe** (édition volontaire contrôlée).

### Contenu fonctionnel

- `team.html` masque les identifiants techniques (token) dans l'interface joueur ; le token reste utilisé uniquement en interne pour l'identité stable.
- `team.html` affiche un guidage explicite non bloquant dès l'arrivée :
  - rappel si moins de 2 participants sont renseignés,
  - rappel si la photo d'équipe est absente.
- Le scan QR de `team.html` est opérationnel avec libellés et consignes en français (autorisation caméra, démarrage/arrêt du scan, feedback utilisateur clair).

- **Récapitulatif équipe (lecture seule)** :
  - temps total cumulé par personnage rencontré (informatif uniquement, basé sur l’historique runtime).
- **État global du jeu (temps réel)** :
  - pour chaque personnage : équipe active affichée, nombre d’équipes en attente, attente moyenne/estimée actuelle issue des calculs serveur.
- **Édition contrôlée équipe** :
  - renommage via le mécanisme existant (`rename_team.php`) quand l’équipe est engagée,
  - jusqu’à 10 champs joueurs informatifs stockés en runtime JSON,
  - photo d’équipe dédiée (upload PHP, carré obligatoire, compression/standardisation, stockage `uploads/`, remplacement + suppression ancienne photo).

### QR intégré

- La page équipe embarque un lecteur QR interne.
- Le résultat décodé est **consommé explicitement** : l’URL lue (`play.html?id=X`) est parsée côté `team.html` pour extraire l’`id` personnage.
- Dès détection valide, `team.html` déclenche une **action interne immédiate** (appel `status.php` avec `join=1`, token d’équipe existant) sans navigation.
- Le comportement est strictement équivalent au scan classique :
  - contrôles serveur,
  - gestion du cas « équipe déjà dans une autre file »,
  - confirmation explicite en cas de perte de place.
- Un verrou anti-doublon empêche le traitement en boucle d’un même QR pendant le retour serveur.
- Aucun scan QR depuis `team.html` ne redirige vers `play.html`.

### Garantie métier

- Cette fusion ne modifie **aucune règle métier verrouillée** :
  - files et états (`need_name`, `waiting`, `active`, `free`) restent pilotés serveur,
  - les temps restent informatifs,
  - aucun impact gameplay.
---

## 11. Upload photo personnage (admin) — politique iOS officielle

- Le flux photo admin reste **obligatoirement** : sélection image → recadrage carré côté client → upload PHP → standardisation serveur en JPEG 600x600 (qualité ~84).
- Le front doit bloquer explicitement les formats non supportés avant upload, avec message clair (pas d’"Erreur upload" générique).
- Comportement iOS/Safari attendu :
  - Si la photo est JPEG/PNG/WEBP : le recadrage s’ouvre puis l’upload continue normalement.
  - Si la photo est HEIC/HEIF (mime, extension, ou signature binaire détectée) : refus explicite avec message utilisateur demandant JPEG/PNG.
- Formats officiellement acceptés pour le pipeline de crop/upload : `image/jpeg`, `image/png`, `image/webp`.
- Formats officiellement refusés : `image/heic`, `image/heif` et variantes (`heic-sequence`, `heif-sequence`).
- Contraintes techniques connues :
  - En environnement actuel sans bibliothèque externe de transcodage HEIC, Safari iOS peut fournir des fichiers non décodables par le pipeline canvas/GD.
  - Le serveur (`upload.php`) n’accepte que JPEG/PNG/WEBP et rejette tout autre mime.
  - Le message d’erreur doit exposer une raison explicite (format non supporté, réseau, réponse serveur), jamais un échec opaque.

## 12. Versionnement

- Toutes les pages principales (`index.html`, `admin.html`, `play.html`, `team.html`, `character.html`) affichent la même version applicative visible (zone en haut à droite), purement informative.
- La version affichée sur le hub est rendue dans `index.html` via l’élément `[data-app-version]`, alimenté par `js/app-version.js`.
- Format officiel : `MAJEUR.MINEUR.PATCH`.
- Règle de génération verrouillée : la version applicative est dérivée du **numéro de Pull Request GitHub** ayant déclenché le déploiement.
  - Exemple : PR `#83` → version `1.0.83`
  - Exemple : PR `#84` → version `1.0.84`
- Source de vérité unique : `data/version.json` avec la clé chaîne `version` (ex: `{ "version": "1.0.83" }`).
- Le workflow GitHub Actions `.github/workflows/deploy.yml` écrit ce fichier automatiquement avant l’upload FTP.
- Interdiction verrouillée : aucune dépendance à la date/heure locale, et aucune version codée en dur côté front/back.
- Source front unique : `js/app-version.js` consomme `./api/version.php` et alimente tous les emplacements `[data-app-version]`.
- Cette version ne modifie aucune règle métier ni le gameplay ; elle sert uniquement à identifier rapidement le déploiement actif sur le terrain.

## 11. Team UX technique (stabilité terrain)

- `team.html` doit protéger la saisie utilisateur contre le polling : pendant l’édition des champs (nom d’équipe / joueurs), les mises à jour automatiques ne doivent pas écraser la saisie en cours.
- Le scan QR de `team.html` doit rester stable : démarrage caméra robuste, et fallback clair via import d’image quand la caméra est indisponible.
- Les erreurs techniques brutes ne doivent pas être exposées aux joueurs ; l’interface doit afficher des messages UX compréhensibles et actionnables.
- Ces points sont techniques/UX uniquement et ne modifient aucune règle métier verrouillée (file, token, statut, timers).


## 14. Stratégie cache production « zéro bug cache »

### Décision retenue (cache busting)
- Option B implémentée (compatible mutualisé, sans build obligatoire) : **`?v=<hash contenu serveur>`** injecté côté serveur via `cluedo_asset_url()`.
- Source de vérité unique : `includes/cache.php` calcule un hash MD5 tronqué (fallback `filemtime`) pour chaque asset local.
- Les pages `*.html` sont interprétées par PHP (directive `.htaccess`) pour injecter automatiquement les URLs versionnées dans les balises `<link>` / `<script>`.
- Interdiction respectée : aucun versionnement basé sur l’heure locale navigateur.

### Règles de headers HTTP
- HTML (`*.html`) : no-cache strict côté navigateur via `cluedo_send_html_no_cache_headers()` :
  - `Cache-Control: no-cache, no-store, must-revalidate`
  - `Pragma: no-cache`
  - `Expires: 0`
- API / données dynamiques (`/api/*.php`) : no-cache strict via double protection :
  - `api/_bootstrap.php` (headers applicatifs systématiques)
  - `.htaccess` (headers forcés serveur)
- Assets statiques :
  - **avec `v=`** : `Cache-Control: public, max-age=31536000, immutable`
  - **sans `v=`** : `Cache-Control: public, max-age=300, must-revalidate`

### Stratégie CDN Cloudflare (sans purge globale)
- Principe :
  - HTML : bypass / TTL très court (pas d’edge cache long)
  - API (`/api/*`) : bypass cache total
  - Assets versionnés (`/css/*`, `/js/*`, `/assets/*`, `/uploads/*` avec `v=`) : cache edge long autorisé
- Règles recommandées Cloudflare :
  1. `* /jeux/cluedo/api/*` → Cache Level: Bypass
  2. `* /jeux/cluedo/*.html*` → Cache Level: Bypass (ou Edge TTL très court)
  3. `* /jeux/cluedo/css/*`, `* /jeux/cluedo/js/*`, `* /jeux/cluedo/assets/*`, `* /jeux/cluedo/uploads/*` → cache autorisé (idéalement uniquement URLs versionnées)
- Conséquence : déploiement sans « Purge Everything » ; les nouveaux assets sont servis via nouvelle clé d’URL (`?v=`).

### État PWA / Service Worker
- Vérification effectuée : aucun `service-worker.js`, `sw.js` ou manifest PWA détecté dans le dépôt actuel.
- Donc : aucune logique SW ajoutée (conforme à la contrainte « ne rien ajouter s’il n’y a pas de SW »).

### Procédure de déploiement sans bug cache
1. Déployer le code (HTML/PHP/JS/CSS/images).
2. Ouvrir une page HTML : vérifier que CSS/JS/favicons locaux ont bien `?v=<hash>`.
3. Vérifier headers :
   - HTML = no-store
   - API = no-store
   - assets `?v=` = `max-age=31536000, immutable`
4. Si Cloudflare actif, valider que les règles Cache Rules ci-dessus sont en place.
5. Ne pas lancer de purge globale ; uniquement purge ciblée exceptionnelle si un fichier non versionné subsiste.


### Règles UX Hub (`index.html`)
- Dans chaque carte personnage, le nom du personnage doit apparaître **une seule fois** au format `ID - Nom` (aucune répétition du nom dans les actions).
- L’action `QR Code` doit d’abord proposer un choix explicite `Afficher` / `Télécharger` avant exécution de l’action.
- Comportement attendu :
  - mobile : `Afficher` est l’option recommandée pour consulter le QR code à l’écran ;
  - desktop : `Télécharger` est l’option recommandée pour récupérer le QR code.
- La logique de génération des QR codes ne doit pas être modifiée par ces ajustements UX.

---

## 12. Convention dossiers + déploiement FTP + cache (post-déploiement)

### Convention stricte des dossiers
- `includes/`
  - logique interne PHP (helpers, fonctions utilitaires, cache helpers)
  - **interdit en accès direct HTTP** (doit retourner 403)
  - uniquement chargé via `require`/`require_once` par des scripts publics
- `api/`
  - endpoints appelés par le frontend
  - validation d'entrée minimale (types attendus + présence) et réponses JSON contrôlées
  - les fichiers internes préfixés par `_` sont réservés à l'inclusion interne et ne doivent pas être exposés
- `data/`
  - données versionnées de référence (`*.sample.json`, configuration de version)
  - exclut les fichiers runtime utilisateurs
- `uploads/`
  - runtime utilisateur uniquement (photos, QR, assets générés)
  - non versionné (sauf placeholder `.gitkeep`)
  - non déployé par le pipeline FTP

### Règles de déploiement FTP (PlanetHoster)
- Le pipeline GitHub Actions doit exclure explicitement :
  - `.git/`, `.github/`
  - documentation (`*.md`), dont `README.md` et `CHATGPT_CONTEXT.md`
  - fichiers locaux (ex: `.DS_Store`)
  - `uploads/` (pour ne jamais écraser/supprimer les fichiers runtime terrain)
- Un fichier `.ftpignore` doit être maintenu à la racine avec ces exclusions.
- Objectif opérationnel : le dossier `uploads/` en production doit survivre à tous les déploiements.

### Règles de cache navigateur
- HTML (`*.html` servi en PHP) : en-têtes anti-cache (`no-store/no-cache`) envoyés côté serveur.
- API (`/api/`) : en-têtes anti-cache stricts (`Cache-Control: no-store...`, `Pragma`, `Expires`).
- Assets statiques (`css/js/assets/uploads`) :
  - versionnés via paramètre serveur `?v=` (hash/mtime) => cache long (`immutable`)
  - non versionnés => cache court (`max-age=300`) pour limiter le stale.
- La version d'asset est calculée côté serveur (jamais via horloge navigateur).

## 11. Supervision terrain (`monitor.html`)

- La supervision est un **outil de pilotage terrain** : vue globale, lecture rapide, suivi multi-équipes, sans action métier sur les files.
- Les états visibles en supervision sont strictement :
  - `active` : équipe en interaction avec un personnage,
  - `waiting` : équipe en attente dans une file,
  - `free` : équipe non engagée dans une file (état autorisé en supervision uniquement).
- Les données affichées en supervision sont informatives (nom d’équipe, membres, photo, historique simplifié des personnages rencontrés).
- La supervision inclut un canal de messages `supervision -> équipes` :
  - envoi individuel (par équipe) ou global (toutes les équipes),
  - stockage runtime en JSON,
  - affichage côté `team.html`,
  - **informatif uniquement** : aucun impact sur gameplay, files, rotations ou timers.
