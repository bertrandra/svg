---
name: Éditeur SVG
description: Un carnet d'atelier pour préparer des formes vectorielles, de l'image au fichier prêt pour la machine.
colors:
  cyan-encre: "#00719c"
  sur-cyan: "#ffffff"
  table-atelier: "#e9ecef"
  feuille-panneau: "#f7f8f9"
  encre: "#15181d"
  encre-douce: "#555c66"
  filet: "#cfd4da"
  filet-fort: "#7d848d"
  selection: "#c6dde6"
  alerte: "#8a5a00"
  alerte-fond: "#f8ecd2"
  echec: "#a8322a"
  echec-fond: "#f7e0dd"
  toile-blanc: "#ffffff"
  toile-sombre: "#1b1d20"
typography:
  display:
    fontFamily: "Instrument Sans, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Instrument Sans, Helvetica Neue, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
  body:
    fontFamily: "Instrument Sans, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Instrument Sans, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
  compact:
    fontFamily: "Instrument Sans, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
  aide:
    fontFamily: "Instrument Sans, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
  mesure:
    fontFamily: "IBM Plex Mono, ui-monospace, Menlo, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
rounded:
  champ: "5px"
  bouton: "6px"
  menu: "8px"
  carte: "10px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
components:
  button-primary:
    backgroundColor: "{colors.cyan-encre}"
    textColor: "{colors.sur-cyan}"
    typography: "{typography.label}"
    rounded: "{rounded.bouton}"
    padding: "7px 12px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.encre}"
    typography: "{typography.label}"
    rounded: "{rounded.bouton}"
    padding: "7px 12px"
  button-discret:
    backgroundColor: "transparent"
    textColor: "{colors.cyan-encre}"
    typography: "{typography.label}"
    rounded: "{rounded.bouton}"
    padding: "7px 12px"
  outil-barre:
    backgroundColor: "transparent"
    textColor: "{colors.encre}"
    rounded: "{rounded.bouton}"
    size: "30px"
  outil-barre-actif:
    backgroundColor: "{colors.cyan-encre}"
    textColor: "{colors.sur-cyan}"
    rounded: "{rounded.bouton}"
    size: "30px"
  champ-texte:
    backgroundColor: "{colors.table-atelier}"
    textColor: "{colors.encre}"
    rounded: "{rounded.champ}"
    padding: "6px 8px"
  element-menu:
    backgroundColor: "transparent"
    textColor: "{colors.encre}"
    rounded: "{rounded.champ}"
    padding: "6px 8px"
  carte-voie:
    backgroundColor: "{colors.feuille-panneau}"
    textColor: "{colors.encre}"
    rounded: "{rounded.carte}"
    padding: "16px"
  pastille-evenement:
    backgroundColor: "{colors.table-atelier}"
    textColor: "{colors.encre}"
    typography: "{typography.compact}"
    rounded: "{rounded.bouton}"
    padding: "4px 8px"
  pastille-evenement-choisie:
    backgroundColor: "{colors.cyan-encre}"
    textColor: "{colors.sur-cyan}"
    typography: "{typography.compact}"
    rounded: "{rounded.bouton}"
    padding: "4px 8px"
  message-alerte:
    backgroundColor: "{colors.alerte-fond}"
    textColor: "{colors.alerte}"
    rounded: "{rounded.bouton}"
    padding: "10px 12px"
  message-neutre:
    backgroundColor: "{colors.feuille-panneau}"
    textColor: "{colors.encre}"
    rounded: "{rounded.bouton}"
    padding: "10px 12px"
  bulle-visite:
    backgroundColor: "{colors.feuille-panneau}"
    textColor: "{colors.encre}"
    typography: "{typography.body}"
    rounded: "{rounded.menu}"
    padding: "12px 16px"
  repere:
    backgroundColor: "{colors.feuille-panneau}"
    textColor: "{colors.encre}"
    typography: "{typography.compact}"
    rounded: "{rounded.bouton}"
    padding: "12px 16px"
  etat-vide:
    backgroundColor: "transparent"
    textColor: "{colors.encre-douce}"
    typography: "{typography.aide}"
    padding: "4px 0 8px"
  apercu-forme-ligne:
    backgroundColor: "{colors.table-atelier}"
    textColor: "{colors.encre}"
    typography: "{typography.aide}"
    rounded: "{rounded.bouton}"
    padding: "8px"
  saisie-texte:
    backgroundColor: "{colors.feuille-panneau}"
    textColor: "{colors.encre}"
    typography: "{typography.body}"
    rounded: "{rounded.menu}"
    padding: "6px"
  ligne-format:
    backgroundColor: "transparent"
    textColor: "{colors.encre-douce}"
    typography: "{typography.aide}"
    padding: "0"
  confirmation-export:
    backgroundColor: "{colors.alerte-fond}"
    textColor: "{colors.alerte}"
    typography: "{typography.compact}"
    rounded: "{rounded.bouton}"
    padding: "12px"
  carte-design-space:
    backgroundColor: "{colors.feuille-panneau}"
    textColor: "{colors.encre}"
    typography: "{typography.compact}"
    rounded: "{rounded.bouton}"
    padding: "12px 16px"
