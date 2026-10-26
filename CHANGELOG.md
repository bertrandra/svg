# Journal des modifications

Toutes les modifications notables de `svg`. Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
versions SemVer : un SVG réécrit différemment pour une entrée inchangée est une version majeure.

## [Non publié]

### Version majeure : des octets écrits changent

Ce lot déplace délibérément des octets écrits (ADR-0009, ADR-0004) ; les références de
`tests/fixtures/svg` ont été relues une à une, et les 4 134 formes de la bibliothèque gardent leurs
empreintes.

- **Fidélité de lecture** : l'alpha des couleurs (`rgba()`, `hsla()`, `#rrggbbaa`, `#rgba`) est gardé ;
  `Forme` reçoit `opaciteRemplissage` et `opaciteContour` (facultatifs), `fill-opacity` et
  `stroke-opacity` ne s'écrivent que s'ils diffèrent de 1, et sans trait l'alpha passe dans `opacity`.
  Avec un trait, `fill-opacity` n'estompe plus le trait. `hsl()` et `rgb(0 128 255 / 40%)` se lisent ;
  les 148 noms de couleur CSS se ramènent à `#rrggbb` (`steelblue` s'écrit `#4682b4`) ; une opacité
  en pourcentage ou illisible n'invisibilise plus la forme.
- **La peinture de la balise `<svg>` racine se transmet aux formes** (`fill`, `stroke`, `stroke-width`,
  opacités, `fill-rule`, `color`…) : une icône de type Feather (`fill="none" stroke="currentColor"`) s'ouvre
  en traits, plus en noir plein ; l'opacité de la racine vaut pour tout le dessin. `currentColor` prend la
  couleur courante de la forme (`color`, héritée, noire par défaut). Un masque, une découpe ou un filtre
  posé sur la racine refuse le SVG, comme sur un groupe.
- **Les pointillés, bouts, jonctions et limites de pointe sont lus, gardés et réécrits**
  (`stroke-dasharray`, `-dashoffset`, `-linecap`, `-linejoin`, `-miterlimit`) ; une jonction non précisée
  s'écrit toujours arrondie. Les longueurs de pointillés suivent l'épaisseur à la mise à l'échelle, la
  limite de pointe non. `ignores` ne les signale plus.
- **Un `<use>` ne refuse plus le SVG** (ADR-0009, amendement) : `href` et `xlink:href` se résolvent, avec
  `<symbol>`, `viewBox`, `preserveAspectRatio`, clones emboîtés et héritage du `<use>` ; chaque clone donne
  des formes plates indépendantes aux ids neufs. Refusés en le nommant : un cycle, plus de 16 niveaux, plus
  de 20 000 clones, un renvoi externe. Une cible introuvable et le rognage d'un `<symbol>` qui déborde sont
  dits dans `ignores`.
- **La feuille `<style>` se lit avec ses vrais sélecteurs** (type, `*`, classes, `#id`, attributs, descendant,
  enfant, groupes, `:root`, `:first-child`, `:last-child`, `:only-child`), sa spécificité, son ordre et
  `!important` ; l'attribut de présentation passe sous les règles, le `style` en ligne au-dessus. Les règles
  qui valaient « classe seule » passent à la cascade complète. `var()` et le `transform` CSS ne sont plus
  écrits tels quels mais dits ; `@media`, `@keyframes`, `@font-face`, `@import`, les frères, les
  pseudo-classes et le CSS imbriqué sont dits aussi.
- `nettoyerSvg` garde le renvoi externe d'un `<use>` dans `data-href-externe`, pour que la lecture le refuse.
- **`stroke-width="0"` reste 0** : un trait invisible ne devient plus visible (il s'écrivait `1`). Le PDF
  ne trace plus un trait d'épaisseur nulle, et il sépare l'opacité du fond (`ca`) de celle du trait (`CA`).
- **Texte** : le crénage des fontes Inter, Inter gras, Playfair Display gras et Fredoka est lu dans la
  table GPOS (`io/crenageGpos.ts`, lookups d'extension et classes qu'opentype.js 2.0 ne lisait pas) :
  « AV » se resserre (-140, -162, -74, -150 unités) ; Oswald, Bebas Neue, Caveat, Lobster et Pacifico ne
  changent pas. Les contours de lettre qui reviennent à leur point de départ se ferment par `Z` : un
  texte en contour seul a une jointure au lieu de deux capuchons.
- **Booléens** : l'aplatissement des courbes suit une tolérance géométrique (écart maximal d'un
  vingt-millième du plan, 512 segments au plus par courbe) au lieu de 64 segments fixes ; les résultats
  sont réécrits, environ 25 % plus légers.
- **Provenance des formes de la bibliothèque** : une forme posée depuis game-icons.net (CC BY 3.0) garde son
  origine (`Forme.origine`) ; le SVG écrit porte alors un `<metadata>` d'attribution et un `data-origine`
  sur la forme. Une entrée sans forme créditée s'écrit à l'identique (empreintes des 4 134 formes et des
  références inchangées) ; les cas neufs sont `tests/fixtures/svg/provenance*.svg`. Le PDF porte la mention
  dans `/Subject`, le SVG de découpe dans un commentaire, et seulement s'il y a une forme créditée.

### Modifié

- Arbre des calques, à la souris : les boutons de visibilité et de verrou n'apparaissent que sur la ligne active, survolée, masquée
  ou verrouillée ; le clavier les atteint toujours, au doigt toutes les lignes les gardent. La grille de 200 groupes passe de 801 à
  339 éléments.

- Le projet du site n'a plus qu'un format, la version 1, qui porte tout le modèle (groupes, dégradés, motifs, images, découpes,
  masques, effets) : les champs du modèle v2 se lisent et se valident toujours, et une autre version est refusée en la nommant. Le
  projet d'un dessin plat reste le même texte, octet pour octet ; aucun projet n'existait à conserver (ADR-0030, révision du
  26 octobre 2026).

- La section de l'inspecteur qui change une couleur partout s'appelle « Recolorer le dessin » (elle s'appelait « Couleurs du
  dessin », comme le groupe du nuancier tiré du dessin) ; la section des palettes qui la suit s'appelle « Palettes » (elle
  s'appelait « Recolorer »).

- La liste « Police » montre toutes les polices (ADR-0034), dans le panneau, l'inspecteur et la barre de texte : une liste
  déroulante à recherche avec la police actuelle, celles du document, les favoris, les récentes, les livrées, le trait unique, vos
  polices, puis tout le catalogue, une ligne par famille, chaque nom dessiné dans sa police. Une police pas encore sur l'appareil
  porte une marque « à télécharger » (icône et mots) ; la choisir la télécharge, vérifiée, et la marque disparaît ; ouvrir,
  parcourir et chercher ne téléchargent rien. Taper filtre, le clavier suffit ; sur un téléphone, la liste s'ouvre en feuille.
- « Ne rien sélectionner » devient « Désélectionner », « Sélectionner la même couleur » devient « Sélectionner la même couleur de
  fond » (C) ; sur un téléphone, « Points et poignées » se range dans le menu de l'outil de sélection.
- Le nom d'une forme suit les formes de base (« cœur », « hexagone », « étoile à 8 branches »…) ; un losange lu dans un fichier se
  dit « losange », un rectangle aux coins ronds « rectangle arrondi » ; une forme tracée à la souris se dit « ajoutée et
  sélectionnée » ; le menu des formes s'appelle « Formes (F) ».
- « Dans la forme » (barre, menu de la sélection, barre resserrée) pose le texte déformé ; le remplissage en lignes se choisit dans
  le panneau (« Remplir : En lignes ») et un texte déjà posé en lignes le garde, octet pour octet. Un champ chiffré inactif dit
  pourquoi en infobulle.
- Firefox est exigé en CI (ADR-0016, amendement) : la suite entière y a passé. Le contraste forcé est testé dans les trois
  moteurs, aucun test ne saute plus.
- L'éditeur reçoit des propriétés facultatives pour un hôte qui garde des projets (`dessin`, `enregistrement`, `changement`,
  `ctrlSEnregistre`, `actionsHote`), et `enregistrer` reçoit l'état du modèle en second argument ; aucun effet pour la page ni
  pour l'embarquement. « Un seul `fetch` dans `src/` » devient « le réseau passe par `io/` » (`io/policesEnLigne.ts`,
  `io/serveur.ts`). Un plan vide sans rien à défaire (projet vierge) dit le premier geste au lieu de proposer d'annuler.
- En découpe, une forme sans fond n'est plus un constat bloquant : elle se range « À écrire ». La correction « Passer au dessin
  au stylo » devient « Écrire au stylo ». Le SVG enregistré en contexte Cricut porte `data-ed-operation` sur une forme dont
  l'opération choisie diffère de la proposition ; jamais en Générique ni dans un export. Aucune référence existante ne change.
- Échap termine la saisie d'un texte en le gardant (Ctrl+Z le rend). Entrée avec l'outil Texte ouvre la saisie sur la toile au
  lieu du champ du panneau. L'aperçu « Ligne (stylo) » d'une police à contour montre la ligne médiane au lieu du double trait.
  Les champs chiffrés du panneau Texte s'appliquent à la validation.
- Plus d'accord à donner pour les polices ni pour la bibliothèque de formes (décision du 25 octobre 2026, ADR-0025 amendée) :
  choisir une police du catalogue la télécharge aussitôt (la ligne dit « Téléchargement… »), toujours vérifiée par son
  empreinte sha256, avec Bunny Fonts en repli ; ouvrir la liste, chercher et voir les aperçus ne font partir aucune requête.
  Le dialogue de consentement, « Retirer l'autorisation » et la clé `svg.polices.consentement` (ignorée et effacée si elle
  reste) disparaissent. La bibliothèque de formes se charge d'elle-même à l'ouverture de sa voie ou de sa section, sans bouton
  « Charger la bibliothèque (environ 7 Mo) » ; les sources libres gardent leur chargement par pastille.
- « Toutes les polices » ne montre qu'une ligne par nom de famille : la fonte livrée, sinon Google Fonts, sinon Fontshare
  (ordre défini dans le registre) ; filtrer une source montre toutes les siennes ; le total compte les lignes montrées
  (2 166). Un texte composé dans une police d'une source cachée se recompose à l'identique et reste nommé avec sa source.
  Inter et Inter gras ne font qu'une ligne : le gras se choisit dans « Style », qui remplace la case « Gras » de l'inspecteur.
- Cinq familles que l'éditeur ne sait pas lire (Pitagon Sans, Sans Mono, Sans Text, Serif ; Peace Sans) quittent l'index : elles
  échouaient au téléchargement. Une règle du registre (`FAMILLES_ILLISIBLES`) les écarte avec leur raison ; 2 200 familles.
