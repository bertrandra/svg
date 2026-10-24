# Les jetons de couleur

Généré depuis `src/styles/jetons.ts` (ADR-0007) : ne pas modifier à la main. `ACTUALISER_REFERENCES=1 npx vitest run tests/unit/styles` le régénère.

### Les fonds : la table de travail et les panneaux

| Jeton | Clair | Sombre | Rôle |
|---|---|---|---|
| `--table` | `#e9ecef` | `#121518` | Le fond de la page, et du champ de travail autour du plan |
| `--panneau` | `#f7f8f9` | `#1a1e22` | Les barres, panneaux, cartes et menus : ce qui se pose sur la table |

### Les encres : le texte et ses nuances

| Jeton | Clair | Sombre | Rôle |
|---|---|---|---|
| `--encre` | `#15181d` | `#e6e9ec` | Le texte courant et les icônes |
| `--encre-douce` | `#555c66` | `#9aa3ad` | Le texte secondaire : aides, légendes, libellés de champ |

### Les filets et séparations

| Jeton | Clair | Sombre | Rôle |
|---|---|---|---|
| `--filet` | `#cfd4da` | `#2f353c` | Les bordures et séparations ; décoratif, il ne porte jamais seul une information |

### La couleur d’outil : une seule, pour l’action et l’état actif

| Jeton | Clair | Sombre | Rôle |
|---|---|---|---|
| `--cyan` | `#00719c` | `#4fb3dc` | La couleur d’outil : action primaire, état actif, focus, liens |
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
| `--encre-douce` sur `--table` | 5.70 | 7.17 | aides sur la page |
| `--encre-douce` sur `--panneau` | 6.35 | 6.56 | aides dans les panneaux |
| `--cyan` sur `--table` | 4.61 | 7.69 | liens et boutons discrets sur la page |
| `--cyan` sur `--panneau` | 5.14 | 7.04 | liens et boutons discrets dans les panneaux |
| `--sur-cyan` sur `--cyan` | 5.47 | 7.04 | libellé de l’action primaire et de l’outil actif |
| `--alerte` sur `--alerte-fond` | 5.06 | 7.54 | message d’avertissement |
| `--echec` sur `--echec-fond` | 5.28 | 6.40 | message d’échec, survol d’un geste destructif |
| `--echec` sur `--panneau` | 6.26 | 6.95 | geste destructif au repos |
