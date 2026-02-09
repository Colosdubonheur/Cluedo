# CHATGPT_CONTEXT — Cluedo

## Gouvernance documentaire (règle contractuelle verrouillée)

- `CHATGPT_CONTEXT.md` est la source de vérité contractuelle du projet pour :
  - les règles métier,
  - les comportements UI,
  - les décisions d'architecture,
  - les conventions fonctionnelles.
- Toute évolution **fonctionnelle** ou **UI** validée doit obligatoirement être répercutée dans ce fichier, dans la section la plus adaptée, avec un wording clair et non ambigu.
- Sont explicitement concernés (liste non exhaustive) :
  - règles d'affichage équipe / personnage / supervision,
  - libellés exacts visibles à l'écran,
  - règles de timing, alertes et sons,
  - comportements liés à la suppression d'équipe,
  - règles « déjà vu / jamais vu »,
  - messagerie (ordre, persistance, scroll, sons),
  - tri et affichage en supervision,
  - règles d'entrée / sortie de file,
  - toute suppression ou modification d'un comportement existant.

### Interdictions strictes
- Il est interdit d'implémenter une règle sans la documenter dans `CHATGPT_CONTEXT.md`.
- Il est interdit de modifier un comportement existant sans mise à jour explicite de la documentation.
- Aucun comportement ne doit être considéré comme « évident » s'il n'est pas formalisé dans ce document.

### Processus obligatoire pour chaque demande validée
1. Implémentation technique.
2. Mise à jour de `CHATGPT_CONTEXT.md`.
3. Vérification finale que la documentation reflète exactement le comportement réellement livré.

### Cas à exclure de la documentation
- Une demande annulée, reportée ou rejetée ne doit pas être ajoutée à `CHATGPT_CONTEXT.md`.
- En cas d'ambiguïté de formulation, l'implémentation doit être suspendue jusqu'à clarification afin d'éviter une règle documentaire inexacte.

## Décisions produit verrouillées

- L'**Espace Équipe** (`team.html`) est désormais l'**entrée unique** pour gérer l'engagement dans les files des personnages.
- Le **token équipe** reste la seule identité technique côté front.
- Le mécanisme de récupération par QR Code est **réservé à la supervision** (`monitor.html`) :
  - génération d'un QR code par équipe existante,
  - lien vers `team.html` avec le token existant,
  - aucun changement de règle métier ni d'identité.


## Suppression d’équipe depuis la supervision (critique)

- La suppression d’une équipe dans `monitor.html` est **définitive côté runtime serveur**.
- Le token supprimé est **invalidé** et conservé dans une blacklist runtime pour empêcher toute réutilisation.
- Toute reconnexion d’un appareil avec un ancien token supprimé doit forcer une **ré-initialisation complète** dans `team.html` :
  - ressaisie du nom d’équipe,
  - ressaisie des participants,
  - aucune récupération automatique de l’ancien profil/données.
- Une équipe supprimée ne doit jamais se recréer automatiquement à partir de son ancien token.

## Parcours joueur / équipe

1. L'équipe ouvre `team.html`.
2. Elle gère son profil (nom, participants, photo).
3. Elle sélectionne un suspect et lance un interrogatoire depuis la liste des personnages de l'Espace Équipe.
4. Les règles métier existantes côté serveur sont conservées (FIFO, unicité d’engagement, confirmation de changement/sortie).

## Portée technique

- `team.html` + `js/team.js` : gestion des files sans scan.
- `index.html` : hub simplifié (Administration, Supervision, Espace équipe + accès Joueur/Personnage).
- Aucun appel `getUserMedia`, aucun usage de librairie de scan.


## Règles de vocabulaire UI (obligatoire)

- Les expressions techniques suivantes sont **strictement internes** (serveur/dev) et **invisibles côté utilisateur** :
  - « file d’attente »
  - « rejoindre une file »
  - « quitter une file »
- Le vocabulaire utilisateur officiel est désormais :
  - « Interroger un suspect »
  - « Interrogatoire en cours »
  - « Préparez-vous à libérer la place »
  - « Quitter l’interrogatoire »
- La mécanique FIFO existe toujours côté serveur, mais **n’est jamais exposée à l’utilisateur**.

