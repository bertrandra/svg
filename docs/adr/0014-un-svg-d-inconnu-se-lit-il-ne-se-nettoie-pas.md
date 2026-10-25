# ADR-0014 — Un SVG d'inconnu se lit, il ne se nettoie pas

**Date :** 24 octobre 2026
**Statut :** acceptée (prolonge les ADR-0001, 0009 et 0010) ; aucun octet écrit par l'éditeur ne change

## Contexte

L'éditeur ouvre des SVG qu'il n'a pas écrits : un fichier déposé, un code collé, l'option `svg` d'un hôte, les
formes d'une bibliothèque d'hôte, un brouillon laissé dans le navigateur (`docs/securite.md`, § 2). L'ancien
`nettoyerSvg` cherchait le danger par des remplacements d'expressions régulières sur le texte. Un corpus hostile,
un fuzzer et un navigateur ont trouvé quatorze constats (`docs/securite.md`, § 6), dont :

- `<scr<script></script>ipt>` : le retrait en une passe recomposait un `<script>` dans le SVG téléchargé sans
  édition ; `html:script`, `x:href`, `xml:base`, un `url(` obscurci par échappement CSS passaient de même ;
- des temps quadratiques (`url(`, `/*` ou `scale(` non fermés : plusieurs minutes pour quelques mégaoctets) et du
  travail non borné (50 000 règles de style, un chemin cloné 20 000 fois par `<use>`) ;
- un `RangeError` à 10 000 niveaux d'imbrication, des `NaN`, `Infinity` et `width="0"` dans un SVG enregistré ;
- un stockage empoisonné qui faisait planter l'accueil, une option `baseAnnexes` en `data:` qui exécutait du code.

Aucun n'exécutait de script dans l'éditeur lui-même ; tous passaient par le fichier ou le texte que la personne
récupère ensuite. L'export sans modification depuis l'accueil rend le SVG d'origine nettoyé, pas une réécriture :
le nettoyage est donc une barrière de sécurité, pas un confort.

## Décision

1. **On lit le document, on ne rabote pas son texte.** `util/xml.ts` découpe par un balayage linéaire écrit à la
   main (aucune expression régulière à groupes imbriqués) et **ne développe jamais une entité** déclarée par un
   DOCTYPE, ni interne, ni externe, ni paramètre : la bombe de rires, l'explosion quadratique et XXE restent des
   textes inertes. Ses bornes (64 Mo, 1 000 000 d'éléments, 1 024 niveaux, 1 000 attributs, des noms de
   256 caractères) refusent au-delà en le nommant.
2. **L'assainissement réémet une liste blanche** (`util/assainirSvg.ts`, derrière `nettoyerSvg`) : des éléments
   permis (le vocabulaire graphique de SVG 1.1 et 2 ; un élément hors liste part avec son contenu), des attributs
   permis (`on*` sous toute forme, `xml:base`, les attributs HTML à adresse et les préfixes inconnus partent), des
   adresses permises (`#ancre`, ou une image `data:` PNG, JPEG, GIF ou WebP sur `<image>`/`<feImage>`), et un CSS
   résolu de ses échappements et commentaires puis nettoyé jusqu'à stabilité. La sortie est faite de jetons entiers,
   jamais d'un texte raboté : un retrait ne peut rien recomposer. C'est du XML bien formé, une seule racine `<svg>`,
   sans commentaire, instruction de traitement, DOCTYPE ni entité. Un attribut répété est un refus. Seul le RDF des
   licences survit dans `<metadata>`, et un renvoi externe de `<use>` passe dans l'attribut inerte
   `data-href-externe` pour que la lecture le refuse (ADR-0009).
3. **La lecture est bornée et ne lève jamais.** `edition/limites.ts` borne ce que le dessin coûte (1 500 éléments
   ouverts à la fois clones compris, 8 millions de caractères de tracé comptés par clone, ± 1 milliard pour une
   coordonnée, 2 000 000 de confrontations règle × élément, les règles rangées par classe, identifiant et type) ;
   `edition/lecture.ts` refuse un plan de moins de 0,001 ; une pile qui déborderait malgré tout devient un refus
   nommé. Une peinture libre ne s'écrit plus : `peintureSure` la limite à `#hex`, un mot-clé ou une fonction de
   couleur à un niveau.
4. **L'écriture régénère tout depuis le modèle** (ADR-0001) : un `<svg>` et des `<path>`, des nombres, des couleurs et
   des mots-clés ; même un nettoyage contourné ne laisserait passer ni script, ni adresse, ni feuille de style.
