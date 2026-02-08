# CHATGPT_CONTEXT — Cluedo

## Décisions produit verrouillées

- L'**Espace Équipe** (`team.html`) est désormais l'**entrée unique** pour gérer l'engagement dans les files des personnages.
- Le **token équipe** reste la seule identité technique côté front.
- Le mécanisme par **QR Code est abandonné volontairement** :
  - aucun scan,
  - aucune génération,
  - aucun téléchargement,
  - aucune logique caméra,
  - aucune dépendance de permissions navigateur liée à la caméra.

## Parcours joueur / équipe

1. L'équipe ouvre `team.html`.
2. Elle gère son profil (nom, participants, photo).
3. Elle rejoint/quitte les files personnages uniquement depuis la liste des personnages de l'Espace Équipe.
4. Les règles existantes de file sont conservées (unicité, confirmation de changement/sortie).

## Portée technique

- `team.html` + `js/team.js` : gestion des files sans scan.
- `index.html` : hub simplifié (Administration, Supervision, Espace équipe + accès Joueur/Personnage).
- Aucun appel `getUserMedia`, aucun usage de librairie de scan.

## Note de maintenance

Si une dépendance liée à un ancien mécanisme visuel/code devait réapparaître, elle doit être explicitement validée côté métier avant réintroduction.
