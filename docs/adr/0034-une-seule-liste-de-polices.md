# ADR-0034 — Une seule liste de polices, avec tout, et ce qui reste à télécharger marqué

**Date :** 25 octobre 2026
**Statut :** acceptée (prolonge les ADR-0025, 0026 et 0027 ; s’appuie sur les ADR-0006, 0008, 0011, 0016 et 0030) ; **aucun octet
écrit ne change** : la liste n’est qu’une manière de choisir une police, le texte vivant et ses attributs sont ceux d’avant.
(0032 et 0033 sont le texte déformé et les formes de base, menés à part.)

## Contexte

Demande du propriétaire : « Toutes les polices sont dans le drop down des polices, même celles qui ne sont pas chargées. Marquage
pour celles qui ne sont pas encore en local. »

Jusqu’ici, la liste « Police » (un `<select>` natif, dans le panneau Texte, l’inspecteur et la barre de texte) ne montrait que les
fontes livrées, déposées ou déjà téléchargées dans la session ; les 2 166 lignes du catalogue (ADR-0025, une par famille selon
l’ADR-0026) n’étaient que dans « Toutes les polices », une feuille à ouvrir à côté. On choisissait donc une police à deux endroits,
et rien ne disait, devant un nom, s’il fallait le télécharger.

Un `<select>` ne sait ni chercher, ni dessiner un nom dans sa police, ni porter une icône, ni se fenêtrer : deux mille options
natives s’ouvrent lentement (et entières) et ne se parcourent qu’à la lettre initiale.

## Décision

### 1. Une liste déroulante à recherche, partagée

`zones/ChoixPoliceListe.tsx` remplace le `<select>` partout où l’on choisit une police : le panneau de l’outil Texte et la section
Texte de l’inspecteur (par `ChoixPolice`), la barre de texte (version compacte). C’est le motif ARIA **combobox** avec une
**listbox** : un champ texte (`role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`, `aria-controls`) qui garde le focus,
la ligne active dite par `aria-activedescendant` ; la liste est un `role="listbox"` nommé « Polices », des groupes `role="group"`
nommés par leur titre, des options `role="option"` (`aria-selected` pour la police choisie, `aria-disabled` pour une police absente
ou en cours de téléchargement).

Le calcul des lignes est pur et vit à part (`zones/lignesPolices.ts`, sans React ni DOM) : groupes, ordre, état de chaque ligne,
nom accessible, recherche, placement de la liste.

### 2. Les groupes, dans l’ordre d’un traitement de texte

1. **Police actuelle** (la famille livrée de la variante grasse ; une police introuvable y est nommée « Police absente : … ») ;
2. **Dans ce document** (chaque police des textes une fois, lue seulement liste ouverte) ;
3. **Favoris** et 4. **Récentes** (les conforts de l’ADR-0025, une ligne par nom de famille) ;
5. **Livrées avec l’éditeur**, puis 6. **Trait unique (stylo)** à part ;
7. **Vos polices** (déposées, de l’appareil) ;
8. **Toutes les polices** : le catalogue, une ligne par nom de famille (`famillesMontrees`, la règle `PREFERENCE_SOURCES` de
   l’ADR-0026 ; une famille livrée n’y revient pas).

Un groupe vide ne se montre pas. Chez un hôte sans `policesEnLigne`, l’index n’est jamais chargé : seuls les groupes locaux (et les
polices du document qu’on peut nommer) apparaissent, sans marque ni lien vers les filtres, comme avant.

### 3. Chaque ligne : le nom dans sa police, ses badges, sa marque

- Le nom **dessiné dans sa police** (ADR-0026 : calculé sur place pour une fonte disponible, préparé pour le catalogue, sinon écrit
  dans la police de l’interface), image décorative `aria-hidden` peinte en `currentColor` ;
- les **badges** : la source (sauf dans les groupes dont le titre la dit déjà : livrées, trait unique, vos polices), « Trait unique »,
  « ITF » (avec son nom en infobulle) ;
- la **marque « à télécharger »** : une icône dessinée dans le style d’`icones.tsx` (`nuage-telecharger` : un nuage ouvert par le
  bas et la flèche qui en descend, au trait, `currentColor`), dans une colonne à droite pour qu’on la balaie d’un coup d’œil, et les
  mots « à télécharger » dans le **nom accessible** de l’option (`aria-label` : « Roboto, Google Fonts, à télécharger ») ; elle ne
  tient ni à la seule couleur, ni à la seule image. Une police en cours de téléchargement montre « Téléchargement… » (« téléchargement
  en cours » pour un lecteur d’écran) ; une police absente, « absente ». Le pied de la liste explique la marque en une phrase.

