# ADR-0012, annexe 6 — Interface et accessibilité (conception seulement)

Cadre : l'ADR-0006 (une action primaire par panneau, le rare dans les menus, 40 px au doigt), l'ADR-0007
(les couleurs sont des jetons), l'ADR-0008 (listes fenêtrées, seuil 150), l'ADR-0010 (trois contextes,
verbes stables), l'ADR-0011 (clavier, région vocale unique, Tab ne piège jamais, `axe-core` sans règle
désactivée). Rien ici n'est écrit ; chaque point est la **cible d'acceptation** de l'étape qui le livre.

## 1. Le panneau des calques devient un arbre

Aujourd'hui (`zones/Calques.tsx`) : une `<ol>` de `<li>` à trois boutons (nom, masquer, verrouiller), du
premier plan au fond, fenêtrée au-delà de 150 formes (`aria-posinset`, `aria-setsize`, `overflowAnchor:
'none'`, cales de hauteur).

Cible : un **`role="treegrid"`**, parce que les lignes portent des boutons (visibilité, verrou) qu'un
`role="tree"` ne permet pas d'atteindre proprement.

- Ligne : `role="row"`, `aria-level`, `aria-setsize`, `aria-posinset` (rang parmi les frères),
  `aria-expanded` (groupes seulement), `aria-selected`, et — fenêtre oblige — `aria-rowindex` /
  `aria-rowcount` sur la grille (nombre de lignes **visibles**, repliages déduits).
- Cellules : nom (`gridcell`, bouton), visibilité, verrou ; les groupes ajoutent un bouton de chevron
  (« Déplier le groupe Nuage ») et des pastilles à nom accessible (« découpé », « masque d'opacité », « ombre
  portée », « opacité 50 % »). Un seul arrêt de tabulation dans la grille (tabindex itinérant) ; **Tab en sort**
  (WCAG 2.1.2).
- **Fenêtrage** : on fenêtre les **lignes visibles** (nœuds dont tous les ancêtres sont dépliés), au même seuil
  de 150, hauteur de ligne constante, mêmes cales `data-cale`. L'état déplié vit dans le contexte
  `Interface` (un `ReadonlySet<string>` par éditeur, ADR-0010), pas dans le dessin. La ligne qui a le focus
  reste épinglée hors fenêtre tant que le geste dure (`segmentsFenetre`, ADR-0008).
- Dessin plat : la grille n'a que des lignes de niveau 1, sans chevron ; son DOM est celui d'aujourd'hui aux
  rôles près, et le test e2e du fenêtrage à 5 000 formes est le garde.
- Nom d'une ligne : feuille « Forme 12 » (inchangé) ; groupe `nom` ou « Groupe 3 » ; texte « Texte « Joyeux » ».

**Clavier de la grille** (modèle de l'APG, surcharges dites) : Haut/Bas : ligne voisine ; Droite : déplier un
groupe replié, sinon aller au premier enfant ; Gauche : replier, sinon aller au parent ; Début/Fin ; Page
précédente/suivante : une page de lignes ; Entrée : **entrer** dans le groupe (ou choisir une feuille) ; Espace :
ajouter/retirer à la sélection ; Maj+Haut/Bas : étendre ; `*` : déplier les frères ; F2 : renommer ; Suppr :
supprimer ; touche Menu / Maj+F10 : menu contextuel.

**Alternatives au glisser** (jamais le glisser seul) : Ctrl+Maj+Haut/Bas : monter/descendre parmi les frères ;
Ctrl+Maj+Gauche : sortir du groupe (devenir frère de son parent) ; Ctrl+Maj+Droite : entrer dans le frère
précédent s'il est un groupe ; et le menu « Déplacer vers… » ouvre une liste étiquetée des groupes (avec
« Racine »), au clavier comme au doigt. *Alt+Maj+flèche est écarté : Windows l'emploie pour changer de
disposition de clavier.* Ces raccourcis valent dans la grille ; sur la toile, Alt+flèches redimensionnent et
Ctrl+flèches tournent comme avant (ADR-0011) : le focus décide, aucun conflit.

## 2. Entrer dans un groupe, en sortir

Un **contexte d'édition** dans le contexte `Interface` : `{ groupe: string; dans?: 'decoupe' | 'masque' | 'motif' } | null`.

