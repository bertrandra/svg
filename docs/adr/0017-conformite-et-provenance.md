# ADR-0017 — Conformité et provenance : la mention voyage avec la forme, rien ne se recopie

**Date :** 24 octobre 2026
**Statut :** acceptée (prolonge l'ADR-0003) ; **événement de version majeure** pour un dessin qui contient une forme
créditée, et pour lui seul

## Contexte

Les 4 134 formes de la bibliothèque viennent de game-icons.net, sous CC BY 3.0 (ADR-0003) : la licence veut une
mention à chaque redistribution, jusque dans le fichier produit, et elle n'était que dans le pied de la page d'accueil
(commit `29b9cca`). Les fontes (SIL OFL 1.1) et les bibliothèques (MIT, Apache) demandent que leur copyright et leur
texte accompagnent `dist/`. La licence du projet lui-même n'était pas écrite. Enfin la page autonome chargeait ses
polices d'interface chez Google : l'adresse IP de la personne partait chez un tiers à chaque ouverture, ce qui
contredisait « Rien ne quitte votre navigateur » (`docs/securite.md`, constat 14).

## Décision

1. **Une seule source pour les crédits** : `src/model/credits.ts`, pur, dans `model` parce que l'écriture (`engine`)
   doit connaître la mention et ne peut pas importer une zone React. Il porte les sources de formes créditées
   (`SOURCES_ORIGINE`), les composants redistribués (`COMPOSANTS` : paquet, licence SPDX, titulaire) et les phrases de
   mention. La boîte « À propos et crédits » (menu Fichier, pied de page), l'écriture du SVG et `scripts/mentions.mjs`
   le lisent tous trois.
2. **La provenance est un champ de la forme, présent seulement quand il y a quelque chose à créditer.**
   `Forme.origine` (par exemple `game-icons:3d-glasses`) n'existe que pour une forme issue d'une source créditée
   (`engine/edition/provenance.ts`). Les opérations la gardent : dupliquer, coller, insérer, séparer ; combiner, les
   booléens (la forme soustraite comprise) et le regroupement gardent l'union des origines. Seules s'écrivent des
   origines connues et bien formées (`origineValide`), triées et sans doublon (`normaliserOrigines`) : une origine
   inconnue lue dans un SVG étranger est écartée, rien d'arbitraire n'entre dans la mention.
3. **Aucun octet de plus sans forme créditée.** Dès qu'une forme **visible** porte une origine, l'écriture ajoute
   `data-origine` sur son `<path>` (pour que la relecture la retrouve) et un `<metadata>` en tête du SVG (la mention
   lisible, puis la liste des origines) ; une forme masquée ne crédite plus rien. Le PDF porte la mention dans
   `/Subject`, le SVG de découpe en commentaire (jamais deux tirets de suite), et seulement s'il y a une forme
   créditée ; un PNG ne la porte pas, et la documentation demande de citer la source à côté. `nettoyerSvg` garde
   `<metadata>` et `data-origine` (ADR-0014).
4. **Les mentions se génèrent, elles ne se recopient jamais.** `scripts/mentions.mjs` écrit `THIRD-PARTY-NOTICES.md`
   (commis) et `dist/MENTIONS.txt` depuis le registre, le `package-lock.json` et les fichiers de licence lus dans les
   paquets. Il refuse de produire quoi que ce soit si un composant manque au `package-lock.json` ou y porte une autre
   licence, si un paquet embarqué par les bundles manque au registre (ou l'inverse), si une fonte embarquée n'y est
   pas. `tests/unit/depot/mentions.test.ts` refait le calcul en mémoire et échoue si le fichier est périmé
   (`ACTUALISER_REFERENCES=1` le régénère), et vérifie que chaque titulaire figure dans la licence de son paquet.
5. **Le projet est propriétaire, tous droits réservés** (`LICENSE`, `"license": "UNLICENSED"` dans `package.json`) ; les
   composants tiers gardent leurs licences. Un test le fige : passer à une licence ouverte est une décision du
   propriétaire, jamais un défaut posé par un outil.
6. **Les fontes embarquées sont sous OFL et citées** : les neuf fontes du texte en formes (`polices.js`), et les deux
   fontes de l'interface de la page, *Instrument Sans* et *IBM Plex Mono*, en sous-ensemble latin, prises dans les
   paquets `@fontsource` et incorporées à `dist/editeur-svg.html` en `data:` URI (`scripts/fontes-interface.mjs`). Le
   bundle d'embarquement ne les embarque pas.
7. **La page autonome ne contacte aucun serveur.** Le texte de la page composée n'a ni `<link>`, ni `@import`, ni
   adresse, et chaque `url()` est une `data:` (`tests/unit/depot/page-hors-ligne.test.ts`) ; en navigateur, tout le
   réseau coupé, l'accueil, la voie image avec une vectorisation et l'éditeur s'ouvrent sans la moindre requête, même
   avortée, et les polices se chargent et rendent le texte (`tests/e2e/hors-ligne.e2e.ts`).

## Conséquences

- Un dessin sans forme créditée s'écrit exactement comme avant : les références de `tests/fixtures/svg` et les
  empreintes des 4 134 formes de la bibliothèque n'ont pas bougé. Les cas neufs sont `tests/fixtures/svg/provenance*.svg`
  (écriture, union, combinaison, forme masquée, découpe). Un dessin qui contient une forme de la bibliothèque gagne
  `<metadata>` et `data-origine` : c'est l'événement de version majeure annoncé dans le CHANGELOG.
- Ce que doit faire l'hôte qui embarque l'éditeur (servir `MENTIONS.txt`, afficher les crédits s'il livre
  `bibliotheque.js`, garder la mention en publiant) est écrit dans `docs/integration.md`, « Attribution et licences ».
- La page pèse environ 130 Ko de plus (`editeur-svg.html`) ; en échange « Rien ne quitte votre navigateur » est vrai à la
  lettre, et `securite.e2e.ts` n'admet plus aucune exception de police.
- Limites, honnêtement : le jeu de données ne dit pas qui a dessiné chaque icône, le crédit est donc celui de la source,
  pas d'un auteur par forme ; le paquet des formes ne fournit pas le texte juridique de CC BY 3.0, seulement son adresse ;
  la licence propriétaire est à faire relire par un juriste avant toute diffusion (CHANGELOG) ; un PNG exporté ne porte
  aucune mention.

## Alternatives écartées

- **Créditer seulement dans l'interface** : la licence suit le fichier, pas la page qui l'a produit.
- **Écrire la mention dans tout SVG** : un octet de plus pour chaque dessin, donc toutes les références réécrites, pour
  des dessins qui ne contiennent aucune forme créditée.
- **Recopier les textes de licence à la main** : une copie se périme sans bruit ; le registre confronté au
  `package-lock.json` échoue dès qu'une version ou un paquet change.
- **Garder les polices chez Google Fonts** : une requête vers un tiers à chaque ouverture, contraire à la promesse de la
  page.
