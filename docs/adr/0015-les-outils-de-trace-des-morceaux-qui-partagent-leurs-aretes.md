# ADR-0015 — Les outils de tracé : des morceaux qui partagent leurs arêtes, un nœud lu sur la géométrie

**Date :** 24 octobre 2026
**Statut :** acceptée (prolonge les ADR-0001 et 0004) ; aucun octet existant ne change

## Contexte

Un logiciel de dessin offre, au-delà des booléens (ADR-0004), des outils qui changent un tracé lui-même : le
contour en forme (« Outline Stroke »), le décalage du contour (« Offset Path »), l'arrondi des angles, les types de
nœuds (angle, lisse, symétrique) avec des poignées liées, et casser, joindre, fermer ou inverser un tracé. Le
contexte Cricut (ADR-0013) en a besoin pour ses corrections. Deux difficultés se lisent dans l'historique du dépôt :

- calculer le bord d'un trait épaissi ou décalé, c'est affronter ses auto-intersections, ses coins rentrants et ses
  trous qui se referment ; et confier l'union à `polygon-clipping` avec des rectangles qui se recoupent en leur milieu
  le fait échouer : « Sans cela, l'union échouait sur la plupart des courbes » (commit `f350a85`) ;
- le SVG ne porte pas le type d'un nœud : un éditeur qui le stockerait aurait un état que le fichier ne garde pas.

## Décision

