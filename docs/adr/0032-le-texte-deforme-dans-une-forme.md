# ADR-0032 — Le texte déformé dans une forme

**Date :** 25 octobre 2026
**Statut :** acceptée (amende l’ADR-0031, s’appuie sur les ADR-0004, 0008, 0011, 0021, 0022, 0027, 0028 et 0030) ; **aucune
référence d’écriture existante ne change** (`ecriture-stable` vert sans `ACTUALISER_REFERENCES`, `texte-dans-forme` intacte),
une référence neuve, `texte-enveloppe`.

## Contexte

Demande du propriétaire : « Dans la forme, le texte doit prendre la forme de la forme. » Question posée (lettres droites rangées
autrement, ou lettres déformées ?), réponse : **lettres déformées**, comme la « déformation par enveloppe » d’un logiciel de
dessin : le texte entier est étiré et courbé pour remplir le contour (cœur, cercle, étoile) ; le bloc a la silhouette de la forme.
Jusqu’ici, « Dans la forme » (ADR-0031) remplissait la forme ligne à ligne, lettres droites.

## Décision

### 1. Un troisième mode de disposition, sans toucher aux deux autres

`DispositionTexte` gagne `{ mode: 'enveloppe', forme, marge }` (`engine/edition/types.ts`) : la forme par son identifiant, comme
les autres modes, et une marge intérieure en part de la taille (**0,05** par défaut). Rien d’autre : ni « ajuster » (la taille se
calcule toujours, § 3), ni « justifier » (les lignes gardent leur alignement dans le bloc, puis tout le bloc se déforme).
`'sur'` et `'dans'` ne changent pas : un texte posé en lignes se relit, se recompose et se réécrit **à l’octet** (la référence
`texte-dans-forme` reste verte sans actualisation). Un seul mode de correspondance (§ 2) : pas de champ pour en choisir un autre.

### 2. La correspondance : une enveloppe verticale

Le texte se compose d’abord en ligne droite, toutes ses lignes, à sa taille (`composerBloc`, inchangé). Sa **boîte** est celle de
ses contours **pleins** (même en tracé Médian, § 5). Un point d’abscisse relative u et d’ordonnée relative v dans cette boîte va :

- à l’abscisse **X = x0 + u (x1 − x0)** de la forme (sa boîte, rétrécie de la marge à gauche et à droite) ;
- puis à **Y = haut(X) + v (bas(X) − haut(X))**, entre le bord haut et le bord bas de la forme à cette abscisse, rapprochés de
  la marge (une colonne plus courte que deux marges se réduit à son milieu).

Le haut et le bas sont les intersections de la verticale X avec le **contour extérieur** de la forme : le polygone de plus grande
aire de ses sous-chemins (chaque courbe en 48 cordes, `trace.ts`). Sur une tranche entre deux abscisses de sommets, les arêtes d’un
polygone simple sont des droites qui ne se croisent pas : chaque bord y est une seule arête, lue une fois. Le **profil** (les deux
bords, tranche par tranche) se construit par un balayage, se lit par dichotomie, et se mémorise par chemin (ADR-0008).

Pourquoi elle : chaque colonne du texte reste une colonne, les lignes de base se courbent avec les bords ; sur un **rectangle**,
c’est une simple mise à l’échelle (l’identité à l’échelle près, testée) ; sur un cercle, un cœur, une ellipse, une bulle, un
polygone convexe — toute forme que chaque verticale ne rencontre que deux fois —, c’est **exactement** l’intersection proposée
par le propriétaire. Le texte reste dans la forme par construction (chaque point est sur un segment vertical intérieur).

**Les formes repliées** (les branches du bas d’une étoile, la queue d’une bulle) coupent certaines verticales en plusieurs
morceaux. La plus haute et la plus basse intersection sauteraient alors au pied de chaque branche : le texte se déchirerait, et
une lettre à cheval sur le saut sortirait de la forme (essayé : des lettres coupées net, des éclats verticaux). La règle retenue :

- à chaque abscisse, on garde le morceau de la verticale **le plus proche de la ligne du milieu** de la forme (une branche détachée
  du corps à cette abscisse ne prend pas la colonne) ;
