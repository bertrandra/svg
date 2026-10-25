# ADR-0022 — Le texte vivant, la vectorisation et le trait unique

**Date :** 25 octobre 2026
**Statut :** acceptée (réalise l’étape « texte vivant » de l’ADR-0012 en en précisant le §4 et l’annexe 4, prolonge les
ADR-0004 §2, 0009, 0013, 0014, 0015 et 0020) ; **aucune référence d’écriture existante ne change**

## Contexte

Décisions du propriétaire, non négociables :

- un texte créé dans l’éditeur **reste modifiable** (texte vivant), et « après le design il faut pouvoir **vectoriser** la
  police » ;
- une police inconnue est **remplacée** (pas refusée), et c’est dit (la règle de `model/polices.ts`, ADR-0020) ;
- **la Cricut écrit avec le stylo : elle ne remplit pas.** Une lettre « en trait » (police à trait unique) et une lettre « en
  contour » n’ont pas le même usage ;
- pas de texte natif dans le PDF, pas de fichier de police dans le SVG : le fichier écrit porte les **contours** ;
- en cours de route : un bouton « Aperçu forme / ligne » à côté de chaque choix de police, au clic seulement.

Jusqu’ici l’outil Texte convertissait tout de suite (une forme par lettre, ADR-0004 §2) : rien ne se souvenait du texte.
Le modèle v2 (groupes, définitions) n’est pas encore là ; l’ADR-0012 §4 décrivait un texte vivant comme **une feuille**
portant ses contours composés et de quoi les rouvrir, ce qui ne demande ni groupe ni définition : on peut le faire sur le
dessin à plat d’aujourd’hui, sans attendre la bascule.

## Décision

### 1. Une forme, ses contours exacts, et de quoi les recomposer

`Forme.texte?: TexteVivant` (`engine/edition/types.ts`) : la chaîne, la police (`id`, `version` = empreinte de la fonte,
`famille` pour une fonte déposée), la taille, l’interlettrage et l’interligne (en part de la taille), l’alignement, les
ligatures, et une **matrice de composition** qui porte le repère du texte (première ligne de base à l’origine) dans le plan.
`d` reste la vérité du dessin : la lecture ne recompose jamais (rapide, déterministe, indépendante de la fonte présente).

Le champ est **absent** de toute autre forme : aucun octet d’un dessin sans texte vivant ne bouge (les références de
`tests/fixtures/svg` et les 4 134 empreintes de la bibliothèque le prouvent).

### 2. Ce qui s’écrit : des contours et des `data-ed-*` entièrement encodés

```xml
<path d="M…Z" fill="#15181d" data-ed-texte="Joyeux%20No%C3%ABl" data-ed-police="inter" data-ed-police-version="…" data-ed-taille="18" data-ed-matrice="1 0 0 1 100 30"/>
```

Dans cet ordre, chacun absent quand il vaut son défaut : `texte`, `police`, `police-version`, `famille`, `taille`,
`interlettrage` (0), `interligne` (1,2), `alignement` (gauche), `ligatures` (`1`), `matrice` (identité).

- **Tout est encodé en pourcentage**, lettres non ASCII comprises (l’annexe 4 les gardait en clair) : la valeur ne porte que
  `[A-Za-z0-9]` et `%XX`. Aucune expression du nettoyage (`assainirSvg`), ni des invariants de sécurité, ni d’un navigateur
  n’y trouve prise, quoi qu’on tape (« javascript: », « url(x) », « @import », « -moz-binding »), et l’invariant de l’écriture
  la vérifie par une seule expression. Le prix : quelques octets de plus pour un texte accentué.
- **Pas de `<title>` ni de `role="img"`** (que l’annexe 4 proposait) : ce serait le premier texte libre d’une écriture, que
  `violationsEcriture` interdit, et la première balise écrite avec un enfant. Le texte reste lisible par une machine
  (décodé), pas par un lecteur d’écran dans le fichier ; à rouvrir si le besoin se montre.
