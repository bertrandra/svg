# ADR-0037 — Le nuancier se tire du dessin, et de la sélection

**Date :** 25 octobre 2026
**Statut :** acceptée (prolonge les ADR-0004, 0008, 0009, 0010, 0013, 0018, 0020 et 0030) ; **aucun octet écrit ne change** :
le SVG, ses références d’écriture et tous les exports d’avant sont intacts ; le projet JSON gagne un champ facultatif

## Contexte

Demande du propriétaire : « Le nuancier se crée sur la sélection du SVG, de l’image ou du PDF. »

Jusqu’ici, le nuancier proposé dans l’éditeur n’était qu’une liste tapée à la main (« Nom #rrggbb », replié en bas de l’accueil,
ou l’option `nuancier` d’un hôte). Nous lisons la demande ainsi : **le nuancier se construit à partir des couleurs du fichier
ouvert** — un SVG, un PDF, ou l’image une fois convertie — **et, quand on le demande, à partir de la sélection**. La liste tapée
reste : c’est un autre groupe, que rien n’efface.

Trois contraintes du dépôt pèsent : le cœur pur ne touche ni au DOM ni au hasard ; un SVG réécrit l’est à l’identique, et
« Générique » n’écrit aucun octet de plus (ADR-0013) ; ce qui dépend d’une forme immuable se mémorise par forme (ADR-0008).

## Décision

### 1. Le nuancier du dessin est une donnée du document, dans l’historique, jamais dans le SVG

`DessinSvg.nuancier` (facultatif, type dans `model/nuancier.ts`) porte une **provenance** (`dessin` : tiré de tout le dessin ;
`selection` : remplacé par une sélection ; `mixte` : le dessin puis des couleurs de sélection ajoutées) et des **teintes**
(`#rrggbb` en minuscules, et l’opacité gardée à part quand elle n’est pas pleine). Parce qu’il vit dans le dessin, l’historique
le garde : « Créer le nuancier depuis la sélection » est une entrée que **Ctrl+Z défait** ; une création qui ne change rien
n’empile rien. `ecrireDessin` l’ignore : **aucun octet de plus** dans le SVG (`ecriture-stable` vert sans
`ACTUALISER_REFERENCES`).

À l’ouverture, l’éditeur pose le nuancier tiré des couleurs dans l’**état initial** de l’historique (`avecNuancier`) : ce n’est
pas une modification (« 0 modification », rien à enregistrer). Cela vaut pour un SVG, un PDF (lu en SVG, ADR-0020), une image
convertie (son tracé), un projet d’avant ce champ. Un dessin qui en porte déjà un garde son identité : le site, qui compare les
états par identité (ADR-0030), pose le même nuancier en ouvrant le travail (`Site.tsx`, `ouvrirTravail`), et l’état de référence
est celui que l’éditeur ouvre.

### 2. Le calcul : pur, déterministe, mémorisé par forme (`engine/nuancier.ts`)

- **Ce qu’une forme apporte** (`apportsDe`, mémorisé par forme dans une `WeakMap`) : son remplissage, pour l’**aire peinte**, et
  son contour, pour la **longueur du tracé × l’épaisseur**, chacun à son opacité effective (forme × peinture, au centième). L’aire
  se lit par la formule de Green, exacte pour un segment droit et exacte aussi pour une quadratique ou une cubique par trois
  points de Gauss-Legendre (l’intégrande d’une cubique est de degré 5) ; un trou se lit selon la règle (pair-impair, ou sens du
  tracé par nombre d’enroulement), l’emboîtement étant lu sur les boîtes (`engine/nuancier/surfaces.ts`). Ce qui ne peint pas
  n’apporte rien : forme masquée, sans peinture, trait d’épaisseur nulle, opacité nulle, aire nulle.
