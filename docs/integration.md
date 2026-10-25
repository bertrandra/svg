# Embarquer l’éditeur SVG dans une autre page

L’éditeur ne connaît aucun magasin : il reçoit un SVG, un nuancier et une bibliothèque facultatifs, et
rend un SVG quand la personne clique sur « Enregistrer ». Ce guide dit comment l’installer chez vous.

Trois façons, de la plus simple à la plus ouverte :

| | Pour quoi faire | Ce que vous récupérez | Isolation du CSS |
|---|---|---|---|
| **1. L’iframe de la page entière** | Offrir tout l’outil (ouvrir, convertir une image, bibliothèque, éditer) sans code | Rien par programme : la personne télécharge ou copie le résultat | Totale (un document à part) |
| **2. Le bundle `window.EditeurSvg`** | Ajouter un bouton « Éditer » à un dessin que votre page connaît, et recevoir le SVG retouché | Le SVG, par un rappel `onEnregistrer` | Cantonnée à la racine de l’éditeur, avec des limites (voir plus bas) |
| **3. Le composant React** | Votre produit est déjà en React 19 et vous construisez depuis les sources | Le SVG, par la propriété `enregistrer` | Aucune : vous importez les feuilles de style |

Si vous hésitez, prenez le bundle (2) : un fichier, une fonction, pas d’outil de construction.

Tout part d’un build : `npm run construire` écrit dans `dist/` (jamais commité) la page, la bibliothèque,
les fontes et le bundle. `npm run embarquer` ne refait que le bundle.

---

## 1. L’iframe de la page entière

On sert `dist/editeur-svg.html` avec ses fichiers annexes (`vtracer.js`, `bibliotheque.js`, `polices.js`, `polices-catalogue.js`, `polices-apercus.js`) dans le même dossier, et on l’encadre. La page ne contacte aucun autre hôte d’elle-même : ses polices d’interface sont dans le fichier (voir « Les fontes » plus bas), et ses seules requêtes sont les annexes, au premier besoin. La page propose les polices libres téléchargeables (ADR-0025) : une police du catalogue ne se télécharge qu’au moment où la personne la choisit, auprès des serveurs nommés dans « Les serveurs de polices ».

```html
<iframe src="/svg/editeur-svg.html" title="Éditeur SVG" style="width: 100%; height: 720px; border: 0"
        sandbox="allow-scripts allow-same-origin allow-downloads"
        allow="clipboard-write"></iframe>
```

- `allow-same-origin` : sans lui, le navigateur refuse à la page son stockage (brouillon, versions
  nommées) ; elle marche sans, mais ne reprend plus le dessin après un rechargement.
- `allow-downloads` et `clipboard-write` : pour les boutons « Télécharger » et « Copier ».
- La page n’a **pas d’API de message** (`postMessage`) : le résultat sort par ses boutons (SVG, PNG, PDF,
  copie du code). Si votre page doit recevoir le SVG, prenez le bundle.
- `vtracer.js` (traceur, 877 Ko), `bibliotheque.js` et `polices.js` doivent être servis **à côté de `editeur-svg.html`** : la page les
  cherche par leur nom nu, chacun au premier besoin (une vectorisation, la bibliothèque, l’outil Texte).

---

## 2. Le bundle `window.EditeurSvg`

### Installer

Copiez `dist/editeur-svg-embarque.js` sur votre serveur (ou ouvrez la page depuis le disque) et chargez-le
par une balise `<script>` ordinaire. Il pose un objet global, `window.EditeurSvg`, et ne touche à la page
de l’hôte qu’au premier `ouvrir` (une feuille de style, un conteneur).

C’est le même code que la page autonome (`src/zones/EditeurSvg.tsx`), compilé en un script classique : pas
de module, pas de framework requis, React est dedans. Il marche depuis `file://`.

**Navigateurs.** Les versions prises en charge sont dites dans [`navigateurs.md`](navigateurs.md). Sur un navigateur
qui manque d’une API de base, `ouvrir` ouvre une fenêtre d’alerte en français (et `onFermer` est appelé quand on la
ferme) au lieu de casser votre page. Un script que le navigateur ne sait pas analyser ne peut rien dire : si vous
visez des navigateurs très anciens, testez `window.EditeurSvg` avant d’appeler `ouvrir`.

### Exemple minimal

À copier tel quel à côté de `editeur-svg-embarque.js` :

```html
<!doctype html>
<html lang="fr">
<meta charset="utf-8">
<title>Exemple minimal</title>
<img id="apercu" alt="Le dessin" width="200" height="200">
<button id="editer" type="button">Éditer</button>

<script src="editeur-svg-embarque.js"></script>
<script>
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#c81e28"/></svg>';
  var apercu = document.getElementById('apercu');

  function montrer() {
    apercu.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  montrer();

  document.getElementById('editer').onclick = function () {
    window.EditeurSvg.ouvrir({
      svg: svg,
      nom: 'rond',
      onEnregistrer: function (nouveau) { svg = nouveau; montrer(); }
    });
  };
</script>
```

Un exemple complet, avec le nuancier, la bibliothèque, les fontes, le brouillon et tous les rappels, est
dans `exemples/integration.html` ; il se lit tel quel depuis le disque après `npm run construire`.

### Référence

#### `EditeurSvg.ouvrir(options)` → `{ fermer() }`

Ouvre l’éditeur en plein écran, par-dessus la page, et rend aussitôt une poignée. Un seul éditeur à la
fois : un second `ouvrir` pendant qu’un éditeur est ouvert lève une erreur.

