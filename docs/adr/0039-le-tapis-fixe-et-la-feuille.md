# ADR-0039 — Le tapis fixe, la feuille et « Dupliquer sur la feuille »

**Date :** 26 octobre 2026
**Statut :** acceptée (prolonge les ADR-0013 et 0028, s’appuie sur les ADR-0004, 0005, 0006, 0008, 0011 et 0038) ; à l’origine, **aucune référence
d’écriture existante ne change** : un dessin où personne n’a rien réglé garde ses octets, en Générique comme en Cricut ; **révisée le
26 octobre 2026** : la case « Recalage automatique » est **décochée par défaut**, le tapis est fixe dès le départ (voir « Révision du
26 octobre 2026 — le tapis fixe par défaut ») ; **l’export Cricut par défaut change : version majeure**. Les §1 et §3 ci-dessous
décrivent la décision d’origine ; là où ils disent « cochée par défaut », « décochée » et `recalage: false`, la révision l’emporte

## Contexte

Demandes du propriétaire, du 26 octobre 2026 :

1. « Pour le mode Cricut, le tapis et le canevas sont fixes ; je place les objets sur le canevas, il ne repositionne pas
   automatiquement le canevas à partir du point haut à gauche des formes. Il y a une option pour le recalage automatique ; sinon je
   place mes objets sur la zone. Je veux pouvoir utiliser une feuille partielle, qui n’est pas en haut à gauche, à la découpe. »
2. « Je dois pouvoir dupliquer et positionner un objet simplement (quantité ou remplir la feuille afin d’optimiser) en mode Cricut. »
   Puis : « Inclus le découpage complexe type étoile en option : optimisation simple ou pas », et « Utilisation de l’espace
   disponible, il peut y avoir des objets sur le canevas. »

**Ce que faisait l’éditeur** (relevé avant de rien changer) :

- Le plan de travail (viewBox) n’avait pas la taille du tapis : c’était celui du fichier ouvert. Le contexte Cricut ne le touchait
  pas.
- Le gabarit du tapis, sur la toile, **suivait le dessin** : sa zone utile était calée sur le coin haut gauche de l’étendue visible
  (`cadreTapis(profil, etendue)`, ADR-0013 §9), « là où Design Space pose les pièces ». Déplacer une forme vers la gauche déplaçait le
  tapis. « Ajuster » (0) cadrait ce tapis mobile.
- L’export (`svgCricut`, `svgPourStylo`, l’archive d’un dessin mêlé) écrivait le viewBox du plan tel quel, à taille physique : les
  formes gardaient leur place **dans le plan**, rien ne disait leur place **sur le tapis**.
- Rien ne recalait les coordonnées des formes, ni à l’édition ni à l’export : le « recalage » était celui du gabarit à l’écran, et
  celui que Design Space fait à l’import.

**Ce que fait Design Space** (recherche ; rien n’a été essayé sur une machine) :

- Le manuel (« Attach to hold cut placement », Cricut Design Space User Manual) : par défaut, les projets se coupent en mode
  économie de papier, les images rapprochées sur le tapis ; **« Attaching holds your cuts in the same position on the cutting mat as
  they appear on the design screen »** ; attacher **fond les calques sélectionnés en une seule couleur**, coupée sur un même tapis ;
  il faut au moins deux calques.
- Un tutoriel (Underground Crafter, « How To Lock Image Positions in Design Space », 2019) : Design Space pose le dessin **dans le
  coin haut gauche du tapis** par défaut ; **le faire glisser sur l’aperçu du tapis** fixe sa position à cet endroit.
- L’aide de Cricut (écran « Prepare ») : les images se déplacent et se tournent sur l’aperçu du tapis ; ce qu’on y change n’affecte
  pas le canevas, et une mise à jour des copies le défait.
- Le blog de Cricut (« 3 ways to use the new Guides feature ») : une forme passée en **« Guide »** (menu Opération) **ne se coupe
  pas** ni ne fait rien d’autre une fois « Make It » choisi ; elle sert de gabarit sur le canevas. Le billet ne dit rien d’un Guide
  attaché.
