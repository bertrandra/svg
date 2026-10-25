# ADR-0028 — Couper ou écrire, forme par forme

**Date :** 25 octobre 2026
**Statut :** acceptée (prolonge les ADR-0013 et 0022, s’appuie sur les ADR-0006, 0008, 0011 et 0021) ; **aucune référence
d’écriture existante ne change** : un fichier où personne n’a rien choisi garde ses octets, en Générique comme en Cricut

## Contexte

Jusqu’ici, le procédé du contexte Cricut (découpe, Print Then Cut, dessin au stylo, ADR-0013 et 0022) valait pour tout le dessin.
Un projet de maker mêle pourtant souvent les deux : une carte qu’on découpe et le mot qu’on écrit dessus au stylo, une étiquette
découpée et son contour décoratif dessiné. En découpe, la ligne du mot bloquait l’export (« Un trait ouvert ne se découpe pas ») ;
au stylo, la carte n’était plus que son pourtour. Il fallait deux fichiers, faits à la main.

Demande du propriétaire, non négociable : en mode Cricut, **une forme est marquée écriture ou découpe** ; le panneau de gauche
range les formes **« À couper » et « À écrire »** et permet de passer de l’un à l’autre ; la toile montre **les zones coupées,
hachurées**. Ce que Design Space fait du type de ligne ne se règle qu’après l’import (ADR-0013 §11) : le passage doit être simple
et dit, sans prétendre ce que le fichier ne porte pas.

## Décision

### 1. Une opération par forme, une donnée du modèle

`Forme.operation?: 'decoupe' | 'ecriture'` (`engine/edition/types.ts`) : **absente** tant que personne ne l’a choisie. La forme suit
alors une **règle de proposition**, pure (`operationProposee`, `engine/preparation/operations.ts`) :

- au **stylo** (procédé « Dessin au stylo »), tout s’écrit : c’est le défaut du procédé ;
- un **texte vivant en police à trait unique** s’écrit, même si on lui a donné un fond : ses lettres sont des tracés ouverts ;
- une **forme sans remplissage** (un trait seul, une ligne médiane de l’ADR-0021, des hachures de l’ADR-0022) s’écrit ;
- le reste, une forme pleine (même avec un contour), se **découpe** : c’est le défaut de la découpe et de Print Then Cut.

Pourquoi ces trois cas : la lame ne détache que ce qui a un fond. Une ligne n’a rien à détacher ; en découpe, elle bloquait
l’export par un constat qui proposait déjà le stylo. La proposer à l’écriture change un refus en un choix visible : elle est rangée
« À écrire », la toile la montre en trait. La ligne médiane n’a pas besoin d’une marque à elle : elle s’écrit `fill="none"`, la règle
du fond la couvre. Un texte à trait unique a son cas parce que sa nature (`model/polices.ts`) dit « une ligne » même quand un fond lui
aurait été posé. Une forme pleine reste à la lame, contour compris : le constat « trait » la juge comme avant.

`operationDe(f, procede)` rend le choix s’il y en a un, sinon la proposition. Le choix se garde **même quand il vaut la
proposition** : changer ensuite de procédé ne défait pas ce que la personne a décidé. Print Then Cut imprime tout et découpe la
silhouette : l’opération ne s’y choisit pas (`operationsApplicables`), le panneau et la toile y restent ceux d’avant.

`poserOperation` est une opération pure de l’historique : une entrée, que Ctrl+Z défait ; une forme verrouillée ne change pas ;
rien ne s’ouvre dans l’historique quand rien ne change pour la machine. Les outils qui copient la forme (transformer, dupliquer,
coller) gardent l’opération ; un booléen prend le style de la forme la plus basse, opération comprise ; un outil qui rebâtit une
forme neuve la laisse à la proposition.

### 2. Le fichier : `data-ed-operation`, seulement en Cricut, seulement hors de la proposition

