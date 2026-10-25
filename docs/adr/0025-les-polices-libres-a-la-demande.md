# ADR-0025 — Les polices libres à la demande : un index commis, un accord par serveur, une empreinte par fichier

**Date :** 25 octobre 2026
**Statut :** acceptée (prolonge les ADR-0017, 0020 et 0022 ; s’appuie sur les ADR-0008, 0011, 0014 et 0016) ; **aucun octet
écrit pour un dessin existant ne change** : les dix fontes livrées, `polices.js` et toutes les références d’écriture sont intactes

## Contexte

Décision du propriétaire : ouvrir l’outil Texte à **toutes les polices libres de droit**, comme le ferait un professionnel,
sans casser la promesse de l’ADR-0017 — « la page autonome ne contacte aucun serveur » — tant que la personne n’a rien demandé.
Jusqu’ici l’outil n’avait que dix fontes livrées dans `polices.js` (ADR-0022) et la fonte qu’on dépose.

Quatre contraintes pèsent. Le produit est propriétaire (ADR-0017) : seule une licence relue, qui permet l’usage dans un produit
fermé, est admissible. Un dessin réécrit doit l’être à l’identique : un texte composé dans une police téléchargée doit se
recomposer demain avec les mêmes octets. Le cœur pur ne touche pas au réseau. opentype.js ne lit pas le WOFF2.

## Décision

### 1. Un registre, une liste blanche de licences

`model/sourcesPolices.ts` (pur) porte :

- **la liste blanche** : SIL OFL 1.1, Apache 2.0, Ubuntu Font Licence 1.0, CC0 1.0, et l’**ITF Free Font License** de
  Fontshare, qui n’est pas l’OFL (elle permet l’usage commercial, interdit de redistribuer le fichier) : affichée avec un badge
  « ITF » et nommée en toutes lettres. Toute autre licence est refusée par la validation de l’index, même « libre » ailleurs : MIT
  (Comic Mono) et Unlicense (Metropolis), présentes chez Fontsource, sont écartées faute d’avoir été relues pour cet usage ;
- **les serveurs** contactés, chacun avec son hôte et le préfixe obligé de ses adresses : jsDelivr (`cdn.jsdelivr.net`), Bunny
  Fonts (`fonts.bunny.net`, **repli** seulement), GitLab (`gitlab.com`), Fontshare (`cdn.fontshare.com`) ;
- **les sources** et ce qui fixe la version de leurs fichiers :

  | Source | Servie par | Épinglage | Dans l’index |
  |---|---|---|---|
  | Google Fonts | Fontsource, paquets npm `@fontsource/*` sur jsDelivr ; Bunny en repli | version du paquet dans l’adresse (`@5.3.0`) | 1 937 familles |
  | Fontsource (hors Google) | idem | idem | 109 familles |
  | The League of Moveable Type | idem (18 familles servies par Fontsource) | idem | 18 familles |
  | SIL International | idem (Andika, Charis SIL, Gentium, Scheherazade New…) | idem | 14 familles |
  | Collletttivo | idem (Apfel Grotezk) | idem | 1 famille, **`aVerifier`** pour le reste |
  | Velvetyne | API GitLab, au commit | commit de 40 chiffres dans l’adresse | 26 familles |
  | Fontshare | `cdn.fontshare.com` | version de l’API et empreinte, **`aVerifier`** | 100 familles |

  Soit **2 205 familles, 9 441 variantes** (graisse × style) à l’instantané du 25 octobre 2026 ; cinq familles que l’éditeur ne
  sait pas lire (Pitagon, Peace Sans : `FAMILLES_ILLISIBLES`) en sont ensuite retirées : **2 200 familles, 9 386 variantes**.
- **les exclusions**, dites : **Font Squirrel** (licences au cas par cas, parfois sans usage commercial, ni adresse versionnée ni
  API), **uncut.xyz** (répertoire aux licences mêlées, sans adresse versionnée ni empreinte publiée), les polices d’icônes
  (catégorie `icons`), les familles sans sous-ensemble latin.
  L’exclusion vise le répertoire, pas une police qu’il présente : **Uncut Sans**, servie par Fontsource sous OFL 1.1 avec
  version épinglée et empreinte, reste au catalogue (décision du propriétaire, 25 octobre 2026). Une famille entre par sa
  licence et par une adresse vérifiable, jamais par le site qui la recense.

Ce qui n’a pas pu être vérifié reste marqué, jamais inventé :