- Des tutoriels (So Fontsy, sur les dessins plus grands que le tapis) posent un carré de 11,5 × 11,5 po, la zone de coupe d’un tapis
  de 12 po, comme repère.
- Des utilisateurs (forums Inkscape et Adobe) rapportent que Design Space ne garde pas le blanc autour d’un dessin : l’import est
  rogné aux formes. Aucune documentation de Cricut ne le dit.

La méthode reconnue pour couper à un endroit précis est donc : **un cadre de la taille de la zone de coupe, attaché aux formes**
(l’ensemble attaché prend toute la zone, chaque forme y garde sa distance aux bords), **passé en « Guide »** pour ne pas être coupé ;
ou, à défaut, **déplacer le dessin sur l’aperçu du tapis**.

## Décision

### 1. Le recalage automatique, un réglage de production

`ChoixMachine.recalage?: false` (`model/contextes.ts`) : **absent, le comportement d’avant**, au nombre près (le gabarit suit le
coin du dessin, `gabaritDuTapis` rend exactement `cadreTapis`). La case **« Recalage automatique »** du panneau « Prêt pour Cricut »
est **cochée par défaut** : qui ne touche à rien ne voit rien changer. Décochée :

- **le plan de travail devient le tapis**, fixe : au moment de décocher, le viewBox prend le tapis tel que la toile le montrait
  (`planPourChoix`, `planDuTapis`, au millième) ; rien ne bouge à l’écran, les formes gardent leurs coordonnées. C’est une entrée
  d’historique (le dessin change), le réglage restant hors de l’historique (ADR-0013 §5). Changer de tapis lui donne la taille du
  nouveau, au même coin ;
- **le tapis ne suit plus le dessin** : son coin est celui du plan (`cadreFixe`), sa zone utile centrée dessus ; « Ajuster » le
  cadre ; « Ajuster le plan de travail » est grisé avec sa raison (il recalerait) ;
- **l’export garde la place des formes** (§ 3) ;
- un **constat « à corriger »** dit une forme qui sort de la feuille ou de la zone utile (`hors-tapis`), avec sa correction « Ramener
  dans la zone utile » (le plus petit déplacement par forme, `ramener-zone`) ; « dépassement » ne se pose plus dans ce mode, puisque
  l’ensemble tient s’il tient sur le tapis fixe. Un point « à corriger » demande une confirmation, jamais un bloquant de plus.

Print Then Cut n’a ni gabarit ni recalage : le réglage y est gardé, sans effet.

### 2. La feuille sur le tapis

`ChoixMachine.feuille?: { x, y, l, h }` : une boîte en unités du plan depuis le coin haut gauche du tapis, **absente pour le tapis
entier**. Le panneau la règle (largeur, hauteur, distance aux bords gauche et haut, dans l’unité retenue ; « Tapis entier ») ;
`normaliserChoix` la ramène sur le tapis choisi, au centième, un demi-pouce de côté au moins (`feuilleSur`). La toile la montre d’un
contour discret, plein, dans un jeton neuf **`--feuille-tapis`** (`#9a6a00`, rôle toile, 3:1 au moins sur le plan blanc, sombre et la
case grise du damier ; en contraste forcé, `Highlight` comme la zone utile) : on la voit avec ou sans l’aperçu de la machine. La
machine coupe là où la feuille croise la zone utile (`regionDeCoupe`) : c’est la région du constat `hors-tapis`, de sa correction, et
de « Dupliquer sur la feuille ».

### 3. Le fichier : le document le garde, l’export jamais

- **Le document** (`svgDocument`) écrit `data-ed-recalage="non"` et `data-ed-feuille="x-y-l-h"` (centièmes d’unité, des entiers :
  un identifiant valide) **en dernier** sur la racine, **seulement hors du défaut** ; la relecture n’accepte que la valeur exacte
  « non » et quatre entiers (`lireFeuille`). Une marque d’avant garde ses octets ; Générique n’écrit rien. Les invariants de
  l’écriture admettent les deux attributs sur la racine seule, avec une valeur d’identifiant.