| Option | Type | Défaut | Rôle |
|---|---|---|---|
| `svg` | `string` | obligatoire | Le texte du SVG à retoucher, tel quel |
| `onEnregistrer` | `(svg: string) => void` | obligatoire | Reçoit le SVG retouché, **déjà passé par `nettoyerSvg`** |
| `titre` | `string` | `<nom>.svg` | Le titre de la fenêtre |
| `nom` | `string` | `dessin` | Le nom de fichier proposé au téléchargement, sans extension |
| `nuancier` | `{ nom: string, hex: string }[]` | aucun | Les couleurs proposées pour remplir, contourer et recolorer. `hex` : `#rrggbb` ; les codes invalides et les doublons sont écartés |
| `bibliotheque` | `'a-charger'` ou la bibliothèque chargée | aucune | Les formes à insérer. `'a-charger'` : le fichier `bibliotheque.js` se charge au premier besoin. Sans l’option, la section n’apparaît pas |
| `baseAnnexes` | `string` | `''` | Le dossier où chercher `bibliotheque.js` et `polices.js` (voir « Les fichiers à servir ») |
| `fermerApresEnregistrer` | `boolean` | `true` | Fermer l’éditeur dès que le dessin est enregistré, comme le fait la page |
| `libelleEnregistrer` | `string` | `'Enregistrer'` | Le libellé du bouton qui rend le dessin à `onEnregistrer` (« Valider », « Mettre à jour le logo »…). Une ligne, de 1 à 40 caractères, blancs du bord retirés. La confirmation d’abandon, le menu Fichier et la visite guidée le reprennent. La page autonome dit « Terminer » |
| `onFermer` | `() => void` | | Appelée **une fois**, quand l’éditeur se ferme, quelle qu’en soit la cause |
| `onBrouillon` | `(svg: string) => void` | | Reçoit le SVG du moment, une seconde après la dernière modification, et à chaque `Ctrl+S`. Rendre `false` dit que le brouillon n’a pas été gardé : l’éditeur l’annonce au lieu de « Brouillon gardé. » |
| `stockage` | `{ lire, ecrire, retirer }`, `false` ou `null` | le `localStorage` de votre page | Où l’éditeur garde les versions nommées (voir « Stockage » plus bas). `false` ou `null` : rien n’est gardé nulle part |
| `visite` | `boolean` | `false` | L’accueil guidé (ADR-0019) : la visite de l’éditeur en cinq étapes s’ouvre d’elle-même à la première ouverture (puis se rejoue du menu Aide), et les repères de première rencontre s’affichent. Le dessin se récupère alors par « Enregistrer ». Ce qui a été vu se garde dans `stockage` (clé `svg.guide`) ; sans stockage, une fois par chargement de la page |
| `policesEnLigne` | `boolean` | `false` | Les polices libres téléchargeables (ADR-0025) : l’outil Texte propose « Toutes les polices » (plus de 2 000 familles libres, recherche, filtres, favoris, polices du document). Une police se télécharge **seulement quand la personne la choisit** (ouvrir la liste, chercher, voir les aperçus ne fait partir aucune requête) ; chaque fichier est vérifié par son empreinte sha256 avant d’être lu. Faux ou absent : aucune requête, seules les dix fontes de `polices.js` se proposent. Vrai demande de servir aussi `polices-catalogue.js` (et, facultatif, `polices-apercus.js`) sous `baseAnnexes`, et d’autoriser les serveurs de polices dans votre politique de sécurité (voir « Les serveurs de polices ») |

La poignée rendue : `fermer()` ferme l’éditeur sans rien enregistrer et sans confirmation ; un second
appel est sans effet.

Une option qui ne convient pas lève un `TypeError` (en français) : `onEnregistrer` manquante, `svg` qui
n’est pas un texte, etc. Un SVG que l’éditeur refuse (texte, image, dégradé, masque, découpe, filtre,
un cycle de `<use>` ou un renvoi externe) ne lève rien : l’éditeur s’ouvre sur un message qui nomme le refus, avec un bouton « Fermer »
(et `onFermer` est appelée). Pour le savoir avant, demandez `estEditable`.

#### `EditeurSvg.estEditable(svg)` → `boolean`

Vrai quand l’éditeur sait ouvrir ce SVG : un texte, sans image enveloppée, que le moteur sait lire sans le
refuser. Faux pour tout autre argument. Utile pour griser un bouton « Éditer ».

#### `EditeurSvg.version` → `string`

La version du paquet (`package.json`) qui a construit le bundle.

### Ce qui est enregistré, et quand

- **Rien n’est rendu sans « Enregistrer »** (ou le libellé que vous donnez par `libelleEnregistrer`) : le bouton de la
  barre, Fichier → Enregistrer, ou ce même choix dans la confirmation d’abandon (qui rend puis ferme). `onEnregistrer`
  reçoit alors le SVG, et lui seul. Sans modification (ni du dessin, ni de la machine choisie), le bouton est grisé et dit
  pourquoi.
- **`Ctrl+S` (ou `⌘S`) ne rend rien et ne ferme jamais l’éditeur** : il garde le brouillon (`onBrouillon`, tout de suite) et
  le dit (« Brouillon gardé. »). Sans `onBrouillon`, il dit que rien n’est gardé ici et nomme le bouton qui rend le dessin.
  *Changement :* jusqu’à cette version, `Ctrl+S` appelait `onEnregistrer` (et fermait l’éditeur avec
  `fermerApresEnregistrer: true`) ; l’habitude de `Ctrl+S` toutes les minutes éjectait la personne de l’éditeur.