- **Collletttivo** : ses fontes autres qu’Apfel Grotezk sont dans des dépôts GitHub **sans étiquette de version**, et GitHub
  n’est pas joignable depuis l’atelier qui construit l’index (refus du proxy) : aucune adresse immuable n’a pu être lue, elles
  n’entrent pas dans l’index ;
- **Fontshare** : les adresses de `cdn.fontshare.com` sont opaques et non versionnées (cache de sept jours). Les familles
  entrent dans l’index avec l’empreinte de chaque fichier, téléchargé et haché au moment de l’instantané : un fichier changé
  serait refusé, et le texte garderait ses contours. L’adresse de la page de la licence ITF n’a pas pu être lue (le site rend la
  même application pour toute adresse) ;
- **SIL** : Doulos SIL et les fontes absentes de Fontsource manquent : leurs archives versionnées (`software.sil.org`) sont
  servies sans en-tête CORS, un navigateur ne peut pas les lire ;
- **la League** : seules les familles que Fontsource sert ; la plupart de ses dépôts GitHub n’ont pas d’étiquette.

**Bunny Fonts sert exactement les fichiers de la dernière version de Fontsource** (vérifié octet pour octet sur Roboto 5.3.0
et Charis SIL 5.3.0) mais sans version dans l’adresse : c’est un repli valable tant que la version épinglée est la dernière,
et que l’empreinte vérifie. Quand Fontsource publie une version suivante, Bunny sert un autre fichier, qui est refusé ; jsDelivr,
lui, sert toujours la version épinglée.

### 2. Un index commis, jamais construit en ligne

L’index est un **instantané commis**, `data/catalogue-polices.json` (1,36 Mo, une famille par ligne pour qu’un rafraîchissement
se relise dans un diff), produit **à la main** par `scripts/catalogue-polices.mjs`. Le script lit l’API Fontsource (familles,
graisses, styles, sous-ensembles, catégorie, licence), la dernière version de chaque paquet et l’**empreinte sha256 de chaque
fichier** auprès de l’API de jsDelivr (pas besoin de télécharger quinze mille fichiers pour les hacher), les dépôts du groupe
GitLab `velvetyne` (commit, arbre, texte de licence : seul l’OFL est admis ; chaque fichier est téléchargé par l’adresse même que
la page emploiera, haché, et lu par opentype.js pour vérifier qu’il a des lettres latines), et l’API de Fontshare (chaque WOFF
téléchargé, haché, lu). Il valide l’index par **la même fonction que la page** (`validerCatalogue`) avant de l’écrire.

**Le build ne contacte pas le réseau** : `scripts/polices.mjs` valide l’instantané et en fait une annexe, `dist/polices-catalogue.js`
(1,33 Mo, 0,66 Mo compressé), chargée à la demande par une balise `<script>` comme `polices.js`, quand la personne ouvre « Toutes
les polices » (ou rouvre un texte composé dans une police du catalogue). Embarquer l’index dans la page l’aurait alourdie d’autant
pour tous ; l’annexe est un fichier voisin, que la lire ne fait contacter aucun tiers.

Une variante s’écrit `[graisse, italique, sha256 latin, sha256 latin-ext ou null, chemin, libellé]` ; l’index entier est validé à
la lecture : forme, licence de la liste blanche déclarée par sa source, version épinglée (semver, commit, version Fontshare),
empreintes, chemin de la forme de son dépôt et sans « .. », unicité des identifiants. Toute adresse calculée doit commencer par le
préfixe de son serveur.

### 3. Une identité stable, une version qui désigne des octets

Une variante a un identifiant **`c-` et 14 chiffres hexadécimaux**, l’empreinte (`util/empreinte.ts`) de sa clé
`dépôt:famille:graisse:style[:libellé]` : il ne change pas d’une version de l’index à l’autre. Sa **version** est l’empreinte des
empreintes sha256 de ses fichiers. Un texte vivant (ADR-0022) les écrit dans `data-ed-police` et `data-ed-police-version`, avec le
nom lisible dans `data-ed-famille` (borné à 60 caractères, la borne de la relecture : un texte relu reste un point fixe) :

```xml
<path d="M…Z" fill="#15181d" data-ed-texte="%C3%89t%C3%A9" data-ed-police="c-1b0c5ca30f8f68" data-ed-police-version="…" data-ed-famille="Roboto" data-ed-taille="18"/>
```

Le même identifiant et la même version désignent **les mêmes octets**, vérifiés à chaque téléchargement ; la source, la famille
et la version épinglée se lisent dans l’index par l’identifiant. La relecture garde un identifiant `c-` tel quel (elle ne le
remplace plus par la règle de l’ADR-0020) ; aucun nouvel attribut n’est écrit, et la forme admise par les invariants d’écriture
(`[a-z0-9][a-z0-9-]{0,31}`) le contenait déjà.

