# ADR-0038 — Règles, repères et répétitions

**Date :** 25 octobre 2026
**Statut :** acceptée (s’appuie sur les ADR-0001, 0004, 0006, 0008, 0011, 0013, 0015, 0029 et 0030) ; **aucune référence
d’écriture existante ne change** (`ecriture-stable` vert sans `ACTUALISER_REFERENCES`), six références neuves :
`repetition-grille`, `repetition-radiale`, `repetition-symetrie`, `arrondir-coin`, `largeur-variable`, `reperes-document`.

## Contexte

Demande du propriétaire : des outils de professionnel qui manquent à l’éditeur — des règles et des repères, la répétition d’une
sélection (grille, radiale, symétrie), des coins arrondis en direct, et, si le modèle à plat le permet, une largeur de trait
variable. Avant d’écrire quoi que ce soit, l’inventaire de ce qui existait :

| Demandé | Existait | Ce qui manquait |
|---|---|---|
| Règles, repères | Une grille magnétique (`G`, `engine/edition/grille.ts`) et des aimants vers les autres formes (`M`, `ciblesAimants`), dont les lignes s’appellent déjà « guides » dans l’interface (`ui.guides`) | Tout : ni règle, ni repère de document |
| Dupliquer en grille, radiale | « Dupliquer » (Ctrl+D) et les transformations numériques | Toute répétition en nombre |
| Symétrie | « Miroir horizontal / vertical » (la rangée de la sélection) autour du centre de la sélection, en place | Un axe choisi (un repère), et garder l’original |
| Coins arrondis | « Arrondir les angles… » (`engine/edition/arrondi.ts`, `filet.ts`) : un arc tangent aux deux segments, droites et courbes, rayon ramené quand les côtés sont trop courts | Le direct (un curseur), et les coins choisis en mode points |
| Largeur variable | « Contour en forme » (ADR-0015) : le pavage et l’union qui font d’un trait une surface | Un profil de largeur |

Rien n’est refait : l’arrondi reprend `filetEntre`, la largeur variable le pavage et l’union de l’ADR-0015, les aimants leur calcul.

## Décision

### 1. Les repères sont un réglage du document, dans le dessin

`DessinSvg.reperes?: { h: number[]; v: number[] }` (`engine/edition/types.ts`) : les ordonnées des repères horizontaux et les
abscisses des verticaux, en unités du plan, **au millième, triées, sans doublon, au plus 200 par axe**, et **absent** d’un dessin
qui n’en a pas (jamais un champ vide). Les opérations sont pures (`engine/edition/reperes.ts` : `ajouterRepere`, `deplacerRepere`,
`supprimerRepere`, `effacerReperes`, `avecReperes`), rendent le même objet quand rien ne change, et passent donc par
l’historique : poser, déplacer, retirer, effacer un repère s’annule par Ctrl+Z, et compte comme une modification à enregistrer.

Pourquoi dans le dessin plutôt que dans l’état de l’interface (comme le contexte de production de l’ADR-0013) : un repère se pose
et se retire comme on retouche, on veut l’annuler ; il voyage avec le dessin (versions, brouillon, projet) sans que chaque hôte
ait à le porter à part ; et toute opération qui rend `{ ...dessin, formes }` le garde sans le savoir.

**Dans le fichier** : un seul attribut sur la racine, à la suite de la marque du contexte, **seulement s’il y a un repère** :
`data-ed-reperes="h:10,20.5;v:30"` (l’horizontal d’abord, chaque valeur au millième). `svgDocument` (le document enregistré, le
brouillon, les versions et « Télécharger le SVG » aux options neutres, qui est ce document, ADR-0018) l’ajoute par
`marquerReperes` ; `ecrireDessin` ne l’écrit jamais, donc **aucun export** (SVG aux options touchées, PDF, EPS, DXF, PNG, Cricut,
Print Then Cut, stylo) ne le porte. La lecture (`lireDessin`) le relit et rend les mêmes octets ; un attribut illisible (axe
inconnu, nombre hors bornes, texte de plus de 7 208 caractères, axe répété) est laissé de côté entier et **dit**
(`ignores` : « les repères du document (illisibles) », ADR-0009 et 0014) ; la lecture ne lève jamais.