- Le SVG rendu est le dessin **réécrit** (ADR-0001) : à plat, en chemins absolus, coordonnées au
  millième ; les groupes, classes et feuilles de style de l’entrée disparaissent, le rendu reste le même.
  Les formes masquées sont retirées, et le panneau le dit. Un SVG réécrit aujourd’hui l’est à l’identique
  demain : un changement de cette écriture est un événement de version majeure.
- Le SVG passe par `nettoyerSvg` : il porte toujours `xmlns` et `viewBox`, et ne garde ni script, ni
  `foreignObject`, ni gestionnaire d’évènement (`onload=`…), ni référence externe (`href`, `url()`,
  `@import` hors `#ancre` et images `data:`), ni `javascript:`.
- **Une forme de la bibliothèque porte sa provenance.** Si le dessin contient au moins une forme visible venue de la
  bibliothèque (game-icons.net, CC BY 3.0), le SVG rendu s’ouvre sur un élément `<metadata>` qui nomme la source et
  la licence, et chaque `<path>` concerné porte `data-origine="game-icons:<identifiant>"` ; l’éditeur les retrouve à la
  relecture. Sans forme de la bibliothèque, rien de tout cela n’est écrit. Voir « Attribution et licences » plus bas.
- Un dessin sans aucune forme visible n’est pas enregistré : l’éditeur le dit et `onEnregistrer` n’est pas
  appelée.
- Avec `fermerApresEnregistrer: false`, l’éditeur reste ouvert après l’enregistrement (on peut enregistrer
  plusieurs fois). Le fermer ensuite par l’éditeur redemande confirmation, car il ne sait pas que le dessin
  est déjà gardé ; fermez-le plutôt par la poignée.
- `onBrouillon` n’est pas un enregistrement : c’est le SVG du moment, de quoi reprendre après un
  rechargement. Il n’est **pas** passé par `nettoyerSvg`. Appelée seulement quand le dessin a changé (une seconde après,
  ou à `Ctrl+S`).
- **Récupérer un fichier** sans rien rendre à votre page : « Télécharger le SVG » de la barre (en contexte Cricut, « Exporter
  pour Cricut ») et « Autres formats » à côté (PDF, PNG, JPEG, WebP, EPS, DXF, SVG de découpe, copie du code). Ce sont des
  téléchargements pour la personne, pas des enregistrements : `onEnregistrer` n’est pas appelée.
- « Fermer » avec des modifications non enregistrées demande confirmation : « Abandonner », « Enregistrer » (votre
  libellé : rend le dessin puis ferme, jamais l’un sans l’autre) ou « Continuer l’édition ».

Les rappels s’exécutent dans les évènements de l’éditeur ; une exception levée dans l’un d’eux n’est pas
rattrapée par l’éditeur.

### Les fichiers à servir

| Fichier | Taille | Quand | Rôle |
|---|---|---|---|
| `editeur-svg-embarque.js` | 717 Ko (227 Ko compressé) | toujours | L’éditeur, ses styles, React |
| `bibliotheque.js` | 6,6 Mo (2,7 Mo compressé) | si vous passez `bibliotheque` | 4 134 formes de game-icons.net, chargées d’elles-mêmes quand la personne ouvre la section « Bibliothèque de formes » (aucun bouton « Charger ») |
| `bibliotheque-<source>.js` | de 0,9 à 3,6 Mo chacun (voir ci-dessous) | facultatifs, si vous passez `bibliotheque` | Les cinq bibliothèques libres (Material, Phosphor, Tabler, Healthicons, Lucide), chacune chargée quand la personne choisit sa pastille « Source » (ou « Toutes », ou une nature qu’elle propose). Un fichier absent se dit dans le panneau ; le reste de la bibliothèque marche |
| `polices.js` | 2,7 Mo (1,2 Mo compressé) | si vous gardez l’outil Texte, ou si votre `svg` peut contenir du texte | Dix fontes libres (OFL, dont une à trait unique), chargées quand la personne ouvre l’outil Texte (ou retape un texte vivant), ou à l’ouverture d’un `svg` qui porte un `<text>` quand vous donnez `baseAnnexes` : ses lettres deviennent des formes (une police absente est remplacée, et l’éditeur le dit). Sans `baseAnnexes` (et sans `polices.js` déjà posé dans la page), ou si le fichier manque, un tel `svg` reste refusé comme avant (« Ce SVG contient du texte… ») : aucune requête n’est tentée pour rien |
| `polices-catalogue.js` | 1,4 Mo (0,7 Mo compressé) | seulement avec `policesEnLigne: true` | L’index des polices libres téléchargeables : noms, catégories, licences, versions épinglées et empreintes sha256. **Il ne contient aucune fonte.** Chargé quand la personne ouvre « Toutes les polices » (ou rouvre un texte composé dans une police du catalogue). Sans lui, le panneau le dit et propose les fontes livrées |
| `polices-apercus.js` | 1,9 Mo (0,64 Mo compressé) | facultatif, avec `policesEnLigne: true` | Les aperçus des polices du catalogue (ADR-0026) : le nom de chaque famille dessiné dans sa propre fonte, en contours, dans un codage compact. **Il ne contient aucune fonte** ni aucune autre lettre. Chargé quand la personne ouvre « Toutes les polices », pour que la liste montre l’allure de chaque police sans rien télécharger. Sans lui, le panneau le dit et écrit les noms dans la police de l’interface ; les fontes livrées et celles déjà téléchargées se dessinent toujours |
| `MENTIONS.txt` | 18 Ko | **toujours, avec le bundle** | Le copyright et la licence de chaque composant tiers redistribué (voir « Attribution et licences ») |