- Les invariants de l’écriture (`tests/unit/securite/invariants.ts`) admettent ces dix attributs **sur un `<path>` seul, à
  la profondeur 1, chacun avec sa forme exacte** ; rien d’autre n’est relâché (la marque de production reste sur la racine).
- **Relecture** : `lireTexteVivant` décode, borne (10 000 caractères, taille dans ]0 ; 10⁶], matrice non dégénérée…), compose
  la matrice des groupes qui entourent le chemin. Une donnée hors bornes laisse les contours et le dit (`ignores` : « les
  données d’édition d’un texte sont illisibles : il reste en contours »). Une **police inconnue** est remplacée par la règle
  de l’ADR-0020 (« 1 texte en Arial, police remplacée par Inter ») ; les contours écrits ne bougent qu’à la prochaine édition.
- Les exports « machine » (découpe, stylo) écrivent le dessin **sans** texte vivant (`dessinSansTextes`) : des contours seuls.

### 3. Les opérations qui savent le texte, et la garde des autres

Les transformations affines (`transformer`, `dupliquer`, `inserer`, `coller`, donc déplacer, tourner, retourner,
redimensionner, aligner…) composent la matrice du texte : retaper recompose à la même place, à la même échelle, au même angle.
Retaper ou restyler passe par une opération pure (`poserTexte`), l’interface ayant composé les contours avec la fonte
(`engine/texte/bloc.ts`, au-dessus de `composer`, inchangé).

Tout autre outil change `d` **sans connaître le texte** (booléen, points, contour en forme, décalage, angles, joindre,
combiner, séparer, simplifier…). Plutôt que d’enseigner le texte à chacun, une **garde** (`garderTextes`) passe après chaque
geste (`appliquer`) : une forme qui porte encore le même objet texte qu’avant mais un autre tracé le perd et devient un chemin
ordinaire. L’éditeur le dit dans la phrase de l’action (« Le texte est vectorisé : il n’est plus modifiable comme texte (Ctrl+Z
le rend) ») ; l’outil Points vectorise d’abord, en une entrée d’historique, et le dit.

### 4. Vectoriser le texte, en trois modes

`vectoriserTextes` (`engine/texte/vectoriser.ts`) : **« Lettres séparées »** (une forme par lettre, ou par ligature),
**« Souder les lettres qui se touchent »** (les lettres en contact s’unissent par les booléens : un mot manuscrit d’un seul
tenant), **« Tout souder »** (une forme). Les lettres viennent de la composition quand l’interface a la fonte et que ses
contours redonnent la forme (à 0,01 unité près : une relecture arrondit) ; sinon (fonte absente, autre version), la forme se
coupe en **parties** (chaque contour extérieur avec ses trous) : les soudures donnent le même résultat, seules les lettres en
plusieurs morceaux (i, é) se séparent. Une police à trait se soude **bout à bout** (on n’unit pas des lignes). Menu Édition
(trois éléments), inspecteur, **Ctrl+Maj+O** (le mode du moment : souder en découpe Cricut, lettres séparées ailleurs) ;
annulable.

### 5. La nature d’une police, et la police à trait unique

Une police porte une **nature**, une donnée (`model/polices.ts`) : `contour` (des lettres pleines) ou `trait` (des tracés
ouverts, la course d’une plume). Une police à trait se compose en **tracés ouverts, sans remplissage**, au trait de
l’épaisseur choisie (celle du stylo en contexte de production, un vingtième de la taille sinon) ; le texte vivant et la
vectorisation gardent cette nature. Changer de police d’une nature à l’autre change aussi la peinture (le fond devient le
trait, ou l’inverse).

