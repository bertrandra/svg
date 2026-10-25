# svg

Un éditeur SVG qui tient dans une page, un convertisseur d'image en SVG, et une bibliothèque de
4 000 formes classées par événement. Le tout se calcule dans le navigateur, sans serveur, et
s'embarque aussi comme composant React dans un autre produit.

## Ce que fait la page

- **Un accueil par public** : « Pour quoi dessinez-vous ? » (machine de découpe, retouche, intégration), facultatif et retenu ; chaque public voit son circuit jusqu’au fichier prêt, les voies dans son ordre, l’éditeur réglé pour une Cricut (Maker, découpe, millimètres) ou, pour les intégrateurs, l’embarquement expliqué et essayé comme un hôte (ADR-0024).
- **Ouvrir un SVG ou un PDF** : un fichier déposé ou choisi, un code SVG collé, ou l'exemple ; d'un PDF, les tracés et le texte de la première page (ou de celle qu'on choisit) deviennent des formes, et ce qui n'est pas repris est dit (ADR-0020).
- **Convertir une image en SVG** : PNG, JPG, GIF ou WebP, affiché dès le dépôt, fond détouré
  (tolérance et portée réglables), puis vectorisé par vtracer (modes aplats, trait, fidèle ; trois
  grains) ou enveloppé tel quel. Un atelier sous le dépôt montre l'image et son tracé (rideau de
  comparaison, rendu, contours, zoom, fond), expose huit réglages fins du traceur qui se rejouent à
  chaque changement, et garde les huit derniers essais pour comparer et revenir. Le résultat se
  télécharge, se copie, s'ouvre dans l'éditeur. Le mode « Ligne médiane » change un dessin au trait en traces ouverts d'une
  seule ligne au milieu du trait, sans remplissage, pour le stylo d'une Cricut (moteur pur, sans vtracer ; ADR-0021).
- **Choisir une forme** dans la bibliothèque : 4 134 silhouettes nommées en français, cherchées par
  nom et par événement du calendrier (Noël, Pâques, Halloween, 14 Juillet…), de la vie
  (naissance, anniversaire, mariage, concert…) ou par catégorie (personnage, bâtiment, animal…) ; et cinq
  bibliothèques libres chargées à la demande (Material, Phosphor, Tabler, Healthicons, Lucide : 19 000 formes de plus,
  pleines pour la découpe ou en ligne pour le stylo, ADR-0023).
