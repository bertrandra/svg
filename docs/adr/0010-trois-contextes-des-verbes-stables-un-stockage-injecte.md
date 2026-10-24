# ADR-0010 — Trois contextes, des verbes stables, un stockage injecté

**Date :** 24 octobre 2026
**Statut :** acceptée (prolonge les ADR-0006 et 0008)

## Contexte

`Atelier` construisait à chaque rendu un objet `Edition` d'une cinquantaine de champs, mêlant l'état du
dessin, des verbes (copier, combiner, enregistrer…) et l'état de l'interface, et le passait à tous les
panneaux. Chaque panneau dépendait de tout, et rien ne pouvait se mémoïser. Par ailleurs l'éditeur
« ne connaissait aucun magasin » dans les consignes, mais `zones/session.ts` et `zones/Bibliotheque.tsx`
appelaient `localStorage` chacun de leur côté, et la mémoire ouverte/fermée des sections était un `Map`
de module, partagé entre deux éditeurs d'une même page hôte.

## Décision

1. **Trois contextes** (`zones/contexteEditeur.tsx`) : `Dessin` (le modèle : historique, dessin, sélection,
   nuancier, versions, presse-papiers…), `Interface` (outil, vue, grille, tiroirs, message…) et `Actions`
   (les verbes). Un panneau lit ce dont il a besoin par `useDessin()`, `useInterface()`, `useActions()`.
   L'objet `Edition` n'existe plus.
2. **Les verbes sont stables** : ils lisent l'état du dernier rendu par une référence mise à jour à
   chaque rendu ; un composant qui n'utilise que des actions ne se redessine pas quand l'état change.
3. **`commun/`** abrite ce que tous partagent (`Bouton`, `Menu`, `Section`), et `util/texte.ts` l'unique
   `pluriel`. La mémoire des sections vit dans un contexte par éditeur.
4. **Le stockage est injecté** : `io/stockage.ts` définit `Stockage` (`lire`, `ecrire`, `retirer`, JSON,
   jamais d'exception) avec `stockageNavigateur()`, `stockageMemoire()` et `stockageProtege()` (pour un
   hôte non typé). L'éditeur reçoit `stockage?: Stockage | null` ; absent ou `null`, il ne garde rien. La
   page passe celui du navigateur ; l'embarquement garde `localStorage` par défaut (clés inchangées),
   `stockage: false` désactive, un objet donne le magasin de l'hôte.

## Conséquences

- Mesure sur 5 000 formes, honnêtement : neutre à légèrement positif (ouvrir 886 → 800 ms, glisser une
  forme 38 → 37 ms par mouvement, masquer un groupe 181 → 163 ms), dans le bruit de mesure de ±10 %.
  Pendant un geste presque tous les panneaux lisent le dessin : ils se redessinent comme avant. Le gain est
  de structure, pas de vitesse.
- Les 2 000 lignes de `ParCouleur` restent le point chaud signalé par l'ADR-0008.
- Un hôte qui utilise le composant React sans passer `stockage` ne garde plus les versions : c'est le
  prix de « l'éditeur ne connaît aucun magasin », dit dans `docs/integration.md`.
