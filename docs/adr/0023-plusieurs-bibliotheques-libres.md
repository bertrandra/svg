# ADR-0023 — Plusieurs bibliothèques libres, chargées à la demande

**Date :** 25 octobre 2026
**Statut :** acceptée (prolonge les ADR-0003 et 0017 ; s'appuie sur l'ADR-0013 pour le stylo) ; **aucun octet existant ne
change** : l'annexe `bibliotheque.js`, les 4 134 empreintes de game-icons et les références d'écriture sont intactes

## Contexte

Le propriétaire demande « d'autres bibliothèques SVG open ». La bibliothèque n'avait qu'une source, game-icons.net
(ADR-0003) : 4 134 silhouettes pleines, très tournées vers le jeu (armes, fantastique), pauvres en objets du quotidien, en
santé et en pictogrammes simples. Le contexte Cricut (ADR-0013) appelle aussi des **formes en ligne**, que le stylo dessine
d'un seul trait, quand game-icons n'a que des surfaces à découper.

Le produit est **propriétaire** (ADR-0017) : seule une licence qui permet la redistribution dans un produit fermé, sans
copyleft, est admissible, et sa notice doit voyager avec le produit.

## Décision

1. **Les sources sont des données** : `model/sourcesFormes.ts` décrit chaque source (identifiant, qui est aussi le préfixe
   de son origine ; nom ; paquet `@iconify-json` épinglé exactement ; adresse ; titulaire ; licence SPDX et son nom court ;
   mention exigée dans le fichier ou non ; ordre des mots de ses identifiants ; plan ; variantes retenues et leur nature
   `plein` ou `ligne` ; suffixes écartés ; exclusions ; annexe et globale ; poids annoncé). `SOURCES_ORIGINE` (credits.ts),
   le build, les mentions et l'interface le lisent ; un test le confronte aux paquets installés (`package.json`, `info.json`,
   `package-lock.json` : la licence déclarée ; l'épinglage exact) et à la copie de chaque licence (le titulaire y figure).
2. **Cinq sources retenues**, toutes vérifiées dans le paquet installé :

   | Source | Paquet | Licence | Formes gardées | Nature | Annexe |
   |---|---|---|---|---|---|
   | game-icons (par défaut) | `@iconify-json/game-icons` 1.2.4 | CC BY 3.0 | 4 134 | plein | `bibliotheque.js`, 6,8 Mo |
   | Material Design Icons (Pictogrammers) | `@iconify-json/mdi` 1.2.3 | Apache-2.0 | 7 126 (normales et « outline », toutes deux des surfaces) | plein | `bibliotheque-mdi.js`, 3,6 Mo |
   | Phosphor | `@iconify-json/ph` 1.2.2 | MIT | 2 848 (« fill » 1 424, « thin » 1 424) | plein et ligne | `bibliotheque-ph.js`, 1,8 Mo |
   | Tabler | `@iconify-json/tabler` 1.2.42 | MIT | 5 698 (« filled » 1 007, trait 4 691) | plein et ligne | `bibliotheque-tabler.js`, 2,8 Mo |
   | Healthicons | `@iconify-json/healthicons` 1.2.13 | MIT | 1 466 (pleines 733, « outline » 733) | plein et ligne | `bibliotheque-healthicons.js`, 1,9 Mo |
   | Lucide | `@iconify-json/lucide` 1.2.142 | ISC | 1 861 | ligne | `bibliotheque-lucide.js`, 0,9 Mo |

   Les versions sont celles publiées au moins deux semaines avant leur intégration. Aucune annexe ne dépasse 10 Mo : aucun
   sous-ensemble n'est nécessaire au-delà des variantes (Phosphor garde 2 de ses 6 graisses ; Healthicons écarte ses copies
   à 24 px et ses « negative » ; les icônes marquées `hidden`, retirées par leur jeu, sont écartées partout).
3. **Une ligne est ce que le stylo suit.** Lucide et le trait de Tabler sont des tracés (`fill="none"`, `stroke`) : la lecture
   de l'éditeur les garde en traits, la variante est marquée `ligne` et `trace: 'trait'`. Les lignes de Phosphor (« thin ») et
   de Healthicons (« outline ») sont dessinées comme des surfaces étroites : marquées `ligne` et `trace: 'contour'`, le stylo
   en suit les deux bords, très proches. La ligne médiane (une autre branche) pourra un jour les ramener à un seul trait.