- Le chapeau de l'accueil nomme la machine de découpe ; les audits axe de la bibliothèque se font sur toute la hauteur de
  la page.
- **Les boutons masquer et verrouiller des calques sont de vraies icônes** (cadenas ouvert ajouté), comme le
  bouton supprimer des versions ; noms et états inchangés. « Aller à la toile » est un lien, la page de
  l'hôte est cachée (`visibility: hidden`) en plus d'être inerte pendant l'édition, et les boutons de menu
  n'écrivent plus `aria-controls`.
- **« Couleurs du dessin » se fenêtre** (ADR-0008) : le panneau de l'inspecteur ne dessine plus que les
  lignes visibles au-delà de 100 couleurs ; Échap sur 1 669 couleurs passe de 933 à 156 ms, avec
  14 800 nœuds en moins.
- **Le focus et le clavier de l'éditeur** (ADR-0011) : l'éditeur prend le focus à l'ouverture, le reste de
  la page est inerte pendant l'édition et le focus revient à l'hôte à la fermeture ; la confirmation
  d'abandon et les tiroirs prennent et rendent le focus, Échap les ferme. La barre d'état n'est plus une
  région vivante, et les flèches d'un menu ouvert ne déplacent plus la sélection.
- **La liste « Par couleur » passe à l'échelle** (ADR-0008) : elle ne dessine que les lignes visibles
  au-delà de 100 couleurs (jusqu'à six fois moins de temps par mouvement sur un dessin de 2 000 couleurs),
  ses lignes ne se redessinent que si leur couleur change, et les nuances proches se calculent par une grille
  de voisinage (même résultat qu'avant) sans plafond de 400 couleurs.
- **Architecture de l'éditeur** (ADR-0010) : trois contextes (dessin, interface, actions) remplacent l'objet
  `Edition` de cinquante champs ; les actions sont stables et lisent l'état du dernier rendu. `Bouton`,
  `Menu` et `Section` vont dans `zones/commun/`, un seul `pluriel` (`util/texte.ts`). Aucun changement
  visible ni d'octet écrit ; mesure neutre sur 5 000 formes.
- **Le composant React ne garde plus rien sans `stockage`** : un hôte de `EditeurSvg` ou `BoutonEditerSvg`
  qui n'y passe pas `stockage` perd les versions nommées dans le navigateur. L'embarquement garde
  `localStorage` par défaut.
- **Gros dessins** (une vectorisation de milliers de formes), ADR-0008 : le panneau des calques ne dessine
  que les lignes visibles (au-delà de 150 formes), l'écriture d'une forme est mémorisée, les sélections se
  testent par ensemble. Sur 5 000 formes : ouvrir, glisser et annuler vont 2 à 5 fois plus vite, et le DOM
  passe de 33 000 à 9 000 nœuds ; le SVG écrit ne change pas d'un octet. L'historique garde moins d'états
  sur un très gros dessin (40 à 5 000 formes, 200 jusqu'à 1 000).
- **Un seul chargeur pour les annexes** (`io/annexes.ts`) : la bibliothèque, les fontes et le traceur se
  chargent par la même mécanique, qui valide la forme de ce que le script pose ; les messages d'erreur
  sont inchangés. Les scripts de construction partagent `scripts/aide.mjs`, et les fichiers de `dist/`
  qui ne contiennent pas le code d'`io/` sont identiques à ceux d'avant, à l'octet.
- **Les styles de l'éditeur sortent de `page.html`** vers `outils/editeur-svg/base.css` et
  `editeur.css`, assemblés avec le registre de jetons par `scripts/feuilles.mjs` ; la page est
  inchangée à l'écran, et le script d'embarquement réutilise les mêmes feuilles. `io/vtracer.ts`
  cherche `vtracer.js` sous `baseAnnexes`, comme les autres annexes.
- **Le traceur vtracer n'est plus dans la page** (ADR-0002) : il vit dans `dist/vtracer.js`, chargé au
  premier tracé ; la page passe de 1,6 à 0,75 Mo. « Chargement du traceur… » s'affiche au premier
  tracé ; si le fichier manque à côté de la page, le message dit où le placer. Le SVG produit est
  identique à l'octet près (vtracer reste épinglé à 1.0.0-alpha.4).
- **Découpage du code, sans changement de comportement** : l'éditeur (`zones/EditeurSvg.tsx`, 1 138
  lignes) est réparti par responsabilité (gestes, clavier, vue, toile, calques, inspecteur, panneau du
  dessin, actions), et `engine/editionSvg.ts` devient une façade sur `engine/edition/` (ADR-0001).
  Le SVG réécrit est identique à l'octet près sur les 4 134 formes de la bibliothèque.
- **Passe d'interface : menus, sections, trois voies** (ADR-0006) :
  - la barre de l'éditeur ne garde que les outils, les couleurs, l'historique et le zoom ; les formes
    se rangent derrière un outil à chevron, et les menus **Vue**, **Édition** et **Fichier** portent le
    reste, avec leurs raccourcis, au clavier comme à la souris ;
  - l'accueil devient une entrée et trois voies côte à côte (ouvrir un SVG, convertir une image,
    bibliothèque) ; le nuancier est replié ;
  - l'inspecteur est à plat, en sections repliables, et ne répète plus la rangée de sélection ;
  - un bouton est secondaire par défaut, une seule action par panneau est pleine ; « Supprimer » est
    un contour rouge ;
  - les tiroirs mobiles glissent et se ferment sur un voile, la toile prend le focus clavier avec un
    anneau visible, `prefers-reduced-motion` coupe les animations ;
  - au doigt (moins de 900 px ou pointeur grossier), cibles de 40 px et poignées de la toile
    agrandies.

### Corrigé

- Modèle riche : une forme dessinée, collée ou insérée dans un groupe y entre, au premier plan, au lieu de naître hors du contexte,
  estompée et imprenable ; « Vectoriser : lettres séparées » rend les lettres en un groupe « Texte « … » », choisi, et le dit.
- Une image intégrée se dit « image PNG » (calques, sélection, Alt+clic), plus « rectangle, sans fond ».
- Arbre des calques : un double-clic sur une ligne non choisie entre dans ce groupe, plus dans son voisin (la rangée de la
  sélection décalait la liste entre les deux clics).
- Contraste forcé : numéro et pastilles d'une ligne choisie lisibles, mini-onglet enfoncé distinct, fil d'Ariane en couleurs du
  système ; « Déplacer vers… » tient sur une ligne.

- Sécurité : le nettoyage d'une feuille de style retire aussi `@ import` écrit avec un blanc après l'arobase (trouvé par le fuzzing ;
  régression ajoutée).
- Modèle riche : un masque dont le contenu porte des groupes eux-mêmes masqués ou découpés garde toutes ses formes, ou est refusé
  en le nommant s'il dépasse la borne (il en perdait en silence) ; une image dans le contenu d'un masque s'écrit dans un SVG bien
  formé (`xmlns:xlink` déclaré), et le contrôle d'écriture refuse désormais tout préfixe non déclaré.
- Sécurité : le nettoyage d'une feuille de style résout ses échappements à chaque passe ; un échappement à double niveau
  (`ur\\6c(`) ou vers un caractère de contrôle ne peut plus recomposer `url(` (trouvé par le fuzzing ; deux régressions ajoutées).
- Sécurité : un `<use>` qui renvoie à l'extérieur avec un schéma coupé par un blanc ou un invisible (`d<TAB>ata:`) ne laisse
  plus ce schéma dans `data-href-externe` (trouvé par le fuzzing sur le corpus réuni ; vecteur ajouté au corpus).
- Sécurité : le nettoyage d'une feuille de style retire aussi `-moz-binding` écrit sans « : » (trouvé par le fuzzing quand le
  corpus a changé) ; rien ne peut plus le recomposer.
- Sous Firefox, une forme des groupes « À couper / À écrire » se glisse de nouveau d'un groupe à l'autre : la vignette, sortie du
  bouton, est la poignée du glisser (Firefox ne commence jamais un glisser sur un bouton).
- Sous Safari et WebKit, un menu ouvert à la souris puis parcouru aux flèches montre de nouveau l'élément atteint, de même que
  les pastilles de la bibliothèque et les onglets de l'accueil (`focus({ focusVisible: true })`).
- Tests de navigateur sous WebKit : le dépôt de fichier attend l'accueil, les textes de menu sont ramenés, le texte d'exemple est
  mesuré pour de bon, la molette avance cran par cran ; sous Firefox, le bouton « aucun » est lu après ses transitions.
