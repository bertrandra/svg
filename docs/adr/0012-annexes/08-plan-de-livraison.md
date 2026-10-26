# ADR-0012, annexe 8 — Plan de livraison : 15 étapes, paquets d'agent, carte des conflits

Principe : **chaque étape se fusionne seule, CI verte (portes G1 à G8 de l'annexe 7), sans que le produit visible
change tant que le réglage `modele` reste à `plat`** (défaut jusqu'à l'étape 14). Une étape de fonctionnalité
livre ensemble sa lecture, son écriture, ses opérations, son rendu de toile, **sa règle de descente** (annexe 5
§4) et ses cas hostiles ; l'interface a ses propres étapes, parce que c'est elle qui coûte en accessibilité.
Les tailles sont des estimations d'ordre de grandeur, non mesurées : **P** (≈ une demi-journée d'agent), **M**
(1 à 2 jours), **G** (2 à 4 jours).

## 0. Avancement et révision du plan (25 octobre 2026)

| Étape | État |
|---|---|
| 0 Coutures | **faite** le 25 octobre 2026 (ce qui a été posé : ci-dessous, et §1 « Étape 0 ») |
| 1 Groupes, moteur | **faite** le 26 octobre 2026 (ce qui a été posé et les écarts : ci-dessous, et §1 « Étape 1 ») |
| 10 Texte vivant, moteur | **faite** autrement (ADR-0022, 0027, 0031, 0032) ; reste un morceau, porté par l'étape 1 (voir « Caduc ») |
| 11 Texte vivant, interface | **faite** (ADR-0022, 0027, 0031, 0032 : `InspecteurTexte`, `BarreTexte`, `SaisieTexte`, `ChoixPolice`) |
| 3 Dégradés, moteur | **faite** le 26 octobre 2026 (vague 1, paquets A, B et C en un seul arbre ; ce qui a été posé et les écarts : §1 « Étape 3 ») |
| 12 Images | **faite pour le moteur** le 26 octobre 2026 (ce qui a été posé et ce qui reste : ci-dessous, « Ce que l'étape 12 a posé ») ; ses fonctions de projet sont **branchées** à la fusion des étapes 3 et 12 (cadre des champs v2 posé par l'étape 3) ; sous un groupe depuis la fusion avec l'étape 1 |
| 2 Groupes, interface | paquets **2-0** (état, réglage) et **2-A** (toile) **faits** le 26 octobre 2026 (ce qui a été posé : ci-dessous, « Ce que les paquets 2-0 et 2-A ont posé ») ; **2-B** (calques en arbre) **fait** le 26 octobre 2026 (« Ce que le paquet 2-B a posé ») ; **2-C** (commandes, fil d'Ariane, clavier, phrases) **fait** le 26 octobre 2026 (ci-dessous, « Ce que le paquet 2-C a posé ») ; 2-D proposé |
| 5 Découpes | **faite pour le moteur** le 26 octobre 2026 (paquets 5-A, 5-B, 5-C en un seul arbre ; ce qui a été posé, les écarts et ce qui reste : ci-dessous, « Ce que l'étape 5 a posé ») ; la toile vient du rendu générique de l'étape 2, l'interface de l'étape 8 |
| 7 Effets | **paquet 7-A (moteur) fait** le 26 octobre 2026 (ce qui a été posé, les écarts et ce qui reste : ci-dessous, « Ce que le paquet 7-A a posé ») ; **7-B (toile, brouillon, mesures) fait** le 26 octobre 2026 (ci-dessous, « Ce que l'étape 4 et le paquet 7-B ont posé ») ; l'interface des effets est à l'étape 8 |
| 4 Dégradés, interface | **faite** le 26 octobre 2026 (paquets 4-A et 4-B en un seul arbre ; ci-dessous, « Ce que l'étape 4 et le paquet 7-B ont posé ») |
| 6 Masques d'opacité | **faite pour le moteur** le 26 octobre 2026 (ce qui a été posé, les écarts et ce qui reste : ci-dessous, « Ce que l'étape 6 a posé ») ; la toile vient du rendu générique de l'étape 2, l'interface de l'étape 8 |
| 8 Découpes, masques, effets : l'interface | **faite** le 26 octobre 2026 (paquets A, B et C en un seul arbre ; ce qui a été posé, les décisions et ce qui reste : ci-dessous, « Ce que l'étape 8 a posé ») ; les contextes d'édition `decoupe`/`masque` **faits** par le paquet 8-D le 26 octobre 2026 (ci-dessous, « Ce que le paquet 8-D a posé ») |
| 9 Motifs | **faite pour le moteur** le 26 octobre 2026 (ce qui a été posé, les écarts et ce qui reste : ci-dessous, « Ce que l'étape 9 a posé ») ; la toile vient du rendu générique de l'étape 2 ; une seule commande d'interface (menu Édition, riche), le reste à l'étape 8 |
| 13c `<svg>` imbriqué, `<text>` en groupe | **fait pour le moteur** le 26 octobre 2026 (ce qui a été posé, les écarts et ce qui reste : ci-dessous, « Ce que l'étape 13c a posé ») |
| 13d Couleurs | **faite** le 26 octobre 2026 (moteur et listes ; ce qui a été posé, les décisions et ce qui reste : ci-dessous, « Ce que l'étape 13d a posé ») |
| 13a PDF natif | **fait** le 26 octobre 2026, sauf le raster des effets (ce qui a été posé, les écarts et ce qui reste : ci-dessous, « Ce que l'étape 13a a posé ») |
| 13b, 14 | proposées ; vagues et consignes revues (§2, §5) |

### Ce que l'étape 0 a posé (fichiers nouveaux)

- **Types** (`engine/edition/types.ts`, dernière édition du chantier) : `Forme.parent`, `peintureRemplissage`, `peintureContour`,
  `effets`, `image` ; `Groupe` (avec `origine`), `Contenu`, `DessinSvg extends Contenu`, `Peinture`, `Degrade` (linéaire,
  radial), `ArretDegrade`, `Motif`, `Effets`, `Flou`, `OmbrePortee`, `ImageIntegree`, `Decoupe`, `Masque`. Le texte vivant garde
  les types de l'ADR-0022 (`TexteVivant`, `PoliceTexte`), pas ceux de l'annexe 1 §3. Mesuré : 0 erreur de type.
- **`edition/arbre.ts`** : `estPlat` (vrai, honnêtement calculé : pas de table de groupes, aucune feuille à champ v2 ; le texte
  vivant, l'opération et l'origine sont du modèle plat), `arbreDe`, `ancetres`, `profondeur`, `visibleEffectif`,
  `verrouilleEffectif`, `feuillesDe`, `unites`, `promouvoir`, `prochainNumero`, `parcourirContenus`, `poidsDessin` (branché sur
  `limitePourTaille` dans `zones/creerActions.ts`), `verifierDessin` (I1 à I5 et I9 : la table `groupes` est absente, jamais
  vide), `normaliser` (identité sur un dessin plat, et sur un dessin riche déjà normal).
- **Les six registres**, réunis en **une** interface : `edition/fonctionnalites.ts` (`Fonctionnalite` : crochets de lecture,
  d'écriture, de transformation ; rangs d'attributs `RANG_GROUPE`, `RANG_FEUILLE`) et **`edition/catalogue.ts`** (la liste
  `FONCTIONNALITES`, vide). (1) lecteurs d'éléments : `lecture.elements`, appelés par `visiter` ; (2) fonctions prises en
  charge : `lecture.prises`, consultées par `refusDe(pr, prises)` ; (3) écrivains d'attributs : `ecriture.peindreFeuille`
  (`url(#…)` à la place de la couleur), `attributsFeuille`, `elementFeuille` (une image), `attributsGroupe` ; (4) écrivains de
  définitions : le recueil `edition/definitions.ts` (`recueil`, `idDefinition` : `ed-<genre>-<14 hex>`, dédoublonnage par texte,
  suffixe en cas de collision) passé à chaque écrivain ; (5) transformateurs : `transformation.feuille` et `.groupe`, par
  `edition/transformation.ts` (`transformerFeuille`, `transformerGroupe`), par où passent désormais `transformer`, `dupliquer`,
  `coller` et `inserer` ; (6) phrases et descente : les phrases dans le fichier de la fonctionnalité, la règle de descente dans
  `engine/descente/<nom>.ts`, inscrite dans `REGLES_DESCENTE` (`engine/aplatir.ts`). Plus deux crochets de lecture : `peinture`
  (une peinture `url(#…)` résolue, la couleur de repli prend la place) et `feuille`/`groupe` (compléter ce qui vient d'être lu).
  La marche offre aux lecteurs `enfants`, `visiter`, `poserForme`, `boiteForme` (pour `objectBoundingBox`), `refuser`, `ignorer`.
- **Lecture** : `OptionsLecture.modele` (`plat` par défaut ; `riche` consulte le catalogue, vide : il lit comme `plat`),
  `lireDessinAvec` (une liste donnée, pour les tests), `lireDessinMemo(svg, modele)` à clé de mode (`zones/lecture.ts`).
- **Écriture** : `ecrireDessin` commence par `estPlat` ; sinon `edition/ecritureRiche.ts` (aucune ligne commune) : `<svg …
  data-ed-modele="2">` (`xmlns:xlink` avant `viewBox` s'il y a une image), `<defs>` en premier enfant et seulement s'il y a une
  définition, l'arbre parcouru (`<g …>` pour un groupe visible qui a quelque chose à écrire, rien pour un groupe masqué), une
  feuille sans champ v2 écrite par l'écriture plate (même cache, mêmes octets, lien des textes posés et opération compris).
- **`modifier`** : une couleur unie retire la peinture non unie du même côté (annexe 3 §2) — sans effet sur une forme plate.
- **Descente** : `engine/aplatir.ts` (`aplatirPour`, identité sur un dessin plat ; règles puis filet qui retire ce qui resterait
  en le disant), `Capacites`, `Niveau`, `FonctionV2`, `DessinPlat` (alias de `DessinSvg` ; l'étape 1 le verrouille),
  `CAPACITES_PLAT` ; `export/capacites.ts` (SVG de découpe, PDF, DXF, EPS, production) ; les points d'entrée des exporteurs
  (`ecrirePdf`, `svgDecoupe`, `ecrireDxf`, `ecrireEps`, `svgCricut`, `svgPourStylo`, `printThenCut`, `exportParOperation`,
  `archiveOperations`) prennent un `DessinPlat`.
- **Façade** (`editionSvg.ts`) : un bloc commenté par étape (1, 3, 5, 6, 7, 9, 12) ; chacune n'exporte que dans le sien.
- **Gardes-fous** : manifeste `tests/fixtures/svg/references-v1.sha256` (140 fichiers : entrées, références, empreintes des six
  bibliothèques) et `references-v1-gelees.test.ts` (une référence ajoutée passe, une réécrite ou retirée échoue ; régénérer :
  `ACTUALISER_MANIFESTE_V1=1`) ; **loi du dessin plat** (`loi-dessin-plat.test.ts` + `anciennes/` : `ecrireDessin`,
  `transformer`, `dupliquer`, `coller`, `inserer`, `modifier`, `refusDe`, et lecture riche = plate) ; **contrat des
  fonctionnalités** (`fonctionnalites.test.ts` : sur toute feuille plate du corpus, chaque crochet de chaque fonctionnalité
  inscrite rend la même feuille, aucun attribut, aucune définition) ; harnais **`ecriture-stable-v2.test.ts`** (cas trouvés
  dans `tests/unit/engine/v2/cas-*.ts`, références dans `tests/fixtures/svg/v2/`, point fixe vérifié) ; **extensions de
  l'écriture permise** (`tests/unit/securite/extensionsEcriture.ts`, consultées par `violationsEcriture`) ; **champs du projet**
  (`projet-v2.test.ts` : chaque champ de `Forme` et de `DessinSvg` est « porté » par le projet JSON ou attend son étape) ;
  **architecture** (`tests/unit/export/descente.test.ts` : `src/export` ne lit ni `groupes` ni un champ v2, ses points d'entrée
  prennent un `DessinPlat`).

### Ce que l'étape 1 a posé

- **Lecture** : `edition/fonctions/groupes.ts` (lecteurs `g` et `a` du mode riche, `nomDuGroupe`, `GROUPES_MAX`, `NOM_GROUPE_MAX`,
  écrivain `attributsGroupe`), une ligne de `catalogue.ts` ; dans `parcours.ts`, `Contexte.parent`, `Pret.opaciteDuParent`,
  `Parcours.groupes`, le `parent` posé par `poserForme` et sur les lettres d'un `<text>` lu dans un groupe ; dans `lecture.ts`, la
  table rendue en riche (passée par `normaliser` : un groupe sans feuille gardée part) et le refus d'un `data-ed-modele` supérieur
  à `VERSION_MODELE` dans les deux modes ; `edition/fusion.ts` (`mix-blend-mode`, `paint-order`, `vector-effect`, dans les deux
  modes).
- **Écriture** : `ecritureRiche.ts` ne pose plus le marqueur (ni `<defs>`) que si quelque chose de riche s'écrit (un `<g>`, une
  définition, un attribut ou un élément d'une fonctionnalité) : un dessin riche dont les groupes sont tous masqués ou vides donne les
  octets de l'écriture plate, et le point fixe tient (trouvé par la suite aléatoire).
- **Opérations** : `edition/groupes.ts` (`grouper`, `degrouper` avec ses `porteurs`, `deplacerDans`, `renommer`, et les chemins
  riches : `reglerGroupes`, `transformerGroupesDe`, `dupliquerNoeuds`, `ordonnerNoeuds`, `montrerSeulementNoeuds`, `insererContenu`,
  `collerContenu`, `egales`) ; derrière `estPlat`, chaque ligne de l'annexe 3 §2 dans `operations.ts` (`transformer` par la
  fermeture, `aligner` par unité, `modifier` au groupe ou aux feuilles, `modifierTrait`, `supprimer`, `prochainId` →
  `prochainNumero`, `dupliquer`, `ordonner`, `montrerSeulement`), `assemblage.ts` (`inserer`, `combiner` qui dit
  `MSG_MEME_PARENT`, `coller` qui accepte les groupes du presse-papiers), `nettoyage.ts` (`retirerPetites`, `regrouper`,
  `ajusterPlan` par `boiteVisuelle`), `isolement.ts` (l'instantané garde les groupes), `formes.ts` (`ajouterForme(…, parent)`),
  `geometrie.ts` (`boiteDe` d'un nœud = celle de ses feuilles), `booleens.ts` (même règle de parent) ; `etendue.ts`
  (`boiteVisuelle`, par les crochets `etendue`, dans `etendueVisuelle.ts` : dans `etendue.ts`, la consultation du catalogue
  faisait un cycle d'import avec les images) ; `engine/texte/vectoriser.ts` (`vectoriserLettresEnGroupes`, `nomGroupeTexte`).
  `arbreDe` calcule la chaîne des groupes une fois par groupe (mesure : 2,4 ms sur 5 000 feuilles et 520 groupes, quand l'arbre plat
  de 5 000 feuilles en prend 1,4 sur la même machine ; le budget de 2 ms est à reprendre sur la machine de référence de l'ADR-0008).
- **Descente et exports** : `engine/descente/groupes.ts` (dernière ligne de `REGLES_DESCENTE`, `MSG_OPACITE_COMPOSEE`),
  `DessinPlat` verrouillé (`unique symbol`), `phrasePertes` ; `zones/actionsExport.ts` et `actionsProduction.ts` passent par
  `aplatirPour` et ajoutent la phrase au message ; les tests d'export passent par `tests/unit/export/plats.ts`.
- **Projet** : `model/projetV2/champs.ts` (`CHAMPS_FORME_V2`, `CHAMPS_GROUPE_V2`, `OutilsProjet`), `model/projetV2/groupes.ts`
  (`GroupeProjet`, `lireGroupesProjet`), `engine/projetV2/champs.ts` (`ALLERS_RETOURS_FORME`, `ALLERS_RETOURS_GROUPE`,
  `groupeProjet`, `groupeDuProjet`) : une ligne par champ et par étape. **Règle de version confirmée** : `VERSION_PROJET = 2`,
  `VERSION_PROJET_PLAT = 1` ; un dessin plat s'écrit au format 1 (octet pour octet celui d'avant), un dessin à groupes au format 2 ;
  `MIGRATIONS[1]` est l'identité (le même objet : `migre` reste faux) ; au format 1, les groupes et `parent` sont inconnus, donc
  ignorés, comme tout champ v2 (la règle générale de l'étape 3) ; un arbre abîmé est refusé à l'ouverture (`verifierDessin`, « Ce
  projet porte des groupes mal formés. »). *À la fusion avec les étapes 3 et 12 :* un seul cadre des champs v2, celui de l'étape 3 ;
  `parent` y est une ligne de chaque côté (avant les peintures et l'image, après `operation`), la table `groupes` se lit dans
  `lireDessinProjet` au format 2 seulement, et `OutilsProjet` gagne `identifiant`.
- **Tests** : `v2/cas-groupes.ts` (les 10 entrées v1 à `<g>` et `texte-vivant-lecture` en `riche-*`, 4 entrées `groupes-*`, 12
  opérations), `groupes.test.ts` (lecture, bornes, marqueur, opérations, lois, suite aléatoire de 100 opérations sur trois graines,
  budget), `descente-groupes.test.ts`, `corpus-v2.test.ts` et `tests/fixtures/svg/corpus/` (`inkscape-calques`,
  `illustrator-calque`), cinq hostiles `v2-groupes-*`, l'extension d'écriture « étape 1 : groupes », la règle du texte vivant sous
  un `<g>` (`invariants.ts`), les anciens corps dans `anciennes/etape1.ts` et leurs cas dans `loi-dessin-plat.test.ts`, plus une loi :
  un SVG lu en riche puis descendu redonne les formes de la lecture plate.

### Ce que l'étape 12 a posé (26 octobre 2026)

- **`edition/fonctions/images.ts`** et une ligne de `catalogue.ts` : le lecteur `image` (mode `riche` seulement ; la lecture
  `plat` refuse toujours « une image ») ; `href` l'emporte sur `xlink:href` ; `verifierDonneesImage` décide sur les **octets**
  (`natureOctets.ts` de l'ADR-0036) : une « image » SVG (annoncée `svg+xml` ou dont les octets sont un SVG) refusée « une image
  SVG imbriquée », une adresse extérieure (ou une image dont le nettoyage a retiré l'adresse) « une image qui renvoie à un fichier
  ou une adresse extérieurs », un autre type, des données non base64 ou abîmées, un contenu qui n'est ni PNG, ni JPEG, ni GIF, ni
  WebP, un en-tête sans dimensions, chacun refusé en le nommant ; un type annoncé qui ment sur un format admis (un JPEG annoncé
  PNG) est **corrigé** d'après les octets, et dit. Bornes `IMAGE_OCTETS_MAX` (4 Mo), `IMAGES_OCTETS_MAX` (16 Mo, clones compris),
  `IMAGE_PIXELS_MAX` (64 millions, lus dans l'en-tête). `x y width height` (nombres, pixels, pourcentages ; une largeur ou une
  hauteur absente ou `auto` prend la taille de l'image ou sa proportion), `preserveAspectRatio` ramené à sa forme courte (le défaut
  absent), `transform` et ceux des ancêtres composés en `matrice` ; une image cachée, nulle ou écrasée ne se lit pas ; opacité
  gardée sur la feuille. `d` est le rectangle, `remplissage` et `contour` sont `null`.
- **Écriture** (`ecriture.elementFeuille`) : `<image xlink:href x y width height [transform="matrix(…)"] [preserveAspectRatio]
  [opacity]/>`, parties linéaires de la matrice à six décimales ; une matrice qui, **arrondie**, n'est qu'une translation et une
  échelle positive (uniforme, ou quelconque sous `none`) se plie dans le cadre (déplacer une image change son `x`, son `y`) ; des
  données, un aspect ou un nombre qui ne sont pas de la forme lue ne s'écrivent pas. Point fixe vérifié ; rendu identique de
  l'entrée et de la référence dans Chromium, Firefox et WebKit (mesuré à la main, à l'anticrénelage près sur une rotation).
- **`edition/dimensionsImage.ts`** (pur) : `decoderBase64`, `dimensionsImage` (IHDR, SOF, écran logique du GIF, VP8/VP8L/VP8X).
- **Transformation** (`transformation.feuille`) : la matrice se compose, `d` redevient exactement le rectangle ; l'identité exacte
  disparaît. **Poids d'historique** : celui de l'étape 0 (`poidsDessin`). **`dessinableEnPoints(f)`** et `MSG_POINTS_IMAGE`
  exportés, que l'étape 2 branchera sur l'édition des points.
- **Descente** (`engine/descente/images.ts`, une ligne de `REGLES_DESCENTE`, après les dégradés) : abandonnée et dite (« une image (ce format ne
  porte que des tracés : elle n'est pas exportée) », au pluriel « N images ») pour tout niveau sauf `natif` ; une image masquée
  part sans phrase. Le SVG et le PNG ne descendent pas (le navigateur dessine l'image).
- **Projet JSON** : `model/projetV2/image.ts` (`lireImageProjet`, forme et bornes, sans lever) et `engine/projetV2/image.ts`
  (`imageProjet`, `imageDuProjet` qui revérifie les octets et redonne `d`, `refusImagesProjet` pour les 16 Mo) ; aller-retour exact
  et même SVG. **Branchés** à la fusion des étapes 3 et 12 par une ligne de chaque cadre de l'étape 3 (`model/projetV2/champs.ts` :
  lecteur et garde « une image ne porte ni remplissage ni contour » ; `engine/projetV2/champs.ts` : aller-retour, `d` recalculé, et
  `refusChampsV2`, que `etatDuProjet` appelle avant d'ouvrir, pour les octets et les 16 Mo) : un dessin à image s'écrit au format 2
  et fait l'aller-retour exact ; `image` est « porte » dans `projet-v2.test.ts`. L'image vit **dans** le projet, en `data:` (le plan
  ne range rien à part côté serveur).
- **Tests** : `images.test.ts`, cas `v2/cas-images.ts` (10 références `v2/images-*`), extension d'écriture « étape 12 : images »,
  hostiles `v2-images-*` (bombe de pixels PNG, GIF, WebP ; octets mensongers ; adresses actives ; base64 abîmé ; segments JPEG
  piégés), le `data:` géant et les 16 Mo engendrés dans le test (rien de lourd n'est commis).
- **Reste** : la toile (étape 2, rendu générique par `elementFeuille`) ; brancher `dessinableEnPoints` sur les points, les outils de
  tracé et les booléens (étape 2 ; d'ici là le mode riche n'est atteignable que par l'API) ; *fait à la fusion avec l'étape 1 :* une
  image sous un `<g>` prend son `parent` (`pret.parent`) et l'opacité de son groupe reste au groupe (cas `v2/groupes-degrade-image*`) ; l'image native du PDF (13a) ; *fait à la fusion avec l'étape 1 :* l'affichage des pertes à l'export (`phrasePertes`, dégradés et
  images compris) ; la **vignette** du site PHP refuse
  toujours `<image>` (`vignette_sure`) : un projet à image n'a pas de vignette, rien ne casse ; l'admettre demanderait de relire
  l'en-tête côté serveur (la bombe de pixels), laissé pour plus tard. **Aucune étape ne prévoit encore l'interface d'insertion**
  (« Insérer une image… » au menu Fichier, dépôt d'une image dans l'éditeur, l'« Insérer depuis une adresse » de l'ADR-0036 qui
  accepterait une image) : à ajouter au plan, après l'étape 2.

### Ce que les paquets 2-0 et 2-A ont posé (26 octobre 2026)

Aucun octet écrit ne bouge, la lecture `plat` est inchangée, et **un dessin plat rend sur la toile exactement le DOM d'avant**
(un calque par forme ; `tests/unit/zones/toile.test.ts` compare, pour chaque SVG de référence lu à plat et en riche quand il reste
plat, le rendu de la toile au corps d'avant recopié, en vue normale et en vue « contours »). Ce que les paquets suivants trouvent :

- **Le réglage du modèle** (2-0) : `zones/modele.ts` (`Modele` est dans `typesEditeur.ts`) — `CLE_MODELE = 'svg.modele'`, valeur
  `{ modele: 'plat' | 'riche' }` validée à la lecture (`lireModele` ; tout le reste vaut `plat`), `modeleRetenu(stockage)` (`plat`
  sans stockage), `garderModele`, `optionsModele(m)` (rien pour `plat` : l'appel d'avant à l'identique), `porteModeleRiche(svg)` (le
  marqueur sur la balise `<svg>`), `refusModele(svg, m, 'version' | 'brouillon')` et `phraseModele`. Le menu Édition porte la case
  « Groupes, dégradés, effets (bêta) » (`modele-riche`) seulement quand l'éditeur a un stockage et que l'hôte n'a pas fixé le modèle ;
  le changer vaut pour les SVG lus ensuite (le dessin ouvert reste tel qu'il a été lu, et s'affiche selon `estPlat`).
- **La propriété `modele`** : `EditeurSvg` (`modele?: Modele` ; donnée, elle est fixe et la case disparaît ; absente, le réglage
  gardé, lu une fois à l'ouverture), `EditeurSvg.ouvrir({ modele })` (validée par `verifierOptions` ; **`plat` par défaut et toujours
  fixée** : un réglage gardé dans le stockage de l'hôte ne compte pas, annexe 5 §3), `estEditable(svg, modele?)`, `editable(svg,
  modele)` (une image intégrée s'édite en riche). La page et le site lisent le réglage de leur stockage (`modeleRetenu`) pour ce
  qu'ils lisent eux-mêmes ; la démonstration des intégrateurs passe `modele="plat"`, comme un hôte. **Chaque lecture des hôtes passe le
  modèle** : `zones/lecture.ts` (déjà), `EditeurSvg`, `Application.tsx` (ouverture, fiche, téléchargement, autres formats),
  `Exporter.tsx` (`contexteExport(…, modele)`, `ListeFormats`/`MenuAutresFormats` `modele`, `telechargerSvgPage(…, modele)`),
  `Versions.tsx`, `actionsDessin.ts` (insertions, par `EtatLu.modele`), `InsererAdresse.tsx` (`svgAInserer(r, modele)`),
  `io/texteSvg.ts` (`lettresDuSvg(svg, fontes, modele)`), `embarque.tsx`, `site/projetSite.ts` (`travailDuSvg(…, modele)`) et
  `site/Site.tsx`. `session.ts` ne lit aucun SVG : le brouillon se juge à la reprise.
- **Brouillon et versions v2 ouverts à plat** (annexe 5 §3) : une version au marqueur ne se rouvre pas (« Cette version emploie des
  groupes, des dégradés ou des effets ; activez le modèle riche (« Groupes, dégradés, effets (bêta) », menu Édition) pour l'ouvrir. »),
  elle reste gardée ; le bandeau de reprise de la page dit la même chose d'un brouillon et propose « Activer le modèle riche et
  reprendre » (qui garde le réglage puis ouvre) ; rien n'est effacé. Un projet du site (JSON natif) s'ouvre tel qu'il a été
  enregistré quel que soit le réglage : il ne se relit pas.
- **L'état d'`Interface`** (ADR-0010) : `modele`, `modeleFixe`, `contexte: ContexteEdition | null` (`{ groupe, dans? }`, toujours un
  groupe du dessin du moment : un groupe défait, retiré ou annulé ramène à la racine, `contexteValide`), `deplies: ReadonlySet<string>`
  (vide au départ ; aucun lecteur encore : c'est pour 2-B). **Verbes stables** : `poserModele(m)`, `poserContexte(c)`,
  `entrerGroupe(id)` (le contexte, la sélection vidée, « Dans le groupe « Nuage », 2 éléments. » ; faux pour autre chose qu'un groupe),
  `sortirGroupe()` (le parent devient le contexte, le groupe quitté reste choisi, « Retour à la racine. » ; faux à la racine),
  `deplier(ids, deplie)` (rend le même ensemble quand rien ne change). La sélection admet des **identifiants de groupes**
  (`etatEditeur.ts` : un groupe du dessin reste choisi) ; `boite` est celle du nœud (étape 1).
- **Le contexte, côté moteur** : `engine/edition/contexteEdition.ts` — `contexteValide`, `uniteDans(d, id, contexte)` (l'enfant du
  contexte qui contient un nœud, null hors du contexte), `noeudsDuNiveau(d, contexte)` (les frères), `unitesPrenables(d, contexte)`
  (par rang de feuille : son unité, ou null si elle est hors du contexte, masquée ou verrouillée, elle ou un ancêtre ; mémorisé par
  dessin et par contexte), `cheminDuContexte`. `engine/prise.ts` : **`candidatesDans(d, contexte, x, y, o)`** (un dessin plat :
  `candidates` à l'identique ; un dessin riche : la feuille touchée remonte à son unité, sans doublon, `rang` de la feuille) ;
  `candidates` et `formeSousPoint` sont inchangés (feuilles). `engine/selection.ts` : **`noeudsDansZone(d, contexte, zone, o)`**
  (touchée : une feuille de l'unité prise ; dedans : toutes celles qui peignent). `engine/transformations.ts` : `ciblesAimants(d,
  exclus, contexte = null)` (un dessin riche : les nœuds visibles du niveau, un groupe par sa boîte, hors de ceux dont une feuille est
  choisie). La façade les exporte dans un bloc « étape 2 ».
- **Le rendu générique** : `engine/edition/rendu.ts` — `renduDe(d, fonctions = FONCTIONNALITES)` rend, par les crochets d'écriture du
  catalogue, `feuille(f)` (`{ genre: 'chemin', forme /* peinte : url(#…) */, attributs }` ou `{ genre: 'element', balisage }`),
  `groupe(g)` (`{ attributs }`) et `definitions` (le contenu de `<defs>`, dans l'ordre de l'arbre, masqués compris) ; mémorisé par
  objet (feuille, groupe) et par dessin ; une collision d'empreinte rend le dessin d'un seul tenant avec le recueil de l'écriture.
  `lireAttributs`, `PRECISION_RENDU` (3, celle des chemins de la toile). `ecritureRiche.ts` exporte **`ecrireCorps`** (le corps d'un
  contenu, que le rendu emploie pour `ContexteEcriture.contenu` : une découpe, un masque, une tuile s'y écrivent comme à l'écriture) ;
  aucun octet de l'écriture riche n'a bougé. **Une fonctionnalité nouvelle n'a rien à faire pour la toile** : ce que ses écrivains
  posent (attributs de feuille ou de groupe, définitions, élément) s'y voit (test : une fonctionnalité fictive à filtre et à découpe).
- **La toile** (2-A) : `zones/ToileNoeuds.tsx` — `FormesToile` (le seul appel de `ToileEditeur` : un dessin plat, les `Calque` d'avant ;
  sinon `NoeudsToile`), `NoeudsToile` (`<g class="noeuds-toile">`, `<defs>` du recueil, un `<g data-groupe>` par groupe visible avec
  ses attributs écrits, rien en vue « contours »), un `Noeud` mémorisé par sous-arbre (mêmes objets de feuilles et de groupes),
  `nomReact`/`proprietesReact` (ni `id`, ni `style`, ni `on…`). Une image se rend par son élément écrit (`<g data-id>` qui le porte).
  Hors du contexte : enveloppé dans `<g class="hors-contexte" pointer-events="none">` (une opacité, pas de jeton de couleur) ; le
  chemin du contexte se dessine normalement. `Toile.tsx` : `traitReact` exporté ; la surcouche d'un dessin riche trace les feuilles
  d'un groupe choisi et la boîte du contexte (`contour-groupe` en `--cyan` sur son halo `--panneau`, comme le liseré de survol, et
  `Highlight` en contraste forcé) ; **aucun jeton n'a été ajouté** (`voile-contexte`, `contour-groupe`, `pastille-groupe` restent à
  2-C s'il en veut). `editeur.css` : `.hors-contexte`, `.contour-groupe(-fond)`, l'aperçu de la machine sur `.noeuds-toile`.
- **Les gestes** : `PriseToile.tsx` passe par `candidatesDans` (le clic, le survol, Alt+clic, dont la phrase nomme un groupe) ; le
  liseré de survol d'un groupe suit sa boîte ; `usePrise().viserDans(e, contexte)`. `Gestes.ts` : **le double-clic sur un groupe y
  entre** (et choisit ce qui est sous le pointeur au nouveau niveau) ; les aimants passent le contexte. `GesteZone.ts`, `ZoneToile.tsx`,
  `ClavierZone.ts` : `noeudsDansZone` ; l'aperçu d'un groupe pris montre ses feuilles. `Clavier.ts` : **Échap** défait, dans l'ordre,
  le point, la sélection, puis un niveau de contexte (avant l'outil et la fermeture). Rien d'autre du clavier (Tab, Ctrl+A,
  Entrée, Maj+Entrée), ni menu, ni fil d'Ariane : c'est 2-C. `Calques.tsx` et `CalquesOperations.tsx` n'ont pas bougé (2-B).
- **Tests** : `tests/unit/engine/rendu.test.ts`, `contexte-edition.test.ts`, `tests/unit/zones/toile.test.ts`, `modele.test.ts`, des cas
  dans `creerActions.test.ts` ; e2e `tests/e2e/modele-riche.e2e.ts` (le réglage au menu ; un SVG à groupes et à dégradé en riche :
  clic qui prend le groupe, double-clic qui y entre, enfant déplacé seul, forme hors contexte non prise, Échap, « Terminer » qui garde
  les `<g>` ; axe dans le contexte et après ; un brouillon riche repris à plat).
- **Pour 2-B** (calques en arbre) : lire `ui.deplies` et `ac.deplier` ; une ligne de groupe se choisit par son identifiant (la
  sélection l'admet) ; « entrer » par `ac.entrerGroupe`, le contexte se lit dans `ui.contexte`. **Pour 2-C** : `ac.entrerGroupe`,
  `ac.sortirGroupe`, `ui.contexte` pour le fil d'Ariane ; les phrases de `zones/phrasesGroupes.ts` (`nomDeGroupe`, `groupeDit`,
  `phraseEntreeGroupe`, `PHRASE_RACINE`) sont un minimum à compléter ; Tab, Ctrl+A et `navigation.ts` ne voient pas encore le contexte
  (`noeudsDuNiveau`/`unitesPrenables` sont prêts) ; Entrée sur un groupe, Maj+Entrée, le clic hors du contexte qui en sort, les points
  refusés sur une image (`dessinableEnPoints`) restent à faire ; le double-clic sur une image passe encore en mode points.
  **Pour 4-B** (poignées de dégradé) : la feuille peinte telle que la toile la rend est `renduDe(d).feuille(f)` ; les poignées vont
  dans la surcouche (`surcouche` de `Toile.tsx`), au-dessus de `FormesToile`, et la prise d'une poignée se fait comme celle d'un coin
  (attribut `data-*` lu par `Gestes.ts`) ; le dégradé lui-même se voit déjà, sans rien ajouter. **Pour 7-B** (brouillon des effets) :
  les effets écrits par `effets.ts` (attributs `filter`, définitions `<filter>`) se verront sans toucher la toile ; le mode brouillon
  d'un geste peut se poser sur `<g class="noeuds-toile" data-brouillon>` (un attribut de `NoeudsToile`) et retirer les filtres par
  le CSS, ou passer à `renduDe` une liste sans les effets (`renduDe(d, fonctions)` n'est pas mémorisé).

### Ce que le paquet 2-C a posé (26 octobre 2026)

Aucun octet écrit ne bouge, la lecture `plat` est inchangée, et **en modèle plat rien n'apparaît ni ne change** (Ctrl+G combine,
Ctrl+Maj+G sépare, aucun élément de menu de plus ; e2e « à plat, aucune commande de groupe »). « Modèle riche » veut dire ici : le
réglage à `riche`, **ou un dessin déjà riche** (un projet du site s'ouvre tel qu'il a été enregistré, quel que soit le réglage) —
`groupesActifs(dessin, modele)` dans `zones/commandesGroupes.ts`.

- **Les commandes** (`zones/commandesGroupes.ts`, nouveau) : `groupesActifs`, `groupeSeul`, `aUnGroupe`, `entrerDansGroupe` (entre et
  choisit le premier enfant du niveau, pour que Tab parcoure aussitôt ses frères ; une phrase dit les deux), `sortirDuGroupe` (« Vous
  êtes déjà à la racine du dessin. » à la racine), `remonterVers(m, u, ac, cible)` (fil d'Ariane : le groupe quitté reste choisi),
  `elementsGroupes` (menu), `ctrlG`, `toucheGroupes` (Entrée, Maj+Entrée) et `telechargerAPlat`. **Les verbes** `ac.grouper()` et
  `ac.degrouper()` (`zones/actionsGroupes.ts`, nouveau, branché dans `creerActions.ts` ; déclarés dans `ActionsEditeur`) : grouper les
  racines de la sélection (`unites`), le groupe nouveau choisi ; dégrouper les groupes choisis, les enfants remontés choisis, et dire
  ce que le groupe portait (opacité, découpe, masque, effets) quand il part avec lui. **2-B les reprend tels quels** (mêmes noms).
- **Le menu Édition** (pas de menu Objet : il n'existe pas, ADR-0006 range le rare dans Édition) : Grouper (Ctrl+G), Dégrouper
  (Ctrl+Maj+G), Entrer dans le groupe (Entrée), Sortir du groupe (Maj+Entrée), juste avant Combiner et Séparer, qui **perdent leur
  raccourci en riche** (question 1 de l'annexe 9 tranchée ainsi : aucune touche libre ne vaut sur tous les claviers — AltGr est
  Ctrl+Alt, l'AZERTY prend les chiffres sans Maj ; ils restent au menu et dans la rangée). **La rangée de la sélection**
  (`BarreSelection.tsx`) : boutons Grouper et Dégrouper dans « Formes » (et dans le menu « Plus » de la rangée resserrée), icônes
  `grouper` et `degrouper` (`icones.tsx`). **Le menu Fichier** : « Télécharger le SVG à plat » (`<nom>-a-plat.svg`), la descente
  `CAPACITES_PLAT` écrite par `svgDocument` comme « Télécharger le SVG » écrit un dessin plat, ce qui a été approché dit ; un
  téléchargement, pas un enregistrement. `MenuFichier` prend `nom`. La liste des raccourcis (`AideEditeur.tsx`) dit ceux du dessin ouvert.
- **Le clavier** : `Clavier.ts` (Ctrl+G par `ctrlG` ; Ctrl+A au niveau du contexte), `ClavierToile.ts` (Tab, Maj+Tab, Page
  suivante et précédente au niveau ; `toucheGroupes` avant « Entrée sur une feuille »), `ClavierSelection.ts` (Maj+Page suivante et
  Espace au niveau), `commandesSelection.ts` (« Tout sélectionner » et « Inverser » au niveau, sur un dessin riche seulement). Le
  moteur : `engine/navigation.ts` — **`noeudsChoisissables(d, contexte)`** (dessin plat : la liste d'avant, à l'identique ; riche : les
  frères du contexte, visibles et déverrouillés eux et leurs ancêtres), `formeVoisine(…, contexte = null)`, `formeAuCurseur(…,
  contexte = null)`.
- **Le clic hors du contexte en sort** : `usePrise().sortir(e)` (`PriseToile.tsx`) cherche, du parent du contexte jusqu'à la racine,
  le premier niveau où l'appui prend un nœud, en fait le contexte et le dit (« Retour à la racine. Forme 3 sélectionnée : … ») ;
  `Gestes.ts` ne fait que l'appeler quand rien n'est pris dans le contexte (trois lignes). Un appui sur le vide garde le contexte (le
  cadre de sélection y commence).
- **Le fil d'Ariane** (`zones/FilAriane.tsx`, nouveau, dans la barre d'état de `Cadre.tsx`) : un `nav` « Contexte d'édition », une
  liste de boutons (`Racine › Nuage › Soleil`), le niveau du moment en `aria-current="location"` ; seulement en contexte. Le bouton
  cliqué disparaît toujours : le focus revient à la toile (`focusAuClavier`). CSS dans `editeur.css` (`.fil-ariane`, 40 px au doigt,
  pleine ligne sur un téléphone), aucune couleur nouvelle.
- **Les phrases** : `engine/description.ts` — `nomDeGroupe`, `groupeDit` (déplacés depuis `phrasesGroupes.ts`, qui les réexporte),
  `porteParGroupe`, `detailsGroupe`, `groupeDecrit` (« groupe « Nuage », 3 formes, ombre portée, opacité 50 %, 80 × 40 à 10, 20 »).
  `annonces.ts` : `phraseSelection` dit un groupe (« Groupe « Nuage » sélectionné : 3 formes, 80 × 40 à 10, 20. ») et plusieurs nœuds
  (« 3 éléments sélectionnés. ») ; une sélection de feuilles se dit comme avant ; `phraseBascule` dit « Groupe 3 ajouté ».
  `phrasesGroupes.ts` : `elementsDits`, `phraseGroupeCree` (« Groupe créé : 3 formes. »), `phraseGroupeDefait`, `cheminGroupes`,
  `phraseNiveau`.
- **Les points refusés sur une image** : `ac.poserOutil('points')` (`creerActions.ts`) refuse sur une image choisie seule et dit
  `MSG_POINTS_IMAGE` (double-clic, Entrée, touche A, bouton). Et **une image se prend sur toute sa surface** (`engine/prise.ts`, une
  ligne : elle n'a ni remplissage ni trait, elle ne se prenait qu'au bord de son cadre) ; aucun dessin plat n'a d'image.
- **Jetons** : aucun ajouté. `voile-contexte` : l'estompe reste une opacité (2-A), sans couleur ; `contour-groupe` : le contour du
  groupe en contexte reprend `--cyan` sur `--panneau`, comme le liseré de survol (ADR-0029) ; `pastille-groupe` sert aux pastilles
  des calques (2-B).
- **Tests** : `tests/unit/engine/navigation-contexte.test.ts`, `tests/unit/zones/commandesGroupes.test.ts`, des cas dans
  `creerActions.test.ts` ; e2e `modele-riche.e2e.ts` : le parcours clavier complet (deux formes choisies au clavier, Ctrl+G et sa
  phrase, Entrée, Tab et Maj+Tab entre les enfants, Ctrl+A au niveau, le fil d'Ariane, Maj+Entrée, « Racine » au clavier et le focus
  rendu à la toile, Ctrl+Maj+G, « SVG à plat » téléchargé sans `<g>`), axe en clair, sombre et au doigt, à plat rien de nouveau, le
  double-clic sur une image ; le clic hors du contexte (qui en sort désormais) dans le parcours à la souris.
- **Reste pour 2-D** : les budgets de l'annexe 7 §4 ; `contraste-force.e2e.ts` sur le fil d'Ariane ; firefox et webkit en CI. **Pour
  2-B** : la ligne « Entrée » d'un groupe dans la grille peut appeler `entrerDansGroupe` ; « Tout » et « Inverser » des calques
  (`Calques.tsx`) voient encore toutes les feuilles : `noeudsChoisissables` est prêt.

### Ce que le paquet 2-B a posé (26 octobre 2026)

Aucun octet écrit ne bouge, la lecture `plat` est inchangée, et **un dessin plat garde la liste des calques d'avant au nœud près**
(`tests/unit/zones/calques.test.ts` : l'empreinte du DOM rendu du panneau, prise sur le code d'avant l'arbre, pour chaque SVG de
référence plat — sans sélection, avec, en contexte Cricut —, un dessin de 300 formes fenêtré et les deux états vides ;
`tests/fixtures/calques/plat.sha256.json`, réécrit seulement par `ACTUALISER_REFERENCES=1`). Ce que les paquets suivants trouvent :

- **Le partage** : `Calques.tsx` garde son corps ; un dessin riche (`!estPlat`) y remplace la liste `<ol>` par `ArbreCalques`, dans le
  même `<aside>` (la barre « Tout / Aucun / Inverser / Tout afficher », « Par couleur » et l'état vide sont communs ; « Tout afficher »
  montre aussi les groupes masqués). Le dessin qui redevient plat (son dernier groupe défait) repasse à la liste, le focus revient au
  panneau. `Fenetre.ts` : `useFenetre<L>` est générique (la grille est un `div`), rien d'autre.
- **Cricut** (ADR-0028), décision : les deux groupes « À couper / À écrire » restent la vue première (ce qu'on règle feuille par
  feuille avant d'exporter) ; **pour un dessin riche seulement**, l'arbre vient dessous, replié au départ (les groupes de la racine
  seuls), pour garder la structure atteignable (masquer, verrouiller, déplacer un groupe) sans doubler la liste. Un dessin plat en
  Cricut n'a toujours que les deux groupes (garde ci-dessus).
- **Le calcul, pur** : `zones/lignesCalques.ts` — `lignesVisibles(d, deplies)` (les nœuds dont tous les ancêtres sont dépliés, du
  premier plan au fond, avec niveau, rang parmi les frères, parent ; mémorisé par dessin et par ensemble déplié), `enfantsDe`,
  `parentDe`, `groupeCommun(d, ids)` (le contexte qu'un choix amène), `destinations(d, ids)` (« Déplacer vers… » : la racine puis
  chaque groupe par son chemin « Ciel › Nuage », refusés : les groupes déplacés, leurs descendants, le parent commun), `etendue`.
  `zones/deplacerCalques.ts` — `ciblesDe` (la sélection si la ligne en est, ses unités ; sinon la ligne), `changerDeRang`
  (Ctrl+Maj+Haut/Bas, `ordonnerNoeuds`), `sortirDuGroupe` (Ctrl+Maj+Gauche : frère du parent, juste sous lui ; s'il se vide, à sa
  place), `entrerAuDessus` (Ctrl+Maj+Droite : dans le frère juste au-dessus s'il est un groupe, tout en bas ; entrer puis sortir rend
  le dessin d'avant), `deplacerVers` (menu et dépôt : au premier plan du groupe, ou sous une feuille ; jamais en lui-même),
  `renommerGroupe` ; chacun rend `{ dessin, phrase, deplier }` et passe par les opérations du moteur (`deplacerDans`,
  `ordonnerNoeuds`, `renommer`). `zones/phrasesCalques.ts` : les phrases (plier, déplier, `*`, déplacer, monter, sortir, renommer,
  refus), tournées autour du verbe pour ne pas accorder un participe au genre d'une forme.
- **La grille** : `zones/ArbreCalques.tsx` — un `role="treegrid"` (`aria-multiselectable`, `aria-rowcount` des lignes visibles),
  des lignes `role="row"` (`aria-level`, `aria-posinset`, `aria-setsize`, `aria-rowindex`, `aria-expanded` pour un groupe,
  `aria-selected`, `aria-current` pour le groupe du contexte, nom accessible : celui de la liste plate pour une feuille, « Groupe
  « Nuage », 3 éléments[, verrouillé][, masqué] » pour un groupe), trois cellules : le nom (chevron de groupe, échantillon de feuille,
  nombre d'enfants), la visibilité, le verrou. **Tabindex itinérant** : un seul arrêt dans la grille (la ligne active, ou l'un de ses
  deux boutons), Tab en sort. Fenêtrée au-delà de 150 lignes visibles avec deux cales `data-cale`, la ligne active épinglée
  (`segmentsFenetre`) ; lignes mémorisées (`LigneArbreCalque`), gestes délégués à la grille (`zones/gestesArbreCalques.ts` :
  `verbesArbre`, `gestesSouris`, `gesteClavier`, `gestesDepot`). Le retrait par niveau est `calc(var(--esp-l) * n)` ; **aucun jeton
  ajouté** (le choix, le focus et le dépôt reprennent `--cyan` et `repli-cyan-18`, `Highlight` en contraste forcé ; 40 px au doigt).
- **Le clavier** (annexe 6 §1) : Haut/Bas (Maj : étendre), Droite (déplie ; sur un groupe déplié, premier enfant ; sur une feuille,
  ses boutons), Gauche (replie, sinon parent ; sur un bouton, cellule précédente puis la ligne), Haut/Bas sur un bouton gardent la
  colonne, Origine/Fin, Page préc./suiv., Entrée (groupe : `ac.entrerGroupe` et il se déplie ; feuille : la choisit), Espace
  (ajoute ou retire), F2 (renommer un groupe en place, Entrée valide, Échap abandonne ; une feuille : dit pourquoi non), `*` (déplie
  les groupes frères), Maj+F10 ou la touche Menu (ouvre « Déplacer vers… », la ligne choisie d'abord), Ctrl+Maj+flèches. Le reste
  (Suppr, Échap, Ctrl+A…) descend aux raccourcis de l'éditeur. Souris : clic (Maj : étendue, Ctrl : bascule), double-clic sur un
  groupe y entre, chevron, glisser-déposer d'une ligne (sur un groupe : dedans ; sur une feuille : juste sous elle). « Déplacer
  vers… » est un `MenuDeroulant` au-dessus de la grille, au clavier comme au doigt.
- **Le contexte suit le choix fait dans l'arbre** : choisir une ligne pose le contexte d'édition au groupe qui contient tout le choix
  (`groupeCommun`, la racine sinon), par `ac.poserContexte`, sans phrase de plus ; une forme choisie sur la toile déplie ses groupes
  et la liste défile jusqu'à elle.
- **Mesure** (méthode ADR-0008 : Chromium, `TaskDuration` du fil principal, médiane de trois, plat et riche entrelacés ; 2 000
  feuilles, en 200 groupes de 10 pour le riche, à plat pour le témoin) : ouvrir 469 ms (plat 429, × 1,09) ; Ctrl+A 179 ms (plat
  208) ; DOM de la grille repliée 698 nœuds pour 200 lignes (36 dessinées ; la liste plate : 559 nœuds), du panneau 1 175 (plat
  1 030) ; tout déplier (`*`, 200 groupes, 2 200 lignes) 95 à 123 ms, DOM déplié 661 ; Fin 46 ms, Origine 70 ms, choisir une
  ligne 169 ms, Ctrl+Maj+Bas 97 ms, replier 88 ms. **Hors budget** (annexe 7 §4, à trancher par 2-D) : la grille dépasse 400
  nœuds (≈ 19 nœuds par ligne : trois boutons à icône SVG ; la liste plate, 559, ne tient pas non plus ce budget) ; rien n'a été
  optimisé avant d'être mesuré.
- **Tests** : `tests/unit/zones/calques.test.ts` (la garde plate, la grille rendue, fenêtrage, Cricut), `arbre-calques.test.ts`
  (lignes, destinations, contexte, déplacements et phrases), `rendreCalques.ts` (le panneau rendu hors navigateur) ; e2e
  `tests/e2e/calques-arbre.e2e.ts` (le parcours sans souris : déplier, replier, choisir, renommer, « Déplacer vers… », Ctrl+Maj+flèches,
  entrer, Tab qui sort, « Terminer » ; les boutons d'une ligne ; axe replié, déplié, en contexte et menu ouvert, en clair, sombre et
  au doigt avec cibles de 40 px ; le glisser-déposer ; un dessin plat sans grille).
- **Reste** : les pastilles des groupes (« découpé », « ombre portée », « opacité 50 % ») et leur jeton `pastille-groupe` (2-C ou
  l'étape 8) ; un menu contextuel complet (Maj+F10 n'ouvre que « Déplacer vers… ») ; Suppr dans la grille supprime la sélection, pas
  la ligne active ; « Tout / Inverser » de la barre prennent encore les feuilles (Ctrl+A de 2-C voit le contexte) ; une revue NVDA /
  VoiceOver de l'arbre (condition de la bascule) ; le budget DOM ci-dessus.

### Ce que l'étape 5 a posé (26 octobre 2026)

- **Lecture** (`edition/fonctions/decoupes.ts`, une ligne de `catalogue.ts` entre les dégradés et les images ; `prises: ['decoupe']`,
  crochets `groupe` et `feuille`) : un `clip-path` (attribut, `style`, feuille `<style>` : la cascade le lit déjà) vers un
  `<clipPath>` devient `Groupe.decoupe`. Son contenu est de la **géométrie seule**, dans le repère du plan : `feuilleDeDecoupe` fixe la
  peinture (noir plein, sans trait, opacité 1) et ne garde que le tracé, la règle (`clip-rule`), la visibilité, le verrou et le groupe.
  Résolus à la lecture : `clipPathUnits="objectBoundingBox"` (boîte de la feuille, d'une image par son cadre, ou des descendants d'un
  groupe par `boiteDescendants` — formes, groupes, `<use>` d'une forme ; texte, images et symboles n'y comptent pas), le `transform`
  du `<clipPath>` **après** les unités de boîte (l'ordre de Chromium : `transform · boîte`), un `<use>` déplié s'il vise une forme ou du
  texte, `clip-rule` (style en ligne, attribut, puis hérité du `<clipPath>` et de ses ancêtres ; `clip-rule` n'est pas dans la cascade
  de `cascade.ts`, une règle de feuille `<style>` qui le poserait n'est donc pas lue), l'imbrication (le `clip-path` du `<clipPath>`
  lui-même devient un groupe du contenu qui porte la découpe intérieure ; un enfant à `clip-path`, un groupe à lui). Une **feuille** à
  `clip-path` (une image comprise) est enveloppée dans un groupe qui porte la découpe. Ce qu'un navigateur ignore est ignoré et dit
  (`MSG_DECOUPES` : référence absente ou vers autre chose qu'un `<clipPath>`, `<g>`/`<image>`/`<use>` d'autre chose qu'une forme dans un
  `<clipPath>`, boîte plate en unités de boîte : contenu vide, rien n'est dessiné) ; le reste est refusé en le nommant
  (`REFUS_DECOUPES` : forme CSS `circle()`…, renvoi extérieur, cycle — la pile des `<clipPath>` en cours —, imbrication au-delà de
  `PROFONDEUR_DEFS_MAX`, plus de `NOEUDS_DEFS_MAX` feuilles et groupes dans toutes les découpes lues, transformation illisible, découpe
  posée sur un `<use>`, un `<symbol>` ou le SVG entier). **Numérotation** (I1, un seul espace de numéros) : les feuilles d'une découpe
  sont lues par la marche, numérotées à la suite, puis quittent `formes` en y laissant une **place vide** (un tracé sans commande, que
  `lecture.ts` retire comme toute forme vide) ; les groupes d'un contenu **réservent** leur numéro dans la table de la lecture par une
  place sans feuille (que `normaliser` retire), en sautant celui du groupe que `lireGroupe` est en train de poser (le crochet `groupe`
  est appelé avant qu'il le range). Aucun fichier de la lecture n'a changé.
- **Écriture** (`ecriture.attributsGroupe`) : `clip-path="url(#ed-c-…)"` au rang `RANG_GROUPE.decoupe` (après `opacity`, avant
  `data-ed-nom`) ; `<clipPath id="ed-c-<14 hex>">` dans `<defs>`, sans autre attribut (toujours en unités du plan), des `<path d>` avec
  au plus `clip-rule="evenodd"` et un `clip-path` : une feuille d'un contenu sous des groupes découpés cite **l'intersection** de leurs
  découpes, écrite comme la plus intérieure dont chaque feuille est rognée par les autres (`<clipPath>` n'admet pas `<g>`, annexe 2
  §5) ; la relecture en fait une découpe par feuille, qui se réécrit en ce même texte (point fixe vérifié). Dédoublonnée par empreinte ;
  mémorisée par découpe et par précision **avec ses dépendances**, reposées d'abord dans chaque recueil (sans cela, une deuxième écriture
  du même dessin — celle du projet, par exemple — citait une découpe intérieure avant de l'écrire : trouvé par l'aller-retour du projet).
- **Transformation** (`transformation.groupe`, règle de la fermeture) : la découpe suit son groupe ; une feuille seule déplacée bouge
  sous une découpe immobile. **Boîte visuelle** (`etendue.groupe`) : l'intersection avec la boîte de la découpe (`boiteDecoupe`, union
  de ses feuilles visibles) ; vide, une boîte nulle.
- **Opérations** (`edition/decoupes.ts`, bloc « étape 5 » de la façade) : `creerDecoupe(d, ids)` (parmi les éléments visibles et
  déverrouillés, le plus haut doit être une feuille à tracé, ni groupe ni image ; sa géométrie devient la découpe, les autres sont
  groupés par `grouper`) ; `liberer(d, id)` (le groupe reste ; les feuilles de la découpe y reviennent au premier plan, **sans fond et
  d'un trait noir de 1** : sans peinture, la forme rendue serait invisible et insaisissable — choix à confirmer à l'étape 8) ;
  `MSG_DECOUPE` (phrases au vouvoiement). `renumeroterContenus` (`arbre.ts`, découpes **et masques**) branché dans `dupliquerNoeuds` et
  la copie de `coller`/`inserer` (`groupes.ts`) : une copie de groupe découpé ne reprend aucun identifiant (annexe 3 §2).
- **Descente** (`engine/descente/decoupes.ts`, dans `REGLES_DESCENTE` avant les groupes) : le **remplissage** est rogné exactement par
  l'intersection booléenne de sa région avec celles des découpes de tous ses ancêtres (`polygon-clipping`, régions de `booleens.ts`,
  courbes rebâties si l'un des deux en avait) ; une feuille déjà toute dedans (débord sous une aire de l'ordre de la tolérance) ne change
  pas d'un octet ; un **trait** n'est pas rogné : sa boîte toute dedans, il reste ; sans rien en commun, il part ; à cheval, il est gardé
  entier, en une feuille à part, et c'est dit (`MSG_DESCENTE_DECOUPES`) ; une découpe vide efface ce qu'elle rogne ; `natif` garde tout.
- **Projet JSON** (format 2) : `model/projetV2/decoupe.ts` (`lireDecoupeProjet` : feuilles `id d regle visible verrouille parent?`,
  groupes d'une découpe découpée, bornes, parents présents) et `engine/projetV2/decoupe.ts` (aller-retour, peinture refixée), une ligne de
  `CHAMPS_GROUPE_V2` et d'`ALLERS_RETOURS_GROUPE` (le premier champ de groupe v2 : `ChampsGroupeV2` devient une interface) ;
  `OutilsProjet.chemin` (un tracé validé par `cheminProjetValide`) ; `ecrireCheminProjet`/`lireCheminProjet` déplacés dans
  `engine/projetV2/chemin.ts` (réexportés par `engine/projet.ts` : sans cela, un cycle d'import). Un identifiant repris dans une découpe
  est refusé à l'ouverture (`verifierDessin`, I1). `projet-v2.test.ts` classe désormais les champs de `Groupe` (`decoupe` : « porte »).
- **Tests** : `v2/cas-decoupes.ts` (11 lectures, 6 opérations, 3 fichiers du corpus `inkscape-decoupe`, `figma-cadre-decoupe`,
  `illustrator-degrade-decoupe` — le reste de l'étape 3 —, 20 références relues), `decoupes.test.ts` (lecture plate refusée avec la phrase
  d'aujourd'hui, chemin de la page, `violationsEcriture`/`violationsNettoyage` sur chaque cas, numérotation, pertes, refus, fermeture,
  boîte, copies, créer, libérer, écriture répétée identique), `descente-decoupes.test.ts`, neuf hostiles `v2-decoupes-*` (cycles, `<use>`
  vers son `<clipPath>`, bombe d'imbrication, bombe de références, renvoi extérieur, forme CSS, découpe sur un `<use>`, transformation
  illisible) et `securite/decoupes-hostiles.test.ts`, l'extension d'écriture « étape 5 : decoupes » (avant celle des groupes, qui refuse
  tout autre attribut d'un `<g>`), l'assertion d'`images.test.ts` sur une image à `clip-path` (elle s'enveloppe désormais).
- **Écarts et reste** : aucun type ni crochet n'a manqué (`types.ts`, `fonctionnalites.ts` intacts) ; un `<text>` lu en lettres
  (`OptionsLecture.polices`) qui porte un `clip-path` **perd sa découpe sans le dire** en mode riche (ses lettres ne passent pas par le
  crochet `feuille`) : à régler avec 13c, ou par un crochet de plus ; `clip-rule` posé par une feuille `<style>` n'est pas lu ;
  `boiteDescendants` ignore texte, images et symboles ; la vignette du site PHP (`vignette_sure`) refuse toujours `url(` hors des
  dégradés : un projet à découpe n'a pas de vignette (rien ne casse) ; la descente exacte d'un **trait** attend l'outil d'expansion de
  trait (annexe 5 §5) ; le PDF natif (`W n`) est à 13a.
- **Pour l'étape 6 (masques)** : la lecture d'un contenu de définition (pile des actifs, table locale, réservation des numéros, places
  vides, budget `NOEUDS_DEFS_MAX`) vit dans `fonctions/decoupes.ts` ; à la deuxième utilisation, la sortir dans un module commun
  (`edition/contenus.ts`) plutôt que la recopier ; `renumeroterContenus`, `parcourirContenus`, `verifierDessin` et `poidsDessin` portent
  déjà le masque ; un masque s'écrit avec sa peinture (`ContexteEcriture.contenu`), pas en géométrie seule ; la phrase « découpe posée
  sur un `<use>` » a son pendant à écrire pour `mask`.
- **Pour l'étape 8 (interface)** : rien à ajouter à la toile (le rendu générique de l'étape 2 passe par `attributsGroupe` et le recueil) ;
  le contexte `decoupe` édite `{ vb, ...groupe.decoupe.contenu }` avec les outils ordinaires, mais une feuille de découpe doit rester
  canonique (`feuilleDeDecoupe`) : refixer la peinture au retour du contexte ; commandes « Créer une découpe » / « Libérer la découpe »
  (`creerDecoupe`, `liberer`, phrases `MSG_DECOUPE`), confirmation de `degrouper` sur un groupe découpé (`porteurs` le dit déjà), jeton
  `contour-decoupe`.

### Ce que le paquet 7-A a posé (26 octobre 2026)

- **`edition/effets.ts`** (pur) : `NOEUDS_A_EFFET_MAX` (2 000), `ecartMax` (`max(l, h) / 4` du plan), `decalageMax` (`max(l, h)`),
  `ecartsSous` (la covariance du noyau sous une matrice : exacte quand l'ellipse reste dans les axes — échelle par axe, quart de tour,
  similitude d'un flou isotrope —, l'écart moyen `√(sx·sy·|det|)` sinon), `transformerEffets` (le flou suit la matrice, l'ombre prend le
  facteur sans tourner ; le même objet sous une translation), `margeEffets` (3 écarts + décalage), `effetsEcrits` (les valeurs telles
  que la relecture les rendra), `regionEcrite` (arrondie vers l'extérieur), `definitionFiltre` (les formes exactes de l'annexe 4 B §2).
- **`edition/fonctions/effets.ts`** et une ligne de `catalogue.ts` (après les dégradés) : `prises: ['filtre']`, `lecture.feuille` et
  `.groupe`. Le filtre se lit en **évaluant** ses primitives (`in`, `in2`, `result` comme un navigateur : entrée absente = résultat
  précédent, nom inconnu = idem, `BackgroundImage`/`FillPaint`… refusés), puis l'image finale se **reconnaît** : flou du graphique ;
  ombre (aplat composé `in` dans une silhouette d'alpha portant au plus un flou et un décalage, dans n'importe quel ordre) fusionnée
  sous le graphique, ou sous le graphique flouté ; `feDropShadow` ; `feComposite operator="over"` vaut une fusion. Toute autre
  primitive : « un filtre (feTurbulence) » ; toute autre combinaison : « un filtre qui n'est ni un flou ni une ombre portée ». Unités
  de primitive en boîte résolues (feuille : sa boîte locale ; groupe : refusé), région d'origine confrontée à l'effet (feuille ; groupe
  en unités du plan, à mesure que ses feuilles se lisent) et dite si elle rognait, `color-interpolation-filters` hérité (le RVB linéaire
  d'un flou du graphique dit), écart borné à `ECART_MAX`, décalage borné au plus grand côté du plan, nombres illisibles à leur valeur
  par défaut, 2 000 nœuds à effet : chacun dit (`MSG_EFFETS`, `msgEcartBorne`, `msgDecalageBorne`). Refus nommés (`REFUS_EFFETS`) :
  filtre CSS (`blur()`…), chaîne de filtres, renvoi extérieur, héritage `href` d'un filtre, plus de 16 primitives ou nœuds de fusion,
  filtre vide, région vide, unités de boîte sur un groupe. Une référence vers rien : la forme est dessinée sans, et c'est dit.
- **Écriture** : `filter="url(#ed-f-…)"` au rang `filtre` (feuille, image, groupe), le `<filter>` au recueil. La région est la boîte
  visuelle **telle qu'elle s'écrit** (coordonnées arrondies à la précision, épaisseur et limite de pointe au millième, cadre et matrice
  écrits d'une image ; pour un groupe, l'union de ses enfants visibles, leurs effets compris), élargie de la marge des effets écrits,
  arrondie vers l'extérieur : la relecture redonne la même région à l'octet (point fixe vérifié sur 300 dessins tirés au hasard, deux
  précisions, graine imprimée). Une image qui écrit un `transform` reçoit ses effets **dans son repère** (un filtre agit dans le repère
  de l'élément qui le cite).
- **Transformation** (`transformation.feuille`/`.groupe`) et **étendue** (`etendue.feuille`/`.groupe`, d'où `boiteVisuelle` et
  `ajusterPlan`).
- **Descente** (`engine/descente/effets.ts`, une ligne de `REGLES_DESCENTE` avant les groupes) : abandonnés, feuilles et groupes, dits
  au singulier ou au pluriel (`perteEffets`) ; ce qui ne s'exporte pas part sans phrase ; `raster` descend comme `approche` (le rendu
  en image par `io` est à l'étape 13).
- **Projet JSON** : `model/projetV2/effets.ts` (`lireEffetsProjet` : objet non vide, flou avec un écart positif, ombre `#rrggbb`, bornes)
  et `engine/projetV2/effets.ts` ; une ligne de chaque cadre, **pour les formes et pour les groupes** (`CHAMPS_GROUPE_V2`,
  `ALLERS_RETOURS_GROUPE` : les premières lignes de groupe) ; `effets` est « porte » : plus aucun champ du modèle n'attend son étape.
- **Nuancier** (ADR-0037), décision : une ombre portée apporte sa couleur, sur la silhouette de la forme (la surface de son fond et
  de son trait), à l'opacité de la forme par celle de l'ombre ; un flou n'apporte rien. Les effets d'un groupe n'y entrent pas (le
  nuancier lit les feuilles).
- **Tests** : `effets.test.ts`, `descente-effets.test.ts`, `v2/cas-effets.ts` (6 entrées `v2/effets-*`, 6 transformations, le corpus
  `inkscape-flou`), 9 hostiles `v2-effets-*` joués en riche par `securite/effets-hostiles.test.ts` (plus cent mille primitives et
  2 003 formes engendrées dans le test), l'extension d'écriture « étape 7 : effets » (inscrite **avant** celle des groupes, qui refuse
  tout autre attribut sur un `<g>`), les effets dans `projet-v2.test.ts`.
- **Mesure** (méthode de l'ADR-0008, médiane de 31 après 5 tours, machine de l'agent) : 200 formes à effets, lecture 5 à 7 ms (2 à
  3 ms sans les filtres), écriture d'un dessin neuf 6 à 8 ms.
- **Touché hors des crochets, et pourquoi** : (1) `fonctionnalites.ts` : `ContexteEcriture.courant()` (le contenu en cours
  d'écriture : `attributsGroupe` ne reçoit que le groupe, or la région d'un groupe se mesure sur ses enfants ; les masques de l'étape 6
  en auront besoin aussi) — **tout autre constructeur d'un `ContexteEcriture` (le rendu générique de la toile, étape 2) doit le
  fournir** : `courant: () => <le contenu qu'il rend>` ; (2) `ecritureRiche.ts` : `courant` tenu le temps d'un contenu imbriqué, et
  l'élément entier d'une feuille (une image) reçoit lui aussi les attributs v2 de la feuille avant de se fermer ; (3) `heritage.ts`
  (`refusHorsFeuille`), `parcours.ts`, `lecture.ts` : une prise (filtre, découpe, masque) posée sur un élément qu'aucune
  fonctionnalité ne complète (clone `<use>`, texte lu en lettres, symbole, racine, `<g>` d'une liste sans groupes) reste refusée, en
  disant où elle est posée — sans cela, le mode riche l'aurait perdue en silence ; le mode plat garde sa phrase, à l'octet ;
  (4) `util/assainirSvg.ts` : le fuzzing (corpus déplacé par les nouveaux hostiles) a trouvé deux trous de `nettoyerCss` — un niveau
  d'échappement qui en révèle un autre (`ur\\6c(`), un échappement vers un caractère de contrôle que l'émission retire et qui recolle
  `url(` — : résolution à chaque passe, contrôles retirés à la résolution ; deux entrées dans `tests/fixtures/regressions/` ;
  (5) `model/projetV2/groupes.ts` : un transtypage (le type des champs de groupe n'est plus vide).
- **Écarts et décisions** : un filtre `feDropShadow` suivi d'un flou du graphique fusionné (annexe 4 B §3, cas iv) n'est **pas** pris :
  il laisse le graphique net sous le flou, ce que `Effets` ne représente pas (refusé, nommé) ; l'héritage `href` d'un filtre est refusé
  (les navigateurs ne le suivent pas tous) ; la région d'un groupe en unités de boîte n'est pas confrontée (la boîte du groupe n'est
  connue qu'après ses feuilles) ; une transformation qui déforme un flou anisotrope prend l'écart moyen **sans le dire** (le crochet de
  transformation n'a pas de canal de message ; à l'interface de l'étape 8 de le dire) ; la définition du filtre d'un groupe se dépose
  après celles de ses enfants (le groupe s'écrit après eux, pour ne jamais poser de définition orpheline) ; sur un texte vivant, le
  `filter` s'écrit après ses `data-ed-*` (l'écriture plate les pose ; l'annexe 2 §3 voulait l'inverse, sans effet sur le rendu).
- **Reste** : 7-B (toile : `data-brouillon`, au-delà de 20 nœuds à effet rendus au repos, mesures de l'annexe 7 §4) ; l'interface
  (étape 8 : section Effets, `poserEffets`, la phrase d'une approximation à la transformation) ; le PDF rastérisé (13a) ; les
  reconnaisseurs d'idiomes Figma, Sketch, Illustrator (13b) ; la vignette du site PHP refuse `url(#ed-f-…)` : un projet à effets n'a pas
  de vignette (rien ne casse), l'admettre demanderait la liste des primitives dans `vignette_sure`.

### Ce que l'étape 6 a posé (26 octobre 2026, moteur)

- **`edition/contenus.ts`** (le conseil de l'étape 5, au deuxième emploi) : la lecture d'un contenu de définition, partagée par les
  découpes et les masques — `etatContenus` (la pile des définitions actives, commune : un `<clipPath>` dans un `<mask>` dans un
  `<clipPath>` compte trois niveaux de `PROFONDEUR_DEFS_MAX`, et y revenir est un cycle ; les tables locales ; le groupe en attente ;
  le budget `NOEUDS_DEFS_MAX`, **commun** à toutes les définitions, la phrase étant celle du genre qui le franchit), `reserverGroupe`,
  `placeVide`, `lireContenu` (les feuilles quittent `formes` en y laissant leur place ; un `<g>` du contenu, que le lecteur des groupes
  range dans la table de la lecture, rejoint la table locale en y laissant une place ; les groupes sans feuille partent),
  `boiteDescendants` (elle compte désormais une `<image>` par son cadre : un groupe qui ne contient qu'une image n'est plus une « boîte
  plate » — sans effet sur les références des découpes), `boiteFeuille`, `ancetresDe`, `intersectionBoites`. Les découpes y passent
  sans qu'un octet de leurs références bouge (vérifié avant tout le reste).
- **Lecture** (`edition/fonctions/masques.ts`, une ligne de `catalogue.ts` entre les découpes et les effets ; `prises: ['masque']`,
  crochets `feuille` et `groupe`) : un `mask` (attribut, `style`, feuille `<style>`) vers un `<mask>` devient `Groupe.masque`. Son contenu
  est un contenu **peint**, lu par la marche (couleurs, opacités, dégradés par leur fonctionnalité — unités de boîte comprises —,
  images, `<use>`, `<g>` avec leur opacité et leur nom, effets, découpes et masques imbriqués), dans le repère de l'élément masqué
  (`maskContentUnits="objectBoundingBox"` résolu par la boîte de la feuille ou des descendants du groupe) ; il hérite de l'endroit où
  le `<mask>` est écrit (le `fill="white"` de Figma et de Sketch). `mask-type` (règle ou style, puis attribut) donne `luminance` ou
  `alpha`. La région (`maskUnits`, défaut `objectBoundingBox`, `x y width height` à -10 % / 120 % par défaut, nombres ou pourcentages ;
  en unités du plan, un pourcentage est une part du plan de travail) est rangée en boîte du plan : sous une rotation ou une
  inclinaison, le rectangle qui enferme ses coins (dit seulement si le contenu dépasse la vraie région, `MSG_MASQUES.regionTournee`).
  Une feuille masquée (une image comprise) s'enveloppe dans un groupe ; avec une découpe aussi, le groupe du masque est dans celui de la
  découpe. Ce qu'un navigateur ignore est ignoré et dit (`MSG_MASQUES` : référence absente ou vers autre chose qu'un `<mask>`,
  `transform` posé sur un `<mask>` — SVG ne le transforme pas —, découpe, masque, filtre ou opacité posés sur le `<mask>` lui-même, un
  masque posé dans une découpe, une unité qui ne se calcule pas, boîte plate en unités de boîte : rien n'est dessiné). Refus nommés
  (`REFUS_MASQUES`) : masque CSS (`mask-image`, `mask-mode`, `mask-composite`, `mask-border`, leurs formes `-webkit-`, ou une valeur
  `mask` qui n'est pas un seul `url(#…)` : plusieurs couches, une position, un dégradé CSS), sur l'élément ou un de ses ancêtres ;
  renvoi extérieur (la phrase des découpes) ; cycle ; imbrication ; budget (la lecture s'arrête dès qu'il est franchi : un `<mask>` de
  100 000 formes est refusé en 0,4 s, l'analyse XML comprise) ; région démesurée (la phrase des coordonnées). Un masque posé sur un
  `<use>`, un `<symbol>`, un texte lu en lettres ou la racine est refusé par la marche en disant où (`refusHorsFeuille` de l'étape 7 :
  le pendant de la phrase « découpe posée sur un `<use>` » existait donc déjà). Le groupe en cours de pose prend sa place dans la table
  **avant** la lecture du contenu (les `<g>` du masque prennent les numéros suivants). Aucun fichier de la lecture n'a changé.
- **Écriture** (`ecriture.attributsGroupe`) : `mask="url(#ed-m-…)"` au rang `RANG_GROUPE.masque` ; `<mask id="ed-m-<14 hex>"
  maskUnits="userSpaceOnUse" x y width height [style="mask-type:alpha"]>` puis le contenu écrit **comme le dessin**
  (`ContexteEcriture.contenu` : ses dégradés, découpes, masques et filtres se déposent avant le `<mask>` qui les cite). Dédoublonné par
  empreinte (deux groupes au même masque, une définition) ; **pas de mémoire par masque** : le contenu dépose ses définitions dans le
  recueil de l'écriture en cours, une mémoire devrait les reposer dans chaque recueil (le piège trouvé à l'étape 5) ; le contenu
  d'une feuille passe par le cache de l'écriture plate. Point fixe vérifié sur chaque cas.
- **Transformation** : le crochet `transformation.groupe` reçoit désormais un troisième argument, `outils` (`OutilsTransformation` :
  `feuille(f)` et `groupe(g)`, transformés par la même matrice et **toutes** les fonctionnalités) — voir « Touché hors des crochets ».
  Le masque suit son groupe dans la fermeture : son contenu par `outils` (un dégradé, une image, un flou du contenu suivent), sa région
  enfermée dans ses coins transformés ; une feuille seule déplacée bouge sous un masque immobile. **Boîte visuelle** (`etendue.groupe`) :
  l'intersection avec la région.
- **Opérations** (`edition/masques.ts`, bloc « étape 6 » de la façade) : `creerMasque(d, ids)` (parmi les éléments visibles et
  déverrouillés, le plus haut — une forme, une image ou un groupe entier, ses identifiants gardés — devient le contenu, en luminance,
  peint comme il l'était ; les autres sont groupés par `grouper` **avant** que le dessus parte, pour que le numéro du groupe nouveau ne
  reprenne pas celui d'un groupe du contenu ; la région couvre le masque et ce qu'il masque, boîtes visuelles comprises ; un dessus qui
  ne laisse rien voir est refusé) ; `libererMasque(d, id)` (le contenu revient au premier plan du groupe, peint, ses groupes avec lui) ;
  `inverserMasque(d, id)` (luminance : le contenu aux couleurs complémentaires, dégradés et ombres compris, sur un fond blanc qui couvre
  la région — exact quand la luminance se calcule sur les composantes sRVB ; inverser deux fois redonne le masque à l'octet, le fond se
  reconnaissant même tourné ; alpha : le contenu en noir à ses opacités sur le fond blanc, en luminance ; une image ou une couleur qui
  n'est pas un code `#rrggbb` empêchent l'inversion, dit) ; `MSG_MASQUE` (phrases au vouvoiement). `renumeroterContenus` (étape 5)
  portait déjà le masque : une copie de groupe masqué ne reprend aucun identifiant, contenus imbriqués compris (vérifié).
- **Descente** (`engine/descente/masques.ts`, dans `REGLES_DESCENTE` après les découpes, avant les effets et les groupes) : le masque part,
  ce qu'il masquait est exporté entier, et c'est dit (`MSG_DESCENTE_MASQUES`) pour un groupe qui s'exporte ; `natif` garde tout ;
  `raster` descend comme `approche`. Un SVG à masques lu en riche puis descendu redonne la lecture plate du même SVG sans `mask`.
- **Projet JSON** (format 2) : `model/projetV2/masque.ts` (`lireMasqueProjet` : type, région, formes et groupes **entiers**, validés
  comme ceux du dessin par deux gardes de plus, `OutilsProjet.forme` et `OutilsProjet.groupes` ; imbrication bornée à 8, 20 000 nœuds,
  identifiants uniques dans le masque, parents présents) et `engine/projetV2/masque.ts` (aller-retour exact ; `formesDesMasques`), une
  ligne de `CHAMPS_GROUPE_V2` et d'`ALLERS_RETOURS_GROUPE` ; les octets d'une image du contenu sont vérifiés à l'ouverture comme ceux du
  dessin (`refusChampsV2(formes, groupes)`). `masque` est « porte » dans `projet-v2.test.ts` : plus aucun champ de groupe n'attend.
- **Nuancier** : il lit `dessin.formes`, donc ne compte pas les couleurs d'un contenu de masque (un masque est de la luminance, pas une
  palette ; annexe 3 §2) ; les listes de couleurs non plus. Vérifié par un test.
- **Tests** : `v2/cas-masques.ts` (11 lectures, 9 opérations, 2 fichiers du corpus `figma-trait-interieur` — le trait intérieur
  doublé et masqué par sa forme — et `sketch-masque-use` — un `<mask fill="white"><use/></mask>` dans un groupe transformé, cité par
  deux feuilles —, 22 références relues), `masques.test.ts`, `descente-masques.test.ts`, dix hostiles `v2-masques-*` (cycles, `<use>`
  vers son `<mask>` et vers le groupe masqué, bombe d'imbrication, bombe de références, renvoi extérieur, masque CSS par une adresse et
  par une feuille de style, masque sur un `<use>`, région démesurée) et `securite/masques-hostiles.test.ts` (plus le `<mask>` de 100 000
  formes engendré dans le test), l'extension d'écriture « étape 6 : masques » (avant celle des groupes), les masques dans
  `projet-v2.test.ts`, l'assertion d'`images.test.ts` sur une image à `mask` (elle s'enveloppe désormais).
- **Touché hors des crochets, et pourquoi** : (1) `fonctionnalites.ts` : `CrochetsTransformation.groupe(g, m, outils)` et l'interface
  `OutilsTransformation` — **bloquant** : un fichier de fonctionnalité ne peut pas importer `transformation.ts` (cycle), et sans cela le
  contenu peint d'un masque ne pouvait pas faire suivre ses dégradés, ses images ni ses effets ; les crochets existants ignorent
  l'argument ; (2) `transformation.ts` : `transformerGroupe` construit ces outils (corps changé pour les seuls groupes, donc rien pour un
  dessin plat : pas d'ancien corps à geler) ; (3) `model/projet.ts` : `OUTILS` gagne `forme` et `groupes` (comme l'étape 5 avait ajouté
  `chemin`) ; (4) `engine/projet.ts` et `engine/projetV2/champs.ts` : `groupeProjet`/`groupeDuProjet` reçoivent la conversion d'une forme
  (`ConversionFormes`, prêtée par `engine/projet.ts` : l'importer d'ici ferait un cycle), et `refusChampsV2` les groupes.
- **Écarts et reste** : la région reste une boîte (le type de l'étape 0) : sous une rotation, elle s'élargit au rectangle de ses
  coins, exact tant que le contenu tient dans la région, dit à la lecture sinon, **pas** dit à la transformation (le crochet n'a pas de
  canal de message ; à l'interface de l'étape 8) ; le contenu d'un masque se transforme avec l'échelle de trait de la matrice, même
  quand l'opération garde les traits (`transformerGroupe` n'a pas de `k`) ; un `mask-type` posé par une feuille `<style>` est lu (la
  cascade garde toute propriété), pas un `mask-type` hérité ; un `<mask>` qui porte `opacity` ou un filtre est dit ignoré (à mesurer dans
  les trois moteurs avec `rendu-v2`) ; une référence vers rien laisse la forme dessinée sans masque, comme pour une découpe (CSS
  Masking parle d'une couche transparente : à mesurer de même) ; la spécification de l'écriture (`invariants.ts`) n'admet pas
  encore les attributs du texte vivant sur un `<path>` d'un `<mask>` : créer un masque dont le dessus est un texte vivant écrirait des
  `data-ed-*` que `violationsEcriture` refuserait (à ouvrir, une ligne, avec l'étape 8, ou vectoriser le texte avant) ; la vignette du site
  PHP refuse `url(#ed-m-…)` : un projet à masque n'a pas de vignette (rien ne casse) ; le PDF masque doux est à 13a, l'idiome
  `Adobe_OpacityMaskFilter` à 13b ; l'équivalence pixel (`rendu-v2`) attend l'étape d'interface qui ouvre l'e2e.
- **Pour l'étape 9 (motifs)** : la tuile d'un motif est un contenu peint, comme un masque : la lire par `lireContenu` (`etatContenus` :
  pile, tables, budget communs ; un `<g>` de la tuile rejoint la table locale tout seul) dans le repère de la tuile (`patternUnits`,
  `patternContentUnits`, `viewBox` résolus comme `maskUnits`/`maskContentUnits`), l'écrire par `ContexteEcriture.contenu` sans mémoire
  (ou en reposant les dépendances), la transformer par `outils` si elle suit la forme ; `parcourirContenus` porte déjà la tuile ;
  `renumeroterContenus` ne la porte **pas** encore (il ne voit que découpes et masques des groupes : une ligne pour les peintures) ;
  `boiteDescendants` sert pour `objectBoundingBox`.
- **Pour l'étape 8 (interface)** : rien à ajouter à la toile (le rendu générique de 2-A, `engine/edition/rendu.ts`, note tout ce que
  dépose le contenu d'un masque — ses dégradés avant le `<mask>` — et pose `mask` sur le `<g>` : vérifié par `masques.test.ts`) ; le contexte `masque` édite `{ vb, ...groupe.masque.contenu }`
  avec les outils ordinaires (le contenu est peint : rien à refixer au retour, contrairement à une découpe), puis recalcule ou garde la
  région (choix à faire : l'élargir à la boîte du contenu modifié serait le plus sûr) ; commandes « Créer un masque d'opacité »,
  « Libérer le masque », « Inverser le masque » (`creerMasque`, `libererMasque`, `inverserMasque`, phrases `MSG_MASQUE`), confirmation
  de `degrouper` sur un groupe masqué (`porteurs` le dit déjà), jeton `contour-masque`, pastille « masque d'opacité » dans les calques ;
  la phrase d'une région élargie à la transformation.

### Ce que l'étape 4 et le paquet 7-B ont posé (26 octobre 2026)

Aucun octet écrit d'avant ne bouge (références v1 gelées, références v2 existantes intactes), la lecture `plat` est inchangée, et
**un dessin plat montre l'inspecteur d'avant, au DOM près**, tant que le réglage du modèle vaut `plat`.

- **Décision : où un dégradé se propose.** Poser un dégradé rend un dessin plat riche (`estPlat` devient faux, l'écriture pose
  `data-ed-modele="2"`, le projet passe au format 2). Le choix Uni / Dégradé linéaire / Dégradé radial ne se montre donc que si le
  réglage `modele` vaut `riche` (menu Édition, ou l'hôte) **ou** si le dessin ouvert est déjà riche (`useDegradesPermis`,
  `zones/EditeurDegrade.tsx` ; le même critère que `groupesActifs` de 2-C). Un hôte qui fixe `plat` (l'embarquement par défaut) ne le
  voit jamais. Le style des formes à venir (`PanneauDessin`, `StyleNouvelleForme`) reste uni : rien n'y a changé.
- **Opérations pures** (`engine/edition/degradesOperations.ts`, bloc « étape 4 » de la façade) : `poserDegrade(d, ids, cote, genre)`
  (dans la boîte de la forme : linéaire de gauche à droite par son milieu, radial de son centre à son plus grand demi-côté ; une couleur
  unie devient le premier arrêt, le blanc — le noir sur une couleur très claire — le second ; changer de genre garde arrêts et
  étalement ; un trait qui apparaît prend l'épaisseur 1), `retirerDegrade` (la couleur de repli reste, unie), `ajouterArret` (à
  mi-chemin du suivant, couleur et opacité interpolées en OKLab, 64 au plus ; `rangAjoute` donne son rang), `retirerArret` (2 au moins),
  `modifierArret` (couleur `#rrggbb` en minuscules, position **bornée par les voisins** et opacité au millième, l'opacité absente à 1 :
  le rang d'un arrêt ne change jamais pendant un geste), `echangerArrets` (l'ordre : couleurs et opacités échangées, positions gardées),
  `inverserArrets`, `reglerEtalement` (`pad` est l'absence), `reglerAngle` (autour du milieu de l'axe, même longueur, posé dans le plan
  sans matrice), `reglerCentre`/`reglerRayon` (une translation ou une échelle composée : le foyer suit, une ellipse garde sa
  proportion), `deplacerExtremite` (les poignées), et pour la toile `axeDegrade`, `pointSurAxe`, `positionSurAxe` (projection sur l'axe
  d'un linéaire, distance rapportée au rayon d'un radial dans son repère), `angleDegrade`, `centreRayon`, `formesADegrade`,
  `degradesDistincts`. Chacune rend le même objet quand rien ne change ; la couleur de repli est recalculée comme à la lecture
  (`couleurDeRepli`). Une sélection de groupes peint leurs feuilles, une image est laissée. `degrades.ts` n'a gagné qu'un `export`
  (`lineaireDansLePlan`, l'axe canonique que la toile montre).
- **Phrases** : `degradeDit` (`engine/description.ts`) et `peintureDite` qui dit « fond dégradé linéaire du rouge #c81e28 au bleu
  #1f5fb0 » plutôt que la couleur de repli (ancien corps dans `anciennes/etape4.ts`, cas dans `loi-dessin-plat.test.ts`) ;
  `zones/phrasesDegrades.ts` (« Arrêt 2 sur 3, rouge #c81e28, à 40 % », « Arrêt 2 : 55 %. », « Début du dégradé : 30, 100. »,
  « Remplissage : dégradé linéaire. », « Arrêt ajouté : 3 sur 4. », « Arrêt retiré : 2 arrêts restent. »).
- **Le panneau** (4-A) : `zones/EditeurDegrade.tsx` — `PeintureDegradable` enveloppe le sélecteur de couleur de l'inspecteur
  (`Inspecteur.tsx`, Remplissage et Contour ; `Peinture` gagne `sansTitre`, la légende du choix étant son titre) : un `fieldset` de
  boutons radio natifs, puis, sous un dégradé, la liste des arrêts (`role="listbox"`, un seul arrêt de tabulation par
  `aria-activedescendant`, flèches, Début/Fin, Suppr retire ; une option ne porte aucune commande, son texte visible est son nom) et
  les réglages de l'arrêt choisi (couleur et code, position en curseur et en champ, opacité, Monter / Descendre, « Retirer l'arrêt »
  grisé avec sa raison à deux arrêts), « Ajouter un arrêt », « Inverser », « Étalement » (Prolonger, Refléter, Répéter), l'angle (curseur
  par 15°, champ au degré) ou le centre et le rayon. Curseurs et sélecteur de couleur sont un geste fondu par sa clé, clos en quittant
  le champ. **La ligne « Dégradés »** (`zones/LigneDegrades.tsx`, dans `CouleursDuDessin.tsx` et `ParCouleur.tsx`, selon le fond, le
  trait ou les deux) compte les dégradés distincts et leurs formes et les choisit d'un clic ; absente sans dégradé (le DOM des listes
  reste celui d'avant). `LigneCouleurDessin.tsx` et `ListeCouleurs.tsx` n'ont pas bougé.
- **Les poignées** (4-B) : `zones/PoigneesDegrade.tsx`, poussées par la `surcouche` de `Toile.tsx` pour la forme choisie seule
  (outil de sélection, déverrouillée ; le remplissage s'il est en dégradé, sinon le contour) : l'axe et un rail parallèle des arrêts
  (un arrêt à 0 % ne recouvre pas l'extrémité), un rond par arrêt (la couleur du dessin, cernée du jeton), un losange par extrémite
  (début et fin d'un linéaire, centre et bord d'un radial). Chaque poignée est un `role="slider"` (`aria-valuenow` en %,
  `aria-valuetext` « Arrêt 2 sur 3, rouge #c81e28, à 40 % », l'aide dans son `<title>`), cible de 40 px au doigt. **Clavier**
  (`ClavierToile.ts`, deux lignes) : Tab depuis la toile sur une forme à dégradé entre dans les poignées (début, arrêts, fin), Tab après
  la dernière passe à la forme suivante (ou quitte la toile : jamais de piège), Maj+Tab revient, flèches ±1 %, Maj ±10 %, Début/Fin
  aux bornes, Suppr retire (le focus passe à la poignée précédente ; la forme reste), une extrémité se déplace du pas du plan (Maj ×10),
  Échap rend la toile ; un geste de touches est fondu par sa clé, clos en quittant la poignée ; la phrase d'aide de la toile le dit.
  **Souris et doigt** (`Gestes.ts`, `data-poignee-degrade` comme un coin) : un arrêt glisse le long de l'axe (projection du pointeur),
  une extrémité suit le pointeur aimanté ; un seul geste d'historique.
- **Jetons** : `poignee-degrade` (`#9c2a7a` / `#e07ac0`, 6,5:1 et 6,2:1 sur le panneau) et `arret-selectionne` (`#15181d` /
  `#e6e9ec`), rôle « trait », chacun dans `PAIRES_GRAPHIQUES` (3:1 sur son halo de panneau) ; en contraste forcé, `Highlight`, `Canvas`,
  `CanvasText`. `docs/jetons.md` régénéré.
- **Le brouillon des effets** (7-B) : `zones/brouillon.ts` — `noeudsAEffet` (feuilles et groupes visibles à flou ou ombre, mémorisé par
  dessin), `SEUIL_EFFETS_AU_REPOS` = 20, `effetsAuRepos`, `PHRASE_EFFETS_AU_REPOS`. **Décision** : jusqu'à 20 nœuds à effet, les effets
  se rendent en direct pendant un geste (annexe 7 §4 : le budget tient) ; au-delà, `useGestes` pose `brouillon` au premier mouvement
  d'un glisser, d'un redimensionnement ou d'une rotation, `NoeudsToile` le porte en `data-brouillon` sur `<g class="noeuds-toile">`,
  la feuille de style retire les filtres (`[data-brouillon] [filter] { filter: none }`), et le relâcher (ou un pincement) le retire ; la
  barre d'état le dit une fois par éditeur (« Effets affichés au repos : … »). Le dessin, l'historique et l'écriture n'en savent rien ;
  `renduDe(d, liste sans effets)` n'a pas servi (il n'est pas mémorisé, et la feuille de style suffit).
- **Mesuré, puis corrigé** (méthode de l'ADR-0008 : Chromium sans écran, 1 920 × 1 080, tâches du fil principal par mouvement d'un
  glisser, médiane de trois passages entrelacés ; machine de l'agent) : avant correction, 200 ronds à ombre coûtaient **71,6 ms** par
  mouvement sans brouillon et **35,4 ms** avec (200 ronds floutés : 38,6 et 25,1 ; 200 ronds sans effet : 16,3). La cause n'était pas le
  rendu des filtres mais le `<defs>` de la toile, réécrit d'un seul tenant à chaque mouvement (la région du filtre de la forme déplacée
  change, donc la chaîne des définitions). **Correction** (`ToileNoeuds.tsx`, `morceauxDefinitions`) : une définition par `<g>` de
  `<defs>`, à la clé de son identifiant d'empreinte, mémorisée : seule celle qui change se réécrit (le test de la toile riche relit
  le texte des définitions, morceaux réunis). Après : témoin 11,9 ms, 200 floutés 16,4 (brouillon) / 17,5 (sans), 200 à ombre
  18,8 / 18,9, 20 à ombre en direct 10,1, 200 à dégradés tous différents 20,5 ; ouvrir (tâches) : témoin 234 ms, 200 floutés 307, 200
  à ombre 304, 200 dégradés distincts 321 (**+87 ms**, budget de l'annexe 7 §4 : ≤ 150). L'intervalle des images mesuré dans la page
  reste à 16,6–17,4 ms dans tous les cas (≥ 57 images/s). **Limite** : sans écran, le tramage des filtres se fait hors du fil principal
  et ne se voit pas dans ces chiffres ; le gain du brouillon y est faible après la correction (0,1 à 1 ms), il reste la garde pour une
  carte graphique réelle, à mesurer sur la machine de référence. Le script de mesure n'est pas commis (il pilote la page construite) ;
  sa méthode est celle-ci.
- **Tests** : `degrades-operations.test.ts` (17 cas), `v2/cas-degrades-operations.ts` (14 références `v2/degrades-op-*`, relues, point
  fixe, `violationsEcriture`/`violationsNettoyage`), `description.test.ts`, `loi-dessin-plat.test.ts` (étape 4),
  `tests/unit/zones/degrades.test.ts` (phrases, côté des poignées, compte des nœuds à effet, découpe des définitions),
  `toile.test.ts` (les définitions par morceaux) ; e2e `tests/e2e/degrades.e2e.ts` (à plat rien ne change ; sans souris : poser un
  linéaire, ajouter, déplacer et retirer un arrêt par le panneau et par les poignées, enregistrer et retrouver le `<linearGradient>` ;
  à la souris : arrêt et extrémité ; contraste forcé ; le brouillon pendant un glisser et retiré au relâcher ; axe sur l'éditeur
  linéaire et radial en clair, sombre et au doigt).
- **Reste** : le motif dans le choix du genre (étape 9) ; les poignées d'un contour en dégradé quand le remplissage l'est
  aussi (la toile ne montre que celles du remplissage ; le panneau règle les deux) ; le foyer d'un radial (`fx fy fr`) n'a ni champ ni
  poignée (il suit le centre et le rayon) ; un dégradé sur plusieurs formes choisies se règle forme par forme au même rang d'arrêt, le
  panneau montre celui de la première ; la mesure sur une carte graphique ; la revue NVDA/VoiceOver des poignées (condition de la
  bascule, annexe 6 §9).

### Ce que l'étape 13c a posé (26 octobre 2026, moteur)

Aucun octet écrit ne bouge (références v1 et v2 intactes), la lecture `plat` est inchangée : un `<svg>` imbriqué y reste refusé (« un
SVG imbriqué »), un `<text>` lu avec des polices s'y lit en lettres à plat, l'opacité multipliée, comme avant.

- **Décision : une fonctionnalité, pas le cœur.** `edition/fonctions/imbrications.ts` et une ligne de `catalogue.ts` (la dernière, après
  les images) : deux lecteurs d'éléments, `svg` et `text`, que `preparer` laisse déjà passer quand une fonctionnalité sait lire la
  balise (`NON_PRIS` le permettait) et que `visiter` appelle avant le refus `refusHorsFeuille` ; rien d'autre (ni écrivain, ni
  transformateur, ni étendue : un groupe s'écrit par les groupes, une fenêtre par les découpes). `parcours.ts`, `lecture.ts`,
  `heritage.ts`, `types.ts` et `fonctionnalites.ts` n'ont pas changé ; aucun crochet n'a manqué.
- **`<svg>` imbriqué** (mode riche) : un groupe (`nomDuGroupe` : `data-name`, `id`…, opacité au groupe) ; son cadre `x y width height`
  (nombres, `px`, pourcentages de la fenêtre qui l'entoure — le viewBox du `<svg>` parent, sinon son cadre, sinon le plan —, `auto` vaut
  l'absence ; une autre unité est refusée, `REFUS_IMBRICATIONS.longueur`), son `viewBox` et son `preserveAspectRatio` composés par
  `matriceCadre` (celle des `<symbol>`), son `transform` (SVG 2) avant ; la matrice est cuite dans les feuilles. Sa **fenêtre** :
  `overflow` hidden par défaut (la feuille de style de tout navigateur pour un `<svg>` qui n'est pas la racine), une découpe
  rectangulaire de la fonctionnalité des découpes (`feuilleDeDecoupe`, numérotée dans l'espace commun avec sa place vide, comptée dans
  `NOEUDS_DEFS_MAX`), sauf `overflow` `visible` ou `auto`. Une découpe, un masque ou un filtre posés sur le `<svg>` lui-même restent à
  son groupe (lus par leurs fonctionnalités, crochet `groupe`), la fenêtre passe à un groupe intérieur : ils s'appliquent au contenu
  déjà rogné. Un `<use>` qui vise un `<svg>` lui donne sa largeur et sa hauteur (SVG 1.1, 5.6). Un cadre nul ou négatif, un viewBox vide
  ne dessinent rien (sans phrase : rien n'est perdu) ; un viewBox négatif ou illisible est ignoré (`lireVue`) ; un cadre ou une échelle
  démesurés sont refusés (« des coordonnées démesurées »). Un `<svg>` imbriqué dans un `<clipPath>` n'y est pas admis (il ne l'était pas).
- **`<text>` en groupe de lettres** (mode riche, avec `OptionsLecture.polices`) : les lettres sont lues par `lireTexte` (ADR-0020) sans
  l'opacité du texte, puis rangées dans un groupe nommé comme la vectorisation en lettres séparées (`nomGroupeTexte`, déplacé de
  `engine/texte/vectoriser.ts` vers `edition/texteSvg.ts` et réexporté d'où il était ; `inkscape:label` ou `data-name` l'emportent), qui
  porte l'opacité du texte ; sa découpe, son masque et son filtre s'y posent par leurs fonctionnalités : **le refus « posé sur un
  texte » de l'étape 7 et la découpe perdue sans le dire de l'étape 5 disparaissent en mode riche**. Une lettre seule, sans prise et
  opaque, reste une feuille (la règle de `vectoriserLettresEnGroupes`). Dans un `<clipPath>` (qui n'admet pas `<g>`), un texte sans prise
  se lit en lettres comme avant. Sans polices, un `<text>` est refusé en riche avec la phrase du plat (`REFUS_IMBRICATIONS.texte`).
- **Unités de boîte** : `contenus.ts` gagne `poserBoiteConnue(analyse, nœud, boîte)` et `boiteDescendants` la rend pour ce nœud (corps
  changé : riche seulement, aucun dessin plat n'y passe, donc pas d'ancien corps à geler) : la boîte des lettres d'un texte (dans son
  repère), celle du contenu d'un `<svg>` placé dans son cadre ; une découpe en `objectBoundingBox` et la région par défaut d'un masque
  sur un texte se mesurent donc sur ses lettres (sans cela : boîte plate, rien n'était dessiné).
- **Touché hors du fichier de la fonctionnalité, et pourquoi** : (1) `fonctions/decoupes.ts`, `porteurRefuse` : seule la racine est un
  `<svg>` porteur refusé (sans cela, une feuille sous un `<svg>` imbriqué découpé était refusée « découpe posée sur … le SVG entier ») ;
  (2) `fonctions/groupes.ts` : `profondeurDans` exporté (la même borne des groupes emboîtés) ; (3) `contenus.ts` (ci-dessus) ;
  (4) `edition/texteSvg.ts` et `texte/vectoriser.ts` (`nomGroupeTexte`) ; (5) la façade, un bloc « étape 13c » ; (6) `corpus-v2.test.ts` :
  le chemin de la page lit avec des fontes factices (sans effet sans `<text>`), et une ligne peut dire qu'elle se refuse à plat (`aPlat`).
- **Mesuré dans les trois moteurs** (à la main, Playwright, entrée contre référence) : cadre, viewBox, les trois familles de
  `preserveAspectRatio`, pourcentages emboîtés, `<use>` vers un `<svg>` : identiques à l'anticrénelage près. **Écarts entre navigateurs**,
  donc dits (`MSG_IMBRICATIONS.prises`) : une découpe posée sur un `<svg>` imbriqué, Firefox la place dans le repère où il est posé, Chromium
  et WebKit dans celui de son viewBox (et Chromium ne rogne alors plus à la fenêtre) ; un filtre, Firefox et WebKit floutent le contenu
  rogné, Chromium rogne le flou ; la lecture suit Firefox (la lettre de CSS Masking). `overflow="scroll"` : Firefox ne rogne pas,
  Chromium et WebKit si (la lecture rogne). `transform` sur un `<svg>` imbriqué : WebKit l'ignore (SVG 2 ; la lecture l'applique, comme
  Chromium et Firefox). La boîte d'un texte (`objectBoundingBox`) : un navigateur la mesure sur les cellules des glyphes, la lecture sur
  le contour des lettres de remplacement, et le dit quand une découpe ou un contenu de masque en dépendent (`MSG_IMBRICATIONS.boiteTexte`).
- **Projet JSON** : rien à ajouter (groupes et découpes y sont déjà portés) ; aller-retour exact et même SVG vérifiés (`imbrications.test.ts`).
  **Descente** : celles des découpes et des groupes (la fenêtre rogne les remplissages) ; un texte lu en riche puis descendu redonne les
  lettres de la lecture plate (loi vérifiée avec polices). **Écriture** : aucune extension (`<g clip-path data-ed-nom>` et `<clipPath>`
  étaient permis).
- **Tests** : `imbrications.test.ts` (plat inchangé, matrices, pourcentages, fenêtre, prises, `<use>`, I1, projet, descente, texte en
  groupe, prises du texte, texte dans un `<clipPath>`, loi de descente), `v2/cas-imbrications.ts` (6 entrées `<svg>`, 3 entrées texte lues
  avec les fontes factices de `v2/polices.ts`, 3 opérations, le corpus `illustrator-svg-imbrique` ; 13 références relues), le corpus
  `figma-texte-decoupe` (une ligne de `corpus-v2.test.ts`), six hostiles `v2-imbrications-*` (`<svg>` qui se clone lui-même, deux qui se
  clonent l'un l'autre, viewBox nuls, démesures, unités physiques, cent niveaux) et `securite/imbrications-hostiles.test.ts` (plus une
  bombe de clones d'un `<svg>` engendrée dans le test).
- **Reste** : `boiteDescendants` ne compte toujours ni un texte ni un `<svg>` imbriqués **dans** un groupe en unités de boîte (le crochet
  `groupe` est appelé avant que ses enfants soient lus) ; un texte peint d'un dégradé reste refusé (« un dégradé ou un motif » : `lireTexte`
  ne consulte pas le crochet `peinture`) ; la région d'un filtre de groupe n'est pas confrontée aux lettres (elles ne passent pas par le
  crochet `feuille`) ; un pourcentage dans une forme (`width="100%"` d'un `<rect>`) n'est toujours pas résolu, à plat comme en riche ;
  la vignette du site PHP refuse `url(#ed-c-…)` comme pour toute découpe.

### Ce que l'étape 9 a posé (26 octobre 2026, moteur)

Aucun octet d'un dessin plat ne bouge (manifeste v1 intact, aucune référence v2 existante réécrite), la lecture `plat` refuse comme
avant (« un dégradé ou un motif ») ; `types.ts` et `fonctionnalites.ts` n'ont pas changé (`Motif` existait depuis l'étape 0).

- **Le repère d'un motif** (décision) : `x y l h` sont la tuile dans le repère du motif, `matrice` porte ce repère dans le plan
  (`patternTransform` composé avec tout ce qui pose la forme), et le **contenu est dans le repère de la tuile, son origine au coin
  (x, y)** — ce qu'un navigateur dessine (mesuré dans Chromium et Firefox : chaque répétition translate le contenu avec la tuile ; SVG
  1.1 laissait croire l'inverse). L'écriture recopie donc la tuile telle quelle. Une translation (lue sur la forme ou appliquée ensuite)
  déplace la tuile au lieu de poser une matrice : un motif déplacé s'écrit sans `patternTransform`, et l'écriture plie de même toute
  matrice qui, arrondie, n'est qu'une translation (forme canonique, point fixe).
- **Lecture** (`edition/fonctions/motifs.ts`, une ligne de `catalogue.ts` après les effets ; crochet `lecture.peinture`, que les dégradés
  laissent passer pour un `<pattern>`) : chaîne `href`/`xlink:href` (attributs et contenu hérités, `CHAINE_HREF_MAX`, `href` l'emporte),
  `patternUnits` (parts de la boîte locale de la forme par défaut, pourcentages du plan en unités du plan), `patternContentUnits`, `viewBox`
  et `preserveAspectRatio` (cadrés dans la tuile par `matriceCadre`, le `viewBox` l'emportant sur les unités du contenu), `patternTransform`
  composé avec `pret.m`. Le contenu se lit par **`lireContenu`** (`edition/contenus.ts`, pile, tables et budget communs) : feuilles,
  groupes, dégradés, découpes, masques, effets et **motifs imbriqués** (bornés par `PROFONDEUR_DEFS_MAX`, un cycle refusé), hérités de
  l'endroit où le `<pattern>` est écrit. Mémoire par lecture : une tuile se lit une fois par source et par repère, une peinture se
  partage entre les formes posées pareil (mille formes, un objet). Refus nommés (`REFUS_MOTIFS`) : renvoi extérieur, cycle, chaîne trop
  longue, imbrication, plus de `NOEUDS_DEFS_MAX` formes (compté au fil de la lecture, refus dit — la lecture s'arrêtait avant en silence :
  les places vides des contenus imbriqués comptaient deux fois), plus de 20 000 motifs distincts, **tuile vide, nulle ou plus petite que
  `TUILE_MIN` = 0,01** (décision : refusée, pas peinte « rien »), longueur dans une autre unité, transformation illisible ou dégénérée,
  coordonnées démesurées, **une image dans une tuile** (l'écriture la sait poser depuis le correctif qui suit l'étape, `xmlns:xlink`
  compris ; le refus reste parce que le projet JSON porte une copie de la tuile par forme peinte, sans partage, et que `refusChampsV2`
  n'en vérifie pas les octets : une image de 4 Mo sur mille formes y pèserait 4 Go — à lever avec un partage des tuiles dans le projet).
  Dit (`MSG_MOTIFS`) : une tuile qui déborde (`overflow: visible`) est rognée.
- **Couleur de repli** (décision, `couleurDeRepliMotif`) : la moyenne OKLab des couleurs de la tuile, pondérée par ce que chacune couvre
  (aire d'un fond, longueur d'un trait par son épaisseur, comme le nuancier, `nuancier/surfaces.ts`) et par son opacité ; le transparent
  de la tuile ne compte pas ; un motif ou un dégradé de la tuile par leur repli ; rien de peint : le noir. Mémorisée par tuile.
- **Écriture** (`ecriture.peindreFeuille`) : `<pattern id="ed-p-…" patternUnits="userSpaceOnUse" x y width height
  [patternTransform="matrix(…)"]>` puis le contenu par `ContexteEcriture.contenu` (ses définitions déposées avant le `<pattern>`) ;
  `url(#ed-p-…)` à la place de la couleur ; dédoublonné par empreinte, posé une fois par recueil (mille formes, une définition).
- **Identifiants** (décision) : la tuile est **un espace à part** (l'annexe 1 §2 ne range dans l'espace unique que découpes et masques).
  Une peinture se partage comme un dégradé (dupliquer, répéter en grille, scinder une forme gardent le même objet), un projet rouvert en
  porte des copies égales, et rien n'a besoin d'être renuméroté : **`renumeroterContenus` ne porte pas la tuile, à dessein**.
  `verifierDessin` juge chaque tuile pour elle-même (une tuile partagée une fois) ; `parcourirContenus` ne voit qu'une fois un contenu
  partagé (le même objet), donc `poidsDessin` aussi ; `prochainNumero` compte toujours les feuilles de tuile.
- **Transformation** (`transformation.feuille`) : `transformerMotif` (translation : la tuile bouge ; le reste compose la matrice, exact) ;
  le contenu reste le même objet ; un même motif au fond et au trait reste un seul objet.
- **Opération** (`edition/motifs.ts`, bloc « étape 9 » de la façade) : `creerMotif(d, ids, cible?)` — décision : la sélection (visible,
  déverrouillée, sans image) devient la tuile, exactement sa boîte visuelle (trait et effets compris : elle se pave bord à bord), ramenée
  au coin de la tuile par les crochets de transformation, et quitte le dessin ; le motif peint la `cible` (son remplissage, la couleur de
  repli en couleur ; elle garde sa place), sinon **un rectangle neuf de trois tuiles sur trois centré sur la sélection**, sans trait, à la
  place du plus haut élément choisi, dans son groupe ; `MSG_MOTIF` (vouvoiement).
- **Interface minimale** : « Créer un motif depuis la sélection » au menu Édition, en riche seulement (`zones/commandesGroupes.ts`,
  `creerMotifDepuisSelection`, une entrée d'`elementsGroupes` : le rectangle neuf, choisi, dit ; Ctrl+Z défait). La toile n'a rien eu à
  changer (rendu générique : test dans `rendu.test.ts`, définitions de la toile égales à celles de l'écriture).
- **Descente** (`engine/descente/motifs.ts`, une ligne de `REGLES_DESCENTE` après les dégradés) : la couleur de repli reste, « les motifs
  (remplacés par leur couleur moyenne) » ; une forme qui ne s'exporte pas part sans phrase ; `natif` garde le motif (le PDF à 13a).
- **Nuancier** (décision) : les couleurs de la tuile, chacune pour sa part de ce que la tuile peint, à son opacité par celle de la
  peinture ; jamais la couleur de repli (comme les arrêts d'un dégradé).
- **Projet JSON** (format 2) : `model/projetV2/motif.ts` (`lireMotifProjet` : tuile ≥ 0,01, matrice de six nombres, formes et groupes
  entiers validés comme ceux du dessin par `OutilsProjet.forme`/`groupes`, identifiants uniques dans la tuile, pas d'image, pas vide,
  huit niveaux au plus) appelé par `lirePeintureProjet` (le genre `motif` n'est plus refusé) ; `engine/projetV2/motif.ts` ; une ligne
  d'`ALLERS_RETOURS` (et les dégradés ignorent un motif) ; les allers-retours d'une forme reçoivent désormais la conversion d'un contenu
  (`champsV2VersProjet(f, CONVERSION)`, `champsV2VersModele(f, CONVERSION)`, deux lignes d'`engine/projet.ts`), comme ceux d'un groupe.
  Un même motif au fond et au trait redevient un seul objet. Aller-retour exact vérifié (modèle, texte JSON, SVG écrit), copies et
  rotations comprises.
- **Tests** : `motifs.test.ts`, `v2/cas-motifs.ts` (8 entrées `v2/motifs-*`, déplacer, tourner, étirer, dupliquer, créer sur une cible et
  en rectangle, le corpus `motif-hachures` — idiome Inkscape « Stripes 1:1 » hérité et pivoté), point fixe aléatoire (200 motifs, deux
  précisions, graine imprimée), 11 hostiles `v2-motifs-*` et `securite/motifs-hostiles.test.ts` (plus une tuile de 30 000 formes et
  mille formes à une tuile de 5 000, engendrées), l'extension d'écriture « étape 9 : motifs » (avant les groupes et les dégradés), les
  motifs dans `projet-v2.test.ts` et `rendu.test.ts`, la commande dans `commandesGroupes.test.ts`. **Rendu** : entrée et référence
  comparées à la main dans Chromium, Firefox et WebKit (moins de 0,25 % de pixels à plus de 200/255 d'écart, l'anticrénelage des tuiles
  tournées).
- **Reste** : l'interface (étape 8 : contexte `motif` pour éditer la tuile — `ContexteEdition.dans: 'motif'` existe —, dimensions
  numériques, choix de la cible au lieu du rectangle, section Remplissage « Motif » de l'étape 4) ; les images dans une tuile (le
  partage des tuiles dans le projet d'abord, voir les refus) ; la vignette du site PHP refuse `url(#ed-p-…)` : un projet à motif n'a pas
  de vignette (rien ne casse) ; le motif de pavage du PDF (13a).
- **Corrigé après l'étape** (deux défauts trouvés ici) : (1) la boucle de lecture des masques comptait deux fois les places vides d'un
  contenu imbriqué et s'arrêtait en silence sous la borne (150 groupes masqués dans un masque : 100 formes gardées sur 150) ; la boucle
  bornée est désormais une seule fonction, `visiterSousBudget` (`edition/contenus.ts`), pour les masques, les motifs et les découpes (qui
  ne perdaient rien, mais lisaient jusqu'au bout un `<clipPath>` de 100 000 formes avant de le refuser) : seules les feuilles gardées
  comptent, et le refus est dit ; (2) une image dans le seul contenu d'une définition (un masque) s'écrivait avec `xlink:href` sans que
  la racine déclare `xmlns:xlink` (XML mal formé) : `ecrireCorps` signale `'xlink'` quand un élément écrit l'emploie, et
  `ecrireDessinRiche` décide de la racine après le corps et les définitions (une image du dessin, même cachée, la déclare comme avant :
  aucune référence n'a bougé) ; `violationsEcriture` refuse désormais tout préfixe employé sans déclaration sur l'élément ou un ancêtre.
  Références nouvelles : `v2/masques-image`, `v2/masques-image-deplacer`.

### Ce que l'étape 13a a posé (26 octobre 2026)

- **Capacités** : `CAPACITES_PDF` (`export/capacites.ts`) déclare `natif` les dégradés, les motifs, les découpes, les masques, les
  images et les groupes ; `effets` reste `approche` (abandonnés et dits), `texte` `natif` comme partout.
- **La scène native** (`engine/descente/scene.ts`, exportée par `aplatir.ts`) : juste avant la règle des groupes, `aplatirPour` remet à
  l'exporteur, en plus du `DessinPlat`, ce qu'il écrit lui-même : des feuilles plates (aucun champ v2) avec leur dégradé
  (`PeintureScene`, domaine du paramètre calculé sur la boîte peinte : `[0, 1]` étalé, des périodes entières pour `repeat`/`reflect`,
  au plus `PERIODES_MAX` = 256, au-delà prolongé et dit) ou leur motif (`MotifScene` : tuile, matrice, contenu en scène dans le repère
  de la tuile) à part, des images posées, et des **portées** pour un groupe découpé (chemin exact pour une forme, ou des formes de même
  règle qui ne se touchent pas ; sinon l'union des booléens, dite si elle rebâtit des courbes), masqué (contenu en scène, région) ou
  translucide quand ses feuilles se recouvrent (plus d'une feuille, ou une feuille à fond et trait : `opacite` et `boite`). Ce que la
  scène porte quitte le dessin plat sans phrase ; ce qui est natif mais caché part sans phrase, même sans scène (sinon le filet le
  disait perdu) ; l'opacité des groupes n'est retirée que s'il y a une scène. Les contenus de masques et les tuiles descendent par
  `aplatirPour` (récursion passée en paramètre : pas de cycle d'import). Un dessin plat, ou riche sans rien de natif visible, n'a pas
  de scène : le PDF d'avant, octet pour octet (vérifié : les six empreintes de `pdf-options.test.ts` sans régénérer ; tout SVG v1 lu en
  riche sans scène donne le même PDF que la descente d'avant).
- **« Approché » et « perdu »** : `RegleDescente.descendre` peut rendre `perdus` (la part de ses phrases qui ne s'exporte pas) ;
  `Descente.perdus` ; images, effets, masques et le filet (effets, images) s'y rangent ; `phrasePertes(pertes, perdus)` dit
  « Approché par ce format : … . Perdu dans ce format : … . » (sans `perdus`, la phrase d'avant). `actionsExport`, `actionsProduction`
  et « Télécharger le SVG à plat » passent `perdus`.
- **L'écriture** (`export/`, chaque fichier pur, sans dépendance) : `pdf.ts` (l'entrée, `ecrirePdf(dessin, options, natif?)` ; sans
  scène, les octets d'avant), `pdfTrace.ts` (les opérateurs sortis de `pdf.ts` tels quels, plus le gris de luminance), `pdfObjets.ts`
  (l'assemblage, flux binaires compris), `pdfRessources.ts` (objet 6 partagé, objets 7 et suivants, noms stables dédoublonnés),
  `pdfNatif.ts` (la scène), `pdfDegrades.ts` (shading axial/radial, fonctions de type 2 cousues en type 3, marche nette sur un arrêt
  double, `Extend`, périodes renversées pour le reflet, fonction de base rangée à part et citée par période), `pdfPlacement.ts`
  (`preserveAspectRatio`, orientation EXIF — Chromium l'applique à une `<image>` SVG, mesuré), `pdfImages.ts`, `deflate.ts` (zlib à
  codes fixes, déterministe ; blocs stockés s'il ne gagne rien). Dégradé de fond : chemin de découpe puis `sh` ; de trait : motif de
  shading (`/PatternType 2`) ; opacités d'arrêts constantes dans l'état graphique, variables en masque doux de luminance (shading gris
  dans un groupe `/CS /DeviceGray`). Motif : `/PatternType 1 /PaintType 1 /TilingType 1`, `/BBox [0 0 l h]`, `/XStep`, `/YStep`, sa tuile
  écrite comme une scène dans son repère (axe vertical retourné), `/Matrix` rapportée à l'espace du flux qui le peint (la page et sa mise
  en page, ou l'identité dans un groupe ou une tuile). Découpe : `W n`/`W* n` dans un `q … Q` (le trait est rogné exactement). Masque :
  le contenu masqué en groupe de transparence, peint sous `/SMask << /S /Luminosity|/Alpha /G … >>`, le contenu du masque en gris de
  luminance (coefficients de `luminanceToAlpha` sur le sRVB : exact, dégradés compris ; une image en couleur y prend sa variante grise
  calculée de même, un JPEG garde la conversion du lecteur, dit) ; chaque groupe est isolé (`/I true`, le rendu à part d'un groupe SVG :
  sans lui, Poppler lisait la luminance d'un pixel translucide sans son alpha, mesuré). Groupe translucide : groupe de transparence à
  `/ca /CA`. Image : JPEG en `/DCTDecode` tel quel (gris, RVB, CMJN avec `/Decode` inversé sous le marqueur Adobe ; arithmétique,
  sans perte ou douze bits : perdu, dit), PNG sans alpha en `/FlateDecode` et `/Predictor 15` tel quel (gris, RVB, palette en
  `/Indexed`), PNG à alpha, à couleur clé, à alphas de palette, entrelacé ou de seize bits décodé (`engine/images/png.ts`, défiltrage et
  Adam7 en pur ; la décompression vient de `io`), GIF décodé (`engine/images/gif.ts`, LZW borné, première image, animation dite) ;
  couleur et alpha recompressés (`deflate.ts`), alpha en `/SMask`, couleur des pixels transparents prise à leurs voisins (un lecteur qui
  lisse ne fait plus déborder la couleur cachée) ; WebP perdu, dit ; en CMJN, les images restent en RVB, dit.
- **`io/exportPdf.ts`** (`pdfDuDessin`) : descente, décompression des PNG par `decompresserZlib` (DecompressionStream, asynchrone ;
  injectable), images préparées, fichier écrit ; `exporterPdf` (zones) l'appelle et dit la phrase. Mesuré : le PDF téléchargé dans
  Chromium est, à l'octet, celui de l'écriture pure hors du navigateur (`tests/e2e/pdf-natif.e2e.ts`).
- **Tests** : `tests/unit/export/pdf-natif.test.ts` (sept SVG d'entrée dans `tests/fixtures/pdf-natif/`, neuf références PDF dont une
  A4 CMJN à fond perdu et une A4, refaites par `ACTUALISER_REFERENCES=1 npx vitest run tests/unit/export/pdf-natif.test.ts` et relues ;
  un lecteur indépendant : table des décalages, `/Length`, références, ressources citées, `q`/`Q` équilibrés ; la forme de chaque
  écriture ; le rendu par `pdftoppm` quand Poppler est là, des points comparés à la couleur que Chromium donne au SVG écrit ; chaque
  fixture v2 et du corpus écrite et lue par Poppler sans un mot d'erreur), `descente-scene.test.ts`, `images/png|gif|jpeg.test.ts`,
  `deflate.test.ts`, `io/exportPdf.test.ts`, l'e2e `pdf-natif`. Les tests de descente qui attendaient du PDF l'approche d'aujourd'hui
  la vérifient sur un autre exporteur et vérifient la scène du PDF.
- **Vérifié à l'œil** (Chromium sur le SVG écrit par l'éditeur, Poppler `pdftoppm` sur le PDF, à 216 ppp, côte à côte) : dégradés,
  découpes, masques, motifs, groupe translucide et images se superposent ; écarts mesurés : l'échantillonnage (Poppler au coin du pixel,
  Chromium au centre), le lissage d'une petite image agrandie (Poppler décale ses échantillons d'un demi-pixel ; sans `/Interpolate`,
  chaque pixel tombe exactement), la conversion CMJN d'un JPEG CMJN (propre à chaque lecteur), les joints de tuile d'un motif.
- **Reste** : le **raster des effets** (le PDF n'a pas de résolution d'export : `OptionsExport.dpi` est celle du PNG ; il faudrait une
  résolution de PDF dans les options et un rastériseur dans `io`, au prix d'octets propres au navigateur, comme JPEG et WebP) ; le WebP
  (décodeur pur déraisonnable ; le canevas du navigateur rendrait des pixels prémultipliés et gérés en couleur) ; la vignette PHP ; le
  CMJN des images ; `/Interpolate true` est un choix (le plus proche du navigateur, sauf chez Poppler, qui lisse décalé).

### Ce que l'étape 13d a posé (26 octobre 2026)

Aucun octet écrit d'avant ne bouge (références v1 gelées, références v2 existantes intactes), la lecture `plat` est inchangée, et un
dessin plat rend les mêmes listes, les mêmes remplacements, les mêmes palettes et le même DOM qu'avant (loi du dessin plat). L'écart
de l'étape 3 (« les listes ignorent un côté peint ») est levé.

- **Les couleurs d'un côté** (`edition/couleurs.ts`, bloc « étape 13d » de la façade) : `couleursDePeinture(p)` (mémorisée par liste
  d'arrêts et par tuile : déplacer une forme garde l'une et l'autre), `couleursDuCote(f, cote)`, `couleursDeForme(f, sur)`. **Décisions** :
  un côté uni porte sa couleur ; un côté à dégradé, **tous** ses arrêts (un arrêt transparent ou de part nulle est dans le fichier et se
  remplace, comme un fond uni d'opacité nulle reste dans les listes) ; un côté à motif, les couleurs des feuilles **que la tuile peint**
  (visibles dans la tuile, comme le nuancier et `couleurDeRepliMotif`), fond et trait, un dégradé ou un motif de la tuile par leurs
  propres couleurs ; **jamais la couleur de repli**. Le contenu d'un **masque** n'entre nulle part (de la luminance, pas une couleur
  visible : la règle du nuancier de l'étape 6) ; celui d'une découpe n'est que de la géométrie. La couleur d'une **ombre portée** reste
  hors des listes (un effet, réglé à l'inspecteur de l'étape 8) alors que le nuancier la compte : à revoir avec l'interface des effets.
- **Listes et sélection** : `couleursDuDessin` (chaque côté compte une fois par couleur : un dégradé à deux arrêts rouges, une fois),
  `groupesDeCouleur`, `idsDeCouleur`, les nuances proches. **Règle de « de cette couleur »** : une forme l'est dès qu'une couleur de ses
  côtés lus (unie, un arrêt quelconque, une feuille peinte de sa tuile) est exactement ce code. **`idsMemeCouleur`** (sélectionner la
  même couleur qu'un modèle) : les couleurs du remplissage du modèle (celles du contour s'il n'en a pas) ; une forme en est quand **le
  même côté porte toutes ces couleurs** — pour un modèle uni, la règle précédente ; pour un modèle à dégradé, chacun de ses arrêts
  (une forme unie n'est pas « de la couleur » d'un dégradé à deux teintes). La pondération reste celle des listes (un compte de formes) ;
  les couleurs vues sont celles du nuancier, à ceci près que les listes gardent un arrêt transparent et une forme masquée du dessin.
  `memesCouleurs` compare désormais les couleurs des peintures (pas seulement leur présence).
- **Remplacer** : `remplacerCouleurs(d, table, sur)` (une seule passe : A→B et B→A s'échangent), `recolorerForme` ; `remplacerCouleur`,
  `remplacerCouleurSur`, `fusionnerCouleursProches`, `appliquerPalette` et `uneCouleur` (`engine/palettes.ts`) passent par elles. Un arrêt
  prend un `#rrggbb` en minuscules (un code illisible, ou « aucune couleur », le laisse : un arrêt n'est jamais « sans couleur », retirer
  la peinture d'un côté se fait à l'inspecteur) ; une tuile change ses feuilles, **masquées comprises** (comme les formes masquées du
  dessin) ; la couleur de repli est recalculée comme à la lecture (`couleurDeRepli`, `couleurDeRepliMotif`), seulement si la peinture a
  changé ; une peinture partagée (un même dégradé au fond et au trait, mille formes à un motif) reste un seul objet. « Fond » seul change
  aussi le contour des feuilles d'une tuile qui peint un fond (elles sont la peinture de ce fond). `appliquerPalette` ne passe plus par
  des jetons `#jeton0` (qu'un arrêt ne sait pas porter) : ancien corps dans `anciennes/palettes.ts`, cas dans `loi-dessin-plat.test.ts`.
- **Interface** : les lignes de « Couleurs du dessin » et de « Par couleur » montrent les couleurs des arrêts et des tuiles (aucun
  composant de liste n'a changé : elles lisent le moteur) ; la ligne « Dégradés » (`LigneDegrades.tsx`) compte aussi les couleurs de
  leurs arrêts (`couleursDArrets`, dans `degradesOperations.ts`) et son aide le dit ; « Sélectionner les nuances proches » part, faute
  de ligne choisie, de la première couleur lue de la forme choisie (`actionsCouleur.ts`). Toujours absente d'un dessin sans dégradé.
- **Tests** : `couleurs-degrades.test.ts` (réécrit : listes, règles de sélection, remplacements, partage, repli, masque, palettes,
  `memesCouleurs`), `tests/unit/zones/couleurs-peintures.test.ts` (les deux listes rendues hors navigateur, et l'absence de la ligne en
  plat), `v2/cas-couleurs.ts` (l'entrée `v2/couleurs-peintures` — dégradés au fond et au trait, tuile à dégradé, masque — et six
  opérations : remplacer partout, sur le fond, sur le trait, fusionner, palette, une couleur ; 7 références relues, point fixe).
- **Reste** : l'ombre portée dans les listes (ci-dessus) ; une ligne « Motifs » à côté de « Dégradés » si l'interface des motifs (étape 8)
  en a besoin ; le nuancier de l'ADR-0037 n'a pas changé (il lisait déjà arrêts et tuiles).

### Ce que l'étape 8 a posé (26 octobre 2026)

Aucun octet écrit d'avant ne bouge (références v1 gelées, références v2 existantes intactes : 7 références nouvelles, relues), la
lecture `plat` est inchangée, et **en modèle plat rien n'apparaît** : ni élément de menu, ni section, ni dépôt sur la toile
(`groupesActifs` de 2-C décide partout ; e2e « à plat »). Ce que les paquets suivants trouvent :

- **Les commandes** (`zones/commandesContenus.ts`, `zones/actionsContenus.ts`, phrases `zones/phrasesContenus.ts`) : « Créer une
  découpe », « Libérer la découpe », « Créer un masque », « Inverser le masque », « Libérer le masque », au **menu Édition**, juste
  après les groupes (il n'y a pas de menu Objet : ADR-0006 range le rare dans Édition, comme 2-C). **Aucun bouton dans la rangée de la
  sélection** (annexe 6 §3 : « jamais un bouton de plus dans la barre ») et **aucun raccourci** : Illustrator prend Ctrl+7 et
  Ctrl+Alt+7, qu'un clavier AZERTY n'atteint qu'avec Maj et qu'AltGr (Ctrl+Alt) confond ; aucune touche libre ne vaut sur tous les
  claviers (la conclusion de l'annexe 9, question 1). Une commande indisponible reste visible et grisée, sa raison en infobulle
  (`ElementMenu.raison`, une ligne de `commun/Menu.tsx` : `title` d'un élément grisé ; le DOM d'un élément sans raison ne change pas).
  Le groupe porteur d'une libération ou d'une inversion se trouve par `porteurDe` : un groupe choisi qui en porte un, sinon le plus
  proche ancêtre du premier élément choisi (une image découpée se choisit, la découpe est sur son enveloppe), sinon le groupe du
  contexte. Verbes `ac.creerDecoupe`, `libererDecoupe`, `creerMasque`, `inverserMasque`, `libererMasque` (déclarés dans
  `ActionsEditeur`, branchés dans `creerActions.ts`). Phrases : « Découpe créée : la forme du dessus découpe 2 formes. », « Découpe
  libérée : la forme revient au premier plan du groupe, sans fond, d'un trait noir. », « Masque créé : l'élément du dessus masque 2
  formes ; le clair laisse voir, le sombre cache. », « Masque inversé : ce qui était caché se voit, ce qui se voyait est caché. »,
  « Masque libéré : 2 éléments reviennent au premier plan du groupe. » ; un refus du moteur (`MSG_DECOUPE`, `MSG_MASQUE`) se dit tel quel.
- **Les contextes d'édition `decoupe` et `masque` : non faits, et pourquoi.** Le contrat (`ContexteEdition.dans`) existe, mais
  l'éditeur édite **un** `DessinSvg`, celui de l'historique : la toile, la prise, le cadre, les aimants, l'inspecteur, les calques et
  chaque verbe (`lire().dessin`, `appliquer`) ne voient que `formes`. Éditer `{ vb, ...groupe.decoupe.contenu }` demande une lentille
  sur `lire`, `appliquer` et `ModeleDessin` (le contenu présenté comme un dessin, chaque résultat reposé dans son groupe, dans la même
  entrée d'historique), la numérotation commune (I1 : `prochainNumero` voit les contenus, mais `ajouterForme` sur la vue du contenu ne
  verrait pas le dessin), la peinture refixée des feuilles de découpe au retour (`feuilleDeDecoupe`) et la région d'un masque
  recalculée : un paquet à lui (8-D), pas une ligne de plus. **Le minimum utile, livré** : libérer rend la forme (ou le contenu du
  masque) **choisie**, au premier plan du groupe **devenu le contexte** (le fil d'Ariane le montre) ; on la modifie avec les outils
  ordinaires, puis Ctrl+A dans le contexte et « Créer une découpe » (ou « Créer un masque ») la repose — sur un groupe nouveau, dans
  l'ancien (`creerDecoupe` groupe toujours ; le fondre dans son parent changerait les références de l'étape 5).
- **« Libérer » d'une découpe : confirmé** (sans fond, trait noir de 1, opacité 1) : une découpe ne garde que la géométrie, il n'y a
  pas de peinture d'origine à rendre ; sans trait, la forme serait invisible et insaisissable ; le noir se voit sur le damier et sur le
  blanc, et se repeint d'un clic. La phrase le dit.
- **La section Effets** (`zones/SectionEffets.tsx`, une `Section` repliable de l'inspecteur, ouverte d'office quand le premier élément
  choisi a des effets) : case « Flou » (l'écart au curseur, en racine carrée de la borne pour la précision des petits écarts, et au
  champ chiffré « Écart du flou » ; un flou inégal lu le dit, « Flou inégal : 3 × 6. Régler l'écart le rend uniforme. ») ; case « Ombre
  portée » (« Décalage X », « Décalage Y », « Flou de l'ombre », couleur et code, opacité au curseur, la note « L'ombre ne tourne pas
  avec la forme. »). Les champs chiffrés s'appliquent à la validation, bornés par le moteur, et la borne atteinte se dit (« Flou :
  écart 50. Écart au plus 50. ») ; curseurs et sélecteur de couleur sont un geste fondu par sa clé (`effets:<champ>:<ids>`), clos en
  quittant le champ. **Un groupe choisi a désormais un inspecteur** (`InspecteurGroupe` dans `Inspecteur.tsx` : son nom, la section
  Effets, une aide pour entrer dans le groupe) — il n'en avait aucun. L'opération est pure, bloc « étape 8 » de la façade :
  `engine/edition/effetsOperations.ts` — `poserEffets(d, ids, reglage)` (un `ReglageEffets` champ par champ : absent ne change pas,
  `null` retire, un objet complète l'effet existant ou celui par défaut ; sur les racines de la sélection, feuilles — images et textes
  compris — et groupes, déverrouillés ; bornes `ecartMax`/`decalageMax` de la lecture, nombres au millième, couleur `#rrggbb` en
  minuscules, un flou garde un écart d'au moins `ECART_FLOU_MIN` = 0,001 parce que le projet refuse « un flou sans écart » ; le même
  dessin quand rien ne change, le champ `effets` retiré quand il n'en reste aucun, donc un dessin redevenu plat s'écrit comme avant),
  `flouParDefaut` (un centième du plus grand côté), `ombreParDefaut` (deux centièmes vers le bas et la droite, noire à 50 %),
  `effetsDe`. **Décision** : régler un champ d'ombre sur une sélection pose l'ombre sur chaque élément choisi, complétée par défaut
  là où il n'y en avait pas (la sélection prend le réglage affiché, comme Illustrator).
- **La phrase d'un flou approché** (renvoyée par 7-A) : `flousApproches(avant, apres)` (pur, mémorisé par dessin) compte les nœuds dont
  le flou inégal est devenu uniforme ; `useVeilleFlous` (monté par `ToileEditeur`) compare chaque état au précédent et dit une fois
  `MSG_EFFETS_OPERATIONS.approche` (« Flou approché : la transformation déforme un flou inégal ; il devient uniforme, d'écart moyen. »).
  Une échelle par axe qui égaliserait exactement les deux écarts compte aussi (rare ; la phrase reste vraie de ce qu'on voit).
- **Les pastilles des groupes** (renvoyées par 2-B) : `pastillesGroupe(g)` (`zones/lignesCalques.ts`) et `PastillesGroupe` dans
  `ArbreCalques.tsx` : **les icônes d'abord** (`decoupe`, `masque`, `flou`, `ombre`, `opacite`, nouvelles dans `icones.tsx`), puis les
  mots « découpe », « masque », « flou », « ombre », « opacité 50 % » — des **noms**, pour qu'aucune ne se lise comme l'état masqué
  (caché) de la ligne —, sur une bande d'une ligne : un mot qui ne tient pas passe à la ligne suivante, cachée (jamais rogné sous une
  bascule — axe le voyait recouvert —, jamais une deuxième hauteur de ligne : le fenêtrage la suppose constante). Dans le panneau des
  calques du bureau (≈ 210 px), on voit le plus souvent les icônes seules ; le **nom accessible de la ligne** dit tout
  (`porteParGroupe` : « Groupe « Cartes », 2 éléments, découpé, flou, opacité 50 % »), l'infobulle aussi. **Aucun jeton ajouté** :
  l'encre douce du nombre d'éléments (4,5:1 sur le panneau, confronté par le test des jetons ; sur le voile cyan à 18 % de la ligne
  choisie, 5,0:1 en clair et 4,8:1 en sombre, calculés, comme pour le nombre d'éléments) ; `pastille-groupe`, `contour-decoupe` et
  `contour-masque` attendent les contextes (8-D), qui en auront l'usage.
- **Le texte vivant dans un masque, décision** : le contenu d'un masque **s'écrit en contours** (`enContours`, dans l'écrivain du
  `<mask>` de `fonctions/masques.ts`, donc aussi sur la toile) ; le modèle garde le texte vivant (libérer le masque le rend retapable, le
  projet JSON le garde). La spécification de l'écriture (`invariants.ts`) reste fermée aux `data-ed-*` dans un `<mask>` : un masque est
  de la luminance, et un texte posé (ADR-0031) y perdrait son rang. Un SVG d'inconnu qui en porterait dans un `<mask>` se relit en
  contours à la réécriture (point fixe tenu). Aucune référence existante ne portait de texte dans un masque.
- **« Insérer une image… »** (menu Fichier, riche seulement, avant « Insérer depuis une adresse… ») et le **dépôt d'une image sur la
  toile** (riche seulement ; à plat aucun gestionnaire : un fichier déposé fait ce qu'il faisait) : `zones/InsererImage.tsx`
  (`useInsertionImage`, `useDepotImage`, `insererFichierImage` : au-delà de 4 Mo le fichier n'est pas lu) ; la lecture du fichier dans
  `io/fichiers.ts` (`donneesDuFichier` : `data:` base64, le type annoncé par le navigateur ou lu sur les premiers octets) ; la pose,
  pure, bloc « étape 8 » : `engine/edition/imagesOperations.ts` — `insererImage(d, donnees, centre, parent?)` (vérifiée par
  `verifierDonneesImage` de l'étape 12 : mêmes bornes, mêmes refus nommés ; 16 Mo par dessin, contenus des masques compris,
  `octetsImages`), `cadreImage` (taille naturelle, un pixel pour une unité, réduite pour tenir dans le plan, centrée sur le centre de
  la vue ramené dans le plan, au millième). L'image se pose au premier plan du groupe du contexte, choisie, l'outil sélection rendu ;
  « Image insérée : 40 × 30 pixels, au centre de la vue. Déplacez-la, tournez-la ou redimensionnez-la. », ou « Cette image n'est pas
  insérée : une image dont le contenu n'est ni un PNG, ni un JPEG, ni un GIF, ni un WebP. ».
- **Tests** : `tests/unit/engine/interface-contenus.test.ts` (poserEffets, bornes, groupes, verrous, projet, flousApproches,
  insererImage, refus, 16 Mo, masque à texte vivant), `v2/cas-interface-contenus.ts` (7 références `effets-op-*`, `images-op-*`,
  `masques-op-texte-vivant`, relues, point fixe, `violationsEcriture`/`violationsNettoyage`), `tests/unit/zones/contenus.test.ts`
  (commandes, porteur, verbes, pastilles) ; e2e `tests/e2e/decoupes-masques-effets.e2e.ts` (à plat rien ; au clavier : créer une
  découpe, la pastille et le nom de la ligne, la libérer ; créer et inverser un masque et le retrouver à l'enregistrement ; sans
  souris : flou et ombre depuis l'inspecteur, bornes dites, retrouvés à l'enregistrement ; « Insérer une image… » par le choix de
  fichier, un faux PNG refusé, le dépôt sur la toile ; axe sur un groupe découpé à effets, section Effets, pastilles, menu ouvert, en
  clair, sombre et au doigt).
- **Reste** : les contextes `decoupe`/`masque` et leurs jetons (8-D, ci-dessus) ; la phrase d'une région de masque élargie à la
  transformation ; la confirmation de `degrouper` sur un groupe découpé ou masqué (la phrase de 2-C dit déjà ce qui part, Ctrl+Z le
  rend) ; l'écart vertical d'un flou inégal n'a pas de champ (on le lit, on le rend uniforme) ; « Insérer depuis une adresse » (ADR-0036)
  n'accepte pas encore une image ; la vignette du site PHP refuse toujours `<image>`, `url(#ed-…)` ; « Créer un motif » (étape 9) se
  rangera au menu Édition à côté des découpes et masques (une ligne de `elementsContenus` ou de `useElementsEdition`) ; contraste forcé
  et WebKit sur ces écrans en CI ; la revue NVDA/VoiceOver (condition de la bascule).

### Ce que le paquet 8-D a posé (26 octobre 2026)

Aucun octet écrit d'avant ne bouge (références v1 gelées, références v2 existantes intactes : 5 références nouvelles, relues), la
lecture `plat` est inchangée, et **en modèle plat rien n'apparaît** (`elementsContenus` rend toujours `[]` : le test « à plat » de
l'étape 8 tient). On modifie maintenant le contenu d'une découpe ou d'un masque **sur place**, avec les outils ordinaires.

- **La lentille, pure** (`engine/edition/lentilles.ts`, bloc « paquet 8-D » de la façade) : `contenuEnDessin(d, groupe, genre)` présente
  le contenu comme un dessin de travail (le plan, le nuancier et les repères du dessin, les feuilles et les groupes du contenu, déjà
  dans le repère du plan ; mémorisé par contenu : deux appels rendent le même objet) ; `reposerContenu(d, groupe, genre, travail)` le
  remet à sa place et rend `{ dessin, renommes }` — **le même dessin quand rien n'a changé** (entrer puis sortir rend le même objet),
  le contenu ramené à ses invariants (`normaliser`), puis : (I1) chaque identifiant **neuf** du contenu qui reprendrait celui d'un nœud
  du reste du dessin prend un numéro au-delà de tous (`renommagesDe(dessin)` garde la table, pour que la sélection suive) ; (découpe)
  les feuilles refixées par `feuilleDeDecoupe` (fond, trait, opacité, texte, effets posés dans la lentille n'y entrent pas ; la règle des
  trous reste, c'est le `clip-rule`), les groupes réduits à nom, visibilité, verrou et découpe ; (masque) **la région suit le contenu
  quand elle le suivait** — elle valait la boîte visuelle du contenu et des enfants du groupe, comme `creerMasque` la pose —, sinon
  (région lue d'un fichier, masque inversé dont le fond blanc la couvre, `estFond` exporté de `edition/masques.ts`) elle ne bouge pas.
  Le plan (`vb`) ne change jamais par la lentille ; le nuancier et les repères, réglages du document, y passent dans les deux sens.
  `contenuVide(c)` : aucune feuille visible qui ait un tracé. `types.ts` et `fonctionnalites.ts` n'ont pas bougé.
- **Le contexte** (`ContexteEdition` dans `typesEditeur.ts`) : `{ groupe, dans?: 'decoupe' | 'masque' | 'motif', sous? }` — `sous` est le
  groupe **du contenu** où l'on est entré (absent : la racine du contenu) ; `motif` reste sans lentille (la tuile d'un motif, plus tard).
  `zones/lentille.ts` : `lentilleDe(c)`, `niveauEdition(c)` (le niveau dans le dessin qu'on voit : le groupe du contexte, ou dans une
  lentille `sous ?? null`), `avecNiveau(c, g)`, `contexteDuDessin(d, c)` (un groupe disparu ramène à la racine, un contenu disparu —
  libéré, annulé — laisse dans le groupe, un `sous` disparu ramène à la racine du contenu ; le même objet quand il reste valable),
  `dessinComplet(m)`. **Tous les consommateurs de `contexte?.groupe ?? null` passent par `niveauEdition`** (prise, survol, sortie par
  un clic, cadre, lasso, aimants, Tab, Page suivante, Ctrl+A, Espace, commandes de sélection, toile, calques).
- **L'état** (`etatEditeur.ts`) : `complet = h.present` ; dans une lentille, `dessin` (de `ModeleDessin` et de `lire()`) est le dessin de
  travail, `ModeleDessin.complet` et `EtatLu.complet` le dessin de l'historique (absents hors d'une lentille : `dessinComplet`). La
  sélection est faite d'identifiants du contenu ; un renommage I1 la suit (`renommagesDe`, puis la sélection gardée le prend). Ce qui
  vise **le dessin entier** lit `complet` : enregistrer, brouillon, `changement` de l'hôte, gestes de l'hôte, versions, téléchargements
  (SVG, à plat, autres formats), polices des crédits, « Ajuster », la préparation et les actions de production (jugées et corrigées
  sur le dessin entier, par `appliquerComplet`), `groupesActifs` (un contenu plat ne fait pas disparaître les commandes riches).
- **Les verbes** (`creerActions.ts`) : `appliquer(f, cle)` lit la lentille au moment de l'appel et, s'il y en a une, applique `f` au
  dessin de travail (avec la garde du texte et le suivi des textes posés, au niveau du contenu) puis `reposerContenu` : **un geste
  reste une entrée d'historique du dessin complet**, et Ctrl+Z revient à l'état d'avant en une fois (la lentille reste si le contenu
  existe encore). `appliquerComplet` pour ce qui vise le dessin entier. Les verbes du contexte vivent dans `zones/actionsContexte.ts`
  (nouveau ; `creerActions` dépassait la longueur permise) : `poserContexte` (validé sur le dessin complet), **`poserNiveau(g)`** (le
  niveau dans le dessin qu'on voit ; le choix d'une ligne des calques et la sortie par un clic l'emploient), `entrerGroupe` (dans une
  lentille, un groupe du contenu), `sortirGroupe` (dans une lentille : d'un groupe du contenu vers son parent, puis de la racine du
  contenu hors de la lentille), `deplier`. **`ac.modifierContenu(genre, groupe?)`** (`actionsContenus.ts`) : le groupe visé, ou le
  porteur de la sélection (`porteurDe`), devient `{ groupe, dans }`, le premier élément du contenu est choisi (les flèches le déplacent
  aussitôt, Tab parcourt les autres), l'outil sélection revient, et c'est dit. Libérer et inverser depuis la lentille visent son groupe
  dans le dessin complet ; libérer fait revenir dans le groupe (la lentille tombe d'elle-même, son contenu n'existe plus).
- **Entrer, sortir** : « Modifier la découpe » et « Modifier le masque » au menu Édition (après « Créer une découpe », « Créer un
  masque » ; grisés avec leur raison), et le **double-clic sur la pastille** « découpe » ou « masque » d'une ligne de groupe des calques
  (`data-pastille`, les icônes enveloppées dans `.pastille-icone`) ; ailleurs sur la ligne, le double-clic entre dans le groupe comme
  avant. Sortir : Échap (après le point et la sélection), Maj+Entrée, le fil d'Ariane (`Racine › Cartes › Découpe`, puis les groupes du
  contenu ; les niveaux du dessin sortent de la lentille, ceux du contenu y laissent : `remonterDansLentille` dans
  `commandesGroupes.ts`). **Décision : un contenu vide refuse la sortie** (il cacherait tout le groupe) et dit les trois issues —
  dessiner, annuler, « Libérer la découpe » (qui marche depuis la lentille) ; on reste dedans, Tab sort toujours de la toile (rien ne
  piège le focus) ; « Terminer » enregistre quand même (un `<clipPath>` vide se relit en point fixe). Un appui sur le vide dans la
  lentille garde la lentille (le cadre y commence) : on n'en sort pas par un clic dehors, parce que tout ce qui est dehors est inerte.
- **La toile** (`zones/ToileLentille.tsx`, nouveau) : le dessin complet, estompé (`hors-contexte`, l'opacité de 2-A) et inerte, tel qu'il
  s'écrit — le groupe découpé ou masqué par son contenu **du moment**, à chaque geste — ; par-dessus, le contenu, seul à prendre le
  pointeur : une découpe **toujours en contour** au jeton `contour-decoupe` (1,5 px, plus épais que la vue « contours ») ; un masque
  **tel quel**, cerné d'un filet `contour-masque` (on le voit même blanc sur le plan blanc) et sa région en tirets du même jeton.
  L'aperçu de la machine se retire dans une lentille. Contraste forcé : `CanvasText` (la sélection garde `Highlight`).
- **Jetons** : `contour-decoupe` `#8e5bd4` et `contour-masque` `#1e8f6a` (rôle `toile`, même valeur dans les deux thèmes, comme
  l'aperçu de la machine : le plan est blanc, sombre ou en damier quel que soit le thème) ; confrontés à 3:1 sur `toile-blanc`
  (4,57 et 4,04), `toile-sombre` (3,70 et 4,18) et `damier-b` (3,66 et 3,24) ; `docs/jetons.md` régénéré. `pastille-groupe` n'a
  toujours pas d'usage (les pastilles reprennent l'encre douce, étape 8).
- **Ce qui ne passe pas par la lentille, grisé avec sa raison** (`RAISONS_LENTILLE`, `phrasesContenus.ts`) : l'outil Texte (bouton
  grisé, touche T et Entrée ou double-clic sur un texte refusés et dits : une découpe n'en garderait que les contours, un masque
  l'écrit en contours) ; dans une découpe, l'apparence (l'inspecteur ne montre que les trous et une phrase), la section Effets,
  « Créer un masque », « Insérer une image… » et le dépôt d'une image ; une seconde lentille (« Modifier… » grisés dedans) ; les
  commandes qui visent l'autre contenu du groupe ; « Ajuster le plan de travail ». **Les booléens passent** (de la géométrie pure,
  refixée dans une découpe ; test). Une forme insérée de la bibliothèque, collée ou dupliquée entre dans le contenu.
- **Phrases** : « Dans la découpe du groupe « Cartes », 1 forme, tracée en contour : seule la forme compte ; le reste est estompé.
  Échap ou Maj+Entrée en sort. » (suivie de la sélection), « Dans le masque du groupe « Ciel », 1 forme : le clair laisse voir, le
  sombre cache ; … », « Découpe reposée. Dans le groupe « Cartes », 2 éléments. », « Masque reposé. … », « De retour dans la découpe
  du groupe « Cartes ». », la phrase du contenu vide, et les raisons ci-dessus.
- **Tests** : `tests/unit/engine/lentilles.test.ts` (aller-retour au même objet, déplacement valide et le reste au même objet,
  peinture refixée et groupes réduits, renumérotation I1 et `renommagesDe`, région qui suit, région lue et masque inversé qui ne
  bougent pas, plan inchangé, contenu vide) ; `tests/unit/zones/lentille.test.ts` (contexte ramené au dessin, entrer au menu, une
  entrée d'historique, annuler en une fois, sortir et sa phrase, copie renumérotée, booléen, contenu vide refusé puis libéré, refus
  du texte, des effets et d'une seconde lentille, masque par la pastille et sa région) ; `v2/cas-lentilles.ts` (5 références
  `lentilles-op-*` : déplacer, peindre — seul `clip-rule` reste —, dupliquer une découpe, repeindre un masque lu — sa région reste —,
  déplacer un masque créé — sa région suit ; relues, point fixe) ; e2e `tests/e2e/lentilles.e2e.ts` (au clavier : entrer dans une
  découpe, la déplacer, Ctrl+Z en une fois, Échap, « Terminer » et le `<clipPath>` déplacé ; de même pour un masque par Maj+Entrée ;
  contenu vide refusé, fil d'Ariane qui rend le focus à la toile, double-clic sur la pastille ; axe dans une découpe — menu ouvert —
  et dans un masque, en clair, sombre et au doigt).
- **Reste** : la tuile d'un motif (`dans: 'motif'`) par la même lentille (le contenu d'une tuile est dans son propre repère : il faudra
  une matrice à l'aller et au retour) ; la phrase d'une sélection dans une découpe nomme encore la peinture refixée (« fond noir ») ;
  les aimants et le cadre ne voient que le contenu (pas le reste du dessin, inerte) ; le premier clic sur une ligne de groupe des
  calques décale la liste d'une ligne (observé en e2e : un double-clic sur une ligne non choisie tombe sur la voisine ; hors de ce
  paquet, à regarder par 2-D) ; contraste forcé et WebKit sur ces écrans en CI ; la revue NVDA/VoiceOver (condition de la bascule).
  `tests/e2e/modele-riche.e2e.ts` « un brouillon écrit en riche… » a échoué trois fois (juste après une construction de la page, dont
  une fois dans la série complète), puis passé cinq fois de suite, sur la même construction : le brouillon écrit, présent avant le
  rechargement, n'y était plus après (un rechargement qui suit de près l'écriture) ; instrumenté, il a passé : cause non trouvée, à
  surveiller par 2-D.

### Caduc

- **Étapes 10 et 11** : faites autrement. `TexteVivant` porte `police { id, version?, famille? }`, une `matrice` obligatoire,
  `trace`, `disposition` ; l'écriture est celle de l'ADR-0022 §2 (tout encodé, ni `<title>` ni `role`, d'autres noms
  d'attributs : l'annexe 4 A §3 est caduque) ; `composerBloc` existe (`engine/texte/bloc.ts`) ; « Convertir en contours » est
  « Vectoriser » en trois modes. **Reste** de l'étape 10, confié à l'étape 1 (paquet B) : en mode riche, « Vectoriser : lettres
  séparées » rend **un groupe** nommé « Texte « … » » (annexe 4 A §2), et l'interface (étape 2) le dit.
- **Texte sur tracé** (annexe 4 A, « après la bascule ») : fait par l'ADR-0031 (un lien par identifiant). `<textPath>` reste
  refusé. Conséquence pour l'étape 1 : grouper, dégrouper, déplacer dans un groupe gardent les liens (`avecFormesPorteuses`,
  `relierCopie(s)`) ; une forme porteuse et son texte peuvent vivre dans deux groupes différents.
- **`util/empreinte.ts`** : il existait (ADR-0022) ; l'étape 0 n'a ajouté que `idDefinition` (`edition/definitions.ts`).
- **13c `<text>` étranger** : l'ADR-0020 le lit déjà en lettres quand la page donne les fontes (`io/texteSvg.ts`,
  `OptionsLecture.polices`). Restait à 13c : `<svg>` imbriqué, et en mode riche un `<text>` lu devient un groupe de lettres — fait
  (« Ce que l'étape 13c a posé »).
- **Nettoyage** (annexe 2 §6, R7) : `util/assainirSvg.ts` (ADR-0014) lit le document et réémet une liste blanche qui garde déjà
  tous les éléments du modèle v2 ; plus aucune expression ne mutile une valeur d'attribut. Ce qui reste à étendre, étape par
  étape, c'est la **spécification de l'écriture** (`violationsEcriture`), par `extensionsEcriture.ts`.
- **Corpus hostile** : il existe (`tests/fixtures/hostile/` et son `index.json`, ADR-0014). Les cas v2 y entrent **à plat**,
  préfixés `v2-<fonction>-…`, avec leur ligne d'`index.json` (pas de sous-dossier `v2/`).
- **CI multi-navigateurs** : faite (ADR-0016 : Chromium et Firefox bloquent, WebKit pas encore). G2 joue les trois ; le
  sous-ensemble `rendu-v2` (annexe 7 §6) y entre directement.
- **Exports concurrents** : DXF, EPS, PDF CMJN, PNG `pHYs`, ZIP et les fichiers de production (ADR-0018, 0028) existent ; ils
  prennent déjà un `DessinPlat` (étape 0).

### Ajouté par les ADR fusionnés depuis

- **Le projet JSON (ADR-0030) doit porter le modèle v2** : un projet rouvert perdrait en silence ce que `model/projet.ts`
  ne lit pas (« un champ inconnu n'y entre pas »). Chaque étape qui livre un champ le porte (validation dans `model/projet.ts`,
  aller-retour dans `engine/projet.ts`) et le passe à « porté » dans `projet-v2.test.ts`. **Règle de version** (proposée, à
  confirmer à l'étape 1) : un projet s'écrit en `version: 2` **seulement** si son dessin n'est pas plat, comme le marqueur
  `data-ed-modele` ; `MIGRATIONS[1]` est l'identité ; un programme v1 refuse un projet v2 en le disant (jamais « au mieux ») ;
  le serveur PHP admet déjà les versions 1 à 1000.
- **La vignette du site PHP** (`vignette_sure`, `outils/site-php/public/inc/projets.php`) refuse `url(`, `href`, `<image>` : un
  projet à dégradé, découpe, masque, effet ou image n'aura pas de vignette (rien ne casse). Chaque étape concernée choisit :
  l'accepter et le dire, ou admettre `url(#ed-…)` (et `data:image/…` à l'étape 12) dans cette fonction, avec son test PHP.
- **La prise par le calcul (ADR-0029)** : `engine/prise.ts` rend des feuilles ; à l'étape 2, `PriseToile.tsx`/`Gestes.ts`
  remontent à l'enfant du contexte d'édition (`ancetres`), et la prise ignore ce qui est hors du contexte.
- **Les calques en Cricut (ADR-0028)** : `CalquesOperations.tsx` range déjà la liste en deux groupes « À couper / À écrire ».
  L'arbre des calques de l'étape 2 doit coexister avec lui (en Cricut : l'arbre sous chaque opération, ou l'opération en
  pastille) ; décision de l'étape 2, paquet B.
- **Le texte posé (ADR-0031)** écrit le **rang** de sa forme parmi les chemins écrits : l'écriture riche le calcule sur les
  feuilles écrites, dans l'ordre (déjà le cas dans le squelette).
- **Les hôtes** : le site PHP (`src/site/`) et l'embarquement lisent par `lireDessin(svg)` (`projetSite.ts`, `embarque.tsx`,
  `Exporter.tsx`, `Versions.tsx`, `actionsDessin.ts`, `provenanceBibliotheque.ts`) : chacun passera le modèle à l'étape 2.

## 1. Les étapes

### Étape 0 — Coutures (aucun comportement ne change) · taille M · risque faible · **faite le 25 octobre 2026**

*Réalisée en un seul arbre (les quatre paquets A à D d'un coup) ; ce qui a été posé est listé au §0. Écarts au texte d'origine :
les six registres sont six familles de crochets d'**une** interface (`Fonctionnalite`) et d'**un** catalogue, plutôt que six
tables dans six fichiers ; `util/empreinte.ts` existait ; les exporteurs ne passent pas encore par `aplatirPour` (l'alias ne
l'exige pas ; l'étape 1 verrouille la marque et branche les appels, avec l'affichage des pertes).*

- **Toute la surface de types, d'avance** (annexe 1) : champs facultatifs de `Forme`, `Groupe`, `Contenu`,
  `Peinture`, `Effets`, `TexteVivant`, `ImageIntegree`, `DessinSvg extends Contenu`. Mesuré : 0 erreur de type
  pour un champ facultatif. Cela vide `types.ts` de tout conflit futur.
- `edition/arbre.ts` : `estPlat` (toujours vrai pour l'instant), `arbreDe`, `feuillesDe`, `unites`,
  `verifierDessin`, `normaliser` (identité sur un dessin plat).
- **Six registres vides**, pour que les étapes ajoutent des fichiers au lieu d'éditer des corps de fonction :
  (1) lecteurs d'éléments (`parcours.ts`), (2) fonctions prises en charge (`heritage.ts` : `refusDe`
  consulte un ensemble, vide), (3) écrivains d'attributs de feuille (`ecriture.ts`), (4) écrivains de
  définitions, (5) transformateurs de feuille et de groupe (`operations.ts` : `transformer` passe par
  `transformerFeuille`), (6) phrases d'`ignores` et règles de descente. Chaque registre se remplit **un fichier
  par fonctionnalité**.
- Sections délimitées dans la façade `editionSvg.ts` (un bloc par fonctionnalité).
- `OptionsLecture` (ignorée), `lireDessinMemo` à clé de mode.
- `engine/aplatir.ts` (identité), `Capacites`, `DessinPlat` (alias), signatures de `export/pdf.ts` et
  `export/svgs.ts`. `util/empreinte.ts`. `poidsDessin` (égal à `formes.length`) branché sur `limitePourTaille`.
- **Garde-fous livrés d'emblée** : manifeste `references-v1.sha256` et son test ; harnais de la loi du dessin
  plat et dossier `anciennes/` ; test d'architecture « `export/*` ne lit pas `groupes` ».
- Paquets : **A** types + arbre + invariants (P) ; **B** registres + options de lecture + façade (M) ;
  **C** descente + `DessinPlat` + signatures + architecture (P) ; **D** empreinte + gel des références + harnais (P).
  A d'abord (il tient `types.ts`) ; B, C, D ensuite en parallèle.
- Octets : **zéro différence** (G3). Retour : `git revert`.

### Étape 1 — Groupes : le moteur · taille G · risque moyen (le cœur du modèle) · **faite le 26 octobre 2026**

*Réalisée en un seul arbre (les trois paquets d'un coup) ; ce qui a été posé est listé au §0. Écarts aux consignes du §5.1 :*
*« Lettres séparées » en groupe est une fonction à côté (`vectoriserLettresEnGroupes`), le corps de `vectoriserTextes` ne change
pas (le choix du modèle appartient à l'interface, étape 2) ; `formesDeBase.ts` n'avait rien à changer (il ne construit que des
tracés) ; `isolation` n'a pas de phrase (sans mode de fusion, isoler ne change aucun rendu) ; la boîte d'un groupe pour
transformer et aligner est celle de ses feuilles sans le trait (loi 4 de l'annexe 7 §3 : redimensionner un groupe, c'est
redimensionner ses feuilles), la boîte visuelle (`boiteVisuelle`) servant à `ajusterPlan` ; un groupe sans feuille compte pour
`GROUPES_MAX` (une bombe de groupes vides est refusée sans rien construire) ; le nom tiré de l'identifiant (`id`) est gardé tel que
le plan le dit, y compris les identifiants automatiques d'Inkscape (« g2 ») ; un `<use>` à opacité ne devient pas un groupe (son
opacité se multiplie sur les feuilles du clone, comme en plat) ; la prise (`engine/prise.ts`) et la sélection par zone voient
encore les feuilles d'un groupe masqué ou verrouillé (leur fichier est à l'étape 2, qui y passe le contexte d'édition).*

- Lecture `riche` des `<g>`/`<a>` et de la structure des `<use>` (annexe 2) ; opacité de groupe ; noms ;
  bornes ; phrases `ignores` de `mix-blend-mode`/`paint-order`/`vector-effect` (deux modes).
- Écriture riche et marqueur ; `<g>` seulement ; pas de `<defs>`.
- Toutes les opérations du tableau de l'annexe 3 §2 + `grouper`, `degrouper`, `deplacerDans`, `renommer` ;
  isolement ; poids d'historique ; `DessinPlat` verrouillé par une marque de type ; règle de descente « groupe ».
- Fixtures `v2/groupes-*`, `v2/riche-*` (les 10), cas hostiles de profondeur et de bombes de groupes ; corpus
  `inkscape-calques`, `illustrator-calque`.
- Aucune interface : le mode ne s'atteint que par l'API et les tests.
- Paquets : **A** lecture + écriture (G) ; **B** opérations et lois (G) ; **C** descente, fixtures, hostiles,
  budgets `arbreDe` (M). A et B en parallèle (fichiers différents, interface fixée par l'étape 0), C ensuite.

### Étape 2 — Groupes : l'interface · taille G · risque élevé (accessibilité)

- Réglage `modele` (menu Édition, gardé par le `stockage` injecté) et propriété de l'éditeur.
- Contexte d'édition (état d'`Interface`), rendu récursif de la toile, `Gestes.ts` (clic → nœud du
  contexte), aimants et sélection au cadre au niveau du contexte.
- Calques en `treegrid` fenêtré, clavier complet, alternatives au glisser, « Déplacer vers… ».
- Commandes Grouper, Dégrouper, Entrer, Sortir ; fil d'Ariane ; phrases ; jetons ; « SVG à plat » (Fichier) ;
  décision Ctrl+G.
- e2e clavier, axe (écrans de l'annexe 6 §9), budgets de l'annexe 7 §4.
- Paquets : **0** les champs d'`Interface` et leurs verbes (P, d'abord) ; **A** toile + gestes + contexte (G) ;
  **B** calques en arbre + fenêtrage (G) ; **C** clavier, menus, phrases, jetons (M) ; **D** e2e, axe, perf (M).
  A, B, C en parallèle après 0 ; D à la fin.

### Étape 3 — Peinture : infrastructure des définitions, dégradés · taille G · risque moyen

- `edition/resolution.ts` (`url(#id)`, cycles, chaînes `href`), `edition/definitions.ts` (collecte, empreinte,
  dédoublonnage, `<defs>`), écrivain et lecteur de dégradés (unités, transformations, étalements, pourcentages),
  couleur de repli (OKLab), composition de matrice dans `transformerFeuille`, couleurs qui ignorent les
  peintures non unies, rendu de la toile (`<defs>` + `fill="url(#…)"` par les mêmes fonctions que l'écriture),
  règle de descente « repli », phrases.
- Fixtures dégradés ; hostiles (cycle de `href`, arrêts massifs, matrice nulle) ; corpus `figma-degrade`,
  `sketch-degrade-pourcent`, `inkscape-degrade-chaine`, `illustrator-degrade-decoupe` (moitié).
- Paquets : **A** résolution + définitions (M, d'abord) ; **B** dégradés lecture/écriture/opérations (G) ;
  **C** rendu de la toile + descente + fixtures (M). B et C en parallèle après A.
- *Révision (25 octobre 2026)* : `definitions.ts` (recueil, empreinte, dédoublonnage, `<defs>`) et la composition dans
  `transformerFeuille` (un crochet) existent depuis l'étape 0 ; le **branchement sur la toile** passe à l'étape 2 (paquet A, un
  rendu générique par les crochets d'écriture), l'étape 3 ne touche aucun fichier de `zones/`. Consignes : §5.
- **Faite le 26 octobre 2026** (les trois paquets en un arbre, aucune ligne de `zones/`). Ce qui a été posé :
  - `edition/resolution.ts` (paquet A) : `lireReference` (`url(#id)`, guillemets, couleur de secours, renvoi extérieur reconnu),
    `chaineHref` (bornée à `CHAINE_HREF_MAX` = 16, cycle et renvoi extérieur dits, cible d'un autre genre ignorée), `attributHerite`,
    `lireLongueur` (nombre, pixels, pourcentage ; une autre unité se dit), `lireFraction` ; bornes `PROFONDEUR_DEFS_MAX`,
    `NOEUDS_DEFS_MAX` pour les étapes 5 à 9.
  - `edition/fonctions/degrades.ts` (paquet B) et une ligne de `catalogue.ts` : `lecture.peinture` (linéaire et radial, `fx fy
    fr`, unités de boîte résolues par la boîte **locale** de la forme puis composées avec `pret.m`, pourcentages du plan,
    `gradientTransform`, `spreadMethod`, coordonnées héritées d'un dégradé du même genre seulement, arrêts du premier maillon qui en
    porte, triés, 64 au plus et dit, `stop-color`/`stop-opacity` par la cascade, `currentColor`, `transparent`) ; ce qu'un navigateur
    ne peint pas ne peint rien (référence absente ou d'un autre genre, avec sa couleur de secours s'il y en a une ; dégradé sans arrêt ;
    boîte plate ; matrice dégénérée), et c'est dit ; un seul arrêt, une longueur ou un rayon nuls peignent la couleur du dernier ;
    `ecriture.peindreFeuille` (la définition au recueil, `url(#ed-d-…)` à la place de la couleur, la forme repeinte mémorisée pour que
    le cache de l'écriture plate tienne) ; `transformation.feuille` (une translation déplace les coordonnées, le reste compose la
    matrice ; un même dégradé au fond et au trait reste un seul objet). Les phrases (`MSG_DEGRADES`, `REFUS_DEGRADES`) sont dans le
    fichier.
  - `edition/degrades.ts` : `poidsArrets` (chaque intervalle partagé par moitié), `couleurDeRepli` (moyenne OKLab pondérée par la part
    et l'opacité), `transformerDegrade`, `definitionDegrade` — l'écriture **canonique** : un linéaire se ramène toujours, exactement, à
    un dégradé du plan sans matrice (la couleur d'un point est une fonction affine, deux extrémités l'expriment) ; un radial garde une
    matrice ramenée à un déterminant de 1 quand ce n'est pas une similitude (l'échelle passe dans les grandeurs, qui gardent la
    précision du plan), aucune sinon. Le modèle, lui, garde le dégradé tel qu'il a été lu (coordonnées de son repère, matrice
    composée) : les transformations sont exactes, l'écriture choisit. Point fixe vérifié sur toutes les fixtures et sur 400 dégradés
    tirés au hasard (graine imprimée).
  - Couleurs (paquet B) : `fondUni`/`traitUni` (`edition/couleurs.ts`) ; `couleursDuDessin`, `groupesDeCouleur`, `idsDeCouleur`,
    `idsMemeCouleur`, `remplacerCouleur(Sur)`, les nuances proches et leur fusion (et par eux les palettes) ignorent **le côté** peint
    d'un dégradé ou d'un motif, l'autre côté reste une couleur ; `memesCouleurs` voit qu'on pose ou retire une peinture. Anciens corps
    dans `anciennes/couleurs.ts`, `anciennes/couleursProches.ts`, cas dans `loi-dessin-plat.test.ts`.
  - **Nuancier** (ADR-0037), décision : une forme à dégradé apporte **les couleurs de ses arrêts**, chacun pour sa part du dégradé
    et à son opacité, jamais la couleur de repli ; un motif, rien encore. Le nuancier ne remplace rien (il lit), la règle « jamais un
    repli qui change sans que le dégradé change » ne le concerne pas, et un logo en dégradés aurait sinon un nuancier vide. Ancien
    corps de `apportsDe` dans `anciennes/nuancier.ts`.
  - `engine/descente/degrades.ts` (paquet C), premier de `REGLES_DESCENTE` : la peinture part, la couleur de repli reste, « les
    dégradés (remplacés par leur couleur moyenne) » ; `natif` garde le dégradé (le PDF à l'étape 13 a) ; `raster` et `refus`
    descendent comme `approche`. **Par exporteur** (`export/capacites.ts`, inchangé) : SVG et PNG écrivent le dégradé ; SVG « à plat »,
    PDF, SVG de découpe, DXF, EPS et fichiers de production reçoivent la couleur de repli. Les exporteurs ne passent pas encore par
    `aplatirPour` (l'étape 1, paquet C, le branche dans `zones/`), mais ne lisant que `remplissage`/`contour`, ils écrivent déjà la
    couleur de repli.
  - Projet JSON (ADR-0030) : `model/projetV2/peinture.ts` (validation : genre linéaire ou radial, un motif refusé en le nommant,
    2 à 64 arrêts qui ne reculent pas, `#rrggbb`, matrice de six nombres, bornes du projet), `engine/projetV2/peinture.ts`
    (aller-retour champ pour champ), branchés par **le cadre du paquet 1-C posé ici** : `model/projetV2/champs.ts` (une ligne par
    champ : clé, lecteur, garde I5) et `engine/projetV2/champs.ts` (une ligne d'aller-retour) ; `VERSION_PROJET` = 2,
    `VERSION_PROJET_PLAT` = 1 (un dessin plat s'écrit au format 1, octet pour octet), `MIGRATIONS[1]` est l'identité et `migre` ne
    vaut vrai que si une migration a changé quelque chose (un projet au format 1 ne s'annonce pas « complété ») ; un champ v2 dans un
    projet au format 1 y est inconnu, donc ignoré. `projet-v2.test.ts` : les deux peintures « porte ».
  - Vignette du site PHP : `vignette_sure` admet une valeur d'attribut **entière** `url(#ed-d-<14 hex>)` (remplacée par `none` le temps
    du contrôle) ; tout autre `url(` reste refusé ; test PHP.
  - Tests : `v2/cas-degrades.ts` (12 lectures, 6 transformations, 3 fichiers du corpus `figma-degrade`, `sketch-degrade-pourcent`,
    `inkscape-degrade-chaine` dans `tests/fixtures/svg/corpus/`, références dans `v2/`) ; `degrades.test.ts` (résolution, lecture,
    lecture plate refusée avec la phrase d'aujourd'hui, partage, point fixe aléatoire, `violationsEcriture` et `violationsNettoyage`
    sur chaque cas, une définition pour 5 000 formes) ; `descente-degrades.test.ts` ; `couleurs-degrades.test.ts` ; 14 hostiles
    `v2-degrades-*` (cycle, 2 000 arrêts, matrice nulle, `stop-color` en `url(http…)`, `href` et `fill` extérieurs, chaîne de 21,
    référence absente ou d'un autre genre, coordonnée démesurée, `id` en double, style qui réintroduit une adresse, entités qui
    composent `javascript:`, unités inconnues), passés en mode plat par `corpus.test.ts` et en mode riche, sur les deux chemins, par
    `securite/degrades-hostiles.test.ts` ; l'extension d'écriture « étape 3 : degrades » (et `data-ed-modele="2"` sur la racine).
- *Écarts au §5.2* : (1) le crochet `lecture.peinture` ne sait rendre qu'une peinture du modèle, pas « rien » ni une couleur de
  secours : la fonctionnalité rend une peinture marquée que son crochet `feuille` remplace aussitôt (aucune ne survit à la lecture) ;
  à l'étape suivante qui touche `fonctionnalites.ts`, le chef de chantier peut laisser `peinture` rendre aussi une couleur (`{ couleur,
  alpha }`). (2) Le cadre du projet (version, lecteur par champ) devait venir de l'étape 1 : posé ici, à la forme que le §5.1 décrit,
  pour que les dégradés soient portés dès la fusion ; l'étape 1 n'y ajoute que ses lignes (`parent`, `groupes` — ce dernier au
  niveau du dessin, hors de la liste des champs de forme). (3) Un million d'arrêts dépasse la borne des éléments de l'analyse XML
  (1 000 000) : refusé là ; 999 000 arrêts exercent `ARRETS_MAX` (le test le fait, le fichier commis en porte 2 000). (4) Le corpus
  se joue par le harnais v2 (`entree: '../corpus/…'`) ; l'équivalence pixel (`rendu-v2`) reste à l'étape d'interface qui ouvre l'e2e
  (2 ou 4). (5) `illustrator-degrade-decoupe` attend les découpes (étape 5). (6) Les listes de couleurs ignorent un **côté** plutôt
  qu'une forme entière, par deux lectures (`fondUni`, `traitUni`) qui rendent le champ tel quel sur un dessin plat, plutôt qu'un
  `if (estPlat) return <corps>` qui dédoublerait chaque corps (la loi du dessin plat le prouve). *Points de rencontre avec l'étape 1* :
  une ligne de `catalogue.ts`, de `REGLES_DESCENTE` (les groupes en dernier), de `extensionsEcriture.ts` (le marqueur), le bloc
  « étape 3 » de la façade, `model/projet.ts`, `engine/projet.ts`, `model|engine/projetV2/champs.ts`, `projet-v2.test.ts`,
  `loi-dessin-plat.test.ts`. Retour : `git revert -m 1 <fusion>` (un dessin plat ne bouge pas ; un projet au format 2 deviendrait
  illisible, refusé en le nommant).

### Étape 4 — Dégradés : l'interface · taille M · **faite le 26 octobre 2026** (§0, « Ce que l'étape 4 et le paquet 7-B ont posé »)

Section Remplissage/Contour, liste d'arrêts, champs, poignées de la toile (curseur-glisseur), clavier, phrases,
jetons, axe, e2e. Paquets : **A** panneau + liste (M) ; **B** poignées de toile + clavier (M).

### Étape 5 — Découpes · taille G · **faite pour le moteur le 26 octobre 2026** (§0, « Ce que l'étape 5 a posé »)

`Decoupe`, lecture de `<clipPath>` (unités, transformations, imbrication, `<use>`), écriture, `creerDecoupe`/`liberer`,
fermeture à la transformation, `boiteVisuelle` (découpe) et `ajusterPlan`, rendu de la toile, **descente exacte
par intersection booléenne** des remplissages (`aplatir.ts`), fixtures, hostiles (cycles, bombes), corpus
`inkscape-decoupe`, `figma-cadre-decoupe`, `illustrator-degrade-decoupe` (reste). Paquets : **A** lecture/écriture (G) ;
**B** opérations + boîtes (M) ; **C** descente + toile (M).

### Étape 6 — Masques d'opacité · taille M · **faite pour le moteur le 26 octobre 2026** (§0, « Ce que l'étape 6 a posé »)

`Masque` (luminance, alpha, région), lecture de `<mask>`, écriture, création/libération/inversion, rendu,
descente (ignoré et dit, ou image), corpus `figma-trait-interieur`, `sketch-masque-use`. Après 5 (contenu et
région partagent son infrastructure).

### Étape 7 — Effets · taille G · risque moyen (performance) · **paquets 7-A et 7-B faits le 26 octobre 2026** (§0)

`Effets`, lecture du sous-ensemble (annexe 4 B §3), écriture des formes exactes, région calculée, `boiteVisuelle`
(effets) et `ajusterPlan`, rendu de la toile avec mode brouillon pendant les gestes, plafonds, descente
(abandonnés, dits ; PDF raster à l'étape 13 si l'agent des exports a livré le DPI), mesures et budgets,
corpus `inkscape-flou`. Paquets : **A** moteur (G) ; **B** toile + brouillon + mesures (M).

### Étape 8 — Découpes, masques, effets : l'interface · taille G · **faite le 26 octobre 2026**, contextes `decoupe`/`masque` compris (paquet 8-D ; §0, « Ce que l'étape 8 a posé » et « Ce que le paquet 8-D a posé »)

Menu Objet, contextes `decoupe`/`masque`, section Effets, phrases, jetons, axe, e2e. Après 5, 6, 7 et 2.
Paquets : **A** menus + contextes (M) ; **B** section Effets (M) ; **C** e2e/axe (M).

### Étape 9 — Motifs · taille M · **faite pour le moteur le 26 octobre 2026** (§0, « Ce que l'étape 9 a posé »)

`Motif` (unités, viewBox, `patternTransform`, `href`), lecture/écriture, rendu, descente « repli », « Créer un
motif depuis la sélection » (contexte `motif`), corpus `motif-hachures`. Après 5.

### Étape 10 — Texte vivant : moteur et lecteur de fonte · taille G · **faite autrement** (ADR-0022, 0027, 0031, 0032 ; reste : §0, « Caduc »)

`TexteVivant`, `composerBloc`, `poserTexte`, `convertirEnContours`, lecture/écriture `data-ed-*` et encodage,
`PoliceRef` (fontes livrées par id, fonte déposée par empreinte), bornes, hostiles (annexe 7 §5), fixtures,
`dessinableEnPoints`. Peut **commencer dès l'étape 0** (le moteur de texte ne dépend pas des groupes) ;
`convertirEnContours` attend l'étape 1. Paquets : **A** `composerBloc` + `TexteVivant` (M) ; **B** lecture/écriture
+ encodage (M) ; **C** `io/polices` : id, empreinte, fonte absente (M).

### Étape 11 — Texte vivant : l'interface · taille M · **faite** (ADR-0022, 0027, 0031, 0032)

Panneau d'un texte vivant, « Fonte absente », « Convertir en contours », phrases, axe, e2e. Après 10 et 2.

### Étape 12 — Images · taille M · **faite pour le moteur le 26 octobre 2026** (§0, « Ce que l'étape 12 a posé »)

`ImageIntegree`, `dimensionsImage`, lecture/écriture (`xmlns:xlink`), toile, bornes, poids d'historique, descente,
ouverture des SVG « enveloppés tel quel ». Peut commencer dès l'étape 0. *Révision : le poids d'historique (`poidsDessin`) et
`xmlns:xlink` dans l'écriture riche existent depuis l'étape 0 ; la toile passe à l'étape 2 ; consignes : §5.*

### Étape 13 — Exports natifs et idiomes d'éditeurs · taille G, quatre lots indépendants

- **13a PDF natif** : `shading` axial/radial, découpe `W n`, masque doux, motif de pavage, image XObject,
  raster des effets ; avec l'agent des exports (même fichier `export/pdf.ts`) · après 3, 5, 6, 12 · **fait le 26 octobre 2026, sauf le
  raster des effets** (§0, « Ce que l'étape 13a a posé »).
- **13b Reconnaisseurs d'idiomes de filtres** (Figma, Sketch, Illustrator `Adobe_OpacityMaskFilter`) · après 6, 7.
- **13c `<svg>` imbriqué**, et en mode riche un `<text>` lu en **groupe** de lettres · après 1 · **fait pour le moteur le 26 octobre 2026** (§0). *Révision : le `<text>` étranger
  se lit déjà en lettres, polices remplacées et dites (ADR-0020, `io/texteSvg.ts`) ; la liste `aComposer` est caduque.*
- **13d Couleurs** : arrêts de dégradé et motifs traités par `remplacerCouleur`, palettes et listes · après 3, 9.

### Étape 14 — Bascule · taille P, risque : de communication

`modele: 'riche'` par défaut **dans la page** (le défaut de l'embarquement ne change pas : question 3), revue
manuelle d'un lecteur d'écran, matrice multi-navigateurs bloquante, Inkscape/resvg sur un échantillon, README,
`docs/integration.md`, amendements de `CLAUDE.md` (texte vivant ; exemples de décisions), ADR-0012 « acceptée »,
CHANGELOG (version majeure : les SVG à `<g>` se réécrivent avec leurs groupes ; nouvelles fonctions), numéro de
version. Un seul commit de valeurs par défaut : le retour en arrière est un `git revert`.

## 2. Dépendances et vagues (révisées le 25 octobre 2026)

```
S0 (fait) ─┬─ S1 ─┬─ S2 ─────────────────────┬─ S8 ─┐
           │      │   └─ (toile générique) ─ S4B, S7B │
           ├─ S3 ─┼─ S4 (A après S2-0, B après S2-A)   ├─ S13a..d ─ S14
           │      ├─ S5 ─┬─ S6 ─────────────┤      │
           │      │      └─ S9 ─────────────┘      │
           │      └─ S7 (A ; B après S2-A) ────────┘
           └─ S12
S10, S11 : faites (ADR-0022, 0027, 0031, 0032)
```

| Vague | Étapes qui peuvent tourner en parallèle, chacune dans son arbre de travail |
|---|---|
| 0 | S0 — **fait** |
| 1 | **S1, S3, S12** (trois arbres ; aucun ne dépend d'un autre : ils entrent par le catalogue ; ils fusionnent dans l'ordre d'arrivée, le suivant rebase — conflits attendus : une ligne de `catalogue.ts`, de `REGLES_DESCENTE`, de `extensionsEcriture.ts`, d'`index.json` des hostiles, de `projet-v2.test.ts`, et son bloc de la façade) |
| 2 | **S2** (après S1), **S5** (après S1 et S3-A), **S7** paquet A (après S3-A), **S4** paquet A (après S3 et S2-0) ; puis S4-B et S7-B après S2-A |
| 3 | S6, S9 (après S5) |
| 4 | S8 (après S2, S5, S6, S7), S13a à S13d (selon leurs prérequis) |
| 5 | S14 |

**Obligatoirement en série** : S0 avant tout (fait) ; S1 avant S2, S5 ; S3-A (résolution) avant S5, S7 ; S3 avant S4 ; S2-0
avant S4-A ; S2-A (toile générique) avant S4-B et S7-B ; S5 avant S6 et S9 ; S5, S6, S7 avant S8 ; tout avant S14. Le portage
dans le projet JSON (§0) d'une étape de vague 1 autre que S1 attend la fusion de S1, qui en pose le cadre (version, lecteur
par champ) : S3 et S12 écrivent leurs fonctions de projet dans leurs propres fichiers dès le début et ne branchent qu'à la fin.
Au-delà de quatre arbres simultanés, le coût des fusions dépasse le gain.

**Chantiers concurrents à surveiller** (en cours le 25 octobre 2026) : formes de base (`engine/edition/formes*`,
`formesDeBase.ts`, `BarreOutils`, `PanneauDessin`, `icones`) — S1-B touche `formes.ts` après eux ; outils de sélection
(`Gestes`, `MenusBarre`, `BarreOutils`, `engine/selection`) — S2 après eux ; liste des polices (`ChoixPolice`, `BarreTexte`) —
aucun recouvrement ; ouverture par adresse (`Application.tsx`, `io`, `outils/site-php`) — S2 (modèle des hôtes) et la vignette
PHP ; nuancier (`engine/nuancier`, `Application.tsx`) — S3 (les peintures non unies ignorées par les listes de couleurs).

## 3. Carte des conflits (fichiers d'aujourd'hui)

« ● » : l'étape édite ce fichier (au-delà d'une ligne d'enregistrement). « · » : une ligne dans une liste (catalogue, règles,
extensions, index), un bloc de la façade, ou un fichier par fonctionnalité dans un dossier partagé. Vide : l'étape n'y touche
pas. Depuis l'étape 0, une fonctionnalité **entre par les crochets** : elle n'édite ni `parcours.ts`, ni `heritage.ts`, ni
`ecriture.ts`, ni `ecritureRiche.ts`, ni `operations.ts`, ni `transformation.ts`, ni `types.ts`.

| Fichier | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 | S9 | S12 | S13 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `edition/types.ts`, `fonctionnalites.ts` | | | | | | | | | | | |
| `edition/catalogue.ts` | · | | · | | · | · | · | | · | · | |
| `edition/fonctions/<nom>.ts` (nouveau, un par fonctionnalité) | · | | · | | · | · | · | | · | · | · |
| `editionSvg.ts` (façade, un bloc par étape) | · | | · | | · | · | · | | · | · | |
| `edition/parcours.ts`, `lecture.ts` | ● | | | | | | | | | | · |
| `edition/ecritureRiche.ts` | ● | | | | | | | | | | |
| `edition/operations.ts`, `assemblage.ts`, `nettoyage.ts`, `isolement.ts`, `formes.ts`, `formesDeBase.ts`, `booleens.ts` | ● | | | | | | | | | | |
| `edition/groupes.ts` (nouveau) | ● | | | | | | | | | | |
| `edition/etendue.ts` (`boiteVisuelle` par le crochet `etendue`) | ● | | | | | | | | | | |
| `edition/resolution.ts` (nouveau) | | | ● | | · | · | · | | · | | |
| `edition/couleurs.ts`, `couleursProches.ts`, `engine/palettes.ts`, `engine/nuancier*` | | | ● | | | | | | · | | ● (13d) |
| `edition/decoupes.ts`, `masques.ts`, `effets.ts` (opérations, nouveaux) | | | | | ● | ● | ● | | | | |
| `engine/texte/vectoriser.ts` (lettres séparées en groupe) | ● | | | | | | | | | | |
| `engine/aplatir.ts` (`DessinPlat`, `REGLES_DESCENTE`) | ● | | · | | · | · | · | | · | · | · |
| `engine/descente/<nom>.ts` (nouveau, un par fonctionnalité) | · | | · | | · | · | · | | · | · | · |
| `engine/prise.ts`, `navigation.ts`, `transformations.ts` | | ● | | | | | | · | | | |
| `engine/description.ts` | | ● | | · | | | | · | | | |
| `model/projet.ts`, `engine/projet.ts` | ● | | · | | · | · | · | | · | · | |
| `export/pdf.ts` | | | | | | | | | | | ● (13a) |
| `zones/actionsExport.ts`, `actionsProduction.ts` (`aplatirPour`, pertes) | ● | | | | | | | | | | |
| `zones/Toile.tsx`, `ToileEditeur.tsx` (rendu par nœud, `<defs>` générique) | | ● | | · | | | · | · | | | |
| `zones/PriseToile.tsx`, `Gestes.ts` | | ● | | · | | | | · | | | |
| `zones/Calques.tsx`, `CalquesOperations.tsx` | | ● | | | | | | | | | |
| `zones/Inspecteur.tsx`, `PanneauDessin.tsx`, `InspecteurTexte.tsx` | | | | ● | | | | ● | | | |
| `zones/BarreTexte.tsx`, `SaisieTexte.tsx`, `DispositionToile.tsx` | | · | | | | | | | | | |
| `zones/Clavier*.ts`, `MenusBarre.tsx`, `BarreOutils.tsx`, `BarreSelection.tsx` | | ● | | · | | | | ● | | | |
| `zones/contexteEditeur.tsx`, `etatEditeur.ts`, `creerActions.ts`, `typesEditeur.ts`, `actions*.ts` | | ● | | · | | | | · | | | |
| `zones/phrasesSelection.ts`, `annonces.ts`, `phrasesTexte.ts` | | ● | | · | | | | · | | | |
| `zones/lecture.ts`, `Exporter.tsx`, `Versions.tsx`, `session.ts`, `EditeurSvg.tsx`, `embarque.tsx`, `Application.tsx`, `src/site/*` | | ● | | | | | | | | | |
| `src/styles/jetons.ts` (+ `docs/jetons.md` régénéré après fusion) | | ● | | ● | | | | ● | | | |
| `outils/site-php/public/inc/projets.php` (`vignette_sure`, facultatif) | | | · | | · | · | · | | · | · | |
| `tests/unit/securite/extensionsEcriture.ts` | · | | · | | · | · | · | | · | · | |
| `tests/unit/securite/invariants.ts` (attributs du texte sous un `<g>`) | ● | | | | | | | | | | |
| `tests/fixtures/hostile/index.json` (+ fichiers `v2-<nom>-…`) | · | | · | | · | · | · | | · | · | · |
| `tests/unit/engine/v2/cas-<nom>.ts`, `tests/fixtures/svg/v2/<nom>-*` | · | | · | | · | · | · | | · | · | · |
| `tests/unit/engine/anciennes/*`, `loi-dessin-plat.test.ts` | ● | | · | | · | | · | | | · | |
| `tests/unit/engine/projet-v2.test.ts` | · | | · | | · | · | · | | · | · | |
| `tests/fixtures/svg/references-v1.sha256` | jamais | | | | | | | | | | |
| `CHANGELOG.md` | chef de chantier, à chaque fusion | | | | | | | | | | |

Lecture de la carte :

- **S1 est le seul foyer lourd du moteur** : il garde `parcours.ts`, `lecture.ts`, `ecritureRiche.ts`, les opérations et le cadre
  du projet. S3 et S12 tournent à côté parce qu'ils n'entrent que par des fichiers à eux et des lignes de liste.
- **`Toile.tsx`** : S2-A le découpe en un rendu par nœud et un rendu **générique** des peintures, attributs et définitions par les
  crochets d'écriture (ce qui se voit est ce qui s'écrit) ; S4-B et S7-B n'y ajoutent que leurs poignées et le mode brouillon.
- **`jetons.ts`** : S2, S4 et S8 ne tournent pas en parallèle sur ce fichier ; `docs/jetons.md` se régénère après la fusion
  (`ACTUALISER_REFERENCES=1 npx vitest run tests/unit/styles`), jamais à la main.
- **`etendue.ts`** : S1 y branche le crochet `etendue` (une fois) ; S5 et S7 n'y touchent plus, ils remplissent le crochet.

## 4. Définition de « terminé » d'une étape

Les huit portes de l'annexe 7 §1 ; la règle de descente de la fonctionnalité ; ses fixtures, relues ; ses cas hostiles ; ses
phrases parlées ; son retour en arrière décrit en une ligne dans la PR ; aucune référence v1 modifiée ; le mode `plat` inchangé
(loi du dessin plat) ; pour une étape d'interface, axe et e2e clavier. **Depuis l'étape 0, en plus** :

- `references-v1-gelees.test.ts` vert **sans** régénérer le manifeste ;
- le **contrat des fonctionnalités** vert pour la sienne (`fonctionnalites.test.ts`, rien à écrire : il lit le catalogue) ;
- toute fonction existante dont le **corps** change (hors crochets) : l'ancien corps recopié dans `anciennes/` d'abord, son cas
  dans `loi-dessin-plat.test.ts` ;
- ses cas dans `tests/unit/engine/v2/cas-<nom>.ts`, verts **avec le point fixe** (relire l'écrit le réécrit à l'identique) ;
- son extension dans `extensionsEcriture.ts` : l'écriture de chaque cas passe `violationsEcriture` et `violationsNettoyage` ;
- ses champs **portés par le projet JSON** (`projet-v2.test.ts` : « porte ») — ou, pour S3 et S12, prêts dans leurs fichiers et
  branchés dès la fusion de S1 ;
- `npm run verifier`, `npm run construire`, `npm run test:php` verts ; e2e Chromium sur les fichiers touchés pour une étape
  d'interface (les trois moteurs en CI) ;
- un texte de CHANGELOG proposé (le chef de chantier fusionne et l'écrit).

## 5. Consignes des paquets d'agent, vagues 1 et 2

### 5.0 Pour tous

- **Base** : `main` après la fusion de l'étape 0. Une branche `claude/v2-<etape>-<sujet>`, un arbre sous `.claude/worktrees/`.
  Lire `CLAUDE.md`, l'ADR-0012 et les annexes 1 à 7 (la partie de sa fonctionnalité), les ADR-0022, 0028, 0029, 0030, 0031 pour
  ce qu'ils fixent, et `edition/fonctionnalites.ts` (le contrat des crochets, en tête de fichier).
- **Une fonctionnalité** = `src/engine/edition/fonctions/<nom>.ts`, qui exporte `export const <nom>: Fonctionnalite = { nom:
  '<nom>', lecture, ecriture, transformation, etendue }`, et **une ligne** dans `catalogue.ts`, à sa place (groupes, degrades,
  decoupes, masques, effets, motifs, images). Un fichier de fonctionnalité n'importe ni `parcours.ts`, `lecture.ts`,
  `ecriture.ts`, `ecritureRiche.ts`, `operations.ts`, `transformation.ts`, ni `catalogue.ts` (le test des cycles le refuse) : la
  marche (`Marche`) et le contexte d'écriture (`ContexteEcriture`) lui donnent ce qu'il faut. Ses phrases de refus et
  d'`ignores` vivent dans son fichier. Sa règle de descente : `src/engine/descente/<nom>.ts` (une `RegleDescente`) et une ligne
  dans `REGLES_DESCENTE`.
- **Jamais** : éditer `types.ts` ou `fonctionnalites.ts` (un type ou un crochet manque : le dire au chef de chantier, qui
  l'ajoute sur `main`) ; lancer `ACTUALISER_REFERENCES=1` sur `ecriture-stable.test.ts` ; régénérer
  `references-v1.sha256` ; changer la lecture `plat` ; écrire un `id` hors d'une définition ; lire `groupes` ou un champ v2 dans
  `src/export/`.
- **Tests** : ses cas d'écriture dans `tests/unit/engine/v2/cas-<nom>.ts` (`CAS: readonly CasV2[]`), entrées et références dans
  `tests/fixtures/svg/v2/<nom>-*.svg` (`ACTUALISER_REFERENCES=1 npx vitest run tests/unit/engine/ecriture-stable-v2.test.ts`
  ne touche que ce dossier ; relire chaque fichier) ; ses hostiles dans `tests/fixtures/hostile/v2-<nom>-*.svg` avec leur ligne
  d'`index.json` ; son extension d'écriture dans `tests/unit/securite/extensionsEcriture.ts` ; ses tests unitaires dans
  `tests/unit/engine/<nom>.test.ts`. Le mode `plat` de chaque fixture v2 doit refuser avec la phrase d'aujourd'hui (annexe 7
  §3, point 9).
- **Rendre** : branche et dernier commit, fichiers existants changés (liste exacte), résultats des trois commandes, texte de
  CHANGELOG proposé, ce qui reste ou a été décidé (questions de l'annexe 9).

### 5.1 Étape 1 — Groupes, le moteur (vague 1)

**Paquet 1-A — lecture et écriture riches des groupes** (G ; en parallèle de 1-B).

- *Créer* : `edition/fonctions/groupes.ts` (lecteurs `g` et `a` en mode riche : un `Groupe` par élément, `id` `g<n>` d'un
  compteur de la marche, nom lu de `data-ed-nom` (décodé, comme `decoderTexte`), `inkscape:label`, `data-name`, `id` ;
  `opacite` gardée sur le groupe et **non** multipliée sur les feuilles ; `completerGroupe` appelé ; groupe sans feuille
  retiré ; `PROFONDEUR_GROUPES_MAX` et `GROUPES_MAX` refusés en le nommant ; écrivain `attributsGroupe` : `opacity` au rang
  `RANG_GROUPE.opacite`, `data-ed-nom` encodé en pourcentage au rang `RANG_GROUPE.nom`), une ligne de `catalogue.ts`,
  l'extension d'écriture (`<g>` à toute profondeur ≥ 1, `opacity` et `data-ed-nom` sur `<g>`, `data-ed-modele="2"` sur la
  racine).
- *Toucher* : `parcours.ts` et `lecture.ts` (le parent courant dans `Contexte`, `parent` posé par `poserForme`, la table
  `groupes` rendue par `lireDessin` en riche seulement, l'opacité de groupe qui ne se multiplie plus en riche, la structure
  d'un `<use>` gardée) ; `lecture.ts` refuse un `data-ed-modele` **supérieur** à `VERSION_MODELE` dans les deux modes (« ce
  fichier vient d'une version plus récente de l'éditeur ») ; les phrases d'`ignores` de `mix-blend-mode`, `isolation`,
  `paint-order`, `vector-effect` dans les deux modes (dans un fichier à elles, `edition/fusion.ts` ; elles changent des
  messages, jamais des octets : relire les assertions d'`ignores` des fixtures concernées) ; `ecritureRiche.ts` si le squelette
  doit bouger (S1 en est le seul propriétaire) ; `tests/unit/securite/invariants.ts`, une seule règle : les attributs du texte
  vivant admis sur un `<path>` sous un `<g>` (aujourd'hui « profondeur 1 »).
- *Tests* : lecture riche des 10 entrées v1 à `<g>` (`evenodd-opacite`, `fidelite-lecture`, `lecture-css-selecteurs`,
  `lecture-use-imbriques`, `lecture-use-sprite`, `masquees-verrouillees`, `peintures`, `racine-heritage`,
  `trait-pointilles`, `transformations`) en cas `v2/riche-<cas>` (entrée `../<cas>`, référence relue une à une) ;
  `v2/groupes-*` (imbriqués, opacité, nom piégeux, masqué, verrouillé, `<use>` d'un `<g>`) ; point fixe ; `verifierDessin == []`
  après chaque lecture ; marqueur supérieur refusé.

**Paquet 1-B — opérations, lois, poids** (G ; en parallèle de 1-A, l'interface est fixée par l'étape 0).

- *Créer* : `edition/groupes.ts` (`grouper`, `degrouper`, `deplacerDans`, `renommer`, annexe 3 §3) ; ses exports dans le bloc
  « étape 1 » de la façade.
- *Toucher* : `operations.ts`, `assemblage.ts`, `nettoyage.ts`, `isolement.ts`, `formes.ts`, `formesDeBase.ts`, `booleens.ts`,
  `engine/texte/vectoriser.ts` — chaque ligne du tableau de l'annexe 3 §2, **derrière `if (estPlat(d)) return <corps
  actuel>`** ; `prochainId` → `prochainNumero` (déjà dans `arbre.ts`) ; `transformer` emmène les groupes de la fermeture par
  `transformerGroupe(promouvoir(...))` ; `boiteDe` d'un nœud ; `etendue.ts` : `boiteVisuelle(d, id)` qui consulte
  `etendreFeuille`/`etendreGroupe` ; « Lettres séparées » rend un groupe en riche ; les liens des textes posés (ADR-0031)
  survivent à grouper, dégrouper, déplacer dans.
- *Tests* : pour **chaque** corps changé, l'ancien dans `anciennes/` et son cas dans `loi-dessin-plat.test.ts` ; propriété
  aléatoire (100 opérations, graine imprimée, `verifierDessin == []` après chacune, annuler/rétablir par référence) ; lois de
  groupe de l'annexe 7 §3, point 4 ; budget `arbreDe` ≤ 2 ms sur 5 000 feuilles / 500 groupes (mesuré, pas imposé en CI si la
  machine varie : consigné).

**Paquet 1-C — descente, exporteurs, projet, corpus** (M ; après 1-A et 1-B).

- *Créer* : `engine/descente/groupes.ts` (feuilles dans l'ordre ; groupe masqué : ses feuilles disparaissent ; opacité
  multipliée sur les feuilles, phrase « une opacité de groupe composée sur ses formes » si elles se recouvrent ; ligne dans
  `REGLES_DESCENTE`, en dernier) ; corpus `tests/fixtures/svg/corpus/inkscape-calques.svg`, `illustrator-calque.svg` (formes
  géométriques originales, l'idiome seul) ; hostiles `v2-groupes-*` (10 000 `<g>` emboîtés, 64 + 1 niveaux, bombe de groupes).
- *Toucher* : `engine/aplatir.ts` — **verrouiller `DessinPlat`** par une marque de type (`declare const plat: unique symbol`) ;
  `zones/actionsExport.ts` et `zones/actionsProduction.ts` — chaque exporteur reçoit `aplatirPour(dessin, CAPACITES_…)` et la
  phrase des `pertes` s'ajoute au message de l'export ; `model/projet.ts`, `engine/projet.ts` — `groupes` et `parent` portés,
  **la règle de version** (§0 : `version: 2` seulement pour un dessin non plat, `MIGRATIONS[1]` identité, refus nommé d'une
  version supérieure), et un point d'entrée par champ v2 (une liste de validateurs de champ dans `model/projetV2/champs.ts`, une
  liste d'aller-retours dans `engine/projetV2/champs.ts`, une ligne par étape) pour que S3, S5–S7, S9, S12 n'éditent plus le
  corps de `lireForme` ni de `formeProjet` ; `projet-v2.test.ts`
  (`parent`, `groupes` : « porte »).
- *Terminé* : §4 ; l'export PDF/DXF/EPS/découpe d'un dessin riche construit à la main dit ses pertes ; un projet riche fait
  l'aller-retour exact ; un projet plat reste `version: 1`, octet pour octet.

### 5.2 Étape 3 — Définitions et dégradés (vague 1)

**Paquet 3-A — résolution** (M, d'abord).

- *Créer* : `edition/resolution.ts` (pur) : résoudre `url(#id)` (et la forme CSS `url("#id")`) contre `analyse.ids`, une
  référence absente traitée comme une peinture absente **et dite** ; chaînes `href`/`xlink:href` (héritage d'attributs et
  d'arrêts, `CHAINE_HREF_MAX = 16`), cycles refusés (« un cycle de dégradés ») ; unités de boîte résolues avec
  `marche.boiteForme(n, pret)` ; `gradientTransform` composé avec `pret.m` ; pourcentages ; bornes `PROFONDEUR_DEFS_MAX`,
  `NOEUDS_DEFS_MAX`. Écrit pour servir aussi aux découpes, masques, motifs et filtres (S5, S6, S7, S9 l'importent).
- *Toucher* : rien d'existant (la façade : son bloc « étape 3 »).

**Paquet 3-B — dégradés : lecture, écriture, transformation, couleurs** (G ; après 3-A).

- *Créer* : `edition/fonctions/degrades.ts` : `lecture.peinture` (linéaire et radial, `fx fy fr`, arrêts triés et bornés,
  64 au plus et dit, `stop-opacity`, classes sur `<stop>`) et la couleur de repli OKLab (moyenne pondérée des arrêts ; les
  outils OKLab sont dans `util/couleur.ts`) ; `ecriture.peindreFeuille` (`<linearGradient id gradientUnits="userSpaceOnUse"
  x1 y1 x2 y2 [gradientTransform] [spreadMethod]>` puis les `<stop>`, formats de l'annexe 2 §5, par `e.definitions.poser`) ;
  `transformation.feuille` (compose la matrice du dégradé) ; phrases (`color-interpolation`, arrêts au-delà de 64) ; ligne
  de `catalogue.ts` ; extension d'écriture (`defs`, `linearGradient`, `radialGradient`, `stop` sous leur parent, `fill` et
  `stroke` = `url(#ed-d-[0-9a-f]{14}(-\d+)?)`).
- *Toucher* : `edition/couleurs.ts`, `couleursProches.ts`, `engine/palettes.ts` (et le nuancier s'il a fusionné) — les
  feuilles à peinture non unie sont **ignorées** des listes et des remplacements (annexe 1 §6), derrière `estPlat` ; leurs
  anciens corps dans `anciennes/`.

**Paquet 3-C — descente, fixtures, corpus, projet** (M ; en parallèle de 3-B après 3-A).

- *Créer* : `engine/descente/degrades.ts` (fonction `degrades` : la peinture part, la couleur de repli reste, phrase ; ligne
  dans `REGLES_DESCENTE`, avant les groupes) ; `tests/unit/engine/v2/cas-degrades.ts` et `tests/fixtures/svg/v2/degrades-*`
  (linéaire, radial, foyer, `fr`, `href` en chaîne, unités de boîte, pourcentages, étalements, `stop-opacity`, sur fond et sur
  contour, sous rotation) ; corpus `figma-degrade`, `sketch-degrade-pourcent`, `inkscape-degrade-chaine` ; hostiles
  `v2-degrades-*` (cycle de `href`, 1 000 000 d'arrêts, matrice nulle, `stop-color="url(http://…)"`) ; les fonctions de projet
  d'une `Peinture` (validation dans `model/projetV2/peinture.ts`, aller-retour dans `engine/projetV2/peinture.ts` ; un motif y
  entrera à l'étape 9), branchées après la fusion de S1.
- *Toucher* : facultatif, `vignette_sure` (`url(#ed-…)` admis) avec son test PHP ; sinon le dire.
- *Terminé (étape 3)* : §4 ; aucune ligne de `zones/` ; un dégradé lu en riche s'écrit, se relit en point fixe, se transforme,
  se descend en couleur de repli pour le PDF.

### 5.3 Étape 12 — Images (vague 1, un paquet, M)

- *Créer* : `edition/fonctions/images.ts` : lecteur `image` (seulement `data:image/(png|jpeg|gif|webp);base64,…` ; une adresse
  extérieure ou `data:image/svg+xml` refusée « une image qui renvoie à un fichier ou une adresse extérieurs » ; `x y width
  height`, `preserveAspectRatio`, `transform` composé en `matrice` ; `d` = le rectangle dans le plan ; `remplissage` et
  `contour` null) ; `dimensionsImage` pure (IHDR, SOF, GIF, WebP) dans `edition/dimensionsImage.ts` ; plafonds
  `IMAGE_OCTETS_MAX`, `IMAGES_OCTETS_MAX`, `IMAGE_PIXELS_MAX` refusés en le nommant ; `ecriture.elementFeuille`
  (`<image xlink:href x y width height [transform] [preserveAspectRatio]/>`) ; `transformation.feuille` (rectangle et matrice) ;
  `dessinableEnPoints(f)` exportée (les points sur une image : refusé, dit — branché par l'interface à l'étape 2) ;
  `engine/descente/images.ts` (abandonnée, dite) ; cas `v2/images-*` (PNG 1×1, JPEG, rotation) ; hostiles `v2-images-*` (PNG
  de 65 000 × 65 000 pour 200 octets, `data:` géant, MIME mensonger, `javascript:`) ; extension d'écriture (`<image>` et
  `xlink:href` de la forme exacte, `xmlns:xlink` sur la racine) ; fonctions de projet de `ImageIntegree` (branchées après S1).
- *Toucher* : `io/image.ts` seulement si l'enveloppe « image telle quelle » doit changer (elle ne doit pas : elle devient
  ouvrable en riche) ; facultatif, `vignette_sure`.
- *Terminé* : §4 ; une image lue en riche s'écrit, se relit en point fixe, pèse dans l'historique (`poidsDessin`, déjà là).

### 5.4 Étape 2 — Groupes, l'interface (vague 2, après S1)

**Paquet 2-0 — l'état et le réglage** (P, d'abord). *Toucher* : `typesEditeur.ts`, `etatEditeur.ts`, `contexteEditeur.tsx`,
`creerActions.ts`, `actions*.ts` : le réglage `modele` (menu Édition, « Groupes, dégradés, effets (bêta) », gardé par le
`stockage` injecté, `plat` sans lui), la propriété `modele` de l'éditeur, de `EditeurSvg.ouvrir` et du site (`src/site/`),
le contexte d'édition (`{ groupe, dans? } | null`) et l'ensemble des groupes dépliés dans l'état d'`Interface`, leurs verbes
stables ; chaque lecture des hôtes passe le modèle (`zones/lecture.ts` le prend déjà, `Exporter.tsx`, `Versions.tsx`,
`session.ts`, `embarque.tsx`, `projetSite.ts`, `actionsDessin.ts`) ; un brouillon ou une version v2 ouverts en `plat` le disent
sans rien effacer (annexe 5 §3).

**Paquet 2-A — la toile** (G). *Créer* : `engine/edition/rendu.ts` — le rendu **générique** pour la toile, par les mêmes
crochets que l'écriture riche (`peindreFeuille`, `attributsFeuille`, `elementFeuille`, `attributsGroupe`, le recueil) : ce qui se
voit est ce qui s'écrit, et S3 à S12 n'ont plus rien à ajouter à la toile. *Toucher* : `Toile.tsx`, `ToileEditeur.tsx` (rendu
par nœud de `arbreDe`, mémorisé par groupe, `<defs>` du recueil, contour du groupe en contexte, voile hors contexte) ;
`PriseToile.tsx`, `Gestes.ts` (une prise remonte à l'enfant du contexte, `ancetres` ; hors contexte : estompé, ne se prend
pas) ; `engine/prise.ts` (le contexte en paramètre) ; `engine/transformations.ts` (aimants sur les frères du contexte).

**Paquet 2-B — les calques en arbre** (G). *Toucher* : `Calques.tsx`, `CalquesOperations.tsx` : `treegrid` fenêtré sur les
lignes visibles (seuil 150), un seul arrêt de tabulation, clavier de l'annexe 6 §1, alternatives au glisser (Ctrl+Maj+flèches,
« Déplacer vers… ») ; la coexistence avec « À couper / À écrire » en Cricut (décision consignée).

**Paquet 2-C — commandes, phrases, jetons** (M). *Toucher* : `Clavier*.ts`, `MenusBarre.tsx`, `BarreOutils.tsx`,
`BarreSelection.tsx` (Grouper, Dégrouper, Entrer, Sortir, fil d'Ariane ; Ctrl+G selon la question 1 de l'annexe 9 : en riche
seulement) ; `engine/navigation.ts`, `engine/description.ts`, `phrasesSelection.ts`, `annonces.ts` (phrases de l'annexe 6
§7) ; `jetons.ts` (`voile-contexte`, `contour-groupe`, `pastille-groupe` ; `docs/jetons.md` régénéré) ; « SVG à plat » au menu
Fichier (`ecrireDessin(aplatirPour(d, CAPACITES_PLAT).dessin)`) ; les points refusés sur une image (`dessinableEnPoints`).

**Paquet 2-D — e2e, axe, performance** (M, à la fin). e2e clavier par parcours (annexe 6 §9), axe sur les écrans nouveaux en
clair, sombre, tactile ; budgets de l'annexe 7 §4 (témoins plats inchangés à 10 % près).

*Terminé (étape 2)* : §4 ; le réglage à `plat` (défaut), rien ne change pour personne ; Chromium e2e verts sur les fichiers
touchés, les trois moteurs en CI.

### 5.5 Étape 4 — Dégradés, l'interface (vague 2)

**4-A — panneau et liste d'arrêts** (M ; après S3 et S2-0). *Toucher* : `Inspecteur.tsx`, `PanneauDessin.tsx` (section
Remplissage/Contour : Uni / Linéaire / Radial ; liste d'arrêts complète sans la toile, annexe 6 §4) ; `ParCouleur.tsx`,
`LigneCouleurDessin.tsx`, `ListeCouleurs.tsx`, `CouleursDuDessin.tsx` (une ligne « Dégradés ») ; opérations pures nouvelles
dans `edition/degradesOperations.ts` (`poserDegrade`, `retirerDegrade`, arrêts) ; phrases ; jetons (`arret-selectionne`).
**4-B — poignées de la toile** (M ; après S2-A). *Toucher* : la surcouche de `Toile.tsx` (poignées `role="slider"`, 40 px au
doigt), `Gestes.ts`/`ClavierToile.ts` (flèches ±1 %, Maj ±10 %), jeton `poignee-degrade`. *Terminé* : §4, axe et e2e clavier
(ajouter, déplacer, retirer un arrêt sans souris).

### 5.6 Étape 5 — Découpes (vague 2, après S1 et S3-A)

**5-A — lecture et écriture** (G). *Créer* : `edition/fonctions/decoupes.ts` : `prises: ['decoupe']` ; `lecture.groupe` (le
`clip-path` d'un `<g>`, contenu de `<clipPath>` lu par `resolution.ts` : unités, `transform`, `<use>` déplié, `clip-rule`,
imbrication) ; une **feuille** à `clip-path` enveloppée dans un groupe (par l'aide que S1 aura donnée à la marche, ou demandée
au chef de chantier) ; `ecriture.attributsGroupe` (`clip-path` au rang `RANG_GROUPE.decoupe`, `<clipPath>` par le recueil ;
une découpe à groupes découpés pose `clip-path` par feuille, annexe 2 §5) ; `transformation.groupe` (la découpe suit,
règle de la fermeture) ; `etendue.groupe` (intersection) ; refus nommés (forme CSS, renvoi externe, cycle) ; extension
d'écriture ; cas `v2/decoupes-*`, corpus `inkscape-decoupe`, `figma-cadre-decoupe`, `illustrator-degrade-decoupe` ; hostiles.
**5-B — opérations** (M). *Créer* : `edition/decoupes.ts` (`creerDecoupe`, `liberer`) ; bloc « étape 5 » de la façade.
**5-C — descente** (M). *Créer* : `engine/descente/decoupes.ts` (intersection booléenne des **remplissages**,
`polygon-clipping` par `booleens.ts` ; un trait gardé entier et dit) ; fonctions de projet de `Decoupe`. *Terminé* : §4.

### 5.7 Étape 7 — Effets (vague 2, A après S3-A, B après S2-A)

**7-A — moteur** (G). *Créer* : `edition/fonctions/effets.ts` : `prises: ['filtre']` ; `lecture.feuille` et `lecture.groupe`
(le sous-ensemble de l'annexe 4 B §3, par `resolution.ts` ; toute autre primitive refusée en la nommant : « un filtre
(feTurbulence) ») ; écart borné à `ECART_MAX` et dit ; `ecriture.attributsFeuille`/`attributsGroupe` (`filter` au rang
`filtre`, `<filter filterUnits="userSpaceOnUse" x y width height color-interpolation-filters="sRGB">` aux formes exactes de
l'annexe 4 B §2, région calculée par la boîte visuelle) ; `transformation.feuille`/`.groupe` (écart × facteur, ombre dans le
repère du plan) ; `etendue.feuille`/`.groupe` (3 écarts + décalage) ; `engine/descente/effets.ts` (abandonnés, dits) ;
extension d'écriture (les primitives écrites, et elles seules) ; cas `v2/effets-*` (flou, ombre, les deux, sous rotation, sous
échelle non uniforme), corpus `inkscape-flou` ; hostiles (`stdDeviation="1e308"`, `NaN`, région infinie) ; fonctions de projet
d'`Effets`. **7-B — toile et mesures** (M ; après S2-A) : le mode brouillon pendant un geste (`data-brouillon`), au-delà de
20 nœuds à effet rendus au repos et dit ; mesures de l'annexe 7 §4 (méthode de l'ADR-0008). *Terminé* : §4.
