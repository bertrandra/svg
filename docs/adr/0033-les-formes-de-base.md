# ADR-0033 — Les formes de base

**Date :** 25 octobre 2026
**Statut :** acceptée (prolonge les ADR-0001 et 0006, s’appuie sur les ADR-0008, 0011, 0015 et 0028) ; **aucune référence
d’écriture existante ne change** (`ecriture-stable` vert sans `ACTUALISER_REFERENCES`), une référence neuve, `formes-de-base`, qui
écrit une forme de chaque sorte et dix réglages. (0032 est le texte déformé dans une forme, mené à part.)

## Contexte

Demande du propriétaire : « Augmente le nombre de formes de base : carré, cercle… ». La barre traçait quatre formes derrière un
seul outil (rectangle, ellipse, étoile à cinq branches, ligne ; ADR-0006). Pour le dessin et surtout la découpe (cartes, étiquettes,
stickers sur une Cricut), il manquait les formes qu’on attend d’un logiciel de dessin : carré et cercle d’un geste, rectangle aux
coins ronds, polygones réglables, cœur, flèche, anneau percé, nuage, bulle, badge festonné, et des traits (spirale, vague) que le
stylo d’une machine écrit.

## Décision

### 1. Une forme de base est un chemin ordinaire, fait par une fonction pure

`engine/edition/formesDeBase.ts` : `formeDeBase(forme, x, y, l, h, réglages)` rend des commandes **M, L, C, Z absolues** (ADR-0001)
dans la boîte du tracé à deux coins. Mêmes entrées, mêmes commandes ; aucun arrondi dans le moteur (l’écriture arrondit au
millième, comme pour les formes d’avant). Les courbes sont des cubiques : quarts d’ellipse à la constante de `formes.ts`, arcs de
cercle découpés en morceaux d’au plus un quart de tour (`k = 4/3 · tan(θ/4)`), cœur en six cubiques symétriques choisies. Une forme
« en fractions de boîte » se construit dans une boîte unité puis s’étire à la boîte tracée, sa **boîte exacte** (extrema des
courbes compris, `boiteChemin`) devenant celle qu’on a tracée : une goutte, un nuage ou un badge remplissent la boîte au pixel près.

**Les formes d’avant ne changent pas d’un octet** : rectangle, ellipse, étoile (5 branches, creux 0,4) et ligne passent par les
fonctions de `formes.ts`, inchangées ; `formeDeBase('rectangle' | 'ellipse' | 'etoile')` rend exactement leurs commandes (test).
`ajouterForme` reçoit une règle de remplissage facultative, `nonzero` par défaut.

**La forme posée ne garde pas ses réglages.** C’est un chemin comme un autre : pas de champ nouveau dans `Forme`, rien dans le
format de projet (ADR-0030), rien dans le SVG. Garder les réglages modifiables après la pose (une « forme vivante ») demanderait un
champ du modèle, sa migration et sa garde à chaque opération qui touche le tracé, pour un gain faible : annuler (Ctrl+Z) et
retracer coûte un geste. Les réglages vivent dans la session et valent pour la forme suivante.

### 2. Le catalogue : vingt-six formes en cinq rubriques

| Rubrique | Formes (réglages, défaut) |
|---|---|
| Basiques | rectangle (R), carré, rectangle arrondi (rayon des coins, en unités du plan, un quarantième du plan au départ, borné à la moitié du petit côté), ellipse (E), cercle |
| Polygones | triangle (isocèle ou droit), losange, parallélogramme, trapèze, polygone régulier (3 à 12 côtés, 6), étoile (S ; 3 à 20 branches, 5 ; creux 10 à 75 %, 40 %) |
| Symboles | cœur, flèche (simple ou double ; vers la droite, la gauche, le haut, le bas), croix (bras de 10 à 80 % de la boîte, un tiers), anneau (épaisseur de 5 à 90 % du rayon, 30 %), demi-cercle (demi ou quart), goutte, lune en croissant, nuage |
| Étiquettes | étiquette à bout coupé, badge festonné (6 à 24 festons, 12), bulle de dialogue |
| Traits | ligne (L), arc, spirale (1 à 10 tours, 3), vague (1 à 12 ondulations, 3) |

