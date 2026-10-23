# ADR-0006 — Une passe d'interface : des menus, des sections, trois voies

**Date :** 23 octobre 2026
**Statut :** acceptée (prolonge l'ADR-0004)

## Contexte

Les neuf chantiers de l'ADR-0004 avaient chacun posé leurs boutons. À l'usage, six défauts :

1. la barre principale alignait plus de vingt-cinq icônes, dont des réglages qu'on touche une fois
   par séance (grille, fonds, presse-papiers) ;
2. la page d'accueil empilait quatre cartes de même poids ;
3. l'inspecteur répétait ce que la rangée de sélection faisait déjà (aligner, miroirs, empilement,
   booléens) et encadrait chaque groupe d'un filet ;
4. tous les boutons étaient pleins : l'œil ne savait plus quelle action comptait ;
5. rien ne bougeait (tiroirs, menus) et la toile n'avait pas de focus visible ;
6. les cibles tactiles faisaient 22 à 30 px.

## Décision

1. **Les menus portent le rare, la barre le fréquent.** La barre garde les outils, les deux couleurs,
   l'historique et le zoom. Les formes se rangent derrière un seul outil (le bouton reprend la
   dernière forme employée, le chevron liste les autres). **Vue** (ajuster, taille réelle, zoom sur la
   sélection, grille, aimants, contours, fonds), **Édition** (annuler, presse-papiers, dupliquer, tout
   sélectionner, supprimer) et **Fichier** (enregistrer, télécharger, copier, exports, fermer) disent
   chacun leur raccourci. Un menu est un vrai menu : `aria-haspopup`, flèches, début, fin, Échap, Tab ;
   les éléments à deux états sont des `menuitemcheckbox`. Son panneau se pose en position fixe sous le
   bouton, parce que les barres défilent sur mobile et couperaient un panneau absolu. La logique
   d'index (`suivant`, `premier`, `dernier`) est pure, dans `util/menu.ts`, testée.
2. **L'accueil a une entrée et trois voies** côte à côte : ouvrir un SVG, convertir une image, la
   bibliothèque. Une voie est un onglet (`tablist`, flèches) ; les trois panneaux restent montés, pour
   qu'un détour par la bibliothèque ne fasse pas perdre une image déposée ni ses réglages. Le nuancier
   est replié.
3. **L'inspecteur est à plat** : des sections sans cadre (`Section`), un filet, un chevron. Ouvertes :
   Apparence, Position et taille ; fermée : Transformer (le chiffré). L'inspecteur ne répète plus la
   rangée de sélection. L'état ouvert ou fermé se retient d'un panneau à l'autre.
4. **Une action primaire par panneau.** Un bouton est secondaire par défaut (filet, encre) ; seul
   `.primaire` porte la couleur d'outil ; `.discret` est un lien en forme de bouton ; `.danger` est
   un contour rouge, plein jamais.
5. **Du mouvement qui s'éteint.** Fondu des menus et des sections, tiroirs qui glissent avec un voile
   qui les ferme, transitions de 120 ms sur les boutons. Sous `prefers-reduced-motion`, toute durée
   tombe à presque zéro. La toile prend le focus clavier (`tabindex`, `aria-label`) avec un anneau de
   3 px, visible au clavier seulement.
6. **Des cibles de 40 px au doigt** : sous 900 px de large ou avec un pointeur grossier, boutons,
   champs, lignes de calques et éléments de menu font 40 px au moins ; les poignées de la toile
   grossissent de 80 % (`useTactile`).

## Conséquences

- Les barres vivent dans `zones/BarreOutils.tsx`, l'éditeur ne les importe que comme composants ; les
  types qu'elles partagent (`Edition`, `Outil`, `Vues`) restent dans `EditeurSvg.tsx`, importés en
  type seulement, sans cycle de valeur.
- Rien de ce que faisait l'éditeur n'est retiré : chaque geste a un raccourci ou une entrée de menu.
  Le moteur et le SVG écrit ne changent pas d'un octet.
- Un panneau neuf se range dans une `Section`, et choisit son seul bouton primaire.
