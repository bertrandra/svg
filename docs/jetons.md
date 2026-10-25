# Les jetons de couleur

Généré depuis `src/styles/jetons.ts` (ADR-0007) : ne pas modifier à la main. `ACTUALISER_REFERENCES=1 npx vitest run tests/unit/styles` le régénère.

### Les fonds : la table de travail et les panneaux

| Jeton | Clair | Sombre | Rôle |
|---|---|---|---|
| `--table` | `#e9ecef` | `#121518` | Le fond de la page, et du champ de travail autour du plan |
| `--panneau` | `#f7f8f9` | `#1a1e22` | Les barres, panneaux, cartes et menus : ce qui se pose sur la table |
| `--selection` | `#c6dde6` | `#2a4b5a` | Le fond du texte sélectionné : la couleur d’outil adoucie, sous l’encre |

### Les encres : le texte et ses nuances

| Jeton | Clair | Sombre | Rôle |
|---|---|---|---|
| `--encre` | `#15181d` | `#e6e9ec` | Le texte courant et les icônes |
| `--encre-douce` | `#555c66` | `#9aa3ad` | Le texte secondaire : aides, légendes, libellés de champ |

### Les filets et séparations

| Jeton | Clair | Sombre | Rôle |
|---|---|---|---|
| `--filet` | `#cfd4da` | `#2f353c` | Les bordures et séparations ; décoratif, il ne porte jamais seul une information |
| `--filet-fort` | `#7d848d` | `#69717b` | Le bord qui doit se voir : pastille de couleur (une encre sur un panneau sombre), poignée des barres de défilement |

### La couleur d’outil : une seule, pour l’action et l’état actif

| Jeton | Clair | Sombre | Rôle |
|---|---|---|---|
| `--cyan` | `#00719c` | `#4fb3dc` | La couleur d’outil : action primaire, état actif, focus, liens |
| `--cyan-survol` | `#006186` | `#4fb3dc` | Le texte d’un bouton discret survolé : le cyan s’assombrit en clair, où le voile du survol le ferait passer sous 4,5:1 |
| `--sur-cyan` | `#ffffff` | `#08202b` | Le texte posé sur la couleur d’outil |

### Les messages : avertissement et échec, chacun avec son fond

| Jeton | Clair | Sombre | Rôle |
|---|---|---|---|
| `--alerte` | `#8a5a00` | `#e3b45a` | Avertissement : le texte |
| `--alerte-fond` | `#f8ecd2` | `#33280f` | Avertissement : le fond du message |
| `--echec` | `#a8322a` | `#f08b80` | Échec et geste destructif : le texte et le contour |
| `--echec-fond` | `#f7e0dd` | `#3a1c19` | Échec et geste destructif : le fond au survol |

### Ce qui se voit derrière le dessin : les fonds du plan de travail et le damier

| Jeton | Clair | Sombre | Rôle |
|---|---|---|---|
| `--damier-a` | `#ffffff` | `#ffffff` | Le damier de transparence : les cases claires |
| `--damier-b` | `#e6e6e6` | `#e6e6e6` | Le damier de transparence : les cases grises |
| `--toile-blanc` | `#ffffff` | `#ffffff` | Le plan de travail en fond blanc |
| `--toile-sombre` | `#1b1d20` | `#1b1d20` | Le plan de travail en fond sombre |
| `--encre-toile` | `#15181d` | `#15181d` | L’encre des aperçus de police « forme / ligne », posés sur le plan blanc dans les deux thèmes (comme le papier qu’on découpe) |

### Les ombres et voiles, translucides

| Jeton | Clair | Sombre | Rôle |
|---|---|---|---|
| `--ombre-menu` | `rgba(0, 0, 0, 0.2)` | `rgba(0, 0, 0, 0.2)` | L’ombre des menus déroulants |
| `--ombre-tiroir` | `rgba(0, 0, 0, 0.25)` | `rgba(0, 0, 0, 0.25)` | L’ombre des tiroirs mobiles |
| `--voile` | `rgba(0, 0, 0, 0.35)` | `rgba(0, 0, 0, 0.35)` | Le voile qui assombrit la toile derrière un tiroir ouvert |

