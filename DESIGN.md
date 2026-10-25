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
  message-alerte:
    backgroundColor: "{colors.alerte-fond}"
    textColor: "{colors.alerte}"
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

### Tertiary
- **Ambre d'alerte** (#8a5a00 sur #f8ecd2) : un avertissement, une partie trop fine sur la toile, un constat
  « à corriger ».
- **Rouge d'échec** (#a8322a sur #f7e0dd) : un échec, un geste destructif, un constat bloquant, une forme qui
  déborde du tapis.

### Named Rules
**La règle de l'encre unique.** Le cyan d'encre est la seule couleur d'interface qui ne soit ni grise ni un
message. Une seule action pleine par panneau ; si deux boutons cyan se voient côte à côte, l'un des deux a tort.

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
ligne (`text-wrap: pretty`).

### Named Rules
**La règle de la chasse fixe.** Ce qui se mesure ou se copie s'écrit en IBM Plex Mono ; ce qui se lit, jamais.

**La règle des cinq tailles.** Une taille de texte est un jeton : on choisit un rôle, jamais une valeur. Une sixième
taille se décide dans le registre, avec sa raison.

## Layout

L'éditeur est une grille d'application plein écran : une barre en haut (outils, couleurs, historique, zoom,
menus Vue, Édition, Aide, Fichier et contexte de production, « Enregistrer »), les calques à gauche, la toile au centre
sur la table, l'inspecteur à droite (sections repliables), une barre d'état en bas qui dit l'aide du moment et le
nombre de modifications. L'accueil est une colonne centrée de trois voies côte à côte (Ouvrir, Convertir,
Bibliothèque), une seule visible à la fois.

Le rythme est serré, sur une base de 4 avec un pas de 6 : 2, 4, 6, 8, 12, 16, 24 et 48 px, chacun un jeton
(`src/styles/espaces.ts`, `--esp-*`), comme les rayons (`--rayon-*`) et les couches d'empilement (`--couche-*`) ; un
test interdit un espacement, un rayon ou une couche écrits en dur. 4 px dans la barre, 6 px dans les listes,
12 px entre cartes, 16 px à l'intérieur d'une carte.

- **Au-dessous de 900 px ou au doigt** : les panneaux deviennent des tiroirs sur voile, les cibles passent à
  40 px (44 px dans les menus).
- **Au-dessous de 640 px** : la barre tient sans défiler : outils et un menu « Plus » (Aide en tête, puis Vue,
  Fichier, Édition, contexte) ; « Enregistrer » passe dans la barre d'état ; les voies de l'accueil s'empilent ; un
  tiroir ouvert masque le dessin qu'il recouvre (le voile reçoit les touchers, on n'en voyait qu'une lisière).

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
(2 px), comme un gabarit à remplir. Les pastilles de couleur sont carrées à 4 px ; le bouton « aucun » d'une
couleur est un rond. Le focus est un contour plein de
2 px en cyan d'encre, décalé de 2 px.

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
- **Messages:** fond et texte d'alerte ou d'échec, coins de 6 px, 10 × 12 px.

### Bulle de la visite guidée (ADR-0019)
Une feuille de panneau qui flotte : filet, coins de 8 px, ombre de menu flottant, 340 px au plus (la largeur de l'écran
moins 16 px sur un téléphone). Dans l'ordre : la progression (« Étape 2 sur 5 », Aide, encre douce), le titre (Title),
une ou deux phrases (Body), puis « Passer la visite » (discret, à gauche), « Précédent » et « Suivant » (secondaires,
à droite). **Aucune action pleine** : l'action de l'étape est le vrai geste dans l'éditeur, pas un bouton de la bulle.
La fin remplace la ligne par trois suites (secondaires, pleine largeur) et « Terminer ».
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

### Panneau « Prêt pour Cricut » (signature)
Le carnet d'atelier le plus littéral : un profil en une ligne d'aide, la taille finale et les couches comme des
mesures, puis les constats classés Bloquant (rouge d'échec), À corriger (ambre d'alerte), Conseil (encre douce),
chacun avec ses boutons secondaires de correction ; une seule action primaire, « Exporter pour Cricut ».

## Do's and Don'ts

### Do:
- **Do** poser chaque couleur d'interface comme un jeton de `src/styles/jetons.ts`, avec ses valeurs claire et
  sombre et sa paire de contraste 4,5:1.
- **Do** garder une seule action pleine en cyan d'encre par panneau ; tout autre bouton est secondaire ou discret.
- **Do** écrire mesures, codes couleur et noms de fichier en IBM Plex Mono.
- **Do** donner 24 × 24 px à toute cible à la souris et 40 px au doigt.
- **Do** dessiner les repères de fabrication (tapis, grille, zone utile) en filets et pointillés, sous le dessin.

### Don't:
- **Don't** écrire une couleur en dur dans la page ou un composant (un test l'interdit).
- **Don't** poser une ombre sur une surface au repos.
- **Don't** introduire une seconde couleur d'accent ; les messages (ambre, rouge) ne servent qu'aux messages.
- **Don't** laisser un bouton inactif sans raison lisible.
- **Don't** désactiver une règle d'audit axe-core ou un comportement `prefers-reduced-motion`.
- **Don't** poser un voile pour guider, ni une bulle sur ce qu'elle demande de toucher ; un repère est une note dans le
  flux, pas une seconde bulle.
