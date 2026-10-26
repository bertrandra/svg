# ADR-0035 — Les outils de sélection : le cadre qui touche, le cadre qui contient, le lasso

**Date :** 25 octobre 2026
**Statut :** acceptée (s’appuie sur les ADR-0006, 0008, 0010, 0011, 0028 et 0029) ; **aucun octet écrit ne change** : choisir
n’est qu’une lecture du dessin, la zone et son aperçu ne vivent que sur la toile

## Contexte

Demande du propriétaire : « Il me faut des outils de sélection. Zone rectangulaire avec tous les objets touchés, même s’ils ne sont
pas sélectionnés entièrement. »

Il existait un cadre : un glisser sur le vide, avec l’outil de sélection, traçait un rectangle et prenait les formes dont la
**boîte** croisait ce rectangle. **Mesuré d’abord** (ADR-0008), par un test de navigateur joué sur le code d’avant (Chromium,
zoom d’ouverture ≈ 1,9 ; un anneau plein percé d’un trou, une diagonale, un rectangle plein, une courbe fine) :

| Cas | Avant |
|---|---|
| Cadre dans le trou de l’anneau, sans toucher la couronne | l’anneau est pris (sa boîte croise le cadre) |
| Cadre dans le coin vide de la boîte d’une diagonale | la diagonale est prise |
| Cadre au-dessus d’une courbe qui le frôle, dans sa boîte | la courbe est prise |
| Cadre commencé à 4 px du bord d’un rectangle | pas de cadre : le rectangle est saisi et **déplacé** (tolérance de prise de l’ADR-0029) |
| Cadre commencé sur un grand fond qui couvre le plan | impossible : le fond se déplace, aucun glisser ne trace de cadre |
| Au doigt, glisser sur le vide | un cadre se trace (le geste existait) ; sur un dessin à fond, comme à la souris, aucun |
| Un outil qui nomme le cadre ; un lasso ; « dedans » plutôt que « touché » ; un cadre au clavier | aucun (l’aide disait « Il n’y a pas de cadre de sélection au clavier ») |

## Décision

### 1. Un calcul pur et exact : `engine/selection.ts`

`formesDansZone(formes, zone, { regle, contours })` rend les formes qu’une zone prend, dans l’ordre du dessin. Une zone est un
**cadre** (rectangle aligné aux axes) ou un **lasso** (polygone fermé, trois points au moins, règle `nonzero` : une boucle qui se
recoupe reste pleine). Deux règles :

- **« touchée »** (défaut, la demande) : la forme est prise dès que ce qu’elle **peint** touche la zone, même en partie. Ce qu’elle
  peint est son tracé réel : sa surface remplie (règle `nonzero` ou `evenodd` respectée) et l’encre de son trait (demi-épaisseur).
  La forme touche si un sommet de son tracé aplati est dans la zone, si une arête de son tracé croise un bord de la zone (d’un côté
  d’une arête de surface, l’un des deux est rempli), si la zone est dans sa surface (rien ne se croisant, un seul point de la zone
  suffit à le dire), ou si son trait passe à moins d’une demi-épaisseur de la zone (distance exacte entre deux polygones qui ne se
  croisent pas : elle est atteinte en un sommet de l’un). Exact à l’aplatissement près (un dix-millième de la boîte de la forme,
  celui de la prise du clic).
- **« entièrement dedans »** : tout ce que la forme peint est dans la zone. Pour un cadre, sa boîte avec trait (`boiteAvecTrait`,
  pointes et bouts carrés compris) dans le rectangle ; pour un lasso, chaque sommet dedans, aucune arête qui croise un bord, aucun
  sommet du lasso dans sa surface (un lasso qui se recoupe peut laisser un îlot vide), et le trait à une demi-épaisseur au moins
  du bord.

Comme pour le clic (ADR-0029) : une forme **masquée ou verrouillée n’est jamais prise** ; en vue « Contours », chaque forme se prend
aussi par sa surface et son trait n’a plus d’épaisseur ; un texte vivant libre se prend par sa boîte (entre ses lettres aussi), un
texte posé sur ou dans une forme par ses lettres.

Ce qui ne dépend que d’une forme immuable (boîte avec trait, tracé aplati) était déjà mémorisé par forme dans `engine/prise.ts`
(ADR-0008) : `selection.ts` le relit (`etendue`, `aplatir`, `dansSurface`, `rangee`, désormais exportés). Les boîtes rangées
écartent d’abord tout ce qui est loin ; une forme contenue dans un cadre est prise sans calcul fin ; pour un lasso, une boîte
qu’aucun bord du lasso ne touche est tout entière dedans ou dehors (un point le dit), et les arêtes du lasso sont rangées par
bandes horizontales.

### 2. La règle se choisit, elle ne se devine pas au sens du glisser