### Les teintes de repli : ce que color-mix() calcule, déjà calculé pour un navigateur qui ne l’a pas (docs/navigateurs.md)

| Jeton | Clair | Sombre | Rôle |
|---|---|---|---|
| `--repli-cyan-10` | `rgba(0, 113, 156, 0.1)` | `rgba(79, 179, 220, 0.1)` | La couleur d’outil à 10 % : survol d’un bouton discret, cadre de sélection |
| `--repli-cyan-12` | `rgba(0, 113, 156, 0.12)` | `rgba(79, 179, 220, 0.12)` | La couleur d’outil à 12 % : survol d’un bouton d’icône, d’un menu, du zoom |
| `--repli-cyan-14` | `rgba(0, 113, 156, 0.14)` | `rgba(79, 179, 220, 0.14)` | La couleur d’outil à 14 % : bouton d’icône dont le menu est ouvert, élément de menu survolé |
| `--repli-cyan-18` | `rgba(0, 113, 156, 0.18)` | `rgba(79, 179, 220, 0.18)` | La couleur d’outil à 18 % : ligne choisie des calques et des couleurs |
| `--repli-cyan-35` | `rgba(0, 113, 156, 0.35)` | `rgba(79, 179, 220, 0.35)` | La couleur d’outil à 35 % : le trait de la grille magnétique |
| `--repli-cyan-6-panneau` | `#e8f0f3` | `#1d272d` | La couleur d’outil à 6 % sur un panneau : la rangée de la sélection |
| `--repli-cyan-7-panneau` | `#e6eff2` | `#1e282f` | La couleur d’outil à 7 % sur un panneau : la voie choisie de l’accueil |
| `--repli-cyan-8-panneau` | `#e3edf2` | `#1e2a31` | La couleur d’outil à 8 % sur un panneau : la zone de dépôt survolée, le bandeau de reprise |
| `--repli-cyan-fonce` | `#006186` | `#449abd` | La couleur d’outil assombrie de 14 % : survol de l’action primaire |

### Contrastes exigés (WCAG 2.x AA, au moins 4.5:1)

| Paire | Clair | Sombre | Usage |
|---|---|---|---|
| `--encre` sur `--table` | 15.00 | 15.03 | texte sur la page |
| `--encre` sur `--panneau` | 16.73 | 13.76 | texte dans les panneaux et menus |
| `--encre-douce` sur `--table` | 5.70 | 7.17 | aides sur la page, texte d’exemple d’un champ (::placeholder) |
| `--encre-douce` sur `--panneau` | 6.35 | 6.56 | aides dans les panneaux |
| `--encre` sur `--selection` | 12.61 | 7.65 | texte sélectionné (::selection) |
| `--cyan` sur `--table` | 4.61 | 7.69 | liens et boutons discrets sur la page |
| `--cyan` sur `--panneau` | 5.14 | 7.04 | liens et boutons discrets dans les panneaux |
| `--cyan-survol` sur `--panneau` | 6.47 | 7.04 | bouton discret survolé dans un panneau (le voile de survol à 10 % est vérifié par un test de rendu) |
| `--cyan-survol` sur `--table` | 5.80 | 7.69 | bouton discret survolé sur la page |
| `--sur-cyan` sur `--cyan` | 5.47 | 7.04 | libellé de l’action primaire et de l’outil actif |
| `--alerte` sur `--alerte-fond` | 5.06 | 7.54 | message d’avertissement |
| `--echec` sur `--echec-fond` | 5.28 | 6.40 | message d’échec, survol d’un geste destructif |
| `--echec` sur `--panneau` | 6.26 | 6.95 | geste destructif au repos |