- **Les couleurs distinctes** : cumulées par code exact, puis **fusionnées** quand leur écart perçu (distance OKLab, celle de
  `ecartPercu` et des nuances proches) est **à 0,02 ou moins**, le seuil de la différence à peine visible (« 0,02 se devine ») :
  #c81e28 et #c91f27, nés d’une vectorisation, n’en font qu’une ; #c81e28 et #b41b24 (0,04) restent deux. Glouton, de la plus
  large à la moins large, contre la couleur retenue (jamais contre le dernier membre : un dégradé ne s’enchaîne pas) ; la couleur
  retenue est la **plus large de son groupe**, une couleur réelle du dessin, jamais une moyenne ; l’opacité gardée est celle qui
  couvre le plus de surface. L’index de voisinage OKLab (`util/voisinsOklab.ts`) évite le coût quadratique d’un dessin de photo.
- **Le rangement** : par **surface couverte** décroissante, puis par code croissant à égalité.
- **Le plafond** : **24** teintes par défaut (`PLAFOND_NUANCIER`, option `plafond` du moteur). Le **noir et le blanc** du dessin
  (clarté OKLab sous 0,25 ou au-dessus de 0,95, sans chroma) restent s’ils servent, même minuscules (un filet noir, une réserve
  blanche) : ils prennent les dernières places, l’ordre par surface est gardé.

CIEDE2000 n’a pas été retenu : OKLab est déjà la mesure de tout le dépôt (contrastes, nuances proches, extraction d’image), et
une distance euclidienne y a du sens.

### 3. Une image : les couleurs dominantes, puis celles du tracé

Les couleurs dominantes d’une image se comptaient déjà par **coupe médiane** (`engine/extraction.ts`, `couleursPixels`), pure et
déterministe (aucun tirage : pas de k-moyennes à graine). `teintesDImage` les range et les fusionne par les mêmes règles, leur
part de l’image tenant lieu de surface. Sous le résultat de l’atelier (`zones/NuancierImage.tsx`) : « **Nuancier de l’image** »,
puis, pour de vrais vecteurs, « **Couleurs du tracé** », le nuancier que l’éditeur proposera.

« Le nombre de couleurs du traceur part de ce nuancier » **est déjà vrai** : en mode « Aplats », la palette imposée au traceur
(`optionsTraceur`) est exactement ces couleurs dominantes, et « Nombre de couleurs » en prend les N premières. Aucun bouton de plus.

### 4. Créer le nuancier depuis la sélection

La commande existe en quatre endroits, toujours avec ses deux choix : **Remplacer** (le nuancier du dessin devient les couleurs des
formes choisies, mêmes règles : surface, fusion, plafond) et **Ajouter** (les teintes d’avant dans leur ordre, puis celles de la
sélection qu’aucune ne couvre déjà sous le seuil ; 256 au plus) :

- le menu **Édition** (« Créer le nuancier depuis la sélection : remplacer », « … : ajouter ») ;
- la **rangée de la sélection** (un petit menu à l’icône de palette) et, au doigt sur un petit écran, une rubrique de son menu
  « Plus » ;
- la section « Nuancier » (« Depuis la sélection », visible quand quelque chose est choisi) ;
- les raccourcis **Maj+N** (remplacer) et **Alt+Maj+N** (ajouter), lus par le code de la touche (Alt change le caractère sur un
  Mac), libres ailleurs dans l’éditeur, dits dans la liste des raccourcis.

Le menu du groupe offre aussi « Reprendre les couleurs de tout le dessin » (une entrée d’historique). Sans sélection, ou si les
formes choisies n’ont aucune couleur employée, rien ne change et la barre d’état le dit.

### 5. Où on le voit : une section « Nuancier », deux groupes

Une section « Nuancier » de l’inspecteur, ouverte, avec ou sans sélection (`zones/SectionNuancier.tsx`) :

- « **Appliquer au** » : Remplissage | Contour, deux boutons à état (filet et texte cyan, jamais pleins : un état, pas une action) ;
- « **Couleurs du dessin** » : son nombre et sa provenance (« 5 · tirées du dessin », « de la sélection », « du dessin et de la
  sélection »), « Depuis la sélection » et le menu du groupe (reprendre, exporter) ;
