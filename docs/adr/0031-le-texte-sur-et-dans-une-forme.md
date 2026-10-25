# ADR-0031 — Le texte sur et dans une forme

**Date :** 25 octobre 2026
**Statut :** acceptée (prolonge les ADR-0022 et 0027, s’appuie sur les ADR-0006, 0008, 0011, 0021, 0028 et 0029) ; **aucune
référence d’écriture existante ne change** (`ecriture-stable` vert sans `ACTUALISER_REFERENCES`), deux références neuves,
`texte-sur-forme` et `texte-dans-forme`. (0030 est le site PHP, mené à part.)

## Contexte

Demande du propriétaire : « Je peux poser un texte sur une forme ou dans une forme : le texte épouse la forme. » Deux gestes,
comme dans un logiciel de dessin : le texte **sur le tracé** d’une forme (le cercle d’un badge, un arc, une vague, un tracé libre),
et le texte **dans** une forme fermée (il en remplit l’intérieur, ligne à ligne). Dans les deux cas, le texte reste vivant
(ADR-0022) et garde le lien vers sa forme ; le fichier ne porte que des contours ; le tracé « Plein | Médian » (ADR-0027) et
l’opération couper / écrire (ADR-0028) s’y appliquent.

## Décision

### 1. Une disposition dans le texte vivant, un lien par identifiant

`TexteVivant.disposition?: DispositionTexte` (`engine/edition/types.ts`), **absente** d’un texte libre :

| Champ | Valeurs | Défaut | Sens |
|---|---|---|---|
| `mode` | `'sur'` \| `'dans'` | — | sur le tracé, ou dans l’intérieur |
| `forme` | identifiant d’une forme (`'f3'`) | — | la forme qui porte le texte (ni un texte, ni le texte lui-même) |
| `depart` (sur) | nombre, `[0 ; 1[` sur une forme fermée, `[0 ; 1]` sur un tracé ouvert | `0` | où se pose le point d’alignement du texte, en part de la longueur du tracé |
| `cote` (sur) | `'dessus'` \| `'dessous'` | `'dessus'` | au-dessus du tracé (à l’extérieur d’une forme fermée), ou dessous (à l’intérieur) |
| `repartir` (sur) | booléen | `false` | les lettres réparties sur tout le tracé |
| `marge` (dans) | nombre ≥ 0, en part de la taille du texte | `0,25` | la marge intérieure, sur les bords et en haut |
| `ajuster` (dans) | booléen | `false` | la plus grande taille qui tient ; `taille` garde alors la taille calculée |
| `justifier` (dans) | booléen | `false` | les lignes pleines justifiées (l’alignement vaut alors `gauche`) |

Les autres champs du texte gardent leur sens, avec deux précisions : l’**alignement** (`gauche`, `centre`, `droite`) dit, sur un
tracé, si le texte part du point de départ, s’y centre ou y finit ; dans une forme, comment chaque ligne se cale dans son morceau.
La **matrice** ne porte plus que l’échelle du texte (la taille dans le plan est `taille` fois la racine du déterminant de sa partie
linéaire) et un point d’ancrage, le début du texte posé (recalculé à chaque composition, arrondi au millième) : redevenu libre,
le texte se recompose en ligne droite à cet endroit.

**Pour le format de projet JSON** (le site PHP) : ces champs se gardent tels quels dans l’objet `texte` d’une forme, la forme de
base reste une forme ordinaire du dessin (éventuellement `visible: false`), et le lien est son **identifiant** — un format qui
renumérote les formes doit renuméroter `disposition.forme` avec elles. Un texte dont la forme n’existe pas se lit comme un texte
libre ; la disposition ne demande rien d’autre.

### 2. Le calcul, pur et déterministe (`engine/texte/`)

- **`trace.ts`** : un chemin M/L/C/Q/Z en sous-chemins parcourus ; chaque courbe en **48 cordes**, chaque corde garde son intervalle
  de paramètre. La longueur se lit sur les cordes (un millième près sur une cubique quelconque, un dix-millième de rayon sur un
  cercle), le **point et la tangente sur la courbe elle-même** au paramètre interpolé. Rien que des `+ - * /` et des racines carrées
  (exactes en IEEE 754) : aucun sinus, cosinus ni `Math.hypot`, mêmes nombres d’un moteur JavaScript à l’autre. Aussi : la
  projection d’un point (la poignée), le sens d’un tracé fermé (aire signée), le point le plus haut ou le plus bas, les polygones.