- **Le projet JSON** les porte de même (champs facultatifs de `production`, refusés en le nommant s’ils sont mal formés).
- **L’export** (`marqueDeProfil`) ne les écrit jamais. Sans recalage, il pose le plan sur le tapis fixe (viewBox du tapis, taille
  physique du tapis) et **un cadre de repérage par couleur**, de la taille de la zone utile, **sous** les formes (`export/reperage.ts`) :
  un anneau plein de 2 unités (environ 0,5 mm) dans le fichier de la lame, le rectangle en trait à la largeur du stylo dans celui du
  stylo, en tête du groupe « a-couper » du fichier combiné. Un cadre par couleur parce qu’**Attacher fond les couleurs** : chaque
  tapis garde la sienne. Les formes ne bougent pas d’une coordonnée. **Avec le recalage, l’export est celui d’avant, à l’octet** :
  `avecReperage` rend le même objet.
- La carte « Dans Design Space » et le mode d’emploi de l’archive disent la marche, chaque étape « (à vérifier) » : pour chaque
  couleur, sélectionner le cadre et les formes de sa couleur, « Attacher » ; passer chaque cadre en « Guide » ; sur l’aperçu du
  tapis, vérifier la place (la carte donne la distance du dessin aux bords gauche et haut du tapis) ou y faire glisser le dessin,
  puis poser la feuille à cet endroit.

### 4. « Dupliquer sur la feuille »

Une commande de la sélection en Cricut qui coupe ou écrit : menu Édition et menu « Répéter » de la rangée de la sélection
(« Dupliquer sur la feuille… »), et un bouton du panneau. Elle ouvre un panneau flottant (comme ceux de l’ADR-0038) : **« Copies à
ajouter »** (l’original reste en plus) ou **« Remplir la feuille »**, **espacement** et **marge** au bord de la feuille (2 mm par
défaut chacun, de 0 à 2 po), **rotation d’un quart de tour permise** (cochée), **optimisation Simple ou Avancée**. La sélection,
une forme ou plusieurs gardées ensemble comme une seule pièce, est copiée et rangée dans la région de coupe de la feuille, sans
chevaucher ce qui y est déjà. Les copies gardent l’opération de l’original (`copierPar`, ADR-0028) ; en modèle riche, chaque copie
passe par la duplication des nœuds. **Une seule entrée d’historique** : Ctrl+Z retire toutes les copies. La région vocale dit
combien : « 5 copies posées sur la feuille », « 9 copies posées sur 12 : la feuille est pleine », jamais un débordement.

**Les obstacles** : les formes déjà posées que la machine coupera ou écrira — visibles et peintes, verrouillées comprises — qui
touchent la feuille ; une forme masquée n’en est pas une, une forme hors de la feuille est ignorée ; l’original reste où il est et
compte pour ses copies.

**Le calcul est pur et déterministe** (`engine/preparation/placement.ts`) :

- **Simple** : par boîtes englobantes (trait compris), en rangées de gauche à droite et de haut en bas, chaque obstacle sauté par sa
  boîte élargie de l’espacement ; avec la rotation, les deux orientations sont essayées, la meilleure gardée (à égalité, droite).
- **Avancée** : sur les **contours réels**, aplatis par les booléens (`regionPeinte`, fond et trait, mémorisée par forme, puis unis
  par `unirRegions`) ; placement glouton « en haut à gauche » sur une grille au pas de l’espacement, aux quatre quarts de tour si la
  rotation est permise ; chaque copie prend, parmi les orientations, la première position libre dans l’ordre de lecture. Deux pièces
  sont assez loin quand leurs contours sont à l’espacement l’un de l’autre : c’est **exactement l’intersection vide des contours
  élargis d’un demi-espacement à angles ronds**, testée sans calculer l’élargissement (croisement des côtés, distance des sommets aux
  côtés, inclusion). Une position refusée l’est pour toujours (les pièces ne font que s’ajouter) : chaque orientation garde son
  curseur, la grille ne se parcourt qu’une fois. Les courbes s’aplatissent à un huitième de l’espacement (`toleranceImbrication`) et
  l’écart testé est l’espacement plus deux tolérances : la courbe vraie garde l’espacement. **L’avancée rend le meilleur des deux
  calculs** : elle pose toujours au moins autant que la simple.