- Refermer un repère par « Compris » au clavier donne le focus à ce qui suit avant que la note ne disparaisse : il ne
  passe plus un instant par le corps de la page (un test de navigateur l'observait parfois en CI).
- Un bouton discret survolé passait sous 4,5:1 en thème clair (4,49 sur un panneau, 4,05 sur la page) : son texte prend
  le jeton `cyan-survol`.
- Sur un téléphone (420 px), l'atelier de conversion débordait de 20 px dès que le prétraitement ajoutait
  l'onglet « Prétraitée » : les six onglets de la visionneuse passent maintenant à la ligne. Firefox et WebKit le
  montraient ; Chromium, qui élargit la fenêtre émulée jusqu'au contenu, le cachait aux tests, qui lisent
  désormais `clientWidth`.
- Sous Firefox et WebKit, Tab dans « Couleurs du dessin » ou « Par couleur » laissait le focus sur une ligne
  coupée par le bas de la liste : au focus clavier, la ligne se montre entière (rien ne bouge à la souris).
- Les tests de navigateur ne supposent plus Chromium là où Firefox et WebKit diffèrent sans défaut de la page
  (requêtes `file://` invisibles sous Firefox, `innerText` d'une ligne non rendue, guillemets de
  `FontFace.family`, `:focus-visible` après un focus par script, cran de molette ramené à une page, caractères
  de contrôle retirés d'un `<textarea>`, pointeur grossier sous `hasTouch`) : même assertion, moyen
  d'observation portable. Les audits attendent leurs animations deux secondes au plus. Le job `navigateur`
  laisse 60 minutes à Firefox et WebKit (WebKit était coupé à 25). Détail dans `docs/navigateurs.md`.

- Une couleur toute masquée du panneau « Par couleur » tombait à 2,2:1 de contraste (`opacity: 0.5`) : elle
  s'atténue maintenant par son échantillon.
- Recolorer une couleur avec le sélecteur natif, dans « Par couleur » ou « Couleurs du dessin », ne le
  ferme plus quand la ligne change de rang et sort de la fenêtre.
- Un second geste du sélecteur sur la même ligne de « Couleurs du dessin », sans perte de focus entre les
  deux, compte maintenant une entrée d'historique de plus au lieu de se fondre dans la première.
- Le panneau d'export du menu Fichier n'est plus dans un `role="menu"` (violation critique `aria-required-children`
  d'axe-core).
- **« Ajuster le plan de travail » compte l'étendue réelle du trait** : les pointes des jonctions en
  pointe (jusqu'à limite × épaisseur / 2) et les coins des bouts carrés ne sont plus coupés. Un trait
  ordinaire garde exactement le même plan.
- Les sections ouvertes ou repliées de l'inspecteur ne se partagent plus entre deux éditeurs d'une même
  page hôte (mémoire par éditeur).
- « Enregistrer » d'un dessin sans forme visible rendait un `<svg>` vide à l'hôte (`onEnregistrer`) au
  lieu de le refuser avec « rien à enregistrer » : la garde ne se déclenchait jamais.
- La liste « Par couleur » ne défile plus en largeur dans le panneau étroit.
- Un menu déroulant ne se ferme plus quand un défilement ne déplace pas son bouton.

### Ajouté

- Modèle riche : modifier sur place le contenu d'une découpe ou d'un masque (« Modifier la découpe », « Modifier le masque » au
  menu Édition, ou double-clic sur la pastille du calque). Le reste du dessin s'estompe, la découpe se trace en contour et le
  masque se dessine tel quel, cerné. Les outils ordinaires s'y appliquent, chaque geste s'annule en une fois, et l'on sort par
  Échap, Maj+Entrée ou le fil d'Ariane « Racine › Groupe › Découpe ». Une découpe vidée refuse la sortie et dit quoi faire ; le
  texte, et les effets dans une découpe, y sont grisés avec leur raison.

- Modèle v2, étape 13b : en mode riche, les ombres portées et les flous écrits par Figma (ombre portée, flou de calque), Sketch
  (ombres en `feMerge`) et Illustrator (`AI_Shadow`) s'ouvrent comme des effets de l'éditeur ; le filtre `Adobe_OpacityMaskFilter`
  des masques d'Illustrator est reconnu comme neutre ; l'ombre portée d'Inkscape 1 s'ouvre aussi. Ce qui n'y équivaut pas (ombre
  intérieure, plusieurs ombres, mode de fusion autre que normal, ombre de Figma sous une forme transparente) est refusé en nommant
  l'idiome, par exemple « une ombre intérieure (Figma) ».

- Le PDF vectoriel d'un dessin riche garde ses dégradés (shading), ses motifs (pavage), ses découpes (chemin de découpe, traits
  compris), ses masques d'opacité (masque doux), l'opacité de ses groupes (groupe de transparence) et ses images (JPEG tel quel,
  PNG et GIF décodés, alpha compris, orientation EXIF) ; le message de l'export distingue ce qui est approché de ce qui est perdu
  (flou et ombre, image WebP). Un dessin plat garde son PDF à l'octet.

- Découpes, masques et effets dans l'éditeur (modèle riche, bêta) : au menu Édition, « Créer une découpe », « Libérer la découpe »,
  « Créer un masque », « Inverser le masque », « Libérer le masque », grisés avec leur raison, sans raccourci ; une section Effets
  dans l'inspecteur (flou, ombre portée : décalage, flou, couleur, opacité), aussi pour un groupe ; les groupes des calques montrent
  ce qu'ils portent (découpe, masque, flou, ombre, opacité), et la phrase de la ligne le dit ; « Insérer une image… » (menu
  Fichier) et le dépôt d'une image sur la toile posent un PNG, JPEG, GIF ou WebP vérifié sur ses octets, au centre de la vue ; une
  rotation qui approche un flou inégal le dit. Le contenu d'un masque s'écrit en contours (son texte reste vivant dans
  l'éditeur). À plat, rien ne change.

- Modèle v2, étape 13d : les outils de couleur voient les dégradés et les motifs. « Couleurs du dessin » et « Par couleur » ont une
  ligne pour chaque couleur d'arrêt et de tuile, jamais pour la couleur moyenne de repli. Remplacer une couleur (partout, sur le
  fond ou sur le trait), fusionner les nuances proches, appliquer une palette ou tout mettre d'une couleur changent les arrêts et
  les tuiles, puis recalculent la couleur de repli. La sélection par couleur prend une forme dont un arrêt ou la tuile porte la
  couleur. Le contenu d'un masque n'est pas touché. Un dessin plat ne change pas d'un octet.

- Modèle v2, étape 9 : les motifs. En mode riche, une peinture `url(#…)` vers un `<pattern>` s'ouvre (unités de la tuile et du
  contenu, viewBox, transformation, héritage `href`, tuile peinte avec dégradés et motifs imbriqués) et se réécrit en
  `<pattern id="ed-p-…">` canonique et dédoublonné. Le motif suit sa forme, sa couleur de repli est la moyenne de sa tuile, le
  nuancier lit les couleurs de la tuile, et les formats de tracés le remplacent par sa couleur moyenne en le disant. « Créer un
  motif depuis la sélection » (menu Édition, modèle riche). Le projet JSON porte les motifs. Les cycles, les tuiles vides ou
  minuscules et les renvois extérieurs sont refusés en les nommant.

- Modèle riche (bêta) : un `<svg>` imbriqué s'ouvre en groupe, à sa place et à son échelle (viewBox, preserveAspectRatio), rogné à
  sa fenêtre sauf `overflow` visible. Un texte lu en lettres devient un groupe « Texte « … » » qui garde sa découpe, son masque ou
  son filtre au lieu d'être refusé. Ce que les navigateurs ne rendent pas tous pareil est dit à l'ouverture. Rien ne change en
  modèle plat.

- Dégradés dans l'éditeur (modèle riche, bêta) : le remplissage et le contour se choisissent Uni, Dégradé linéaire ou Dégradé
  radial. La liste des arrêts permet d'ajouter, retirer, régler la couleur, la position et l'opacité, et de changer l'ordre ; on
  règle aussi l'angle, le centre, le rayon et l'étalement, et on peut inverser le dégradé. Sur la toile, des poignées accessibles
  au clavier (Tab y entre, flèches ±1 %, Maj ±10 %, Suppr) et au doigt. Une ligne « Dégradés » apparaît dans les couleurs du
  dessin. Le choix n'apparaît qu'avec le modèle riche ou sur un dessin déjà riche ; poser un dégradé rend le dessin riche.
- Effets sur la toile : au-delà de vingt formes ou groupes à effet, flous et ombres se masquent pendant un glisser, un
  redimensionnement ou une rotation, et la page le dit. La toile ne réécrit plus que la définition qui change : 200 formes à
  ombre passent de 71,6 à 18,9 ms par mouvement.

- Calques en arbre (modèle riche, bêta) : un dessin à groupes montre ses calques en arbre accessible (treegrid), pilotable sans
  souris : flèches pour parcourir, déplier et replier, Entrée pour entrer dans un groupe, Espace pour choisir, F2 pour renommer,
  Ctrl+Maj+flèches pour monter, descendre, sortir d'un groupe ou entrer dans celui du dessus, « Déplacer vers… » (Maj+F10) qui
  liste les groupes, et glisser-déposer d'une ligne dans un groupe. Fenêtré au-delà de 150 lignes. En Cricut, « À couper / À
  écrire » restent en tête, l'arbre vient dessous. Un dessin plat garde sa liste à l'identique.

- Groupes au clavier et au menu (modèle riche, bêta) : Grouper (Ctrl+G), Dégrouper (Ctrl+Maj+G), Entrer dans le groupe (Entrée),
  Sortir du groupe (Maj+Entrée ou Échap), au menu Édition et dans la rangée de la sélection. Dans un groupe, Tab, Page suivante et
  Ctrl+A ne parcourent que ses éléments, et un clic sur une forme hors du groupe en fait sortir. Un fil d'Ariane (« Racine ›
  Nuage ») dans la barre d'état remonte d'un geste. L'éditeur dit un groupe choisi, créé ou défait. « Télécharger le SVG à plat »
  (menu Fichier) rend un SVG sans groupe ni définition. Une image se prend sur toute sa surface et ne passe pas en mode points,
  et c'est dit. En modèle plat, rien ne change : Ctrl+G combine, Ctrl+Maj+G sépare.

- « Groupes, dégradés, effets (bêta) » au menu Édition (modèle v2, étape 2, premiers paquets) : un SVG à groupes s'ouvre avec ses
  groupes, ses dégradés, ses découpes, ses effets et ses images, et se dessine sur la toile tel qu'il s'écrit. Un double-clic entre
  dans un groupe : le reste s'estompe, et seuls ses éléments se prennent, se choisissent au cadre ou au lasso et servent d'aimants ;
  Échap en sort. Le réglage se garde dans le navigateur ; l'embarquement reçoit l'option `modele` (`plat` par défaut). Un brouillon
  ou une version enregistrés avec des groupes le disent quand le réglage est à plat, sans rien effacer, et proposent « Activer le
  modèle riche et reprendre ». Tant que le réglage reste à plat, rien ne change : un dessin sans groupe se dessine et s'écrit
  exactement comme avant.

- Modèle v2, étape 6 (moteur, mode riche seulement) : les masques d'opacité. Un `mask` vers un `<mask>` (luminance ou alpha,
  région et unités résolues, contenu peint avec ses dégradés, images, groupes et `<use>`) se lit, s'écrit en `<mask id="ed-m-…">`
  par empreinte et se relit à l'identique ; le masque suit son groupe et rogne sa boîte visuelle ; créer, libérer et inverser un
  masque (moteur) ; les exports qui ne savent pas masquer l'ignorent et le disent ; le projet le garde. Un masque CSS,
  un renvoi extérieur, un cycle ou une imbrication trop profonde sont refusés en les nommant. Le mode plat ne change pas.

- Modèle v2, étape 7 (moteur, mode riche seulement) : le flou gaussien et l'ombre portée d'une forme ou d'un groupe se lisent,
  s'écrivent en filtres portables (`<filter id="ed-f-…">`, région calculée, `color-interpolation-filters="sRGB"`), suivent les
  transformations, comptent dans la boîte visuelle et sont gardés par le projet. Les exports de tracés les abandonnent en le
  disant. Toute autre primitive de filtre est refusée en la nommant (« un filtre (feTurbulence) ») ; un filtre, une découpe ou un
  masque posés sur un clone `<use>`, un texte, un symbole ou tout le dessin sont refusés en disant où, au lieu de se perdre.