- **`surTrace.ts`** : le texte se compose d’abord en ligne droite (`composerEtMesurer`, inchangé : avances, crénage, ligatures,
  interlettrage), puis **chaque lettre est posée au point du tracé qui correspond au milieu de son avance, tournée selon la tangente**
  (la matrice de rotation se lit sur la tangente unitaire), jamais déformée. Sur une forme fermée, le texte tourne dans le sens des
  aiguilles d’une montre à l’extérieur et dans l’autre à l’intérieur, et le départ 0 est le point le plus haut (extérieur) ou le
  plus bas (intérieur) : un texte centré s’y lit droit. Un tracé ouvert se lit de gauche à droite (dessiné de droite à gauche, il se
  parcourt à rebours) ; dessous, la ligne de base descend de 0,72 taille (le haut des lettres suit le tracé). Le **plus long
  sous-chemin** porte le texte (le pourtour d’un anneau, pas son trou). Les retours à la ligne se lisent comme des espaces. Une
  lettre dont le milieu tombe hors du tracé (un tracé ouvert trop court, plus d’un tour d’une forme fermée) **n’est pas dessinée et
  se compte** (`depasse`) ; « Répartir » ajoute un même écart entre les lettres (et entre la dernière et la première sur une forme
  fermée) ; un texte déjà trop long ne se répartit pas, il dépasse.
- **`dansForme.ts`** : les polygones de la forme (règle `nonzero` ou `evenodd` de la forme, sous-chemins fermés comme un
  remplissage). Pour chaque ligne, la **largeur disponible sur toute la hauteur de la ligne** (du haut du cadratin, 0,8 taille, au
  bas des jambages, 0,2, plus la marge) : l’intérieur commun à toute la bande se lit exactement aux deux bords de la bande et à la
  hauteur de chaque sommet qui y tombe (les bords d’un polygone sont droits entre ses sommets), puis se rétrécit de la marge. Une
  ligne peut avoir plusieurs morceaux (les lobes d’un cœur, les deux côtés d’un trou) : on les remplit de gauche à droite. Les
  mots se renvoient à la ligne, un retour tapé commence un paragraphe ; **le texte ne saute jamais un mot** : le premier mot qui ne
  tient nulle part arrête la pose, et les mots restants se comptent (`nonPlaces`). « Justifier » répartit l’espace des lignes pleines
  entre leurs mots. **« Ajuster la taille »** : la plus grande taille qui tient, par **dichotomie bornée** (24 pas entre zéro et la
  hauteur de la forme), arrondie au centième vers le bas et vérifiée.
- **`disposition.ts`** : la composition d’un texte posé (`composerDispose`, mémorisée par forme immuable et par fonte, ADR-0008),
  la composition dans le dessin (en ligne droite si la forme n’existe plus), et **`suivreDispositions`** (§ 3).
- **`pose.ts`** : ce que la composition rend pour la saisie : le curseur devant chaque caractère, **déjà posé dans le plan** (un
  trait du bas au haut du cadratin, tourné avec la lettre), et de quoi trouver l’index sous un point, la ligne voisine, les
  quadrilatères d’une sélection.

Le tracé Médian passe par la même enveloppe `Glyphes` que le texte libre (`glyphesDuTexte`) : les lettres posées sont les lignes
médianes, sans remplissage.

### 3. Le lien : la forme change, le texte suit, dans la même entrée d’historique

`appliquer` (`zones/creerActions.ts`) passe, après la garde du texte vivant (`garderTextes`, ADR-0022), par `suivreDispositions` :
un texte dont la forme a changé de tracé (ou de règle), qui est neuf (une copie), ou dont la matrice a bougé, se **recompose sur sa
forme** ; un texte dont la forme a disparu (ou ne peut plus le porter) **redevient libre**, recomposé en ligne droite, et l’éditeur
le dit (« La forme qui portait le texte « … » n’existe plus : il redevient un texte libre, en ligne droite. Ctrl+Z rend la forme. »).
Tout se fait dans l’entrée d’historique du geste : Ctrl+Z rend la forme et le texte d’un coup. Les glyphes viennent du contexte du
texte (`poserGlyphes`) ; les fontes se chargent dès qu’un texte posé est dans le dessin. Sans elles (un geste dans l’instant qui
suit l’ouverture), le texte garde ses contours et se recompose au geste suivant. Un texte qui ne dessinerait plus rien (sa forme
devenue trop petite) garde aussi ses contours.