Le document d’un contexte Cricut (`svgDocument`) écrit `data-ed-operation="decoupe"` ou `"ecriture"` en **dernier attribut** du
`<path>` d’une forme dont le choix **diffère de la règle sous le procédé du moment** (`operationsAEcrire`). En Générique, jamais,
même si le modèle en porte (un fichier Cricut rouvert puis passé en Générique) : **aucun octet de plus** (ADR-0013). L’écriture
ordinaire (`ecrireDessin`) ne l’écrit que si on le lui demande (`operations: true`) : les exports, le téléchargement à options et la
fiche de la page ne la portent jamais.

La relecture ne prend que **les deux valeurs exactes**, sur la forme elle-même, jamais héritées d’un groupe ; tout autre texte est
ignoré sans bruit (un vecteur hostile de plus au corpus : `operation-attribut-piege.svg`). Les invariants de l’écriture admettent
l’attribut sur un `<path>` à la profondeur 1, avec l’une des deux valeurs, rien d’autre. Relu sous le même procédé, un document
redonne les mêmes opérations (un choix égal à la proposition revient en proposition : même effet) et se réécrit à l’octet.

### 3. Le jugement suit l’opération

`constatsPreparation` partage le dessin (`partagerOperations`, mémorisé par dessin et par procédé) : les formes **à couper** sont
jugées par la lame (trait, opacité, tracé ouvert, lettres qui se chevauchent, nuances proches, parties fines, trous, pair-impair,
trait ouvert), les formes **à écrire** par le stylo (« Le stylo trace le pourtour des formes pleines », « Double trait ») ; la
**taille**, le nombre de points et le dessin vide se jugent sur **tout le dessin** (la lame et le stylo passent sur le même tapis).
Un dessin tout entier pour une seule opération est jugé exactement comme avant. Le constat « Un trait ouvert ne se découpe pas » ne
se pose donc plus que pour une ligne qu’on a dite « à couper » ; sa seconde correction devient **« Écrire au stylo »** (la forme
passe à l’écriture, le reste garde la lame), à la place de « Passer au dessin au stylo » qui changeait tout le dessin.

### 4. L’export : un fichier par opération, et un fichier combiné, dans une archive

Le SVG ne dit pas à Design Space qu’une ligne se dessine. Le plus sûr est de **séparer les opérations avant l’import** :

- un dessin d’**une seule opération** s’exporte comme avant, un seul SVG (`-cricut.svg` ou `-stylo.svg`, mêmes octets) ;
- un dessin **mêlé** donne une archive `nom-cricut.zip` (`export/operations.ts`) : `nom-a-couper.svg` (fonds pleins, `svgCricut`),
  `nom-a-ecrire.svg` (traits sans fond à la largeur du stylo, `svgPourStylo`), `nom-cricut.svg` combiné (les deux, en deux groupes
  `<g id="a-couper">` puis `<g id="a-ecrire">`, marqué « découpe » : rouvert, il se repartage de lui-même par la règle) et un
  `LISEZMOI.txt`. Les trois ont le même cadre et la même taille physique : posés au même endroit, ils se superposent. Aucun ne porte
  `data-ed-operation` : chaque fichier le dit par ce qu’il porte. Un constat bloquant, jugé sur tout le dessin, refuse en le nommant.

Ce que Design Space en fait (deux imports qui se superposent, « Dessiner » sur les calques importés, « Attacher », les groupes du
fichier combiné) **n’est pas vérifiable ici** : quatre comportements `aVerifier` dans `model/contextes.ts`
(`DESIGN_SPACE_OPERATIONS`), un **témoin 9** (trois fichiers) au protocole, un test qui oblige le protocole à les nommer. La carte
« Dans Design Space » dit les quatre étapes, les trois dernières marquées « (à vérifier) ».

### 5. Le panneau de gauche, en Cricut

