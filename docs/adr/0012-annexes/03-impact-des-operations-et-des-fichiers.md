# ADR-0012, annexe 3 — Impact, opération par opération et fichier par fichier

Sources lues : `edition/operations.ts`, `assemblage.ts`, `nettoyage.ts`, `ecriture.ts`, `lecture.ts`,
`parcours.ts`, `heritage.ts`, `types.ts`, `couleurs.ts` (signatures), `texte.ts`, `export/pdf.ts`,
`export/svgs.ts`, `util/historique.ts`, `zones/Calques.tsx`, `zones/Toile.tsx`, `zones/Clavier.ts`. Les
fichiers de `zones/` autres que ceux-là sont classés **par leur nom et par un `grep` de `.formes`** ; la
classification se confirme fichier par fichier à l'étape 2.

## 1. Règle commune

Toute fonction qui change de comportement en présence de groupes ou de champs v2 commence par
`if (estPlat(dessin)) return <corps actuel>` : un dessin plat prend le chemin qu'il prenait, sans une ligne
partagée avec le chemin riche. C'est ce qui rend la compatibilité **démontrable** (test de loi : pour un
dessin plat, chaque fonction nouvelle rend le même résultat que l'ancienne, et `===` quand elle rendait le
même objet) et chaque étape **petite**.

Vocabulaire : « nœud » = feuille ou groupe ; « sélection » = tableau d'ids de nœuds ; `unites` = nœuds
choisis sans ceux dont un ancêtre l'est aussi ; `feuillesDe` = feuilles couvertes ; `promouvoir` = règle de
la fermeture (annexe 1 §9).

## 2. Les opérations

