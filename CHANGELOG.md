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

### Modifié

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
