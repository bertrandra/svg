# ADR-0018 — Des exports purs et déterministes, un prétraitement qui n'existe que s'il est touché

**Date :** 24 octobre 2026
**Statut :** acceptée (prolonge les ADR-0002, 0004 et 0005) ; aucun octet existant ne change

## Contexte

Les exports de l'ADR-0004 (SVG, SVG de découpe, PNG à largeur fixe, PDF à la taille du plan) ne suffisaient pas à
ceux qui impriment ou découpent : un imprimeur veut une page, un fond perdu, des repères et du CMJN, souvent de l'EPS ;
une découpeuse laser, vinyle ou CNC lit du DXF (commit `d74bd71`) ; un logiciel de mise en page croit un PNG sans
`pHYs` à 72 ppp. Côté image, les vectoriseurs du commerce préparent les pixels avant de tracer (débruitage,
agrandissement, réduction des couleurs), et convertir une image à la fois ne suffisait pas.

Deux contraintes du projet pèsent : « un SVG réécrit aujourd'hui doit l'être à l'identique demain » (`CLAUDE.md`), et
la vectorisation sans réglage touché doit rendre ce qu'elle rendait (ADR-0005).

## Décision

1. **Chaque writer est pur et déterministe** : mêmes entrées, mêmes octets ; ni date, ni identifiant tiré au sort, ni
   DOM. Tous sont écrits à la main dans `src/export/`, sans dépendance :
   - **PDF** (`pdf.ts`, `pdfPage.ts`) : page `dessin`, A4, A3, Letter ou personnalisée, marge, fond perdu et huit
     repères de coupe de 5 mm hors du fond perdu ; les quatre boîtes emboîtées (`TrimBox` dans `BleedBox` dans
     `MediaBox` = `CropBox`), le dessin coupé au `BleedBox` ; CMJN naïf (`k`/`K`, jamais `rg`/`RG`), repères en
     « 1 1 1 1 K » ; titre et producteur dans `/Info`, sans date, un titre accentué en UTF-16BE ;
   - **EPS niveau 2** (`eps.ts`) : ASCII 7 bits, cadre `%%BoundingBox` sur l'encre trait compris, bouts, jonctions,
     limite de pointe et pointillés ; l'opacité, que l'EPS ne représente pas, est aplatie sur du blanc (ou ignorée à
     la demande), avec un avertissement qui compte les formes touchées ;
   - **DXF R12** (`dxf.ts`, AC1009, le plus largement lu) : courbes aplaties à une tolérance (0,01 mm par défaut), un
     calque `COULEUR_RRGGBB` par couleur, une `POLYLINE` fermée par tracé fermé, l'axe Y retourné, des réels à cinq
     décimales sans exposant ;
   - **PNG** (`png.ts`, `avecDpiPng`) : un bloc `pHYs` inséré après `IHDR` sans toucher un pixel ni un autre bloc ;
   - **ZIP** (`zip.ts`) : sans compression, horodatage fixé au 1er janvier 1980, noms en UTF-8 ; un doublon de nom,
     plus de 4 Gio ou plus de 65 535 entrées sont refusés en le nommant (pas de ZIP64).
2. **JPEG et WebP passent par le canevas du navigateur** (`io/rasters.ts`, dans `io` parce qu'il touche au DOM) : leurs
   octets sont ceux de l'encodeur du navigateur, et ne sont donc pas stables d'un navigateur à l'autre, ce que l'en-tête
   dit. Un JPEG, sans alpha, prend toujours un fond (blanc faute de mieux).
3. **Les options d'export sont l'état d'une session, jamais stockées** (`export/options.ts`) : unité, taille, résolution,
   précision, page, fond perdu, CMJN, SVG optimisé se règlent dans une section repliée du menu d'export et se traduisent
   en options propres à chaque writer. Elles **partent neutres** : `OPTIONS_EXPORT_DEFAUT` rend exactement les options
   d'avant (`tests/unit/export/options.test.ts`), donc les exports d'avant gardent leurs octets.
4. **Le prétraitement n'existe que s'il est touché** (`engine/pretraitement.ts`, étapes pures sur des pixels RGBA dans
   `engine/pixels/`), sur le modèle des réglages fins du traceur (ADR-0005) : un réglage absent n'a pas lieu, un réglage
   qui vaudrait « rien » (force 0, gamma 1) n'est jamais stocké (`poserPre`), et sans réglage `pretraiter` rend la source
   elle-même, sans copie. Les préréglages ne sont que des réglages posés.
5. **L'ordre des étapes est fixe, et c'est lui qui compte** : (1) aplatir l'alpha d'abord, car un halo translucide fausse
   le reste ; (2) débruiter à la taille de la source, quatre fois moins de pixels qu'agrandie ; (3) agrandir ×2 une image
   déjà nette de grain ; (4) la netteté rattrape ce que l'agrandissement adoucit, puis le gamma ; (5) réduire à N
   couleurs quand le grain et le flou ne peuvent plus rien changer ; (6) lisser les bords par un filtre de mode en
   dernier, sur des couleurs exactes qu'il ne confond pas. Le tout vient **avant le détourage** (`io/image.ts`,
   `traiterImage`) : un fond réduit à une couleur exacte se détoure sans tolérance.