- **`vtracer.js` n’est pas nécessaire** : l’éditeur retouche un SVG, il ne vectorise pas, et rien dans
  son interface n’appelle le traceur. Le bundle n’en contient que le petit chargeur (qui poserait une
  balise `<script>` vers `vtracer.js`, sous `baseAnnexes` comme les autres) ; la conversion d’image reste
  dans la page entière, qui, elle, charge `vtracer.js` (877 Ko, 369 Ko compressé) à côté d’elle.
- Les deux annexes sont des scripts classiques (`window.__bibliothequeSvg`, `window.__policesSvg`) que
  l’éditeur ajoute par une balise `<script>` quand il en a besoin, pas par `fetch` : cela marche depuis
  `file://`. Leurs noms sont fixes.
- Par défaut elles se cherchent **à côté de la page de l’hôte** (le chemin relatif se résout contre la
  page, pas contre le bundle). Si vous les rangez ailleurs, donnez `baseAnnexes`, relative à la page ou
  absolue :

  ```js
  window.EditeurSvg.ouvrir({ svg: svg, onEnregistrer: garder,
    bibliotheque: 'a-charger', baseAnnexes: '/static/svg/' });   // /static/svg/bibliotheque.js, /static/svg/polices.js
  ```

  La base se lit au chargement du fichier : une fois `bibliotheque.js` arrivé, une autre base n’y change
  rien. Un fichier introuvable se dit dans le panneau (« … est introuvable à côté de la page »).
- Les bibliothèques libres pèsent : `bibliotheque-mdi.js` 3,6 Mo (7 126 formes pleines), `bibliotheque-tabler.js` 2,8 Mo
  (5 698 formes, en ligne et pleines), `bibliotheque-healthicons.js` 1,9 Mo (1 466), `bibliotheque-ph.js` 1,8 Mo (2 848),
  `bibliotheque-lucide.js` 0,9 Mo (1 861 en ligne). Elles posent `window.__bibliothequeSvgMdi`, `…Ph`, `…Tabler`,
  `…Healthicons`, `…Lucide`, et se cherchent sous la même `baseAnnexes`.
- Si vous livrez `bibliotheque.js`, créditez **game-icons.net** (licence CC BY 3.0) ; les fontes de
  `polices.js` sont sous licence SIL OFL 1.1 ; les bibliothèques libres sont sous MIT, ISC ou Apache 2.0, dont la notice est
  dans `MENTIONS.txt`. Voir « Attribution et licences » ci-dessous.
- Servez les `.js` avec un type `text/javascript` ; la compression (gzip, brotli) divise les annexes par
  deux et demi.

### L’isolation du CSS

L’éditeur est écrit pour une page entière (`body`, `button`, `*`, `:root`). Le bundle ne vous les impose
pas : à l’ouverture, il pose **une** feuille `<style id="editeur-svg-embarque-style">` dont chaque règle
est reprise sous `.editeur-svg`, la racine que l’éditeur ajoute à `<body>` :

- les jetons de couleur (`--table`, `--panneau`, `--encre`, `--cyan`…) se posent sur cette racine, pas sur
  `:root` ; les règles de `body`, `html` et `*` ne touchent que l’éditeur ;
- les `rem` deviennent des pixels (16 px le rem) : un `html { font-size: 62.5% }` chez vous ne rapetisse
  pas l’éditeur ;
- les noms d’animation sont préfixés (`editeur-apparition`…) ;
- à la racine, l’héritage de l’hôte est remis à zéro (alignement, espacement des lettres, casse…), et les
  éléments dedans reprennent le style du navigateur avant celui de l’éditeur : un `button { text-transform:
  uppercase }` ou un `h3 { … }` de l’hôte n’entre pas ;
- **thème** : clair ou sombre selon `prefers-color-scheme`, et si l’hôte pose `data-theme="light"` ou
  `data-theme="dark"` sur `<html>`, c’est lui qui décide, comme dans la page entière.

Ce que cette isolation ne couvre pas :

- Une règle de l’hôte qui porte une classe ou un identifiant (`button.lien`, `.carte button`,
  `#app button`) s’applique encore aux éléments de l’éditeur qu’elle vise, pour les propriétés que
  l’éditeur ne fixe pas lui-même. Seules les règles d’élément nu (`button`, `h3`, `p`) sont neutralisées.
  Méfiez-vous surtout des classes génériques : `.discret`, `.primaire`, `.danger`, `.icone`, `.section`,
  `.aide`… sont aussi des classes de l’éditeur.
- Le dessin (`<svg>`) n’est pas remis à zéro : une règle d’hôte sur `svg { … }` s’y applique (sur les
  icônes de la barre aussi). Ses attributs (`fill="…"`) en seraient effacés.
- **La pile d’empilement** : l’éditeur est en `position: fixed; z-index: 1000`, ses menus à 1100. Un
  élément de l’hôte au-dessus de 1000 (bandeau de cookies, en-tête collant) passe devant.