| Opération (fichier) | Sur une feuille | Sur un groupe (ou une sélection mixte) | Retour si rien ne change |
|---|---|---|---|
| `transformer`, `deplacer`, `retourner`, `tourner`, `redimensionner` (`operations.ts`) ; `incliner`, `mettreALEchelle`, `tournerAutour` (`transformations.ts`) | `d`, trait (`echellerTrait`), et ses champs v2 : `matrice` des peintures et du texte/image composée avec `m` ; `effets` (voir ci-dessous) | `feuillesDe(promouvoir(ids))` ; en plus, pour chaque groupe **dans la fermeture** : sa `decoupe`, son `masque` (contenu et région), ses `effets` | même objet |
| Effets sous `m` | `ecart *= facteur(m)` (`geometrie.ts`) ; `ecartY` selon l'échelle par axe si `m` est sans rotation, sinon moyenne géométrique et mention dans le message ; `dx dy *= facteur(m)` **sans rotation** (ombre dans le repère du plan, annexe 4 §2) | idem | |
| `boiteDe` (`geometrie.ts`) | boîte de la forme | union des boîtes **visuelles** des feuilles du nœud (trait compris : `boiteAvecTrait`), intersectée avec la boîte de la découpe de chaque groupe ancêtre dans le nœud, sans les effets (la boîte d'édition n'est pas la boîte d'impression) | |
| `aligner` | boîte de la feuille | **par unité** : chaque nœud choisi bouge d'un bloc ; référence = boîte de la sélection, ou le plan pour une seule unité | même objet |
| `modifier` (`Reglage`) | champs actuels ; `remplissage`/`contour` donnés **retirent** la peinture non unie correspondante (on choisit une couleur : plus de dégradé), sauf si le réglage nomme aussi la peinture | `visible`, `verrouille`, `opacite` s'appliquent **au groupe** ; les champs de peinture (`remplissage`, `contour`, `epaisseur`, `regle`, `opaciteRemplissage`, `opaciteContour`) s'appliquent à **toutes les feuilles** du groupe | même objet |
| `modifierTrait` | actuel | feuilles du groupe | idem |
| `supprimer` | actuel | le groupe et ses feuilles ; `normaliser` retire ensuite les groupes devenus vides | idem |
| `ordonner` (`premier avant arriere dernier`) | déplace la feuille **dans son parent**, jamais hors de lui | déplace le bloc contigu du groupe parmi ses frères ; une sélection de nœuds de parents différents est traitée parent par parent | même objet (`meme`) |
| `dupliquer`, `coller`, `inserer` | actuel, juste au-dessus de l'original dans le même parent (`dupliquer`) ou au premier plan du contexte (`coller`, `inserer`) | copie du sous-arbre : nouveaux ids de feuilles **et** de groupes, `parent` recopié vers les nouveaux groupes, contenus de découpes/masques/motifs **renumérotés** ; presse-papiers = `Contenu` (formes + groupes concernés) au lieu de `Forme[]` | |
| `combiner` | actuel (style et place de la plus haute) | **refus dit** (`« Les formes à réunir doivent être dans le même groupe. »`) si les feuilles n'ont pas le même `parent` ; sinon réunit les feuilles du groupe ; résultat : style, place **et parent** de la plus haute ; un texte vivant est converti en contours avant | `{ dessin, id: null }` comme aujourd'hui |
| `separer` | une forme par sous-chemin, `parent` conservé | n'a pas de sens sur un groupe : l'action se grise (`Dégrouper` existe pour cela) | |
| `appliquerBooleen` (`booleens.ts`) | opérandes = feuilles ; **même règle de parent que `combiner`** ; résultat au style (peinture non unie et effets compris), à la place et au parent de la plus basse | feuilles du groupe sous la même règle | erreur dite, comme aujourd'hui |
| Géométrie des booléens sous découpe | les opérandes se prennent **non découpés** (leur géométrie du plan) ; la découpe du groupe reste au groupe | idem | |
| `simplifier`, `simplifierChemin` | actuel | feuilles du groupe | idem |
| Points (`deplacerAncre`, `deplacerPoignee`, `supprimerAncre`, `diviserSegment`, `basculerSegment`) | actuel | n'a pas de sens : Entrée sur un groupe **entre** dans le groupe | |
| Points sur un texte vivant | converti en contours, **une entrée d'historique** (« Texte converti en contours »), puis le point bouge | — | |
| Points sur une image | refusé, dit | — | |
| `regrouper` (réunir les voisines de même style) | `memeStyle` ajoute : mêmes `peinture*` (égalité profonde), mêmes `effets`, ni `texte` ni `image` ; **jamais deux feuilles de parents différents** | n'entre pas dans un groupe dont `decoupe` ou `masque` existe sans que les deux feuilles soient dedans | `reunies: 0` |
| `retirerPetites` | actuel (feuilles pleines sous le seuil) | idem ; groupes vides retirés par `normaliser` | |
| `ajusterPlan` | boîte visuelle = `boiteAvecTrait` | feuilles **visibles par héritage** (`visibleEffectif`) ; boîte de chaque feuille ∩ boîte des découpes ancêtres ; **étendue par les effets** (3 écarts + décalage) | |
| `remplacerCouleur`, `remplacerCouleurSur`, `idsDeCouleur`, `idsMemeCouleur`, `groupesDeCouleur`, `couleursDuDessin`, `lireCouleurs…`, `fusionnerCouleursProches`, `appliquerPalette`, `uneCouleur` | **ignorent** les feuilles à peinture non unie (annexe 1 §6) | descendent dans les groupes ; **ne descendent pas** dans les contenus de découpes et de masques (un masque est de la luminance, pas une palette) ; entrent dans les motifs à l'étape 13 | |
| `montrerSeulement`, `visibilitesDe`, `restaurerVisibilites`, `visibilitesConformes` (`isolement.ts`) | actuel | les ids sont globaux : groupes compris ; isoler un nœud affiche aussi ses **ancêtres** ; ses descendants gardent leurs états propres | |
| `ajouterForme`, `ajouterTexte`, `polygone`… | ajoute au premier plan **du contexte d'édition** (paramètre `parent?`, absent = racine) | — | |
| `prochainId` | plus grand `fN` | `prochainNumero(d, 'f' \| 'g')` sur tout le dessin (contenus compris), mémoïsé | |

## 3. Opérations nouvelles (toutes pures, dans `edition/groupes.ts` et ses voisins)

`grouper(d, ids, nom?)` : crée un groupe parent commun ; les nœuds doivent avoir le même parent (sinon le
groupe se crée dans le parent du plus haut, après avoir ramené les autres : choix de l'étape 2, testé), le
groupe prend la place du plus haut nœud dans l'ordre de peinture. `degrouper(d, ids)` : remonte les enfants
d'un groupe dans son parent, **dans leur ordre** ; un groupe qui porte une découpe, un masque, des effets ou
une opacité < 1 demande confirmation (« dégrouper retire la découpe ») ; les feuilles gardent leurs
coordonnées (rien à recalculer, la matrice est cuite). `entrer`/`sortir` sont de l'**état d'interface**
(contexte), pas du dessin. `renommer`, `deplacerDans(d, ids, parent, avant?)` (alternative au glisser).
Découpes : `creerDecoupe(d, ids)` (la forme la plus haute devient la découpe, le reste son contenu :
sémantique d'Illustrator), `liberer(d, id)`. Masques : `creerMasque`, `libererMasque`, `inverserMasque`
(étape 6). Peintures : `poserDegrade`, `retirerDegrade`, `changerArret…` (étape 3). Effets : `poserEffets`.
Texte : `poserTexte`, `convertirEnContours` (étape 10).

## 4. Le blast radius, fichier par fichier

Mesures du §7 de l'annexe 1 (97 fichiers importent les types, 39 fichiers de `src` lisent `.formes`, 4
expressions construisent une `Forme`). Légende : **A** = aucun changement (correct sur un dessin riche
parce qu'il agit sur des feuilles par id) ; **B** = comportement à adapter, derrière `estPlat` ; **C** =
interface.

### Moteur (`src/engine`)

| Fichier | Cat. | Quoi | Étape |
|---|---|---|---|
| `edition/types.ts` | B | champs facultatifs, `Groupe`, `Contenu`, `Peinture`, `Effets`… | 0, puis chaque étape |
| `edition/arbre.ts` (nouveau) | — | `arbreDe`, `feuillesDe`, `unites`, `promouvoir`, `estPlat`, `verifierDessin`, `normaliser` | 0 (coutures), 1 |
| `edition/lecture.ts`, `parcours.ts`, `heritage.ts`, `cascade.ts`, `ignores.ts` | B | mode `riche`, contexte `parent`/groupe courant, résolution `url(#…)`, phrases ; `refusDe` devient une consultation de la table des fonctions prises en charge | 0 (couture), 1, 3, 5–7, 9, 12 |
| `edition/clones.ts` | A | inchangé (cadres, bornes) | — |
| `edition/ecriture.ts` | B | garde `estPlat`, chemin riche, `<defs>` | 1, 3, 5–7, 9, 10, 12 |
| `edition/operations.ts`, `assemblage.ts`, `nettoyage.ts`, `isolement.ts`, `formes.ts` | B | tableau du §2 | 1 |
| `edition/geometrie.ts` | B | `boiteDe` (nœuds), composition de matrices de peinture | 1, 3 |
| `edition/etendue.ts` | B | `boiteVisuelle` (découpes, effets) | 5, 7 |
| `edition/couleurs.ts`, `couleursProches.ts` | B (petit) | ignorer les peintures non unies | 3 |
| `edition/points.ts`, `simplification.ts`, `ajustement.ts`, `chemins.ts`, `trait.ts`, `peinture.ts`, `elements.ts`, `opacites.ts`, `grille.ts` | A | — | — |
| `booleens.ts` | B (petit) | règle de parent, style de la plus basse | 1 |
| `texte.ts` | B | `ajouterTexte(..., parent?)` ; la mise en page (alignement, boîte) s'ajoute **à côté** (`composerBloc`), `composer` ne change pas d'un octet | 1, 10 |
| `transformations.ts` | B | aimants : cibles = nœuds frères du contexte | 2 |
| `navigation.ts`, `description.ts` | B | nœuds du contexte (Tab) ; phrases de groupe, de dégradé, de découpe, d'effet | 2, 4, 8, 11 |
| `palettes.ts`, `extraction.ts`, `detourage.ts`, `vectorisation.ts` | A | — (la vectorisation produit un dessin plat) | — |
| `aplatir.ts` (nouveau) | — | `aplatirPour(dessin, capacites)` : la descente vers le plan (annexe 5 §4). Dans `engine/`, **pas** dans `edition/` (il emploie `booleens.ts` ; `booleens.ts` importe la façade d'`edition` : un cycle sinon) | 0 (identité), chaque étape |

### Exports et utilitaires

| Fichier | Cat. | Quoi | Étape |
|---|---|---|---|
| `export/svgs.ts` (`svgDecoupe`) | B | prend un `DessinPlat` ; contours seuls | 0 (type), 5 |
| `export/pdf.ts` | B | prend un `DessinPlat` ; natif plus tard (dégradés, découpes, images) | 0, 13 |
| `util/historique.ts` | A | inchangé ; le **poids** passé à `limitePourTaille` change (§5) | 1 |
| `util/svg.ts` | B | liste blanche (annexe 2 §6), à la charge de l'agent du nettoyage | — |
| `util/empreinte.ts` (nouveau), `util/xml.ts` | — / A | hachage pur ; `lireXml` inchangé (il garde déjà le `texte` des nœuds, utile à `<text>`) | 3 |
| `io/polices.ts`, `io/crenageGpos.ts`, `io/ligaturesGsub.ts` | A→B | reconnaissance d'une fonte par `PoliceRef`, mise à disposition de `Glyphes` par id | 10 |
| `io/image.ts` | A | l'enveloppe « image telle quelle » du convertisseur devient ouvrable (étape 12) | 12 |
| `model/*` | A | la bibliothèque se lit en mode `plat` : 4 134 empreintes inchangées | — |

### Interface (`src/zones`)

| Fichier(s) | Quoi | Étape |
|---|---|---|
| `Calques.tsx` | liste à plat → arbre (`treegrid`), fenêtrage des **lignes visibles** | 2 |
| `Toile.tsx`, `ToileEditeur.tsx` | rendu récursif (`<g>`, `<defs>` générées par les mêmes fonctions que l'écriture), contour du groupe en contexte, poignées de dégradé | 2, 4, 8 |
| `Gestes.ts` | un clic atteint une feuille ; il choisit l'ancêtre-enfant du contexte | 2 |
| `Clavier.ts`, `ClavierSelection.ts`, `ClavierToile.ts` | Tab parcourt les nœuds du contexte ; Entrée entre ; Maj+Entrée sort ; **Ctrl+G** (voir questions) | 2 |
| `Inspecteur.tsx`, `PanneauDessin.tsx` | sections Remplissage (dégradé), Effets, Masque, Texte | 4, 8, 11 |
| `ParCouleur.tsx`, `LigneCouleurDessin.tsx`, `ListeCouleurs.tsx`, `CouleursDuDessin.tsx` | ignorer les peintures non unies ; une ligne « Dégradés » | 4 |
| `BarreOutils.tsx`, `BarreSelection.tsx`, `MenusBarre.tsx` | commandes Grouper, Dégrouper, Masque, Effets ; « SVG à plat » dans Fichier | 2, 8 |
| `RegionVocale.tsx`, `annonces.ts`, `phrasesSelection.ts` | phrases (annexe 6) | 2, 4, 8, 11 |
| `actions*.ts`, `creerActions.ts`, `etatEditeur.ts`, `contexteEditeur.tsx` | `contexte` d'édition dans le contexte `Interface` ; verbes stables nouveaux dans `Actions` | 2 |
| `Application.tsx`, `EditeurSvg.tsx`, `embarque.tsx`, `demarrer.tsx`, `session.ts`, `Versions.tsx`, `Exporter.tsx` | propriété/réglage `modele`, message d'ouverture, brouillon et versions (SVG riche), exports | 2, 13, 14 |
| `Texte.tsx` | texte vivant | 11 |

## 5. Historique et mémoire (ADR-0008)

`limitePourTaille(taille)` reçoit aujourd'hui un nombre de formes. Il reçoit désormais un **poids** :
`poidsDessin(d) = formes.length + 4·groupes + 20·(feuilles dans les contenus de découpes/masques/motifs)
+ 50·images`, où les images comptent 50 par image **plus** leurs octets/10 000 (une image de 2 Mo pèse 250).
Pour un dessin plat le poids est `formes.length`, donc la limite d'historique est celle d'aujourd'hui
(200 jusqu'à 1 000 formes, 100 jusqu'à 2 000, 40 jusqu'à 5 000, jamais moins de 10). Les images sont des
chaînes partagées d'un état à l'autre (aucune copie), le poids dit seulement ce qu'elles pèsent.

Une opération rend les groupes et les peintures **non touchés** par la même référence que l'état précédent
(`Record` copié à la surface, valeurs partagées) ; `arbreDe` est mémoïsé par dessin et reconstruit en O(n)
(objectif : 2 ms au plus pour 5 000 feuilles, à mesurer à l’étape 1 selon la méthode de l’ADR-0008), le rendu des sous-arbres
inchangés est mémoïsé par groupe.