Une ligne est **locale** (sans marque) quand sa police est livrée, déposée, déjà lue dans la session, ou **gardée dans le cache du
navigateur** : la ligne d’une famille regarde sa variante principale, celle que la choisir poserait. Pour le cache, la page lit
seulement les **clés** de Cache Storage (`adressesEnCache`, `io/policesEnLigne.ts`), une lecture locale qui ne lit aucun fichier
et ne contacte personne ; une variante est locale quand chaque fichier a une adresse dans le cache (celle de l’hôte quand il en
pose une, ADR-0030). Sans cache, la marque reste, et le choix relit ou télécharge comme avant.

### 4. Taper filtre ; le clavier complet

Taper dans le champ cherche (casse, accents et ponctuation ignorés, un nom qui commence par ce qu’on tape d’abord) : la même règle
que `filtrerFamilles`, devenue générique (`filtrerParNom`, `model/cataloguePolices.ts`, sans changer son résultat). Pendant une
recherche, les raccourcis (police actuelle, document, favoris, récentes) se retirent : ils redoubleraient les lignes de leur groupe.
La première ligne trouvée devient active.

Flèches haut et bas, Page haut et bas, Début et Fin parcourent ; Alt+flèche bas ouvre sans bouger, Alt+flèche haut ferme ; Entrée
choisit (la première ligne trouvée si aucune n’est active) ; Échap ferme et rend le champ tel qu’il était (la barre de texte ne le
voit pas, il ne ramène pas au texte) ; **Tab ne retient pas le focus** : il passe au lien du pied de la liste (Maj+Tab revient au
champ, Échap y ferme la liste), puis, d’un Tab de plus, ferme la liste et va au contrôle qui suit le champ, comme si la liste
n’existait pas. Le focus reste toujours dans le champ (un clic dans la liste ne le prend pas). Choisir la police déjà choisie ne change rien
et n’entre pas dans l’historique, comme une liste déroulante.

### 5. Fenêtrée : l’ouverture ne dépend pas du catalogue

Le groupe du catalogue se fenêtre au-delà de 150 lignes (ADR-0008, `useFenetre` de `Fenetre.ts` sur la liste qui défile, et
`segmentsFenetre`) : une trentaine de lignes dessinées sur 2 166, des lignes de hauteur fixe (32 px, 40 au doigt) que les cales
remplacent ; la ligne active reste dessinée même loin (`epingle`) pour que `aria-activedescendant` désigne toujours un élément. Les
recherches de variantes passent par un index calculé une fois par catalogue (`trouverVariante` hachait les neuf mille variantes à
chaque appel) et la variante principale d’une famille se lit une fois (`WeakMap`).

**Mesure** (vrai catalogue de `dist/`, index déjà chargé, du clic à la première image où des lignes du catalogue sont dessinées,
cinq ouvertures) : Chromium, médiane de **15 à 19 ms** (de 10 à 21 ms) ; WebKit, médiane **34 ms** (de 28 à 72 ms). La première ouverture charge en plus l’index et les
aperçus, deux annexes voisines (ADR-0025, 0026). Le test `liste-polices.e2e.ts` garde une borne de 400 ms.

### 6. Le choix vaut demande, rien d’autre ne part

Ouvrir la liste, la parcourir, chercher, voir les aperçus : **aucune requête** (le test réseau coupé le vérifie, avec le vrai
index). Seul le choix d’une police marquée la télécharge, aussitôt, par `telecharger` du contexte du texte : vérification sha256
dans `io`, serveur de l’hôte quand il en pose un (ADR-0030). Pendant le téléchargement, le champ dit « Téléchargement de Roboto… »
sous lui (`aria-busy`), la région vocale l’annonce ; la police posée, la marque disparaît. Une erreur (réseau, empreinte) est dite
sous le champ (`role="alert"`) et par la région vocale ; la police d’avant reste.

### 7. Où la liste s’ouvre

Une feuille flottante de menu (feuille de panneau, filet, coins de 8 px, ombre de menu flottant, couche des menus), posée par un
portail React à la racine de l’éditeur (`.editeur-cadre`) : hors des panneaux qui défilent, dont le bord la coupait pour axe sous
WebKit, et hors de toute transformation d’un ancêtre ; les événements remontent toujours par l’arbre React (la barre de texte voit
le geste à la souris et rend le focus au texte). Sous le champ ou
au-dessus quand la place y est plus grande, aussi large que le champ et **au moins 340 px** (la barre de texte garde un champ de
13 em, 9,5 em resserrée : la liste s’ouvre plus large, sans sortir de l’écran), 440 px de haut au plus. Elle suit son champ (une
barre qui défile, le clavier virtuel qui réduit l’écran par `visualViewport`) au lieu de se fermer. **Sous 640 px**, elle devient
une **feuille de toute la largeur**, du champ jusqu’au bord de l’écran, des lignes de 40 px. `placerListe` est pur et testé.

