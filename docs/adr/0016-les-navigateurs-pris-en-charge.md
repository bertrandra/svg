# ADR-0016 — Les navigateurs pris en charge : une garde qui nomme, des replis écrits, trois moteurs en CI

**Date :** 24 octobre 2026, amendée le 25 octobre 2026 (Firefox exigé, voir « Amendement »)
**Statut :** acceptée (prolonge les ADR-0007 et 0011) ; aucun octet écrit ne change

## Contexte

La page et l'éditeur embarqué ne disaient pas quels navigateurs ils servaient. Les tests de navigateur ne tournaient
que sous Chromium ; le code employait `color-mix()`, `:has()` et un lookbehind d'expression régulière
(`util/cssPortee.ts`) ; or une expression que Safari ne sait pas analyser tue tout le bundle d'embarquement, et un
navigateur trop ancien laissait une page blanche. Enfin « un SVG réécrit aujourd'hui doit l'être à l'identique
demain » ne valait que sous Node, donc V8 : `Math.sin`, `cos`, `atan2`, `hypot`… ne sont pas fixés au dernier bit
par la norme.

## Décision

1. **Une promesse écrite, en trois niveaux** (`docs/navigateurs.md`) : pris en charge, les deux dernières versions
   majeures de Chrome, Edge, Firefox et Safari (macOS, iOS, iPadOS) et Chrome pour Android ; plancher de la
   promesse, Chrome et Edge 111, Firefox 113, Safari et iOS Safari 16.4, où tout existe sans repli ; plancher
   technique, mesuré et non promis, Chrome et Edge 96, Firefox 92, Safari 15.4, où la page sert avec ses replis.
2. **La promesse est un texte qu'un test confronte au code** (`tests/unit/depot/navigateurs.test.ts`) : une
   fonctionnalité employée dans `src/` ou les feuilles sans figurer au tableau, une version au-dessus du plancher
   sans repli écrit, un saut de test sans sa raison écrite, une extension WebAssembly nouvelle du traceur font échouer
   `npm test`. Le bundle est compilé en ES2020 ; les API d'ES2022 et plus qu'esbuild ne complète pas (`at()`,
   `findLast`, `toSorted`, `structuredClone`, `replaceAll`…) sont interdites dans `src/`.
3. **Une garde de démarrage nomme ce qui manque, en français.** Le calcul est pur (`util/capacites.ts` :
   `manquantes`, `phraseManquantes`) et la sonde reçoit son hôte en paramètre (`io/capacites.ts`), pour qu'un test
   lui donne un faux navigateur. Trois cas : une API de base manque (`Object.hasOwn`, `PointerEvent`, `Blob` et
   `URL.createObjectURL`) et la page dit « Ce navigateur est trop ancien » avec ce qui manque, l'éditeur embarqué
   ouvrant une alerte qui se ferme comme lui ; une capacité n'est utile qu'à un geste (le canvas pour lire une image,
   WebAssembly pour vectoriser) et seul ce geste le dit ; le moteur ne s'exécute pas, et un paragraphe d'attente
   honnête déjà dans la page reste à l'écran. Jamais de page blanche.