- là où ses bords sautent d’un morceau à l’autre (où une branche rejoint le corps), le saut s’adoucit en une **rampe de pente
  fixe** (deux unités de hauteur par unité de largeur, `PENTE_RAMPE`), du côté où le morceau s’élargit : la colonne descend dans la
  branche sans déchirure, et reste dans la forme.

Sur une étoile à cinq branches pointe en haut, le texte remplit la pointe du haut, le corps et les bras ; les deux branches du bas
ne se remplissent qu’en partie (la rampe y descend depuis leur pied). C’est dit dans les limites.

### 3. La taille, la marge, la tolérance

La **taille** d’un texte déformé se calcule (comme « ajuster » dans une forme) : la hauteur de la forme sur la hauteur du bloc
(mesurée une fois sur les contours pleins, à une grande taille pour que l’arrondi n’y pèse pas), au centième vers le bas, divisée
par l’échelle de la matrice. Les lettres de la plus haute colonne ont ainsi à peu près leur taille : la **marge** (0,05 de la
taille par défaut ; une ligne seule : 5 % de la hauteur de la forme) et les tolérances se lisent en part d’elle. Le champ de la
taille, dans la barre et le panneau, devient inactif et dit pourquoi (« La forme donne la taille du texte déformé : agrandissez la
forme pour agrandir le texte. »). La taille calculée s’écrit dans `data-ed-taille` ; redevenu libre, le texte garde cette taille.

### 4. Les contours, rebâtis en courbes

Chaque segment de chaque lettre (droit, quadratique, cubique, et le retour d’un `Z` quand il n’est pas nul) est échantillonné
(un pas de **0,03 taille** dans le plan après déformation, de 4 à 48 pas), ses points envoyés par l’enveloppe, puis **rebâti en
cubiques** par `ajusterCubiques` (`edition/ajustement.ts`, celui des booléens, ADR-0004, et de la ligne médiane, ADR-0021), à une
tolérance de **0,002 taille**, vérifiée dans les deux sens ; une pièce droite à la tolérance près s’écrit en `L`, un ajustement
impossible garde les points en segments. Les **tangentes des bouts** sont celles du segment d’origine, envoyées par la même
enveloppe (une différence centrée, la même des deux côtés d’un nœud) : un coin reste un coin, une jonction lisse reste lisse. Un
retour de `Z` qui reste droit n’est pas écrit (le `Z` le trace). Coordonnées arrondies au millième. Rien que des `+ − × ÷` et des
racines carrées, des tris stables, des itérations bornées : **mêmes entrées, mêmes octets**, d’un moteur à l’autre.

Mesure (Inter, 40 lettres sur deux lignes dans un cœur de 270 × 255 unités, `tests/unit/engine/texte-enveloppe.test.ts`) :
**19 ms** (médiane de cinq, Node 22, machine de développement au repos ; 39 ms quand toute la suite tourne en parallèle). La
composition se mémorise par forme immuable, par fonte et par texte (`composerDispose`, ADR-0008), le profil par chemin : un geste
qui ne change ni la forme ni le texte ne recompose rien ; une frappe recompose le bloc (une vingtaine de millisecondes).

### 5. Le texte reste vivant

- **Recomposition** : le calcul vit dans `engine/texte/enveloppe.ts` (`profilDe`, `bordsA`, `enveloppeDe`, `deformerChemin`,
  `poserEnveloppe`, `tailleEnveloppe`), appelé par `composerDispose` comme les deux autres modes ; le lien (la forme change, le
  texte se redéforme dans la même entrée d’historique ; elle disparaît, il redevient libre ; masquée, elle garde le lien) est celui
  de l’ADR-0031, sans une ligne de plus.
- **Saisie sur la toile** (ADR-0027) : elle marche telle quelle. Les **curseurs** sont ceux du texte droit (`miseEnPage`), du bas
  au haut du cadratin, **envoyés par la même enveloppe** : une colonne restant une colonne, le curseur reste un trait vertical,
  posé sur la lettre déformée ; la sélection se dessine lettre à lettre entre deux curseurs voisins ; ↑ et ↓ mènent à la ligne
  voisine. Le champ invisible reste droit (comme sur un tracé).
- **Tracé Médian** (ADR-0027) : c’est la **ligne médiane de la lettre droite** (`glyphesMedians`, une seule source de calcul) qui
  se déforme, dans la boîte des lettres **pleines** : le texte médian occupe la même place que le texte plein, et ses curseurs sont
  les mêmes (testé).
