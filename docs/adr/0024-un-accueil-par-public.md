# ADR-0024 — Un accueil par public

**Date :** 25 octobre 2026
**Statut :** acceptée (prolonge les ADR-0006, 0010, 0011, 0013 et 0019) ; aucun octet écrit ne change

## Contexte

Une critique de design jugeait l’accueil interchangeable : un titre, trois cartes égales (Ouvrir, Convertir, Bibliothèque), une
zone de dépôt. Il ne montrait ni le circuit de l’image ou de la forme jusqu’au fichier prêt (pour l’écran ou pour la machine), ni la
Cricut, alors que les makers sont le premier des trois publics de PRODUCT.md (makers, grand public débutant, intégrateurs), et que
la position du produit est justement « l’ensemble sur une seule plateforme ».

Décision du propriétaire : **un accueil par public**. L’accueil demande d’abord « Pour quoi dessinez-vous ? » et adapte la suite.
Répondre n’est jamais obligatoire.

## Décision

1. **Une question, trois réponses d’égale dignité** (`zones/publics.ts`, pur ; `zones/AccueilPublic.tsx`) : « Découper ou dessiner
   avec une machine », « Retoucher un dessin ou une image », « Intégrer l’éditeur à mon produit », chacune avec une phrase de ce
   qu’on obtient. C’est une feuille de carnet, pas trois cartes de plus : trois lignes d’un même formulaire séparées par un filet,
   de même forme et de même poids, toutes **secondaires** (choisir un public règle l’accueil, ce n’est pas l’action du moment : la
   seule action pleine de la page reste celle de la voie, ADR-0006). Toute la ligne est le bouton, et son nom accessible est le titre
   puis la phrase, tels qu’on les voit (axe, `label-content-name-mismatch`, a refusé un nom réduit au titre). « Passer » (discret,
   nommé « Passer la question et garder les trois voies ») est toujours là, et **les trois voies restent dessous** dans tous les cas.
2. **Le choix se retient** dans le stockage injecté, sous `svg.accueil` = `{ public }` (`machine`, `retouche`, `integration`, ou
   `aucun` quand on a passé), relu champ par champ (`lirePublic` : une valeur abîmée, étrangère, empoisonnée ou future se lit
   « jamais répondu », sans lever ; un champ inconnu d’un objet valide est ignoré). Rien ne s’écrit tant qu’on n’a ni répondu ni
   passé. Sans stockage (absent, refusé, plein), le choix tient le temps de la page. Une fois répondue, la question devient une
   ligne : « Accueil adapté : *public* · Changer de public » (ou « Accueil général, pour tous les usages. · Choisir un public ») ;
   la rouvrir met le focus sur le choix du moment (`aria-current`).
3. **La suite s’adapte sans dupliquer les voies** : seul leur rang change (`ordreDesVoies`), et la première est celle qu’on voit.
   - **Machine** : le circuit « De la forme au fichier prêt pour Design Space » (une forme ou une image → préparée pour la machine →
     fichier prêt pour Design Space), les voies dans l’ordre Bibliothèque, Convertir, Ouvrir, et une phrase qui dit le réglage :
     « L’éditeur s’ouvre réglé pour : Cricut Maker · 12 × 12, découpe, en millimètres. » (le libellé même du sélecteur de la barre).
     **Toute voie ouvre l’éditeur en contexte Cricut** (`productionDuPublic` : `CHOIX_CRICUT_DEFAUT`, dans l’unité retenue de
     l’ADR-0013, le millimètre par défaut). C’est le mécanisme de contexte qui existait (un état d’interface), avec un **départ** :
     la propriété `production` d’`EditeurSvg`, appliquée par `choixDeDepart` seulement quand le SVG ne porte **aucune** marque
     `data-ed-*` (une marque, même d’un contexte inconnu, l’emporte : le fichier a parlé). Le départ est le contexte initial, pas une
     modification : « Terminer » sans geste ne réécrit rien, et tant que la personne ne modifie pas le dessin, aucun octet n’est
     écrit. À l’ouverture, le tapis entier se cadre et la phrase du contexte se dit, comme après un choix dans la barre.
   - **Retouche** : l’ordre d’avant (Ouvrir, Convertir, Bibliothèque), le circuit « De votre dessin au fichier prêt », et
     l’invitation à la visite guidée **en évidence** sous le circuit, en note (filet et voile cyan, comme un repère) avec son bouton
     discret ; elle quitte alors la zone de dépôt (une seule invitation sur la page).
   - **Intégration** : un panneau à la place du circuit : ce que fait l’embarquement (un composant React ou `ouvrir()`, aucun
     serveur), ses trois étapes (le SVG de votre page → retouché dans l’éditeur → rendu à votre code), les six options principales
     (`svg`, `onEnregistrer`, `libelleEnregistrer`, `visite`, `stockage`, `baseAnnexes`), un extrait de code en chasse fixe (une
     région nommée et focalisable, qui défile en largeur plutôt que d’élargir la page), « Copier le code » (discret), le lien vers
     `docs/integration.md` et « Essayer l’éditeur embarqué » (secondaire), qui ouvre l’éditeur **comme le ferait un hôte** : le
     libellé « Mettre à jour le logo », grisé tant que rien n’a changé, ni guide, ni bibliothèque, ni nuancier ; le SVG rendu est
     dit (« Votre page a reçu le SVG retouché par onEnregistrer : … ») sans toucher la fiche ni le brouillon de la page. L’extrait
     et la démonstration sont écrits depuis le même objet (`DEMO_HOTE`), et un test vérifie que l’extrait passe `verifierOptions`.
   - **Sans public** (première visite, ou passé) : le circuit général « De l’image au fichier prêt », l’ordre d’avant.