- Modèle v2, étape 5 (moteur, mode riche seulement) : les découpes. Un `clip-path` vers un `<clipPath>` (unités de boîte,
  transformation, `<use>`, `clip-rule`, découpe imbriquée) se lit en découpe d'un groupe ; une forme découpée s'enveloppe dans un
  groupe. Ce qu'un navigateur ignore est ignoré et dit ; une forme CSS, un renvoi extérieur, un cycle, une imbrication au-delà de
  8 niveaux ou plus de 20 000 formes de définitions sont refusés en les nommant. Les découpes s'écrivent en
  `<clipPath id="ed-c-…">` par empreinte et suivent leur groupe quand il se transforme. « Créer une découpe » et « Libérer »
  (moteur) ; la descente vers le PDF, le DXF, l'EPS et le SVG de découpe rogne les remplissages (un trait est gardé entier et
  c'est dit) ; le projet JSON garde les découpes. Le mode plat ne change pas.

- Modèle v2, étape 1 (moteur, pas encore atteignable depuis l'interface) : en lecture riche, les `<g>` restent des groupes
  (nom, opacité ; la transformation est cuite dans les formes) et se réécrivent à l'identique ; quatre opérations pures (grouper, dégrouper, déplacer dans un
  groupe, renommer). Une image ou un dégradé sous un groupe transformé suivent le groupe ; les exports à plat multiplient l'opacité du groupe. Le projet du site garde la table des groupes.

- Modèle v2, étape 3 (moteur, pas encore atteignable depuis l'interface) : en lecture riche, les dégradés linéaires et radiaux
  sont lus (unités de boîte, pourcentages, transformation, chaîne `href`, 64 arrêts au plus), réécrits sous un identifiant
  d'empreinte, une seule définition par dégradé, et suivent leur forme. Les exports qui ne savent pas peindre un dégradé (PDF, SVG
  de découpe, DXF, EPS, fichiers Cricut) reçoivent sa couleur moyenne et le disent ; le nuancier lit les couleurs des arrêts. Le
  projet du site garde dégradés et images ; celui d'un dessin plat ne change pas d'un octet. La vignette du site
  montre les dégradés.

- Modèle v2, étape 12 (moteur, pas encore atteignable depuis la page) : une image PNG, JPEG, GIF ou WebP intégrée en `data:` se
  lit en mode riche, vérifiée sur ses octets (une « image » qui est un SVG ou une adresse extérieure sont refusées en le nommant ;
  4 Mo par image, 16 Mo par dessin, 64 millions de pixels lus dans l'en-tête), s'écrit en `xlink:href` à l'identique, suit ses
  transformations, et les exports de tracés (PDF, DXF, EPS, découpe) l'abandonnent en le disant.

- **Règles et repères** (ADR-0038) : règles en haut et à gauche de la toile (unités du plan, ou mm et pouces d'un contexte de
  production), repères qu'on tire d'une règle, qu'on déplace, verrouille, retire (glisser hors de la toile ou Suppr) et pose à
  une valeur exacte (double-clic, ou le panneau « Repères ») ; les aimants s'y accrochent ; menu Vue : Maj+R, Ctrl+;, Ctrl+Alt+;,
  Ctrl+Maj+;. Le document les garde en `data-ed-reperes` sur la racine, seulement s'il y en a, et le projet aussi ; aucun export.
- **Répéter la sélection** : dupliquer en grille, répétition radiale, symétrie autour du centre ou d'un repère, en gardant ou non
  l'original, avec aperçu en direct (menu Édition et menu « Répéter » de la sélection). Coins arrondis en direct (un curseur) et
  « Arrondir ce coin » en mode points. Largeur variable du trait : le trait devient une surface qui suit un profil début, milieu,
  fin. Aucune référence d'écriture ne change ; six références neuves.

- **Les outils de sélection** (ADR-0035) : le cadre prend toute forme dont le tracé réel (surface remplie selon sa règle, ou encre
  du trait) touche le rectangle, même en partie — plus le trou d'un anneau, ni le coin vide de la boîte d'une diagonale ; « Les
  formes entièrement dedans » se choisit au menu de l'outil (zone en trait plein, tirets pour « touchées ») ; un bouton de la barre
  reprend Sélection (V), **Cadre de sélection (B)**, qui commence même sur une forme et sert au doigt, et **Lasso (Q)** ; Maj
  ajoute, Alt retire ; pendant le geste, le liseré de survol montre ce que le relâchement prendra ; au clavier, le réticule pose
  les coins du cadre ou les points du lasso. Menu Édition : Inverser la sélection (I), même couleur de contour (Alt+C), même type
  (Y) ; en Cricut, tout ce qui est à couper / à écrire (Alt+Maj+X, Alt+Maj+E). Aucun octet écrit ne change.

- Modèle v2, étape 0 (ADR-0012) : des coutures sans effet visible. Types du modèle v2 en champs facultatifs ; arbre dérivé et
  invariants ; points d'extension de la lecture, de l'écriture et des transformations (catalogue vide) ; écriture riche en
  squelette et définitions nommées par empreinte ; descente vers un dessin plat (`aplatirPour`) ; garde-fous (références v1 gelées
  par manifeste, loi du dessin plat, contrat des fonctionnalités, harnais `ecriture-stable-v2`). Aucun octet écrit ne change.
  L'ADR-0012 et son plan sont révisés après les ADR-0022 à 0037.

- **Le nuancier se tire du dessin, et de la sélection** (ADR-0037) : à l'ouverture d'un SVG, d'un PDF ou d'une image convertie,
  la section « Nuancier » de l'inspecteur propose « Couleurs du dessin » : les couleurs réellement employées, rangées par surface
  couverte, les presque identiques fondues (écart OKLab ≤ 0,02), 24 au plus, noir et blanc gardés. « Créer le nuancier depuis la
  sélection » (menu Édition, rangée de la sélection, Maj+N pour remplacer, Alt+Maj+N pour ajouter) le remplace ou le complète, et
  Ctrl+Z le défait ; le nuancier de la page ou de l'hôte reste à côté (« Nuancier proposé »). Un clic pose la couleur sur le
  remplissage, Maj+clic sur le contour ; chaque pastille a un nom approché en français. L'atelier de conversion montre le nuancier
  de l'image et celui du tracé. Export `.gpl` et `.ase` ; le projet JSON le garde (`dessin.nuancier`). Aucun octet SVG ne change.

- **Ouvrir depuis une adresse** (ADR-0036) : un champ « Ouvrir depuis une adresse » dans les voies « Ouvrir un SVG ou un PDF » et
  « Convertir une image », et « Insérer depuis une adresse… » dans le menu Fichier de l'éditeur (un SVG ou la première page d'un
  PDF). Un lien glissé, ou une adresse collée seule dans la zone de code, l'ouvre aussi ; rien ne part avant ce geste. Le type se
  décide sur les octets reçus, jamais sur l'extension, et la lecture reste celle d'un fichier d'inconnu. Dans la page autonome, le
  navigateur va chercher le fichier (https seulement, sans cookie ni référent, 100 Mo et 60 s au plus, annulable) et dit
  clairement un refus CORS ; sur le site PHP, le serveur le fait, avec des protections anti-SSRF (adresses privées refusées en
  IPv4 et IPv6, connexion épinglée, redirections revues, taille et délai bornés, journal sans chemin ni paramètre ; cURL requis).

- **Les formes de base** (ADR-0033) : une palette de 26 formes en cinq rubriques (Basiques, Polygones, Symboles, Étiquettes,
  Traits), ouverte par le chevron « Formes » de la barre ou par F : carré, cercle, rectangle arrondi, triangle, losange,
  parallélogramme, trapèze, polygone de 3 à 12 côtés, étoile réglable, cœur, flèche simple ou double, croix, anneau percé,
  demi-cercle ou quart, goutte, lune, nuage, étiquette, badge festonné, bulle de dialogue, arc, spirale et vague. Chaque forme est
  un chemin ordinaire, tracé d'un glisser ou au clavier ; ses réglages sont dans le panneau (« Forme à tracer ») ; Maj garde les
  proportions ; le bouton de la barre reprend la dernière forme. Aucun octet écrit ne change ; référence neuve `formes-de-base`.

- **Le texte déformé dans une forme** (ADR-0032) : « Dans la forme » étire et courbe tout le texte jusqu'au contour (un cœur, un
  cercle, une étoile), lettres déformées, le bloc à la silhouette de la forme. Il reste modifiable : on le retape sur la toile, la
  déformation suit, et il suit sa forme ; il marche aussi en tracé Médian et pour couper ou écrire. Le fichier ne porte que des
  contours et `data-ed-disposition="enveloppe"` ; le projet garde `{ mode: 'enveloppe', forme, marge }`.

- **Le site PHP** (ADR-0030), construit dans `dist/php/` à côté de la page autonome, qui ne change pas : connexion par un mot
  de passe unique, en empreinte dans `data/pwd` (`php outils/mot-de-passe.php`), session sûre, jeton CSRF, délai croissant après
  trois échecs ; écran « Mes projets » (nouveau, ouvrir, renommer, dupliquer, supprimer vers la corbeille) ; « Enregistrer »,
  Ctrl+S et « Enregistrer sous… » écrivent le projet sur le serveur, avec l'état « Enregistré / Modifications non
  enregistrées » et un contrôle de révision entre onglets ; bibliothèques, index et aperçus des polices servis en JSON depuis
  `data/json`, fontes depuis `data/font` ; une police du catalogue téléchargée et vérifiée par sha256 par le serveur : le
  navigateur ne contacte que le site. Installation : `docs/deploiement-php.md`.
- **Le projet JSON natif** (`model/projet.ts`, `engine/projet.ts`) : versionné, migré, validé sans lever ; il contient tout le
  modèle (textes vivants et leur disposition, opérations Cricut, contexte, nuancier, fonte déposée, image source) et, rouvert,
  réécrit le même SVG à l'octet.
- Tests PHP sans dépendance (`npm run test:php`) et leur étape dans la CI ; `tests/e2e/site-php.e2e.ts` contre `php -S`.

- **Le texte épouse une forme** (ADR-0031). Posé sur une forme, il suit son tracé : le cercle d'un badge, un arc, une vague ;
  ses lettres sont tournées sans être déformées ; on choisit le point de départ (poignée sur la toile, clavier ou panneau), le
  côté (dessus ou dessous, extérieur ou intérieur), l'alignement, et on peut répartir les lettres sur tout le tracé. Posé dans une
  forme fermée, il la remplit ligne à ligne, coupé sur ses bords, trous respectés, avec une marge, l'alignement, la justification
  et une taille ajustée pour remplir. Un texte qui dépasse ou ne tient pas le dit. Le texte reste modifiable et suit sa forme
  quand elle change ; supprimer la forme le rend libre ; la forme peut être masquée. Gestes : « Disposition : Libre | Sur la
  forme | Dans la forme » dans la barre de texte, puis un clic sur la forme (ou Tab puis Entrée) ; « Texte et forme » dans le
  menu de la sélection. Le fichier ne porte que des contours ; la disposition et le lien s'écrivent seulement quand ils existent
  (`data-ed-disposition`, `data-ed-forme`…). Aucune référence d'écriture existante ne change ; deux références neuves.

