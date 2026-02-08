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
  - état (waiting / active / done)

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
<!-- updated -->
<!-- updated 2026-02-08 Julien -->