### team.html — logique fonctionnelle documentée
- L’équipe sélectionne un suspect puis entre dans un interrogatoire (ou une attente implicite), sans visualiser la notion de file.
- La page `team.html` n’affiche **aucun chronomètre dédié** (« Temps restant ») : le temps est communiqué uniquement via les messages contextuels.
- Le bouton STOP correspond à une sortie volontaire de l’interrogatoire (ou de l’attente implicite).
- Lorsqu’une autre équipe arrive sur le même suspect :
  - l’état visuel change,
  - le message contextuel passe en alerte (orange/rouge selon seuil),
  - le message « Préparez-vous à libérer la place » apparaît.
- La tuile du personnage actuellement actif conserve son halo lumineux existant, avec une couleur strictement synchronisée sur la couleur du texte d’état affiché dans la tuile (vert/orange/rouge/blanc selon l’état visible).
- Dans la section **Suspects** de `team.html`, la zone de filtres (« Trier par » + case « Suspects jamais vus ») est considérée comme un **bloc UI unique** : l’espacement interne entre ces deux contrôles doit être conservé.
- L’espace vertical **sous** ce bloc de filtres est volontairement réduit pour maximiser le nombre de suspects visibles à l’écran, en particulier sur mobile.
- Les textes d’aide affichés sous les filtres doivent rester volontairement courts (une ligne privilégiée) pour optimiser l’espace vertical ; libellé de référence : « Cliquer sur un suspect pour l’interroger. »

### Séparation stricte UI / métier
- Les termes « interrogatoire », « suspect » et « interrogation » sont des abstractions UI.
- Les règles métier réelles restent : FIFO, états serveur, timers.
- Aucune logique ne doit être déduite côté front à partir du wording affiché.

### Cohérence globale du wording
- Ces règles de vocabulaire sont obligatoires et doivent être appliquées de manière cohérente sur :
  - `team.html`
  - `monitor.html`
  - `character.html`
- Toute nouvelle UI doit respecter ce vocabulaire utilisateur officiel.

## Note de maintenance

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

### Règle responsive admin (UI)
- `admin.html` doit exploiter toute la largeur utile sur desktop (pas de conteneur centré type mobile).
- La grille des cartes personnages est pilotée uniquement par CSS, sans impact métier :
  - mobile : 1 colonne,
  - tablette : 2 à 3 colonnes selon breakpoint,
  - desktop : 4 à 5 colonnes selon largeur écran.

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

1. Accès à l'Espace Équipe (`team.html`)
2. Sélection d'un personnage depuis la liste centrale (le QR reste un raccourci optionnel)
3. Saisie/correction du nom d'équipe
4. Entrée dans la file du personnage
5. Affichage :
   - personnage à rencontrer
   - nom de l’équipe
   - position
   - temps estimé
   - équipe précédente
6. Possibilité de corriger le nom d’équipe **sans quitter la file**
7. Passage avec le personnage
8. Sortie de la file (uniquement action explicite équipe ou logique serveur de relève)

### Comportement UX play.html après sortie (état `free`)
- Le front de `play.html` doit réagir uniquement sur le signal serveur (`state = free`).
- Dès le passage en `free` (sortie volontaire confirmée côté serveur ou relève automatique), le front doit :
  1. tenter immédiatement `window.close()`,
  2. si la fermeture est bloquée par le navigateur, afficher des actions explicites :
     - `Aller à la page équipe` (redirection vers `team.html`),
     - `Fermer cette page` (nouvelle tentative de fermeture).
- La session équipe (token) et le nom d’équipe restent conservés (pas de recréation d’équipe, pas de ressaisie de nom).
- Aucun état bloquant ne doit subsister côté joueur après passage en `free` (mobile et desktop, Safari iOS inclus).


### Règles métier (files depuis l'Espace Équipe)
- Le QR code n'est **jamais obligatoire** pour rejoindre une file.
- Une équipe ne peut être engagée que dans **une seule file** à la fois (waiting ou active).
- Si l'équipe tente de rejoindre un autre personnage alors qu'elle est déjà engagée, une **confirmation explicite** est obligatoire.
- En cas de confirmation de changement de personnage :
  - l'ancienne place est perdue immédiatement,
  - l'équipe est retirée proprement de l'ancienne file,
  - l'équipe rejoint la nouvelle file demandée.
- Aucune sortie de file ne doit être déclenchée par des événements navigateur (`close`, `blur`, `sleep`, `visibilitychange`).

### Messagerie supervision (outil unifié équipes + personnages)
- Le point d'émission unique est **Supervision** (`monitor.html`) avec **un seul outil de messagerie** (une seule liste, un seul champ message, un seul bouton d'envoi).
- Dans `monitor.html`, aucun texte d'aide/notice explicative ne doit être affiché dans le bloc de messagerie ; l'usage repose uniquement sur les libellés des champs et actions.
- La liste de ciblage est unique et ordonnée strictement ainsi :
  1. `teams_and_characters:all` → **Tout le monde (équipes + personnages)**
  2. `teams:all` → **Toutes les équipes**
  3. `characters:all` → **Tous les personnages**
  4. `team:<token>` → **Équipes individuelles**
  5. `character:<id>` → **Personnages individuels**