- **Éditer en plein écran** comme dans un logiciel de dessin :
  - sélection au clic ou au cadre, Tout et Aucun, déplacement, coins pour redimensionner (Maj :
    proportions) ; une rangée contextuelle avec alignements, miroirs, rotations, empilement,
    combiner, séparer, dupliquer, masquer, verrouiller, supprimer ;
  - copier, couper, coller ; les couleurs courantes dans la barre ; une grille magnétique ; le zoom
    sur la sélection ; les raccourcis d'un logiciel de dessin (Ctrl+C/X/V, Ctrl+G, G, Z…) ; Ctrl+S garde un
    brouillon sans jamais fermer l'éditeur ;
  - outils de tracé : rectangle, ellipse, étoile, ligne, plume ; **texte vivant** (dix fontes libres, dont une à
    trait unique pour le stylo, ou la vôtre) : il reste modifiable (double-clic ou Entrée le retape en place,
    l'inspecteur « Texte » le restyle), s'écrit en contours exacts et se rouvre comme texte ; « Vectoriser le
    texte » (Ctrl+Maj+O) le rend en formes ordinaires, lettres séparées, lettres qui se touchent soudées, ou tout
    soudé ; l'aperçu « forme / ligne » montre ce qu'en feraient la lame et le stylo (ADR-0022) ; « Toutes les polices »
    ouvre plus de 2 000 familles libres (Google Fonts et Fontsource, la League of Moveable Type, SIL, Velvetyne, Fontshare…),
    avec recherche, filtres, favoris, récentes, polices du document et « Remplacer partout » : une police se télécharge
    seulement quand vous la choisissez, et chaque fichier est vérifié par son empreinte (ADR-0025) ;
  - booléens : union, soustraction, intersection, exclusion, avec les courbes rebâties (réglage du
    menu Édition) ;
  - aimants vers les bords et centres des autres formes, transformations numériques (rotation,
    inclinaison, échelle) et poignée de rotation ;
  - recoloration par palettes d'événements, par le nuancier ou d'une seule couleur ;
  - points et poignées : glisser une ancre, tirer une poignée, ajouter un point sans changer la
    courbe, redresser ou courber un segment, retirer un point ;
  - couleurs : sélecteur, code, nuancier, remplacement d'une couleur partout ; opacité du fond et du
    contour, bout, jonction et pointillés du trait ;
  - calques par couleur : choisir, masquer, verrouiller, isoler, combiner, supprimer, recolorer les
    formes d'une couleur, choisir ou fusionner les nuances proches ;
  - nettoyage du tracé : poussières sous un seuil, voisines de même couleur regroupées si le rendu
    reste identique, tracés simplifiés, plan de travail ajusté au trait réel ;
  - insertion d'une forme de la bibliothèque au centre du dessin, d'un panier en grille, ou d'une
    scène prête par événement ;
  - versions nommées, et reprise du dessin après un rechargement ;
  - annuler et rétablir chaque geste (Ctrl+Z, Ctrl+Maj+Z) ; zoom, main, vue contours, fonds.
- **Récupérer le résultat** : « Télécharger le SVG », d'un geste, dans la barre de l'éditeur ; « Autres formats » à côté
  (PDF, PNG, JPEG, WebP, EPS, DXF, SVG de découpe, copie du code), chacun dit par son usage. « Terminer » ramène à la
  fiche du dessin, dont le téléchargement est l'action principale. Rien ne quitte le navigateur, pas même l'adresse de la personne : la page autonome embarque ses fontes
  et ne contacte aucun serveur d'elle-même (un test en navigateur, réseau coupé, le vérifie) ; seule une police libre que
  vous choisissez se demande à son serveur, sans rien de vous ni du dessin (ADR-0025).
- **Préparer pour une Cricut** : la machine se choisit dans la barre (« Machine : Générique », puis Joy, Explore, Maker ;
  tapis ; papier cartonné ; découpe ou Print Then Cut ; millimètres, ou pouces, retenus). Le tapis entier s’affiche et se
  cadre sur la toile (« Ajuster », touche 0 ; « Ajuster au dessin », D), le panneau « Prêt pour Cricut » juge le dessin en
  continu (traits, transparences, dépassement, tracés ouverts, nuances proches, parties trop fines…) et propose pour chaque
  constat une correction annulable ; « Exporter pour Cricut » écrit un SVG à taille physique, ou une archive Print Then Cut,
  demande confirmation tant qu’un point reste « à corriger », puis dit les étapes dans Design Space. Les valeurs encore à vérifier sur une machine sont dans
  [`docs/cricut/protocole.md`](docs/cricut/protocole.md) (ADR-0013).
- **Couper et écrire dans le même projet** : en Cricut, chaque forme est « À couper » ou « À écrire » (une forme pleine se coupe, un
  trait seul s’écrit au stylo, et chacun se change dans le panneau de gauche, la rangée de la sélection, Maj+X ou Maj+E) ; la toile
  hachure ce que la lame détache et trace la ligne du stylo (« Aperçu de la machine », Maj+O) ; un dessin mêlé s’exporte en un fichier
  à couper, un fichier à écrire et les deux ensemble (ADR-0028).
- **Le texte épouse une forme** : posé **sur** une forme, il suit son tracé (le cercle d’un badge, un arc, une vague), ses
  lettres tournées sans être déformées, son point de départ glissé à la souris ou réglé au clavier ; posé **dans** une forme
  fermée, il en prend la silhouette, lettres étirées et courbées jusqu’au bord (un cœur, un cercle, une étoile, ADR-0032), ou,
  au choix du panneau, la remplit ligne à ligne, coupée sur ses bords, trous respectés, à la taille voulue ou ajustée.
  Le texte reste modifiable et suit sa forme quand elle change ; le fichier ne porte que des contours (ADR-0031).
- **Sur tablette et mobile** : barres qui défilent, panneaux en tiroirs, cibles de 40 px, zoom à deux
  doigts.
- **Au clavier et au lecteur d'écran** : Tab parcourt les formes, Alt+flèches redimensionnent,
  Ctrl+flèches tournent, un réticule piloté aux flèches pose formes et points ; une région vocale
  dit la sélection et chaque action ; le contraste forcé et les thèmes clair et sombre sont tenus
  (audits `axe-core` en test).
- **Gros dessins** : des milliers de formes et de couleurs restent fluides (listes fenêtrées,
  historique borné selon la taille).

Ce que l'éditeur refuse, en le nommant : texte, image, dégradé, masque, découpe, filtre, un `<use>` en cycle
ou renvoyant à un fichier extérieur. Un `<use>` ordinaire (planche d'icônes, `<symbol>`) se déplie en formes
indépendantes, et la feuille `<style>` se lit avec ses vrais sélecteurs ; ce qui n'est pas repris
(marqueurs, animations, `@media`…) est dit à l'ouverture.
On n'édite pas ce qu'on ne saurait pas réécrire ; une image se vectorise d'abord.

## Démarrer

Prérequis : Node 20 ou plus.

```bash
npm ci
npm run verifier     # typecheck + lint + cliquet + tests : ce que lance la CI
npm run construire   # dist/editeur-svg.html (la page), dist/vtracer.js, dist/bibliotheque.js, dist/polices.js, dist/polices-catalogue.js, dist/polices-apercus.js, dist/editeur-svg-embarque.js, dist/php/ (le site PHP)
npm run test:php     # les tests du site PHP (PHP 8.1+, cURL), sans dépendance
npm run e2e          # les tests de navigateur (Chromium ; NAVIGATEUR=firefox|webkit pour les autres), après construire
```

| Commande | Ce qu'elle fait |
|---|---|
| `npm run typecheck` | `tsc --noEmit`, configuration stricte complète |
| `npm run lint` | Aucun `any` dans le moteur, aucune assertion `!`, aucune fonction de plus de 150 lignes |
| `npm run cliquet` | Aucun dossier ne régresse en typage |
| `npm test` | Couches, cycles, pureté du cœur, lecture et écriture du dessin, opérations, points, historique, vectorisation réelle, bibliothèque entière |
| `npm run construire` | La page, le traceur, la bibliothèque et les fontes, dans `dist/`, puis le site PHP dans `dist/php/` |
| `npm run site-php` | Le site PHP seul (après les autres) : `dist/php/` (ADR-0030, [`docs/deploiement-php.md`](docs/deploiement-php.md)) |
| `npm run test:php` | Les tests du site PHP : ses fonctions sur un dossier temporaire, puis ses routes sous `php -S` (`tests/php/`) |
| `npm run vtracer` | Le traceur seul : `dist/vtracer.js` |
| `npm run embarquer` | Le script d'embarquement seul : `dist/editeur-svg-embarque.js` |
| `npm run e2e` | Plus de 270 tests de navigateur (Playwright dans vitest) sur la page construite ; `NAVIGATEUR` = `chromium` (défaut), `firefox` ou `webkit` ; `CHROMIUM_PATH` facultatif, pour Chromium seul ; hors `npm test`. Navigateurs promis : [`docs/navigateurs.md`](docs/navigateurs.md) ; vérification à la main : [`docs/verification-manuelle.md`](docs/verification-manuelle.md) |
| `npm run bibliotheque` | La bibliothèque seule : `dist/bibliotheque.js` et une annexe par source libre, `dist/bibliotheque-<source>.js` |
| `npm run polices` | Les dix fontes seules, `dist/polices.js`, et l'index des polices téléchargeables, `dist/polices-catalogue.js` (tiré de l'instantané commis `data/catalogue-polices.json`, sans réseau), et ses aperçus, `dist/polices-apercus.js` (tirés de `data/apercus-polices.json`) |
| `node scripts/catalogue-polices.mjs` | À la main seulement : rafraîchit l'instantané `data/catalogue-polices.json` depuis Fontsource, jsDelivr, GitLab et Fontshare (`NODE_USE_ENV_PROXY=1` derrière un proxy) ; une version remplacée passe dans `anciennes`, pour qu'un dessin d'hier se recompose (ADR-0025) |
| `node scripts/apercus-polices.mjs` | À la main seulement, après l'index : redessine `data/apercus-polices.json`, le nom de chaque famille dans sa propre fonte (chaque fichier vérifié par l'empreinte de l'index ; `APERCUS_CACHE=<dossier>` garde les fichiers téléchargés) (ADR-0026) |

La page construite s'ouvre telle quelle dans un navigateur, depuis le disque ou un serveur
statique ; `vtracer.js` (0,9 Mo), `bibliotheque.js` (7 Mo), les `bibliotheque-<source>.js` (de 0,9 à 3,6 Mo) et `polices.js` (2,7 Mo) doivent rester à côté
d'elle, ils se chargent à la demande (au premier tracé, à l'ouverture de la bibliothèque, au premier texte).