4. **Le lien du guide n’invente aucune adresse** : le build de la page pose le dépôt déclaré par `package.json`
   (`repository.url`, constante `DEPOT_PRODUIT`), d’où `…/blob/main/docs/integration.md` ; sans dépôt connu (des sources importées
   telles quelles), le lien est l’ancre des options dans la page.
5. **La visite guidée ouvre l’exemple en contexte générique, quel que soit le public** : elle enseigne la première retouche, ses
   étapes nomment « Télécharger le SVG » (que le contexte Cricut remplace par « Exporter pour Cricut »), et l’exemple a un trait que
   l’export Cricut refuse. Elle reste proposée au public Machine, dans la voie Ouvrir.
6. **Le focus suit le choix** : répondre ou passer mène au titre de ce qui suit (le circuit ou le panneau, `#titre-suite`,
   `tabIndex=-1`), qui dit ce qui a changé ; « Changer de public » mène à la réponse du moment. Aucune région vocale de plus dans
   la page (la seule est celle de l’éditeur, ADR-0011).
7. **Mots simples, typographie française** (`insecables`), aucune preuve externe : ni client, ni chiffre, ni témoignage.

## Conséquences

- **Aucun octet écrit ne change** : sans départ, l’éditeur part de la marque comme avant ; avec un départ, rien ne s’écrit sans
  modification, et une modification écrit la marque Cricut exactement comme un choix fait dans la barre (ADR-0013).
- **Les tests de navigateur d’avant passent sans changement** : sans réponse, l’accueil garde les trois voies dans l’ordre d’avant
  et l’invitation dans la zone de dépôt ; la question s’ajoute au-dessus. `tests/e2e/aide.ts` gagne l’option `publicAccueil`, qui
  pose une réponse dans le stockage du contexte avant le premier chargement (sans écraser une réponse déjà là), pour auditer un
  accueil adapté sans rejouer la question.
- Une icône de plus (`code`). Aucune couleur, taille, espace, rayon ni couche neufs : la question est une feuille de panneau, le
  circuit des feuilles de 48 px liées par un filet fort en tirets, le panneau d’intégration une feuille, l’extrait sur la table.
- Les preuves : `tests/unit/zones/publics.test.ts` (publics, mémoire validée, ordre des voies, contexte de départ et sa phrase,
  circuits, options et extrait, lien du guide), `tests/unit/engine/production.test.ts` (`choixDeDepart`),
  `tests/e2e/accueil-public.e2e.ts` (première visite, chacun des trois publics, l’éditeur en contexte Cricut mm, la démonstration
  avec son libellé, « Passer », le rechargement, un stockage abîmé, sans stockage, « Changer de public », le clavier seul, 390 px
  au doigt), des écrans de plus dans `accessibilite-axe.e2e.ts` (chaque état, clair et sombre, la question rouverte, la
  démonstration, 390 px) et dans `cibles.e2e.ts` (la question, chaque public, la question rouverte, passée, à 1280 et 390 px).
- Limites, honnêtement : la page grossit d’une feuille en tête à la première visite (les voies descendent d’environ 350 px à
  1280 × 800, puis remontent une fois la question répondue) ; le lien du guide suppose que le dépôt déclaré est lisible par la
  personne (un dépôt privé rend une page d’erreur) et que sa branche par défaut est `main` ; le public « Retouche » et le public
  « Intégration » ne règlent rien dans l’éditeur (la décision ouverte de PRODUCT.md sur leurs contextes reste ouverte) ; seul
  Chromium a exercé ces écrans.

## Alternatives écartées

- **Un choix obligatoire, ou une page d’accueil par public** : bloquer l’accès pour une question coûte plus qu’il ne rapporte, et
  trois pages feraient trois produits ; une question facultative au-dessus des mêmes voies ne retire rien.
- **Trois cartes de plus pour la question** : c’était le défaut reproché (des cartes égales comme structure de page) ; une liste de
  réponses dans une seule feuille se lit comme une question, pas comme un menu de plus.
- **Masquer les voies qui ne concernent pas le public** : un maker ouvre aussi un SVG, un débutant prend aussi une forme ; changer
  l’ordre suffit à dire par où commencer.
- **Écrire la marque Cricut dans le SVG à l’ouverture** : la fiche aurait reçu des octets que personne n’a demandés ; un départ
  d’état d’interface ne s’écrit qu’avec la première modification.
- **Ouvrir la visite en contexte Cricut** : ses étapes et l’export ne concordent pas avec l’exemple ; la visite garde son sujet.