- La sélection d'un destinataire est **explicite et obligatoire** avant envoi (aucun envoi implicite, aucun multi-envoi par défaut).
- Recherche intégrée (vanilla JS) :
  - un champ de recherche filtre en temps réel les options de la liste,
  - le filtrage se fait au clavier sans framework,
  - l'ordre logique des catégories reste inchangé dans les résultats affichés,
  - dès qu’un destinataire est sélectionné dans la liste, le champ « Rechercher une cible » est vidé automatiquement,
  - la sélection du destinataire reste active après vidage du champ,
  - le filtrage ne reste pas appliqué après la sélection (liste revenue à l’état non filtré).
- Les canaux restent strictement isolés au moment de la diffusion :
  - cibles équipes (`teams:all`, `team:<token>`) → canal **team** (visible dans `team.html`),
  - cibles personnages (`characters:all`, `character:<id>`) → canal **character** (visible dans `character.html`),
  - cible globale `teams_and_characters:all` → double diffusion explicite `teams:all` + `characters:all`.
- Résolution côté lecture :
  - `team.html` lit d'abord le message individuel équipe, puis le message de diffusion équipes,
  - `character.html?id=X` lit d'abord le message individuel personnage, puis le message de diffusion personnages.
- Diffusion et rafraîchissement :
  - les messages équipe sont lus par polling dans `team.html`,
  - les messages personnage sont lus par polling dans `character.html`.
- Comportement sonore associé :
  - côté équipe, notification sonore sur nouveau message uniquement si l'utilisateur a activé le son (`cluedo_team_audio_enabled`) ; son de notification : `assets/message.wav`,
  - côté personnage, notification sonore sur nouveau message ciblé avec `assets/message.wav`.
- Priorité d'affichage sur `character.html` (UI uniquement) :
  - les **messages de supervision** sont affichés avant le bloc de l'**équipe active** ;
  - ordre attendu : messages de supervision → équipe active → équipes en attente → paramètres secondaires (photo, lieu, etc.).
- Suppression globale de l’historique des messages (supervision uniquement) :
  - `monitor.html` expose un bouton dédié **« Effacer l’historique des messages »** distinct de `Remettre l'historique à zéro`,
  - l’action est protégée par une confirmation explicite et ne s’exécute jamais sans validation,
  - la suppression efface **uniquement** les structures runtime de messagerie supervision (`teams`, `characters`, `team_broadcast`, `character_broadcast`),
  - l’effacement est persistant côté serveur et ne doit pas réapparaître après rafraîchissement,
  - l’effacement est propagé immédiatement :
    - `team.html` vide l’historique des messages,
    - `character.html` vide l’historique des messages,
    - `monitor.html` n’affiche plus de « dernier message reçu »,
  - cette action ne supprime jamais les équipes/personnages/files/états, et ne remplace pas un reset global.

### Supervision — état global de la partie (indicateur)
- La barre d'actions de `monitor.html` affiche sur une seule ligne :
  - `Retour au Hub`,
  - `Remettre l'historique à zéro`,
  - `Fin de jeu`.
- Un indicateur texte est affiché immédiatement à droite du bouton `Fin de jeu` et reste toujours visible :
  - **Vert** + texte **« Partie active »** quand `end_game_active = false`,
  - **Rouge** + texte **« Partie terminée »** quand `end_game_active = true`.
- Cet indicateur est strictement informatif (aucun comportement métier supplémentaire).

### Supervision — statuts visuels verrouillés
- Affichage statut équipe (couleur obligatoire) :
  - **Vert** = équipe libre,
  - **Bleu** = équipe avec un personnage,
  - **Orange** = équipe en attente.
- Dans chaque carte équipe de `monitor.html`, le statut doit afficher simultanément :
  - une pastille de statut générique (`Équipe libre` / `Avec personnage` / `En attente`),
  - le nom du suspect concerné quand l’équipe est `active` ou `waiting`,
  - l’indication de temps associée (`Temps écoulé` / `Temps d'attente`).
- Le statut doit rester purement informatif et ne change aucune règle métier serveur.