## Le site PHP

Une autre cible, à côté de la page autonome (qui ne change pas) : `npm run construire` écrit aussi `dist/php/`, un site PHP où l’on
retrouve ses **projets** d’une session à l’autre, derrière un **mot de passe** (ADR-0030). Un projet n’est pas le SVG mais le JSON
natif du modèle, avec tout ce qu’il faut pour le rouvrir à l’identique (formes, textes vivants, opérations Cricut, contexte de
production, nuancier, fonte déposée, image source) ; le SVG reste un export.

- `public/` est la racine web (`index.php` : la connexion, puis l’écran « Projets » ; `api.php` : projets, données, polices) ;
  `data/` vit **à côté**, hors de portée du navigateur (`data/pwd`, `data/projets`, `data/json`, `data/font`).
- `php outils/mot-de-passe.php` pose l’empreinte du mot de passe ; sans elle, personne n’entre.
- « Enregistrer » et Ctrl+S écrivent le projet sans fermer, « Enregistrer sous… » le garde sous un autre nom, l’état « Enregistré /
  Modifications non enregistrées » est dans la barre d’état ; deux onglets ne s’écrasent pas (révision).
- Le navigateur ne contacte que le site : les bibliothèques et l’index des polices viennent de `data/json`, une police du catalogue
  est téléchargée et vérifiée par le serveur, puis gardée dans `data/font`.