- « **Nuancier proposé** » : celui de la page ou de l’hôte, tel qu’il est donné. L’éditeur ne sait pas qui le lui donne : le
  groupe reprend les mots de l’accueil (« Nuancier proposé dans l’éditeur ») plutôt que de deviner « de la page » ou « de l’hôte ».

Un **clic** pose la couleur sur la cible (le remplissage par défaut) des formes choisies, **Maj+clic** (ou **Maj+Entrée**) sur
l’autre ; sans sélection, la couleur va aux formes nouvelles. Chaque pastille a un **nom accessible** : le nom donné par la page
s’il existe, sinon un **nom approché en français** (`model/nomsCouleurs.ts` : noir, blanc, gris, puis une famille de teinte OKLCH
nuancée « clair » ou « foncé », brun, olive, rose, beige), puis le code, puis l’opacité (« Bleu foncé #1428A0, opacité 50 % »).
« Par couleur » ne nommait pas une couleur sans nom (il montre le nom du nuancier de la page, ou le code) : le nom approché est
neuf, et reste une aide à reconnaître, le code désignant exactement. La pastille enfoncée (`aria-pressed`) est la couleur que la
cible porte déjà. Les flèches, Début et Fin parcourent un groupe, Tab passe de pastille en pastille et sort sans piège. Au doigt,
40 px. Aucune action pleine : choisir une couleur n’est pas l’action du panneau. Les pastilles montrent les couleurs du dessin,
données et non couleurs d’interface : seul leur bord est un jeton (le filet fort).

Les pastilles du nuancier proposé restent aussi sous « Remplissage » et « Contour » dans « Apparence », comme avant.

### 6. Le projet JSON garde le nuancier du dessin

`dessin.nuancier` dans le projet (ADR-0030), dans l’ordre du format : `{ "provenance": "dessin", "teintes": [ { "hex":
"#1428a0", "opacite": 0.5 }, { "hex": "#c81e28" } ] }`. La lecture valide sans lever (provenance admise, codes `#rrggbb`, opacité
de 0 à 1 et jamais 1 écrite, 256 teintes au plus, aucun champ inconnu gardé) ; l’aller-retour est exact ; un projet d’avant le
champ reste tel quel, octet pour octet, et l’éditeur lui tire son nuancier à l’ouverture. Le nuancier de la page (`nuancier`, à la
racine) ne change pas. Le serveur PHP n’a rien à apprendre : il passe le dessin tel quel.

**La version du format reste 1** : le champ est facultatif, son absence a un sens (le nuancier se tire du dessin), et le format
n’est pas encore publié (tout est « Non publié »). Le prix, dit : un programme d’avant ce champ qui rouvrirait et réenregistrerait
un projet le perdrait sans le dire : à la prochaine ouverture, le nuancier serait de nouveau tiré des couleurs du dessin.
Si un site a déjà été déployé avec le format 1, passer au format 2 (une migration vide) avant de publier.

Dans la page autonome, qui ne garde pas de projet, le nuancier du dessin vit le temps de l’édition : le brouillon et les versions
sont des SVG, et reprendre l’édition le tire de nouveau des couleurs du dessin.

### 7. Exporter le nuancier

Dans le menu du groupe « Couleurs du dessin » : « Exporter en .gpl (GIMP, Inkscape) » et « Exporter en .ase (Adobe) »
(`export/nuancier.ts`), écrits à la main comme les autres exports (ADR-0018), purs et déterministes : la palette GIMP (en-tête,
nom, huit colonnes, « R G B », une tabulation, le nom ; lue aussi par Inkscape, Krita, Scribus) et l’Adobe Swatch Exchange 1.0 (un
groupe nommé, une entrée RGB en réels simple précision par teinte, type « normal »). Ni l’un ni l’autre ne porte d’opacité : la
teinte s’y écrit pleine, son nom le dit. Pas d’export JSON : le projet porte déjà le nuancier, et un format de plus n’aurait aucun
lecteur.

## Conséquences

- **Octets** : aucun SVG ne change ; aucun export d’avant ne change ; un projet sans le champ s’écrit comme avant.
- **Tests** : `tests/unit/engine/nuancier.test.ts` (surfaces exactes, rangement par surface, fusion sous le seuil, opacité à part,
  plafond et noir et blanc gardés, ce qui ne peint pas, déterminisme et indépendance à l’ordre, mémoire par forme, sélection
  remplacer et ajouter, quantification d’une image), `tests/unit/model/nomsCouleurs.test.ts`, `tests/unit/export/nuancier.test.ts`
  (`.gpl` à l’octet, `.ase` relu bloc par bloc), `tests/unit/engine/projet-nuancier.test.ts` (aller-retour, provenance, projet
  d’avant, refus nommés, aucun octet dans le SVG), `tests/unit/zones/actionsNuancier.test.ts` (Ctrl+Z, création sans effet, poser
  une teinte) ; `tests/e2e/nuancier.e2e.ts` dans Chromium, Firefox et WebKit (ordre à l’ouverture, nuancier de la page, clic et
  Maj+clic, remplacer et ajouter par trois chemins, Ctrl+Z, Maj+N et Alt+Maj+N, flèches et Maj+Entrée, image convertie, 390 px au
  doigt, axe en clair et en sombre).
- **Performance** : un dessin de cinq mille formes se mesure une fois par forme ; ensuite, seule l’addition se refait quand une
  forme change. Le nuancier montré quand le dessin n’en porte pas se mémorise par liste de formes.

## Limites, honnêtement

- La surface est celle qui est **peinte**, pas celle qui reste **visible** : une forme recouverte compte toute son aire. Un trait
  compte sa longueur par son épaisseur, sans ses jonctions ni ses bouts ; des boucles qui se croisent se lisent par leurs boîtes.
- Les noms approchés sont des familles, pas un nuancier de catalogue : deux pastilles peuvent porter le même nom (le code les
  distingue).
- « Couleurs du dessin » est aussi le titre de la section qui recolore le dessin couleur par couleur (panneau du dessin) : le groupe
  du nuancier est dans la section « Nuancier », mais deux choses portent le même nom. Renommer l’ancienne section (« Recolorer par
  couleur » ?) se décidera à part : ses tests et ses habitudes en dépendent. *Décidé le 26 octobre 2026 : l’ancienne section s’appelle
  « Recolorer le dessin », et la section des palettes qui la suivait sous le titre « Recolorer » s’appelle « Palettes ».*
- Les raccourcis Maj+N et Alt+Maj+N sont libres aujourd’hui ; un chantier parallèle qui prendrait N devra s’accorder.

## Alternatives écartées

- **Un nuancier vivant, qui suit les couleurs du dessin** : c’est ce que font déjà « Par couleur » et « Couleurs du dessin »
  (panneau du dessin). Un nuancier est une palette : il garde les couleurs d’origine quand on recolore, pour y revenir.
- **Un état à part, hors de l’historique** : Ctrl+Z n’aurait pas défait la création depuis la sélection, ou il aurait fallu une
  seconde pile d’annulation.
- **Écrire le nuancier dans le SVG** (`data-ed-nuancier`) : contraire à l’ADR-0013 (« Générique » n’écrit aucun octet de plus) ; le
  projet est l’endroit des données qui ne sont pas du dessin.
- **Des k-moyennes à graine fixe** pour l’image : déterministes aussi, mais plus lentes, et la coupe médiane existait, éprouvée par
  le traceur.
- **Une moyenne pour la couleur fusionnée** : elle n’existerait nulle part dans le dessin ; poser une teinte du nuancier doit
  reproduire une couleur réelle.
