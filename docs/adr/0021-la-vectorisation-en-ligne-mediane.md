# ADR-0021 — La vectorisation en ligne médiane

**Date :** 25 octobre 2026
**Statut :** acceptée (prolonge les ADR-0002, 0005 et 0018) ; aucun octet existant ne change

## Contexte

vtracer (ADR-0002) ne rend que des **contours** : chaque tache de couleur devient une forme pleine, bordée. Une
écriture manuscrite ou un dessin au trait scanné y devient des lettres creuses. Elles se découpent bien, mais le stylo
d'une machine de découpe (Cricut, Silhouette) ne remplit jamais une forme : il suit des lignes. Il dessine donc chaque
lettre **en double trait**, son bord gauche puis son bord droit. Ce qu'il faut au stylo, c'est la ligne au milieu du
trait, ouverte, d'un seul passage.

vtracer n'a pas de mode « ligne médiane », potrace non plus. Autotrace en a un, mais c'est un programme C sous GPL, à
compiler en WebAssembly et à épingler : une seconde dépendance lourde pour un seul mode, alors que le calcul tient en
quelques centaines de lignes pures.

## Décision

1. **Un quatrième mode, « Ligne médiane », dans la voie « Convertir une image »**, à côté des trois modes de vtracer
   (`ModeVectorisation` gagne `'mediane'`, `parVtracer` dit qui trace). Il passe par le même traitement (prétraitement,
   détourage, agrandissement, taille rendue) mais **ne charge jamais vtracer** : tout est dans le moteur pur
   (`engine/lignemediane.ts` et `engine/lignemediane/`), sans WebAssembly. Les modes existants, leurs options et les
   15 empreintes de `identite-sans-pretraitement` ne bougent pas.
2. **Le tuyau, dans un ordre fixe** :
   1. **masque** : l'écart de luminosité au fond (la couleur du bord avant détourage ; un pixel détouré est du fond),
      en luma entière (299, 587, 114), coupé au **seuil d'Otsu** (le milieu du palier quand tous les seuils se valent,
      celui d'un noir pur sur blanc pur). Une encre noire sur blanc comme une craie sur ardoise ;
   2. **nettoyage** : les taches du trait et les trous dans le trait de moins de N × N pixels disparaissent (un point
      blanc dans un trait épais ferait une boucle) ;
   3. **squelette** : amincissement de **Guo-Hall** (1989, A1), puis retrait des marches d'escalier (un pixel en coin
      intérieur, toujours simple, qu'un « L » de trois pixels rendrait jonction ou boucle) ;
   4. **mesure** : l'épaisseur médiane du trait (deux fois la distance euclidienne exacte au fond, Felzenszwalb et
      Huttenlocher, le long du squelette, moins un demi-pixel) et sa couleur dominante (la case la plus peuplée du
      cœur du trait ; un gris ou un noir rendent le noir, une encre bleue reste bleue) ;
   5. **graphe** : extrémités, jonctions (les pixels de jonction voisins fondus en un nœud à leur barycentre), arêtes,
      boucles sans nœud (un « o »), points isolés (celui d'un « i ») ; les **barbules** de moins de N pixels
      (extrémité–jonction) sont élaguées, une jonction gardant toujours deux arêtes ; deux jonctions proches qui forment
      un seul croisement (un « X » aigu ou épais : chaque branche de l'une prolonge une branche de l'autre, sans que les
      deux d'une même jonction se prolongent, ce qui distingue un « H ») se fondent ;
   6. **enchaînement** : à chaque jonction, les deux arêtes qui se prolongent le mieux (plus de 127°) ne font qu'un tracé,
      redressé près du nœud ; la branche qui ne traverse pas vient toucher ce pont (la jambe d'un « T » touche sa barre) ;
      deux bouts libres qui se font face, séparés d'un blanc de moins de N pixels, se **raccordent** ;
   7. **courbes** : un lissage [1, 2, 1] / 4 de l'escalier des pixels, Ramer-Douglas-Peucker pour trouver les coins
      (plus de 60° entre deux cordes), et un ajustement de cubiques par tronçon entre deux coins (`ajusterCubiques`, celui
      qui rebâtit les booléens, vérifié dans les deux sens) ; un tronçon qu'on ne sait pas ajuster garde ses cordes ;
   8. **écriture** : un dessin à plat de chemins `fill="none"`, trait de l'épaisseur voulue, bouts ronds, écrit par
      `ecrireDessin` : l'éditeur relit et réécrit ces octets à l'identique.
3. **Pourquoi Guo-Hall plutôt que Zhang-Suen.** Les deux sont parallèles en deux sous-itérations, déterministes et
   aussi simples ; mais Zhang-Suen efface entièrement un trait diagonal de deux pixels et un carré de 2 × 2 (le point
   d'un « i » écrit fin), et laisse des squelettes de deux pixels sur les diagonales. Guo-Hall garde ces cas. Les
   épaisseurs variables se règlent d'elles-mêmes (l'amincissement s'arrête quand plus rien n'est retirable) ; le masque
   est bordé d'un pixel de fond, donc le bord de l'image n'a pas de cas particulier.
4. **Des réglages qui ne sont que ce qu'on a touché** (comme l'ADR-0005) : `ReglageVecteurs.ligne` porte au plus
   l'épaisseur, le seuil, les taches, les barbules, les coupures et la couleur. Une valeur égale au défaut se retire ;
   les défauts se calculent (`valeursLigneParDefaut`) sur ce que l'image a mesuré (épaisseur, seuil d'Otsu) et sur le
   grain : taches 2, 4 ou 8 px ; barbules 0,75, 1,25 ou 2 épaisseurs ; écart des courbes 0,6, 1 ou 1,8 px ; coupures
   trois quarts d'épaisseur. L'épaisseur se voit à côté du mode et du grain ; le reste est dans les réglages fins repliés.
   Changer de grain remet les réglages fins à zéro, mais garde l'épaisseur.
5. **Bornes, refus nommés** : plus de 2048 × 2048 pixels (une source agrandie ×2), aucun trait, plus de la moitié de
   l'image en trait (« ce n'est pas un dessin au trait »), plus de 4 000 tracés, plus de cent mille points. Chaque refus
   dit quel réglage changer.
