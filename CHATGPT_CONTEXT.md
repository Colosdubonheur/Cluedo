# CHATGPT_CONTEXT.md
## Projet : Gestion Passage Cluedo LCDB

## Utilisation avec ChatGPT
- À coller en début de chaque nouvelle conversation
- Ne pas modifier sans décision technique claire

### 1. Objectif du projet
Outil de gestion de file d’attente pour des interactions physiques entre des équipes de joueurs et des personnages, utilisé en environnement terrain (jeux, colos, événements).

Le système permet de garantir un temps d’interaction équitable, non contournable, et compréhensible pour tous les acteurs.

---

### 2. Utilisateurs
Le système est utilisé par trois types d’acteurs :

- **Joueurs**
  - Voir depuis combien de temps leur équipe est avec un personnage
  - Savoir combien de temps il reste avant de pouvoir accéder à un personnage
  - Connaître leur position et leur temps d’attente dans une file

- **Animateurs / Personnages**
  - Voir depuis combien de temps l’équipe en cours interagit avec eux
  - Voir combien d’équipes sont en attente et pour combien de temps

- **Administrateurs**
  - Ajuster les durées (temps par joueur, temps tampon)
  - Avoir une vision d’ensemble de l’état des files et des personnages

---

### 3. Contexte d’utilisation
- Utilisation sur **téléphone mobile et desktop**
- En **temps réel**, sur le terrain
- Avec des **contraintes humaines réelles** :
  - attente physique
  - files visibles
  - nécessité d’équité et de clarté
- Connexions multiples possibles (plusieurs joueurs scannant un QR code)

---

### 4. Architecture technique
Architecture volontairement simple et robuste :

- **Frontend** : HTML + JavaScript vanilla
- **Backend** : PHP
- **Stockage** : fichiers JSON (aucune base de données)
- **Hébergement** : mutualisé (PlanetHoster)

Aucun framework, aucune surcouche inutile.

---

### 5. Principe fondamental (règle non négociable)
> **Une seule équipe peut interagir avec un personnage à la fois.**

Cette règle est garantie **exclusivement côté serveur**.  
Le serveur est l’unique source de vérité pour :
- la file d’attente
- les durées
- les autorisations d’accès

---

### 6. Modèle conceptuel
- Chaque personnage possède :
  - un temps d’interaction par équipe
  - un temps tampon obligatoire avant passage au suivant
  - une file d’attente serveur ordonnée (FIFO)
- Chaque joueur est identifié par un token de session
- Le temps d’attente dépend :
  - du temps restant du joueur actif
  - du nombre de joueurs devant dans la file
- Les temps se recalculent dynamiquement en cas d’arrivée ou de départ d’un joueur

---

### 7. Persistance
- Les files d’attente sont stockées en mémoire serveur (fichiers JSON)
- **Si tout est fermé ou redémarré, la file peut être perdue**
- Ce comportement est assumé et acceptable dans le contexte terrain

---

### 8. Comportements clés
- Impossible d’accéder à plusieurs personnages en parallèle
- Quitter une file libère immédiatement du temps pour les suivants
- Les messages et alertes (visuelles / sonores) dépendent :
  - de la présence ou non d’autres équipes en attente
  - de la phase temporelle (en cours, pré-fin, fin)

---

### 9. Contraintes explicites
Le projet doit **éviter absolument** :
- Frameworks frontend (React, Vue, etc.)
- Bases de données
- WebSockets ou systèmes temps réel complexes
- Refactorisation lourde ou sur-ingénierie

La priorité est :
- lisibilité
- fiabilité terrain
- maintenance simple
- compréhension rapide par un nouvel intervenant

---

### 10. Philosophie générale
Ce projet privilégie :
- la clarté fonctionnelle
- la robustesse plutôt que la sophistication
- des règles explicites plutôt que des comportements implicites
- une logique serveur forte et un client simple

Tout ajout doit respecter ces principes.

---

### 11. Nouvelle fonctionnalité : Nom d’équipe persistant

Cette évolution améliore l’expérience joueur en évitant de ressaisir le nom d’équipe à chaque action.

#### 11.1 Principe général
- Le joueur saisit son **nom d’équipe une seule fois**.
- Ce nom est **stocké localement côté client** (navigateur) pour être réutilisé automatiquement.
- Tant que le stockage local est conservé, le joueur retrouve le même nom d’équipe lors des prochains accès.

#### 11.2 Données envoyées à l’API
- Les appels API liés à l’entrée en file incluent désormais le paramètre :
  - `team` : nom d’équipe saisi (ou relu depuis le stockage local)
- Le backend utilise ce champ pour associer clairement une entrée de file à une équipe lisible, et pas uniquement à un token technique.

#### 11.3 Structure de file d’attente enrichie
- Chaque entrée de file contient désormais les informations minimales suivantes :
  - `token` : identifiant de session du joueur
  - `team` : nom d’équipe persistant
  - `joined_at` : horodatage d’entrée dans la file
- Cette structure facilite à la fois le suivi métier (qui attend) et les calculs temporels (depuis quand).

#### 11.4 Champs ajoutés à la réponse JSON
- Les réponses API incluent un nouveau champ :
  - `previous_team`
- Usage : permettre au client de préremplir ou confirmer le nom déjà connu pour ce token/session, afin d’assurer une continuité utilisateur.

#### 11.5 Comportement côté joueur
- En **attente**, le joueur conserve son identité d’équipe sans ressaisie.
- La **priorité** reste pilotée par l’ordre serveur de la file (FIFO), enrichi par les métadonnées `team` et `joined_at`.
- L’**accès** au personnage reste décidé côté serveur ; le nom d’équipe persistant améliore la lisibilité, sans changer la règle d’autorisation.
