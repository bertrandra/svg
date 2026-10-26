# ADR-0012, annexe 4 — Texte vivant, effets, images

## Partie A — Le texte vivant

### 1. Ce qu'on garde, et ce qu'on écarte

Aujourd'hui (`engine/texte.ts`, ADR-0004 §2) le texte se **convertit tout de suite** : `composer` rend une
`Lettre` par caractère visible (ou une par ligature), `ajouterTexte` pose autant de formes, plus rien ne se
souvient du texte. `Glyphes` (`unitesParEm`, `contour`, `avance`, `crenage`, `ligature?`) isole le lecteur de
fonte (`io/polices.ts`) du calcul pur, qui reste pur.

Le texte vivant est un **objet** : la chaîne, la fonte, la taille, l'interlettrage, l'interligne,
l'alignement, la boîte, les ligatures (`TexteVivant`, annexe 1 §3). Il reste modifiable jusqu'à ce qu'on le
convertisse en contours.

### 2. Comment il s'écrit — quatre options pesées

| Option | Portabilité | Déterminisme | Licence | Verdict |
|---|---|---|---|---|
| **(a)** `<text font-family="Inter">` | Mauvaise : la fonte doit exister chez le lecteur ; sans elle, substitution, avances et crénage différents ; Illustrator, Inkscape, les convertisseurs PDF diffèrent entre eux | Aucun (le rendu dépend de la machine) | Neutre | Rejetée |
| **(b)** `<text>` + `@font-face` en `data:` | Moyenne : navigateurs oui ; Illustrator, Inkscape (0.92), plupart des chaînes PDF ignorent `@font-face` | Bon | **Délicate** : un sous-ensemble de fonte est une version modifiée (la SIL OFL attache des conditions aux noms réservés) ; une fonte déposée par l'utilisateur a une licence inconnue ; 20 à 200 Ko par fonte | Rejetée |
| **(c)** Contours + attributs `data-ed-*` qui permettent de rouvrir le texte | **Totale** : un `<path>` se rend partout, à l'identique | **Totale** : mêmes octets (fontes épinglées par empreinte) | Aucun fichier de fonte ne sort ; la sortie rendue d'une fonte OFL n'est pas la fonte | **Retenue** |
| **(d)** Contours + `<metadata>` ou JSON dans un commentaire | Totale | Totale | Idem | Rejetée : un commentaire est retiré par bien des outils, des attributs survivent |

**L'amendement.** La règle de `CLAUDE.md` (« le texte est une forme par lettre … jamais de `<text>` dans un
SVG écrit ») et l'ADR-0004 §2 se **précisent**, sans que « jamais de `<text>` » bouge :

> Un texte vivant est **une** forme : les contours composés du texte, écrits en un seul `<path>`, avec de
> quoi le rouvrir (`data-ed-*`). « Convertir en contours » le remplace par un groupe d'**une forme par
> lettre** (le comportement d'aujourd'hui). Aucun SVG écrit ne contient `<text>`.