- **Les fontes** : la page entière embarque *Instrument Sans* et *IBM Plex Mono* (sous-ensemble latin, SIL OFL 1.1) dans son
  propre fichier, sans rien demander à un serveur ; le bundle, lui, n’en embarque aucune (pas de requête cachée, pas de
  poids ajouté). Sans elles, l’éditeur retombe sur *Helvetica Neue*, *Arial* et `ui-monospace`. Pour retrouver la même
  typographie, servez-les vous-même, depuis votre origine (le paquet npm `@fontsource/instrument-sans` et
  `@fontsource/ibm-plex-mono` fournit les fichiers WOFF2) plutôt que depuis un service tiers, qui verrait l’adresse de vos
  visiteurs :

  ```html
  <style>
    /* Une déclaration par graisse : 400, 500, 600 et 700 pour Instrument Sans, 400 et 500 pour IBM Plex Mono. */
    @font-face { font-family: "Instrument Sans"; font-weight: 400; font-display: swap; src: url(/static/polices/instrument-sans-latin-400-normal.woff2) format("woff2"); }
    @font-face { font-family: "IBM Plex Mono"; font-weight: 400; font-display: swap; src: url(/static/polices/ibm-plex-mono-latin-400-normal.woff2) format("woff2"); }
  </style>
  ```

- **Le focus** : à l’ouverture l’éditeur prend le focus (sur sa toile) et rend inertes (`inert`) les autres
  éléments directs de `<body>`, pour que ni Tab ni un lecteur d’écran n’aillent derrière lui ; il les met aussi
  en `visibility: hidden` (en style en ligne, remis tel quel à la fermeture) : l’éditeur les recouvre d’un fond
  plein, et un élément inerte resterait sinon dans la pile que les outils d’audit lisent derrière chaque texte.
  À la fermeture il retire ce qu’il a posé (un élément déjà `inert` chez vous le reste) et redonne le focus à
  l’élément de votre page qui l’avait à l’ouverture, en général votre bouton « Éditer » (s’il existe
  encore ; sinon reprenez-le dans `onFermer`). L’éditeur est un `role="dialog" aria-modal="true"`, posé
  lui-même directement dans `<body>` : un conteneur unique de votre page (`<div id="app">`) devient inerte
  tout entier, sans que vous ayez rien à faire.
- **Le défilement** : `body` reçoit `overflow: hidden` tant que l’éditeur est ouvert, et le retrouve à la
  fermeture.
- **Les raccourcis** : tant que l’éditeur est ouvert, `Ctrl+S` (garder le brouillon), `Ctrl+Z`, `Suppr`, les flèches (seules, avec `Alt`
  ou avec `Ctrl`), `0` et `D` (ajuster), etc. sont écoutés sur `window` ; `Tab`, `Entrée`, `Page suivante` et `Page précédente` ne le sont que sur la toile. Ne laissez pas votre page y réagir aussi.

Besoin d’une isolation totale (feuilles de l’hôte qui visent des classes génériques, règles `svg`) :
prenez l’iframe (1).

### Attribution et licences

Ce que vous redistribuez en servant ces fichiers a des obligations de licence, que l’éditeur remplit en partie seul.

**Ce que vous devez faire**

- **Servir `MENTIONS.txt` avec le bundle** (`dist/MENTIONS.txt`, le même texte que `THIRD-PARTY-NOTICES.md` du dépôt) et
  le laisser accessible : les licences MIT, SIL OFL et Apache des composants (React, opentype.js, polygon-clipping, les
  fontes…) demandent que leur copyright et leur texte accompagnent chaque redistribution. Ne minifiez pas le bundle d’une façon
  qui retire ses commentaires de licence.