6. **La conversion par lot** (`io/lot.ts`) traite les images une après l'autre (le traceur est synchrone), rend la main au
   navigateur entre deux, relève les réglages au départ (un curseur bougé pendant le lot ne change pas la moitié des
   résultats), isole l'échec d'une image et ne garde pas ses pixels ; le résultat part en une archive ZIP.

## Conséquences

- **Les octets d'avant sont prouvés intacts** : le PDF sans options, ou avec des options neutres, garde les empreintes
  SHA-256 de six fixtures relevées sur le writer d'avant les options (`tests/unit/export/pdf-options.test.ts`) ;
  `svgExporte` sans options écrit exactement `ecrireDessin` à trois décimales sur toutes les fixtures lisibles, et le SVG de
  découpe d'avant ne change pas (`svgs-options.test.ts`) ; sans prétraitement, quinze empreintes SHA-256 (trois images
  synthétiques, cinq traitements, relevées avant l'ajout du prétraitement, commit `694627b`) tiennent avec le vrai vtracer
  (`tests/unit/io/identite-sans-pretraitement.test.ts`). Les changer est un événement de version majeure.
- Chaque format a son contrôle de structure : un mini-interpréteur PostScript écrit dans le test relit l'EPS
  (`eps.test.ts`) ; le DXF est relu groupe par groupe (`dxf.test.ts`) ; le ZIP est relu entrée par entrée et, quand Python
  est présent, par son module `zipfile` (`zip.test.ts`) ; le PNG par son CRC (`png.test.ts`) ; le tout en navigateur dans
  `tests/e2e/exports-formats.e2e.ts`, et le prétraitement et le lot dans `tests/e2e/pretraitement.e2e.ts`.
- La pureté de `src/export/` tient par ses en-têtes et par ces tests d'octets ; `tests/unit/architecture.test.ts` ne la
  surveille pas (il ne lit que `geometry`, `model`, `util`, `engine` et `styles`).
- **Limites, honnêtement** :
  - l'EPS n'a été validé par aucun logiciel externe (ni interpréteur PostScript, ni logiciel d'imprimeur) : sa seule
    relecture est le mini-interpréteur du test ;
  - le CMJN est naïf (`versCmjnNaif`, sans profil ICC) : une indication de saturation, pas une séparation ; le profil de
    l'imprimeur donne les vraies valeurs ;
  - l'EPS aplatit l'opacité : deux formes translucides qui se recouvrent ne se voient plus l'une à travers l'autre ;
  - le DXF R12 n'a ni arc ni spline : une courbe y est une suite de segments à la tolérance ;
  - JPEG et WebP ne sont pas reproductibles d'un navigateur à l'autre ; le ZIP n'est pas compressé.

## Alternatives écartées

- **Stocker les options d'export** dans le navigateur : un export qui change selon une préférence oubliée n'est plus
  reproductible ; une session qui part neutre l'est.
- **Un prétraitement par défaut** : il aurait changé la sortie de toute vectorisation existante, contre l'ADR-0005.
- **Des bibliothèques d'écriture** (PDF, ZIP) : des octets qui dépendraient d'une version de plus à épingler et à
  surveiller ; chaque fichier de `src/export/` qui écrit ces formats tient en moins de 150 lignes pures.