- **Le budget** : le moteur avance par tranches d’essais (`avancerPlacement`, qui ne touche pas l’état reçu) ; `io/placement.ts` mesure
  le temps, rend la main au navigateur toutes les 12 ms et s’arrête à 4 s en rendant le meilleur placement trouvé (« Le calcul a
  atteint sa limite ») ; le panneau montre « Calcul en cours… N copies trouvées » (`aria-busy`) et « Arrêter le calcul » (ou Échap),
  qui n’ajoute rien. Le moteur ne lit jamais l’horloge.

**Mesures** (ADR-0008 ; Node 22, une feuille de 11,5 × 11,5 po, espacement et marge de 2 mm, rotation permise, le meilleur de trois) :

| Pièce | Quantité | Simple | Avancée |
|---|---|---|---|
| Étoile de 1,25 po | 50 | 50 copies, 1 ms | 50 copies, 0 ms (la simple suffit) |
| Étoile de 1,25 po | remplir | 80 copies, 1 ms | 109 copies, 160 ms |
| Étoile de 2 po | 50 | 29 copies, 0 ms | 46 copies, 136 ms |
| Cœur (courbes) de 1,25 po | remplir | 62 copies, 0 ms | 72 copies, 542 ms |
| Lettre « A » de 1,25 po | remplir | 79 copies, 0 ms | 98 copies, 127 ms |

Au-delà de quelques dizaines de millisecondes, l’avancée passe donc par tranches : l’interface reste vive et l’attente s’arrête.
Avant l’aplatissement à la tolérance de l’imbrication, le cœur prenait 5,8 s (ses courbes avaient des centaines de côtés).

## Ce qui reste à vérifier sur la machine

Quatre comportements `aVerifier` dans `model/contextes.ts` (`DESIGN_SPACE_POSITION`), un **témoin 10** au protocole
(`temoin-10-feuille-partielle.svg`), et un test oblige le protocole à les nommer :

- `designSpace.position.rognage` : l’import rogne le SVG à ses formes (d’où le cadre) ;
- `designSpace.position.coin` : un ensemble attaché se pose au coin haut gauche de la zone de coupe, à sa place relative ;
- `designSpace.position.guide` : un cadre passé en « Guide » et attaché garde la place sans être coupé (si un Guide attaché ne compte
  plus dans la place de l’ensemble, le repli est l’aperçu du tapis) ;
- `designSpace.position.glisser` : faire glisser le dessin sur l’aperçu du tapis le fait couper à cet endroit.

S’y ajoutent les valeurs déjà `aVerifier` des zones utiles (le cadre en a la taille).

## Conséquences

- **Octets** : `ecriture-stable` et `ecriture-stable-v2` passent sans `ACTUALISER_REFERENCES`, les témoins 1 à 9 et les références
  v1 ne bougent pas ; `tests/unit/export/recalage.test.ts` vérifie que l’export avec le recalage rend `cricut-export.attendu.svg` à
  l’octet. Quatre références neuves dans `tests/fixtures/cricut-recalage/` (export de la lame, du stylo, fichier combiné, mode
  d’emploi), faites par `ACTUALISER_REFERENCES=1 npx vitest run tests/unit/export/recalage.test.ts` et relues ; un témoin neuf.
- **Tests** : `tests/unit/engine/recalage.test.ts`, `tests/unit/engine/placement.test.ts`, `tests/unit/export/recalage.test.ts`,
  `tests/unit/zones/recalage.test.ts`, `tests/e2e/cricut-feuille.e2e.ts` (recalage décoché et coché, fichier rouvert, remplir et
  Ctrl+Z, quantité 5, feuille partielle décalée, étoiles en avancée, axe-core).
- **Fichiers d’interface** : `ReglagesTapis.tsx` (la case et la feuille, montés par une ligne dans le panneau), `PanneauFeuille.tsx`
  (le panneau flottant, monté par une ligne dans la toile), une ligne au menu de la répétition (`menusOutilsPro.ts`), le gabarit
  (`Production.tsx`).