- **Couper ou écrire, forme par forme** (ADR-0028) : en contexte Cricut, chaque forme est « À couper » ou « À écrire ». Une forme
  pleine se propose à la découpe ; un trait seul, une ligne médiane ou un texte à trait unique à l'écriture ; tout au stylo par
  défaut. Le panneau de gauche range les formes en deux groupes (vignette, sélection Maj/Ctrl, bouton pour changer de groupe,
  glisser). La rangée de la sélection et le menu Édition changent l'opération (Maj+X, Maj+E, Ctrl+Z annule).
- **Aperçu de la machine sur la toile** (menu Vue, Maj+O, actif par défaut en Cricut) : la zone que la lame découpe est hachurée,
  trous respectés, et la ligne du stylo est tracée à sa largeur. Deux jetons : `--apercu-coupe`, `--apercu-stylo`.
- Export d'un dessin mêlé : une archive avec le fichier à couper, le fichier à écrire, les deux ensemble en deux groupes, et un
  mode d'emploi. Témoin 9 au protocole, quatre comportements de Design Space à vérifier.

- **Le texte se tape sur la toile** (ADR-0027) : un clic de l'outil Texte (ou Entrée au clavier) pose un point d'insertion et
  l'on tape directement sur la toile ; Entrée va à la ligne, Échap ou un clic hors du texte termine la saisie, et un texte vide
  n'est pas créé. Un double-clic ou Entrée rouvre un texte au bon endroit : sélection à la souris et au clavier, copier-coller du
  texte brut, Ctrl+Z qui défait toute une frappe d'un geste.
- **Une barre de texte « comme Word »**, à la place de la rangée de la sélection : police et « Toutes les polices », style,
  taille, tracé, alignement, et « Plus d'options » qui ouvre le panneau Texte ; Alt+F10 y mène depuis le texte. Resserrée au
  doigt et sous 640 px.
- **Le tracé « Plein | Médian » d'un texte vivant** : en Médian, chaque lettre d'une police à contour devient une seule ligne au
  milieu du trait, pour le stylo, calculée dans le moteur pur par la chaîne de la ligne médiane et mémorisée par glyphe ; écrite
  `data-ed-trace="median"`, rendue à l'identique par la vectorisation, l'export et l'aperçu. Une référence neuve
  (`texte-vivant-median`) ; aucune existante ne change.

- **Une forme se prend facilement sur la toile** (ADR-0029) : tolérance de 6 px autour du tracé à la souris, 12 px au doigt,
  à tout zoom ; un texte se prend entre ses lettres ; une petite forme a une cible minimale ; un trait fin posé sur un fond se
  prend sans viser au pixel. Alt+clic passe à la forme du dessous, en boucle, et le dit à voix haute.
- Avec l'outil de sélection, le curseur devient « déplacer » au survol d'une forme qu'un clic prendrait, et un liseré discret
  (cyan sur un halo de panneau) la montre ; au doigt, le liseré vient au toucher. Une forme verrouillée ne montre ni l'un ni
  l'autre.

- **« Toutes les polices » montre l'allure de chaque police sans rien télécharger** (ADR-0026) : le nom d'une police déjà
  disponible (livrée, déposée, téléchargée dans la session) se dessine dans sa propre fonte ; celui d'une famille du catalogue
  vient d'un aperçu préparé (2 163 familles sur 2 200), dans l'annexe facultative `polices-apercus.js` (1,9 Mo, 0,64 Mo
  compressé), chargée à l'ouverture de la liste ; sans elle, les noms s'écrivent dans la police de l'interface. Les aperçus
  sont tirés de l'instantané commis `data/apercus-polices.json` par `scripts/apercus-polices.mjs`, lancé à la main. Aucune
  requête réseau, aucun octet écrit ne change ; la page prend 7,8 Ko.

- **Les polices libres à la demande** (ADR-0025) : « Toutes les polices » dans l'outil Texte ouvre plus de 2 000 familles
  libres (Google Fonts et Fontsource, la League of Moveable Type, SIL, Collletttivo, Velvetyne, Fontshare) : recherche,
  filtres, favoris, récentes, polices du document avec « Remplacer partout », vos polices (fichier déposé, ou polices de
  l'appareil quand le navigateur le permet). Rien ne se télécharge sans votre accord, donné serveur par serveur, retenu et
  révocable ; chaque fichier est vérifié par son empreinte sha256 avant d'être lu, une empreinte fausse est refusée et dite.
  Un texte garde l'identifiant et la version de sa police pour se recomposer à l'identique ; la licence de chaque police
  employée est nommée dans « À propos et crédits ». Chez un hôte, l'option `policesEnLigne` est fausse par défaut. L'index
  est un instantané commis (`data/catalogue-polices.json`, `scripts/catalogue-polices.mjs`), livré dans l'annexe
  `polices-catalogue.js` (1,3 Mo, à la demande) ; la page prend 38 Ko. Aucun octet écrit ne change.

- **Un accueil par public** (ADR-0024) : l'accueil demande « Pour quoi dessinez-vous ? » (machine de découpe, retouche,
  intégration), sans obligation (« Passer »), retenu dans le stockage injecté (`svg.accueil`, relu champ par champ ; le
  temps de la page sans stockage) et changeable (« Changer de public »). Chaque public voit son circuit en trois étapes
  jusqu'au fichier prêt et les voies dans son ordre ; la machine ouvre l'éditeur en contexte Cricut (Maker, découpe,
  millimètres) ; la retouche met l'invitation à la visite en évidence ; les intégrateurs ont un panneau (options
  principales, extrait copiable, guide, « Essayer l'éditeur embarqué »).
- La propriété `production` d'`EditeurSvg` : un contexte de production de départ quand le SVG ne porte aucune marque ;
  rien ne s'écrit sans modification.