Installation sur un hébergeur (où poser `public/` et `data/`, droits, mot de passe, HTTPS, mise à jour) :
[`docs/deploiement-php.md`](docs/deploiement-php.md) ; sécurité : [`docs/securite.md`](docs/securite.md), § 9.

## Embarquer l'éditeur

Le guide complet est dans [`docs/integration.md`](docs/integration.md) ; une démonstration tourne
depuis le disque dans [`exemples/integration.html`](exemples/integration.html). Trois voies : l'iframe
de la page entière, un script classique, ou le composant React.

```html
<script src="editeur-svg-embarque.js"></script>
<script>
  const editeur = EditeurSvg.ouvrir({
    svg: texteSvg,                       // le SVG à retoucher
    nom: 'logo',                         // le nom du fichier proposé
    nuancier: [{ nom: 'Rouge', hex: '#c81e28' }],   // facultatif
    bibliotheque: 'a-charger',           // facultatif : chargée au premier besoin
    onEnregistrer: svg => { … },         // le SVG retouché, déjà passé par nettoyerSvg
    onFermer: () => { … }                // facultatif
  });
</script>
```

`dist/editeur-svg-embarque.js` (`npm run embarquer`, 0,7 Mo) amène ses propres styles, cantonnés à
l'éditeur, et lit les jetons de couleur de `src/styles/jetons.ts`. `bibliotheque.js` et `polices.js`
se posent à côté de la page de l'hôte, ou sous une adresse donnée par `baseAnnexes`. Le composant
React (`src/zones/EditeurSvg.tsx`, propriétés `ProprietesEditeur`) et le moteur seul
(`src/engine/editionSvg.ts`, sans React ni DOM) restent utilisables tels quels.

