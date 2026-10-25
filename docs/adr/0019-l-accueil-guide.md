# ADR-0019 — L’accueil guidé : une visite jusqu’à la première retouche, des repères, des états vides

**Date :** 25 octobre 2026
**Statut :** acceptée (prolonge les ADR-0006, 0007, 0010, 0011 et 0014) ; aucun octet écrit ne change

## Contexte

Un débutant en vectoriel qui ouvrait la page trouvait trois voies, puis un éditeur dense : une barre d’une vingtaine
d’outils, des calques, un inspecteur à sections, des mots de métier (« booléens », « points et poignées », « tracé
composé »). Rien ne lui disait par où commencer, ni que ce qu’il faisait se défaisait. Les panneaux vides (une liste de
versions, une recherche sans résultat, un dessin qu’on vient de vider) se taisaient ou disaient « Aucune… » sans suite.

Décisions du propriétaire, non négociables :

- le moment qui compte est **la première retouche réussie** : ouvrir un dessin, changer une couleur, récupérer le
  résultat ; tout l’accueil y mène le plus vite possible ;
- le public supposé est **débutant en vectoriel** : mots simples, aucun jargon sans une phrase qui le dit autrement,
  phrases courtes, aucun ton condescendant ;
- le périmètre : la première ouverture qui mène là, des états vides utiles partout, trois ou quatre repères à la première
  rencontre, et **une visite guidée courte** (cinq étapes au plus), sautable et rejouable ;
- dans l’éditeur embarqué, la visite est **désactivée par défaut** et s’active par une option d’hôte.

## Décision

1. **Une visite sur le vrai éditeur, pas un mode tutoriel.** Cinq étapes (`zones/visite.ts`, pur) : « Choisissez une
   forme », « Changez sa couleur », « Vous pouvez toujours revenir en arrière », « Récupérez votre dessin », « Votre
   première retouche est faite ». Chaque étape avance sur **le geste réel** qu’elle attend (une sélection qui apparaît, une
   couleur de forme qui change, une annulation, un fichier téléchargé, copié, exporté ou enregistré) et sur **« Suivant »**
   pour qui préfère lire ; seul le geste de l’étape du moment compte (télécharger avant d’avoir recoloré ne saute pas la
   recoloration). La fin propose trois suites qui existent déjà : convertir une image (la page seule, après
   enregistrement), prendre une forme dans la bibliothèque (si l’éditeur l’a), préparer pour une Cricut ; pas de fête.
2. **Elle ne s’ouvre seule que si on la demande.** La page la propose une fois sur la voie « Ouvrir un SVG » : « Première
   fois ? Essayez avec notre exemple : changez une couleur en une minute. » suivi d’un bouton **discret** « Essayer avec la
   visite guidée » (une seule action pleine par panneau, ADR-0006 ; aucune preuve inventée). « Ouvrir l’exemple » tout
   court n’ouvre que l’exemple : un bouton fait ce qu’il dit, et les centaines de tests de navigateur qui ouvrent
   l’exemple dans un navigateur neuf n’en voient rien (la visite parlerait dans la seule région vocale et masquerait les
   phrases qu’ils vérifient). Un hôte l’active par `visite: true` (validée par `verifierOptions`, comme les autres) : elle
   s’ouvre alors une fois, à la première ouverture qui ne l’a jamais vue. Le menu **Aide** (nouveau, dans la barre ; en tête
   du menu « Plus » sous 640 px) la rejoue toujours, avec « Raccourcis clavier ».
3. **Non bloquante, et jamais sur ce qu’elle montre.** Pas de voile : la bulle seule reçoit les clics là où elle est ; un
   filet cyan (pointer-events: none) entoure la cible. La bulle se pose **sur la toile**, jamais sur la barre, la rangée de
   la sélection ou un panneau : en haut sous une cible de la barre (sa flèche pointe la cible quand elle est au-dessus
   d’elle), en bas pour la toile elle-même ou une cible de la barre d’état. À chaque entrée dans une étape, **la vue se
   recadre** (`cadrage`, pur) pour que tout le plan tienne à côté de la bulle : elle ne cache jamais le dessin qu’elle demande
   de toucher. Elle se replace au redimensionnement, quand la cible change de taille ou d’élément (la barre d’un téléphone
   n’est pas celle du bureau), et au relâcher d’un pointeur (un tiroir, un menu). Sous 640 px, « Récupérez votre dessin »
   dit « Touchez « Plus » (les trois points) » ; au doigt, « Touchez » remplace « Cliquez ».