- **Cinq bibliothèques libres de plus** (ADR-0023) : Material Design Icons (Apache 2.0), Phosphor, Tabler, Healthicons (MIT)
  et Lucide (ISC), soit 19 000 formes nommées en français par le lexique et rangées par les mêmes règles d'événement,
  chacune chargée à la demande depuis sa pastille « Source ». Une pastille « Nature » sépare les formes pleines (découpe) des
  formes en ligne (stylo) ; au stylo du contexte Cricut, « En ligne » vient d'abord. Les marques et logos sont écartés par
  règle. Une forme garde son origine (`data-origine`) ; seule une forme CC BY fait écrire une mention dans le fichier. Aucun
  octet existant ne change (l'annexe de game-icons et ses 4 134 empreintes sont intactes ; chaque source a les siennes).

- **Le texte reste modifiable** (ADR-0022) : un texte créé dans l'éditeur garde sa chaîne, sa police, sa taille, son
  interlettrage, son interligne et son alignement à côté de ses contours exacts ; un double-clic le rouvre dans le panneau
  Texte. Le fichier écrit ne porte que les contours (jamais de `<text>`, jamais de fichier de police) ; la recomposition se
  garde en `data-ed-*`. Aucune référence d'écriture existante ne change.
- **Vectoriser le texte** (Ctrl+Maj+O) : trois façons, lettres séparées, souder les lettres qui se touchent, tout souder ;
  l'export vectorise de lui-même. Le contexte Cricut signale des lettres qui se chevauchent (la lame couperait à travers).
- **Dessin au stylo** : un procédé du contexte Cricut pour la machine qui écrit au lieu de couper ; il ne remplit jamais une
  forme, propose des hachures, une police à trait unique (une lettre est une ligne, pas un contour) et la ligne médiane.
- **« Aperçu forme / ligne »** à côté de chaque police, au clic seulement : la lettre telle que la machine la coupera ou
  l'écrira.

- **Ligatures du texte** : `composer(…, { ligatures })` (éteint par défaut dans le moteur, aucun octet existant
  ne bouge), lecture GSUB pure dans `io/ligaturesGsub.ts`, case « Ligatures (fi, fl…) » du panneau Texte,
  offerte pour les fontes qui en ont (Oswald, Playfair, Lobster, Pacifico, Caveat, Fredoka ; pas Inter ni
  Bebas Neue). `Glyphes.ligature` est facultative.
- **Au clavier, la suite** (ADR-0011, amendement) : tracé à deux coins (Espace ou Maj+Entrée pose le premier
  coin, les flèches déplacent l'autre sous un aperçu, Espace ou Entrée le pose, Échap annule), sélection
  additive (Maj+Page suivante ou précédente, Espace), outil texte (Entrée met le focus dans le champ).
  Chaque bouton de la rangée de sélection, et Ctrl+] / Ctrl+[, dit ce qu'il a fait.
- **L'audit `axe-core` échoue aussi sur tout doute** (`incomplete`) absent d'une liste écrite et motivée,
  vide aujourd'hui : 28 écrans, 0 grave, 0 autre, 0 « à relire ». Tests de navigateur : 274 au total.
- **L'éditeur se pilote et se lit sans souris** (ADR-0011) :
  - Tab et Maj+Tab passent à la forme (ou au point, en mode points) suivante ou précédente, et laissent le
    focus quitter la toile aux bouts ; Page suivante et Page précédente font de même en boucle ; Entrée sur
    une forme ouvre ses points ;
  - Alt+flèches redimensionnent (Maj ×10), Ctrl+flèche gauche ou droite tourne de 15° (Maj : 1°) ;
  - un réticule piloté aux flèches pour les outils de tracé : Entrée pose la forme ou le point de la plume,
    Maj+Entrée termine le tracé ;
  - une région vocale unique dit la sélection, l'outil, le point actif, annuler et rétablir, la création, la
    suppression et les erreurs, et redit une phrase identique ;
  - les calques portent un nom accessible avec leur genre et leur couleur, et un lien « Aller à la toile »
    ouvre la tabulation ;
  - mode contraste forcé (`forced-colors`) : états enfoncés, lignes choisies, focus, poignées et réticule en
    couleurs du système ;
  - audit `axe-core` en test de navigateur sur 25 écrans, tests de clavier et de contraste forcé (71 tests de
    navigateur de plus, 216 au total).
- **Tests sur un dessin de 2 000 couleurs** (11 tests de navigateur : défilement, clavier, doigt) et tests
  d'équivalence des nuances proches contre l'ancienne implémentation.
- **Menu Édition, « Booléens : rebâtir les courbes »** (actif par défaut, propre à la session, rien n'est
  écrit) : l'union de deux cercles reste ronde, avec une vingtaine de points au lieu de plus de deux cents.
  Le moteur garde `lisser` faux par défaut, donc `appliquerBooleen` et les références ne changent pas. La
  barre d'état dit ce que le booléen a fait : « Union faite : 2 formes, 21 points (courbes rebâties). »
  ou « … en segments droits. ».
- **Un stockage injectable** (`io/stockage.ts`) : l'éditeur reçoit `stockage` (le magasin du navigateur,
  celui de l'hôte, ou rien) et ne touche plus `localStorage` ; l'embarquement l'expose comme option
  (`false` pour ne rien garder). 7 tests de navigateur de plus.
- **À l'ouverture d'un SVG**, une phrase dit ce que la lecture n'a pas repris (marqueurs, pointillés,
  bouts et jonctions de trait, règles de style hors classe, peinture de la balise `<svg>`, animations) ;
  le panneau du dessin la répète. `lireDessin` rend pour cela `ignores`.
- **L'inspecteur règle l'opacité du fond et celle du contour, le bout, la jonction et le style du trait**
  (plein, tirets, pointillés, mixte) ; la toile et le PDF (`J`, `j`, `M`, `d`) les dessinent.
- **« Simplifier les tracés »** dans « Nettoyer le tracé » : retire les points inutiles des segments
  droits au seuil choisi ; courbes et formes verrouillées intactes (moteur : `simplifierChemin`,
  `simplifier`).
- **Booléens, option `lisser` du moteur** : rebâtit en cubiques vérifiées les arcs du résultat (une union
  de deux cercles passe de 228 à 23 points) ; non branchée dans l'interface.
- **Tests de navigateur, seconde série** : calques par couleur (recoloration en une entrée d'historique,
  même couleur, nuances proches, isolement, tactile 420 px) et embarquement (`window.EditeurSvg`,
  poignée, rappels, thèmes, 390 px, annexes) : 53 tests de plus, 121 au total. Un échec laisse une
  capture et les erreurs de page dans `test-results/`, que le job `navigateur` publie en artefact.
- **Un script d'embarquement** (`dist/editeur-svg-embarque.js`, `npm run embarquer`) : un script classique
  qui pose `window.EditeurSvg.ouvrir({ svg, onEnregistrer, … })` (avec `estEditable` et `version`),
  amène ses propres styles cantonnés à l'éditeur, et marche depuis le disque. Une page d'exemple
  (`exemples/integration.html`), un guide (`docs/integration.md`) et l'option `baseAnnexes` pour ranger
  `bibliotheque.js`, `polices.js` et `vtracer.js` ailleurs qu'à côté de la page.
- **Un registre de jetons de couleur** (ADR-0007, `src/styles/jetons.ts`, documenté dans
  `docs/jetons.md`) : chaque couleur de l'interface a un rôle, une valeur claire, une valeur sombre et
  une description ; le CSS des variables est généré au build, et la page n'écrit plus aucune couleur
  (damier, fonds de la toile et ombres sont devenus des jetons). Les contrastes texte-fond sont des
  données tenues à 4,5:1 (WCAG AA) dans les deux thèmes (`contraste` dans `util/couleur.ts`), et un
  test confronte le registre à la page et au code (aucune couleur en dur, aucun jeton orphelin). Deux
  jetons morts (`ok`, `ok-fond`) sont retirés ; l'interface ne change pas.

- **Calques par couleur, suite** : recolorer une couleur depuis sa ligne (sélecteur ou nuancier, selon
  Fond / Trait / Les deux, un seul Ctrl+Z par geste) ; « Sélectionner la même couleur » (menu Édition,
  touche C) ; nuances proches (distance perçue OKLab, curseur de tolérance) à sélectionner ou à
  fusionner dans la couleur la plus employée, formes verrouillées intactes ; « Quitter l'isolement »
  rend la visibilité d'avant. Trois cas de référence ajoutés, les SVG écrits ne changent pas.
- **Tests de non-régression de l'écriture SVG** : 25 cas de référence (`tests/fixtures/svg`) et la
  bibliothèque entière relue puis réécrite à l'identique, avec une empreinte par forme ; tout écart
  signale un événement de version majeure.
- **Tests de la couche `io`** (traitement d'image avec le vrai vtracer, détourage, polices, fichiers,
  chargements à la demande) sous un navigateur factice minimal.
- **Tests de navigateur** : `npm run e2e` (68 tests Playwright pilotés par vitest sur la page
  construite : accueil, menus, édition, calques par couleur, atelier de vectorisation, bibliothèque,
  exports, tactile 420 px, accessibilité) et un job CI `navigateur`.
- **Calques par couleur** (ADR-0006) : dans le panneau Calques, une section « Par couleur » liste
  chaque couleur du dessin, lue sur le remplissage, le contour ou les deux. Un clic choisit ses formes
  (Maj : les ajoute à la sélection) ; des boutons les masquent ou les affichent, les verrouillent ou
  les déverrouillent ; un menu les combine en une forme, n'affiche qu'elles, ou les supprime. Une
  couleur dont tout est masqué reste dans la liste, pour pouvoir la rendre. S'y ajoutent « Inverser »
  la sélection et « Tout afficher » en tête du panneau.
- **Neuf chantiers pour créer, pas seulement retoucher** (ADR-0004) :
  - **booléens** : union, soustraction, intersection, exclusion, dans la rangée de sélection et
    l'inspecteur ; le résultat est en segments droits, au style de la forme la plus basse ;
  - **texte en formes** (outil T) : neuf fontes libres chargées à la demande, ou une fonte TTF/OTF
    déposée ; taille, interlettrage, retour à la ligne ; une forme par lettre, au centre du plan ;
  - **aimants** (M) : en déplaçant, les bords et centres des autres formes et du plan attirent la
    sélection et se dessinent en pointillés ;
  - **transformations numériques** : rotation, inclinaison X et Y, échelle en pourcentage dans
    l'inspecteur, et une poignée de rotation sur la boîte (Maj : par 15°) ;
  - **recolorer** : douze palettes d'événements et trois neutres, le nuancier, « une couleur », ou
    la sienne ; la couleur la plus présente prend la première ;
  - **bibliothèque** : un panier (« + » sur une vignette) inséré en grille, sept scènes prêtes par
    événement, et la correction du nom ou du classement d'une forme dans la page, exportée en JSON
    vers `bibliotheque/corrections.json` ;
  - **exports** : SVG, SVG de découpe (contours seuls), PNG à 512, 1 024, 2 048 ou 4 096 px, PDF
    vectoriel, depuis la barre de l'éditeur et depuis la page ;
  - **reprise** : le dessin en cours survit à un rechargement (« Reprendre ») ; des versions nommées
    gardées dans le navigateur, avec retour et export ;
  - **tablette et mobile** : barres sur une ligne qui défile, calques et inspecteur en tiroirs
    depuis la barre d'état, zoom à deux doigts.
- **L'éditeur SVG plein écran** (ADR-0001) : un moteur pur (`engine/editionSvg.ts` : lecture d'un SVG
  en formes à plat, transformations appliquées, peintures résolues, opérations immuables, points et
  poignées, couleurs, nettoyage du tracé, écriture), un lecteur XML sans DOM, le nettoyage d'un
  SVG, un historique immuable, et le composant React `EditeurSvg` : sélection, déplacement, coins,
  miroirs, rotations, alignements, empilement, dupliquer, masquer, verrouiller, supprimer ; points
  et poignées ; couleurs au sélecteur, au code ou au nuancier ; poussières, regroupement, plan de
  travail ; zoom, main, contours, fonds ; annuler et rétablir chaque geste.
- **Des outils de tracé** : rectangle, ellipse, étoile (S), ligne (Maj contraint), plume (cliquer les
  points, Entrée ou double-clic ferme, Retour arrière retire un point, Échap abandonne), avec le
  style courant (remplissage, contour, épaisseur) réglé dans l'inspecteur.
- **Tout et Aucun** en tête des calques, pour tout sélectionner ou rien.
- **Une barre d'outils à icônes** : chaque bouton de la barre et de la rangée de sélection est une
  icône vectorielle dessinée dans la page (`zones/icones.tsx`, 46 icônes, aucune police ni réseau),
  avec son infobulle et son raccourci ; boutons carrés neutres, groupes séparés, état actif en
  couleur d'outil, fonds damier, blanc et sombre en trois boutons. Lisible dans les deux thèmes.
- **Une barre d'outils étendue pour aller vite** : les deux couleurs courantes (remplissage, contour)
  à portée de main, qui changent la sélection ou les formes à venir ; copier, couper, coller
  (Ctrl+C, Ctrl+X, Ctrl+V) ; une grille magnétique (G) au pas lisible du plan, qui aimante les
  tracés, les points, les poignées et les déplacements ; le zoom sur la sélection (Z) ; Ctrl+S
  enregistre. Quand une sélection existe, une rangée contextuelle réunit alignements, miroirs,
  rotations, empilement (Ctrl+] et Ctrl+[), **Combiner** (Ctrl+G : plusieurs formes en un seul
  tracé, au style de la plus haute), **Séparer** (Ctrl+Maj+G : une forme en un tracé par
  sous-chemin, pour recolorer les parties d'une silhouette de la bibliothèque), dupliquer, masquer,
  verrouiller, supprimer.
- **Un atelier de résultat sous « Convertir une image en SVG »** (ADR-0005) :
  - **l'image déposée s'affiche aussitôt**, en miniature dans la zone de dépôt, puis dans la
    visionneuse en « Originale » et « Détourée » ;
  - **une visionneuse** : comparer (un rideau entre l'image détourée et les vecteurs), rendu,
    contours, détourée, originale ; zoom ajusté, 100, 200 et 400 % ; fond damier, blanc ou sombre ;
    le poids, le nombre de tracés, le temps et les réglages du résultat ;
  - **des réglages fins du traceur** : couleurs retenues, poussières, simplification, angles vifs,
    précision des couleurs, écart entre couches, courbes lissées ou segments droits, formes empilées
    ou découpées. Chaque curseur montre la valeur du mode, se marque quand on s'en écarte et revient
    d'un clic ; chaque mode ne propose que ceux qui y changent quelque chose ;
  - **rejouer** à chaque changement (après une courte pause, désactivable) ou à la demande ; un
    résultat qui arrive après un lancement plus récent est jeté ;
  - **les huit derniers essais**, avec miniature, résumé des réglages, tracés, poids et temps : un
    clic reprend les réglages et le résultat, sans relancer le traceur.
- **Détourage sur toute l'image** : une case « Sur toute l'image : transparence complète de cette
  couleur » efface la couleur du fond partout, y compris à l'intérieur des formes, au lieu des
  seuls pixels reliés au bord. Le résumé dit la portée choisie.
- **Convertir une image en SVG** (ADR-0002) : PNG, JPG, GIF ou WebP ramené à 1 024 px, fond détouré
  par propagation (tolérance réglable), puis vectorisé par vtracer embarqué en WASM et chargé à la
  demande (modes aplats, trait, fidèle ; trois grains), ou enveloppé tel quel. Le résultat se voit
  en rendu et en contours, se télécharge, se copie, et s'ouvre dans l'éditeur.
- **Une bibliothèque de 4 134 formes pleines** (ADR-0003), silhouettes de game-icons.net (CC BY 3.0),
  nommées en français par un lexique de 3 200 mots et classées par 45 événements : le calendrier
  français (Nouvel An, Épiphanie, Chandeleur, Saint-Valentin, Carnaval, Saint-Patrick, printemps,
  poisson d'avril, Pâques, fête du travail, fêtes des mères et des pères, fête de la musique, été,
  14 Juillet, rentrée, automne, Halloween, Toussaint, 11 Novembre, Noël, hiver, Hanoucca, Ramadan,
  Nouvel An chinois, Diwali), la vie (naissance, anniversaire, mariage, concert, sport, voyage,
  études, travail, santé, fête) et les catégories (personnage, bâtiment, animal, nature, nourriture,
  véhicule, arme, objet, symbole). Recherche par nom sans accents et par événement, dans la page
  (une forme s'ouvre dans l'éditeur) et dans l'éditeur (une forme s'insère au centre du dessin).
  Construite en `dist/bibliotheque.js` par `npm run bibliotheque`, chargée à la demande.
- **Une page autonome** (`npm run construire` → `dist/editeur-svg.html`) : déposer un fichier SVG,
  coller un code ou ouvrir l'exemple ; un nuancier tapé à la main (« Nom #rrggbb » par ligne) ;
  l'éditeur en plein écran ; le résultat en aperçu, à télécharger ou à copier. Rien ne quitte le
  navigateur.
- **L'outillage** : TypeScript strict, ESLint (aucun `any` dans le moteur, aucune assertion `!`,
  150 lignes par fonction au plus), cliquet de rigueur, test d'architecture (couches, cycles,
  pureté), CI `verifier` et construction de la page.
