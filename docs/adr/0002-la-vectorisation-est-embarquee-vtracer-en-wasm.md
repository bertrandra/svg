# ADR-0002 — La vectorisation est embarquée : vtracer en WASM, chargé à la demande

**Date :** 14 octobre 2026
**Statut :** acceptée

## Contexte

Un dessin arrive souvent en PNG ou en JPG. L'éditeur n'édite que des formes : il faut convertir
l'image en vecteurs, dans le navigateur, sans service distant, et de façon reproductible.

## Décision

1. **`@visioncortex/vtracer`, épinglé à `1.0.0-alpha.4`.** La colle livrée est faite pour Node
   (lecture synchrone du `.wasm`, que Chrome refuse au-delà de 4 Ko sur le fil principal) : la
   construction (`scripts/vtracer.mjs`) remplace ce bloc par une initialisation asynchrone, et
   échoue si le motif n'est plus trouvé. Un test garde ce motif.
2. **Le traceur est un script annexe, chargé à la demande** : `dist/vtracer.js` (environ 880 Ko, wasm
   embarqué) se charge par une balise `<script>` au premier tracé (`io/vtracer.ts`, mémorisé, remis à
   zéro sur échec), comme la bibliothèque et les fontes, donc aussi depuis `file://`. La page elle-même
   passe de 1,6 à 0,75 Mo. S'il manque à côté de la page, le message dit où le poser. À l'origine
   (22 octobre) il était embarqué dans la page ; ce changement ne touche pas le SVG produit, comparé
   à l'octet sur plusieurs combinaisons de réglages.
3. **Le réglage est pur et déterministe.** `engine/vectorisation.ts` traduit trois modes
   (**aplats** : au plus huit couleurs, celles extraites de l'image ; **trait** : noir et blanc ;
   **fidèle** : plus de nuances) et trois grains (fin, normal, lisse) en options du traceur,
   nettoie sa sortie et compte les tracés. vtracer ne tire rien au sort : la même image et les mêmes
   réglages rendent le même SVG, et un test le vérifie sur une vraie exécution.
4. **Détourer puis vectoriser, sur la source gardée.** L'import garde les pixels d'origine le temps
   de la session ; le détourage (par propagation depuis le bord, avec sa tolérance) et la
   vectorisation se rejouent dessus, sans perte cumulée. Une image entièrement détourée n'est pas
   tracée (vtracer panique sur une image vide) ; au-delà de 4 000 tracés, le résultat est refusé avec
   le conseil d'un grain plus lisse. Le résultat est un SVG nettoyé, que l'éditeur ouvre tel quel.
5. **L'image enveloppée reste possible** (un `<image>` en PNG dans un SVG), mais elle ne s'édite pas.

## Conséquences

- Le traceur n'entre pas dans le cœur pur : `engine` ne fait que régler et lire ; l'appel au WASM
  vit dans `io`.
- Une mise à jour de vtracer peut déplacer des tracés : elle se traite comme un changement de
  rendu, d'où l'épinglage exact.
- Le traceur se charge comme toute annexe (`io/annexes.ts`) ; seul le démarrage du WASM lui est propre,
  mémoïsé et remis à zéro à part.