- **Couper ou écrire** (ADR-0028) : la règle ne change pas, le texte déformé plein se coupe, en tracé Médian il s’écrit.
- **Refus nommés, sans lever** : un texte qui ne dessine rien (`texte-vide`), une forme sans intérieur — un trait ouvert, un
  polygone plat (`forme-sans-aire`) —, une marge qui mange la forme (`marge`) rendent une pose sans lettre et sa raison
  (`Pose.refus`) ; l’interface le dit (« Cette forme n’a pas d’intérieur : le texte ne peut pas s’y déformer. Choisissez une forme
  fermée (un cercle, un cœur…). ») et ne pose rien ; un texte déjà déformé dont la forme perd son intérieur garde ses contours
  (ADR-0031) et le panneau dit pourquoi.

### 6. Le fichier et le projet

- **SVG** : le `<path>` d’un texte déformé s’écrit comme tout texte posé (ADR-0031 § 4) : contours, `data-ed-*`, puis
  `data-ed-disposition="enveloppe"`, `data-ed-marge` **seulement** s’il diffère de 0,05, puis le lien (`data-ed-forme`, ou le tracé
  encodé d’une forme masquée). Aucun autre attribut, aucun `<text>`. La relecture prend la marge à sa forme exacte et dans ses
  bornes ; illisible, le texte reste en contours et c’est dit. Les invariants d’écriture admettent la valeur `enveloppe`. Un texte
  déformé relu est un point fixe. Les exports n’écrivent que des contours.
- **Projet JSON** (ADR-0030) : `disposition: { mode: 'enveloppe', forme, marge }`, validée sans lever (la marge entre 0 et 100,
  sinon « la marge d’un texte déformé dans une forme… »), aller-retour à l’identique, octet pour octet. **Le format reste en
  version 1** : la valeur est un ajout, aucun projet existant ne change d’un octet ; une version plus ancienne du site refuse un
  projet qui en porte une en le nommant (« la disposition d’un texte n’est ni « sur », ni « dans »… »), sans lever.

### 7. L’interface

- **La barre de texte** : « Dans la forme » (même icône, même place, ADR-0031) pose désormais le texte **déformé** ; l’infobulle
  dit « Dans la forme : le texte se déforme pour prendre la silhouette d’une forme fermée ». La pose se dit : « Texte déformé dans
  tracé courbe 2 : il en prend la silhouette. « Plus d’options » le remplit en lignes ; Ctrl+Z annule. » Un texte **déjà posé en lignes**
  montre « Dans la forme » choisi et **garde son rendu** (le bouton ne le change pas). Le menu de la sélection (« Poser le texte dans
  la forme ») et la rubrique « Disposition » de la barre resserrée (au doigt, sous 640 px) déforment aussi.
- **Le panneau Texte** (« Plus d’options ») : dans le groupe « Disposition », un choix **« Remplir »** de deux boutons à état,
  « En déformant les lettres » et « En lignes » (jamais pleins) ; il bascule sur la même forme, garde l’alignement, et le dit
  (« Le texte se déforme pour prendre la silhouette de la forme. » / « Le texte remplit la forme en lignes, ses lettres droites. »).
  Déformé : la marge, et une aide (« Les lettres s’étirent et se courbent jusqu’au bord de la forme ; la taille se calcule d’après
  elle. ») ; en lignes : la marge et « Ajuster la taille », comme avant.
- **Clavier, région vocale, axe** : tout passe par des boutons et des champs ; la région vocale dit la pose, la bascule et le refus ;
  axe-core sans violation grave en clair et en sombre, panneau ouvert, et à 390 px au doigt ; aucune règle désactivée.

## Conséquences

- **Octets** : aucune référence existante ne bouge ; une neuve, `texte-enveloppe` (un cœur portant deux lignes à la marge par
  défaut, une ellipse masquée portant un texte en tracé Médian à la marge 0,2, une étoile portant un mot).
