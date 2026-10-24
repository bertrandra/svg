# ADR-0001 — Un dessin à plat, des opérations pures, un historique

**Date :** 14 octobre 2026
**Statut :** acceptée

## Contexte

Un SVG qui sort d'un traceur automatique, d'une banque de formes ou d'un logiciel de dessin demande
toujours une retouche : une poussière, une couleur à peine à côté, un point mal placé. On veut un
éditeur plein écran avec les outils d'un logiciel de dessin, le retour à l'action précédente, et un
SVG réécrit propre et déterministe. On veut aussi que le même éditeur s'embarque dans d'autres
produits, sans y apporter de magasin ni de plateforme.

## Décision

1. **Un dessin à plat, pas un DOM.** `engine/editionSvg.ts` lit un SVG (`util/xml.ts`, sans DOM) en
   formes : chaque forme est un chemin en commandes absolues M, L, C, Q, Z dans les coordonnées du
   plan de travail. Les transformations des groupes sont appliquées, cercles, rectangles et arcs
   deviennent des courbes, et les peintures sont résolues (attributs, classes d'une feuille
   `<style>`, `style`, héritage). Ce qui ne s'y ramène pas (texte, image, dégradé, masque, découpe,
   filtre, `<use>`) est **refusé en le nommant** : on n'édite pas ce qu'on ne saurait pas réécrire.
2. **Chaque opération est pure** et rend un nouveau dessin : déplacer, redimensionner, retourner,
   tourner, aligner, empiler, dupliquer, supprimer, colorer ; remplacer une couleur partout ; retirer
   les poussières sous un seuil ; regrouper les voisines de même couleur **seulement si elles ne se
   chevauchent pas** ; ajuster le plan de travail ; déplacer un point avec ses poignées (et son
   jumeau quand le tracé se referme sur lui), ajouter un point sans changer la courbe (de
   Casteljau), redresser ou courber un segment, retirer un point ; ajouter une forme, insérer un
   dessin dans un autre.
3. **L'historique est une pile d'états immuables** (`util/historique.ts`), deux cents au plus. Un
   geste continu (glisser, tirer un coin, régler une couleur au sélecteur) se fond en une seule
   entrée par sa clé : « Annuler » défait le geste entier, « Rétablir » le refait.
4. **Rien ne s'écrit sans « Enregistrer ».** Le SVG réécrit passe par `nettoyerSvg` ; les formes
   masquées sont retirées et le panneau le dit. Fermer avec des modifications demande confirmation.
5. **Les gestes vivent dans le composant React**, par les évènements de pointeur de la toile ; le
   calcul reste dans le cœur pur. Le composant ne connaît aucun magasin : il reçoit un SVG, un
   nuancier et une bibliothèque facultatifs, et rend un SVG à `enregistrer`.
6. **Les couches sont imposées par test** : `util` → `model` → `engine` → `io` → `zones`, jamais
   dans l'autre sens, et le cœur pur (`util`, `model`, `engine`) ne touche ni au DOM, ni à l'horloge,
   ni au hasard, ni au réseau. TypeScript strict, aucun `any` dans le moteur, aucune assertion `!`,
   150 lignes par fonction au plus, un cliquet contre toute régression de typage.

## Conséquences

- Les coordonnées sont réécrites au millième ; un SVG importé ressort aplati (plus de groupes, ni
  de classes), au rendu identique. Un SVG réécrit aujourd'hui doit l'être à l'identique demain : un
  changement qui déplace une coordonnée est un événement de version majeure.
- Un hôte qui embarque l'éditeur n'a rien à fournir côté styles : le script d'embarquement apporte ses
  feuilles, cantonnées à l'éditeur, et les jetons de couleur (ADR-0007) ; voir `docs/integration.md`.
- `engine/editionSvg.ts` est la seule porte d'entrée du moteur d'édition : l'implémentation vit dans
  `engine/edition/` (chemins, géométrie, lecture, écriture, opérations, couleurs, nettoyage, points,
  formes, assemblage, grille), sans cycle ; les autres couches n'importent jamais ces modules
  directement. L'écriture est verrouillée par des SVG de référence (`tests/fixtures/svg`) : tout
  écart est un événement de version majeure (`ACTUALISER_REFERENCES=1` pour le décider en connaissance
  de cause).