## Organisation du dépôt

| Chemin | Rôle |
|---|---|
| `src/util/` | Primitives pures : lecture XML sans DOM, nettoyage d'un SVG, historique immuable, couleur (OKLab), lecture indexée sûre (`au`) |
| `src/model/` | La bibliothèque : le lexique anglais → français, les événements et leurs règles, le nom et le classement d'une forme ; les profils de production (`contextes.ts`) ; le format du projet (`projet.ts`) |
| `src/engine/` | Le dessin à plat (`editionSvg.ts`), les booléens, les transformations et aimants, le texte en formes, les palettes, le détourage, l'extraction des couleurs, les réglages de vectorisation. Pur : ni DOM, ni réseau, ni horloge |
| `src/export/` | Le PDF vectoriel, le SVG de découpe, l'export pour Cricut et Print Then Cut. Pur |
| `src/io/` | Ce qui touche au navigateur : décoder une image, rendre un PNG, appeler vtracer (WASM), charger la bibliothèque et les fontes, télécharger, copier ; le seul réseau (`policesEnLigne.ts`, et `serveur.ts` pour le site PHP) |
| `src/site/` | Le site PHP (ADR-0030) : un hôte de l’éditeur, l’écran « Projets », le projet composé depuis l’état de l’éditeur |
| `outils/site-php/` | Le PHP du site : `public/` (`index.php`, `api.php`, `config.php`, `inc/`), `data/.htaccess`, `outils/mot-de-passe.php` ; `scripts/site-php.mjs` l’assemble dans `dist/php/` |
| `tests/php/` | Les tests du site PHP, sans dépendance (`npm run test:php`) |
| `src/zones/` | `EditeurSvg.tsx` (le composant) et ses trois contextes (`contexteEditeur.tsx`), les barres (`BarreOutils`, `BarreSelection`, `MenusBarre`), les panneaux (`Calques`, `Inspecteur`, `PanneauDessin`, `ParCouleur`, `Texte`, `Palettes`, `Versions`, `Exporter`), `commun/` (`Bouton`, `Menu`, `Section`), `Vectoriser.tsx`, `Bibliotheque.tsx`, `Application.tsx` (la page) |
| `bibliotheque/` | `corrections.json` : les corrections de nom et de classement posées à la main, appliquées à la construction |
| `outils/editeur-svg/` | La page, ses feuilles de style (`base.css`, `editeur.css`) et ses points d'entrée (page, embarquement, traceur) ; `scripts/construire.mjs` assemble la page, `scripts/embarquer.mjs` le script d'embarquement |
| `exemples/` | Une page d'intégration qui tourne depuis le disque |
| `tests/unit/` | Un dossier par couche de `src/`, plus `architecture.test.ts` |
| `src/styles/` | Le registre des jetons de couleur de l'interface (rôle, clair, sombre, contrastes), d'où le CSS se génère |
| `docs/adr/` | Les décisions, une par fichier (dont la sécurité, [ADR-0014](docs/adr/0014-un-svg-d-inconnu-se-lit-il-ne-se-nettoie-pas.md) ; les outils de tracé, [ADR-0015](docs/adr/0015-les-outils-de-trace-des-morceaux-qui-partagent-leurs-aretes.md) ; les navigateurs, [ADR-0016](docs/adr/0016-les-navigateurs-pris-en-charge.md) ; la conformité et la provenance, [ADR-0017](docs/adr/0017-conformite-et-provenance.md) ; les exports et le prétraitement, [ADR-0018](docs/adr/0018-des-exports-purs-un-pretraitement-qui-n-existe-que-touche.md) ; l’import PDF et le texte en lettres, [ADR-0020](docs/adr/0020-un-pdf-se-lit-en-formes.md) ; le texte vivant, la vectorisation et le trait unique, [ADR-0022](docs/adr/0022-le-texte-vivant-la-vectorisation-et-le-trait-unique.md) ; les bibliothèques libres, [ADR-0023](docs/adr/0023-plusieurs-bibliotheques-libres.md) ; les polices libres à la demande, [ADR-0025](docs/adr/0025-les-polices-libres-a-la-demande.md) ; le site PHP et le projet JSON, [ADR-0030](docs/adr/0030-le-site-php-et-le-projet-json.md)) ; `docs/jetons.md` : les jetons, générés |

