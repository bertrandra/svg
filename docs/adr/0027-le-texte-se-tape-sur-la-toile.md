# ADR-0027 — Le texte se tape sur la toile

**Date :** 25 octobre 2026
**Statut :** acceptée (remplace la « saisie en place » de l'ADR-0022 §6, prolonge les ADR-0006, 0010, 0011 et 0021) ; **aucune
référence d'écriture existante ne change** (un cas neuf, `texte-vivant-median`)

## Contexte

Demande du propriétaire : « Après avoir placé un texte je peux le modifier. La fenêtre de texte se tape dans le canevas, avec option
texte trop loin. Voir possibilité dans le menu comme dans Winword et option plus dans un panel. » Puis : « Le format police vectorisé
plein ou médian est une option au même niveau que taille, gras… »

Jusqu'ici on tapait le texte dans un champ du panneau latéral (« Votre texte »), loin de la toile, puis « Ajouter le texte » le posait
au centre du plan ; le retaper ouvrait une petite feuille sous le texte (ADR-0022 §6), où Entrée validait et Échap annulait. Tous les
réglages vivaient dans le panneau.

## Décision

### 1. On tape là où l'on a cliqué

- **L'outil Texte** : un clic sur la toile pose un point d'insertion (le milieu du curseur sur le point, arrondi au centième) et
  ouvre la saisie ; les lettres apparaissent sur la toile au fil de la frappe, composées par le moteur en contours (rien ne change de
  la composition). Un clic sur un texte existant, ou entre ses lettres, le rouvre à l'endroit du clic. Au clavier : les flèches
  déplacent le réticule, Entrée ouvre la saisie à son point (au centre de la vue s'il n'a pas bougé).
- **Un texte posé** : double-clic (curseur au point du clic) ou Entrée (curseur à la fin) rouvre la saisie sur la toile.
- **Entrée** va à la ligne ; **Échap**, Ctrl+Entrée, un clic hors du texte, Tab ou tout focus pris ailleurs **terminent** la saisie :
  le texte reste vivant, choisi, l'outil Sélection repris. Échap n'annule plus : Ctrl+Z le fait, d'un geste.
- **Un texte vide n'est pas créé** : la forme d'un texte neuf n'existe qu'à sa première lettre dessinée (un clic sans frappe ne laisse
  rien, pas même une entrée d'historique). Un texte posé qu'on vide est retiré à la fin, dans la même entrée (Ctrl+Z le rend). Le
  temps de la saisie, un texte qui ne dessine rien (des blancs) cache sa forme sur la toile.
- **L'historique** : chaque suite de frappe est une seule entrée, fondue par sa clé (`util/historique.ts`) ; un réglage de la barre
  intercalé ouvre une entrée à lui, la frappe qui reprend une autre. Ctrl+Z et Ctrl+Y dans le champ défont et refont la frappe, et la
  saisie suit le dessin (on continue de taper).

### 2. Un vrai champ, invisible, et un curseur dessiné par le moteur

Un `<textarea>` transparent (`aria-label` « Texte sur la toile », `wrap="off"`, 16 px), posé sur le texte à l'écran (borné à la toile),
porte le focus, la sélection, le presse-papiers (texte brut), la saisie des accents et l'accessibilité. Il ne reçoit pas le pointeur :
la toile passe ses appuis à la saisie par une poignée du contexte (`PoigneeSaisie`) — clic pour le curseur, Maj+clic et glisser pour
choisir, double-clic pour le mot. Le curseur, la sélection et le cadre sont dessinés dans le plan (`zones/SaisieTexte.tsx`, un calque
SVG sans pointeur), d'après **`engine/texte/curseur.ts`**, pur : la mise en page relit `composerEtMesurer` (qui rend désormais aussi
ses groupes de glyphes, sans rien changer à ses lettres) et le décalage d'alignement de `texte/bloc.ts` ; le curseur tombe exactement
au début de chaque lettre composée (crénage, interlettrage, ligatures partagées à parts égales, alignement), en unités UTF-16 comme
`selectionStart`. Les flèches haut et bas suivent l'abscisse des lettres dessinées (une ligne de la toile n'a pas la largeur d'une ligne
du champ). La matrice du texte porte tout dans le plan : un texte tourné ou agrandi se saisit de même.

