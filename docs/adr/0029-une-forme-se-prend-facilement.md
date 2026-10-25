# ADR-0029 — Une forme se prend facilement : une tolérance à l’écran, le curseur « déplacer » et un liseré de survol

**Date :** 25 octobre 2026
**Statut :** acceptée (s’appuie sur les ADR-0001, 0006, 0007, 0008, 0011 et 0022) ; **aucun octet écrit ne change** : la prise
n’est qu’une lecture du dessin, le liseré et le curseur ne vivent que sur la toile

## Contexte

Demande du propriétaire : « La sélection d’un objet sur le canevas n’est pas facile. Ajouter également une icône quand je peux
sélectionner un objet pour le déplacer. »

La toile prenait la forme que le navigateur trouvait sous le pointeur (`event.target`, `pointer-events` du chemin) : il fallait
viser l’encre au pixel près. **Mesuré d’abord** (ADR-0008), par un test de navigateur (`tests/e2e/prise.e2e.ts`) joué sur le code
d’avant, avec l’outil de sélection, au zoom d’ouverture (≈ 2) :

| Cas | Avant |
|---|---|
| Trait de 1 unité, clic à 4 px au-dessus ou au-dessous | rien n’est pris |
| Contour sans remplissage, clic à 3 px de son trait (dedans ou dehors) | rien n’est pris |
| Forme remplie, clic à 5 px de son bord | rien n’est pris |
| Forme de 2 unités (4 px à l’écran), clic à 5 px de son centre | rien n’est pris |
| Les mêmes au zoom 0,6 (trait à 4 px, bord à 4 px) | rien n’est pris |
| Trait fin posé sur un fond rempli, clic à 3 px du trait | le fond est pris |
| Petite forme posée sur un fond, clic à 4 px | le fond est pris |
| Deux formes l’une sur l’autre | celle du dessous ne se prend jamais à la toile (seulement par les calques) |
| Texte vivant, clic dans le blanc entre deux lettres | rien n’est pris |
| Au doigt, trait fin touché à 9 px | rien n’est pris |
| Curseur au survol d’une forme | aucun changement (`auto` partout) ; aucun signe de ce qu’un clic prendra |

## Décision

### 1. Un calcul pur, le même pour le clic et pour le survol

`engine/prise.ts` (`candidates`, `formeSousPoint`, `formeDessous`, `zoneDePrise`) dit quelles formes un point du plan peut
prendre, la meilleure d’abord. Il ne connaît ni le DOM ni l’événement : la toile lui donne le point, le zoom et deux longueurs en
**pixels d’écran**, donc les mêmes à tout zoom.

- **Tolérance** : 6 px à la souris et au stylet, 12 px au doigt (`pointerType === 'touch'`, lu à chaque événement : un appareil
  hybride passe de l’un à l’autre).
- Une forme **remplie** (ou toute forme en vue « Contours », comme le `pointer-events: all` d’avant) se prend sur sa **surface**,
  règle `nonzero` ou `evenodd` respectée, et à moins de la tolérance de son bord.
- Un **trait** se prend sur son encre (demi-épaisseur ; en vue « Contours », un filet d’un pixel) et à moins de la tolérance au-delà.
  Une forme **sans remplissage** ne se prend pas en son milieu, qui est vide.
- Un **texte vivant** se prend sur la **boîte de ses contours** entière, entre ses lettres et ses mots aussi.
- Une **petite forme** (plus petite que la cible dans les deux sens) se prend dans sa boîte gonflée jusqu’à une **cible minimale**
  de 12 px (24 au doigt), qui compte comme sa surface : posée sur un fond, elle passe devant lui.
- Une forme **masquée ou verrouillée** ne se prend jamais : le clic passe dessous, comme avant.
- **L’ordre** : la plus haute dont la surface contient le point gagne ; mais un **filet** (un trait sans remplissage) posé au-dessus
  d’elle et à portée passe devant (un trait sur un fond se prend sans viser au pixel) ; sans surface sous le point, la **plus
  proche** gagne, à égalité la plus haute. Une forme remplie posée au-dessus ne passe devant que par sa surface : cliquer dans une
  forme à 2 px de sa voisine prend celle où l’on clique.

Ce qui ne dépend que d’une forme immuable se mémorise par forme (`WeakMap`, ADR-0008) : sa boîte avec trait (`boiteAvecTrait`) et
son tracé aplati (courbes découpées à un dix-millième de leur boîte, 64 segments au plus par courbe). Les boîtes d’un dessin se
rangent une fois par tableau de formes dans un `Float64Array` (quatre nombres par forme) : le survol ne parcourt que des nombres,
et ne fait le calcul fin que pour les formes dont la boîte est à portée.

### 2. Alt+clic passe à la forme du dessous

Alt+clic prend la candidate qui suit la première déjà choisie, en boucle (sans candidate choisie, la deuxième) ; la région vocale
le dit (« Forme du dessous, 2 sur 3 : rectangle 4. »). La forme ainsi prise reste celle qu’un appui **au même endroit** (à la
tolérance près) reprend tant qu’elle est choisie : sans cela, la tirer reprendrait celle du dessus. Alt+Maj+clic l’ajoute ou la
retire de la sélection. La ligne « Alt+clic » est dans la liste des raccourcis.