**La police : EMS Readability**, police SVG à trait unique d’Evil Mad Scientist (Sheldon B. Michaels, conversion de Windell
H. Oskay), dérivée de Source Sans Pro, sous **SIL OFL 1.1** (déclarée dans le fichier), livrée par le paquet npm
**`hersheytext` 2.0.0, épinglé exactement** (le code du paquet est sous MIT ; seul le fichier de police est redistribué, en
données dans `polices.js`). Choisie parce qu’elle a les lettres accentuées du français (les polices Hershey d’origine n’ont que
l’ASCII ; Relief SingleLine, OFL, n’est pas sur npm), et parce qu’une police SVG dit vraiment un tracé ouvert (une fonte
TrueType referme ses contours). opentype.js ne lisant pas une police SVG, `scripts/polices.mjs` en garde les glyphes en données
et `io/policesTrait.ts` en fait l’interface `Glyphes`. Le texte de l’OFL et la ligne de copyright sont copiés dans
`scripts/licences/ems-readability-OFL.txt` (le paquet ne les livre pas) ; `model/credits.ts` déclare la licence de la part
redistribuée (`spdx`) et celle du paquet (`spdxPaquet`) ; `THIRD-PARTY-NOTICES.md` est régénéré.

### 6. L’interface

- **L’outil Texte** pose un texte vivant centré, choisi, et le dit. Une fonte déposée a pour identifiant son **empreinte**
  (`u-…`) ; le fichier n’est jamais écrit, et un texte rouvert sans elle dit « Police absente : … » et propose de la déposer.
- **La saisie en place** : double-clic ou Entrée sur un texte ouvre un vrai `<textarea>` nommé (« Texte de la forme ») sous le
  texte ; le texte se recompose sous les yeux ; Entrée valide, Maj+Entrée va à la ligne, Échap rend le texte d’avant ; toute
  la frappe est **un seul geste** de l’historique (fondu par sa clé) ; le focus revient à la toile.
- **La section « Texte »** de l’inspecteur (en tête) : le champ, la police, « Gras » quand la famille a une variante grasse,
  taille, espace, interligne, alignement (boutons à état), ligatures, et « Vectoriser le texte » (trois modes en radios, un
  bouton secondaire : une action rare et destructrice ne prend pas l’encre unique).
- **L’aperçu « forme / ligne »** (`ChoixPolice`, partout où l’on choisit une police) : un bouton discret `aria-expanded`
  ouvre, dans le flux, le texte courant (« Abc » s’il est vide) rendu deux fois par le moteur : « Forme (découpe) » (les lettres
  pleines ; pour une police à trait, ses traits épaissis par l’outil « contour en forme » existant) et « Ligne (stylo) »
  (sans aucun remplissage ; pour une police à contour, le pourtour de chaque lettre : un double trait). Sous chacun, un verdict
  court et neutre, jamais un refus (`verdictsApercu`), qui est aussi le texte alternatif du rendu. Rien n’est obligatoire.

### 7. Le stylo et la lame

- **Découpe** : un constat nouveau, « Les lettres se chevauchent : soudez-les pour une découpe d’un seul tenant », correction
  « Souder » (`vectoriserTextes` en soudant, par parties : aucune fonte n’est nécessaire). Intégré au panneau « Prêt pour
  Cricut » (`constatsPreparation`, `corrigerPreparation`).
- **Le procédé « Dessin au stylo »** (`model/contextes.ts`, toutes les Cricut) entre dans le sélecteur de machine, avec une
  ligne inactive « Bientôt : gravure, dorure (foil) » (`OUTILS_A_VENIR` : la même logique d’outil, ouverte une fois vérifiée).
  Le panneau « Prêt pour le stylo » dit **« Le stylo trace le pourtour des formes pleines »** (corrections : « Garder le
  contour », la forme devient son pourtour en trait ; « Hachurer », des lignes parallèles espacées de la largeur du stylo, à
  45°, dans la forme, trous respectés, en va-et-vient, `engine/contour/hachures.ts` ; « Police à trait unique » pour un texte
  vivant à contour, recomposé dans la police à trait la plus proche) et **« Double trait »** pour un texte à contour. Un
  `Constat` porte désormais `autres` : les corrections après celle qu’on conseille.
- **En découpe**, un tracé ouvert sans fond ou un texte à trait unique : **« Un trait ouvert ne se découpe pas »**, bloquant
  comme le constat « trait » qu’il précise pour ces formes (rien ne bloque de plus ni de moins qu’avant), corrections
  « Contour en forme » et « Passer au dessin au stylo ».