- **Afficher les crédits des formes de la bibliothèque** si vous livrez `bibliotheque.js` : la licence CC BY 3.0 exige de
  nommer la source (« game-icons.net et ses contributeurs »), de donner sa licence et son adresse. L’éditeur le fait dans sa
  boîte **« À propos et crédits »** (menu Fichier), qui reste accessible tant que l’éditeur est ouvert ; si votre produit présente
  lui-même ces formes (une vitrine, un export, une page de mentions légales), reprenez la mention vous-même :

  > Contient des formes dont la source est game-icons.net et ses contributeurs (https://game-icons.net), sous licence CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/).

- **Conserver la mention quand vous publiez le dessin.** Le SVG que `onEnregistrer` vous rend la porte dans son élément
  `<metadata>` ; ne la retirez pas, et ne rasterisez pas le dessin sans la citer à côté de l’image.

**Ce que l’éditeur fait seul**

| Sortie | Quand le dessin contient une forme de la bibliothèque |
|---|---|
| SVG enregistré, `onEnregistrer`, téléchargement, « Copier le code SVG » | Un `<metadata>` en tête avec la mention et la liste des origines, et `data-origine` sur chaque forme créditée |
| PDF vectoriel | La mention dans le champ `/Subject` des informations du document |
| SVG de découpe | La mention en commentaire XML (ce fichier ne garde que des contours) |
| PNG | **Rien** : un PNG ne porte pas de métadonnées ici. Citez la source à côté de l’image |

La provenance suit la forme : dupliquée, collée, séparée, ou réunie à une autre (combiner, booléens, regroupement ; l’union des
origines est gardée), elle reste. Elle disparaît avec la dernière forme créditée du dessin, et alors la mention n’est plus écrite.
Le SVG que vous passez à `ouvrir` et qui porte déjà ces marques les garde. Un dessin qui ne contient aucune forme de la
bibliothèque s’écrit exactement comme avant. Ce que l’éditeur écrit pour un dessin qui en contient a changé avec cette version
(`<metadata>` et `data-origine` en plus), ce qui est un événement de version majeure.

**Les polices téléchargées** (`policesEnLigne: true`, ADR-0025) ne sont pas redistribuées : la personne télécharge le
fichier depuis sa source, et le dessin n’en contient que les contours des lettres (permis par chaque licence admise : OFL,
Apache 2.0, UFL, CC0 et l’ITF Free Font License de Fontshare, affichée avec le badge « ITF »). `MENTIONS.txt` ne les liste donc
pas ; `polices-catalogue.js` n’est qu’un index (noms, licences, empreintes), et `polices-apercus.js` ne porte que le nom de
chaque famille dessiné dans sa fonte (un spécimen, permis par chaque licence admise ; ADR-0026). La boîte « À propos et crédits » nomme la source et
la licence de chaque police téléchargée qu’emploie le dessin.

**Ce que l’éditeur ne sait pas faire** : le jeu de données ne dit pas qui a dessiné chaque icône, l’éditeur ne peut donc pas
créditer un auteur par forme ; le crédit est celui de la source. Les licences du projet lui-même sont l’affaire de son
propriétaire et ne sont pas couvertes ici.

### Sécurité

Le modèle de menaces complet (portes d’entrée, garanties, bornes, preuves) est dans [`securite.md`](securite.md).
Pour un hôte, l’essentiel :

- **Ce qu’on donne à `ouvrir` est borné et vérifié** : un `svg` de plus de 64 millions de caractères, un titre de plus
  de 500 caractères, une `baseAnnexes` en `javascript:`, `data:`, `blob:`, `vbscript:` ou `about:`, une `bibliotheque`
  sans liste `entrees` lèvent un `TypeError` en français ; un `nuancier` mal formé est écarté entrée par entrée.
  Un SVG trop profond (plus de 1 024 niveaux), trop gros ou trop chargé de tracé ne lève rien : l’éditeur s’ouvre sur
  un refus nommé (voir `securite.md`, § 4).
- **Ce que l’éditeur lit dans votre stockage est validé** (types, longueurs, clés de prototype retirées) : une valeur
  que vous n’avez pas écrite est ignorée, jamais une exception.

- **Le SVG qu’on vous rend est nettoyé** (`nettoyerSvg`, voir plus haut) et, surtout, **réécrit** : l’éditeur
  ne garde que des chemins et des peintures, tout le reste de l’entrée est abandonné ou refusé. Il n’y
  reste ni script, ni `foreignObject`, ni gestionnaire d’évènement, ni ressource externe.
- **Ce que l’hôte doit quand même faire** :
  - **Afficher par `<img>`** (ou `background-image`), comme dans l’exemple : le navigateur n’exécute
    aucun script dans un SVG chargé ainsi. Évitez `innerHTML`, `<object>` et `<iframe>` pour un SVG qui
    vient d’un tiers ; en ligne dans votre page, ses `id` et ses styles se mêleraient aux vôtres.
  - **Ne pas faire confiance au SVG qu’on donne à `ouvrir`** : l’éditeur le relit en formes sans jamais
    l’insérer dans votre page, mais ce que votre page en fait *avant* (l’afficher, le stocker) est à vous.
  - **Valider côté serveur** ce que le navigateur vous renvoie : `onEnregistrer` donne du texte que
    n’importe quel script de la page peut aussi fabriquer. Nettoyez-le de nouveau, limitez sa taille,
    répondez-en par un type `image/svg+xml` avec `Content-Security-Policy: default-src 'none'; style-src
    'unsafe-inline'; sandbox` quand vous le servez.
  - **Ne pas prendre `onBrouillon` pour un enregistrement** : il n’est pas nettoyé.
- **Le texte vivant** (ADR-0022) : un texte créé dans l’éditeur s’écrit en contours (`<path>`), suivis d’attributs
  `data-ed-texte`, `data-ed-police`… qui permettent de le rouvrir comme texte. Le texte y est **encodé en pourcentage** (lettres
  ASCII et chiffres seuls en clair) : votre nettoyage peut garder ces attributs tels quels, ou les retirer (le dessin ne change
  pas, le texte n’est plus modifiable). Aucun fichier de police n’est écrit : une fonte déposée n’y laisse que son empreinte.
- **Le texte posé sur ou dans une forme** (ADR-0031) : un texte vivant peut porter en plus `data-ed-disposition` (`sur` ou
  `dans`), ses réglages (`data-ed-depart`, `data-ed-cote`, `data-ed-repartir`, `data-ed-marge`, `data-ed-ajuster`,
  `data-ed-justifier`) et le lien vers sa forme : `data-ed-forme`, le rang de la forme parmi les chemins du fichier, ou, pour une
  forme masquée, son tracé encodé en pourcentage (`data-ed-forme-d`, et `data-ed-forme-regle="evenodd"`). Ce ne sont que des
  nombres, des mots fixes et du texte encodé ; les contours du `<path>` restent la vérité du dessin. Votre nettoyage peut les
  garder, ou les retirer (le texte n’est plus lié à sa forme, ou plus modifiable du tout).
- **Couper ou écrire** (ADR-0028) : en contexte Cricut seulement, un `<path>` peut porter `data-ed-operation="decoupe"` ou
  `data-ed-operation="ecriture"`, quand la personne a choisi pour cette forme autre chose que ce que l’éditeur propose (une forme
  pleine se coupe, un trait seul s’écrit au stylo). L’attribut n’a que ces deux valeurs ; votre nettoyage peut le garder, ou le
  retirer (la forme reprend l’opération proposée). Un SVG sans contexte Cricut n’en porte jamais, et aucune option d’hôte ne change.
- **Stockage** : l’éditeur garde les **versions nommées** (trente au plus, celles du panneau « Versions
  nommées ») et rien d’autre (pas de brouillon : c’est à vous de le garder par `onBrouillon`). **Par défaut**,
  elles vont dans le `localStorage` de **votre origine**, sous la clé `svg.versions`, partagées par tous les
  dessins de l’origine et lisibles par tout script de la page. L’option `stockage` change cela :

  ```js
  window.EditeurSvg.ouvrir({ svg: svg, onEnregistrer: garder, stockage: false });   // rien n'est gardé nulle part

  window.EditeurSvg.ouvrir({ svg: svg, onEnregistrer: garder, stockage: {          // ou votre propre magasin
    lire:    function (cle) { return JSON.parse(maBase.getItem('editeur:' + cle) || 'null'); },
    ecrire:  function (cle, valeur) { maBase.setItem('editeur:' + cle, JSON.stringify(valeur)); return true; },
    retirer: function (cle) { maBase.removeItem('editeur:' + cle); }
  } });
  ```

  Un stockage d’hôte a trois verbes : `lire(cle)` rend la valeur (du JSON déjà décodé) ou `null`, `ecrire(cle,
  valeur)` rend vrai si elle est gardée, `retirer(cle)` l’oublie. Les clés écrites sont `svg.versions`, `svg.guide`
  avec `visite: true` (la visite vue, les repères refermés), et avec `policesEnLigne: true` `svg.polices.favoris` et
  `svg.polices.recentes` ; une ancienne clé `svg.polices.consentement` (l’accord par serveur, retiré) est effacée. Si l’un
  des verbes lève une exception, l’éditeur la rattrape et lit le stockage comme refusé. Le stockage est un
  confort : refusé, absent ou plein, tout marche sans lui, les versions vivant alors le temps de l’éditeur.
- **Aucun réseau sans geste** : par défaut l’éditeur n’appelle aucun serveur. Les seules requêtes sont les balises `<script>`
  des annexes, et seulement si la personne ouvre la bibliothèque ou l’outil Texte. Avec `policesEnLigne: true`, une police
  du catalogue se télécharge auprès d’un serveur de polices, et seulement quand la personne la choisit (voir ci-dessous).
- **Les serveurs de polices** (seulement avec `policesEnLigne: true`, et seulement au choix d’une police) :
  `cdn.jsdelivr.net` (paquets npm `@fontsource/*` à une version épinglée), `fonts.bunny.net` (le même fichier, en repli si
  jsDelivr ne répond pas ou sert un autre fichier), `gitlab.com` (fontes de Velvetyne, par l’API au commit épinglé) et
  `cdn.fontshare.com` (fontes de Fontshare). Le pied de « Toutes les polices » dit que choisir une police non livrée la télécharge depuis sa source. Ce qui part : une requête GET du
  fichier demandé, sans cookie (`credentials: 'omit'`) ni page d’origine (`referrerPolicy: 'no-referrer'`) ; le serveur voit
  l’adresse IP, comme pour toute page. Chaque fichier est vérifié par son empreinte sha256 (`crypto.subtle`, qui demande un
  contexte sécurisé : https ou localhost) contre l’index avant d’être lu ; une empreinte fausse est refusée et dite. Un fichier
  vérifié se garde dans Cache Storage (`svg-polices-v1`), un confort. La police téléchargée n’est jamais écrite dans le SVG :
  seulement les contours des lettres, et `data-ed-police="c-…"` avec sa version pour la recomposer à l’identique.
- **Politique de sécurité du contenu** : vérifiée avec
  `default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src data: blob:`. Avec `policesEnLigne: true`, ajoutez
  `connect-src https://cdn.jsdelivr.net https://fonts.bunny.net https://gitlab.com https://cdn.fontshare.com` : sans elle, le
  téléchargement échoue et l’éditeur le dit. Le
  `style-src 'unsafe-inline'` est nécessaire (la feuille est ajoutée à l’exécution et l’éditeur pose des
  styles en ligne) ; `img-src data:` pour les vignettes de la bibliothèque, `blob:` pour les téléchargements.
  Sans `style-src 'unsafe-inline'`, l’éditeur s’ouvre mais sans mise en forme.

---

## 3. Le composant React

Si votre produit est en React 19, importez le composant depuis les sources (ce dépôt en sous-module, ou
copié) :

```tsx
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BoutonEditerSvg } from './svg/src/zones/EditeurSvg.js';
import { cssJetons } from './svg/src/styles/jetons.js';
import './svg/outils/editeur-svg/base.css';
import './svg/outils/editeur-svg/editeur.css';

// Les variables de couleur viennent du registre de jetons : on pose le CSS qu'il génère.
const jetons = document.createElement('style');
jetons.textContent = cssJetons();
document.head.append(jetons);

const DEPART = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#c81e28"/></svg>';

function Application() {
  const [svg, poserSvg] = useState(DEPART);
  return (
    <>
      <img alt="Le dessin" width={200} src={'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)} />
      <BoutonEditerSvg svg={svg} titre="rond.svg" nom="rond" enregistrer={poserSvg} />
    </>
  );
}

const racine = document.getElementById('racine');
if (racine) createRoot(racine).render(<Application />);
```

`BoutonEditerSvg` est le bouton « Éditer le SVG en plein écran » (grisé quand le SVG enveloppe une image)
et l’éditeur qu’il ouvre, refermé après l’enregistrement. Pour piloter l’ouverture vous-même, montez
`EditeurSvg` quand vous voulez :

```tsx
import { EditeurSvg, type ProprietesEditeur } from './svg/src/zones/EditeurSvg.js';

{ouvert ? <EditeurSvg svg={svg} titre="rond.svg" nom="rond" fermer={() => poserOuvert(false)}
                      enregistrer={s => { poserSvg(s); poserOuvert(false); }} /> : null}
```

### `ProprietesEditeur`

| Propriété | Type | Rôle |
|---|---|---|
| `svg` | `string` | Le SVG à retoucher, tel quel |
| `titre` | `string` | Le titre de la fenêtre |
| `nom` | `string` | Le nom de fichier proposé au téléchargement, sans extension |
| `nuancier?` | `readonly Teinte[]` (`{ nom, hex }`) | Les couleurs proposées |
| `bibliotheque?` | `Bibliotheque \| 'a-charger'` | Les formes à insérer ; `'a-charger'` charge `bibliotheque.js` au premier besoin |
| `fermer` | `() => void` | Appelée quand la personne ferme (après confirmation s’il y a des modifications) |
| `enregistrer` | `(svg: string) => void` | Reçoit le SVG retouché, déjà nettoyé. Le composant ne se ferme pas de lui-même : c’est à vous |
| `brouillon?` | `(svg: string) => unknown` | Reçoit le SVG du moment, une seconde après la dernière modification, et à chaque `Ctrl+S` (qui ne ferme jamais). Rendre `false` : le brouillon n’a pas été gardé, et l’éditeur le dit |
| `libelleEnregistrer?` | `string` | Le libellé du geste qui appelle `enregistrer` (défaut « Enregistrer ») ; la page dit « Terminer ». L’éditeur ne devine pas où il est : il reçoit son libellé |
| `fermerSansModification?` | `boolean` | Le geste de fin reste actif sans modification et appelle alors `fermer` (rien n’est réécrit) ; faux par défaut : il est grisé et dit pourquoi. La page le pose |
| `stockage?` | `Stockage \| null` (`src/io/stockage.ts`) | Où garder les versions nommées. **Absent ou `null` : rien n’est gardé**, le composant ne connaît aucun magasin. Pour le `localStorage` du navigateur, passez `stockageNavigateur()` ; pour la mémoire, `stockageMemoire()` |
| `guide?` | `OptionsGuide \| null` (`src/zones/contexteGuide.tsx`) | L’accueil guidé (ADR-0019). **Absent : ni visite ni repère.** `{ demarrer: 'si-nouveau', recuperer: 'enregistrer' }` est ce que fait le bundle avec `visite: true` ; `demarrer: 'toujours'` ouvre la visite à chaque montage, `'jamais'` la laisse au menu Aide |
| `policesEnLigne?` | `boolean` | Les polices libres téléchargeables (ADR-0025), au choix d’une police par la personne. **Absent : faux**, aucune requête ; la page autonome le donne vrai |
| `production?` | `ChoixProduction` (`src/model/contextes.ts`) | Le contexte de production de départ (ADR-0013), quand le SVG ne porte aucune marque `data-ed-*` : par exemple `{ contexte: 'cricut', machine: 'maker', tapis: '12x12', materiau: 'papier-cartonne', procede: 'decoupe', unite: 'mm' }`. Une marque du SVG l’emporte toujours ; rien ne s’écrit tant que la personne ne modifie pas le dessin. La page le pose pour le public « machine » de son accueil (ADR-0024) ; le bundle ne l’expose pas |

À savoir, côté React :

- **Les styles** : le CSS des jetons (`cssJetons()`, `src/styles/jetons.ts`, ADR-0007 : les variables de
  couleur), `base.css` (les règles d’élément) et `editeur.css` (l’éditeur) sont ceux de la page, non
  cantonnés : `base.css` règle `body`, `button`, `*`.
  Pour les cantonner comme le fait le bundle, passez-les par `porterCss` et `remEnPixels`
  (`src/util/cssPortee.ts`) avant de les poser, ou choisissez le bundle (2).
- **Les fichiers annexes** : `bibliotheque.js` et `polices.js` à côté de la page, ou
  `definirBaseAnnexes('/static/svg/')` (`src/io/annexes.ts`) avant le premier chargement.
- **vtracer** : rien à configurer. `EditeurSvg` importe `io/image.ts` (l’export PNG), qui connaît le
  chargeur du traceur ; celui-ci ne pose une balise `<script>` vers `vtracer.js` que si une vectorisation
  est demandée, ce que l’éditeur ne fait jamais. Le WebAssembly n’entre pas dans votre bundle.
- **Les dépendances** : `react`, `react-dom`, `opentype.js` et `polygon-clipping` (versions de
  `package.json`).
- **Le moteur seul** : `src/engine/editionSvg.ts` (lire, modifier, écrire un dessin) s’utilise sans React
  ni DOM.

---

## Vérifier votre installation

1. Ouvrez la console : `window.EditeurSvg.version` rend un texte, `window.EditeurSvg.estEditable(svg)` vrai.
2. `ouvrir` : l’éditeur couvre la page, la barre porte votre `titre`.
3. Modifiez une forme, « Enregistrer » (ou votre `libelleEnregistrer`) : `onEnregistrer` reçoit un texte qui commence par
   `<svg `. `Ctrl+S`, lui, n’appelle que `onBrouillon`.
4. Ouvrez la bibliothèque et l’outil Texte : si un fichier annexe est introuvable, le panneau le dit et
   l’onglet Réseau du navigateur montre l’adresse demandée (corrigez `baseAnnexes`).
5. `exemples/integration.html` fait tout cela ; si lui marche et pas votre page, comparez les balises
   `<script>` et le dossier des annexes.