Les couches vont de `util` à `zones` : `util/shell` → `geometry` → `model/plateforme` → `engine` →
`core/io/render/export/interaction` → `ui` → `app/zones`, jamais dans l'autre sens, et le cœur pur
(`util`, `model`, `engine`) ne touche ni au DOM, ni à l'horloge, ni au hasard, ni au réseau. Un test
l'impose.

## Sources et licences

- Les formes de la bibliothèque viennent de [game-icons.net](https://game-icons.net) et de ses contributeurs, licence
  [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), par le paquet `@iconify-json/game-icons` : **l'attribution
  est obligatoire**. L'éditeur la porte lui-même : la boîte « À propos et crédits » (menu Fichier, pied de la page), un
  `<metadata>` d'attribution et un attribut `data-origine` dans tout SVG écrit qui contient une de ces formes, la mention dans les
  informations d'un PDF et en commentaire d'un SVG de découpe (un PNG ne la porte pas : citez la source à côté). Voir
  [docs/integration.md](docs/integration.md#attribution-et-licences) pour ce que doit faire l'hôte qui l'embarque.
- La vectorisation emploie [vtracer](https://github.com/visioncortex/vtracer) (Vision Cortex),
  compilé en WebAssembly, par le paquet `@visioncortex/vtracer`.
- Les booléens emploient [polygon-clipping](https://github.com/mfogel/polygon-clipping) (MIT) ; le
  texte, [opentype.js](https://opentype.js.org) (MIT) et neuf fontes (huit familles : Inter, Oswald, Bebas Neue,
  Playfair Display, Lobster, Pacifico, Caveat, Fredoka) sous licence SIL OFL 1.1, par les paquets
  `@expo-google-fonts/*` ; la police à trait unique EMS Readability (SIL OFL 1.1) vient du paquet `hersheytext`. L'interface est en [React](https://react.dev) (MIT), en *Instrument Sans* et *IBM Plex Mono* (SIL OFL 1.1,
  sous-ensemble latin, paquets `@fontsource/*`), incorporées à `dist/editeur-svg.html` : la page ne les demande à aucun serveur.
- Les polices libres téléchargeables à la demande (ADR-0025) ne sont pas redistribuées : `dist/polices-catalogue.js` n'en est
  que l'index (noms, licences, versions épinglées, empreintes sha256), et `dist/polices-apercus.js` que le nom de chaque famille
  dessiné dans sa fonte (ADR-0026) ; la personne télécharge le fichier depuis sa source, et le dessin n'en garde que les contours. La licence de chaque police employée est nommée dans « À propos et crédits ».
- **Le copyright et la licence de chaque composant tiers sont dans [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)**, généré par
  `npm run mentions` à partir de `src/model/credits.ts`, du `package-lock.json` et des fichiers de licence des paquets ; le même texte
  est construit dans `dist/MENTIONS.txt` et doit accompagner toute redistribution de `dist/`. Un test échoue si ce fichier est périmé
  (`ACTUALISER_REFERENCES=1 npx vitest run tests/unit/depot/mentions.test.ts` le régénère).
- Le projet lui-même est propriétaire, tous droits réservés (voir [LICENSE](LICENSE)) ; les composants tiers gardent leurs licences.