Quand l’index est rafraîchi, la version qu’il remplace (ou une famille qu’il perd) passe dans **`anciennes`** : un dessin d’hier
retrouve ses fichiers à leur adresse versionnée, donc immuable. Sans l’index (un hôte sans polices en ligne), le texte garde ses
contours et dit « Police absente : Roboto ».

### 4. Rien ne part sans accord, et l’accord se donne serveur par serveur

- Tant que la personne n’a pas accepté, **aucune requête**. Au premier choix d’une police non livrée, un dialogue (modal, focus
  pris et rendu, Échap vaut refus) dit **quel serveur sera contacté** (« jsDelivr (cdn.jsdelivr.net), puis, s’il ne répond pas,
  Bunny Fonts (fonts.bunny.net) »), **ce qui part** (la demande du fichier, rien d’autre : ni le dessin, ni le texte, ni aucune
  donnée personnelle ; le serveur voit l’adresse IP, comme pour toute page), la source et la licence. Une seule action pleine :
  « Accepter et retenir » ; « Pas maintenant » ne télécharge rien.
- L’accord se retient dans le **stockage injecté**, clé `svg.polices.consentement` (`{ serveurs: [...] }`) ; il est **révocable**
  dans le même panneau (« Retirer l’autorisation »). Une police d’un serveur pas encore accepté (Fontshare après jsDelivr)
  redemande l’accord en nommant ce serveur. Sans stockage, l’accord vaut pour la session et le bouton le dit.
- `telechargerVariante` (`io/policesEnLigne.ts`) vérifie aussi l’accord : sans serveur accepté pour chaque fichier, il refuse
  avant toute requête. La requête part sans cookie (`credentials: 'omit'`) ni référent (`referrerPolicy: 'no-referrer'`).
- **Chez un hôte**, l’option `policesEnLigne` (booléen validé, ADR-0014) vaut **faux par défaut** : rien ne se télécharge, le
  bouton « Toutes les polices » n’existe pas, seules les dix fontes se proposent. La page autonome la donne vraie.

### 5. Chaque fichier vérifié avant d’être lu

Le fichier téléchargé (WOFF, sous-ensembles **latin** puis **latin-ext** quand la famille en a ; un fichier complet pour Velvetyne
et Fontshare) est haché par **`crypto.subtle`** (dans `io`) et comparé à l’index **avant** d’être lu : une empreinte fausse est
refusée en le nommant (« le fichier servi par cdn.jsdelivr.net n’a pas l’empreinte attendue : refusé »), et l’adresse suivante
essayée. Le WOFF est remis en sfnt (`io/woff.ts`, tables décompressées par `DecompressionStream`, bornées : 256 tables, 32 Mo) pour
que les lecteurs GPOS et GSUB du projet le lisent comme une fonte déposée ; un WOFF2 est refusé. Les deux sous-ensembles se
composent : une lettre vient du premier fichier qui la possède, le crénage ne joue qu’entre lettres d’un même fichier. Le fichier
vérifié se garde dans **Cache Storage** (`svg-polices-v1`), un confort : absent ou refusé, il se retélécharge ; relu du cache, il
est revérifié. **Un seul `fetch` existe dans `src/`**, et un test le garde.

### 6. Le sélecteur

Le `<select>` « Police » reste (fontes livrées, téléchargées, déposées), avec « Aperçu forme / ligne » au clic seulement. À côté,
« Toutes les polices » ouvre, dans le flux, une feuille : recherche (sans accents ni casse, un nom qui commence par le mot d’abord),
filtres (genre, tracé — contour ou trait unique —, source), **polices du document** en tête avec « Remplacer partout » (une entrée
d’historique, Ctrl+Z la défait), **favoris** et **récentes** (`svg.polices.favoris`, `svg.polices.recentes`, lus avec méfiance),
**vos polices** (déposer un fichier ; « Polices de cet appareil » par Local Font Access seulement si `queryLocalFonts` existe,
derrière sa garde, `docs/navigateurs.md`), et le pied qui dit l’accord et le retire. La longue liste **se fenêtre** au-delà de
150 lignes (ADR-0008) : plus de deux mille polices, une vingtaine de lignes dans la page. Les noms s’écrivaient dans la police de
l’interface : **aucun aperçu ne télécharge rien** ; depuis l’ADR-0026, chaque nom se dessine dans sa propre fonte (la fonte quand
on l’a, sinon un aperçu préparé dans une annexe voisine), toujours sans aucune requête, et la liste ne montre qu’**une ligne par
nom de famille** (la livrée, sinon Google Fonts, sinon Fontshare ; filtrer une source montre toutes les siennes). Une police du catalogue choisie montre ses autres styles (« Style de la police »).
Une police du catalogue absente d’un texte rouvert se propose au téléchargement (« Télécharger Roboto »), à sa version quand
l’index la connaît encore, sinon à la version courante, et c’est dit.