L'état de la saisie et les réglages du prochain texte vivent dans un contexte à part (`zones/contexteSaisie.tsx`), comme le texte
(ADR-0010) ; la part pure de la frappe (`zones/saisie.ts` : texte neuf, dessin après une frappe, phrases) est testée sans navigateur.

### 3. Une barre de texte « comme Word »

Avec l'outil Texte, pendant une saisie, ou quand un texte est choisi seul, la rangée sous la barre devient la **barre de texte**
(`zones/BarreTexte.tsx`) : police (et « Toutes les polices », qui ouvre le choix complet du panneau, l'explorateur déplié), style
(Normal, Gras…), taille, tracé « Plein | Médian », alignement, et **« Plus d'options »**, qui termine la saisie et ouvre le panneau Texte
(tiroir compris), son titre focalisé. Avec l'outil Texte, elle règle le prochain texte : un clic sur la toile ne fait donc pas descendre
le plan d'une rangée sous le pointeur. Pour un texte choisi, les gestes de la sélection restent à un clic, dans un menu, et
« Supprimer » au bout : rien n'est retiré. Aucune action pleine. Pendant la saisie, la barre fait partie de la saisie : y aller ne la
termine pas ; un réglage à la souris rend le focus au texte, au clavier il reste dans la barre ; **Alt+F10** y mène depuis le texte,
**Échap** y ramène. Au doigt ou sous 640 px, elle se resserre (police, taille, un menu, « Supprimer »), sans défiler à 390 px.

### 4. Le panneau garde tout

Le panneau de l'outil Texte règle le prochain texte (les mêmes réglages que la barre, partagés) et garde son champ et « Ajouter le
texte » (au centre du plan) pour qui préfère, ou pour un lecteur d'écran ; la section « Texte » de l'inspecteur garde tous les réglages
d'un texte posé, le tracé compris. Ses champs chiffrés s'appliquent à la validation, comme ceux de l'inspecteur.

### 5. Le tracé « Plein | Médian »

Au même rang que la taille ou le gras : **Plein**, des lettres pleines (la découpe) ; **Médian**, une seule ligne au milieu du trait,
ce que suit le stylo (ADR-0022 : au stylo, rien ne se remplit). `TexteVivant.trace?: 'median'`, écrit `data-ed-trace="median"`
(entre `ligatures` et `matrice`) seulement quand il vaut Médian : un texte sans lui reste ce qu'il était, aucune référence ne change.
L'invariant de l'écriture admet cet attribut, à sa seule valeur. Une police à trait unique a déjà sa ligne : elle est toujours en
Médian, ne porte jamais l'attribut, et « Plein » le dit (`aria-disabled`, sa raison).

Pour une police à contour, la ligne se calcule **dans le moteur pur** (`engine/texte/mediane.ts`) en réemployant la chaîne de l'ADR-0021
sans la changer : le contour de la glyphe est rasterisé ici à 200 pixels par cadratin (balayage, règle non nulle), puis amincissement de
Guo-Hall, graphe élagué (barbules de moins d'une épaisseur et quart), jonctions fondues, cubiques ajustées, ramenées aux unités de la
glyphe. **Mémorisé par glyphe et par police** (une `WeakMap` par fonte), déterministe (mêmes contours, mêmes octets ; un cas neuf
d'`ecriture-stable` le fige). Une enveloppe `Glyphes` (mêmes avances, crénage et ligatures) remplace chaque contour par sa ligne :
la composition, le curseur, la vectorisation (Ctrl+Maj+O soude bout à bout), l'export pour le stylo et la toile rendent la même chose,
sans remplissage (`natureDuTexte` : un texte médian est de nature « trait », la peinture bascule comme pour une police à trait).
L'**aperçu « forme / ligne »** d'une police à contour montre cette même ligne au stylo (une seule source de calcul), là où il montrait
le pourtour des lettres.

### 6. Clavier, lecteur d'écran

La région vocale `polite` dit l'entrée (« Saisie du texte sur la toile : … Entrée va à la ligne, Échap termine, Alt+F10 mène à la barre
de texte. ») et la sortie (« Texte ajouté en Inter : « … ». Il reste modifiable : double-clic ou Entrée. », « Texte modifié : … »,
« Texte vide : rien n'est ajouté. »), jamais chaque lettre. Tab ne piège pas le focus : il termine la saisie et va plus loin. Le focus
visible de la saisie est son cadre et son curseur, dessinés à la couleur d'outil. axe-core : de nouveaux écrans (saisie et barre, en
clair et sombre ; barre resserrée et son menu à 390 px), aucune règle désactivée.

## Conséquences

- **Octets** : aucune référence existante ne bouge (`composerEtMesurer` rend en plus ses groupes, ses lettres sont identiques ; le
  décalage d'une ligne est seulement factorisé) ; un cas neuf, `texte-vivant-median`.
- **Tests modifiés, parce que le comportement a changé et c'est voulu** : la saisie s'appelle « Texte sur la toile » et se termine
  par Échap (`texte-vivant.e2e.ts`) ; Échap garde le texte, Ctrl+Z le rend ; Entrée avec l'outil Texte ouvre la saisie sur la toile au
  lieu du champ du panneau (`clavier-suite.e2e.ts`, phrase de l'outil dans `annonces.test.ts`) ; la barre de texte a son propre
  « Toutes les polices » (`polices-en-ligne.e2e.ts`) ; le champ « Espace » du panneau se valide (`texte-ligatures.e2e.ts`) ; la ligne
  du stylo d'une police à contour est le tracé Médian (`apercu.test.ts`, `texte-vivant.e2e.ts`) ; le sélecteur de la saisie
  (`accessibilite-axe.e2e.ts`). Nouveaux : `texte-toile.e2e.ts`, `curseur-texte.test.ts`, `mediane-texte.test.ts`, `saisie.test.ts`.
- `contexteTexte.tsx` perd l'état de la saisie (il vit dans `contexteSaisie.tsx`) ; `ClavierSelection.ouvrirChampTexte` et ses deux
  phrases disparaissent.
- **Limites, honnêtement** : le curseur a la hauteur du cadratin (0,8 au-dessus de la ligne de base, 0,2 dessous), pas celle des
  lettres de la fonte (l'interface `Glyphes` ne dit pas l'ascendante) ; le champ invisible est droit même pour un texte tourné (la
  fenêtre des accents s'ouvre sur sa boîte) ; pas de retour à la ligne automatique (ADR-0022) ; le double-clic choisit un mot selon des
  classes simples (lettres et chiffres, blancs, ponctuation) ; un clic d'un texte neuf à l'autre termine le premier sans commencer le
  second (un second clic le fait) ; la ligne médiane d'une lettre très grasse ou décorative peut garder une petite branche à ses coins,
  et s'arrête à une demi-épaisseur des bouts (le stylo la couvre) ; elle se calcule à 200 pixels par cadratin (un demi-pixel d'écart au
  milieu exact) ; seuls Chromium et l'émulation tactile de Chromium ont été exercés (Firefox et WebKit non vérifiés, ni un vrai clavier
  virtuel, ni un lecteur d'écran réel).

## Alternatives écartées

- **`contenteditable` ou du HTML superposé avec la police** : il faudrait charger la police dans le navigateur (`@font-face`) et
  aligner deux moteurs de composition ; le moteur pur resterait la vérité, mais ce qu'on verrait en tapant serait l'autre.
- **Un champ visible sous le texte** (la saisie de l'ADR-0022) : loin des lettres, et une feuille de plus sur le dessin.
- **Garder la barre de la sélection et y ajouter le texte** : 1 155 px déjà ; la barre de texte prend sa place et range les gestes
  dans un menu.
- **Une ligne médiane exacte (axe médian des contours de Bézier)** : plus juste, mais un second calcul à écrire et à figer ; la chaîne
  de l'ADR-0021, déjà testée et déterministe, suffit à la précision d'un stylo.
- **Médian grisé pour les polices à contour** (repli prévu si le calcul était trop long) : inutile, il tient en quelques
  millisecondes par lettre, mémorisé.