Les opérations affines (`transformer`, donc déplacer, tourner, retourner, redimensionner, aligner…) **emmènent la forme d’un texte
posé** (`avecFormesPorteuses`) : tirer le texte tire sa forme, l’agrandir l’agrandit. Une forme verrouillée ne suit pas (le texte se
repose où elle est). `aligner` ne déplace pas pour lui-même un texte dont la forme est aussi choisie. `dupliquer`, `coller` et
`inserer` posent la copie d’un texte sur la copie de sa forme quand elle est copiée aussi ; copié seul, il redevient libre.

### 4. Le fichier : des contours, la disposition et le lien, seulement quand ils existent

Le `<path>` d’un texte posé s’écrit comme celui de tout texte vivant (ADR-0022 : contours exacts, `data-ed-*` encodés), et, après
`data-ed-matrice`, dans cet ordre, chacun absent à son défaut :

- `data-ed-disposition="sur"` ou `"dans"` ;
- sur : `data-ed-depart` (≠ 0), `data-ed-cote="dessous"`, `data-ed-repartir="1"` ;
- dans : `data-ed-marge` (≠ 0,25), `data-ed-ajuster="1"`, `data-ed-justifier="1"` ;
- puis le **lien**, ajouté par l’écriture du dessin (il dépend de la place de la forme, pas du texte seul, donc hors de la mémoire
  d’écriture d’une forme) : `data-ed-forme="N"`, le **rang** de la forme parmi les chemins écrits (à partir de 1) ; ou, pour une
  **forme masquée** (qui ne s’écrit pas, « masquer, à l’enregistrement, c’est retirer »), son tracé encodé en pourcentage
  `data-ed-forme-d="…"` et `data-ed-forme-regle="evenodd"` s’il le faut. `data-ed-operation` (ADR-0028) reste le dernier.

Jamais de `<text>` ni de `<textPath>`. La relecture prend chaque valeur à sa forme exacte et dans ses bornes ; une disposition ou
un lien illisible laisse le texte en contours et le dit (le message de l’ADR-0022) ; un lien qui ne mène à rien (un rang hors du
dessin, vers un texte ou vers lui-même) rend un texte libre, ses contours inchangés. Une forme masquée se recrée **masquée**, juste
avant son texte (sans sa peinture, qui ne s’écrit pas : un filet noir d’une unité si on la montre). Un texte posé relu est un
point fixe (`ecriture-stable`, relecture de sa propre écriture). Les invariants de l’écriture admettent ces dix attributs sur un
`<path>` à la profondeur 1, chacun à sa forme exacte ; un vecteur hostile de plus au corpus (`texte-pose-lien-piege.svg`).
Les exports (découpe, stylo, PDF, PNG…) écrivent le dessin sans texte vivant : des contours seuls, la forme de base seulement si
elle est visible.

### 5. L’interface

- **La barre de texte** (texte choisi, ou en saisie) : un groupe **« Disposition »** de trois boutons à état, des icônes nommées
  « Libre », « Sur la forme », « Dans la forme » (un état, jamais plein). « Sur la forme » ou « Dans la forme » demande la forme :
  la barre d’état dit « Cliquez la forme sur laquelle poser le texte. Échap annule ; au clavier, Tab parcourt les formes et Entrée
  choisit. » (« Touchez » au doigt), la toile prend la croix de visée, la forme visée le liseré de survol (ADR-0029). Un clic
  dans le vide ou Échap abandonne ; un clic sur un texte dit qu’il ne peut pas porter le texte. **Au clavier** : Tab et Maj+Tab
  parcourent les formes candidates (visibles, déverrouillées, pas des textes), la région vocale dit « Forme 2 sur 5 : cercle 3.
  Entrée pose le texte, Échap annule. », Entrée pose ; Tab après la dernière abandonne et laisse le focus continuer (le choix ne
  piège jamais le clavier, ADR-0011). Un texte déjà posé change de mode sur la même forme. Sur une forme, l’alignement se dit
  « Aligner au début / Centrer le texte sur le point de départ / Aligner à la fin » ; dans une forme, un quatrième bouton
  « Justifier les lignes dans la forme ». Au doigt ou sous 640 px, une rubrique « Disposition » de trois choix radio dans le menu
  de la barre resserrée.