4. **Toutes les formes partagent le plan de leur source** : chaque icône est posée dans un groupe mis à l'échelle sur un plan
   de 480 (5 pouces à 96 unités par pouce, ADR-0013), par un facteur exact en binaire (×20 pour 24, ×10 pour 48, ×1,875 pour
   256) ; game-icons garde son plan de 512. Chaque forme passe par la lecture de l'éditeur au build ; une forme refusée
   n'entrerait pas dans l'annexe et le build le dirait (aucune ne l'est aujourd'hui).
5. **Une annexe par source, à la demande.** `scripts/bibliotheque.mjs` écrit `bibliotheque.js` comme avant (même
   construction, mêmes octets : vérifié par comparaison) et `bibliotheque-<source>.js` pour chaque source libre ; l'éditeur
   les charge par une balise `<script>` (`io/bibliotheque.ts`, `chargerSource`), à la première pastille qui les demande. Une
   annexe d'une autre source, ou un fichier étranger, est refusée (`normaliserSource`).
6. **La provenance s'étend, la mention reste CC BY.** Une forme insérée ou ouverte garde son origine (`mdi:heart`,
   `lucide:heart`) : l'écriture pose `data-origine` sur son `<path>` comme pour game-icons. Mais seule une origine dont la
   licence veut la mention dans le fichier (`mentionDansLeFichier`, CC BY) fait écrire un `<metadata>`, un sujet de PDF ou un
   commentaire de découpe ; un dessin qui mêle game-icons et une source libre nomme game-icons seul dans la phrase et toutes
   les origines dans la liste. MIT, ISC et Apache 2.0 demandent que leur notice accompagne le logiciel : elle est dans
   `THIRD-PARTY-NOTICES.md` et `MENTIONS.txt` (générés, avec le texte de chaque licence copié de son dépôt amont dans
   `scripts/licences/`, le paquet ne le livrant pas), et dans « À propos et crédits ».
7. **Les noms passent par le lexique.** `model/lexiqueSources.ts` ajoute 2 273 mots (les lettres, sigles et codes gardés tels
   qu'on les écrit en français : A, PDF, 4G), 176 noms composés (`credit-card` : « carte bancaire ») et 26 sens d'interface
   (`top` : « haut » et non « toupie », `off` et `slash` : « barré »), qui ne valent que pour les sources libres : le lexique de
   game-icons l'emporte en cas de doublon et aucun de ses noms ne change. Ces jeux nomment tête en premier (« bell-off » : «
   cloche barré ») ; Healthicons, en anglais ordinaire (« blood-bag » : « poche de sang »). Le test « moins de 3 % de noms
   avec un mot anglais » tient **sur chaque source** (0 % aujourd'hui) ; une variante dont deux formes porteraient le même nom
   prend un qualificatif (« cœur en contour » pour la variante « outline » de Material).
8. **Le classement est le même.** Les règles d'EVENEMENTS rangent toutes les sources ; une source peut seulement retirer un
   mot d'un événement (`saufParEvenement`) : dans un jeu d'interface, `arrow` est une direction et non une arme, `slash` une
   barre et non un coup d'épée ; dans un jeu de santé, le sang et les os sont des soins, pas Halloween. Jamais une forme
   rangée à la main. Chaque événement garde au moins dix formes, toutes sources confondues. Le classement s'indexe désormais
   par premier mot (`classer`, même résultat, quarante fois plus rapide : vingt mille formes se classent en 0,2 s).
9. **Les marques sont écartées par règle** : `MOTS_DE_MARQUE` (Google, Microsoft, Xbox, Bluetooth, NFC, LEGO, Mickey…), la
   catégorie « Brand / Logo » de Material, le préfixe `brand-` de Tabler, le mot `logo` partout, et quelques identifiants
   nus de Lucide. Le droit des marques ne se cède pas par une licence de droit d'auteur : une icône libre d'un logo n'est pas
   un logo libre. Un test vérifie qu'aucune forme gardée ne porte un de ces mots.
10. **L'interface** : dans la bibliothèque (page et éditeur), deux groupes de pastilles titrés, « Source » (« Toutes »,
    game-icons, Material, Phosphor, Tabler, Healthicons, Lucide) et « Nature » (« Toutes », « Pleines (découpe) », « En ligne
    (stylo) ») ; game-icons est choisie à l'ouverture, une autre source se charge à sa pastille (« Toutes » les charge toutes,
    une nature charge celles qui la proposent), et le décompte dit ce qui se charge. La recherche couvre toutes les sources
    chargées ; chaque vignette dit sa source dans son nom accessible et son infobulle. Au stylo d'un contexte de production,
    « En ligne » vient d'abord (`NATURE_PROPOSEE_PAR_PROCEDE`, une table de textes : le procédé « stylo » arrive par sa
    propre branche, rien n'attend son type). Les corrections de la page se clefent `source:id` hors game-icons.