- **Limites, honnêtement** :
  - rien de Design Space n’a été essayé (témoin 10) ;
  - le cadre est plus fin que la lame : rouvert dans l’éditeur, l’export dit « parties trop fines » sur lui (c’est un guide, on ne
    le coupe pas) ;
  - avec le recalage, la feuille suit le tapis qui suit le dessin : elle sert à « Dupliquer sur la feuille », pas à placer la coupe ;
  - Ctrl+Z après avoir décoché rend l’ancien plan, pas la case : le tapis fixe se pose alors au coin de l’ancien plan ;
  - l’imbrication avancée ne mêle pas les orientations au-delà du quart de tour, ni ne tente de décaler une rangée : c’est un
    glouton, pas un optimum ; un gain simple et sûr serait d’essayer aussi la grille décalée d’un demi-pas (non fait).

## Révision du 26 octobre 2026 — le tapis fixe par défaut

**Contexte.** Décision du propriétaire, du 26 octobre 2026 : « En contexte Cricut, la case “Recalage automatique” doit être décochée
par défaut : le tapis est fixe dès le départ, les objets restent là où on les pose (feuille partielle comprise), et l’on coche la case
pour revenir au recalage sur le coin haut gauche. » La décision d’origine gardait l’ancien comportement par défaut pour ne déplacer
aucun octet ; le propriétaire préfère que le comportement attendu en Cricut soit celui qu’on obtient sans rien régler, et accepte
que l’export change.

**Décision.**

1. **Le défaut s’inverse.** `ChoixMachine.recalage?: true` (`model/contextes.ts`) : **absent, le tapis fixe** ; seul `true` (la case
   cochée) se garde. `normaliserChoix` ne garde que `true` ; `resoudreProfil` rend `recalage: choix.recalage === true`. Le document
   écrit **`data-ed-recalage="oui"`**, en dernier sur la racine avant la feuille, **seulement quand la case est cochée** ; la relecture
   n’accepte que la valeur exacte « oui ». **Un fichier d’avant la révision qui porte `data-ed-recalage="non"` se lit décoché** (le
   nouveau défaut) et **ne réécrit plus l’attribut** : réécrit, il perd ces 23 octets, rien d’autre (son plan était déjà le tapis).
   Le projet JSON suit la même règle : `recalage: true` se garde, **l’ancienne valeur `false` se lit comme le défaut, sans refus**
   (aucun projet réel n’existe à préserver, mais la lecture ne refuse pas), toute autre valeur est refusée en la nommant.
2. **Le tapis dès le départ.** Le calcul du plan vit désormais dans le moteur (`engine/preparation/tapis.ts`, pur : `planPourChoix`,
   `planDOuverture`), pour que la page, le site et les tests partagent la même règle :
   - **choisir le contexte Cricut** (un geste, depuis Générique ou depuis Print Then Cut) pose le plan du tapis **dans une seule entrée
     d’historique** (le choix restant hors de l’historique, ADR-0013 §5) ; Ctrl+Z rend l’ancien plan ;
   - **un fichier ouvert directement en Cricut** (sa marque, le public « machine » de l’accueil, ADR-0024, ou un projet du site)
     reçoit le plan du tapis **dans son état initial**, comme le nuancier de l’ADR-0037 : ce n’est pas une modification, Ctrl+Z n’y
     touche pas, rien ne se réécrit sans geste (`zones/etatEditeur.ts`, `site/Site.tsx`, qui pose la même chose sur son état de
     référence pour ne pas se croire modifié) ;
   - **où se pose le tapis** : un plan qui a déjà la taille du tapis (un document enregistré sans recalage, un plan posé avant de
     cocher la case) est gardé tel quel, son coin compris ; sinon, depuis un tapis qui suivait le dessin (la case cochée), le tapis
     tel que la toile le montrait (rien ne bouge à l’écran, la règle d’origine) ; sinon, le coin haut gauche de la zone utile, là où
     Design Space aurait posé les pièces, **à 2 mm du dessin visible** (la marge par défaut de « Dupliquer sur la feuille » ; moins,
     jusqu’à rien, quand le dessin ne tient dans la zone qu’ainsi) : sans elle, le pourtour d’une forme que « Hachurer » ou « Garder
     le contour » pose au stylo, un trait qui s’épaissit ou une forme poussée d’un cheveu sortaient aussitôt de la zone (« hors du
     tapis » pour 0,2 mm) ; un dessin vide prend le tapis au coin du plan ; un changement de tapis garde le coin ; Print Then Cut et
     la case cochée ne touchent jamais au plan ;
   - **Générique et un dessin hors Cricut ne changent d’aucun octet** : `planDOuverture` rend le même objet.
