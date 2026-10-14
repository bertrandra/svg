# ADR-0001 — Reprendre le canvas SVG de crea

**Date :** 14 octobre 2026
**Statut :** acceptée

## Contexte

crea a construit un éditeur SVG plein écran pour retoucher un logo vectorisé (son ADR-0026) : un
moteur pur qui lit un SVG en formes à plat, des opérations immuables, un historique, et un composant
React qui porte les gestes. Ce canvas ne doit rien au métier de crea (charte, campagnes, supports) :
il lit un SVG, en rend un autre. Il a sa place dans d'autres produits, et son évolution (outils de
dessin, booléens, texte) mérite un dépôt où elle ne pèse pas sur crea.

## Décision

1. **Le canvas est repris tel quel**, fichier par fichier : `engine/editionSvg.ts`, `util/xml.ts`,
   `util/svg.ts`, `util/historique.ts`, `util/tableaux.ts`, `zones/EditeurSvg.tsx`, ses styles et ses
   tests. Le moteur n'est pas réécrit : un SVG passé par l'éditeur de crea et par celui-ci donne le
   même résultat, au millième.
2. **Le seul lien avec crea est coupé** : le nuancier de la charte devient une propriété du
   composant. L'éditeur ne connaît aucun magasin, aucune plateforme, aucun droit.
3. **Une page autonome l'enveloppe** (`zones/Application.tsx`) : ouvrir un SVG, l'éditer, récupérer
   le résultat. Ce qui est propre à la page reste dans la page ; le composant reste embarquable.
4. **L'outillage et les règles de crea sont repris** : TypeScript strict, lint, cliquet, test
   d'architecture avec la même table de couches, CI `verifier`, conventions de `CLAUDE.md`. Ce qui a
   été tranché pour l'éditeur dans crea (dessin à plat, opérations pures, historique par clé,
   gestes dans le composant, rien sans « Enregistrer ») vaut ici sans être rediscuté.
5. **Les deux copies restent alignées à la main** tant qu'il n'y a pas de paquet publié : une
   évolution du moteur se fait ici d'abord, puis se reporte dans crea.

## Conséquences

- Le dépôt naît avec 35 tests et une page de 290 Ko, sans dépendance au-delà de React.
- Le composant attend les classes `editeur-*` et les jetons de couleur de `page.html` : un hôte les
  fournit, comme crea le fait.
- Tant que crea garde sa propre copie, une correction du moteur se porte des deux côtés ; c'est le
  prix de ne pas publier de paquet avant que l'interface du composant se soit stabilisée.