En découpe ou au stylo, le panneau des calques garde ses actions (Tout, Aucun, Inverser, Tout afficher) et « Par couleur », et
remplace la liste « Formes » par **deux groupes**, avant « Par couleur » : **« À couper »** (ciseaux) et **« À écrire »** (stylo),
chacun avec son nombre. Une ligne : une **vignette** (la forme en petit, pleine pour la lame, en trait pour le stylo, sur le plan
blanc), le genre et le numéro (le nom accessible de la liste des formes, « Cercle 2, fond… »), le bouton qui la fait passer dans
l’autre groupe (« Écrire au stylo : Cercle 2 (Maj+E) », « Couper à la lame : … (Maj+X) »), masquer, verrouiller. Cliquer une ligne la
choisit sur la toile, **Maj ou Ctrl l’ajoute** ; le bouton d’une ligne choisie parmi plusieurs fait passer toute la sélection.
**Glisser** une ligne sur l’autre groupe fait la même chose : un raccourci pour la souris, jamais le seul chemin. Un groupe vide dit
ce qui y viendra et le geste qui l’y range. Une longue liste se **fenêtre** (ADR-0008, au-delà de 150 lignes) : chaque groupe a sa
fenêtre, dans le même panneau qui défile (`useFenetre` accepte le conteneur d’un autre). Le panneau « Prêt pour Cricut » ajoute une
ligne « Opérations : 2 à couper · 2 à écrire : un fichier pour chaque » quand le dessin mêle les deux.

### 6. La rangée de la sélection, les menus et le clavier

La rangée de la sélection montre l’opération : deux boutons à état, **« À couper (Maj+X) »** et **« À écrire au stylo (Maj+E) »**
(une sélection mêlée n’enfonce aucun des deux) ; au doigt sur un petit écran, un menu de deux choix tient la place d’un bouton.
C’est un composant à part (`OperationSelection.tsx`) que la rangée monte en une ligne. Le menu Édition porte « Sélection à couper »
et « Sélection à écrire au stylo » avec leur raccourci. **Maj+X** et **Maj+E** ne valent qu’en Cricut, découpe ou stylo : ailleurs,
Maj+E reste l’ellipse. Chaque changement se dit dans la région vocale (« Une forme passe à l’écriture au stylo. Ctrl+Z annule. »). La
liste des raccourcis les nomme.

### 7. L’aperçu de la machine, sur la toile

Un réglage de vue, **« Aperçu de la machine »** (menu Vue, **Maj+O**), **actif par défaut** en Cricut, jamais écrit. La toile montre
alors ce que la machine fera : pour une forme **à couper**, la **zone que la lame détache, hachurée** (un motif de lignes à 45°, à
7 px d’écart à l’écran, posé par la règle de remplissage de la forme : un trou en pair-impair ou à contresens n’est pas hachuré) et le
**contour de coupe net** ; pour une forme **à écrire**, la **ligne du stylo**, sans remplissage, à la **largeur du stylo du profil**
(jamais sous 1,25 px à l’écran). Les formes ordinaires restent dessous, transparentes : elles gardent les clics, les poignées et les
gestes. La vue contours (O) l’emporte tant qu’elle est active. Rien ne bouge, donc rien à éteindre sous `prefers-reduced-motion`.

Deux jetons de plus (`src/styles/jetons.ts`, rôle « toile ») : **`--apercu-coupe`** (`#cc4a1a`) et **`--apercu-stylo`** (`#3d6fe0`),
les mêmes dans les deux thèmes parce qu’ils se posent sur le plan, qui ne change pas avec le thème : chacun tient **3:1** contre le
plan blanc, le plan sombre et la case grise du damier (six paires graphiques). En **contraste forcé**, la toile garde les couleurs de
l’auteur (comme le dessin) : l’aperçu garde les siennes, choisies pour se lire sur chaque fond, et le contour de coupe s’épaissit.

## Conséquences

- **Octets** : aucune référence existante ne bouge (`ecriture-stable` vert sans `ACTUALISER_REFERENCES`, ni les empreintes de la
  bibliothèque, ni les témoins 1 à 8). Quatre références neuves : `cricut-operations` (le document avec `data-ed-operation`) et
  `couper-ecrire-a-couper`, `-a-ecrire`, `-combine` ; trois fichiers témoins neufs (`temoin-9-couper-ecrire-*.svg`).