### 7. Conformité

Une police téléchargée **n’est pas redistribuée** : la personne la télécharge depuis sa source, et le SVG n’en porte que les
contours (permis par chaque licence admise). `THIRD-PARTY-NOTICES.md` reste généré et ne liste que ce qui est dans `dist/` ; il dit
désormais que `polices-catalogue.js` n’est qu’un index, sans fonte. La boîte « À propos et crédits » de l’éditeur nomme, pour
chaque police téléchargée qu’emploie le dessin, sa source et sa licence (avec son lien).

## Conséquences

- **Octets** : aucune référence existante ne bouge (`ecriture-stable.test.ts` vert sans `ACTUALISER_REFERENCES`, les dix fontes
  livrées intactes). La seule lecture qui change : un `data-ed-police="c-…"` (qu’aucun programme n’écrivait) se garde au lieu
  d’être remplacé.
- **Poids** : la page autonome prend 38 Ko (le sélecteur, le téléchargement, la lecture du WOFF), le bundle d’embarquement 45 Ko ;
  `dist/` gagne `polices-catalogue.js` (1,33 Mo, 0,66 Mo compressé), chargé à la demande.
- **Tests** : unitaires (registre et liste blanche, index commis relu en entier, identité figée, adresses et repli, refus de la
  validation, consentement, empreinte fausse, cache empoisonné, WOFF, option d’hôte, `fetch` dans `io` seul) ; en navigateur, une
  police d’essai servie par `page.route` (rien sans accord ; empreinte vérifiée ; texte composé qui garde `c-…` ; « Remplacer
  partout » ; crédits ; empreinte fausse refusée ; accord retiré ; hôte sans option), le test réseau coupé ouvre le **vrai** index
  et choisit une police sans l’accepter, et axe audite le sélecteur (clair, sombre, téléphone) et le dialogue. Aucun vrai réseau.
- **Navigateurs** : `fetch`, `crypto.subtle` (contexte sécurisé : https, localhost, `file://` selon le navigateur ; vérifié en
  Chromium depuis `file://`), `caches` et `queryLocalFonts` entrent au tableau de `docs/navigateurs.md`, chacun avec son repli.
- **Limites, honnêtement** : la version de chaque paquet est la dernière au jour de l’instantané (pas de délai de deux semaines
  comme pour l’ADR-0023) ; la catégorie des fontes de Velvetyne est « Affiche » par défaut (le dépôt ne la dit pas) et leur nom
  est celui du dépôt ; les fontes variables de Velvetyne sont écartées ; Fontshare et le reste de Collletttivo restent `aVerifier` ;
  une police téléchargée sert le temps de la session ; à la suivante, elle se relit du cache quand le navigateur l’a gardée, toujours après l’accord ; un texte rouvert dans une police du catalogue attend un geste (« Télécharger … ») plutôt que de se télécharger seul ; la
  politique de sécurité d’un hôte doit autoriser les quatre serveurs en `connect-src` (`docs/integration.md`).

## Alternatives écartées

- **Google Fonts directement** (`fonts.googleapis.com`) : pas d’adresse versionnée ni d’empreinte publiée, et la CSS renvoie du
  WOFF2 selon le navigateur. Fontsource sert les mêmes fontes en paquets npm versionnés.
- **Embarquer l’index dans la page** : 1,3 Mo de plus pour tous, même pour qui n’ouvre jamais l’outil Texte.
- **Construire l’index au build** : le build contacterait le réseau, et deux builds d’un même commit pourraient différer.
- **Télécharger sans demander, ou demander une fois pour tous les serveurs** : contraire à la promesse de l’ADR-0017 ; l’accord
  par serveur dit exactement qui sera contacté.
- **Faire confiance au serveur (HTTPS) sans empreinte** : un miroir d’une autre version ou un serveur compromis ferait lire des
  octets inattendus à opentype.js ; l’empreinte coûte un hachage.
- **Le WOFF2** : opentype.js ne le lit pas, et le décompresser (Brotli) demanderait une bibliothèque de plus.
