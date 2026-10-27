# ADR-0042 — L’interface en français et en anglais : des clés françaises, un dictionnaire par langue, le français par défaut

**Date :** 26 octobre 2026
**Statut :** acceptée (complète l’ADR-0041 ; l’éditeur entier est concerné, page autonome, site et embarquement)

## Contexte

Demande du propriétaire : « Créer du multilingue, profil par défaut en français. Ajouter anglais. » Périmètre choisi : tout,
l’éditeur compris. Le code, les commentaires et les textes sont écrits en français depuis le début (CLAUDE.md), quelque trois
mille textes d’interface, composés souvent par concaténation, avec des pluriels, des nombres au format français, des dates. Les
tests (unitaires et de navigateur) affirment ces textes français : ils doivent rester verts tels quels.

## Décision

### 1. Le réglage

`langue : 'fr' | 'en'`, **`fr` par défaut partout**. Dans la page autonome : réglage `svg.langue` du stockage (comme `svg.modele`),
choisi par un sélecteur « Français / English » sur l’accueil et dans le menu Aide ; sur le site : la langue du compte (ADR-0041),
que le profil change ; chez un hôte qui embarque : l’option `langue` d’`EditeurSvg.ouvrir` et du composant (`'fr'` ou `'en'`, toute
autre valeur refusée en le nommant, en français). La langue s’applique avant le premier rendu ; en changer recharge l’interface
(la page : `location.reload()` après avoir écrit le réglage ; le site : après l’enregistrement du profil). `document.documentElement.lang`
suit.

### 2. Le mécanisme : `util/i18n.ts`

- `t(cle, valeurs?)` : la **clé est la phrase française elle-même** (`t('Annuler')`), les valeurs s’interpolent par `{nom}`
  (`t('Projet « {nom} » enregistré.', { nom })`). En français, `t` rend la clé interpolée ; en anglais, l’entrée du dictionnaire,
  sinon la clé (et le test de couverture, §4, empêche qu’il en manque).
- `pluriel(n, mot)` d’`util/texte.ts` passe le mot par `t` ; `auPluriel` garde sa règle (un `s`, sauf après s, x, z), qui vaut pour
  l’anglais courant ; un pluriel irrégulier se donne entier : `pluriel(n, 'cheval', 'chevaux')`.
- `nombre(v, decimales?)` et `dateCourte` formatent selon la locale de la langue (`fr-FR`, `en-US`) ; les `toLocaleString('fr-FR')`
  épars passent par là.
- `definirLangue`, `langue()`, `definirDictionnaire(langue, table)` : un état de module, posé par l’hôte avant tout rendu. C’est la
  seule entorse admise à « tout se passe en paramètre » : la langue ne change pas pendant une session, et **aucun octet écrit dans
  un fichier n’en dépend** (l’écriture SVG, les exports, les projets ne passent pas par `t` ; les références d’écriture ne bougent
  pas). Le mode d’emploi d’une archive Cricut (LISEZMOI) est un texte pour la personne : il se traduit, et ses références restent
  celles du français.

### 3. Les dictionnaires et leur livraison

`src/i18n/en/<dossier>.json` : un objet `{ "phrase française": "English sentence" }` par dossier source (`zones.json`,
`engine.json`, `model.json`, `io.json`, `export.json`, `util.json`, `site.json`), clés triées, pour que des agents travaillent côte à
côte sans se marcher dessus. `scripts/langues.mjs` les fusionne (une même clé dans deux fichiers doit avoir la même valeur) et
écrit l’**annexe `dist/langue-en.js`** (`window.__langueSvg_en = {…}`, comme les bibliothèques) et `data/json/langue-en.json`
pour le site. L’annexe se charge **à la demande, seulement quand la langue est `en`**, par `io/annexes.ts`, avant le premier rendu ;
si elle manque, l’interface reste en français et le dit une fois. Le français n’a pas de dictionnaire : les clés sont le texte.

Les noms de la bibliothèque (ADR-0003) ne se traduisent pas par ce dictionnaire : en anglais, une forme prend les mots de son
identifiant d’origine (`broken-heart` → « broken heart »), qui sont déjà de l’anglais. Les événements, catégories, noms de couleurs,
de machines, de matières, de formes de base, de polices livrées passent par `t` au moment de l’affichage, jamais dans les données.

### 4. Le test de couverture, et le cliquet

`tests/unit/i18n/couverture.test.ts` lit `src/` et les dictionnaires :

1. toute clé littérale d’un `t('…')` ou `pluriel(n, '…')` existe dans le dictionnaire anglais ; aucune clé du dictionnaire n’est
   orpheline ; une même clé n’a qu’une traduction ; une traduction ne perd ni n’ajoute de `{valeur}` ;
2. **le cliquet** : le nombre de littéraux à l’air français (un caractère accentué, « », ’) hors d’un appel à `t`, hors
   commentaires et hors des fichiers de données listés (`model/lexique*.ts`, `model/credits.ts`, les descriptions de
   `styles/jetons.ts`…) ne dépasse jamais le nombre inscrit dans `tests/fixtures/i18n/restes.json`, que l’on baisse et jamais ne
   remonte. À la fin du chantier, il vaut zéro.

`tests/e2e/langue.e2e.ts` ouvre la page en anglais (réglage posé, page rechargée), vérifie l’accueil, la barre, un menu, le panneau
Cricut et un message de refus ; le site, le profil et l’écran Comptes en anglais.

### 5. Les pages PHP et les mails

Le même principe côté serveur : `inc/langues.php`, `t('phrase française')`, un tableau `fr → en` (ADR-0041 §8).

### 6. Ce qui reste en français

Le code, les commentaires, les commits, les ADR, les identifiants techniques, les noms de fichiers écrits (`dessin.svg`), les
attributs `data-ed-*`. Les deux documentations HTML (menu Aide) restent en français dans cette version ; leur version anglaise
est une étape suivante.

## Conséquences

- Chaque texte nouveau s’écrit `t('…')` et reçoit sa traduction dans le JSON du dossier, sinon le test de couverture échoue :
  l’anglais ne prend pas de retard.
- Les tests français restent valides : la langue par défaut des tests est le français ; un test anglais pose la langue.
- Le bundle ne grossit pas du dictionnaire : il est une annexe.

## Alternatives écartées

- **Des identifiants de clés** (`menu.edition.copier`) : des milliers de renommages, un code moins lisible, et la traduction
  française dupliquerait le texte. La phrase française est la clé la plus sûre : elle est déjà relue, et unique à 99 %.
- **Traduire par le DOM** après coup : ni les attributs ARIA, ni les textes composés, ni les tests.
- **Détecter la langue du navigateur** : la demande dit « par défaut en français » ; un hôte ou un profil choisissent.