- **Conformité** : boîte « À propos et crédits » (pied de page et menu Fichier), `THIRD-PARTY-NOTICES.md`
  et `dist/MENTIONS.txt` générés par `scripts/mentions.mjs` (les textes de licence sont lus dans les
  paquets, jamais recopiés ; un test confronte la liste au `package-lock.json`), `SECURITY.md`,
  `CONTRIBUTING.md`.
- **Prétraitement des images avant le traceur** (`engine/pretraitement.ts`, `engine/pixels/*`) : aplatir
  l'alpha, débruiter (médiane, bilatéral), agrandir ×2, netteté, gamma, réduire à N couleurs, lisser les
  bords, avec des préréglages. Comme les réglages fins du traceur (ADR-0005), un réglage n'existe que
  s'il a été touché : sans réglage, le traceur voit les mêmes octets qu'avant (15 empreintes SHA-256 dans
  `tests/unit/io/identite-sans-pretraitement.test.ts`). Vue « Prétraitée » et bilan dans l'atelier.
- **Conversion par lot** : plusieurs images à la fois, une liste d'état par image, résultat en archive ZIP
  (`export/zip.ts`, pur).
- **Exports** : options partagées (unité, taille, résolution, précision), PDF avec page, fond perdu,
  repères de coupe et CMJN naïf, EPS niveau 2, DXF R12, JPEG et WebP, PNG avec résolution (`pHYs`).