---

# Design System: Éditeur SVG

## Overview

**Creative North Star: "Le carnet d'atelier"**

L'éditeur est un atelier de fabrication, pas une vitrine. Une table grise sur laquelle se posent des feuilles
claires (barres, panneaux, menus), des repères et des gabarits (le tapis Cricut, la grille au ¼ po, la zone
utile en pointillés), des mesures et des codes en chasse fixe, et une seule encre de couleur pour ce qu'on
touche. Le dessin de la personne est la seule chose qui ait le droit d'être vivante et colorée ; tout le reste
est l'outil qui le prépare.

La densité est celle d'un outil de production : beaucoup de commandes à portée, chacune à sa place, rangée
plutôt qu'exposée (une action primaire par panneau, le rare dans les menus). Le caractère des composants est
**retenu au repos, franc à l'interaction** : filets fins et encre tant qu'on ne touche à rien ; dès le geste,
une réponse nette (enfoncement d'un pixel, contour de focus plein, couleur d'outil qui s'allume).

Le système est tenu par des règles vérifiées, pas par le goût : chaque couleur est un jeton
(`src/styles/jetons.ts`), chaque texte tient 4,5:1 sur son fond dans les deux thèmes, chaque cible fait 24 px à
la souris et 40 px au doigt, et le contraste forcé est respecté.

**Key Characteristics:**
- Une table et des feuilles : deux fonds, deux encres, un filet ; aucune autre couleur d'interface.
- Une seule couleur d'outil, le cyan d'encre, pour l'action, l'état actif, le focus et les liens.
- Plat par défaut : l'ombre n'existe que pour ce qui flotte au-dessus du travail (menus, tiroirs).
- Les mesures, codes et noms de fichier en chasse fixe, comme les annotations d'un carnet.
- Thème clair et sombre symétriques, contraste forcé tenu.

## Colors

Une palette d'atelier : des gris de table et de papier, deux encres, et un seul pigment, le cyan d'encre.

### Primary
- **Cyan d'encre** (#00719c ; #4fb3dc en sombre) : la seule couleur d'outil. Action primaire pleine (une par
  panneau), outil actif de la barre, onglet choisi, contour de focus, liens et boutons discrets. Ses teintes
  translucides (6 à 35 %) marquent le survol, la sélection, la ligne choisie et la grille magnétique ; elles se
  calculent par `color-mix()`, avec un repli déjà calculé (`--repli-cyan-*`) pour les navigateurs anciens.
- **Blanc sur cyan** (#ffffff ; #08202b en sombre) : le libellé posé sur la couleur d'outil.

### Neutral
- **Table d'atelier** (#e9ecef ; #121518 en sombre) : le fond de la page et le champ de travail autour du plan.
- **Feuille de panneau** (#f7f8f9 ; #1a1e22 en sombre) : ce qui se pose sur la table, barres, panneaux, cartes,
  menus ; aussi le fond des champs posés sur une feuille, inversé (un champ prend la couleur de la table).
- **Encre** (#15181d ; #e6e9ec en sombre) : le texte courant et les icônes.
- **Encre douce** (#555c66 ; #9aa3ad en sombre) : aides, légendes, libellés de champ, barre d'état.
- **Filet** (#cfd4da ; #2f353c en sombre) : bordures et séparations ; décoratif, il ne porte jamais seul une
  information.
- **Filet fort** (#7d848d ; #69717b en sombre) : le bord qui doit se voir, 3:1 sur la table et sur un panneau
  (`PAIRES_GRAPHIQUES`, WCAG 1.4.11) : le tour des pastilles de couleur (une pastille d'encre ne disparaît plus sur un
  panneau sombre), la pastille vide d'une forme sans fond, la poignée des barres de défilement.
- **Sélection** (#c6dde6 ; #2a4b5a en sombre) : le fond du texte choisi, la couleur d'outil adoucie sous l'encre (12,6:1
  et 7,7:1).

### Tertiary
- **Ambre d'alerte** (#8a5a00 sur #f8ecd2) : un avertissement, une partie trop fine sur la toile, un constat
  « à corriger ».
- **Rouge d'échec** (#a8322a sur #f7e0dd) : un échec, un geste destructif, un constat bloquant, une forme qui
  déborde du tapis.

### Named Rules
**La règle de l'encre unique.** Le cyan d'encre est la seule couleur d'interface qui ne soit ni grise ni un
message. Une seule action pleine par panneau ; si deux boutons cyan se voient côte à côte, l'un des deux a tort.
Seule l'action de l'instant est pleine : un menu ou une confirmation ouverts portent la seule qu'on voie (dans une
confirmation, l'action sûre), et les autres se posent en secondaires tant qu'ils restent ouverts (classes `menu-ouvert`
et `confirmation-ouverte` du cadre, sans rien changer à ce que font les boutons) ; en contexte de production, l'export
du panneau est l'action du moment, le geste de fin de la barre (« Terminer » ou « Enregistrer ») se pose en secondaire. Un test de navigateur compte les
actions pleines visibles (`tests/e2e/finition.e2e.ts`). Le cyan ne marque pas non plus un code ou un état « aucun » qui
n'est pas une action : un code de couleur s'écrit à l'encre.

**La règle du dessin roi.** Aucune couleur d'interface ne se pose sur le dessin ni ne le concurrence : le plan
de travail est blanc, sombre ou en damier, et les repères (tapis, grille, zone utile) restent en filets.

**La règle du jeton.** Aucune couleur écrite en dur dans la page ou les composants : un rôle nouveau devient un
jeton de `src/styles/jetons.ts`, avec sa valeur claire, sa valeur sombre et sa paire de contraste.

## Typography

**Display Font:** Instrument Sans (avec Helvetica Neue, Arial, sans-serif)
**Body Font:** Instrument Sans
**Label/Mono Font:** IBM Plex Mono (avec ui-monospace, Menlo, monospace)

**Character:** une grotesque nette et sans affectation pour tout ce qui se lit, et une chasse fixe pour ce qui se
mesure (codes couleur, niveau de zoom, tailles, noms de fichier), comme les annotations au crayon d'un carnet.
Les deux fontes sont embarquées dans la page : aucune requête à l'ouverture.

### Hierarchy
Cinq tailles seulement, chacune un jeton (`src/styles/typographie.ts`, `--texte-*`) ; un test interdit toute
taille écrite en dur dans la page ou les composants.
- **Display** (700, 1,5 rem soit 24 px, approche −0,01 em ; `--texte-titre-page`) : le titre de l'accueil, seul de
  son rang.
- **Title** (600, 1 rem soit 16 px ; `--texte-titre`) : titres de voie, de carte et de boîte.
- **Body** (400, 0,875 rem soit 14 px, interligne 1,45 ; `--texte-corps`) : le texte courant ; les boutons et les
  champs à la même taille, la graisse 600 fait le libellé.
- **Compact** (400 à 600, 0,8125 rem soit 13 px ; `--texte-compact`) : menus, onglets, titres de section, boutons
  de la barre et des panneaux.
- **Aide** (400, 0,75 rem soit 12 px, encre douce ; `--texte-petit`) : aides, légendes, raccourcis, barre d'état.
- **Mesure** (IBM Plex Mono, à la taille Aide ou Compact) : codes `#1428A0`, zoom, tailles, code SVG collé.

Les titres et sommaires coupent en lignes égales (`text-wrap: balance`), le texte évite un mot seul en dernière
ligne (`text-wrap: pretty`). Un paragraphe de l'accueil (chapeau, pied, présentation d'une voie) ne dépasse pas
**34 em**, environ 72 caractères : la mesure est en em, parce que le `ch` est la chasse du zéro, large dans Instrument
Sans, et que 68 ch y laissaient encore 96 caractères.

**Chiffres tabulaires.** Ce qui compte ou mesure et change sous les yeux (« 4 modifications », le niveau de zoom, « 1
sélectionnée », la valeur d'un curseur, les compteurs des sections, des calques et de la bibliothèque, les champs
chiffrés) porte `font-variant-numeric: tabular-nums` (Instrument Sans a la fonction `tnum`) ; la valeur d'un curseur a
de plus une largeur fixe, alignée à droite : « 100 % » qui devient « 7 % » ne déplace plus rien.

**La chasse fixe en 400 et 500.** Seules ces deux graisses d'IBM Plex Mono sont embarquées : toute règle qui pose la
chasse fixe dit l'une des deux (un test le vérifie dans les feuilles), sans quoi un bouton (600) la grossissait d'un gras
artificiel. Le sous-ensemble embarqué n'a pas de zéro barré : un raccourci « 0 » qui côtoie « O » s'écrit « 0 (zéro) ».

### Named Rules
**La règle de la chasse fixe.** Ce qui se mesure ou se copie s'écrit en IBM Plex Mono ; ce qui se lit, jamais. Un
texte d'exemple fait de mots (« aucun », « celle du dessin ») est en grotesque même dans un champ chiffré ; une couleur
du nuancier se dit par son nom en grotesque avant son code en chasse fixe (« Rouge #C81E28 · 1 »).

**La règle des cinq tailles.** Une taille de texte est un jeton : on choisit un rôle, jamais une valeur. Une sixième
taille se décide dans le registre, avec sa raison.

## Layout

L'éditeur est une grille d'application plein écran : une barre en haut (outils, couleurs, historique, zoom,
menus Vue, Édition, Aide, la machine, puis le groupe du fichier : « Télécharger le SVG » et son chevron « Autres formats »,
le menu Fichier, le geste de fin), les calques à gauche, la toile au centre
sur la table, l'inspecteur à droite (sections repliables), une barre d'état en bas qui dit l'aide du moment et le
nombre de modifications. L'accueil est une colonne centrée de trois voies côte à côte (Ouvrir, Convertir,
Bibliothèque), une seule visible à la fois.

Le rythme est serré, sur une base de 4 avec un pas de 6 : 2, 4, 6, 8, 12, 16, 24 et 48 px, chacun un jeton
(`src/styles/espaces.ts`, `--esp-*`), comme les rayons (`--rayon-*`) et les couches d'empilement (`--couche-*`) ; un
test interdit un espacement, un rayon ou une couche écrits en dur. 4 px dans la barre, 6 px dans les listes,
12 px entre cartes, 16 px à l'intérieur d'une carte.

- **Au-dessous de 1 440 px** : les groupes et les menus de la barre se resserrent ; vers 1 280 px, le groupe du fichier passe
  à la ligne, entier et rangé à droite, plutôt que de couper un geste de son menu.
- **Au-dessous de 900 px ou au doigt** : les panneaux deviennent des tiroirs sur voile, les cibles passent à
  40 px (44 px dans les menus).
- **Au-dessous de 640 px** : la barre tient sans défiler : outils et un menu « Plus » (Aide en tête, puis Édition, Fichier, Vue avec
  le zoom en dernier, puis la machine : l'ordre de l'usage ; la rubrique Fichier commence par « Télécharger le SVG » et finit
  par « Autres formats », replié) ; le geste de fin passe dans la barre d'état ; les voies de
  l'accueil s'empilent ; un tiroir ouvert masque le dessin qu'il recouvre (le voile reçoit les touchers).
- **Au doigt jusqu'à 1 200 px, et sous 640 px** : la rangée de la sélection se resserre : le compte, trois gestes
  fréquents (dupliquer, miroir horizontal, tourner à droite), son menu « Plus » rubrique par rubrique (transformer,
  aligner, empiler, booléens, formes), et « Supprimer » au bout ; rien n'est retiré, elle tient dans 390 px. À la souris
  dans une fenêtre étroite, elle garde ses gestes sur une ligne qui défile, avec un dégradé au bord.
- **Au doigt** (`pointer: coarse`) : les raccourcis clavier des menus se retirent ; les aides disent « Touchez »
  là où la souris dit « Cliquez » (`selonSaisie`, `util/texte.ts`) ; un bouton qui n'apparaît qu'au survol reste visible
  (`hover: none`).

### Named Rules
**La règle de l'établi rangé.** La barre garde l'outil fréquent ; le reste vit dans un menu avec son raccourci.
Une commande ne s'expose pas parce qu'elle existe.

## Elevation & Depth

Plat par défaut : la profondeur vient du ton (la feuille claire posée sur la table grise) et du filet, jamais
d'une ombre au repos. L'ombre n'existe que pour ce qui flotte au-dessus du travail et le recouvre un instant.

### Shadow Vocabulary
- **Menu flottant** (`box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2)`) : menus déroulants, boîte de crédits.
- **Tiroir** (ombre `rgba(0, 0, 0, 0.25)` et voile `rgba(0, 0, 0, 0.35)` sur la toile) : panneaux en tiroir sur
  tablette et téléphone.

### Named Rules
**La règle de la feuille posée.** Une surface au repos est plate ; seule une surface qui recouvre le travail a
une ombre.

**La règle du guide discret.** Ce qui guide (la bulle, un repère, un état vide) ne porte jamais d'action pleine et ne
cache jamais le dessin : le seul geste qui compte est celui que la personne fait dans l'éditeur.

## Shapes

Des coins doucement arrondis, croissant avec la taille de la surface : champ (5 px), bouton (6 px), menu
(8 px), carte et zone de dépôt (10 px). Les bords sont des filets de 1 px ; la zone de dépôt est en tirets
(2 px), comme un gabarit à remplir. Les pastilles de couleur sont carrées à 4 px, bordées du filet fort ; une forme
sans fond a une pastille vide à filet dans les calques. Le bouton « aucun » d'une couleur est un rond (un carré de
40 px au doigt) marqué d'une barre oblique : au repos, filet et encre douce ; choisi, un filet double et la barre en cyan
d'encre, **jamais** le rouge d'échec, qui ne sert qu'aux messages et aux gestes destructifs ; en contraste forcé,
`Highlight`. Le focus est un contour plein de 2 px en cyan d'encre, décalé de 2 px, sur les boutons, les champs, les
sommaires **et les liens**.

## Components

### Buttons
Retenus au repos, francs à l'interaction.
- **Shape:** coins doucement arrondis (6 px), filet de 1 px.
- **Primary:** fond cyan d'encre, libellé blanc, 7 px × 12 px, une seule par panneau ; survol : cyan assombri de
  14 %.
- **Secondary (par défaut):** fond transparent, filet, encre ; survol : filet et texte passent au cyan.
- **Discret:** sans filet, texte cyan ; survol : voile cyan à 10 %. Sert de lien d'action.
- **Hover / Focus:** enfoncement d'un pixel à l'appui ; contour de focus cyan de 2 px ; transitions de 0,12 s,
  supprimées par `prefers-reduced-motion`.
- **Inactif:** opacité 45 % ; un bouton qui doit dire pourquoi reste focalisable (`aria-disabled`) et donne sa
  raison (`BoutonRaison`).

### Outils de la barre
- **Style:** boutons d'icône carrés de 30 px, transparents ; survol : voile cyan à 12 % ; outil actif : plein cyan
  d'encre, icône blanche ; menu ouvert : voile à 14 %.

### Inputs / Fields
- **Style:** fond de table sur une feuille (le champ « creuse » le panneau), filet, coins de 5 px, 6 × 8 px.
- **Focus:** contour cyan plein de 2 px.
- **Sélecteurs de couleur:** pastilles carrées à filet ; la couleur courante est dite aux lecteurs d'écran.

### Menus
- **Style:** feuille de panneau, filet, coins de 8 px, ombre de menu flottant ; éléments à 6 × 8 px, raccourci
  aligné à droite ; rubriques titrées ; choix exclusifs en `menuitemradio` avec coche.

### Cards / Containers
- **Carte de voie (accueil):** feuille de panneau, filet, coins de 10 px, 16 px ; voie choisie : filet cyan doublé
  et voile cyan à 7 %.
- **Sections de l'inspecteur:** repliables (`details`), contenu dense, mémoire d'ouverture.
- **Messages:** coins de 6 px, 10 × 12 px. Un avertissement ou un échec : fond et texte d'alerte ou d'échec,
  `role="alert"`. Un succès ou une information (« Dessin prêt… », le résultat d'un export) : **message neutre**,
  l'encre sur une feuille de panneau, un filet, `role="status"` (`commun/Message.tsx`) ; l'ambre n'annonce plus un
  succès.
- **Calques:** une ligne nomme la forme par son genre (« Cercle 2 », « Triangle 3 », « Tracé courbe 1 ») tant que le
  modèle n'a pas de nom propre ; le nom accessible reste « Forme 3, triangle, fond… ». Rien ne s'écrit dans le SVG.

### Pastilles d'événements (bibliothèque)
Le filtre de la bibliothèque, à la place d'une liste déroulante de 45 lignes.
- **Style:** boutons à état (`aria-pressed`) au fond de table, filet, coins de 6 px, texte compact ; la pastille choisie
  est pleine en cyan d'encre, comme un onglet choisi (un état, pas une action : la règle de l'encre unique tient).
- **Repliées:** « Tous », puis les six événements du calendrier qui arrivent (le mois est lu par la zone et passé au
  cœur pur) ; l'événement choisi reste visible même loin dans l'année ; « Plus d'événements (45) », bouton discret
  `aria-expanded`, déplie les trois familles titrées (Calendrier, Événements de la vie, Catégories).
- **Clavier:** un groupe nommé « Événement » ; Tab passe par chaque pastille, les flèches vont de l'une à l'autre,
  Début et Fin aux bouts.
- **Téléphone:** sous 640 px, les pastilles repliées tiennent sur une seule ligne qui défile ; 40 px au doigt.

### Vignettes et état vide (bibliothèque)
- **Vignette:** une hauteur régulière ; le libellé tient sur deux lignes au plus, coupé proprement ; le nom complet reste
  le nom accessible et l'infobulle.
- **Aucun résultat:** une phrase qui dit ce qui ne correspond pas, des propositions qui trouvent chacune quelque chose
  (« Essayez l'événement Noël (43) », une faute de frappe corrigée, la même recherche dans tous les événements), en
  boutons discrets, puis « Effacer la recherche » ; le focus revient au champ.

### Atelier de conversion (divulgation progressive)
Au premier résultat, seul l'essentiel se voit : le résultat et son résumé (dit une fois), le fond, le mode et le grain,
une action primaire « Ouvrir dans l'éditeur ». Deux vues en mini-onglets (Comparer, Contours) ; les autres vues, le zoom
et le fond du plan dans le menu « Plus de vues », dont le bouton prend le nom d'une vue cachée choisie. Réglages fins et
prétraitement en sections repliées (mémoire d'ouverture) ; chaque réglage se nomme par son effet en mots simples,
l'infobulle garde le nom technique de vtracer. « Rejouer » n'apparaît que s'il sert (pas encore de résultat, ou rejeu
automatique coupé). En mode « Ligne médiane » (ADR-0021), le groupe « Tracé » montre en plus le curseur « Épaisseur du
trait » (la valeur mesurée sur l'image, au style des réglages fins) et une aide d'une ligne pour le stylo d'une Cricut ;
seuil, taches, barbules, coupures et couleur vont dans les réglages fins repliés ; le résumé dit « N tracés · une ligne au
milieu du trait ». Rien de nouveau dans le système : mêmes curseurs, mêmes jetons, toujours une seule action pleine.

### Bulle de la visite guidée (ADR-0019)
Une feuille de panneau qui flotte : filet, coins de 8 px, ombre de menu flottant, 340 px au plus (la largeur de l'écran
moins 16 px sur un téléphone). Dans l'ordre : la progression (« Étape 2 sur 5 », Aide, encre douce), le titre (Title),
une ou deux phrases (Body), puis « Passer la visite » (discret, à gauche), « Précédent » et « Suivant » (secondaires,
à droite). **Aucune action pleine** : l'action de l'étape est le vrai geste dans l'éditeur, pas un bouton de la bulle.
La fin remplace la ligne par trois suites (secondaires, pleine largeur) et « Terminer la visite » (la barre de la page a son
propre « Terminer », qui ferme l'éditeur : deux noms pour deux gestes).
- **Où :** toujours sur la toile, jamais sur la barre, la rangée de la sélection ou un panneau ; en haut sous une cible de
  la barre, en bas pour la toile ou la barre d'état ; la vue se recadre pour que le dessin tienne à côté. Une flèche
  (un carré tourné, même feuille, même filet) pointe la cible quand elle est au-dessus ou au-dessous.
- **La cible :** un filet cyan de 2 px autour (rayon du bouton ; rayon de pastille, en dedans, autour de la toile), qui
  laisse passer les clics. C'est le seul repère visuel : pas de voile, rien d'assombri.
- **Mouvement :** l'apparition partagée (fondu et 4 px), 0,18 s, éteinte par `prefers-reduced-motion`.

### Repères de première rencontre
Une note posée dans le flux du panneau, là où l'on bloque : filet cyan de 1 px, coins de 6 px, voile cyan à 8 % sur la
feuille (celui du bandeau de reprise), 12 × 16 px ; un titre (Compact 600), une phrase (Compact), « Compris » (discret,
sans marge). Elle ne flotte pas, ne recouvre rien, ne parle pas, et ne revient jamais une fois refermée.

### États vides
Retenus : un titre court (Compact 600, encre), une phrase (Aide, encre douce), au plus une icône déjà dessinée (20 px,
encre douce) et un bouton discret qui commence. Pas de cadre, pas d'illustration : un état vide est un mode d'emploi.
Le texte dit le genre : la première fois (à quoi sert la zone), vidé (le retour est à un geste), aucun résultat (quoi
changer). Sur la toile vide, la phrase est une étiquette de feuille (filet, coins de 8 px) centrée en haut, que les clics
traversent.

### Récupérer le fichier (la fin du parcours)
- **Le geste du moment, seul et nommé** : « Télécharger le SVG » (secondaire, icône de téléchargement) ouvre le groupe du
  fichier ; en contexte Cricut il devient « Exporter pour Cricut » (ou « Exporter pour Print Then Cut »). Un chevron accolé,
  nommé « Autres formats », ouvre la liste des formats, comme celui de l'outil des formes.
- **Les autres formats** : une ligne par format, en deux colonnes alignées : le bouton (et son réglage : largeur du PNG,
  couleur de découpe), puis à quoi il sert, en Aide à l'encre douce (« PNG : une image pour un site ou un message »), qui est
  aussi sa description pour un lecteur d'écran. Puis « Options d'export », replié. Aucune action pleine : ce sont des choix.
- **Le geste de fin** porte le libellé que la page ou l'hôte donne : « Terminer » dans la page (une coche ; il ramène à la
  fiche, même sans modification), « Enregistrer » par défaut (une disquette ; grisé tant que rien n'a changé). `Ctrl+S` garde
  un brouillon, il ne ferme jamais.
- **La fiche du dessin**, après « Terminer » : « Télécharger le SVG » est la seule action pleine et prend le focus,
  « Reprendre l'édition » secondaire, « Autres formats » en menu, « Fermer » discret ; au-dessus, un message neutre.

### Panneau « Prêt pour Cricut » (signature)
Le carnet d'atelier le plus littéral : un profil en une ligne d'aide, la taille finale et les couches comme des
mesures (en millimètres par défaut, le pouce au choix et retenu), puis les constats classés Bloquant (rouge d'échec),
À corriger (ambre d'alerte), Conseil (encre douce), chacun avec ses boutons secondaires de correction ; une seule action
primaire, « Exporter pour Cricut », qui dit « Exporter quand même (2 points à corriger) » tant qu'un point reste.
- **La confirmation** : un message ambre dans le panneau (pas une fenêtre), qui liste les points ; « Revoir », l'action sûre,
  est la seule pleine et prend le focus, « Exporter quand même » secondaire. Un conseil ne demande rien.
- **La carte « Dans Design Space »**, après l'export : une note dans le flux, filet et voile cyan comme un repère, une liste
  numérotée d'étapes ; ce qui n'est pas vérifié sur une machine reste marqué « (à vérifier) » en italique ; « Fermer ces
  étapes » (discret).
- **Le sélecteur de machine** de la barre dit ce qu'il fait, avec une icône de machine : « Machine : Générique », « Cricut
  Maker · 12 × 12 » ; son menu commence par la machine ; les matériaux annoncés tiennent sur une ligne inactive (« Bientôt :
  vinyle, thermocollant, feutre »). Au choix d'une Cricut, et par « Ajuster » (0), la vue cadre le tapis entier ;
  « Ajuster au dessin » (D) garde l'ancien cadrage. Le procédé « Dessin au stylo » s'y choisit comme les autres (le bouton
  dit alors « · Stylo »), les outils à venir sur une ligne inactive (« Bientôt : gravure, dorure (foil) ») ; le panneau
  devient « Prêt pour le stylo », ses couches des stylos (une couleur, un stylo), son action « Exporter pour le stylo ». Un
  constat qui propose plusieurs corrections les aligne en boutons secondaires, la conseillée d'abord.

### Texte vivant (ADR-0022)
Un texte se retape là où il est, et se règle comme un formulaire.
- **La saisie en place** : une feuille de panneau posée sur la toile, juste sous le texte (filet, coins de 8 px, ombre de menu
  flottant : elle recouvre un instant le travail), un vrai champ de texte nommé et une ligne d'aide (Aide, encre douce :
  « Entrée valide · Maj+Entrée : à la ligne · Échap annule »). Le curseur se pose à la fin ; le texte se recompose sous les
  yeux ; la couche `--couche-saisie` la tient au-dessus du dessin, sous les tiroirs.
- **La section « Texte »** de l'inspecteur, en tête quand un texte est choisi : le champ, le choix de police, « Gras » si la
  famille en a un, trois champs chiffrés, l'alignement en trois boutons à état (un état, pas une action : filet et texte cyan
  quand il est choisi, jamais plein), puis « Vectoriser le texte » dans un groupe à filet : trois radios et un bouton
  **secondaire** (une action rare et destructrice ne prend pas l'encre unique).
- **L'aperçu « forme / ligne »** (composant `ChoixPolice`, partout où l'on choisit une police) : un bouton discret
  `aria-expanded`, souligné au survol plutôt que voilé (le cyan d'encre tomberait à 4,45:1 sous le voile à 10 %), qui ouvre
  **au clic seulement**, dans le flux et refermable, une feuille de table (filet, coins de 6 px) portant deux rendus côte à
  côte : « Forme (découpe) » et « Ligne (stylo) ». Chaque rendu est le texte composé par le moteur, posé sur le plan blanc
  (`--toile-blanc`, filet, coins de 4 px), à l'encre `--encre-toile` (sombre dans les deux thèmes : on regarde du papier),
  plein ou en trait fin de 1,5 px qui ne grossit pas avec la vue ; dessous, son titre (Compact 600) et un verdict court et
  neutre (Aide), qui est aussi son texte alternatif. Rien n'y est obligatoire ni bloquant ; « Fermer l'aperçu » (discret).

## Surfaces du navigateur

Ce que le navigateur dessine seul porte aussi le système (`base.css`), dans les deux thèmes :
- **Couleur d'accent** : `accent-color: var(--cyan)` posé une fois sur la racine, hérité par les curseurs, cases,
  radios et barres de progression, au bureau comme au doigt.
- **Texte d'exemple** (`::placeholder`) : l'encre douce, opacité 1 (Firefox l'estompait), 4,5:1 sur le fond d'un champ
  (la table) comme sur un panneau ; le gris du navigateur tenait 3,9:1.
- **Texte choisi** (`::selection`) : le jeton `--selection` sous l'encre ; **curseur de saisie** (`caret-color`) en cyan.
- **Barres de défilement** (`scrollbar-color`) : le filet fort sur un rail transparent ; Safari, qui ne le connaît pas,
  garde les siennes.
- **Liens** : cyan, soulignement détaché (`text-underline-offset: 0.2em`), anneau de focus cyan de 2 px comme les boutons.

## Do's and Don'ts

### Do:
- **Do** poser chaque couleur d'interface comme un jeton de `src/styles/jetons.ts`, avec ses valeurs claire et
  sombre et sa paire de contraste 4,5:1.
- **Do** garder une seule action pleine en cyan d'encre par panneau ; tout autre bouton est secondaire ou discret.
- **Do** écrire mesures, codes couleur et noms de fichier en IBM Plex Mono.
- **Do** donner 24 × 24 px à toute cible à la souris et 40 px au doigt (pastilles du nuancier et curseurs compris).
- **Do** écrire en chiffres tabulaires ce qui compte et change, et dire la graisse (400 ou 500) de la chasse fixe.
- **Do** dessiner les repères de fabrication (tapis, grille, zone utile) en filets et pointillés, sous le dessin.

### Don't:
- **Don't** écrire une couleur en dur dans la page ou un composant (un test l'interdit).
- **Don't** poser une ombre sur une surface au repos.
- **Don't** introduire une seconde couleur d'accent ; les messages (ambre, rouge) ne servent qu'aux messages.
- **Don't** laisser un bouton inactif sans raison lisible.
- **Don't** désactiver une règle d'audit axe-core ou un comportement `prefers-reduced-motion`.
- **Don't** poser un voile pour guider, ni une bulle sur ce qu'elle demande de toucher ; un repère est une note dans le
  flux, pas une seconde bulle.