- Entrer : double-clic ou Entrée sur un groupe choisi ; ligne de la grille ; menu « Entrer dans le groupe ».
  Sortir : Maj+Entrée (outil de sélection), fil d'Ariane de la barre d'état (« Racine › Nuage › Soleil », un
  `nav` aux boutons étiquetés), clic sur une forme hors du contexte, et **Échap** qui défait, dans l'ordre, le
  mode points, la sélection, puis le niveau de contexte ; « Échap puis Tab » (ADR-0011) sort toujours de la
  toile. Entrée sur une feuille garde son sens d'avant (ouvrir ses points).
- Dans un contexte, **Tab, Page suivante/précédente, Ctrl+A, le cadre de sélection et les aimants** ne voient
  que les **nœuds frères** du contexte (navigation.ts : `choisissables` renvoie les nœuds du niveau, ce qui,
  pour un dessin plat, est la liste d'aujourd'hui). Le reste du dessin est estompé (jeton) et ne se choisit
  pas.
- Un clic atteint une feuille ; `Gestes.ts` remonte à l'ancêtre-enfant du contexte, comme tout logiciel de
  dessin.
- Annonces : « Dans le groupe Nuage, 3 éléments. » ; « Retour à la racine. » (région `polite` unique).

## 3. Découpes et masques