Les logiciels de CAO font dépendre la règle du sens du glisser (de droite à gauche : « capture », de gauche à droite :
« fenêtre »). Ici, la moitié des glissers — les plus naturels, de gauche à droite — auraient alors pris « dedans », contre la
demande. La règle est donc un **réglage de session** (`EtatInterface.regleZone`, jamais écrit, « touchée » à chaque ouverture),
choisi au menu de l’outil de sélection (« Les formes touchées, même en partie » / « Les formes entièrement dedans »), qui vaut pour
le cadre, le lasso et le glisser de l’outil Sélection. Elle se **voit** sur la zone, à la manière de la CAO : **tirets** pour
« touchée » (le cadre d’avant), **trait plein** pour « dedans » ; elle se dit en la changeant et dans la barre d’état de l’outil.

### 3. Trois outils derrière un bouton, deux raccourcis neufs

- **Sélection (V)** : inchangé, sauf que son glisser commencé sur le vide trace un cadre qui suit la règle ; commencé sur une forme
  (ou dans sa tolérance), il la déplace, comme avant.
- **Cadre de sélection (B)** : le glisser commence **partout, même sur une forme** — rien ne se déplace — pour prendre des formes
  posées sur un grand fond ou sous lui. **Au doigt, c’est le seul moyen** de choisir plusieurs formes d’un geste sur un dessin
  plein. (« F » comme la « fenêtre » de sélection ; M, la lettre des logiciels de dessin, est aux aimants.)
- **Lasso (Q)** : un tracé à main levée (un point tous les 3 px d’écran), fermé au relâchement. (Q est le lasso d’Illustrator ; L
  est à la ligne.)

Un seul bouton de la barre reprend le dernier des trois (comme celui des formes, ADR-0006) ; son chevron, « Choisir un outil de
sélection », les liste avec leur raccourci (`menuitemradio`), puis la règle. Le nom du bouton ne contient pas la règle : un nom qui
changerait avec elle serait relu. L’outil Cadre ou Lasso reste pris après un geste (on enchaîne les zones) ; Échap ou V rend la
sélection. Sur un **téléphone**, « Points et poignées » rejoint ce menu : la ligne des outils garde des cibles de 40 px et tient
encore dans 320 px (le chevron neuf l’aurait fait déborder de 17 px, mesuré).

### 4. Maj ajoute, Alt retire

Au début du geste : **Maj ajoute** les formes prises à la sélection, **Alt les retire** (Alt l’emporte sur Maj) ; sans touche, la
sélection est remplacée. Un appui sans étendue (moins de 3 px) vide la sélection, sauf avec Maj ou Alt. Collision vérifiée avec
Alt+clic « forme du dessous » (ADR-0029) : il ne vaut que sur une forme avec l’outil Sélection ; Alt+glisser sur le vide, ou avec
le Cadre et le Lasso, retire. Ctrl n’est pas employé (Cmd sur macOS ouvrirait d’autres conflits).

### 5. Ce qu’on verra est ce qu’on prendra

Pendant le geste, chaque forme que le relâchement prendra (ou retirera) porte le **liseré de survol** de l’ADR-0029 (mêmes
classes, mêmes jetons `--cyan` sur `--panneau`, même contraste forcé), en un seul chemin quel que soit leur nombre. Au relâchement,
la région vocale dit « 3 formes choisies. », « 1 forme ajoutée : 2 formes choisies. », « 1 forme retirée : 1 forme choisie. » ou
« Aucune forme dans le cadre. ».

La zone et l’aperçu se dessinent dans **deux calques posés sur la toile** (deux `svg` à part, `will-change: transform`, sans
pointeur, `aria-hidden`), et le geste vit hors de l’état de React (un petit magasin auquel seul ce dessin s’abonne) : la toile et
ses calques ne se redessinent pas à chaque mouvement. Au-delà de 300 formes, l’aperçu ne se redessine qu’une fois toutes les
120 ms (et à l’arrêt du pointeur) ; la zone suit chaque mouvement.

### 6. Le menu Édition range ce qui choisit

À la suite de « Dupliquer » : **Tout sélectionner** (Ctrl+A, existait), **Désélectionner** (Échap, l’ancien « Ne rien
sélectionner »), **Inverser la sélection** (I ; existait aux calques), **Sélectionner la même couleur de fond** (C, l’ancien « même
couleur », qui part du contour d’une forme sans fond), **Sélectionner la même couleur de contour** (Alt+C), **Sélectionner le même
type** (Y : texte vivant, trait sans fond, forme pleine) ; en contexte Cricut qui coupe ou écrit (ADR-0028) : **Sélectionner tout
ce qui est à couper** (Alt+Maj+X) et **à écrire** (Alt+Maj+E), selon l’opération de chaque forme (`operationDe`). Plusieurs
formes choisies : l’union de leurs fonds, contours ou types. Les lettres seules gardent leur alias en majuscule (Verr. maj., test
existant de « C ») ; avec Alt, la position de la touche compte aussi (`code`) : Option+C écrit « ç » sur macOS, et C, E, I, X et Y
sont à la même place en AZERTY et en QWERTY.