- **Navigateurs** : garde de démarrage qui dit en français ce qui manque, replis sans `color-mix`, `:has`
  ni lookbehind (jetons `repli-*`), tests de navigateur indépendants du moteur et matrice CI
  chromium / firefox / webkit (firefox et webkit n'échouent pas encore le job). Voir `docs/navigateurs.md`
  et `docs/verification-manuelle.md`.
- **ADR-0012** (proposée) : le modèle v2 (groupes, masques, dégradés, texte vivant, effets) et ses neuf
  annexes ; rien n'est encore implémenté.
- **Outils de tracé** : *Contour en forme* (le trait, avec bouts, jonctions, pointillés et alpha, devient une forme
  pleine de même silhouette), *Décaler le contour* (vers l'extérieur ou l'intérieur, jonction en pointe,
  arrondie ou biseautée ; trous et tracés ouverts traités, effacement total dit), *Arrondir les angles* (un arc
  de cercle au rayon voulu à chaque coin, ramené au plus grand rayon possible et dit), types de nœuds (angle,
  lisse, symétrique, lus sur la géométrie ; glisser une poignée entraîne l'autre, Alt la rompt), casser,
  joindre, fermer et inverser un tracé, retirer un point en gardant la courbe. Menu Édition et section
  « Transformer » de l'inspecteur. Quinze cas de référence neufs, les écritures existantes sont intactes. Un
  trait très enchevêtré (environ 1 cas sur 75) est refusé en le nommant.
- **Licence** : le projet est propriétaire, tous droits réservés (`LICENSE`, `"license": "UNLICENSED"`) ; les composants tiers gardent leurs licences (`THIRD-PARTY-NOTICES.md`). À faire relire par un juriste avant toute diffusion.
- **Sécurité** : un modèle de menaces (`docs/securite.md`), un corpus de 166 SVG hostiles (`tests/fixtures/hostile`),
  un fuzzer déterministe (`FUZZ_ITERATIONS`, `FUZZ_GRAINES`) et une preuve en navigateur : aucun script, aucune
  requête, des exports SVG, PNG et PDF inertes. Des refus nommés en français pour un SVG trop gros, trop profond,
  trop chargé en éléments, en attributs, en tracé ou en règles de style, pour des coordonnées démesurées et
  pour une peinture illisible.
- **`nettoyerSvg` lit le document au lieu de remplacer du texte** (`util/assainirSvg.ts`) : liste blanche d'éléments,
  d'attributs et d'adresses, CSS résolu des échappements et nettoyé jusqu'à stabilité, sortie en XML bien formé.
  Un attribut répété est refusé ; commentaires, instructions de traitement, DOCTYPE et attributs à préfixe
  inconnu sont retirés ; aucune entité n'est développée. Les octets écrits par l'éditeur ne changent pas.
- Les options d'`ouvrir` sont validées (`baseAnnexes` en `javascript:`, `data:` ou `blob:`, un `svg` ou un titre
  démesuré, une `bibliotheque` sans `entrees`) ; le brouillon, les versions, les corrections et la bibliothèque
  d'hôte sont validés champ par champ. Un plan de travail plus petit que 0,001 et un SVG dont toutes les formes
  sont vides sont refusés ; `fill=""` ne recouvre plus rien.
- **Corrigé** : un `<script>` recomposé par le nettoyage (`<scr<script></script>ipt>`), les contournements par
  préfixe d'espace de noms (`html:script`, `x:href`), les `url(` et `@import` obscurcis par échappement CSS, une
  animation visant `href` ; des temps quadratiques (`url(` ou `/*` non fermés, `scale(` dans un `transform`,
  50 000 règles de style, chemins clonés par `<use>`) ; un `RangeError` à 10 000 niveaux d'imbrication ; `NaN`,
  `Infinity` et `width="0"` dans un SVG enregistré ; un stockage empoisonné qui faisait planter l'accueil.
- **La page autonome ne contacte plus aucun serveur à l'ouverture** : ses polices d'interface (Instrument Sans et
  IBM Plex Mono, sous-ensemble latin, SIL OFL 1.1) sont embarquées au lieu d'être demandées à Google Fonts
  (+130 Ko pour `editeur-svg.html`). L'adresse IP ne part plus chez Google : « Rien ne quitte votre navigateur »
  est vrai à la lettre (constat 14 de `docs/securite.md`). Un test en navigateur, réseau coupé, le prouve ; un
  test sur le texte de la page interdit tout `<link>`, `@import` ou adresse externe. Les deux fontes sont citées
  dans `THIRD-PARTY-NOTICES.md`, `MENTIONS.txt` et la boîte « À propos et crédits ».
- **Sur un téléphone (640 px et moins), la barre de l'éditeur tient sans défiler** : outils, couleurs, historique et
  niveau de zoom, plus un menu « Plus » qui range Vue, Fichier (et ses exports) et Édition ; « Enregistrer » passe
  dans la barre d'état. Entre 640 et 900 px, la barre passe à la ligne au lieu de défiler.
- **« Enregistrer » grisé dit pourquoi** (« Aucune modification à enregistrer ») : il reste focalisable, la raison
  est lue et annoncée. Calques : « Tout », « Aucun », « Inverser » et « Tout afficher » sont de vrais boutons de
  28 px qui disent pourquoi ils sont inactifs. « Couleurs du dessin » choisit une teinte du nuancier par un menu à
  pastilles au lieu d'une liste déroulante. « Par couleur » est replié à l'ouverture d'un petit dessin.
- Aperçu avant/après (pixels vers formes) sur la voie « Convertir une image » de l'accueil.
- **WCAG 2.5.8** : toutes les cibles font au moins 24 × 24 px (20 cibles trop petites dans l'éditeur avant, 0
  après), prouvé par `tests/e2e/cibles.e2e.ts` sur 18 écrans ; les pastilles de la barre disent leur couleur aux
  lecteurs d'écran ; le bouton « aucun » garde un nom fixe et `aria-pressed` porte seul l'état.
- **Un contexte de production Cricut** (ADR-0013), choisi dans la barre (dans le menu « Plus » sur un téléphone) :
  Joy, Explore (Air 2 / 3), Maker (Maker / Maker 3) ; tapis 12 × 12, 12 × 24, Smart Material, tapis Joy ; papier
  cartonné (vinyle, thermocollant et feutre annoncés) ; découpe ou Print Then Cut ; pouces ou millimètres.
  « Générique » reste le défaut et ne change rien : aucun octet écrit ne bouge.
- **Le panneau « Prêt pour Cricut »** juge le dessin en continu (traits, transparences, pièces plus grandes que la
  zone utile, dépassement du tapis, tracés ouverts, nuances proches, parties plus fines que la lame par ouverture
  morphologique, trop de points, forme blanche posée comme un trou, pair-impair). Chaque constat a sa correction
  par un outil existant, annulable par Ctrl+Z et dite à voix haute ; taille finale et couches toujours affichées.
  Le tapis, sa zone utile et un quadrillage au pouce s'affichent sur la toile ; les outils prennent les valeurs
  du papier cartonné.
- **« Exporter pour Cricut »** écrit un SVG à taille physique (in ou mm), fonds pleins, une couleur par couche, sans
  trait ni opacité, et refuse en le nommant ce qu'il ne saurait écrire. En Print Then Cut : une archive ZIP avec
  l'image à imprimer et son fond perdu (PNG 300 ppp et SVG), la ligne de coupe (silhouette unie) et un mode d'emploi.
- Le contexte se garde dans le SVG écrit (`data-ed-*` sur la racine, absents en Générique) et revient à la
  réouverture. Les menus acceptent des éléments `menuitemradio`.
- `docs/cricut/protocole.md` et six SVG témoins pour figer sur une vraie machine les 19 valeurs encore
  « à vérifier » (zones utiles, détail minimal du papier cartonné, taille Print Then Cut, lecture des px nus).
- **Typographie en cinq tailles nommées** (`src/styles/typographie.ts`, `--texte-petit`, `-compact`, `-corps`,
  `-titre`, `-titre-page` : 12, 13, 14, 16 et 24 px) au lieu de dix-huit valeurs écrites en dur ; les textes les plus
  petits passent de 11 à 12 px, la taille de base suit le réglage du navigateur (rem au lieu de px), les titres
  coupent en lignes égales. Un test interdit toute taille écrite en dur, comme pour les couleurs.
- **Corrigé** : le bouton « Choisir les formes » d'un constat bloquant n'atteignait que 4,34:1 (cyan sur le fond
  d'échec) ; il prend l'encre du message (5,28:1). L'audit axe du panneau attend la fin des fondus avant de mesurer.
- `PRODUCT.md` et `DESIGN.md` (« le carnet d'atelier ») décrivent le produit et son système visuel pour les travaux
  de design ; la skill de design impeccable est rangée dans `.claude/skills/`.
- **Espacements, rayons et couches en jetons** (`src/styles/espaces.ts` : `--esp-*` sur une base de 4 avec un pas de
  6, `--rayon-*`, `--couche-*`) au lieu de valeurs écrites en dur ; les pas hors échelle (3, 5, 7, 9, 10, 14, 20,
  28 px) se ramènent au plus proche, le plus serré à égalité. Un test interdit tout espacement, rayon ou couche en dur.
- Les constats du panneau « Prêt pour Cricut » ont un filet tout autour au lieu d'une barre de couleur à gauche.
- **Corrigé** : dans l'inspecteur, les étiquettes « Rotation ° », « Échelle % », « Incl. X ° », « Incl. Y ° » et « Angles du
  décalage » passaient sur deux lignes (« Rotation » était rogné) : une étiquette courte tient sur une ligne, le champ cède
  la place. Les crédits précisent que les fontes de l'interface ne sont pas dans l'éditeur embarqué.
- **Bibliothèque : une recherche qui trouve ce qu'elle promet.** Elle porte aussi sur les noms d'événements et de
  catégories, sans accents, au singulier près, et sur des synonymes en données (« sapin » : 0 → 20 résultats,
  « anniversaire » : 0 → 97, « Noël » : 1 → 43) ; un classement par pertinence ; un état « aucun résultat » qui propose
  un événement, une faute de frappe corrigée ou d'effacer. Les 45 événements se choisissent par pastilles (ceux qui
  arrivent d'abord) ; un événement s'ouvre sur ses formes les plus représentatives ; les vignettes ont une hauteur
  régulière.
- **Convertir une image : l'essentiel au premier résultat.** Résultat, fond, mode, grain et « Ouvrir dans l'éditeur » ;
  réglages fins et prétraitement repliés, les autres vues, le zoom et le fond du plan dans « Plus de vues » ; les réglages
  en mots simples (« Ignorer les taches de moins de… », « Garder l'image telle quelle »), le nom technique en infobulle.
  Aucune sortie du traceur ne change. Un menu ouvert bas dans l'écran s'ouvre au-dessus de son bouton.
- **Finition du système** : couleur d'accent, texte d'exemple (5,70:1 au lieu de 3,89:1), texte sélectionné, curseur et
  barres de défilement aux jetons (`--selection`, `--filet-fort`, contrastes hors texte vérifiés) ; un message neutre
  (`role="status"`) pour les succès, l'ambre réservé aux avertissements ; seule l'action de l'instant est pleine (menu,
  confirmation, contexte de production) ; « aucune couleur » en barre oblique et filet cyan au lieu du rouge ; chiffres
  tabulaires ; chasse fixe en 400/500 seulement ; codes de couleur à l'encre, précédés de leur nom ; anneau de focus
  sur les liens ; paragraphes bornés à 34em.
- **Au doigt** : la rangée de sélection tient dans 390 px (menu « Plus »), les raccourcis des menus se masquent, les aides
  disent « Touchez », le nuancier et le curseur du tiroir font 40 px, les boutons « Corriger » restent visibles ; le menu
  « Plus » est rangé Édition, Fichier, Vue.
- Les calques se nomment par leur genre (« Cercle 2 ») ; une forme sans fond a une pastille à filet.
- **Corrigé** : « Abandonner la modification non enregistrée ? », « 2 tapis », « 3 petites formes » ; « 0 (zéro) »
  distinct de « O » ; le zoom dit qu'il ajuste la vue ; une vraie violation axe `label-content-name-mismatch` sur les
  noms des formes. L'audit axe Cricut juge chaque texte entier (son doute intermittent venait du défilement).
- **Une visite guidée de l'éditeur** (ADR-0019), en cinq étapes sur le vrai éditeur, jusqu'à la première retouche
  récupérée : choisir une forme, changer sa couleur, savoir revenir en arrière, récupérer le fichier, puis trois suites
  (convertir une image, la bibliothèque, la Cricut). Elle avance sur le geste réel, sans voile ; elle se passe, se quitte
  par Échap, s'atteint par F6 ou un lien d'évitement, se rejoue du nouveau menu **Aide** (en tête de « Plus » au
  téléphone) et se retient (`svg.guide`, stockage injecté). Elle ne s'ouvre que demandée : « Essayer avec la visite
  guidée » sur l'accueil, le menu Aide, ou l'option d'hôte `visite: true` de l'éditeur embarqué (prop `guide`).
- **Quatre repères de première rencontre** (modifier les points, premier assemblage de formes, contexte Cricut, première
  conversion), refermables et jamais répétés, et **des états vides qui disent quoi faire** partout (inspecteur, calques,
  toile, couleurs, versions, panier, lot, nuancier, bibliothèque, panneau Cricut).
- Sur téléphone, un tiroir ouvert masque le dessin qu'il recouvre ; l'aide de l'inspecteur dit « assembler des formes »
  au lieu de « booléens » ; la typographie française pose ses espaces insécables dans les bulles et les états vides.
- **Ouvrir un PDF depuis l'accueil** (ADR-0020), choisi ou déposé : ses tracés vectoriels et son texte deviennent des formes
  éditables ; la première page par défaut, une autre se choisit (« Page 1 sur N ») ; ce qui n'est pas repris (images,
  dégradés, découpes, couleurs approchées…) est dit à l'ouverture ; un PDF chiffré ou abîmé est refusé en le nommant.
  Lecture pure et bornée (corpus de 39 PDF hostiles, fuzzer), aller-retour vérifié sur chaque PDF que l'éditeur exporte.
- **Le texte d'un PDF ou d'un SVG s'importe en lettres**, une forme par lettre : une police TrueType ou OpenType embarquée
  est dessinée exactement ; une police absente est remplacée par la plus proche des neuf fontes, et c'est dit (« 3 textes
  en Arial, police remplacée par Inter ») ; le texte invisible (couche de reconnaissance de caractères) n'est jamais repris.

### Version majeure (texte importé)

- Un SVG qui contient du texte s'ouvre désormais en lettres quand la page a ses fontes (`polices.js`), au lieu d'être
  refusé. Deux références neuves (`texte-svg`, `texte-svg-blancs`) ; aucune référence existante ne change.
- **Récupérer son fichier** : « Télécharger le SVG » dans la barre de l'éditeur, « Autres formats » à côté (une ligne par
  format qui dit à quoi il sert) ; le format recommandé suit le contexte (SVG, Cricut, Print Then Cut). Le doublon
  « Copier le code SVG » est retiré. Parcours « changer une couleur puis récupérer le SVG » : 6 gestes → 4.
- **« Terminer »** : le bouton de fin de la page s'appelle « Terminer » ; la fiche du dessin a pour action primaire
  « Télécharger le SVG » (qui prend le focus), avec un message neutre. L'option d'hôte `libelleEnregistrer` (validée)
  donne le libellé chez un hôte. La confirmation d'abandon propose aussi le geste de fin.
- **Ctrl+S garde un brouillon et ne ferme jamais l'éditeur** (`onBrouillon` chez un hôte) ; il n'appelle plus
  `onEnregistrer` : un hôte qui comptait dessus passe par le bouton (docs/integration.md).
- **Fin du parcours Cricut** : « Exporter quand même (N points à corriger) » avec une confirmation dans le panneau ; carte
  « Dans Design Space » après l'export ; « Ajuster » cadre le tapis entier, « Ajuster au dessin » (D) ; millimètre par
  défaut, pouce retenu ; le sélecteur dit « Machine : … » et commence par la machine ; matériaux à venir sur une ligne.
- Le fichier d'une forme de la bibliothèque porte son nom français (`bonhomme-de-neige.svg`). Dans un menu à contenu libre,
  Tab circule au lieu de refermer le menu.
- **Convertir une image : le mode « Ligne médiane (stylo) »** (ADR-0021) change un dessin au trait (écriture, croquis
  scanné) en tracés ouverts d'une seule ligne au milieu du trait, sans remplissage, pour le stylo d'une Cricut. Calculé
  dans le moteur pur, sans vtracer, de façon déterministe (seuil d'Otsu, squelette de Guo-Hall, barbules élaguées,
  croisements traversés, coupures raccordées, cubiques ajustées). L'épaisseur du trait, mesurée sur l'image, se voit à côté
  du mode ; seuil, taches, barbules, coupures et couleur sont dans les réglages fins. Le lot fonctionne dans ce mode.
- Tests de sécurité : un dépassement du budget de temps se remesure une fois avant d'échouer (une machine chargée ne fait
  plus échouer un fichier ordinaire ; une lenteur qui se répète reste un défaut).
- **Corrigé** : « Lecture du texte… » s'annonçait comme une alerte pendant le chargement des polices (un test de sécurité
  prenait ce message pour un refus, selon la vitesse de chargement) : c'est un message neutre. Le corpus hostile distingue
  l'issue de la lecture pure et celle de la page, qui ouvre en lettres un fichier portant du texte (`attenduPage`).