1. **Le bord se déduit d'une union de morceaux, il ne se suit pas.** Contour en forme (`engine/contour/etendre.ts`) :
   le tracé est aplati comme pour les booléens (`contour/polylignes.ts`, même borne d'écart), épaissi morceau par
   morceau (`contour/epaissir.ts`), découpé en tirets s'il en a (`contour/tirets.ts`), puis l'union des morceaux en
   établit le bord. Décaler (`contour/decaler.ts`) réutilise la même machinerie : la région peinte du chemin (sa règle,
   trous compris) **plus** le tracé de son bord épaissi de la distance vers l'extérieur, **moins** ce tracé vers
   l'intérieur ; un chemin ouvert est entouré. Recouvrements, boucles qui se croisent, angles aigus, coins rentrants,
   trous qui se referment et effacement total sortent de l'union et de la différence sans cas particulier.
2. **Deux morceaux voisins partagent exactement leurs sommets et leurs arêtes.** Chaque segment est un quadrilatère
   coupé, à chaque sommet, par la bissectrice du virage, et la jonction (pointe, arc, biseau) est une cale posée du côté
   extérieur : l'union n'a jamais à décider si un point est sur une arête ou à côté. Quand la bissectrice sortirait du
   segment (courbe serrée, segment court), ce sommet garde des extrémités perpendiculaires qui se recouvrent
   franchement, un recouvrement net plutôt qu'une incidence. L'union se fait par paires voisines, niveau par niveau
   (`contour/region.ts`, `unirAnneaux`) : une seule union de milliers de morceaux échoue sur des arêtes presque
   confondues, et quelques milliers d'arguments ferment la pile d'appels.
3. **Déterministe d'un moteur à l'autre.** Les arcs se construisent sans trigonométrie, par bissection de vecteurs
   unitaires (`contour/arcs.ts`) : des `+ - * /` et des racines carrées, jamais de `sin` ni de `cos` dont la dernière
   décimale varie d'un moteur JavaScript à l'autre (`docs/navigateurs.md`, « Reproductibilité »).
4. **Le contour en forme garde l'apparence** : la couleur du trait devient le remplissage, l'alpha du trait l'alpha du
   fond, le contour disparaît ; bouts, jonctions, limite de pointe et pointillés sont honorés. Le moteur rend des
   segments droits par défaut, comme les booléens ; `lisser` rebâtit les arcs en courbes à la tolérance près, et
   l'interface le demande toujours (`zones/actionsTrace.ts`).
5. **Arrondir les angles** (`engine/edition/arrondi.ts`) pose à chaque coin un arc de cercle écrit en cubiques d'au plus
   un quart de tour ; un nœud lisse ne bouge pas. Chaque segment ne livre à ses deux coins que sa moitié (sa totalité
   quand son autre bout n'est pas un coin) : deux filets voisins ne se recouvrent jamais, et un coin trop court pour le
   rayon prend le plus grand rayon possible, ce que le résultat dit (`reduits`, `rayonMin`).
6. **Le type d'un nœud se lit sur la géométrie** (`engine/edition/noeuds.ts`) : poignées alignées et de même longueur,
   symétrique ; alignées, lisse ; sinon angle (une extrémité, ou un nœud entre deux droites, n'en a pas). Changer de type, c'est changer la géométrie (aligner, égaliser, rentrer
   les poignées) ; glisser une poignée d'un nœud lisse ou symétrique entraîne l'autre, Alt la rompt. Rien n'est stocké
   que le SVG ne porterait pas.
7. **Couper et recoller** (`engine/edition/jonctions.ts`) : casser en un nœud, joindre deux tracés ouverts par leurs bouts
   les plus proches (en inversant au besoin) ou fermer un tracé ouvert, inverser le sens, retirer un nœud en gardant la
   courbe (la cubique d'origine est retrouvée quand les deux moitiés en viennent). Chaque opération est pure et rend le
   même dessin quand rien ne change (ADR-0001).
8. **Les garde-fous refusent en nommant, après un essai de plus.** Un tracé très enchevêtré peut mettre le moteur de
   découpe en échec : `regionDuTrait` et `decaler` réessaient à une tolérance trois puis neuf fois plus large (un autre
   aplatissement défait souvent l'incidence fautive), dans un ordre fixe qui garde le résultat déterministe, puis
   refusent : « Le contour est trop enchevêtré pour être transformé : simplifiez le tracé, puis recommencez. » Sont
   aussi refusés, nommés : une forme sans contour, un motif de plus de 20 000 tirets (`TIRETS_MAX`), un décalage vers
   l'intérieur d'un tracé ouvert. Une forme qui s'efface entièrement sous un décalage rentrant est retirée et nommée.
9. **De nouvelles références, aucune réécrite.** Quinze cas neufs dans `tests/unit/engine/ecriture-stable.test.ts`
   (`contour-etendre*`, `decaler-*`, `arrondir-angles*`, `noeuds-*`, `jonctions-*`), chacun avec son SVG d'entrée ; aucun
   ne remplace une référence d'avant. Un changement de ces sorties est un changement de géométrie écrite, donc une
   version majeure.

## Conséquences

- Les références d'avant et les 4 134 empreintes de la bibliothèque tiennent : ces outils n'écrivent que ce qu'on leur
  demande.
- Les preuves sont géométriques autant qu'à l'octet : aires attendues (longueur × épaisseur, anneau d'un cercle,
  `A - (4 - π) r²` pour un rectangle arrondi, `A + P d + …` pour un L décalé), aller-retour `d` puis `-d`, filets qui
  ne débordent pas d'un polygone convexe, déterminisme et pureté (`etendre.test.ts`, `decaler.test.ts`,
  `arrondi.test.ts`, `noeuds.test.ts`), et l'interface en navigateur (`tests/e2e/outils-trace.e2e.ts`).
- Le résultat d'un contour en forme ou d'un décalage est un polygone aplati à la tolérance (un vingt-millième de la
  forme ou du plan), puis lissé : il n'est pas la courbe exacte qu'un calcul analytique rendrait.
- Limites, honnêtement : un trait très enchevêtré reste refusé après les trois essais (le CHANGELOG l'estime à environ
  1 cas sur 75) ; la personne doit alors simplifier le tracé.

## Alternatives écartées

- **Calculer le bord décalé lui-même** (suivre le bord, puis défaire ses boucles) : chaque cas (coin rentrant, boucle,
  trou qui se referme, décalage plus grand qu'un détail) demande son traitement ; l'union et la différence les règlent
  tous.
- **Un rectangle par segment, unis tels quels** : des rectangles qui se recoupent en leur milieu font échouer
  `polygon-clipping` (en-tête de `contour/epaissir.ts`).
- **Stocker le type de nœud dans le modèle** : un état que le SVG écrit ne garderait pas, donc perdu à la relecture.
