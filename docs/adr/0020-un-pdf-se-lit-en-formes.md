# ADR-0020 — Un PDF se lit en formes, et son texte en lettres

**Date :** 25 octobre 2026
**Statut :** acceptée (prolonge les ADR-0001, 0004, 0009, 0014 et 0018) ; aucun octet écrit pour une entrée existante ne change ;
**version majeure** pour la lecture d’un SVG qui contient du texte, lu désormais en lettres quand la page a ses fontes

## Contexte

Le propriétaire a demandé l’import PDF sur la première page : ouvrir un PDF (choisi ou déposé) comme on ouvre un SVG, ses
tracés vectoriels devenant des formes éditables, la première page par défaut, une autre au choix. Puis il a étendu la demande :
le texte n’est plus laissé de côté mais importé en contours, celui d’un PDF comme celui d’un SVG, une police absente étant
remplacée (pas refusée) et le remplacement dit.

Trois contraintes du projet pèsent : le cœur pur ne touche ni au DOM, ni au réseau, ni à l’horloge ; un SVG réécrit doit
l’être à l’identique ; ce qui est perdu se dit (ADR-0009) et un fichier d’inconnu se lit sans jamais s’exécuter ni lever
(ADR-0014). pdf.js a été écarté d’emblée : lourd, il dessine sur un canevas et ne rend plus de vecteurs.

## Décision

1. **Une lecture pure, écrite à la main** (`engine/pdf/`, façade `engine/lecturePdf.ts`), sur les octets : analyseur linéaire
   d’objets (nombres, noms, chaînes littérales et hexadécimales, tableaux, dictionnaires, renvois, flux) ; table des objets
   classique ou en flux (PDF 1.5, prédicteurs PNG et TIFF), flux d’objets, chaîne `/Prev` et `/XRefStm`, trailer ; un fichier
   dont la table est fausse ou absente est réindexé par un balayage des « n g obj », comme le font les lecteurs courants.
   L’arbre des pages hérite `MediaBox`, `CropBox`, `Rotate` et `Resources`. La sortie est un `DessinSvg` : une unité du plan
   vaut un point (comme les PDF qu’écrit l’export, ADR-0018), le plan est la `CropBox` ramenée dans la `MediaBox`, l’axe Y est
   retourné, la rotation de page appliquée.
2. **Le contenu de page devient des formes** : tracé (`m l c v y h re`), peinture (`f F f* S s B B* b b* n`), état (`q Q cm w J j
   M d gs`, opacités `CA`/`ca`), couleurs (`g G rg RG k K cs CS sc SC scn SCN`), formulaires (`Do`, dépliés avec leur
   `Matrix`), contenu marqué (un calque éteint à l’ouverture n’est pas repris). DeviceGray et DeviceRGB sont exacts ;
   ICCBased, CalRGB et CalGray se lisent comme l’espace d’appareil de même nombre de composantes ; CMJN par le calcul naïf
   inverse de l’export (`R = (1 − C)(1 − N)`) ; Lab, Separation et DeviceN (fonctions de types 0, 2, 3 et 4) approchés.
3. **La décompression vit dans `io`** : `DecompressionStream('deflate')`, arrêtée dès que la sortie dépasse sa borne. La lecture
   reçoit une fonction `Decompression` ; celle de la page lève `FluxEnAttente` pour un flux qu’elle n’a pas encore, décompresse
   ce qu’elle demande et relance la lecture, qui reprend du début. Les flux de la page, de ses formulaires et de ses polices se
   demandent d’un coup : une reprise pour la table en flux, une par flux d’objets, une pour la page. Les tests passent la
   décompression de Node, synchrone.
4. **Ce qui n’est pas repris est compté et dit** par le mécanisme `ignores` d’un SVG, à l’ouverture et dans le panneau du
   dessin : images (`Do` d’une image, `BI…EI`), découpes (`W`, `W*`, cadre d’un formulaire) seulement quand elles cachent une
   partie d’une forme, dégradés et motifs remplacés par une couleur unie (`sh` dans une découpe devient la forme de cette
   découpe), masques de transparence, modes de fusion, annotations, filets d’épaisseur nulle (tracés à 0,25 pt), couleurs
   CMJN ou approchées, partie illisible du contenu.