### 8. « Toutes les polices » reste, pour les filtres

Décision : l’explorateur de l’ADR-0025 **reste**, pour ce que la liste ne fait pas : filtrer par genre, tracé et source (y compris
montrer toutes les familles d’une source cachée), gérer ses favoris, déposer une fonte ou prendre une police de l’appareil,
« Remplacer partout ». On y va par le lien du pied de la liste, « Filtrer par genre, tracé ou source… » (atteint au clavier par
Tab depuis le champ), ou par le bouton « Toutes les polices » d’avant, qui ne change pas. Fusionner ces filtres dans une liste
déroulante l’aurait alourdie pour tous, au profit d’usages rares (ADR-0006 : le rare dans le panneau).

## Conséquences

- **Octets** : aucun (`ecriture-stable` vert sans `ACTUALISER_REFERENCES`).
- **Fichiers** : nouveaux `zones/ChoixPoliceListe.tsx`, `zones/lignesPolices.ts`, une icône en fin d’`icones.tsx` ;
  `ChoixPolice.tsx` monte la liste à la place du `<select>` (et perd `OptionsPolices` et `groupesPolices`), `BarreTexte.tsx` aussi
  (la seule fonction `ChoixPoliceBarre`) ; `ExplorateurPolices.tsx` reprend les noms courts des sources et la clé de famille de
  `lignesPolices.ts` ; `Fenetre.ts` expose le pas mesuré (`pas`) ; `model/cataloguePolices.ts` gagne l’index des variantes,
  la variante principale mémorisée et `filtrerParNom` ; `io/policesEnLigne.ts` gagne `adressesEnCache` et `varianteEnCache`.
- **Tests** : unitaires (`tests/unit/zones/lignes-polices.test.ts` : groupes et ordre, une ligne par famille, sans index, marque
  selon l’état — livrée, lue, en cache, en cours, absente —, nom accessible, police choisie, recherche, fenêtrage, placement) ; en
  navigateur, `liste-polices.e2e.ts` (panneau et barre, groupes, marque, recherche, choix qui télécharge et marque qui disparaît,
  erreur dite, tout au clavier, liste plus large que le champ compact, 390 px au doigt, mesure d’ouverture), `hors-ligne.e2e.ts`
  (vrai index, réseau coupé : ouvrir, aller au bout, chercher, puis choisir), `polices-en-ligne.e2e.ts` (chez un hôte, ni catalogue
  ni marque sans l’option), `accessibilite-axe.e2e.ts` (liste ouverte et recherche en clair et en sombre, feuille à 390 px). Les tests
  qui choisissaient une police par `selectOption` passent par `tests/e2e/polices.ts` (`choisirPolice`, `valeurPolice` : le champ
  porte `data-valeur`, chaque option `data-police` et `data-etat` ; la liste se cherche dans la page, elle vit à la racine).
- **WebKit** : axe ne savait pas lire le fond d’un texte enveloppé sur deux lignes dans le pied de la liste (« partially overlaps »,
  selon la largeur : au bureau ou à 390 px) ; la légende tient en deux phrases courtes, chacune sur sa ligne, l’icône dans sa
  colonne. Aucune règle écartée, aucun doute admis.
- **Limites, honnêtement** : la recherche ne cherche que par nom (le genre et le tracé restent dans l’explorateur) ; une police du
  cache dont le fichier serait abîmé passerait pour locale et se retéléchargerait au choix ; la feuille plein largeur ne s’ouvre que
  sous 640 px (une tablette au doigt garde la liste flottante, à lignes de 40 px) ; le champ ferme montre le nom écrit, pas dessiné.

## Alternatives écartées

- **Garder le `<select>` et y ajouter le catalogue** : deux mille options natives, sans recherche, sans aperçu, sans marque visible
  (une option ne porte pas d’icône), et lentes à ouvrir.
- **Ouvrir l’explorateur à la place de la liste** : une feuille dans le flux du panneau n’a pas sa place dans la barre de texte, et
  le choix courant (une police déjà là) y coûtait deux gestes.
- **Marquer par la couleur ou l’opacité** : illisible pour qui ne distingue pas la couleur, et une police grisée semblerait
  indisponible alors qu’elle se choisit.
- **Lire le cache pour dessiner les polices gardées** : relire un fichier sans geste contournerait l’ADR-0025 ; seules les clés se
  lisent, pour ne pas marquer à tort.
