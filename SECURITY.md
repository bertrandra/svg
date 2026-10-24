# Sécurité

## Signaler une vulnérabilité

Ne publiez pas de faille dans une issue ni dans une PR. Signalez-la en privé :

1. sur GitHub, onglet **Security** du dépôt, puis **Report a vulnerability** (signalement privé de vulnérabilité) ;
2. si cette option n'est pas disponible, ouvrez une issue qui dit seulement « signalement de sécurité, merci de me
   contacter en privé », **sans aucun détail technique**.

Donnez de quoi reproduire : la version (`package.json`, ou `EditeurSvg.version` dans l'embarquement), le navigateur,
et si possible le SVG ou l'image qui déclenche le problème. Le projet n'a pas de délai de réponse garanti ; l'objectif est de publier la correction avant le détail de la faille.

## Versions prises en charge

Le projet est en version `0.x` : **seule la dernière version publiée reçoit des corrections de sécurité**. Il n'y a pas
de branche maintenue en parallèle.

## Périmètre

Ce qui relève de la sécurité du produit :

- l'exécution de code ou la fuite de données par un SVG ou une image ouverts dans l'éditeur, ou par un SVG rendu par
  lui (`onEnregistrer`, téléchargement, copie) ;
- l'éditeur embarqué dans la page d'un hôte : tout ce qui lui permettrait de lire ou d'écrire hors de sa racine, hors de
  son stockage déclaré, ou d'atteindre le réseau ;
- les fichiers construits dans `dist/` (la page, le bundle, les annexes) et les scripts de construction.

Hors périmètre : les failles des navigateurs eux-mêmes, celles des paquets tiers tant qu'elles ne sont pas
atteignables par le produit (signalez-les d'abord à leur auteur), et la sécurité de la page d'un hôte qui embarque
l'éditeur (voir « Sécurité » dans [docs/integration.md](docs/integration.md)).

## Ce que le nettoyage promet, et ce qu'il ne promet pas

Le produit n'exécute rien de ce qu'on lui donne, mais il faut dire exactement sur quoi cela repose.

**Ce qui protège le plus : la réécriture.** L'éditeur ne garde pas le SVG d'entrée. Il le lit en un dessin à plat (des
chemins et des peintures, voir l'ADR-0001) et en écrit un autre ; ce qu'il ne sait pas lire est refusé en le nommant. Le SVG
rendu par `Enregistrer` ne contient donc que des éléments `<path>` (plus, quand le dessin contient des formes de la
bibliothèque, un `<metadata>` de texte), jamais le markup d'origine. Le SVG d'entrée n'est jamais inséré dans la page de
l'éditeur ni dans celle d'un hôte : il est lu comme du texte par un analyseur XML sans DOM (`src/util/xml.ts`).

**Ce que fait `nettoyerSvg`** (`src/util/svg.ts`), appliqué à l'ouverture et au SVG enregistré : retirer `<script>`, `<foreignObject>`,
les gestionnaires d'évènement (`onload=`…), les `href` qui ne sont ni `#ancre` ni une image `data:` (png, jpeg, gif, webp), les `@import`,
les `url()` externes, et les `javascript:`. Un renvoi externe de `<use>` est gardé dans un attribut inerte pour que la lecture le refuse.

**Ce qu'il ne promet pas :**

- Ce n'est **pas un assainisseur général de SVG ou de HTML**. Il travaille par expressions régulières sur le texte, il n'analyse pas le
  document ; il ne faut pas lui confier le SVG d'un tiers pour l'insérer tel quel dans une page (`innerHTML`, SVG en ligne). La
  réécriture par l'éditeur, elle, tient ce rôle pour ce qu'il enregistre.
- Il ne remplace pas les protections de l'hôte : afficher un SVG par `<img>`, le servir en `image/svg+xml` avec une
  `Content-Security-Policy` stricte, le valider côté serveur (voir docs/integration.md).
- `onBrouillon` rend le SVG du moment, **non nettoyé**. Ce n'est pas un enregistrement.
- Les images `data:` de type png, jpeg, gif ou webp sont conservées par le nettoyage, mais l'éditeur refuse d'éditer un SVG qui contient
  une image : il faut d'abord la vectoriser.
- Le texte d'un SVG très grand ou très imbriqué peut ralentir le navigateur (des bornes existent : clones `<use>`, profondeur, historique), sans
  garantie de temps de réponse.

**Aucun réseau** : l'éditeur n'appelle aucun serveur, et la page autonome n'en contacte aucun à l'ouverture (ses polices d'interface sont dans le fichier) ; les seules
requêtes sont les balises `<script>` des annexes (bibliothèque, fontes, traceur), et seulement quand la personne s'en sert. Les dessins ne quittent pas le navigateur. Le stockage du navigateur ne porte que des conforts (brouillon, versions
nommées, corrections), jamais requis.

## Dépendances

Les composants redistribués dans `dist/` sont listés, avec leurs licences, dans [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). Leurs versions sont
épinglées (`package-lock.json`, et `polygon-clipping`, `opentype.js`, `vtracer` exactement dans `package.json`) ; une mise à jour passe par la CI complète.
