# Contribuer

Le contexte est dans [README.md](README.md) et `docs/adr/` ; ce fichier dit comment on travaille ici. Les consignes complètes
des agents sont dans [CLAUDE.md](CLAUDE.md).

## Le principe à ne pas casser

**Un SVG réécrit aujourd'hui doit l'être à l'identique demain.** Un changement qui déplace une coordonnée, un tracé ou un octet écrit est un
événement de **version majeure**, jamais une correction discrète : il s'annonce dans `CHANGELOG.md`, et les références d'écriture
(`tests/fixtures/svg`, empreintes de la bibliothèque) ne se réécrivent que par décision relue (`ACTUALISER_REFERENCES=1`, puis relire le diff).

## Le circuit d'une modification

1. Une branche `claude/<sujet>` depuis `origin/main`. **Jamais de push direct sur `main`.**
2. Vérifier en local, tout doit passer :

   ```bash
   npm run verifier     # typecheck && lint && cliquet && test
   npm run construire   # la page, la bibliothèque, les fontes, le bundle et les mentions se construisent
   CHROMIUM_PATH=... npm run e2e   # les tests de navigateur, sur la page construite (Chromium de Playwright)
   ```

3. Une entrée dans `CHANGELOG.md`, sous `## [Non publié]` (Ajouté / Modifié / Corrigé), en français.
4. Une PR vers `main` ; les jobs `verifier` et `navigateur` de la CI doivent être verts. Le merge se fait par un commit de merge, pas en
   squash.
5. Un agent travaille dans un worktree sous `.claude/worktrees/` (ignoré par git) ; on le supprime, avec sa branche, dès que son travail est
   fusionné (`git worktree remove`, `git branch -d`). Un lien `node_modules` n'est jamais commité : `.gitignore` l'ignore, lien compris.

## Les conventions

- Code et commentaires en français ; **commentaires sans accents** dans le code source, qui expliquent le pourquoi. Textes de l'interface en
  français, avec accents, au vouvoiement.
- Messages de commit en français : un titre court, une ligne vide, puis le pourquoi.
- Les tests vivent dans `tests/unit/<couche>/`, miroir de `src/` ; les tests de navigateur dans `tests/e2e`.
- Un index qu'on sait valide se lit par `au` (`src/util/tableaux.ts`), jamais par `!`. Pas de `any`. Une fonction fait 150 lignes au plus.
- TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- Une couleur d'interface est un jeton de `src/styles/jetons.ts` (ADR-0007) ; la page n'écrit aucune couleur.

## L'architecture que les tests imposent

`tests/unit/architecture.test.ts` fixe les couches : `util/shell` puis `geometry`, `model/plateforme`, `engine`, `core/io/render/export/interaction`, `ui`, `app/zones`.
Une couche n'importe jamais une couche plus haute ; un dossier nouveau se classe dans `NIVEAU` avant d'exister. Le cœur pur (`util`, `model`, `engine`) ne touche ni au
DOM, ni à l'horloge, ni au hasard, ni au réseau.

## Les licences et les crédits

- La liste de ce que le produit redistribue est `src/model/credits.ts`. **Ajouter, retirer ou mettre à jour une dépendance, une fonte ou une source de formes**
  change cette liste et [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) : lancer `npm run mentions` (ou `ACTUALISER_REFERENCES=1 npx vitest run tests/unit/depot/mentions.test.ts`)
  et commiter le résultat. `scripts/mentions.mjs` refuse une liste qui ne correspond pas à ce que les bundles embarquent.
- Les formes de la bibliothèque sont sous CC BY 3.0 : toute nouvelle voie par laquelle une forme de la bibliothèque entre dans un dessin doit lui poser son origine
  (`origineDeBibliotheque`, `Forme.origine`) ; toute opération qui fusionne des formes en garde l'union des origines.
- Ne choisissez pas la licence du projet dans une PR : c'est une décision de son propriétaire.

## Signaler un problème de sécurité

Pas dans une issue publique : voir [SECURITY.md](SECURITY.md).