- **Le menu de la sélection** : un texte et une forme choisis ensemble font paraître « Texte et forme » : « Poser le texte sur la
  forme », « Poser le texte dans la forme » (un menu dans la rangée, une rubrique dans le menu resserré).
- **Le panneau Texte** (« Plus d’options ») : un groupe « Disposition » : les trois boutons à libellés, la forme qui porte le texte
  (« Sur cercle 1 »), **« Montrer la forme de base »** (masquée, elle ne s’écrit pas ; le lien reste), « Changer de forme » ; sur :
  « Départ (%) », le côté (« Extérieur » / « Intérieur » sur une forme fermée, « Dessus » / « Dessous » sur un tracé ouvert),
  « Répartir les lettres sur tout le tracé » ; dans : « Marge » (dans les unités de la taille), « Ajuster la taille pour remplir la
  forme » (la taille, dans la barre et le panneau, devient inactive). Ce qui ne tient pas s’y lit en message d’alerte (« Le texte
  dépasse le tracé de 3 lettres. », « 2 mots ne tiennent pas dans la forme. ») et se dit dans la région vocale quand cela change.
  L’alignement y dit « Début / Centre / Fin » sur une forme, et gagne « Justifié » dans une forme.
- **Sur la toile** : un texte posé choisi seul montre le **tracé de sa forme en tirets** (même masquée) et, sur une forme, la
  **poignée de départ** : un rond d’outil sur le tracé, une cible de 24 px (40 au doigt), qu’on glisse le long du tracé (une entrée
  d’historique par geste) ; c’est un curseur de réglage (`role="slider"`, « Départ du texte sur la forme », de 0 à 100 %) : les
  flèches avancent d’un centième, Maj ou Page précédente / suivante d’un dixième, Début et Fin vont aux bouts ; « Départ à 12,5 %
  du tracé. » se dit. Un texte posé se prend par ses lettres (ADR-0029 : sa boîte couvrirait la forme qui le porte).
- **Poser ne se refuse pas pour une question de taille** : dans une forme où aucun mot ne tient à la taille du texte, la taille
  s’ajuste d’elle-même (« Aucun mot ne tenait à cette taille : la taille s’ajuste à la forme… »). Un réglage qui ne laisserait rien
  de dessiné (une taille trop grande) ne se fait pas, et c’est dit.
- **La saisie sur la toile** (ADR-0027) vaut pour un texte posé : double-clic ou Entrée, on tape là ; **le curseur, la sélection et
  les flèches suivent les lettres posées** (les curseurs de `pose.ts`, les mêmes calculs que les contours) ; sur un tracé, ↑ mène au
  début et ↓ à la fin ; dans une forme, à la ligne voisine. Le cadre de la saisie est la boîte des curseurs.

### 6. Clavier, lecteur d’écran, contraste

Tout se fait au clavier (la barre, le choix par Tab, le panneau, la poignée) ; la région vocale `polite` dit la pose, le
dépassement quand il change, le départ, la forme perdue, le choix annulé. axe-core sans violation grave, en clair et en sombre,
pendant le choix de la forme, et à 390 px au doigt ; aucune règle désactivée. En contraste forcé, le guide et la poignée en
`Highlight`. Rien ne s’anime.

## Conséquences

- **Octets** : aucune référence existante ne bouge ; deux neuves, `texte-sur-forme` (un cercle portant un texte à l’extérieur et un
  à l’intérieur, un arc portant un texte dessous et réparti) et `texte-dans-forme` (un cœur portant un texte justifié, une ellipse
  masquée portant un texte à taille ajustée).