### Contrastes exigés hors texte (WCAG 2.x 1.4.11, au moins 3:1)

| Paire | Clair | Sombre | Usage |
|---|---|---|---|
| `--filet-fort` sur `--panneau` | 3.55 | 3.39 | bord d’une pastille de couleur, poignée de défilement, sur un panneau |
| `--filet-fort` sur `--table` | 3.19 | 3.71 | bord d’une pastille de couleur, poignée de défilement, sur la table |
| `--encre-toile` sur `--toile-blanc` | 17.79 | 17.79 | les lettres d’un aperçu de police (forme pleine ou ligne de stylo) sur le plan blanc |
| `--cyan` sur `--panneau` | 5.14 | 7.04 | le liseré de survol d’une forme sur la toile, filet cyan sur son halo de panneau (ADR-0029) |

### La typographie : cinq tailles nommées par leur rôle

| Jeton | Valeur | Rôle |
|---|---|---|
| `--texte-petit` | `0.75rem` | Aides, légendes, raccourcis, mesures et codes dans les panneaux, barre d’état (12 px) |
| `--texte-compact` | `0.8125rem` | Commandes denses : menus, onglets, titres de section, boutons de la barre et des panneaux (13 px) |
| `--texte-corps` | `0.875rem` | Le texte courant, les boutons et les champs (14 px) |
| `--texte-titre` | `1rem` | Titres de voie, de carte et de boîte (16 px) |
| `--texte-titre-page` | `1.5rem` | Le titre de l’accueil, seul de son rang (24 px) |

### L’espacement : une base de 4, avec un pas de 6

| Jeton | Valeur | Rôle |
|---|---|---|
| `--esp-2xs` | `2px` | Entre deux éléments collés : onglets d’un groupe, icône et son repère |
| `--esp-xs` | `4px` | L’intérieur d’une barre, entre les outils |
| `--esp-s` | `6px` | Entre les lignes d’une liste, les boutons d’un groupe ; l’intérieur d’un bouton |
| `--esp-m` | `8px` | L’intérieur d’un champ ou d’un menu ; entre les éléments d’un panneau |
| `--esp-l` | `12px` | Entre deux cartes, l’intérieur d’un message, le côté d’un bouton |
| `--esp-xl` | `16px` | L’intérieur d’une carte ou d’une boîte, entre deux groupes |
| `--esp-2xl` | `24px` | Les marges de la page d’accueil |
| `--esp-3xl` | `48px` | Le pied de la page d’accueil |

### Les rayons : croissants avec la surface

| Jeton | Valeur | Rôle |
|---|---|---|
| `--rayon-pastille` | `4px` | Pastilles de couleur, vignettes, petites marques |
| `--rayon-champ` | `5px` | Champs, éléments de menu |
| `--rayon-bouton` | `6px` | Boutons, messages, onglets |
| `--rayon-menu` | `8px` | Menus déroulants, panneaux flottants |
| `--rayon-carte` | `10px` | Cartes, zones de dépôt, boîtes de dialogue |

### Les couches d’empilement

| Jeton | Valeur | Rôle |
|---|---|---|
| `--couche-saisie` | `5` | La saisie en place d’un texte vivant, sur la toile : au-dessus du dessin, sous les tiroirs |
| `--couche-voile` | `14` | Le voile sous un tiroir ouvert |
| `--couche-tiroir` | `15` | Les panneaux en tiroir sur tablette et téléphone |
| `--couche-saut` | `40` | Le lien d’évitement vers la toile |
| `--couche-editeur` | `1000` | L’éditeur en plein écran au-dessus de la page |
| `--couche-visite` | `1050` | La bulle de la visite guidée et son repère : au-dessus de l’éditeur et de ses tiroirs, sous les menus |
| `--couche-menu` | `1100` | Les menus déroulants, au-dessus de l’éditeur |
| `--couche-dialogue` | `1200` | Le voile et la boîte « À propos et crédits » |