Le `<path>` unique est écrit en `nonzero` (les contours de glyphes se creusent par leur sens, et deux
lettres qui se chevauchent s'unissent) ; l'outil « Texte en formes » actuel (une forme par lettre) reste
disponible tant que le mode est `plat`, et sous le nom « Texte en contours » ensuite.

### 3. Les octets d'un texte vivant

```xml
<path d="M…Z M…Z" fill="#1f5f3f" role="img" data-ed-texte="Joyeux%20Noël" data-ed-police="oswald" data-ed-taille="48" data-ed-boite="300"><title>Joyeux Noël</title></path>
```

Attributs `data-ed-*`, **dans cet ordre**, chacun **absent quand il vaut son défaut** :
`texte`, `police`, `famille` (seulement si `police` commence par `u:`), `taille`, `interlettrage` (défaut 0),
`interligne` (1.2), `alignement` (gauche), `ligatures` (`1` si vrai), `boite` (largeurBoite), `origine`
(`x y`), `matrice` (`a b c d e f`). `texte`, `famille` et `data-ed-nom` sont **encodés en pourcentage**
(annexe 2 §6) pour survivre au nettoyage. Le nom accessible est le `<title>` enfant (non encodé, échappé
`& < >`) ; `role="img"` précède les `data-ed-*`. Un `<path>` avec enfant `<title>` n'est plus auto-fermant :
c'est la seule balise de l'écriture qui ait un enfant, d'où un test dédié.

**Aller-retour.** La lecture d'un `<path data-ed-texte>` pose `texte` et **garde `d` tel quel** : elle ne
recompose jamais à l'ouverture (rapide, déterministe, indépendante de la fonte présente). Toute donnée
`data-ed-*` hors bornes (texte de plus de 10 000 caractères, taille ≤ 0 ou > 10⁶, matrice dégénérée, fonte
inconnue du format) est abandonnée **en le disant** (`ignores` : « les données d'édition d'un texte sont
illisibles : il reste en contours ») et la forme reste un chemin ordinaire.

**Édition.** L'interface demande la composition à `io/polices` (asynchrone : charger la fonte) puis passe le
résultat à une opération **pure** `poserTexte(dessin, id, texte, d)` ; le moteur ne charge rien et ne
suppose aucune fonte. `composerBloc(texte, glyphes)` (nouveau, pur, à côté de `composer` qu'il réutilise sans
le modifier : les cas texte de `ecriture-stable.test.ts` le gardent) ajoute alignement, interligne et retour
automatique à la largeur de boîte (par mots, glouton ; un mot plus long que la boîte se coupe par caractères ;
déterministe).

**Fonte absente** (fichier ouvert sur une autre machine, fonte déposée non rechargée) : les contours restent ; le
panneau grise le champ de texte et dit « Police absente : Mafonte — la déposer, ou en choisir une autre »
(choisir une autre recompose, donc change l'aspect : on le demande). Une fonte déposée n'est **jamais**
écrite dans le SVG : seulement `u:` + l'empreinte du fichier (`util/empreinte.ts`) et son nom de famille.

**Conversion en contours** : `convertirEnContours(dessin, id)` remplace la feuille par un groupe nommé
« Texte « … » » contenant une forme par lettre (la sortie de `composer`), peinture et effets de la feuille
reportés. Test : la réunion des lettres a les mêmes commandes que `d`. Une entrée d'historique.

**Accessibilité.** Dans l'éditeur : le texte est un nœud nommé par sa chaîne (« texte « Joyeux Noël », Oswald
48, 2 lignes »), le champ du panneau est un `<textarea>` étiqueté, tout réglage a son équivalent clavier
(c'est un formulaire), et le message d'état dit la conversion. Dans le SVG écrit : `role="img"` et `<title>`.
En outre, un lecteur d'écran lit désormais le texte d'un fichier produit, ce que les contours seuls
interdisaient.

**Texte sur tracé** (bonus) : `TexteVivant.surChemin?: { forme: string; decalage: number }` ferait dépendre
une feuille d'une autre (l'id d'une feuille cible) : les transformations, la suppression et la copie devraient
propager la dépendance. Reporté **après** la bascule (étape 14) ; `<textPath>` reste refusé, nommé.

**`<text>` d'un fichier étranger** (étape 13) : la lecture pure ne peut ni charger une fonte ni composer. Elle
rend une feuille `texte` à `d: []` et la liste `aComposer` ; la page compose (fontes livrées, substitution
dite) **avant d'ouvrir** l'éditeur. Pris en charge : `x y dx dy`, `text-anchor`, `font-family` (premier nom qui
correspond à une fonte livrée, sinon Inter et une phrase d'`ignores` qui nomme la substitution),
`font-size`, `letter-spacing`, `<tspan>` de lignes (`x`/`dy`). Dits : le style propre à une portion
(`<tspan fill=…>`), `word-spacing`, `textLength`, `rotate`. Refusés : `<textPath>`, `writing-mode` vertical.

## Partie B — Les effets

### 1. Le sous-ensemble

Deux effets, portés par une feuille ou un groupe (`Effets`, annexe 1) : le **flou** (`feGaussianBlur`,
isotrope ou non) et l'**ombre portée**. Rien d'autre à l'écriture. Raisons : tout navigateur, tout moteur de
rendu SVG sérieux (Inkscape, Illustrator, resvg, librsvg, Batik) les rend de la même façon ; ils n'ont besoin
d'aucun autre calque ; leur étendue est calculable (la boîte visuelle de `ajusterPlan`).

### 2. Les formes exactes écrites

Flou seul :

```xml
<filter id="ed-f-…" filterUnits="userSpaceOnUse" x="…" y="…" width="…" height="…" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="s"/></filter>
```

Ombre seule (la forme **décomposée**, pas `feDropShadow` : celui-ci n'est pas connu d'Illustrator ni des
Inkscape anciens) :

```xml
<feGaussianBlur in="SourceAlpha" stdDeviation="s" result="a"/><feOffset in="a" dx="dx" dy="dy" result="b"/><feFlood flood-color="#rrggbb" flood-opacity="o" result="c"/><feComposite in="c" in2="b" operator="in" result="d"/><feMerge><feMergeNode in="d"/><feMergeNode in="SourceGraphic"/></feMerge>
```

Flou et ombre : la même ombre, puis `<feGaussianBlur in="SourceGraphic" stdDeviation="sf" result="e"/>` et
`<feMerge><feMergeNode in="d"/><feMergeNode in="e"/></feMerge>`. **La région** est toujours explicite et
calculée : boîte visuelle du nœud (`boiteAvecTrait` des feuilles, ∩ découpe) élargie de `3 × max(écarts) +
max(|dx|, |dy|)`, arrondie vers l'extérieur à la précision d'écriture. Le défaut de la spécification
(−10 % / 120 % de la boîte) rognerait un flou large. `color-interpolation-filters="sRGB"` est **toujours**
écrit : le défaut (linearRGB) varie d'un moteur à l'autre pour les couleurs.

### 3. Lecture

Pris en charge : un `<filter>` dont les primitives sont, à l'attribut `in`/`result` près, (i) un seul
`feGaussianBlur` sur `SourceGraphic` ; (ii) un seul `feDropShadow` ; (iii) la chaîne décomposée ci-dessus ;
(iv) (ii) ou (iii) suivi d'un `feGaussianBlur` sur `SourceGraphic` fusionné. `stdDeviation` à un ou deux
nombres ; `dx`, `dy`, `flood-color` (toute couleur lue par `peinture.ts`), `flood-opacity`. Les unités de
filtre et de primitive (`filterUnits`, `primitiveUnits`) se résolvent comme les autres unités (annexe 1).
Toute autre primitive (`feTurbulence`, `feMorphology`, `feDisplacementMap`, `feImage`…) : le SVG est
**refusé en nommant la primitive** (« un filtre (feTurbulence) »), exactement comme l'ADR-0009 le fait pour
« un filtre » aujourd'hui, mais en disant lequel. Les idiomes d'éditeurs qui s'écartent du canonique
(Figma : `feFlood` + `feColorMatrix` + `feOffset` + `feGaussianBlur` + `feBlend` ; Sketch :
`feOffset` + `feGaussianBlur` + `feColorMatrix` d'alpha ; Illustrator : `Adobe_OpacityMaskFilter`) sont
reconnus par des **reconnaisseurs** dédiés à l'étape 13, un par idiome, chacun avec une fixture. *Révision (étape 13b, annexe 8 §0) :
l'évaluation des primitives suffit (`edition/filtres.ts` : matrice de teinte, alpha durci, fusion avec un aplat transparent, découpe
`out`), chaque idiome a sa fixture au corpus ; ce qui n'équivaut pas à un flou et une ombre (ombre intérieure, plusieurs ombres, fusion
autre que normale entre deux images visibles, ombre pleine sous une forme transparente) est refusé en nommant l'idiome.* Phrases
d'`ignores` : la région d'origine remplacée quand elle rognait l'effet ; un flou de graphique lu en sRVB
alors que le filtre ne fixait pas `color-interpolation-filters` ; un écart borné à `ECART_MAX = max(l, h) / 4`.

**Sous transformation** (fichier qui pose un filtre sur `<g transform="…">`) : l'écart se met à l'échelle
(`facteur(m)`) ; le décalage de l'ombre est **tourné** par la partie linéaire de la matrice à la lecture, puis
vit dans le repère du plan (une rotation ultérieure dans l'éditeur ne le tourne plus : la lumière est fixe).
Flou anisotrope sous une matrice avec rotation ou cisaillement : non représentable, moyenne géométrique, dit.

### 4. Dans la toile, et le coût

La toile et l'écriture appellent **les mêmes fonctions pures** (`defsDe`, `attributsDe`) : ce qu'on voit est ce
qui s'écrit, sur le même navigateur. Un geste (déplacer, redimensionner) retire provisoirement `filter` des
nœuds en mouvement (`data-brouillon`), le rétablit au relâchement ; au-delà de **20** nœuds à effet, les effets
ne se dessinent qu'au repos, et la barre d'état le dit. Plafond de lecture : 2 000 nœuds à effet par dessin
(au-delà : effets abandonnés, dit). Le coût se **mesure** à l'étape 7 (méthode de l'ADR-0008) avant tout
réglage de plus.

### 5. Exports

| Export | Flou / ombre | Raison |
|---|---|---|
| SVG | natif | |
| SVG de découpe, DXF, EPS (contours) | abandonnés, dit (`pertes`) | un contour de découpe n'a pas d'ombre |
| PNG | natif (le navigateur dessine le SVG) | pas de nouveau code |
| PDF vectoriel (`export/pdf.ts`, écrit à la main) | **rastérisés** : `io` rend le nœud à effet à la résolution d'export (l'option de DPI de l'agent des exports) et le passe, en octets, au PDF pur, qui l'écrit en image + masque doux. Option « ignorer les effets » (vectoriel pur, dit) | le PDF n'a pas de flou natif ; une approximation vectorielle attend l'outil de décalage de contour des outils de tracé |

Conséquence assumée (question 4) : le PDF d'un dessin **avec effets** n'est pas reproductible à l'octet d'un
navigateur à l'autre (le rendu des pixels dépend du moteur). Le SVG, lui, l'est toujours ; le PDF d'un dessin
sans effet aussi.

## Partie C — Les images

`<image>` devient une **feuille** (`image`, annexe 1) : `d` est son rectangle (donc boîte, sélection,
déplacement, alignement, rendu de la sélection marchent sans code), `remplissage` et `contour` sont `null`,
`matrice` porte rotation et inclinaison. Pas d'édition de points (« refusé, dit »). Lecture : seul
`data:image/(png|jpeg|gif|webp);base64,…` (le nettoyage de `util/svg.ts` ne laisse déjà que cela) ; une adresse
extérieure reste refusée, nommée ; une image `data:image/svg+xml` est refusée (récursion). **Bornes** : 4 Mo
par image et 16 Mo par dessin (question 7) ; les **dimensions** se lisent dans l'en-tête (IHDR du PNG, SOF du
JPEG, en-tête GIF et WebP : fonction pure `dimensionsImage`), et plus de 64 millions de pixels est refusé :
la bombe de décompression d'un petit PNG géant ne doit pas atteindre le décodeur du navigateur. Le convertisseur
(`io/image.ts`), dont le mode « enveloppé tel quel » produit un SVG à `<image>`, redevient ouvrable dans
l'éditeur ; la vectorisation reste la voie pour obtenir des formes.
