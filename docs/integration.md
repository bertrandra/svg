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

On sert `dist/editeur-svg.html` avec ses trois fichiers annexes (`vtracer.js`, `bibliotheque.js`, `polices.js`) dans le même dossier, et on l’encadre :

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
| `onFermer` | `() => void` | | Appelée **une fois**, quand l’éditeur se ferme, quelle qu’en soit la cause |
| `onBrouillon` | `(svg: string) => void` | | Reçoit le SVG du moment, une seconde après la dernière modification |
| `stockage` | `{ lire, ecrire, retirer }`, `false` ou `null` | le `localStorage` de votre page | Où l’éditeur garde les versions nommées (voir « Stockage » plus bas). `false` ou `null` : rien n’est gardé nulle part |

La poignée rendue : `fermer()` ferme l’éditeur sans rien enregistrer et sans confirmation ; un second
appel est sans effet.

Une option qui ne convient pas lève un `TypeError` (en français) : `onEnregistrer` manquante, `svg` qui
n’est pas un texte, etc. Un SVG que l’éditeur refuse (texte, image, dégradé, masque, découpe, filtre,
`<use>`) ne lève rien : l’éditeur s’ouvre sur un message qui nomme le refus, avec un bouton « Fermer »
(et `onFermer` est appelée). Pour le savoir avant, demandez `estEditable`.

#### `EditeurSvg.estEditable(svg)` → `boolean`

Vrai quand l’éditeur sait ouvrir ce SVG : un texte, sans image enveloppée, que le moteur sait lire sans le
refuser. Faux pour tout autre argument. Utile pour griser un bouton « Éditer ».

#### `EditeurSvg.version` → `string`

La version du paquet (`package.json`) qui a construit le bundle.

### Ce qui est enregistré, et quand

- **Rien n’est rendu sans « Enregistrer »** : le bouton de la barre, `Ctrl+S` (ou `⌘S`), ou
  Fichier → Enregistrer. `onEnregistrer` reçoit alors le SVG, et lui seul.
- Le SVG rendu est le dessin **réécrit** (ADR-0001) : à plat, en chemins absolus, coordonnées au
  millième ; les groupes, classes et feuilles de style de l’entrée disparaissent, le rendu reste le même.
  Les formes masquées sont retirées, et le panneau le dit. Un SVG réécrit aujourd’hui l’est à l’identique
  demain : un changement de cette écriture est un événement de version majeure.
- Le SVG passe par `nettoyerSvg` : il porte toujours `xmlns` et `viewBox`, et ne garde ni script, ni
  `foreignObject`, ni gestionnaire d’évènement (`onload=`…), ni référence externe (`href`, `url()`,
  `@import` hors `#ancre` et images `data:`), ni `javascript:`.
- Un dessin sans aucune forme visible n’est pas enregistré : l’éditeur le dit et `onEnregistrer` n’est pas
  appelée.
- Avec `fermerApresEnregistrer: false`, l’éditeur reste ouvert après l’enregistrement (on peut enregistrer
  plusieurs fois). Le fermer ensuite par l’éditeur redemande confirmation, car il ne sait pas que le dessin
  est déjà gardé ; fermez-le plutôt par la poignée.
- `onBrouillon` n’est pas un enregistrement : c’est le SVG du moment, de quoi reprendre après un
  rechargement. Il n’est **pas** passé par `nettoyerSvg`. Appelée seulement quand le dessin a changé.
- « Fermer » avec des modifications non enregistrées demande confirmation (« Abandonner »).

Les rappels s’exécutent dans les évènements de l’éditeur ; une exception levée dans l’un d’eux n’est pas
rattrapée par l’éditeur.

### Les fichiers à servir

| Fichier | Taille | Quand | Rôle |
|---|---|---|---|
| `editeur-svg-embarque.js` | 717 Ko (227 Ko compressé) | toujours | L’éditeur, ses styles, React |
| `bibliotheque.js` | 6,6 Mo (2,7 Mo compressé) | si vous passez `bibliotheque` | 4 134 formes de game-icons.net, chargées quand la personne ouvre la bibliothèque |
| `polices.js` | 2,6 Mo (1,2 Mo compressé) | si vous gardez l’outil Texte | Neuf fontes libres (OFL), chargées quand la personne ouvre l’outil Texte |

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
- Si vous livrez `bibliotheque.js`, créditez **game-icons.net** (licence CC BY 3.0) ; les fontes de
  `polices.js` sont sous licence SIL OFL 1.1. L’éditeur le rappelle dans la page entière, pas dans le
  bundle.
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
- **Les fontes** : la page entière charge *Instrument Sans* et *IBM Plex Mono* chez Google Fonts ; le bundle
  ne charge rien (pas de requête cachée). Sans elles, l’éditeur retombe sur *Helvetica Neue*, *Arial* et
  `ui-monospace`. Pour retrouver la même typographie, chargez-les vous-même :

  ```html
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
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
- **Les raccourcis** : tant que l’éditeur est ouvert, `Ctrl+S`, `Ctrl+Z`, `Suppr`, les flèches (seules, avec `Alt`
  ou avec `Ctrl`), etc. sont écoutés sur `window` ; `Tab`, `Entrée`, `Page suivante` et `Page précédente` ne le sont que sur la toile. Ne laissez pas votre page y réagir aussi.

Besoin d’une isolation totale (feuilles de l’hôte qui visent des classes génériques, règles `svg`) :
prenez l’iframe (1).

### Sécurité

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
  valeur)` rend vrai si elle est gardée, `retirer(cle)` l’oublie. La seule clé écrite est `svg.versions`. Si l’un
  des verbes lève une exception, l’éditeur la rattrape et lit le stockage comme refusé. Le stockage est un
  confort : refusé, absent ou plein, tout marche sans lui, les versions vivant alors le temps de l’éditeur.
- **Aucun réseau** : l’éditeur n’appelle aucun serveur. Les seules requêtes sont les balises `<script>` des
  deux annexes, et seulement si la personne ouvre la bibliothèque ou l’outil Texte.
- **Politique de sécurité du contenu** : vérifiée avec
  `default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src data: blob:`. Le
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
| `brouillon?` | `(svg: string) => void` | Reçoit le SVG du moment, une seconde après la dernière modification |
| `stockage?` | `Stockage \| null` (`src/io/stockage.ts`) | Où garder les versions nommées. **Absent ou `null` : rien n’est gardé**, le composant ne connaît aucun magasin. Pour le `localStorage` du navigateur, passez `stockageNavigateur()` ; pour la mémoire, `stockageMemoire()` |

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
3. Modifiez une forme, « Enregistrer » : `onEnregistrer` reçoit un texte qui commence par `<svg `.
4. Ouvrez la bibliothèque et l’outil Texte : si un fichier annexe est introuvable, le panneau le dit et
   l’onglet Réseau du navigateur montre l’adresse demandée (corrigez `baseAnnexes`).
5. `exemples/integration.html` fait tout cela ; si lui marche et pas votre page, comparez les balises
   `<script>` et le dossier des annexes.
