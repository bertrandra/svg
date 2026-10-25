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