- **Tests nouveaux** : `tests/unit/engine/texte-enveloppe.test.ts` (profil d’un rectangle, d’un cercle, d’un cœur, d’une étoile
  sans saut et dans la forme, trous ignorés ; enveloppe identité sur un rectangle, marge ; chemin rebâti dans sa tolérance, coin et
  jonction lisse gardés ; lettres dans la silhouette d’un cercle, d’un cœur, d’une étoile ; curseurs ; Médian ; refus ; déterminisme
  et mémoire ; forme modifiée, supprimée, masquée ; écriture, relecture, bornes, ancien « dans » intact ; projet JSON ; temps),
  `tests/unit/zones/disposition.test.ts` (la pose, la bascule, les refus, couper ou écrire, les phrases),
  `tests/e2e/texte-enveloppe.e2e.ts` (cœur depuis la barre, retaper, forme déplacée puis supprimée, « En lignes » et retour, marge,
  Médian, fichier, menu de la sélection, axe en clair et en sombre, 390 px au doigt, captures), et `tests/e2e/texte-forme.e2e.ts`
  amendé (le remplissage en lignes passe par « Remplir : En lignes »).
- **Fichiers touchés** : `engine/texte/enveloppe.ts` (neuf), `disposition.ts`, `pose.ts` (`refus`), `vivant.ts`,
  `edition/types.ts`, `edition/texteVivant.ts`, `editionSvg.ts`, `model/projet.ts`, `engine/projet.ts` ; côté interface
  `ChoixDisposition.tsx`, `InspecteurDisposition.tsx`, `InspecteurTexte.tsx`, `BarreTexte.tsx`, `DispositionToile.tsx`,
  `actionsDisposition.ts`, `actionsTexte.ts`, `phrasesDisposition.ts`, `contexteSaisie.tsx`, `commun/Nombre.tsx` (`raison`), une
  règle de `editeur.css`.
- **Limites, honnêtement** :
  - les **branches du bas d’une étoile** ne se remplissent qu’en partie (§ 2), et une lettre qui tombe dans un bras étroit devient
    très mince ; les deux bouts du texte se pincent aux extrémités gauche et droite de la forme (c’est la silhouette) ;
  - la marge est un retrait horizontal et vertical, pas un décalage exact du contour ; les **trous** de la forme et ses autres
    morceaux sont ignorés (le texte passe sur un trou) ;
  - la boîte du bloc est celle de son encre : taper une lettre à jambage (« g ») ou à accent change la boîte, et tout le bloc se
    redéforme un peu ; la taille n’est pas réglable (elle se calcule) ;
  - le champ invisible de la saisie reste droit ; les quadrilatères de la sélection sont droits entre deux curseurs voisins ;
  - Design Space n’a pas été essayé (le fichier n’y porte que des contours, comme tout texte vivant).

## Alternatives écartées

- **Une grille de Coons** (quatre côtés interpolés) : il faut choisir quatre coins sur un contour qui n’en a pas (un cercle, un
  cœur), et un carreau de Coons se replie sur une forme concave — précisément le cas où il devait aider. Notre enveloppe est un cas
  dégénéré sans coins à choisir (les côtés gauche et droit réduits aux deux points extrêmes) ; on n’ajoute donc pas de second mode.
- **Une enveloppe rayonnante** (le carré du texte envoyé rayon par rayon depuis le centre) : essayée ; l’interligne d’un texte de
  deux lignes devient un trou au centre de la forme, et sur une étoile les lettres partent en éventail illisible.
- **Les bords parcourus à leur avance** (le haut et le bas mesurés par leur course horizontale, l’un attendant l’autre dans un repli) :
  essayés ; sans déchirure, mais les colonnes se croisent ou partent en éventail au pied des branches, et les lettres s’y froissent.
- **La plus haute et la plus basse intersection, telles quelles** : exactes sur un cœur ou un cercle, elles sautent au pied de
  chaque branche d’une étoile ; le texte se déchire et des lettres sortent de la forme. La rampe garde l’exactitude ailleurs.
- **Répartir le texte à aire égale** (une colonne d’autant plus large que la forme y est haute) : essayé ; les lettres des bouts
  deviennent des filets et le texte n’atteint plus les pointes. L’abscisse proportionnelle, proposée par le propriétaire, reste.
- **Déformer « Dans la forme » sans garder les lignes** : le remplissage en lignes reste au panneau, et un texte déjà posé en lignes
  le garde : aucun fichier existant ne change de rendu.
- **Une nouvelle version du format de projet** : la valeur est un ajout ; changer de version aurait réécrit tous les projets.