6. **Déterministe** : rien que des entiers, des `+ - * /` et des racines carrées ; des parcours en ordre de lecture des
   pixels puis par indice ; des départages par indice. La même image et les mêmes réglages rendent les mêmes octets ;
   un test garde l'empreinte d'une écriture rendue par Caveat.

## Conséquences

- Le résumé dit « N tracés · une ligne au milieu du trait » ; la vue « Contours » montre les lignes en filets ; « Ouvrir
  dans l'éditeur » ouvre des tracés ouverts éditables, sans remplissage ; une aide d'une ligne dit le lien au stylo de
  la Cricut. Le type de ligne (dessiner plutôt que couper) se choisit toujours dans Design Space, après l'import.
- Le lot (ADR-0018) convertit en ligne médiane comme dans les autres modes, sans charger vtracer.
- Preuves : `tests/unit/engine/lignemediane.test.ts` (segment, « L », « T », « X » droit et aigu jusqu'à 30 px
  d'épaisseur, « H » serré, anneau, barbule, coupure, poussières, deux écritures Caveat remplies par balayage, grain,
  octets, relecture par l'éditeur, fond sombre, couleur, seuil, bornes, réglages) ; `tests/unit/io/ligne-mediane-image.test.ts`
  (sans vtracer, détouré ou non, agrandi) ; `tests/e2e/ligne-mediane.e2e.ts` (dépôt, mode, tracés sans remplissage,
  éditeur, clavier, 390 px au doigt, axe-core).
- **Limites, honnêtement** :
  - un coin vif d'un trait épais s'arrondit : l'axe médian coupe un « L » à 45°, à une demi-épaisseur du coin ;
  - le bout d'un trait s'arrête à une demi-épaisseur de son extrémité ; le bout rond du trait écrit la rattrape, le
    stylo, plus fin, non ;
  - un croisement de moins de 37° (deux jonctions à plus de trois épaisseurs) n'est pas reconnu : une diagonale y est
    coupée en deux ;
  - le seuil est global : un scan inégalement éclairé demande le prétraitement (gamma, couleurs) ou un seuil touché ;
  - une encre jaune sur blanc a peu d'écart de luminosité au fond : le seuil d'Otsu peut la manquer ;
  - les tracés sortent dans l'ordre du balayage, pas dans un ordre qui minimise les déplacements du stylo (Design Space
    réordonne de toute façon).

## Alternatives écartées

- **Autotrace en WebAssembly** (mode centerline) : une dépendance C sous GPL de plus, à compiler et épingler, pour un
  calcul qui tient en moteur pur et testable.
- **Zhang-Suen** : voir la décision 3.
- **L'axe médian par diagramme de Voronoï des contours de vtracer** : plus exact sur les coins, mais il dépend des
  contours du traceur (une mise à jour de vtracer déplacerait la ligne médiane) et demande une géométrie robuste bien
  plus lourde.
- **Un remplissage hachuré des formes de vtracer** pour le stylo : il noircit des lettres creuses au lieu de les écrire
  d'un trait, et prend dix fois plus de temps de machine.
