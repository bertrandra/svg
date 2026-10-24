# ADR-0011 — L'éditeur se pilote et se lit sans souris

**Date :** 24 octobre 2026
**Statut :** acceptée (prolonge l'ADR-0006)

## Contexte

L'éditeur ne se choisissait ni ne se dessinait au clavier, ne disait rien aux lecteurs d'écran hors une
barre d'état qui relisait ses boutons, laissait le focus se perdre (ouverture, confirmation, tiroirs) et
n'avait aucun audit automatique.

## Décision

1. **Les choix de navigation sont purs** (`engine/navigation.ts` : forme ou point voisin, pas, réticule) et
   les phrases aussi (`engine/description.ts`, `zones/annonces.ts`) ; `Clavier.ts` et `ClavierToile.ts` ne
   font que câbler les touches.
2. **Tab ne tourne jamais dans la toile** (WCAG 2.1.2) : il parcourt les formes tant qu'une est choisie et
   laisse le navigateur prendre la main aux bouts ; Échap puis Tab sort partout ; la sortie est annoncée.
   Page suivante et Page précédente complètent Tab, en boucle. Entrée sur une forme ouvre ses points.
3. **Le dessin au clavier passe par un réticule** d'état d'interface, jamais écrit dans le SVG : les flèches
   le déplacent, Entrée pose la forme (carré du quart du plan, ou un point de la plume), Maj+Entrée termine
   le tracé. Alt+flèches redimensionnent (Maj ×10), Ctrl+flèche gauche ou droite tourne de 15° (Maj : 1°).
   Pas de crochets, qui demandent AltGr sur AZERTY. Entrée garde son sens d'avant pour qui trace à la souris.
4. **Une seule région `polite`**, vidée puis remplie pour redire une phrase identique ; les actions parlent
   par `dire` / `annoncer` ; la barre d'état n'est plus une région vivante. Les phrases nomment la couleur
   avant son code, qu'un lecteur épelle mal (« cercle, fond rouge #c81e28, 80 × 80 à 40, 40 »).
5. **L'éditeur est une vraie fenêtre modale** : focus sur la toile à l'ouverture, reste de la page `inert`,
   focus rendu à l'hôte à la fermeture ; la confirmation d'abandon et les tiroirs prennent et rendent le
   focus, Échap les ferme. Un lien « Aller à la toile » ouvre la tabulation.
6. **Le contraste forcé** (`forced-colors`) se redit en mots-clés système ; les jetons restent la seule
   source des couleurs (ADR-0007).
7. **`axe-core`, exact, en test de navigateur** : échec sur toute violation `serious` ou `critical`, sur 25
   écrans (accueil, éditeur, menus, tactile, sombre, hôte d'embarquement), aucune règle désactivée.

## Conséquences

- Le SVG écrit ne change pas d'un octet.
- axe a trouvé une violation réelle : le panneau d'export du menu Fichier était dans un `role="menu"` ;
  le `role="menu"` n'enferme plus que les éléments de menu (le nom `aria-label` est porté par lui, le
  contenu libre est son frère).
- Un hôte qui range tout son contenu dans des enfants de `<body>` le voit devenir inerte pendant l'édition
  (documenté dans `docs/integration.md`). Alt+flèches et Ctrl+flèches sont pris pour redimensionner et
  tourner.
- Limites, honnêtement : aucun lecteur d'écran réel ni Windows en contraste élevé n'ont été essayés (DOM,
  couleurs calculées dans l'émulation de Chromium, mutations de la région vocale seulement) ; pas de tracé
  à deux coins ni de sélection additive ou par cadre au clavier ; les boutons de la rangée de sélection
  ne disent rien à voix haute ; les boutons-glyphes ◉ et 🔓 des calques restent des caractères.