3. **Un dessin plus grand que le tapis** n’est **jamais déplacé en silence** : le plan se pose au coin du dessin (sans marge du côté
   où il ne tient pas), les formes gardent leurs coordonnées, et le constat « à corriger » `hors-tapis` dit celles qui sortent de la
   zone utile, avec sa correction « Ramener dans la zone utile » (le plus petit déplacement par forme, annulable). Une pièce plus
   grande que la zone utile reste ce qu’elle était : `piece-trop-grande`, bloquante, avec « Ajuster à la zone utile ». « Dépassement »
   ne se pose qu’avec la case cochée.
4. **« Ajuster au dessin » (D)** cadre, sur le tapis fixe, l’étendue des formes visibles (le plan étant le tapis, cadrer le plan ne
   montrait plus « le dessin seul ») ; ailleurs, le plan comme avant (`cadreDuDessin`).
5. **Les textes suivent.** L’aide de la case dit les deux comportements, quel que soit l’état (« Décochée (par défaut)… Cochée… ») ;
   cocher la case dit que le plan reste le tapis et que « Ajuster le plan de travail » le ramène au dessin ; la carte « Dans Design
   Space » ajoute, sur le tapis fixe, comment revenir au recalage ; le mode d’emploi de l’archive dit « Tapis fixe (« Recalage
   automatique » décoché, le réglage par défaut) » et comment cocher la case. Le témoin 10 du protocole devient le cas par défaut ;
   les témoins 1 à 9, qui jugent autre chose que la place, restent écrits la case cochée et gardent leurs octets.

**Conséquences.**

- **Octets (version majeure)** : l’export Cricut **par défaut** (la lame, le stylo, l’archive d’un dessin mêlé) a désormais la taille
  du tapis et porte les cadres de repérage, comme le décrivait le §3 pour la case décochée ; le document d’un dessin choisi ou ouvert
  en Cricut a pour plan le tapis. **Avec la case cochée, l’export est celui d’avant, à l’octet**, pour un même plan :
  `cricut-export`, `cricut-export-mm`, `couper-ecrire-*` et les témoins 1 à 9 se fabriquent avec `recalage: true` et ne bougent pas ;
  `ecriture-stable` et `ecriture-stable-v2` passent sans `ACTUALISER_REFERENCES` ; les références v1 ne bougent pas. Les trois SVG de
  `tests/fixtures/cricut-recalage/` (désormais l’export par défaut) gardent leurs octets ; seul `couper-ecrire-fixe-lisezmoi.attendu.txt`
  change (le texte du point 3), refait par `ACTUALISER_REFERENCES=1 npx vitest run tests/unit/export/recalage.test.ts` et relu.
- **Cocher la case ne rend pas l’ancien plan** : le plan reste le tapis (cocher ne modifie pas le dessin), l’export a alors la taille
  du tapis, sans cadre ; Ctrl+Z juste après le choix du contexte, ou « Ajuster le plan de travail » (permis avec la case cochée), le
  ramène au dessin. Design Space rognant un SVG importé à ses formes (à vérifier, `designSpace.position.rognage`), la place des pièces
  sur le tapis est la même.
- **Choisir Cricut est une modification** (le plan change) : fermer l’éditeur ensuite demande s’il faut l’abandonner, et « Terminer »
  rend le dessin, comme après tout geste.
