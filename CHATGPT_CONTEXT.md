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
  - état (waiting / done)

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

**Sortie contractuelle à consommer côté front**
- `state`: `waiting` | `done`
- `personnage`: `{ id, nom }`
- `equipe`: `{ id, nom }`
- `file`: `{ position, total, equipe_precedente, temps_attente_estime_seconds }`

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
- aucune recréation d’entrée de file
- aucune duplication d’équipe
- position inchangée

---

## 10. UI rendering rules

Sur `play` :
- Afficher strictement :
  - `Vous allez voir : {personnage.nom}`
  - `Votre équipe : {equipe.nom}` + bouton `Modifier`
- Ne jamais demander/saisir le nom du personnage côté play
- Afficher les informations de file depuis `file` :
  - `position`
  - `temps_attente_estime_seconds`
  - `equipe_precedente`
- États UI :
  - `need_name` : nom d’équipe absent
  - `waiting` : équipe dans la file en attente
  - `done` : interaction autorisée
- Une équipe sans nom utilisateur valide est traitée comme `need_name`
  et ne doit jamais afficher un nom par défaut à l’écran

Règles d’identité :
- utiliser `equipe.id` (token) comme identifiant technique
- ne jamais utiliser `equipe.nom` comme identifiant