Chaque réglage hors bornes y est **ramené** (`bornerParametres`), jamais refusé ; les entiers sont arrondis. Le carré et le cercle
sont le rectangle et l’ellipse contraints : ils écrivent les mêmes octets qu’un rectangle ou une ellipse tracés avec Maj.

- **L’anneau** est l’ellipse de la boîte et un trou concentrique **parcouru en sens inverse**, en `evenodd` : le trou reste vide
  pour la règle du fichier comme pour un outil qui l’ignore (Design Space, un export DXF).
- **Les traits** (ligne, arc, spirale, vague) sont ouverts et prennent le style d’une ligne (la couleur du contour, sans fond) : la
  règle de l’ADR-0028 les propose « À écrire » en Cricut, sans rien de plus. La spirale est faite de demi-cercles de rayon croissant
  autour de deux centres voisins (tangentes continues, extrema sur les ancres) ; la vague, d’une cubique par demi-onde dont le
  sommet tombe exactement au milieu.

**Écartées**, pour garder la palette lisible : l’arc ouvert d’angle réglable (l’arc et le demi-cercle couvrent l’usage, la plume le
reste), la flèche courbe et la flèche à trois branches (une flèche se tourne, une courbe se fait à la plume), l’engrenage, le
blason et le cadre décoratif (la bibliothèque de formes en a des centaines, ADR-0003), le triangle quelconque (un polygone se règle
point par point), la croix en X (la croix tournée de 45°), une étiquette percée (un cercle soustrait suffit, ADR-0004), le
pentagone et l’hexagone en entrées à part (le polygone les propose en tête de sa liste, avec leur nom).

### 3. L’interface : la barre garde le fréquent, la palette porte le reste (ADR-0006)

Les formes restent derrière **un seul outil** : le bouton reprend la dernière forme employée (comme les outils récents d’un logiciel
de dessin), le chevron accolé, nommé **« Formes (F) »**, ouvre la palette. La palette est un vrai menu (`MenuDeroulant` en mode
`grille`) : un seul `role="menu"` nommé « Formes », un `role="group"` par rubrique nommé par son titre visible, et une tuile par
forme, `menuitemradio`, son icône, son nom et sa lettre s’il en a une ; la forme du bouton y est cochée (filet cyan et voile à 7 %,
un état, pas une action : aucune action pleine dans la palette). Trois colonnes au bureau, deux sous 480 px ; des tuiles de 32 px à
la souris, 44 au doigt ; le panneau défile dans la hauteur de l’écran sans déborder de sa largeur. Les icônes sont tracées par le
moteur lui-même dans la case de 24 des icônes de la barre, au trait de 1,75, `currentColor`.

Les réglages se font dans le panneau du dessin quand un outil de forme est choisi : une section **« Forme à tracer »** (ouverte)
montre l’icône et le nom de l’outil, ses champs (listes pour les choix et les entiers, curseurs pour les parts, un champ chiffré
pour le rayon) et une aide d’une ligne. Le carré et le cercle n’en ont pas : ils disent qu’ils restent carrés.

**Maj** contraint les proportions de toute forme pendant le tracé (une boîte carrée ; une ligne à 45° près), comme il le faisait
déjà pour le rectangle, l’ellipse et l’étoile. **Alt** ne trace pas depuis le centre : ce n’était pas la règle, et Alt+clic sur la
toile est déjà « la forme du dessous » (ADR-0029) ; on ne l’ajoute pas ici.

### 4. Le clavier (ADR-0011)

- **F** ouvre la palette, le focus sur la forme cochée ; les **flèches** gauche et droite suivent l’ordre (en boucle), haut et bas
  changent de rangée vers la tuile la plus proche en largeur, même d’une rubrique à l’autre (`voisinVertical`, pur, dans
  `util/menu.ts`) ; Début et Fin aux bouts ; **Entrée** choisit et rend le focus au bouton ; Échap ferme. R, E, S, L gardent leur
  sens. F n’était pris par rien ; Ctrl+F reste la recherche du navigateur.
