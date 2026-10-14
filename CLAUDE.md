# CLAUDE.md — svg

Consignes pour travailler dans ce dépôt. Le contexte est dans `README.md` et `docs/adr/`.

## Le projet en une phrase

Le canvas SVG de crea, repris en éditeur autonome et en composant réutilisable (ADR-0001). **Un SVG
réécrit aujourd'hui doit l'être à l'identique demain** : un changement qui déplace une coordonnée ou
un octet écrit est un événement de version majeure, jamais une correction discrète.

## Vérifier avant de pousser

Ce que lance la CI (`.github/workflows/ci.yml`, job `verifier`) — tout doit passer en local d'abord :

```bash
npm run verifier     # typecheck && lint && cliquet && test
npm run construire   # la page se construit
```

- `tests/unit/architecture.test.ts` impose les couches de crea : `util/shell` → `geometry` →
  `model/plateforme` → `engine` → `core/io/render/export/interaction` → `ui` → `app/zones`. Une
  couche n'importe jamais une couche plus haute ; un dossier nouveau se classe dans `NIVEAU` avant
  d'exister.
- Le cœur pur (`util`, `engine`) ne touche ni au DOM, ni à l'horloge, ni au hasard, ni au réseau.

## Circuit d'une modification

1. Branche `claude/<sujet>` depuis `origin/main`. **Jamais de push direct sur `main`.**
2. `npm run verifier`.
3. Entrée dans `CHANGELOG.md`, sous `## [Non publié]` (Ajouté / Modifié / Corrigé), en français.
4. PR vers `main`, CI `verifier` verte, merge (commit de merge, pas de squash).

## Conventions

- Code et commentaires en français ; commentaires **sans accents** dans le code source, qui
  expliquent pourquoi. Textes de l'interface en français, avec accents, au vouvoiement.
- Messages de commit en français : un titre court, puis le pourquoi.
- Les tests vivent dans `tests/unit/<couche>/`, miroir de `src/`.
- Un index qu'on sait valide se lit par `au` (`util/tableaux.ts`), jamais par `!`.

## Décisions déjà prises

- **Un dessin à plat, pas un DOM** : `engine/editionSvg.ts` lit un SVG (`util/xml.ts`, sans DOM) en
  chemins absolus M, L, C, Q, Z dans les coordonnées du plan de travail. Ce qui ne s'y ramène pas
  est refusé en le nommant.
- **Chaque opération est pure** et rend un nouveau dessin ; l'historique (`util/historique.ts`) est
  une pile d'états immuables, deux cents au plus, un geste continu fondu par sa clé.
- **L'éditeur ne connaît aucun magasin** : il reçoit un SVG et un nuancier, rend un SVG à
  `enregistrer`. Ce qui est propre à la page autonome vit dans `zones/Application.tsx`.
- **Les gestes vivent dans le composant React**, par les évènements de pointeur de la toile ; le
  calcul reste dans le cœur pur.
- **Rien ne s'écrit sans « Enregistrer »** ; le SVG réécrit passe par `nettoyerSvg`.
- **Ce que crea décide pour l'éditeur vaut ici.** Une évolution du moteur qui doit servir crea se
  fait ici d'abord, puis se reporte ; les deux copies restent alignées à la main tant qu'il n'y a pas
  de paquet.
