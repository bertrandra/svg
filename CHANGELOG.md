# Journal des modifications

Toutes les modifications notables de `svg`. Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
versions SemVer : un SVG réécrit différemment pour une entrée inchangée est une version majeure.

## [Non publié]

### Modifié

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

### Constaté, non corrigé (changerait des octets écrits : version majeure)

- `stroke-width="0"` est écrit `1` ; l'alpha de `rgba()` est perdu à la lecture ; un nom de couleur hors
  des douze connus est copié tel quel ; le crénage est nul pour cinq des neuf fontes
  embarquées. Ces limites sont figées dans `tests/fixtures/svg/limites-connues.svg`.

### Corrigé

- La liste « Par couleur » ne défile plus en largeur dans le panneau étroit.
- Un menu déroulant ne se ferme plus quand un défilement ne déplace pas son bouton.

### Ajouté

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