### Supervision — périmètre des équipes listées
- `monitor.html` doit lister toutes les équipes connues côté runtime, y compris celles sans engagement en file.
- Une équipe est référencée dès qu'elle ouvre `team.html` (heartbeat serveur lié au token équipe).
- Les équipes connectées ne doivent jamais être invisibles, même si elles sont :
  - libres,
  - dans aucune file,
  - sans passage historique.

### Supervision — historique des passages
- L'historique affiché dans `monitor.html` est **informatif uniquement**.
- Pour chaque passage, l'UI montre :
  - nom du personnage,
  - heure de début,
  - durée passée avec ce personnage (en secondes).
- L'historique est simplifié, lisible, non interactif et sans impact sur files/timers/transitions.

### Supervision — lisibilité des cartes équipe (monitor.html)
- Affichage des équipes en grille responsive (UI uniquement) :
  - 1 colonne sur **tous les téléphones** (y compris iPhone Pro Max) pour préserver la lisibilité,
  - passage en multi-colonnes à partir d'environ **640px**,
  - au-delà de 640px, conservation des paliers existants (3 à 4 colonnes sur écrans moyens, puis jusqu'à 5 ou 6 colonnes sur desktop large).
- Objectif supervision : maximiser le nombre d'équipes visibles simultanément et limiter le scroll vertical.
- Le contenu fonctionnel de chaque tuile équipe reste strictement inchangé (photo, nom, statut, dernier message reçu, membres, actions QR/suppression), à l'exception du champ « dernier suspect vu » qui n'est plus affiché.
- Les ajustements de lisibilité ci-dessous s'appliquent **uniquement** à `monitor.html`.
- Zone « Dernier message reçu » :
  - largeur maximale fixe dans la carte équipe,
  - aucun agrandissement horizontal forcé de la tuile,
  - retour à la ligne automatique des messages longs,
  - aucun débordement horizontal, quelle que soit la langue/longueur.
- Zone actions équipe :
  - les boutons **« QR Code de l'équipe »** et **« Supprimer l'équipe »** sont alignés horizontalement quand l'espace le permet,
  - en cas d'espace insuffisant (très petit écran), un retour en empilement vertical est autorisé (fallback CSS),
  - une colonne dédiée aux actions est conservée sur desktop.
- Ces règles sont purement UI/CSS et ne modifient aucune logique métier.

### Donnée personnage `location`
- Chaque personnage expose un champ texte libre `location` (emplacement physique).
- `location` est éditable :
  - par l'administration (`admin.html`),
  - par le personnage lui-même (`character.html`).
- Côté interface personnage, une confirmation explicite est requise avant persistance de la modification.

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

### Complément UX team.html (notification sonore supervision)
- Les navigateurs (Chrome, Safari, iOS inclus) imposent une interaction utilisateur explicite avant toute lecture audio fiable.
- `team.html` expose un bouton visible **« Son activé »** : au clic utilisateur, `assets/soundon.wav` est joué immédiatement pour valider explicitement l'autorisation audio navigateur.
- Les fichiers audio de référence sont :
  - `assets/soundon.wav` (validation/activation audio),
  - `assets/message.wav` (notification de nouveau message supervision).
- Après validation réussie, l'état **son activé** est persisté côté client via `localStorage` (`cluedo_team_audio_enabled`), pour permettre les lectures automatiques ultérieures sans nouveau clic.
- À chaque nouveau message supervision reçu automatiquement (polling), `assets/message.wav` doit être joué immédiatement si l'audio est activé.
- En cas de blocage navigateur, l'UI doit afficher un retour clair pour relancer explicitement l'activation, sans erreurs console ni comportement aléatoire.

---

### Fin de jeu (supervision)
- L'état global **`end_game_active`** est stocké côté serveur dans `data/game_state.json` et exposé par `api/supervision.php`, `api/team_hub.php` et `api/status.php`.
- Activation uniquement via le bouton supervision **« Fin de jeu »** avec confirmation explicite (aucun déclenchement par texte).
- Quand la fin de jeu est active :
  - les équipes voient une notification rouge persistante **« Fin de jeu »** dans `team.html`,
  - les équipes **déjà en cycle** (active ou waiting) continuent normalement (FIFO/timers inchangés),
  - les équipes libres ne peuvent plus entrer dans une nouvelle file.
- Désactivation via le bouton supervision **« Annuler la fin de jeu »** avec confirmation :
  - la notification disparaît côté équipes,
  - les entrées en file redeviennent possibles,
  - aucun état d'engagement existant n'est modifié.
- La messagerie supervision reste active avant, pendant et après la fin de jeu (équipes et personnages).

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

- Toutes les pages principales (`index.html`, `admin.html`, `monitor.html`, `play.html`, `team.html`, `character.html`) affichent la même version applicative visible en haut à droite, de façon permanente et purement informative.
- La version affichée est alimentée partout via l’attribut `[data-app-version]` et le script front unique `js/app-version.js`.
- Format officiel : `MAJEUR.MINEUR.PATCH`.
- Source de vérité verrouillée : `data/version.json` avec la clé entière `build` (ex: `{ "build": 84 }`).
- Règle de génération verrouillée : `api/version.php` convertit ce build global en `MAJEUR.MINEUR.PATCH` (ex: build `84` → `1.0.84`).
- Le workflow GitHub Actions `.github/workflows/deploy.yml` écrit ce build automatiquement avant l’upload FTP (build = numéro de PR de déploiement).
- Interdiction verrouillée : aucune dépendance à la date/heure locale, et aucune version codée en dur côté front/back.
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
- `monitor.html` propose un tri d’affichage dynamique des équipes (côté front uniquement, sans impact métier) avec 4 modes verrouillés :
  - dernière équipe ayant reçu un message,
  - équipe dans la plus longue file d’attente,
  - équipe ayant vu le moins de suspects,
  - équipe ayant le temps moyen par suspect le plus élevé (métrique informative runtime).
- Dans chaque carte équipe de supervision, l’historique détaillé n’est plus affiché et l’information **dernier suspect vu** n’est plus affichée dans la tuile équipe.
- Dans chaque carte équipe de supervision, l’aperçu message est mono-ligne : seul le **dernier message envoyé** à l’équipe est affiché visuellement.
- La supervision inclut un canal de messages `supervision -> équipes` :
  - envoi individuel (par équipe) ou global (toutes les équipes),
  - stockage runtime en JSON,
  - affichage côté `team.html`,
  - **informatif uniquement** : aucun impact sur gameplay, files, rotations ou timers.
Si une dépendance liée à un ancien mécanisme visuel/code devait réapparaître, elle doit être explicitement validée côté métier avant réintroduction.


## Navigation centrale (Hub)

- Le **Hub** (`index.html`) est le **point de navigation central** de l'application.
- **Toutes les pages** utilisateur et admin accessibles directement (ex. `admin.html`, `team.html`, `play.html`, `character.html`, `monitor.html`) doivent proposer un bouton/lien explicite **« Retour au Hub »**.
- Ce retour vers `index.html` doit rester immédiat, visible et homogène sur desktop, tablette et mobile (pas de menu caché).
## 10. Espace Équipe — organisation UI + verrouillage d'initialisation

### Ordre des blocs (`team.html`)
De haut en bas :
1. **Nom d'équipe** centré (sans titre « Espace Équipe ») avec un bouton crayon pour éditer.
2. Bloc **Notifications**.
3. Bloc **Suspects** (anciennement « Personnages »).
4. Bloc bas de page **Nom d'équipe + participants** (édition unique).

### Édition du profil équipe (bloc unique bas de page)
- Une seule zone d'édition gère :
  - le nom d'équipe,
  - la liste des participants.
- Participants :
  - un champ d'ajout de prénom,
  - chaque prénom validé apparaît sous le champ,
  - chaque entrée affiche une croix de suppression.
- Contraintes participants :
  - tous les participants de l'équipe doivent être renseignés,
  - l'interrogation n'est autorisée que si au moins un participant est saisi,
  - aucun message de blocage ne doit mentionner de plage numérique.

### Règle métier officielle — validité du profil équipe (`team.html` uniquement)
- Le nom d'équipe est **obligatoire** et est invalide s'il est vide **ou** vaut exactement `Équipe sans nom`.
- Les participants de l'équipe sont **obligatoires** via le mécanisme d'ajout des prénoms (au moins un prénom non vide).
- La photo d'équipe est **obligatoire** : une équipe sans photo est considérée comme incomplète.
- Tant que le nom d'équipe n'est pas valide, **ou** que les participants ne sont pas correctement renseignés, **ou** qu'aucune photo d'équipe n'est définie :
  - aucun interrogatoire n'est possible,
  - les tuiles suspects/personnages restent inactives.
- Le message de blocage affiché côté équipe doit être :
  - `Complétez les informations de votre équipe (nom, participants et photo) pour pouvoir interroger les personnages.`

### Blocage strict tant que profil incomplet
Tant que le nom d'équipe n'est pas valide **ou** qu'aucun participant n'est renseigné **ou** qu'aucune photo d'équipe n'est définie :
- impossible de rejoindre/quitter une file,
- les actions de file sont désactivées,
- un message rouge explicite est affiché.

Quand les prérequis sont remplis (nom valide + participants renseignés + photo d'équipe définie), l'équipe peut agir sur les files.
Le texte d'état « Espace équipe prêt : vous pouvez gérer les files des personnages » est supprimé.
- Team / UI (responsive) : les messages d’alerte affichés dans `team.html` (notamment dans la section **Suspects**) doivent toujours respecter la largeur du conteneur, revenir automatiquement à la ligne sur mobile et ne jamais provoquer de débordement horizontal de page.
- Team / UI (responsive) : dans le bloc de verrouillage de la section **Suspects**, le message bloquant « Interrogatoires bloqués tant que les informations de l'équipe ne sont pas complètes. » doit toujours être responsive (retour à la ligne automatique) et ne jamais dépasser la largeur de l'écran, y compris sur mobile.

### Section Suspects (affichage ligne unique)
Lorsqu'une équipe clique sur un suspect disponible ou en attente depuis la liste des suspects :
- le suspect sélectionné devient le suspect actif (bloc supérieur),
- la tuile correspondante disparaît de la liste des suspects,
- une seule instance visuelle du suspect doit exister à l'écran (aucune duplication).

Quand un suspect est déjà actif (interrogatoire en cours), un clic sur sa tuile dans le bloc actif du haut doit proposer la sortie d'interrogatoire avec confirmation.

La tuile du suspect actif (bloc supérieur) doit rester cliquable de manière uniforme dans les deux états `active` et `waiting` :
- si l'équipe est en `active`, le clic propose de quitter l'interrogatoire avec confirmation,
- si l'équipe est en `waiting`, le clic propose de quitter la file d'attente du même suspect avec confirmation,
- même zone cliquable, même logique de confirmation existante, sans bouton additionnel,
- cette règle s'applique uniquement à la tuile active du haut (aucun changement de comportement des tuiles inactives de la liste).

Lorsqu'une équipe est avec un personnage, le statut affiché est :
« Vous pouvez interroger {nom_du_personnage} ».

Lorsqu'une équipe est en interrogatoire avec un personnage, la tuile de ce personnage est mise en évidence par un contour lumineux (ou effet visuel équivalent) afin d'indiquer clairement le suspect actuellement interrogé.


Chaque suspect affiche sur une ligne horizontale :
- photo,
- nom,
- localisation avec icône uniquement (sans libellé « localisation »),
- temps d'attente avec icône uniquement (sans libellé « temps d'attente »),
- action rejoindre/quitter.

Règle d'affichage du temps :
- si `estimated_wait_seconds = 0` => afficher **« Disponible »**.

### Couleur stricte du temps d'attente
- **Vert** : 1 équipe avec le personnage, 0 équipe en attente.
- **Orange** : 1 équipe avec le personnage, 1 équipe en attente.
- **Rouge** : 1 équipe avec le personnage, 2 équipes (ou plus) en attente.

### Attente sur personnage occupé — tuile active uniquement
- Quand une équipe sélectionne un personnage déjà occupé, le délai restant avant accès est affiché **uniquement** dans la tuile active (bloc supérieur).
- Message explicite attendu : `Vous pourrez interroger {nom_du_personnage} dans XX:XX` (temps estimé restant de l'interrogatoire en cours).
- Tant que l'équipe est en attente, ce texte d'attente est affiché en **blanc**.
- Les tuiles inactives (liste des suspects) conservent strictement leur comportement et affichage existants : aucun ajout de texte, aucune modification de couleur, aucun changement de logique ou de comportement.

### Tri et filtre conservés
- Tri : par nom ou par temps d'attente estimé.
- Filtre : suspects jamais vus par l'équipe (selon historique).

### Règle verrouillée « Déjà vu / Jamais vu »
- Un suspect est affiché **« Déjà vu »** si et seulement si le cumul réel de temps d'interrogatoire de l'équipe avec ce suspect est **supérieur ou égal à 30 secondes**.
- Si le cumul est strictement inférieur à 30 secondes, le suspect reste **« Jamais vu »**.
- Le calcul repose sur l'historique runtime serveur (timestamps réels `started_at` / `ended_at`) et inclut aussi le passage actif en cours (`current`) sans approximation front.
- Un personnage est considéré comme **« déjà vu »** par une équipe dès que celle-ci a passé **au moins 30 secondes cumulées** avec lui, indépendamment de la manière dont l'interrogatoire se termine (sortie manuelle, relève automatique, changement immédiat ou fin anticipée).
- Le simple fait d'ouvrir une page, de cliquer un suspect ou d'être en attente ne compte jamais comme « déjà vu ».

Les règles d'unicité de file restent inchangées :
- une équipe ne peut être engagée que dans une seule file à la fois,
- confirmation obligatoire avant changement de suspect.

### Zone Messages — Espace Équipe (`team.html`)
- Le conteneur `#team-message-history` conserve l'historique complet des messages reçus pendant la session (aucune suppression automatique côté front).
- Les messages sont affichés du plus récent (en haut) au plus ancien (en bas).
- L'affichage par défaut est compact : au maximum **4 lignes** de messages sont visibles sans scroll.
- La zone est en `overflow-y: auto` pour permettre un scroll manuel vers les messages plus anciens.
- À la réception de chaque nouveau message supervision :
  - une nouvelle ligne est ajoutée à l'historique,
  - la zone est recentrée automatiquement en haut (`scrollTop = 0`),
  - les **4 derniers messages** redeviennent immédiatement visibles, même si l'utilisateur consultait l'historique.
- Ce recentrage est systématique et prioritaire (aucune exception liée à une interaction utilisateur en cours).



### Supervision — suppression manuelle d'une équipe
- `monitor.html` expose l'action **« Supprimer l'équipe »** dans chaque carte équipe.
- Une confirmation explicite est requise avant suppression.
- La suppression est ciblée par token et supprime toutes les traces associées :
  - engagement actif / attente dans les files personnages,
  - historique d'équipe,
  - profil équipe (nom, participants, photo),
  - présence (heartbeat),
  - message supervision individuel.
- Cette action est réservée à la supervision et n'affecte jamais les autres équipes.
- Après suppression, une réouverture avec l'ancien token ne restaure aucune donnée : l'équipe repart comme une première arrivée.

### Supervision — QR Code de récupération de token équipe
- `monitor.html` expose l'action **« QR Code de l'équipe »** dans chaque carte équipe.
- Le QR code contient une URL `team.html?token=<token_existant>`.
- Scanner ce QR code sur un autre appareil reconnecte la même équipe (même token, même historique) sans créer d'entrée supplémentaire.
- L'UI de supervision affiche le QR code dans une modale et permet son téléchargement.
- Cette fonctionnalité est strictement réservée à la supervision.

### Supervision — suppression définitive d’une équipe
- Depuis `monitor.html`, l’action **Supprimer l’équipe** est définitive sur les données runtime.
- La suppression runtime retire systématiquement :
  - le profil équipe (nom + participants),
  - la photo équipe (référence profile + fichier `uploads/...` si présent),
  - les messages de supervision ciblés pour ce token,
  - l’historique des passages de l’équipe,
  - la présence runtime de l’équipe,
  - toute entrée de cette équipe dans les files personnages (active / waiting / free recalculé par le runtime).
- La suppression est appliquée dans une section critique côté serveur (verrou runtime) pour éviter l’exposition d’états intermédiaires.
- Conséquence côté joueur (`team.html`) :
  - si la page est rafraîchie ou réouverte avec l’ancien token, l’équipe est traitée comme nouvelle,
  - aucune récupération implicite des anciennes données runtime,
  - le parcours repart de zéro (nom d’équipe + participants à ressaisir, historique vide).

## Administration centralisée (`admin.html`) — verrou fonctionnel

- `admin.html` est l'interface centrale de configuration runtime du jeu.
- Le paramètre de durée de session (temps de passage) reste global dans son effet gameplay : la valeur configurée depuis l'administration doit rester visible, modifiable, sauvegardable et appliquée sur les pages consommatrices des données runtime.
- La structure des personnages est verrouillée à **15 entrées fixes** avec des IDs **1 à 15** (pas de génération dynamique d'ID, pas de variation du nombre de personnages).
- L'administration doit toujours afficher les 15 personnages, de manière stable et cohérente.

### Champs configurables par personnage (admin)

Pour chaque ID de 1 à 15, les champs suivants sont configurables et persistés dans les données runtime :

- **Photo** :
  - upload autorisé ;
  - recadrage carré obligatoire avant sauvegarde ;
  - persistance après refresh ;
  - réutilisation sur les autres pages (`team.html`, `character.html`, `monitor.html`, hub).
- **Nom** : modifiable depuis l'admin, persistant, propagé sur les pages qui affichent l'identité du personnage.
- **Lieu (`location`)** : modifiable depuis l'admin, persistant, propagé sur les pages qui consomment ce champ.
- **Activation** : bascule actif/inactif (sans suppression du personnage).

### Impact global des paramètres admin

- Les modifications faites dans `admin.html` (photo, nom, lieu, activation, timing) sont sauvegardées dans le runtime JSON.
- Après sauvegarde et rafraîchissement, les valeurs doivent rester cohérentes et être immédiatement prises en compte par :
  - `team.html`
  - `character.html`
  - `monitor.html`
  - `index.html` (hub)
- Un personnage inactif n'est pas disponible côté équipes et ne doit pas être sélectionnable en jeu.

## Ajustements UI — Character + Supervision (participants)

### Character / UI (`character.html`)
- Bloc **Équipe active** (optimisation visuelle mobile) : le titre et le nom d’équipe sont fusionnés sur une seule ligne, au format **`Équipe active · {NomÉquipe}`**, avec le **même style typographique** que le titre existant ; le bloc conserve la photo, le temps restant, les participants et les actions, sans changement d’ordre des sections ni de logique fonctionnelle.
- Dans le contenu du bloc **Équipe active**, l’état n’est pas affiché : le statut **actif** est implicite et ne doit jamais apparaître sous forme de libellé (ex. `État : active`).
- Quand une équipe est active avec le personnage, le libellé participants affiche le total dérivé des prénoms : **`Participants (X)`** où `X` est le nombre de prénoms non vides enregistrés.
- Le bloc participants s'affiche sur une seule ligne logique au format **`Participants (X) : Prénom1, Prénom2`** (les prénoms suivent immédiatement après le libellé, séparés par des virgules), avec retour à la ligne automatique CSS si la largeur est insuffisante.
- Règle d'affichage du temps restant dans **Équipe active** : si le compteur atteint `00:00` et qu'aucune équipe n'est en attente, l'UI n'affiche plus `Temps restant : 00:00` et montre à la place **`Temps restant : ∞`** pour indiquer explicitement l'absence d'urgence de relève ; en présence d'au moins une équipe en attente, l'affichage du compte à rebours reste inchangé.
- Le bouton **« Appliquer pénalité d’équipe incomplète »** est supprimé de l’interface personnage (fonction obsolète, non affichée).
- Les boutons d’action personnage conservent leur comportement mais changent de style/libellé :
  - `+30 secondes` devient **`+30 S`** (couleur verte),
  - `-30 secondes` devient **`-30 S`** (couleur orange),
  - `Éjecter l’équipe` reste **`Éjecter l’équipe`** (couleur rouge).
- Disposition des actions : les trois boutons sont alignés côte à côte tant que l’espace le permet, avec retour à la ligne CSS autorisé sur petit écran.
- Bloc **Interrogatoires en attente** : chaque équipe est affichée sur **une seule ligne compacte** au format **`{ordre}. {NomÉquipe} ({participants}) – {mm:ss}`** ; l’ordre reste visible, le nombre de participants reflète le total réel des membres de l’équipe, et **aucun statut textuel** (ex. `waiting`) n’est affiché.


### Character / UI / Visibilité globale (`character.html`)
- Un bloc **`État du jeu`** est ajouté **immédiatement après** le bloc **`Interrogatoires en attente`** dans `character.html`.
- Le bloc est affiché dans un accordéon (`details/summary`) pour limiter l’encombrement mobile, avec un contenu purement de lecture.
- Sous-bloc **État des personnages** :
  - liste tous les personnages actifs,
  - affiche pour chacun son nom et son état synthétique :
    - équipe en cours d’interrogatoire si présente,
    - équipe(s) en attente si présentes,
    - **`Libre`** si aucune équipe active ni en attente.
- Sous-bloc **État des équipes** :
  - liste toutes les équipes connues (équipes en cours/attente + équipes connues via profils),
  - affiche pour chacune son état synthétique :
    - **`Libre`**,
    - **`En interrogation avec {Personnage}`**,
    - **`En attente avec {Personnage}`**.
- Ces deux sous-blocs sont **strictement informatifs** :
  - aucun bouton d’action,
  - aucune interaction métier,
  - aucun impact sur timers, files, supervision ou règles serveur.

### Supervision / UI (`monitor.html`)
- Dans chaque tuile équipe, le bloc membres affiche le total dérivé des prénoms : **`Membres de l’équipe (X)`** où `X` est le nombre de prénoms non vides enregistrés pour l’équipe.
- Ce total est un calcul d’affichage uniquement (aucune donnée métier supplémentaire).