### 7. Le cadre et le lasso au clavier (ADR-0011)

Avec l’outil Cadre et la toile au focus, le réticule des outils de tracé sert de pointeur : **Espace ou Entrée** pose le premier
coin, les **flèches** déplacent l’autre (Maj : dix fois plus loin) sous l’aperçu, la région vocale dit le coin, la taille et
« 3 formes à prendre » ; **Entrée** prend, **Maj+Entrée** ajoute, **Échap** annule le coin. Avec le Lasso : **Espace** pose un
point, **Retour arrière** retire le dernier, **Entrée** ferme et prend (trois points au moins ; le réticule compte s’il a bougé),
Maj+Entrée ajoute. Les points vivent dans la trace de l’interface, comme le premier coin d’une forme.

### 8. Où c’est câblé

Modules neufs : `engine/selection.ts` (le calcul), `zones/GesteZone.ts` (le geste, appelé par `Gestes.ts` en quelques lignes),
`zones/ZoneToile.tsx` (les calques), `zones/ClavierZone.ts` (le clavier, appelé par `ClavierToile.ts`), `zones/OutilsSelection.tsx`
(le bouton et son menu, ajouté à `BarreOutils.tsx`), `zones/commandesSelection.ts` (les commandes du menu, leurs raccourcis, les
phrases). L’état : `Outil` gagne `cadre` et `lasso`, `EtatInterface` `regleZone`, les actions `poserRegleZone`.

## Conséquences

- Tous les cas du tableau passent (`tests/e2e/selection.e2e.ts`, Chromium, Firefox et WebKit) ; le calcul a ses tests unitaires
  (`tests/unit/engine/selection.test.ts` : anneau dont seul le trou est couvert, diagonale, courbe qui frôle, trait épais, forme
  contenue, cadre dans une surface, contour seul, vue contours, texte par sa boîte, dedans contre touchée, lasso, boucle qui se
  recoupe, verrouillée et masquée ignorées, menus).
- **Performance** (5 000 formes ; Node) : 0,6 ms par cadre moyen (200 formes prises), 1,2 ms pour un cadre presque entier
  (4 967), 3 ms pour un lasso de 200 points sur la moitié du dessin (1 349) ; au premier essai, sans le classement des boîtes ni
  les bandes, ce lasso coûtait 270 ms. Dans Chromium (`selection.e2e.ts`), un cadre tiré à travers tout le dessin : calcul 0,9 ms
  par mouvement (médiane), une image 41 ms en moyenne ; un lasso : 0,6 ms et 22 ms.
- **Le même glisser que le cadre d’avant** (depuis le coin de la toile, outil Sélection, 5 000 formes ; médiane de quatre essais,
  deux tours entrelacés, machine partagée qui bruite) : un cadre qui couvre quelques centaines de formes coûte une image de
  39 à 43 ms, **exactement comme avant** (39 à 43 ms) ; un cadre qui finit par couvrir les 5 000 formes, dont l’aperçu les
  montre toutes, 119 à 132 ms contre 71 à 74 ms avant (1,7 fois : 5 000 contours de plus à peindre). **Essayé et retiré** :
  l’aperçu et la zone dessinés dans la toile, 2,5 fois le coût d’avant (247 à 269 ms contre 94 à 112 ms dans ce tour-là : chaque
  mouvement repeignait formes et aperçu) ; espacer l’aperçu sans calques à part n’y gagnait rien (284 à 302 ms : le coût était la
  peinture, pas la mise à jour). Les calques à part ont fait l’essentiel du gain ; espacer l’aperçu au-delà de 300 formes y
  ajoute 15 à 20 % (139 à 160 ms sans).
- `axe-core` : menu des outils, cadre en cours et lasso en cours, en clair et en sombre, à 1 280 px et au doigt à 390 px :
  0 violation grave.
- Limites, honnêtement : comme la prise, les pointes de jonction (`miter`) et les bouts carrés comptent par la demi-épaisseur seule
  dans la règle « touchée », et un pointillé compte comme un trait plein ; la boîte d’un texte est celle de ses contours. **Un cadre
  posé sur un grand fond le touche** (il est dans sa surface) : pour ne prendre que les formes posées dessus, Alt+cadre retire le
  fond, la règle « dedans » ne le prend pas, ou on le verrouille. Alt+glisser n’a pas été essayé sous un gestionnaire de fenêtres
  qui réserve Alt+glisser (certains bureaux Linux), ni Alt+C et Alt+Maj+X/E sous Windows avec une barre de menus de navigateur
  visible, ni sur une disposition où C, E, X ou Y changent de place (Dvorak) : la vérification manuelle (`docs/verification-manuelle.md`)
  les liste. Seul Chromium a été mesuré.

**Amendement (fusion, 25 octobre 2026)** : le raccourci du cadre est **B**. F ouvre la palette des formes de base (ADR-0033) et M
les aimants, déjà pris quand les deux chantiers se sont rejoints.
