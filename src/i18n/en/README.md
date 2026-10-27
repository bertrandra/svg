# Le dictionnaire anglais de l’interface (ADR-0042)

Un fichier JSON par dossier de `src/` (`zones.json`, `engine.json`, `model.json`, `io.json`, `export.json`, `util.json`,
`site.json`), chacun un objet `{ "phrase française": "English sentence" }`, **clés triées** (ordre des points de code :
`node scripts/langues.mjs --trier` les range). La clé est la phrase française telle qu’elle est écrite dans `t('…')`, avec ses
`{valeurs}`, qui doivent se retrouver dans la traduction. Une même clé peut figurer dans deux fichiers si elle a la même valeur ;
deux valeurs différentes font échouer le build.

- Un texte s’enveloppe dans le code : `t('Annuler')`, `t('Projet « {nom} » enregistré.', { nom })` ; sa traduction va dans le
  JSON du dossier du fichier.
- Un mot passé à `pluriel(n, 'forme')` va dans `util.json`, au singulier (`"forme": "shape"`) ; le pluriel anglais suit la règle
  d’`auPluriel` (un `s`), sauf si le pluriel français est donné comme clé (`"copies": "copies"`).
- Une donnée affichée par `t` au moment de l’affichage (un nom d’événement, de machine, de matière, de forme de base) se traduit
  dans le JSON du dossier qui l’affiche ; le test de couverture reconnaît toute clé qui est un littéral de `src/`.

`npm run langues` fusionne ces fichiers en `dist/langue-en.js` (`window.__langueSvg_en`), l’annexe que la page charge seulement
quand la langue vaut `en` ; `tests/unit/i18n/couverture.test.ts` vérifie que chaque clé de `t('…')` est traduite, qu’aucune clé n’est
orpheline, et que le nombre de textes français hors `t` (`npm run i18n:restes`) ne remonte jamais au-dessus de
`tests/fixtures/i18n/restes.json`.
