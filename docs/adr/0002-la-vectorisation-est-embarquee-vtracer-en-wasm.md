# ADR-0002 — La vectorisation est embarquée : vtracer en WASM, chargé à la demande

**Date :** 14 octobre 2026
**Statut :** acceptée

## Contexte

Un dessin arrive souvent en PNG ou en JPG. L'éditeur n'édite que des formes : il faut convertir
l'image en vecteurs, dans le navigateur, sans service distant, et de façon reproductible.

## Décision

1. **`@visioncortex/vtracer`, épinglé à `1.0.0-alpha.4`, embarqué dans la page.** Son WASM tient
   dans le fichier unique (environ 880 Ko de plus au moteur). La colle livrée est faite pour Node
   (lecture synchrone du `.wasm`, que Chrome refuse au-delà de 4 Ko sur le fil principal) : la
   construction (`scripts/construire.mjs`) remplace ce bloc par une initialisation asynchrone, et
   échoue si le motif n'est plus trouvé. Un test garde ce motif.
2. **Le module se charge à la demande** (`io/vtracer.ts`, `import()` différé et mémorisé, remis à
   zéro sur échec) : l'ouverture de la page ne paie rien tant qu'on ne vectorise pas.
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
