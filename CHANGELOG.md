# Journal des modifications

Toutes les modifications notables de `svg`. Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
versions SemVer : un SVG réécrit différemment pour une entrée inchangée est une version majeure.

## [Non publié]

### Ajouté

- **L'éditeur SVG plein écran** (ADR-0001) : un moteur pur (`engine/editionSvg.ts` : lecture d'un SVG
  en formes à plat, transformations appliquées, peintures résolues, opérations immuables, points et
  poignées, couleurs, nettoyage du tracé, écriture), un lecteur XML sans DOM, le nettoyage d'un
  SVG, un historique immuable, et le composant React `EditeurSvg` : sélection, déplacement, coins,
  miroirs, rotations, alignements, empilement, dupliquer, masquer, verrouiller, supprimer ; points
  et poignées ; couleurs au sélecteur, au code ou au nuancier ; poussières, regroupement, plan de
  travail ; zoom, main, contours, fonds ; annuler et rétablir chaque geste.
- **Des outils de tracé** : rectangle, ellipse, étoile, ligne (Maj contraint), plume (cliquer les
  points, Entrée ou double-clic ferme, Retour arrière retire un point, Échap abandonne), avec le
  style courant (remplissage, contour, épaisseur) réglé dans l'inspecteur.
- **Tout et Aucun** en tête des calques, pour tout sélectionner ou rien.
- **Une barre d'outils étendue pour aller vite** : les deux couleurs courantes (remplissage, contour)
  à portée de main, qui changent la sélection ou les formes à venir ; copier, couper, coller
  (Ctrl+C, Ctrl+X, Ctrl+V) ; une grille magnétique (G) au pas lisible du plan, qui aimante les
  tracés, les points, les poignées et les déplacements ; le zoom sur la sélection (Z) ; Ctrl+S
  enregistre. Quand une sélection existe, une rangée contextuelle réunit alignements, miroirs,
  rotations, empilement (Ctrl+] et Ctrl+[), **Combiner** (Ctrl+G : plusieurs formes en un seul
  tracé, au style de la plus haute), **Séparer** (Ctrl+Maj+G : une forme en un tracé par
  sous-chemin, pour recolorer les parties d'une silhouette de la bibliothèque), dupliquer, masquer,
  verrouiller, supprimer.
- **Convertir une image en SVG** (ADR-0002) : PNG, JPG, GIF ou WebP ramené à 1 024 px, fond détouré
  par propagation (tolérance réglable), puis vectorisé par vtracer embarqué en WASM et chargé à la
  demande (modes aplats, trait, fidèle ; trois grains), ou enveloppé tel quel. Le résultat se voit
  en rendu et en contours, se télécharge, se copie, et s'ouvre dans l'éditeur.
- **Une bibliothèque de 4 134 formes pleines** (ADR-0003), silhouettes de game-icons.net (CC BY 3.0),
  nommées en français par un lexique de 3 200 mots et classées par 45 événements : le calendrier
  français (Nouvel An, Épiphanie, Chandeleur, Saint-Valentin, Carnaval, Saint-Patrick, printemps,
  poisson d'avril, Pâques, fête du travail, fêtes des mères et des pères, fête de la musique, été,
  14 Juillet, rentrée, automne, Halloween, Toussaint, 11 Novembre, Noël, hiver, Hanoucca, Ramadan,
  Nouvel An chinois, Diwali), la vie (naissance, anniversaire, mariage, concert, sport, voyage,
  études, travail, santé, fête) et les catégories (personnage, bâtiment, animal, nature, nourriture,
  véhicule, arme, objet, symbole). Recherche par nom sans accents et par événement, dans la page
  (une forme s'ouvre dans l'éditeur) et dans l'éditeur (une forme s'insère au centre du dessin).
  Construite en `dist/bibliotheque.js` par `npm run bibliotheque`, chargée à la demande.
- **Une page autonome** (`npm run construire` → `dist/editeur-svg.html`) : déposer un fichier SVG,
  coller un code ou ouvrir l'exemple ; un nuancier tapé à la main (« Nom #rrggbb » par ligne) ;
  l'éditeur en plein écran ; le résultat en aperçu, à télécharger ou à copier. Rien ne quitte le
  navigateur.
- **L'outillage** : TypeScript strict, ESLint (aucun `any` dans le moteur, aucune assertion `!`,
  150 lignes par fonction au plus), cliquet de rigueur, test d'architecture (couches, cycles,
  pureté), CI `verifier` et construction de la page.