**Le clic répété au même endroit ne fait pas tourner** : le premier clic d’un double-clic aurait déjà changé de forme (le
double-clic ouvre les points ou retape un texte), et appuyer de nouveau sur la forme choisie pour la tirer — le geste le plus
fréquent — l’aurait fait passer à celle du dessous.

### 3. Le curseur dit ce qu’on peut faire

Avec l’outil de sélection, sur une forme qu’un clic prendrait, le curseur devient **`move`** (« déplacer »), et le reste pendant
qu’on la tire ; ailleurs, le curseur par défaut ; sur une forme verrouillée, le curseur par défaut (pas `not-allowed` : un fond
verrouillé couvrant le plan l’aurait montré partout, alors qu’on peut y tirer un cadre de sélection). La règle : **`move` est ce
qui se déplace** (formes, points, poignées : déjà le curseur des points et des poignées) ; **`grab` reste à la vue** (outil main) ;
les coins et la poignée de rotation gardent les leurs ; les autres outils gardent leur croix.

Le curseur n’est jamais posé sur la toile au survol : `cursor` s’hérite, et le changer sur la toile recalculait le style de chaque
forme — **34 ms à chaque passage d’une forme au vide sur 5 000 formes** (mesuré). Il est porté par le chemin sous le pointeur
(CSS statique de l’outil de sélection), par un **fond de prise** posé sous les formes (`FondPrise`, sans enfant, qui reçoit le
pointeur hors des formes et porte `data-prise` près d’une forme), et par la toile le temps d’un glisser seulement (elle capture le
pointeur ; un recalcul au début, un à la fin).

### 4. Un liseré de survol

La forme qu’un clic prendrait reçoit un **liseré à deux tons** : un filet cyan d’un pixel (jeton `--cyan`) sur un halo de trois
pixels couleur de panneau (`--panneau`), qui se lit sur tout dessin ; la paire tient 3:1 dans les deux thèmes (5,14 et 7,04,
`PAIRES_GRAPHIQUES`, ajoutée au registre). Il suit le chemin de la forme, ou la boîte d’un texte, ou la cible minimale d’une
petite forme : **ce qu’on voit est ce qu’on prend**. Sur une forme déjà choisie, qui a son tracé de sélection, il ne s’ajoute pas
à la souris. En contraste forcé : `Highlight` sur `Canvas`. Ni transition ni animation : rien à couper pour
`prefers-reduced-motion`. Il ne prend aucun pointeur.

**Au doigt**, pas de survol : le liseré vient **au toucher**, sur la forme que le doigt tient (même choisie), et s’en va quand le
doigt se lève ou qu’un second doigt pince ; le pincement et le défilement ne changent pas.

### 5. Où c’est câblé

`zones/PriseToile.tsx` : `usePrise` (le clic et le double-clic de `Gestes.ts`, qui ne lisent plus `data-id` sur la cible du DOM),
`FondPrise` et `SurvolToile` (écouteurs natifs posés une fois sur la toile ; seul ce composant se redessine quand la forme survolée
change). `ToileEditeur.tsx` gagne trois lignes (un import, `<FondPrise />`, `<SurvolToile … />`) ; le CSS est un bloc à part en fin
d’`editeur.css`.

## Conséquences

- Tous les cas du tableau passent (`tests/e2e/prise.e2e.ts`), au zoom d’ouverture, au zoom 0,6 et au doigt ; le calcul a ses tests
  unitaires (`tests/unit/engine/prise.test.ts` : trait fin, tolérance indépendante du zoom, surface et règle de remplissage, texte
  par sa boîte, plus haute puis plus proche, filet au-dessus, cycle, petite forme, verrouillée et masquée ignorées).
- **Performance** (5 000 formes : carrés pleins, courbes fines, cercles sans remplissage) : le calcul d’un survol coûte **0,3 à
  0,4 ms** dans Chromium (médiane ; 53 à 85 µs dans Node), contre 0,1 ms pour un mouvement sans survol. Une image où le liseré
  change coûte **33 à 39 ms**, autant qu’une image où ne change qu’un filet de la barre d’état (37 à 39 ms) : sur 5 000 formes,
  c’est la page entière qui se repeint, quoi qui change (mesuré par une trace : temps de cycle de vie et test de pointeur du
  navigateur, pas de style ni de mise en page). Une toile à part, dans sa propre couche, pour le liseré a été essayée : aucun
  gain, retirée. Une page immobile tient 16,7 ms.
- `axe-core` : liseré de survol en clair et en sombre, 0 violation, 0 doute.
- Limites : la boîte d’un texte est celle de ses contours (l’encre), pas celle de la composition (approche et interligne) ; une
  ligne de texte très haute avec des lettres courtes se prend donc un peu moins haut qu’on ne l’attend. Les pointes de jonction
  (`miter`) et les bouts carrés d’un trait épais se prennent par la demi-épaisseur seulement, plus la tolérance. Alt+clic n’a pas
  été essayé sous un gestionnaire de fenêtres qui réserve Alt+clic (certains bureaux Linux le prennent pour déplacer une fenêtre) :
  Tab, Page suivante et les calques restent. Seul Chromium a été mesuré.
