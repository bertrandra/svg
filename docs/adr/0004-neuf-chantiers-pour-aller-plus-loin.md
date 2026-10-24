# ADR-0004 — Neuf chantiers pour passer de la retouche à la création

**Date :** 15 octobre 2026
**Statut :** acceptée

## Contexte

L'éditeur retouchait bien ; il créait peu. Neuf manques revenaient : pas de booléens, pas de texte,
pas de guides, pas de transformation numérique, pas de recoloration en masse, une bibliothèque
forme par forme, un seul export, aucune reprise après rechargement, et une mise en page qui empilait
les panneaux sur tablette.

## Décisions

1. **Les booléens passent par un moteur de découpe** (`polygon-clipping`, Martinez, épinglé) sur des
   courbes aplaties à une tolérance géométrique (écart maximal d'un vingt-millième du plan, borne de Wang, 512 segments au plus par courbe ; l'option `lisser` du moteur rebâtit des cubiques vérifiées ; l'éditeur l'active par défaut, menu Édition, réglage de session). Le résultat est une forme en segments droits (ou en courbes rebâties), au style
   de la plus basse ; le remplissage se lit comme le navigateur le peint (pair-impair, ou selon le
   sens du tracé, approché par l'union d'un sens moins l'autre). Une forme sans remplissage n'a pas
   d'aire et se refuse en le disant. Déterministe, testé sur des aires.
2. **Le texte devient des formes, une par lettre**, par `opentype.js` (épinglé) : neuf fontes libres
   (OFL) dans `dist/polices.js`, chargées à la demande, et toute fonte TTF ou OTF déposée. La mise en
   ligne (avances, crénage, interlettrage, retour à la ligne) est pure (`engine/texte.ts`) et
   contourne la mise en forme OpenType, que la bibliothèque ne lit pas sur toutes les fontes. Le SVG
   écrit ne contient jamais de `<text>`.
3. **Les aimants** (`engine/transformations.ts`) attirent la boîte déplacée vers les bords et centres
   des autres formes et du plan, à six pixels d'écran, et dessinent la ligne ; la grille, quand elle
   est active, l'emporte. Un bouton et la touche M les coupent.
4. **Les transformations numériques** sont des matrices autour du centre : rotation d'un angle,
   inclinaison, échelle en pourcentage, et une poignée de rotation sur la boîte (Maj : par 15°).
5. **Les palettes** se posent sur les couleurs du dessin, les plus présentes d'abord, en boucle, par
   des jetons intermédiaires pour ne jamais enchaîner deux remplacements. Douze palettes
   d'événements et trois neutres ; le nuancier de la page en est une ; « une couleur » met tout au
   remplissage courant.
6. **La bibliothèque compose** : un panier inséré en grille, sept scènes prêtes par événement
   (`model/scenes.ts`, identifiants vérifiés par test), et des corrections de nom ou de classement
   posées dans la page, gardées dans le navigateur, exportées en JSON vers
   `bibliotheque/corrections.json`, que la construction applique par-dessus les règles.
7. **Quatre exports** : SVG, SVG de découpe (contours seuls, millimètres), PNG à la largeur voulue
   (canevas, fond transparent), PDF vectoriel écrit à la main (`export/pdf.ts`), sans date ni
   aléa, pour que le même dessin donne les mêmes octets.
8. **La reprise** : l'éditeur remet le SVG du moment à la page une seconde après chaque
   modification ; la page le garde dans le navigateur et propose de reprendre. Les versions nommées
   gardent un SVG par nom, trente au plus, s'exportent en JSON.
9. **Sous 900 pixels**, les barres défilent sur une ligne, la toile prend toute la hauteur, calques
   et inspecteur deviennent des tiroirs ouverts depuis la barre d'état, et deux doigts zooment.

## Conséquences

- Deux dépendances d'exécution de plus, pures et épinglées : `polygon-clipping` (MIT) et
  `opentype.js` (MIT). Les fontes (OFL) et le jeu d'icônes (CC BY 3.0) restent des dépendances de
  construction : `dist/` porte trois fichiers annexes, `bibliotheque.js`, `polices.js` et la page.
- Un booléen remplace des courbes par des segments, sauf si le réglage « rebâtir les courbes » est actif :
  le message d'état dit « courbes rebâties » ou « segments droits » selon le résultat. Une version du moteur de découpe peut déplacer un sommet : épinglage exact.
- Le stockage du navigateur ne porte que des conforts (brouillon, versions, corrections) : la page
  marche sans lui.
- Le crénage du texte se lit dans la table GPOS (`io/crenageGpos.ts`, paires de format 1 et 2, directes ou
  par extension) : opentype.js 2.0 ne lit ni les lookups d'extension ni les suivants. Les ligatures ne
  sont pas appliquées : une lettre reste une forme.