**Dans le projet** (ADR-0030) : `dessin.reperes` facultatif, à pleine précision, validé (deux listes de nombres bornés, 200 par
axe, l’une au moins non vide), absent d’un projet sans repère : un projet d’avant reste le même texte, et l’aller-retour
projet → dessin → projet est exact. Le format reste à la version 1 : un champ facultatif de plus, qu’une version antérieure
ignore (elle perdrait les repères, pas le dessin) ; si l’étape 0 du modèle v2 change la version du projet entre-temps, ce champ
suit sa migration.

Ce qui n’est **pas** du document : afficher les règles, afficher les repères, les verrouiller. Ce sont des réglages de la session
(`zones/contexteRegles.tsx`), comme la grille et les aimants ; les règles sont masquées à l’ouverture.

### 2. Les règles

En haut et à gauche de la toile (`zones/Regles.tsx`), une feuille de panneau de 24 px (40 au doigt), graduée par un calcul pur
(`zones/graduations.ts`) : un pas majeur de 1, 2 ou 5 fois une puissance de dix, le plus petit qui laisse 64 px entre deux
libellés, coupé en cinq (ou en quatre pour un pas en 2). L’unité est celle du plan, ou, **en contexte de production, les
millimètres ou les pouces du profil** (`versUnite` / `depuisUnite`, ADR-0013) : les règles, l’étiquette d’un repère qu’on tire et
les champs du panneau parlent la même unité. Le zéro est celui du plan (l’origine des coordonnées, comme les champs X et Y de
l’inspecteur). Les libellés sont du texte HTML, en chasse fixe à l’encre douce : un `<text>` SVG n’a pas de fond qu’un audit sache
lire.

### 3. Tirer, déplacer, verrouiller, retirer, poser à une valeur

- **Tirer** : glisser depuis la règle du haut pose un repère horizontal, depuis celle de gauche un vertical ; relâché sur la règle,
  il n’est pas posé ; Échap abandonne. L’étiquette de sa valeur suit le pointeur.
- **Aimanter le repère tiré ou glissé** : à la grille quand elle est active, sinon (aimants actifs) aux bords et aux centres des
  formes et du plan, à 6 px d’écran.
- **Déplacer** : un repère se prend à la souris (cible invisible de 10 px, 24 au doigt), glisse en une seule entrée d’historique ;
  **relâché hors de la toile ou sur une règle, il est retiré**. Le groupe des repères prend le pointeur pendant le geste : la ligne
  glissée change d’élément à chaque pas.
- **Choisir** : un clic le choisit (trait épaissi sur un halo) ; **Suppr** le retire, les **flèches** le déplacent (un millième du
  plan, dix avec Maj), **Entrée** ouvre son champ, **Échap** le rend. Ces touches passent avant celles de l’éditeur (écoutées à la
  capture) : Suppr ne supprime pas la sélection de formes derrière le repère.
- **Poser à une valeur exacte** : un **double-clic** sur un repère ouvre le panneau « Repères », son champ pris ; Entrée y pose la
  valeur. Le panneau liste tous les repères (champ, bouton qui retire) et en ajoute un à une valeur (sens, valeur, « Poser le
  repère »). Au clavier, chaque règle est un bouton : **Entrée** pose un repère au milieu de la vue et ouvre son champ.
- **Verrouillés**, les repères ne se prennent plus (ils attirent toujours) ; **masqués**, ils ne se dessinent plus et n’attirent
  plus, le document les garde.

Menu Vue : « Afficher les règles » (**Maj+R** ; Ctrl+R recharge la page dans tout navigateur), « Afficher les repères » (**Ctrl+;**),
« Verrouiller les repères » (**Ctrl+Alt+;**), « Repères : valeurs exactes… », « Effacer les repères » (**Ctrl+Maj+;**, annulable).
Le point-virgule se lit par son caractère ou par sa place (QWERTY, Option sur Mac, et « . » de la touche AZERTY avec Maj).

