# ADR-0012, annexe 9 — Risques et questions ouvertes

## 1. Risques, du plus lourd au plus léger

| # | Risque | Pourquoi il est réel | Parade | Détection |
|---|---|---|---|---|
| R1 | **Les octets d'un dessin plat bougent par accident** (une fonction partagée change un arrondi, un ordre d'attributs) | `ecriture.ts` et `operations.ts` sont des fichiers que sept étapes touchent | chemin plat **séparé** derrière `estPlat` (aucune ligne partagée) ; références v1 gelées par manifeste ; loi du dessin plat ; 4 134 empreintes | G3, G4 à chaque étape |
| R2 | **Un invariant de groupe se corrompt** (contiguïté, feuille orpheline, groupe vide) et l'écriture écrit un dessin faux | le modèle redondant (`parent` + ordre de `formes`) demande qu'on le tienne partout | `verifierDessin` en test après **chaque** opération d'une suite aléatoire ; `normaliser` en filet ; l'écriture ne s'appuie que sur l'arbre dérivé | propriété aléatoire, hostiles |
| R3 | **Un exporteur lit `dessin.formes` d'un dessin riche** et écrit faux sans le dire | 39 fichiers de `src` lisent déjà `.formes` ; DXF/EPS arrivent en parallèle | `DessinPlat` (type), test d'architecture, `Capacites` déclarées | compilation, test |
| R4 | **Fidélité de rendu** : un filtre, un masque, un dégradé ne se voit pas pareil d'un moteur à l'autre | seul Chromium est exercé aujourd'hui | formes d'écriture du plus petit commun dénominateur ; équivalence pixel ; Firefox/WebKit dans la matrice avant la bascule ; revue Inkscape/resvg | e2e `rendu-v2` |
| R5 | **Interface : l'arbre des calques, l'éditeur de dégradé et les poignées sont les pièces d'accessibilité les plus difficiles** de l'éditeur ; axe a déjà trouvé des violations réelles (ADR-0011) | `treegrid` fenêtré, poignées-curseurs sur une toile, focus qui disparaît quand la fenêtre bouge | liste d'arrêts **complète** sans la toile ; alternatives clavier au glisser ; ligne épinglée ; e2e clavier par parcours ; revue manuelle d'un lecteur d'écran avant la bascule | axe, e2e |
| R6 | **Performance** : effets, masques et gros arbres dans la toile ; mémoire de l'historique avec des images | `Toile.tsx` rend aujourd'hui un `<path>` par forme | budgets chiffrés, mode brouillon pendant les gestes, plafonds de lecture, poids d'historique ; on **mesure avant de corriger** (ADR-0008) | témoins de l'annexe 7 §4 |
| R7 | **Le nettoyage et le durcissement concurrents cassent le texte vivant ou les définitions** (`nettoyerSvg` mutile `on…=`, `javascript:`, `url(` dans les valeurs d'attribut) | trouvé en lisant `util/svg.ts` | encodage en pourcentage du texte et des noms ; liste blanche d'éléments communiquée (annexe 2 §6) ; test d'aller-retour | H4, test d'encodage |
| R8 | **Conflits de fusion** entre étapes parallèles et chantiers concurrents (`Forme.origine`, nœuds de chemin, formats d'export) | mêmes fichiers (`types.ts`, `parcours.ts`, `Toile.tsx`) | tout `types.ts` à l'étape 0 ; six registres ; un fichier par fonctionnalité ; quatre arbres au plus | carte de l'annexe 8 |
| R9 | **Diversité des fichiers réels** : les éditeurs écrivent des idiomes que la spec admet mais que personne n'a listés | Illustrator, Figma, Sketch, Inkscape ont chacun des habitudes | corpus d'idiomes reconstruits ; reconnaisseurs à fixture ; refus **nommé** plutôt que mauvaise lecture | corpus de l'annexe 7 §7 |
| R10 | **Texte vivant : une fonte absente ou changée** (fonte déposée, mise à jour d'une fonte livrée) | `io/polices.ts` charge des fichiers | `d` écrit fait foi à l'ouverture ; fontes livrées épinglées par empreinte dans un test ; fonte absente dite | tests de fontes |
| R11 | **Attentes des utilisateurs** : transformations non vivantes d'un groupe, ombre qui ne tourne pas, pas de modes de fusion | choix du modèle (annexe 1) | documenté dans l'aide et les phrases ; `ignores` pour la fusion ; nommé dans l'ADR | retours |
| R12 | **Taille du chantier** : quinze étapes, dont quatre d'interface | | découpage, vagues, bascule en dernier ; chaque étape se revert seule | suivi des étapes |

## 2. Ce que cet ADR ne tranche pas, et pourquoi

- Les **composants liés** (symboles et instances préservés) : écartés (annexe 2 §2) ; à rouvrir si un besoin
  de planche d'icônes liée se montre.
- Le **texte sur tracé** : après la bascule.
- Les **modes de fusion** (`mix-blend-mode`) : ni lus ni écrits ; dits à l'ouverture.
- La **saisie directe du texte sur la toile** : le panneau suffit à l'accessibilité ; la saisie directe est un confort.
- Les **filtres au-delà du flou et de l'ombre** (lueur, ombre interne, couleur, morphologie).

## 3. Questions pour le propriétaire

Chacune porte une recommandation ; sans réponse, c'est elle qui s'applique.

1. **Ctrl+G.** Aujourd'hui il « réunit » les formes en un chemin (`zones/Clavier.ts`, ligne 44), Ctrl+Maj+G les
   sépare. Tous les logiciels de dessin le donnent à « Grouper ». *Recommandation* : en mode riche, Ctrl+G groupe,
   Ctrl+Maj+G dégroupe, Réunir et Séparer passent au menu Objet avec un autre raccourci ; en mode plat, rien ne bouge.
2. **Les `<g>` d'un fichier ouvert se conservent à l'enregistrement** (au lieu d'être aplatis). C'est la seule
   chose qui change d'octets pour des SVG qui s'ouvraient déjà, et c'est un événement de version majeure.
   *Recommandation* : oui (un éditeur professionnel ne défait pas la structure d'un fichier), avec « SVG à plat »
   toujours disponible au menu Fichier.
3. **Le défaut de l'embarquement** (`EditeurSvg.ouvrir`) à la bascule. Un hôte qui stocke les SVG réécrits compte
   sur l'ancien contrat. *Recommandation* : il reste `plat` ; l'hôte passe `modele: 'riche'` quand il est prêt ; la
   page, elle, passe à `riche`.
4. **PDF d'un dessin avec effets** : rastérisé par le navigateur (donc non reproductible à l'octet d'un
   navigateur à l'autre, alors que tout le reste l'est). *Recommandation* : accepter, le dire, et offrir
   « ignorer les effets » ; l'approximation vectorielle attend l'outil de décalage de contour.
5. **Texte natif en option d'export** (`<text>` + `font-family`, pour le web où la fonte est installée) : jamais
   écrit aujourd'hui. *Recommandation* : non, pas dans ce chantier ; la règle « jamais de `<text>` » est tenue.
6. **Fontes déposées par l'utilisateur** : on n'écrit jamais le fichier de fonte, seulement son nom et son empreinte ;
   rouvrir sur une autre machine demande de redéposer la fonte pour modifier le texte (le dessin, lui, est intact).
   *Recommandation* : oui.
7. **Plafonds d'image** : 4 Mo par image, 16 Mo par dessin, 64 millions de pixels. *Recommandation* : ces valeurs ;
   à ajuster si des fichiers réels les dépassent.
8. **Nom du marqueur et numéro** : `data-ed-modele="2"` et préfixe `data-ed-`. *Recommandation* : ces noms ; le numéro
   de version du paquet à l'étape 14.
9. **Licence propriétaire** : sans effet sur la conception (aucun fichier de fonte n'est écrit dans un SVG ;
   les fontes OFL livrées gardent leurs textes de licence dans le dialogue de crédits de l'autre chantier).
   *À confirmer par qui de droit* : que la SIL OFL admet bien la livraison des neuf fontes avec un produit
   propriétaire (elle l'admet tant qu'elles ne se vendent pas seules et gardent leur licence) et que les contours
   qu'on en tire n'ont aucune obligation ; ce n'est pas une décision d'ingénierie.