- **Ce qui change pour qui découpait** : en découpe, une forme sans fond n’est plus un constat bloquant mais une forme « À écrire » ;
  l’export d’un tel dessin livre l’archive. Tests modifiés parce que le comportement a changé, et c’est voulu :
  `tests/unit/engine/preparation.test.ts` (un contour sans fond ne bloque plus ; dit « à couper », il bloque),
  `tests/unit/export/temoins-cricut.test.ts` (le témoin 7 en découpe : rien à dire ; dit « à couper », le trait ouvert),
  `tests/e2e/stylo.e2e.ts` (un texte à trait unique en découpe se range « À écrire » ; « Écrire au stylo » corrige), et les états
  d’éditeur montés à la main des tests de `zones` (`apercuMachine`).
- **Nouveaux tests** : `tests/unit/engine/operations.test.ts` (règle, choix, partage, fichier, relecture, jugement),
  `tests/unit/export/operations.test.ts` (export par opération, archive, octets), `tests/unit/zones/operations.test.ts` (le geste,
  l’aperçu, la fin du parcours), `tests/e2e/operations.e2e.ts` (panneau, sélection, passage à la souris, au clavier, en glissant,
  Ctrl+Z, aperçu hachuré et ses trous, menu Vue, export, document enregistré, Générique inchangé, axe en clair, sombre et contraste
  forcé, 390 px au doigt).
- **Fichiers d’interface touchés par ajout isolé** : `BarreSelection.tsx` (un import, `<OperationSelection />` dans chaque rangée),
  `ToileEditeur.tsx` (un import, `<ApercuMachine />` avant les formes) ; le reste vit dans `CalquesOperations.tsx`,
  `ApercuMachine.tsx` et `OperationSelection.tsx`.
- **Limites, honnêtement** :
  - rien de Design Space n’a été essayé (témoin 9) ; l’ordre « écrire puis couper » sur la machine non plus ;
  - un choix égal à la proposition ne s’écrit pas : rouvert puis passé à un autre procédé, la forme suit le nouveau défaut ;
  - un contour fermé sans fond qu’on veut couper le long de sa ligne reste bloqué comme avant (« Contour en forme ») ;
  - glisser ne marche qu’à la souris (au doigt, le bouton de la ligne) ; une vignette blanche ne se voit pas sur le plan blanc ;
  - l’aperçu ne montre pas le contour d’une forme à couper (il bloque l’export, le constat le dit) ;
  - la fiche de la page (« Télécharger le SVG » après « Terminer ») réécrit le dessin sans la marque de production ni les opérations,
    comme elle le faisait déjà pour la marque ; le brouillon et la reprise de l’édition les gardent.

## Alternatives écartées

- **Une opération par couleur** (la convention « noir pour couper, bleu pour dessiner » de l’ADR-0013) : elle mêle deux décisions
  (le papier et l’outil) et oblige à recolorer le dessin pour changer d’outil ; l’opération reste une donnée de la forme.
- **Un seul fichier, opérations dans des groupes, sans fichiers séparés** : Design Space pourrait dissocier les groupes à l’import ;
  les deux fichiers d’une seule opération ne dépendent de rien. Le combiné reste un raccourci.
- **Écrire l’opération dans chaque export** : Design Space ne la lit pas, et un fichier d’une seule opération la dit par ce qu’il porte.
- **Hachurer en pur, dans le moteur** (des lignes calculées par région) : le motif SVG posé avec la règle de remplissage de la forme
  donne exactement la même région, trous compris, sans calcul ni mémoire par forme ; rien n’en est écrit.
- **Toujours écrire le choix, même égal à la proposition** : des octets de plus pour un dessin où personne n’a rien changé de ce que
  la machine fera, contre le principe de l’ADR-0013.