### 4. Les aimants s’accrochent aux repères

`ciblesAimants` ajoute les repères en **boîtes sans épaisseur** (`boitesReperes`) : un horizontal est une boîte de hauteur nulle
sur toute la largeur du plan, un vertical une boîte de largeur nulle sur toute sa hauteur. Leurs bords et leur centre tombent sur
le repère dans son axe, et sur ceux du plan dans l’autre, qui attiraient déjà : le calcul de `aimanter` ne change pas d’une ligne,
et la ligne d’aimant montrée suit le repère. Sans repère, les cibles sont exactement celles d’avant. « Aimants vers les formes et
les repères » (M) règle les deux ; les repères masqués sont retirés des cibles (`Gestes.ts`).

### 5. Répéter la sélection

`engine/edition/repetition.ts`, pur et déterministe (mêmes réglages, mêmes formes, mêmes identifiants, même ordre) :

- `dupliquerEnGrille(dessin, ids, { lignes, colonnes, pasX, pasY })` : `lignes × colonnes` exemplaires, l’original en (0, 0), ligne
  par ligne ; 1 à 100 lignes et colonnes ; le pas proposé est la taille de la sélection plus un dixième de son plus grand côté.
- `repetitionRadiale(dessin, ids, { exemplaires, angle, centre, orienter })` : `exemplaires` en tout (l’original compris, 2 à 360)
  sur `angle` degrés ; un tour complet (360) partage l’angle en `exemplaires`, un arc place le premier et le dernier à ses deux
  bouts ; `orienter` tourne chaque copie avec sa place (des pétales), sinon elle ne fait que s’y déplacer. Centre : du plan (par
  défaut), de la sélection, ou un point.
- `symetrie(dessin, ids, { sens, axe, garder })` : le miroir horizontal (`h`, autour d’un axe vertical d’abscisse `axe`) ou vertical
  (`v`), une copie retournée (l’original gardé) ou la sélection retournée en place. L’axe proposé passe par le centre de la
  sélection ; le panneau propose aussi chaque repère du bon sens.

**Les copies sont des formes ordinaires** : ni groupe, ni clone lié, ni réglage gardé. Le modèle à plat n’a pas de groupe ; le
modèle v2 (ADR-0012) les apportera, et une répétition pourra alors rendre un groupe (et une répétition vivante, qu’on règle après
coup). Chaque jeu de copies reprend la sélection entière dans son ordre d’empilement et se pose juste au-dessus de la plus haute
forme choisie ; un texte posé copié avec sa forme se pose sur la copie de la forme (ADR-0031), copié seul il redevient libre. Au-delà
de 10 000 formes créées en un geste, la répétition refuse en le disant.

**L’interface** : menu Édition (« Dupliquer en grille… », « Répétition radiale… », « Symétrie… ») et menu « Répéter » de la rangée
de la sélection (rubrique « Répéter » du menu « Plus » sur un téléphone). Chacun ouvre un **panneau flottant** sur la toile
(`zones/PanneauRepetition.tsx`, onglets Grille, Radiale, Symétrie) qui montre le résultat **en direct** : chaque réglage rejoue
l’opération depuis le dessin d’avant l’ouverture, dans une seule entrée d’historique (la clé du geste). « Appliquer » la garde et
choisit l’original et ses copies, « Annuler » ou Échap la retire ; une modification faite ailleurs garde l’aperçu et ferme le
panneau. Ses boutons sont secondaires : l’aperçu est sur la toile, et le geste de fin de la barre reste la seule action pleine.

### 6. Les coins arrondis en direct

`arrondirAngles(chemin, rayon, coins?)` et `arrondirFormes(…, coins?)` prennent en plus l’ensemble des **indices des commandes
dont l’ancre est un coin à arrondir** (ce que le mode points désigne) ; absent, tous les coins, octet pour octet comme avant. Un
coin non choisi n’en est pas un pour le calcul : ses segments donnent tout leur budget au coin choisi (un coin seul peut prendre
presque tout son côté). Le cercle reste tangent aux deux segments (droites : la formule ; courbes : Newton sous budget puis
bissection sur le rayon, `filet.ts`, l’approximation documentée de l’ADR-0015), et le rayon reste borné par la longueur des côtés.

