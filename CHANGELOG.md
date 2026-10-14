# Journal des modifications

Toutes les modifications notables de `svg`. Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
versions SemVer : un SVG réécrit différemment pour une entrée inchangée est une version majeure.

## [Non publié]

### Ajouté

- **Le canvas SVG de crea, repris tel quel** (ADR-0001) : le moteur pur (`engine/editionSvg.ts` :
  lecture d'un SVG en formes à plat, transformations appliquées, peintures résolues, opérations,
  points et poignées, couleurs, nettoyage du tracé, écriture), le lecteur XML sans DOM, le nettoyage
  d'un SVG, l'historique immuable, et le composant React `EditeurSvg` avec ses tests.
- **L'éditeur ne dépend plus de la charte** : le nuancier est une propriété (`nuancier`), nettoyée
  par `nuancierPropre` ; `BoutonEditerSvg` la transmet. Le composant se réutilise hors de crea.
- **Une page autonome** (`npm run construire` → `dist/editeur-svg.html`) : déposer un fichier SVG,
  coller un code ou ouvrir l'exemple ; un nuancier tapé à la main (« Nom #rrggbb » par ligne) ;
  l'éditeur en plein écran ; le résultat en aperçu, à télécharger ou à copier. Rien ne quitte le
  navigateur.
- **L'outillage de crea** : TypeScript strict, ESLint (aucun `any` dans le moteur, aucune assertion
  `!`, 150 lignes par fonction au plus), cliquet de rigueur, test d'architecture (couches, cycles,
  pureté), CI `verifier`.
