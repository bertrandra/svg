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
| 2 Groupes, interface | paquets **2-0** (état, réglage) et **2-A** (toile) **faits** le 26 octobre 2026 (ce qui a été posé : ci-dessous, « Ce que les paquets 2-0 et 2-A ont posé ») ; **2-C** (commandes, fil d'Ariane, clavier, phrases) **fait** le 26 octobre 2026 (ci-dessous, « Ce que le paquet 2-C a posé ») ; 2-B, 2-D proposés |
| 5 Découpes | **faite pour le moteur** le 26 octobre 2026 (paquets 5-A, 5-B, 5-C en un seul arbre ; ce qui a été posé, les écarts et ce qui reste : ci-dessous, « Ce que l'étape 5 a posé ») ; la toile vient du rendu générique de l'étape 2, l'interface de l'étape 8 |
| 7 Effets | **paquet 7-A (moteur) fait** le 26 octobre 2026 (ce qui a été posé, les écarts et ce qui reste : ci-dessous, « Ce que le paquet 7-A a posé ») ; 7-B (toile, brouillon) après S2-A |
| 4, 6, 8, 9, 13, 14 | proposées ; vagues et consignes revues (§2, §5) |

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
  `OptionsLecture.polices`). Reste à 13c : `<svg>` imbriqué, et en mode riche un `<text>` lu devient un groupe de lettres.
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

### Étape 4 — Dégradés : l'interface · taille M

Section Remplissage/Contour, liste d'arrêts, champs, poignées de la toile (curseur-glisseur), clavier, phrases,
jetons, axe, e2e. Paquets : **A** panneau + liste (M) ; **B** poignées de toile + clavier (M).

### Étape 5 — Découpes · taille G · **faite pour le moteur le 26 octobre 2026** (§0, « Ce que l'étape 5 a posé »)

`Decoupe`, lecture de `<clipPath>` (unités, transformations, imbrication, `<use>`), écriture, `creerDecoupe`/`liberer`,
fermeture à la transformation, `boiteVisuelle` (découpe) et `ajusterPlan`, rendu de la toile, **descente exacte
par intersection booléenne** des remplissages (`aplatir.ts`), fixtures, hostiles (cycles, bombes), corpus
`inkscape-decoupe`, `figma-cadre-decoupe`, `illustrator-degrade-decoupe` (reste). Paquets : **A** lecture/écriture (G) ;
**B** opérations + boîtes (M) ; **C** descente + toile (M).

### Étape 6 — Masques d'opacité · taille M

`Masque` (luminance, alpha, région), lecture de `<mask>`, écriture, création/libération/inversion, rendu,
descente (ignoré et dit, ou image), corpus `figma-trait-interieur`, `sketch-masque-use`. Après 5 (contenu et
région partagent son infrastructure).

### Étape 7 — Effets · taille G · risque moyen (performance) · **paquet 7-A fait le 26 octobre 2026** (§0)

`Effets`, lecture du sous-ensemble (annexe 4 B §3), écriture des formes exactes, région calculée, `boiteVisuelle`
(effets) et `ajusterPlan`, rendu de la toile avec mode brouillon pendant les gestes, plafonds, descente
(abandonnés, dits ; PDF raster à l'étape 13 si l'agent des exports a livré le DPI), mesures et budgets,
corpus `inkscape-flou`. Paquets : **A** moteur (G) ; **B** toile + brouillon + mesures (M).

### Étape 8 — Découpes, masques, effets : l'interface · taille G

Menu Objet, contextes `decoupe`/`masque`, section Effets, phrases, jetons, axe, e2e. Après 5, 6, 7 et 2.
Paquets : **A** menus + contextes (M) ; **B** section Effets (M) ; **C** e2e/axe (M).

### Étape 9 — Motifs · taille M

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
  raster des effets ; avec l'agent des exports (même fichier `export/pdf.ts`) · après 3, 5, 6, 12.
- **13b Reconnaisseurs d'idiomes de filtres** (Figma, Sketch, Illustrator `Adobe_OpacityMaskFilter`) · après 6, 7.
- **13c `<svg>` imbriqué**, et en mode riche un `<text>` lu en **groupe** de lettres · après 1. *Révision : le `<text>` étranger
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