4. **Des replis plutôt que des exigences** : neuf jetons `repli-*` (`src/styles/jetons.ts`, ADR-0007) posés par un bloc
   `@supports not (color: color-mix(…))` sous chaque règle qui emploie `color-mix()` (une déclaration précédente ne
   peut pas servir de repli : un `color-mix()` qui lit `var()` n'est invalide qu'à l'usage) ; `:has()` remplacé par un
   sélecteur voisin ; le lookbehind retiré de `util/cssPortee.ts` (sortie identique sur les feuilles livrées) ; `vh`
   avant `dvh` ; `-webkit-user-select` et `touch-action: manipulation` pour Safari.
5. **Des tests de navigateur indépendants du moteur, en matrice.** `tests/e2e/aide.ts` lance le moteur que nomme
   `NAVIGATEUR` (`chromium` par défaut, `firefox`, `webkit`) ; un test propre à un moteur passe par
   `sauteSauf(moteurs, raison)`, jamais en silence, et sa raison est recopiée mot pour mot dans `docs/navigateurs.md`
   (deux sauts quand la matrice a été posée, aucun depuis l'amendement). Le job `navigateur` de la CI joue la suite entière dans les trois moteurs que
   Playwright 1.56.1 embarque, `fail-fast: false` pour avoir les trois résultats à chaque passage.
6. **Firefox et WebKit ne bloquent pas encore** (`continue-on-error: ${{ matrix.navigateur != 'chromium' }}` dans
   `.github/workflows/ci.yml`) : ils n'avaient jamais tourné en CI quand la matrice a été posée, et les versions
   minimales du tableau ont été relevées de mémoire, sans réseau ni Firefox ni WebKit sous la main ; un premier
   passage rouge ne devait pas bloquer toute PR. **Pour les rendre bloquants** : obtenir des premiers passages verts
   dans les deux moteurs, retirer `continue-on-error` et en faire des contrôles requis de la branche (le TODO du
   workflow), puis écrire « vérifié » pour eux dans `docs/navigateurs.md` ; en chemin, confirmer ce que la page laisse
   ouvert (le `tap()` de Firefox, le téléchargement d'un `blob:` sous WebKit, `localStorage` sous `file://`,
   `:focus-visible` après un `focus()` par script) et lever le saut de `contraste-force.e2e.ts` si l'émulation
   `forcedColors` agit hors de Chromium.
7. **La reproductibilité vaut aussi d'un moteur à l'autre** : `tests/e2e/reecriture.e2e.ts` joue la même rotation,
   inclinaison et mise à l'échelle de courbes et d'arcs dans chaque navigateur et exige les octets du moteur sous Node.
   Un écart sur Firefox ou WebKit est un événement de version majeure à annoncer, pas un bruit.

## Amendement — 25 octobre 2026 : Firefox exigé, le contraste forcé dans les trois moteurs

- **Passage vert constaté.** Firefox 142 a passé la suite entière en CI sur la fusion de `cc8be02` : 1 071 tests passés,
  8 ignorés, aucun échec. Les 8 ignorés étaient le fichier `contraste-force.e2e.ts`, alors sauté hors de Chromium. Le
  passage suivant (fusion de `5107e87`) a eu un échec, une transition lue en route par le test, corrigé. **Firefox est
  exigé** : `continue-on-error: ${{ matrix.navigateur == 'webkit' }}` dans `.github/workflows/ci.yml`. Reste à en faire un
  contrôle requis de la branche, réglage du dépôt hors du workflow.
- **WebKit n'est pas encore exigé.** Son second passage en CI a fini (60 minutes) avec 20 échecs sur 1 079. Firefox et WebKit
  ont pu être installés en local pour la première fois : chaque échec a été rejoué, sa cause établie, et corrigé (quatre
  causes de test et une de la page, `docs/navigateurs.md`, « Passages suivants »). Il deviendra exigé, par la même ligne,
  après un passage vert en CI.
- **Le saut du contraste forcé est levé** : l'émulation `forcedColors` agit sous Firefox et WebKit. Aucun test ne saute plus.
- **Un défaut de la page sous WebKit, trouvé ainsi** : un focus posé pendant un `keydown` dont le geste par défaut est empêché
  n'y reçoit pas `:focus-visible` ; les déplacements aux flèches (menus, pastilles, onglets de l'accueil) demandent
  maintenant l'anneau par `focus({ focusVisible: true })` (`zones/commun/focusClavier.ts`, ligne `focusVisible` du tableau).
- **Ce que le point 6 laissait ouvert, confirmé** : le `tap()` de Firefox, le téléchargement d'un `blob:` sous WebKit,
  `localStorage` sous `file://` ; infirmé : `:focus-visible` après une touche Maj et un `focus()` par script, que seul Chromium
  applique (les tests arrivent au focus par Tab).

## Conséquences

- `tests/e2e/compatibilite.e2e.ts` prouve les gardes (API de base retirée avant l'ouverture, WebAssembly seul absent,
  JavaScript coupé) et les replis (chaque teinte `repli-*` égale ce que `color-mix()` calcule, à un pas de 8 bits).
- Les couleurs de repli sont fixes : un hôte qui change `--cyan` ne les change pas.
- La vectorisation d'une image est reproductible dans un navigateur donné, pas forcément de l'un à l'autre : le
  décodage de l'image est celui du navigateur.
- Ajouter une fonctionnalité suit quatre pas écrits (`docs/navigateurs.md`, « Ajouter une fonctionnalité ») : `npm test`
  dit laquelle manque au tableau.
- Ce qu'aucune automatisation ne prouve (lecteurs d'écran réels, contraste élevé de Windows, tactile réel, claviers
  non QWERTY, impression) est une liste à rejouer à la main : `docs/verification-manuelle.md`.
- Limites, honnêtement : les versions minimales sont à recouper avant d'être citées hors du dépôt ; aucune version
  ancienne n'est exercée (le plancher technique repose sur l'audit statique) ; Safari sur Mac envoie le pincement du
  pavé tactile en évènement de geste, non traité.