- Le **tracé à deux coins** au réticule (Espace, flèches, Espace) et la **pose à la taille par défaut** (Entrée) marchent pour toutes
  les formes ; une forme plus large que haute (flèche, vague, demi-cercle, étiquette…) se pose au clavier dans sa proportion, la
  largeur du carré d’avant gardée ; les formes d’avant restent carrées (les tests d’avant passent tels quels).
- La région vocale dit l’outil (« Outil cœur : flèches déplacent le réticule… ») et la forme posée, au clavier comme à la souris :
  « Forme 2 ajoutée et sélectionnée : cœur, fond rouge #c81e28, 120 × 110 à 150, 100. » (la phrase de l’ADR-0011, dont le genre
  nomme maintenant la forme de base ; au glisser, la forme posée se disait seulement « sélectionnée »).

### 5. Le nom d’une forme se lit sur sa géométrie

`genreDeForme` (`engine/description.ts`) garde ses règles et y ajoute `reconnaitreFormeDeBase` : une forme « en fractions de boîte »
se ramène à sa boîte de points (ancres et poignées) et se compare, à 0,2 % près, aux modèles faits une fois par la même fonction
dans la boîte unité, rangés par suite de commandes (au plus 64 commandes ; au-delà, rien n’est comparé). La boîte de points est
invariante par déplacement et par étirement dans les axes : une forme garde son nom tant qu’on ne fait que la déplacer, l’étirer,
la recolorer ou l’écrire puis la relire. Quatre formes à réglage continu se reconnaissent par leur structure : l’étoile (2N sommets,
pointes et creux sur deux ellipses semblables, même étirée : « étoile » à cinq branches, « étoile à 8 branches » sinon), la croix
(douze sommets à bords droits, symétrique), l’anneau (deux ellipses concentriques) et le rectangle arrondi (quatre cubiques, toutes
les ancres sur les bords de la boîte, aucune dans un coin).

Les noms : « carré » et « cercle » tant que la boîte est carrée (un cercle reste « cercle », un rectangle arrondi au rayon maximal
d’un carré aussi), « hexagone », « pentagone », « octogone », « polygone à 7 côtés », « losange », « demi-cercle » ou « demi-ellipse »,
« quart de cercle », « flèche double », « badge festonné », « bulle de dialogue »… Deux descriptions d’avant deviennent plus justes :
un losange d’un fichier se dit « losange » (et non « polygone à 4 sommets »), un `<rect rx>` « rectangle arrondi » (et non « tracé
courbe »), comme le premier calque du dessin d’exemple. Rien ne s’écrit : le nom se calcule à l’affichage.

## Conséquences

- `OutilForme` est le type `FormeDeBase` du moteur ; `FORMES` (`zones/aidesEditeur.ts`) en est l’ensemble. Le curseur en croix suit
  la classe `trace-forme` du cadre plutôt qu’une liste d’outils.
- Les réglages sont un état d’interface (`EtatInterface.parametres`, `poserParametres`), jamais écrits ni gardés d’une ouverture à
  l’autre ; `demandeFormes` et `ouvrirFormes` portent le raccourci F jusqu’au bouton.
- Une forme de base nouvelle : sa fonction dans `formesDeBase.ts` (en fractions de boîte si possible, pour qu’elle se reconnaisse),
  son modèle dans `lesModeles`, sa fiche (nom, genre, trait, proportion), son icône, sa place dans une rubrique de `GROUPES_FORMES`,
  et une ligne de plus dans la référence `formes-de-base` (une référence neuve, jamais une réécriture). Cette référence part d’un
  fichier d’entrée existant (`plan-dimensions`, vidé) : un SVG de départ de plus changerait le corpus du fuzzing déterministe
  (`tests/unit/securite/fuzz.test.ts`, qui prend toutes les entrées de `tests/fixtures/svg`) et ses tirages.
- La palette est le premier menu en grille : `MenuDeroulant` le sait faire pour d’autres (`grille`, `titreMenu`, `demandeOuverture`).