- **Tests** : `tests/unit/engine/recalage.test.ts` (défaut inversé, ancienne marque « non », projet, plan d’ouverture, dessin plus grand
  que le tapis), `tests/unit/zones/recalage.test.ts`, `tests/unit/export/recalage.test.ts` (la case cochée redonne `cricut-export` et
  `cricut-export-mm` à l’octet), `tests/unit/zones/creerActions.test.ts` (« Ajuster au dessin »), `tests/e2e/cricut-feuille.e2e.ts`
  (ouvert en Cricut : case décochée, plan = tapis, forme au milieu
  gardée à l’export avec son cadre ; cochée : l’export d’avant ; fichier marqué ouvert avec son plan dans l’état initial ; choix du
  contexte en une entrée d’historique), et la mise à jour de `cricut`, `operations` et `fin-parcours`.

## Alternatives écartées

- **Recaler les coordonnées des formes à l’export** (tout ramener au coin) : c’est précisément ce que le propriétaire ne veut pas.
- **Un seul cadre pour toutes les couleurs** : attacher fond les couleurs en une ; un cadre par couleur garde un tapis par couleur.
- **Un cadre de la taille du tapis entier** (12 po) : plus grand que la zone de coupe, Design Space le refuserait ; la zone utile
  est ce que la machine atteint.
- **Un cadre en trait sans fond dans le fichier de la lame** : le fichier n’a que des fonds pleins (ADR-0013 §7) ; un anneau plein
  se voit et ne couvre rien.
- **Écrire le recalage ou la feuille dans l’export** : Design Space ne les lit pas ; le cadre dit tout ce qu’il faut.
- **Un réglage de session seulement** : un dessin préparé pour une feuille partielle doit la retrouver à sa réouverture ; le
  document la garde, hors du défaut, comme le reste du contexte.
- **(Révision) Garder `recalage: false` et écrire `data-ed-recalage="non"` par défaut** : chaque document Cricut porterait un
  attribut de plus pour dire le cas ordinaire ; seul l’écart au défaut s’écrit, comme pour la feuille.
- **(Révision) Refuser un fichier ou un projet qui porte l’ancienne valeur** : il n’en existe presque pas, mais un fichier d’inconnu
  se lit sans refus quand le sens est clair (ADR-0014) ; « non » dit justement le nouveau défaut.
- **(Révision) Recaler le plan au coin du plan d’origine à l’ouverture** (le tapis au coin (0, 0) du viewBox) : un dessin posé près du
  bord tomberait dans la marge du tapis et se dirait « hors du tapis » sans que personne n’ait rien fait ; le tapis se pose là où
  Design Space aurait posé les pièces, et rien ne bouge à l’écran.
- **(Révision) Poser le dessin exactement au coin de la zone utile**, comme le gabarit le montrait avec le recalage : mesuré sur le
  parcours du stylo, la correction « Hachurer » faisait aussitôt naître un « hors du tapis » de 0,2 mm (le pourtour déborde d’un
  demi-trait de stylo) ; la marge de 2 mm ne change rien à ce que la machine coupe, le cadre de repérage tenant la place.
- **(Révision) Déplacer les formes d’un dessin plus grand que le tapis pour qu’elles y tiennent** : c’est le recalage en silence que
  le propriétaire ne veut pas ; le constat le dit et sa correction est un geste annulable.
- **(Révision) Rendre l’ancien plan quand on coche la case** : le plan d’avant le choix n’est plus connu hors de l’historique, et le
  deviner (l’étendue du dessin) changerait le document sans geste ; Ctrl+Z et « Ajuster le plan de travail » le font sur demande.
- **L’élargissement par le décalage de l’ADR-0015** pour l’espacement de l’imbrication : juste, mais un décalage à angles ronds
  multiplie les côtés et le test d’intersection par `polygon-clipping` coûte cher à chaque position ; le test de distance donne
  exactement la même réponse que l’intersection des contours élargis, sans les calculer.
- **Une imbrication par polygone de non-recouvrement (NFP)** : plus dense, mais bien plus de code et de cas limites ; la grille
  gloutonne pose déjà nettement plus que les boîtes sur des étoiles, des lettres et des cœurs.
- **Un Worker** : les tranches mesurées dans `io` suffisent à garder l’interface vive, sans fichier de plus à construire ni à servir.
