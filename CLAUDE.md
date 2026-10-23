# CLAUDE.md — svg

Consignes pour travailler dans ce dépôt. Le contexte est dans `README.md` et `docs/adr/`.

## Le projet en une phrase

Un éditeur SVG autonome et embarquable, un convertisseur d'image en SVG, et une bibliothèque de
formes classées par événement. **Un SVG réécrit aujourd'hui doit l'être à l'identique demain** : un
changement qui déplace une coordonnée, un tracé ou un octet écrit est un événement de version
majeure, jamais une correction discrète.

## Vérifier avant de pousser

Ce que lance la CI (`.github/workflows/ci.yml`, job `verifier`) — tout doit passer en local d'abord :

```bash
npm run verifier     # typecheck && lint && cliquet && test
npm run construire   # la page, la bibliothèque et les fontes se construisent
```

- `tests/unit/architecture.test.ts` impose les couches : `util/shell` → `geometry` →
  `model/plateforme` → `engine` → `core/io/render/export/interaction` → `ui` → `app/zones`. Une
  couche n'importe jamais une couche plus haute ; un dossier nouveau se classe dans `NIVEAU` avant
  d'exister.
- Le cœur pur (`util`, `model`, `engine`) ne touche ni au DOM, ni à l'horloge, ni au hasard, ni au
  réseau. L'appel à vtracer et au navigateur vit dans `io`.
- `tests/unit/model/bibliotheque.test.ts` lit le jeu d'icônes entier : chaque forme doit s'ouvrir
  dans l'éditeur, chaque événement garder au moins dix formes, et moins de 3 % des noms porter un
  mot anglais.

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

- **Un dessin à plat, pas un DOM** (ADR-0001) : `engine/editionSvg.ts` lit un SVG (`util/xml.ts`,
  sans DOM) en chemins absolus M, L, C, Q, Z dans les coordonnées du plan de travail. Ce qui ne s'y
  ramène pas est refusé en le nommant.
- **Chaque opération est pure** et rend un nouveau dessin ; l'historique (`util/historique.ts`) est
  une pile d'états immuables, deux cents au plus, un geste continu fondu par sa clé.
- **L'éditeur ne connaît aucun magasin** : il reçoit un SVG, un nuancier et une bibliothèque
  facultatifs, rend un SVG à `enregistrer`. Ce qui est propre à la page vit dans `zones/Application.tsx`.
- **Les gestes vivent dans le composant React**, par les évènements de pointeur de la toile ; le
  calcul reste dans le cœur pur.
- **Rien ne s'écrit sans « Enregistrer »** ; le SVG réécrit passe par `nettoyerSvg`.
- **La vectorisation est vtracer en WASM, épinglé, chargé à la demande** (ADR-0002) ; le réglage
  est pur et déterministe ; une image entièrement détourée n'est jamais tracée.
- **Les réglages fins du traceur ne sont que ce qu'on a touché** (ADR-0005) : une valeur égale à celle
  du mode se retire ; les valeurs par défaut se calculent (`valeursParDefaut`), elles ne se recopient
  pas dans l'interface ; le temps d'un essai se mesure dans `io`, jamais dans le moteur.
- **Les booléens aplatissent** (ADR-0004) : le résultat est en segments droits, au style de la forme
  la plus basse ; `polygon-clipping` et `opentype.js` sont épinglés exactement.
- **Le texte est une forme par lettre**, composé en pur (`engine/texte.ts`) au-dessus d'une interface
  `Glyphes` ; le lecteur de fonte vit dans `io/polices.ts`. Jamais de `<text>` dans un SVG écrit.
- **Le stockage du navigateur ne porte que des conforts** (brouillon, versions, corrections) ; la page
  marche sans lui, et le cœur pur ne le voit jamais.
- **Une action primaire par panneau, le rare dans les menus** (ADR-0006) : un bouton est secondaire
  par défaut, seul `.primaire` est plein ; la barre garde l'outil fréquent, les menus (`Menu.tsx`) le
  reste avec son raccourci ; un panneau se range en `Section` ; au doigt, 40 px et `prefers-reduced-motion`
  respecté.
- **La bibliothèque est game-icons.net, pas des emoji** (ADR-0003) : des silhouettes pleines, un
  nom traduit par le lexique (`model/lexique.ts`, un mot inconnu reste en anglais et s'ajoute là),
  un classement par règles (`model/bibliotheque.ts`, mots-clés et exclusions), jamais à la main.
  Elle se construit dans `dist/`, rien n'est commis.