5. **Le texte devient une forme par lettre**, jamais un `<text>` écrit. Un module partagé (`engine/edition/glyphes.ts`) pose
   des glyphes par une matrice ; la règle de remplacement est une donnée (`model/polices.ts`) vers les neuf fontes de la page.
   - **PDF** : `BT/ET`, `Tf Tm Td TD T* Tj TJ ' "`, `Tc Tw Tz TL Ts Tr`. Un programme TrueType (`FontFile2`) ou OpenType
     (`FontFile3 /OpenType`) embarqué est lu par opentype.js dans `io/policesPdf.ts` (sa `cmap` lue à part, ses tables
     `cmap`, `name` et `post` complétées pour qu’opentype.js se construise) : les contours sont **ceux de l’original**, par
     l’encodage (WinAnsi, MacRoman, Standard, `/Differences`) ou, pour une police composite Identity-H/V, par le CID et
     `/CIDToGIDMap`. Une police Type 3 se dessine comme un formulaire. Type 1, CFF nu, police standard non embarquée,
     programme illisible : remplacés par la règle, au texte de chaque code (`/ToUnicode`, à défaut le nom de glyphe), à la
     largeur du fichier (les lettres restent où elles étaient), et dit (« 3 textes en Arial, police remplacée par Inter »).
     `Tr 3` (couche de reconnaissance de caractères) et `Tr 7` ne sont jamais repris, et dits ; `Tr 1` et `2` sont respectés.
   - **SVG** : `<text>`, `<tspan>`, `<a>` en ligne, listes `x y dx dy`, `rotate`, `text-anchor`, `font-family`, `font-size`,
     `font-weight`, `font-style`, `letter-spacing`, `word-spacing`, peinture et opacité par la cascade existante. `<textPath>`
     et l’écriture verticale sont ignorés et dits. `lireDessin` reçoit des polices **facultatives** : sans elles, la lecture est
     celle d’avant, un `<text>` reste refusé en le nommant. La page charge `polices.js` quand le SVG porte un `<text>`, le lit
     avec, et donne à l’éditeur le SVG réécrit sans texte ; l’embarquement fait de même quand l’hôte donne `baseAnnexes` (ou a
     déjà posé `polices.js`), pour qu’un hôte qui ne sert pas ce fichier n’ait pas une requête en échec à chaque ouverture ;
     sans le fichier, l’ancien refus reste.
   - **La règle** : une fonte de la page demandée par son nom est elle-même ; linéales (Helvetica, Arial, Roboto…) vers Inter
     ou Inter gras ; empattements (Times, Georgia, Garamond…) vers Playfair Display gras, la seule à empattements embarquée (le
     caractère se garde, la graisse non) ; étroites et d’affiche vers Oswald ; arrondies vers Fredoka ; manuscrites vers
     Caveat ; scriptes vers Pacifico ; chasse fixe et inconnues vers Inter ; une italique absente se penche de 12° (italique
     synthétique, dite) ; un SVG sans `font-family` demande Times New Roman, la police par défaut d’un navigateur.
6. **Chaque borne est un refus nommé** (taille, octets décompressés, objets, renvois, sections, pages, pile, formulaires,
   opérateurs, formes, segments, coordonnées ; programme de fonte, CMap, fonctions PostScript, caractères d’un SVG), listées dans
   `docs/securite.md`. Rien n’est exécuté ni suivi (JavaScript, actions, fichiers joints) ; un PDF chiffré est refusé, même à
   mot de passe vide.
7. **L’interface est petite** : la voie « Ouvrir un SVG ou un PDF » accepte `.pdf` au choix et au dépôt ; un PDF d’une page
   s’ouvre aussitôt ; un PDF de plusieurs pages propose une liste « Page 1 sur N », la première choisie d’avance, et une seule
   action pleine, « Ouvrir la page ». « Collez le code d’un SVG » garde son nom.

## Conséquences

- **Les octets d’avant ne bougent pas** : toutes les références de `tests/fixtures/svg` et les 4 134 empreintes de la
  bibliothèque tiennent ; deux références neuves (`texte-svg`, `texte-svg-blancs`) figent la lecture d’un SVG à texte, avec
  des fontes factices ; aucune référence existante ne contient de `<text>`.
- **L’aller-retour est prouvé** (`tests/unit/engine/pdf/aller-retour.test.ts`) : les 34 SVG de référence lisibles et 60 formes
  de la bibliothèque, écrits par l’export PDF du projet (page du dessin ; A4 avec marge, fond perdu et repères ; CMJN ; A4
  CMJN), se relisent en 249 formes : écart de boîte au plus 7,3·10⁻⁴ point (normalisé), d’aire 4,9·10⁻⁵ (relatif), de couleur
  0/255 (CMJN compris), d’opacité 0, d’épaisseur 0 ; les huit repères et ce que le fond perdu rogne vraiment sont dits.
- **Des PDF d’autres producteurs** sont commis et lus : reportlab 4, Cairo 1.18 (le moteur PDF d’Inkscape, PDF 1.7 à flux
  d’objets), Skia (Chromium 141), avec du texte embarqué (TrueType simple et composite Identity-H) dessiné exactement ;
  poppler 24.02 (`pdftocairo -svg`) a servi de témoin pour la rotation de page et le formulaire.
- La page grossit de 80 Ko (1 164 → 1 246 Ko) ; l’embarquement de 9,6 Ko (lecture du texte d’un SVG). Aucune dépendance.
- **Limites, honnêtement** :
  - les découpes ne sont pas appliquées (elles sont dites quand elles cachent quelque chose) ; les dégradés deviennent une couleur
    unie ; les images, masques de transparence et modes de fusion ne sont pas repris ;
  - Type 1 et CFF nu ne sont pas lus (ils sont remplacés) ; les CMap prédéfinies autres qu’Identity sont lues comme Identity, et
    dites ; l’écriture verticale (Identity-V) se pose à l’horizontale ;
  - les largeurs des polices standard non embarquées (Helvetica…) sont celles de la fonte qui remplace : les lignes longues
    dérivent un peu ;
  - un SVG à texte se lit avec un sous-ensemble de la mise en ligne de SVG 1.1 (ni `textLength`, ni `baseline-shift`, ni
    `dominant-baseline`, ni ligatures) ;
  - la police par défaut d’un SVG sans famille (Times New Roman) est remplacée par Playfair Display gras, plus grasse.

## Alternatives écartées

- **pdf.js** : des mégaoctets, et il dessine sur un canevas ; ses vecteurs ne sortent plus.
- **Un inflate écrit en TypeScript** dans le cœur : il aurait rendu la lecture synchrone de bout en bout, mais la consigne place
  la décompression dans `io`, avec l’API du navigateur ; `FluxEnAttente` garde le cœur pur et synchrone, la page asynchrone.
- **Refuser un PDF à texte, ou une police absente** : le texte est le contenu le plus fréquent d’une invitation ou d’une
  étiquette ; le remplacer en le disant sert mieux que le refuser.
- **Développer un SVG à texte en `<text>` réécrit** : interdit (CLAUDE.md) ; un SVG écrit ne porte que des chemins.