- **« Exporter pour le stylo »** (`export/stylo.ts`) : des traits, aucun remplissage (une forme pleine sans trait s’écrit par son
  pourtour, à la largeur du stylo), une taille physique, une couleur par stylo, la marque du contexte ; la carte « Dans Design
  Space » dit les étapes (« Dessiner » pour chaque couche, lignes ouvertes : à vérifier). La largeur du stylo, **0,4 mm**, est
  une valeur `aVerifier` nouvelle (`cricut.stylo.largeur`) ; les témoins **7** (trait unique : comment Design Space importe un
  tracé ouvert et le passe en « Dessiner ») et **8** (hachures) entrent au protocole. Une forme se hachure aussi depuis
  l’inspecteur, à l’angle voulu.

## Conséquences

- **Octets** : aucune référence existante ne bouge (ni les 4 134 empreintes de la bibliothèque, ni les témoins 1 à 6) ; dix cas neufs dans `ecriture-stable.test.ts` (`texte-vivant`,
  `texte-vivant-transforme`, `texte-vivant-lecture`, `texte-vivant-trait`, `vectoriser-lettres`, `-souder`, `-tout`,
  `-parties`, `hachures`, `stylo-export`), avec des fontes factices. La relecture d’un texte vivant écrit est un point fixe.
- **Sécurité** : deux vecteurs nouveaux au corpus hostile (`texte-vivant-attributs-pieges.svg` ; et
  `css-echappement-nul-reassemble.svg`, trouvé par le fuzzer quand le corpus a grandi : un NUL retiré **après** le nettoyage
  d’une valeur reformait « @import » ; la valeur est maintenant rendue bien formée avant d’être nettoyée).
- **Tests de navigateur existants modifiés**, parce que le comportement a changé et c’est voulu : un texte ajouté est une forme
  (`outils.e2e.ts`, `texte-ligatures.e2e.ts`, qui compte désormais les lettres en vectorisant), le sélecteur s’appelle
  « Police » et l’outil « Texte (T) » (`embarquement.e2e.ts`) ; l’identifiant d’une fonte déposée est son empreinte
  (`tests/unit/io/polices.test.ts`) ; toutes les Cricut dessinent au stylo, la Joy comprise (`tests/unit/model/contextes.test.ts`) ; le nombre de fontes créditées passe à onze (`tests/unit/model/credits.test.ts`). Nouveaux : `texte-vivant.e2e.ts`, des écrans de plus dans les audits axe et de cibles.
- `hersheytext` tire `cheerio` 0.22 et ses dépendances en développement (signalées par `npm audit`) : elles ne sont ni
  exécutées (on ne lit que le fichier de police) ni livrées.
- **Limites, honnêtement** : pas de retour automatique à la largeur d’une boîte (le texte est libre, retours à la ligne
  tapés) ; pas d’italique (aucune fonte livrée n’en a) ; une matrice arrondie à six décimales recompose un texte relu à moins
  d’un millième près ; le crénage d’une police à trait est nul ; « Lettres séparées » sans fonte coupe par parties ; les
  sinus et cosinus d’un angle de hachures hors des multiples de 45° peuvent différer au dernier bit d’un moteur JavaScript à
  l’autre ; la copie de l’OFL et le copyright d’Adobe (Source Sans Pro) sont recopiés de mémoire de la licence d’origine : à
  confirmer par qui de droit.

## Alternatives écartées

- **`<text>` avec la police, ou `@font-face` en `data:`** : écartés par l’ADR-0012 (annexe 4), et par le propriétaire.
- **Une forme par lettre, regroupées** : il n’y a pas encore de groupes ; et retaper demanderait de retrouver un texte éparpillé.
- **Enseigner le texte à chaque outil** : une vingtaine d’opérations à changer, et le premier outil oublié écrirait un texte
  faux ; la garde unique est sûre par construction.
- **Les polices Hershey d’origine** (domaine quasi public, avec mentions) : pas d’accents. **Relief SingleLine** (OFL) : pas
  de paquet npm. **Une fonte TrueType « à trait unique »** : ses contours reviennent sur eux-mêmes, ce n’est pas un tracé ouvert.