## Exclusions, et pourquoi

- **Les jeux d'emoji** (OpenMoji, Twemoji, Noto Emoji, Fluent Emoji) : l'ADR-0003 les a rejetés (pictogrammes multicolores,
  trop petits pour servir de formes) ; OpenMoji est de plus sous CC BY-SA 4.0, dont le partage à l'identique est incompatible
  avec un produit fermé.
- **Les logos de marques** (Simple Icons, CC0) : la licence couvre le dessin, pas la marque ; reproduire un logo dans un
  produit et sur des objets découpés relève du droit des marques, que nulle licence d'icône ne lève.
- **Les agrégateurs à licences mêlées** (SVG Repo) : chaque icône a sa licence, souvent non vérifiable ; impossible d'en tenir
  un registre honnête.
- **Remix Icon** : le paquet `@iconify-json/ri` déclare encore Apache-2.0, mais le dépôt amont est passé à la « Remix Icon
  License v1.0 » (2026), qui interdit notamment de distribuer les icônes comme une bibliothèque d'icônes : précisément ce que
  serait une annexe. Écarté tant que la licence n'est pas relue.
- **Toute autre licence** que MIT, ISC, Apache-2.0, CC0 ou CC BY : un test refuse une source du registre qui en porterait une.

## Conséquences

- **Aucun octet existant ne bouge** : `bibliotheque.js` est identique à l'octet, les empreintes de game-icons et toutes les
  références d'écriture tiennent. Chaque source libre a son fichier d'empreintes
  (`tests/fixtures/svg/bibliotheque-<source>.empreintes.txt`, 18 999 formes), réécrit seul par
  `ACTUALISER_REFERENCES=1 npx vitest run tests/unit/engine/bibliotheques-libres-stables.test.ts`. Trois références neuves
  (`provenance-sources`, `provenance-sources-decoupe`, `provenance-mixte`).
- Mettre à jour un jeu d'icônes est un changement de version mineure (ADR-0003) qui ne touche que son fichier d'empreintes.
- La liste des vignettes de la page passe de 4 134 à 23 133 formes quand tout est chargé : la recherche s'indexe sur ce que
  le filtre montre, en une fraction de seconde.
- Le fuzzing, nourri des nouvelles références, a trouvé une peinture « mot » de plus de 41 lettres que la lecture recopiait
  telle quelle (`peintureSure`) : elle est désormais bornée comme les invariants d'écriture (aucune couleur n'a un nom si long),
  avec sa régression (`tests/fixtures/regressions/peinture-nom-trop-long.svg`).
- **Limites, honnêtement** : la licence de Material (« Pictogrammers Free License ») dit que certaines icônes sont
  « redistribuées sous leurs licences respectives » sans les nommer ; on s'en tient à la déclaration Apache-2.0 du paquet et
  à l'exclusion des marques, à faire relire par un juriste avec la licence du produit. Les textes de licence copiés l'ont été
  le 25 octobre 2026 sur la branche principale de chaque dépôt, pas à la version exacte du paquet. Les lignes « contour » de
  Phosphor et Healthicons font un double trait au stylo. La traduction des noms est mot à mot, sans accord en genre (« cloche
  barré »), comme celle de game-icons. Les poids annoncés dans les pastilles (`poidsMo`) se recopient du build : un test ne
  les recalcule pas.

## Alternatives écartées

- **Une seule annexe pour tout** (23 000 formes, 18 Mo) : l'ouverture de la bibliothèque doublerait de poids pour des formes
  que la plupart des personnes ne demanderont pas.
- **Écrire la mention de chaque licence dans chaque dessin** : des octets de plus que ces licences ne demandent pas, et une
  phrase de plus à garder stable ; l'origine (`data-origine`) suffit à savoir d'où vient une forme.
- **Traduire les noms par un service** : ni réseau ni hasard dans le cœur pur ; un lexique en données se relit et se corrige.
- **Ranger à la main les icônes d'interface** : contraire à l'ADR-0003 ; une exclusion par source et par événement suffit.