- **Tests nouveaux** : `tests/unit/engine/texte-disposition.test.ts` (abscisse et tangente sur une ligne, un arc, une cubique ;
  lettres sur un cercle à l’extérieur et à l’intérieur ; dépassement ; répartition ; largeurs dans un cercle, un cœur, une forme à
  trou ; renvoi à la ligne ; justification ; taille ajustée ; déterminisme ; recomposition quand la forme change ; forme supprimée ;
  transformations et copies ; écriture, relecture, forme masquée, bornes, corpus hostile), `tests/unit/zones/disposition.test.ts`
  (changements, alignement sur un tracé ouvert, ce qui ne se pose pas, saisie, couper ou écrire, l’historique, les phrases),
  `tests/e2e/texte-forme.e2e.ts` (cercle et cœur depuis la barre, menu de la sélection, poignée à la souris et au clavier, forme
  déplacée puis supprimée, saisie, Médian, fichier, tout au clavier, axe en clair et en sombre, 390 px au doigt).
- **Fichiers d’interface touchés par ajout** : `BarreTexte.tsx` (le groupe Disposition, les alignements d’un texte posé, la taille
  inactive), `BarreSelection.tsx` (un menu, une rubrique), `InspecteurTexte.tsx` (le groupe Disposition, « Justifié »),
  `SaisieTexte.tsx` (la pose quand elle existe), `Gestes.ts` (une ligne : le clic du choix), `PriseToile.tsx` (`toutes`, le liseré
  retenu pendant le choix), `ToileEditeur.tsx` et `Cadre.tsx` (un montage chacun), `contexteSaisie.tsx` (l’état du choix),
  `creerActions.ts` (le suivi dans `appliquer`), `commun/Nombre.tsx` (`max`, `desactive`), quatre icônes ; le reste vit dans
  `ChoixDisposition.tsx`, `DispositionToile.tsx`, `InspecteurDisposition.tsx`, `actionsDisposition.ts`, `phrasesDisposition.ts`.
- **Limites, honnêtement** :
  - un texte sur un tracé n’a qu’une ligne (les retours tapés deviennent des espaces) ; il suit le plus long sous-chemin ;
  - la marge d’un texte dans une forme est un retrait horizontal et vertical de la bande, pas un décalage exact du contour ; les
    lignes partent du haut de la forme (pas de centrage vertical) ; « Justifier » n’étire que les espaces entre les mots ;
  - la tangente est continue le long d’une courbe, mais une lettre posée sur un angle vif (un coin de rectangle) prend la
    tangente du côté où tombe son milieu ; sur un tracé très courbé, des lettres voisines peuvent se toucher à l’intérieur ;
  - le curseur de saisie tombe au début de la glyphe sur le tracé, pas sur son coin tourné ; le champ invisible reste droit ;
  - une forme masquée ne garde pas sa peinture dans le fichier ; un texte copié seul redevient libre ;
  - si les fontes ne sont pas encore chargées, un texte posé dont la forme change garde ses contours jusqu’au geste suivant ;
  - redimensionner un texte posé agrandit aussi sa forme (elle le porte) ; pour ne changer que les lettres, la taille ;
  - Design Space n’a pas été essayé (le fichier n’y porte que des contours, comme tout texte vivant) ; seul Chromium a été exercé.

## Alternatives écartées

- **`<textPath>`** : le texte natif d’un SVG demande la police dans le fichier (ou chez qui l’ouvre) ; refusé par l’ADR-0012 et par
  le propriétaire. Le fichier porte les contours, comme tout texte vivant.
- **Déformer les lettres le long du tracé** (enveloppe) : ce n’est pas ce qu’on attend d’un badge, et la découpe d’une lettre
  déformée trahit la police ; les lettres sont posées et tournées, jamais déformées.
- **Une longueur d’arc analytique** (intégrale de Gauss-Legendre) : plus juste, mais des racines et des poids à figer ; 48 cordes
  par courbe suffisent à poser une lettre au centième de rayon, avec des nombres exacts d’un moteur à l’autre.
- **Lier par position (le rang de la forme) dans le modèle** : fragile au premier geste qui réordonne ; le modèle garde
  l’identifiant, seul le fichier écrit un rang (les identifiants ne s’y écrivent pas), recalculé à chaque écriture.
- **Écrire la forme masquée dans le fichier, sans peinture** : un chemin invisible qu’une machine pourrait découper ; son tracé
  voyage avec le texte, encodé.
- **Refuser la pose quand le texte ne tient pas** : poser ajuste la taille, puis on la règle ; un réglage qui ne laisse rien se dit.