Dans la section « Transformer », `zones/ArrondiDirect.tsx` remplace le champ « Rayon des angles » : le même champ (Entrée, ou
« Arrondir les angles »), plus un **curseur « En direct »** qui arrondit sous les yeux depuis le dessin d’avant le réglage, dans une
entrée d’historique, et dit le résultat en le quittant. En mode points, avec un point actif, le libellé devient « Arrondir ce coin »
et seul ce coin s’arrondit.

### 7. La largeur variable : une conversion, réaliste sur le modèle à plat

Elle est faite, **comme conversion** et non comme style : `largeurVariable(dessin, ids, { debut, milieu, fin })`
(`engine/contour/largeur.ts`) fait du trait une surface pleine dont la largeur suit le profil (deux courbes en S, u² (3 − 2u),
sans trigonométrie), couleur du trait en fond, courbes rebâties — exactement le circuit de « Contour en forme » : le tracé aplati
est recoupé (au plus un 96ᵉ de sa longueur par segment, sans quoi une droite n’aurait que ses deux bouts pour porter le profil),
pavé de quadrilatères qui partagent exactement leurs sommets (un seul point de bord par côté aux virages doux), avec une cale ronde
aux vrais coins et aux virages de plus de trente degrés, puis uni ; un échec réessaie à tolérance ×3 puis ×9 et refuse en le
nommant. Un tracé fermé s’ouvre à son départ, ses deux bouts arrondis s’y rejoignent. L’interface : « Largeur variable du trait »
(Début, Milieu, Fin, « Élargir le trait ») dans la section « Transformer ».

Ce qui attend le modèle v2 : un trait **vivant** à largeur variable (un profil gardé sur la forme, modifiable après coup, rendu par
chaque export). Le modèle à plat n’a qu’une épaisseur par forme, et SVG n’a pas de trait à largeur variable : il faudrait un champ
de forme que l’écriture, la lecture, les exports et la préparation Cricut sachent tous porter. La conversion, elle, ne demande rien
au modèle.

## Conséquences

- Aucun octet de plus pour un dessin sans repère ; aucune référence réécrite ; six références neuves.
- Un document avec repères porte `data-ed-reperes` ; « Télécharger le SVG » aux options neutres aussi (c’est le document, comme
  pour la marque du contexte) ; aucun export ne le porte.
- `ciblesAimants` rend les repères après les formes : un appel sans repère rend les mêmes cibles qu’avant.
- Les panneaux flottants (`.panneau-flottant`) sont une surface nouvelle de la toile, avec l’ombre d’un menu ; au-dessous de 640 px,
  ils se posent en bas de la toile, sur toute sa largeur.
- `Gestes.ts`, `ToileEditeur.tsx`, `MenusBarre.tsx`, `BarreSelection.tsx`, `icones.tsx`, `Cadre.tsx`, `OutilsTrace.tsx` et
  `actionsProduction.ts` ne reçoivent que des ajouts isolés ; le reste vit dans des modules neufs.

## Alternatives écartées

- **Les repères dans l’état de l’interface**, écrits à part comme la marque du contexte : pas d’annulation, et chaque hôte aurait
  dû les porter à côté du dessin.
- **Un repère par attribut** (`data-ed-repere-1`…) ou des éléments `<line>` dans le SVG : un fichier lu ailleurs les dessinerait, et
  la liste blanche de l’ADR-0014 devrait les connaître ; un attribut de la racine est inerte partout.
- **Les copies en groupe ou en clones `<use>`** : le modèle à plat n’en a pas (ADR-0001) ; ce sera le modèle v2.
- **Un aperçu en surimpression** (des fantômes dessinés par-dessus) plutôt que le vrai résultat dans l’entrée du geste : il aurait
  fallu redessiner les textes posés et les traits à part, et l’aperçu n’aurait pas été ce qui s’écrit.
- **Ctrl+R pour les règles** (Illustrator) : le navigateur recharge la page.