5. **Ce qui vient de l'hôte ou du stockage se valide champ par champ.** `verifierOptions` (`zones/embarque.tsx`)
   refuse en français un `baseAnnexes` en `javascript:`, `data:`, `blob:`, `vbscript:` ou `about:`, un `svg` ou un titre
   démesuré, une `bibliotheque` sans `entrees` ; un `nuancier` mal formé est écarté. Le brouillon, les versions, les
   corrections et la bibliothèque d'hôte sont validés en type et en longueur, clés `__proto__`, `constructor` et
   `prototype` retirées ; le stockage reste injecté et ne lève jamais (ADR-0010).
6. **Chaque affirmation a sa preuve exécutable** ; une affirmation qu'aucun test ne vérifie ne figure pas dans
   `docs/securite.md` :
   - des invariants de sortie écrits indépendamment de `src/` (`tests/unit/securite/invariants.ts`) ;
   - un corpus hostile de **166 fichiers** (`tests/fixtures/hostile/`, un par vecteur, avec son attendu dans
     `index.json` : « s'ouvre » ou « est refusé ») ;
   - des entrées volumineuses chronométrées (`tests/unit/securite/volumineux.ts`) ;
   - un fuzzer à graine fixe (`tests/unit/securite/fuzz.test.ts`, 12 000 entrées par défaut, aucune exception, aucun
     appel au-delà de 1,5 s, relecture de sa propre écriture idempotente ; `FUZZ_ITERATIONS` et `FUZZ_GRAINES` pour
     une exploration longue) et ses régressions réduites (`tests/fixtures/regressions/`) ;
   - le stockage empoisonné (`tests/unit/securite/stockage-empoisonne.test.ts`) ;
   - en navigateur (`tests/e2e/securite.e2e.ts`), chaque fichier du corpus par code collé, fichier déposé et
     option `svg` : aucun script, aucune requête, aucune boîte de dialogue, et des exports SVG, PNG et PDF rouverts
     en `<img>`, en ligne et en document de premier niveau.
7. **Ce que l'éditeur ne peut pas faire reste écrit pour l'hôte** (`docs/securite.md`, § 5) : servir ses SVG en
   `image/svg+xml` avec `X-Content-Type-Options: nosniff` et jamais un SVG d'utilisateur sur l'origine de
   l'application en navigation de premier niveau ; poser une CSP (un départ est proposé ; les tests tournent sans,
   le pire cas) ; isoler dans une `<iframe sandbox>` s'il veut cloisonner CSS et stockage ; ne pas insérer en HTML
   ce que rend `onBrouillon`, jamais passé par `nettoyerSvg` ; ne jamais passer à `baseAnnexes` une valeur que
   l'utilisateur contrôle (une adresse `http(s)` tierce n'est pas refusée : c'est un choix de l'hôte).

## Conséquences

- Les octets que l'éditeur écrit ne changent pas : les références de `tests/fixtures/svg` et les empreintes de la
  bibliothèque tiennent, et `nettoyage-import` fige la sortie du nettoyage lui-même
  (`tests/unit/engine/ecriture-stable.test.ts`).
- Les bornes sont hautes exprès : un refus d'un SVG légitime est un défaut. Le pire cas accepté est un chemin d'un
  million de points, lent (sept secondes de lecture dans `docs/securite.md`) mais fini ; le temps est borné par
  construction (balayages linéaires, plafonds), pas mesuré à chaque appel.
- **Conséquence assumée** : comme aucune entité n'est développée, un vieil export d'Illustrator qui déclare
  `xmlns="&ns_svg;"` est lu avec le `xmlns` de SVG, et une entité employée ailleurs que dans les espaces de noms n'est
  pas reprise.
- Ajouter un vecteur, c'est un fichier `tests/fixtures/hostile/<famille>-<vecteur>.svg` et sa ligne dans `index.json` :
  le test du corpus échoue si l'un des deux manque (`docs/securite.md`, § 8).
- Limites, honnêtement : le stockage est validé, pas chiffré, et partagé avec tout script de l'origine ; l'éditeur ne
  durcit pas la page qui l'héberge ; l'option `svg` de l'embarquement est lue par `lireDessin` sans nettoyage
  préalable (l'éditeur n'affiche que le modèle à plat).

## Alternatives écartées

- **Durcir les expressions régulières** du nettoyage : chaque correction laissait la possibilité d'une
  recomposition (`<scr<script></script>ipt>`) ou d'un temps quadratique sur une balise jamais fermée ; une liste
  blanche réémise ferme les deux à la fois.
- **Un `DOMParser` du navigateur** : le cœur pur ne touche pas au DOM (`tests/unit/architecture.test.ts`), les tests
  tournent sous Node, et aucun chemin du code n'emploie `innerHTML`, `DOMParser` ni `eval`.
- **Développer les entités** pour lire fidèlement les vieux exports : c'est ouvrir la porte aux bombes et à XXE pour un
  cas rare, que la lecture du seul `xmlns` couvre.