4. **Au clavier et au lecteur d’écran** (ADR-0011). La bulle ne prend jamais le focus d’elle-même ; **F6** y mène et en
   revient, le lien « Aller à la visite guidée » est le deuxième arrêt de Tab, et elle est le dernier élément de l’éditeur
   dans l’ordre de Tab (qui en sort vers le navigateur : rien ne piège). Échap dans la bulle la quitte ; sur la toile, Échap
   défait d’abord ce qui est plus proche (sélection, point, outil), puis la visite, puis ferme l’éditeur : « Échap puis Tab »
   quitte toujours la toile. Une touche frappée dans la bulle ne touche pas au dessin. Chaque étape se dit dans **la région
   vocale existante** (« Visite guidée, étape 2 sur 5 : Changez sa couleur. … »), après la phrase du geste qui l’a amenée ;
   la première dit comment atteindre la bulle. Le focus revient à la toile quand la bulle part avec lui.
5. **Vue une fois, retenue par le stockage injecté** (ADR-0010). `svg.guide` = `{ visite, reperes }`, relu champ par champ
   (`lireMemoire` : une valeur abîmée, empoisonnée ou future se lit comme ce qu’elle a de valide, jamais ne lève). Rien ne
   s’écrit tant que la personne n’a ni lancé la visite ni refermé un repère. Sans stockage (absent, refusé, plein), une
   mémoire de session prend le relais : la visite et les repères ne reviennent pas avant le rechargement.
6. **Quatre repères de première rencontre**, des notes posées dans le panneau (`role="note"`, jamais une bulle de plus :
   elles ne recouvrent rien, ne volent pas le focus, ne parlent pas), refermées par « Compris » (le focus passe à ce qui
   suit), jamais redites. Choisis là où un débutant bloque vraiment :
   - **les points** (premier double-clic, outil Points) : le seul endroit où le dessin change de nature — on ne déplace
     plus une forme, on la déforme — et où l’interface montre des carrés et des ronds sans les nommer ; la note dit ce
     qu’ils sont et comment revenir (V), dans la section du point ;
   - **le premier booléen** : le résultat surprend (plus qu’une forme, à la couleur de celle du dessous) ; la note le dit
     et rappelle Ctrl+Z, seulement si l’opération a réussi ;
   - **le premier choix du contexte Cricut** : un panneau de constats et un gabarit de tapis apparaissent d’un coup ; la note
     dit à quoi ils servent et que chaque correction s’annule ;
   - **la première conversion d’image** : le réglage qui compte (le grain) et la vue qui permet de juger (« Comparer »)
     ne se devinent pas.
   Écartés : l’outil plume (son aide est déjà dans la barre d’état à chaque point), le texte (son panneau s’ouvre avec lui),
   les exports (la visite les couvre).
7. **Des états vides qui mènent quelque part** (`commun/EtatVide.tsx`) : ce qui viendra ici, pourquoi c’est utile, et au
   plus un geste (un bouton discret) et une icône déjà dessinée ; trois genres distingués dans le texte et `data-vide` —
   première fois, vidé par la personne (le retour est à un clic), aucun résultat (ce qu’il faut changer). Un dessin sans
   forme ne s’ouvre pas (la lecture le refuse, ADR-0001) : un dessin vide est toujours un dessin vidé.
8. **Typographie française** : les textes neufs passent par `insecables` (`util/texte.ts`) — une espace insécable avant
   « ; : ? ! » et le guillemet fermant, après l’ouvrant — pour qu’une ligne étroite ne commence jamais par « ; ».

## Conséquences

- **Un menu de plus dans la barre** : Vue, Édition, **Aide**. `tests/e2e/menus.e2e.ts` listait exactement cinq menus ; il en
  liste six, avec la raison écrite à côté. C’est le seul test existant modifié.