Menu Objet (jamais un bouton de plus dans la barre, ADR-0006) : « Créer un masque de découpe » (la forme la
plus haute de la sélection découpe les autres : sémantique d'Illustrator), « Libérer le masque de découpe »,
« Créer un masque d'opacité » (la plus haute, en luminance), « Libérer », « Inverser », « Modifier le
masque » (contexte `masque`, le contenu du groupe estompé, les formes du masque tracées en contours à jeton).
Une commande indisponible reste **visible et grisée avec sa raison** (« Choisissez au moins deux formes »),
liée par `aria-describedby`. Phrases : « Masque de découpe créé : 4 formes sous la forme du haut. »

## 4. Dégradés

Section « Remplissage » (et « Contour ») de l'inspecteur : un groupe de boutons radio **Uni / Dégradé
linéaire / Dégradé radial / Motif**. Un dégradé montre :

- la liste des **arrêts** (`role="listbox"` d'options étiquetées « Arrêt 2 sur 3 »), chacune avec sa couleur
  (le sélecteur existant), sa position en % (un champ numérique et un curseur), son opacité, « Retirer » ;
  « Ajouter un arrêt » (à mi-chemin, couleur interpolée en OKLab), « Inverser », « Étalement » (prolonger,
  refléter, répéter) ;
- l'**angle** (linéaire, par 15° au curseur, 1° au champ), ou le **centre** et le **rayon** (radial) en champs
  numériques. **Cette liste suffit à tout faire** : les poignées de la toile ne sont qu'un raccourci.

Sur la toile, la forme choisie montre la droite du dégradé, ses arrêts (cercles) et ses extrémités ; les
éléments sont atteignables à la souris, au doigt (zone de 40 px) et au clavier : une poignée est un
`role="slider"` (`aria-valuenow` en %, `aria-valuetext` « Arrêt 2 sur 3, rouge #c81e28, à 40 % ») ; flèches :
±1 %, Maj : ±10 % ; Suppr retire l'arrêt ; une extrémité se déplace aux flèches du pas du plan (Maj ×10) comme
le réticule (ADR-0011). Tout changement parle (« Arrêt 2 : 55 % »). L'historique fond un geste continu par
sa clé (`avancer(h, etat, cle)`).

Le motif : l'étape 9 livre « Créer un motif depuis la sélection » (les formes choisies deviennent la tuile,
dimensions numériques, édition de la tuile dans le contexte `motif`) ; pas d'éditeur de motifs préfabriqués.

## 5. Texte vivant

`Texte.tsx` devient le panneau d'un texte vivant quand un texte est choisi ; sans texte choisi, il garde son
rôle d'aujourd'hui (poser un texte). Champs : texte (`<textarea>` étiqueté), police (liste des neuf fontes
livrées, la fonte déposée, « Déposer une police… »), taille, interlettrage, interligne, alignement (boutons
radio), largeur de boîte avec case « Retour automatique », ligatures (case, seulement pour les fontes qui en
ont : `Glyphes.ligature` définie). Les réglages s'appliquent **à la saisie** (fondus par clé : une rafale de
frappes = une entrée d'historique) ; « Convertir en contours » est une action rare et destructrice, donc
**secondaire** (ADR-0006) ; le panneau d'un texte vivant n'a pas d'action primaire, puisque tout s'applique à
la saisie. La saisie directe sur la toile est une amélioration ultérieure, non nécessaire à
l'accessibilité (le panneau est un formulaire).

## 6. Effets

Section « Effets » : cases « Flou » et « Ombre portée » ; champs numériques (écart ; décalage horizontal et
vertical ; couleur ; opacité) avec leur curseur ; une note « L'ombre ne tourne pas avec la forme ». Au-delà de
20 nœuds à effet, la barre d'état dit « Effets affichés au repos ».

## 7. Phrases (`description.ts`, `phrasesSelection.ts`, `annonces.ts`)

Règle d'ADR-0011 conservée : la couleur se nomme avant son code.

- « groupe « Nuage », 3 formes, 80 × 40 à 10, 20 » ; « groupe « Nuage », découpé, ombre portée, opacité 50 % ».
- « cercle, fond dégradé linéaire du rouge #c81e28 au bleu #1f5fb0, 80 × 80 à 40, 40 ».
- « texte « Joyeux Noël », Oswald 48, 2 lignes ».
- Actions : « Groupe créé : 3 formes. », « Groupe défait : 3 formes. », « Masque de découpe créé. », « Texte converti en
  contours : 11 formes. », « Police absente : Mafonte. »

## 8. Jetons, contraste forcé, mouvement

Nouveaux rôles dans `src/styles/jetons.ts` (la seule source, ADR-0007), chacun avec sa valeur claire et sombre
et sa description, confrontés par le test existant : `voile-contexte` (estompe hors du contexte),
`contour-groupe`, `contour-decoupe`, `contour-masque`, `poignee-degrade`, `pastille-groupe` (+ fond),
`arret-selectionne`. Les textes tiennent 4,5:1 ; les composants non textuels (poignées, contours), 3:1, sur le
fond de la toile **et** sur le damier de transparence, dans les deux thèmes. En `forced-colors`, chacun se
redit en mot-clé système (`Highlight`, `CanvasText`). `prefers-reduced-motion` : aucun mouvement ajouté.

## 9. Acceptation

- **axe** : 0 violation grave, 0 autre, 0 « à relire » (`INCERTAINS_ADMIS` reste vide) sur les 28 écrans
  actuels **et** les écrans nouveaux : arbre replié/déplié, contexte de groupe, contexte de masque, éditeur de
  dégradé (linéaire et radial), panneau de texte (fonte absente comprise), section Effets, chacun en clair,
  sombre et tactile.
- **Clavier** : un e2e par parcours (créer un groupe, y entrer, y dessiner, en sortir ; réordonner et
  « Déplacer vers… » ; créer et libérer un masque ; ajouter, déplacer, retirer un arrêt ; saisir et convertir un
  texte ; régler une ombre), **sans souris**, avec la phrase attendue dans la région vocale.
- **Perf** (annexe 7 §4) et **contraste forcé** (`contraste-force.e2e.ts` étendu).
- Limite assumée, comme à l'ADR-0011 : aucun lecteur d'écran réel n'est essayé en CI ; une revue manuelle
  NVDA/VoiceOver de l'arbre et du dégradé est une condition de la bascule (étape 14), consignée dans le
  CHANGELOG.

## 10. Raccourci en conflit : Ctrl+G

`zones/Clavier.ts` (ligne 44) donne **Ctrl+G à « Réunir »** (`combinerSelection`) et **Ctrl+Maj+G à
« Séparer »** (`separerSelection`) ; le README les cite. Tous les logiciels de dessin donnent Ctrl+G à
« Grouper ». Proposition (question 1) : en mode `riche`, Ctrl+G groupe, Ctrl+Maj+G dégroupe, « Réunir » et
« Séparer » restent au menu Objet avec un autre raccourci à choisir sur une liste des touches libres
(l'AZERTY exclut les chiffres sans Maj et AltGr = Ctrl+Alt) ; en mode `plat`, rien ne bouge.