- **Sur un téléphone, un tiroir ouvert masque le dessin dessous** (`visibility: hidden` sur ses formes ; la toile reste
  focalisable). Le tiroir couvre 86 % de la largeur sous un voile qui reçoit les touchers : on n’y voyait qu’une lisière.
  axe, qui lit la pile des éléments sous chaque ligne de texte d’après leurs boîtes, jugeait le contraste des lignes du
  tiroir selon les formes cachées dessous : ajouter un état vide en tête de l’inspecteur suffisait à faire tomber trois
  lignes de couleur sur le bord du cercle de l’exemple, et l’audit « 420 px, inspecteur ouvert » à échouer. Au-dessus de
  640 px (tablette), le dessin reste visible derrière le tiroir.
- **La zone de dépôt de l’accueil passe de 24 à 16 px de marge intérieure**, et le bouton de l’invitation se lit comme un lien
  de la phrase (sans marge) : la ligne neuve ne pousse la page que de 16 px. À 1200 × 900, l’audit « nuancier ouvert »
  voyait sinon le pied de page à cheval sur le bas de l’écran.
- **L’action `booleen` rend un booléen** (vrai si le résultat a remplacé les formes) : le repère ne parle pas d’un
  assemblage refusé.
- La bulle est une fenêtre non modale (`role="dialog"`, nommée par son titre, décrite par son texte) dans la fenêtre modale
  de l’éditeur, sur une couche neuve, `--couche-visite` (1050 : au-dessus de l’éditeur et de ses tiroirs, sous les menus).
  Aucune couleur, taille, espace ou rayon neuf : la bulle est une feuille de panneau avec l’ombre des menus (elle flotte),
  le repère une note au filet cyan sur le voile cyan à 8 % déjà défini, l’état vide un texte à l’encre douce.
- Les preuves : `tests/unit/zones/visite.test.ts` (étapes, signaux, textes, cibles, pose et cadrage, mémoire, option d’hôte),
  `tests/unit/util/texte.test.ts` (`insecables`), `tests/e2e/onboarding.e2e.ts` (souris jusqu’au SVG téléchargé recoloré,
  clavier seul, Passer, Échap, F6, menu Aide, mémoire, sans stockage, 390 px au doigt, embarqué avec et sans option, chaque
  repère, chaque état vide), et des écrans de plus dans `accessibilite-axe.e2e.ts` (chaque étape de la visite, la fin en
  sombre, 390 px, les repères, un dessin vidé, la boîte des raccourcis) et `cibles.e2e.ts` (la bulle à chaque étape, les
  repères et états vides, à 1280 px et à 390 px).
- Limites, honnêtement : aucun lecteur d’écran réel n’a été essayé (les annonces sont vérifiées par les mutations de la
  région) ; F6 est pris par certains navigateurs pour passer à la barre d’adresse avant la page, d’où le lien
  d’évitement ; Chromium seul a exercé la visite ; la visite recadre la vue à chaque étape, un zoom choisi pendant une
  étape tient jusqu’à la suivante ; au bureau, en contexte Cricut, le gabarit du tapis déborde de la toile et axe le croit
  sur la barre d’état (un doute antérieur à cet ADR, que les audits contournent en jugeant le repère Cricut dans un tiroir).

## Alternatives écartées

- **Une bibliothèque de visite** (Shepherd, Intro.js, React Joyride) : une dépendance de plus, un voile par défaut, un focus
  piégé, et des couleurs hors du registre ; une visite de cinq étapes tient dans deux fichiers.
- **Ouvrir la visite sur « Ouvrir l’exemple »** : le bouton ferait autre chose que ce qu’il dit, et la suite de navigateur
  devrait apprendre à la contourner partout.
- **Un voile qui assombrit le reste** : il empêche de faire le geste demandé ailleurs que là où il pointe, et interdit
  de découvrir par soi-même ; un filet suffit à dire où regarder.
- **Une bulle posée au plus près de la cible, par-dessus la barre ou l’inspecteur** : elle cachait la rangée de la sélection
  ou les réglages qu’on voulait toucher, et le dessin passait dessous.
- **Des repères en bulles flottantes** : ils recouvraient ce que la personne allait cliquer ; une note dans le flux ne
  recouvre rien.
