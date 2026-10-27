# ADR-0043 — Le partage des projets : une copie envoyée, ou une lecture partagée

**Date :** 27 octobre 2026
**Statut :** acceptée (complète l’ADR-0041 §6 : un projet reste dans le dossier de son titulaire, et seul son titulaire l’écrit)

## Contexte

Question du propriétaire, du 27 octobre 2026 : « Je peux partager un projet avec un autre utilisateur ? » Ce n’était pas possible :
depuis l’ADR-0041, chaque compte n’a que ses projets, et un projet d’un autre compte est « introuvable ». Trois façons de faire ont
été proposées (envoyer une copie, partager en lecture, partager en modification) ; réponse : « Option 1 et 2 ». La modification à
plusieurs n’est pas retenue.

## Décision

### 1. Deux gestes, dans le panneau « Partager » de la ligne du projet

« Partager » s’ouvre dans la ligne, comme renommer ou supprimer (jamais une fenêtre qui piège le focus, Échap ferme et rend le focus
au bouton). On y tape l’adresse d’une personne qui a un compte sur le site, puis :

- **« Envoyer une copie »** : le projet est recopié dans le dossier de l’autre compte, sous un identifiant neuf, avec sa vignette, à
  la révision 1. Cette copie appartient à son destinataire : rien ne la relie plus à l’original. Sa fiche garde `recuDe` (le nom de
  l’expéditeur), que la liste dit (« Reçu de … ») et qu’un enregistrement ou un renommage gardent.
- **« Partager en lecture »** : le projet reste dans le dossier de son titulaire ; l’autre compte le voit sous « Partagés avec moi »,
  peut l’ouvrir, en voir la vignette, le télécharger depuis l’éditeur, en garder une copie chez lui (« Copier dans mes projets »),
  ou le retirer de sa liste. Il ne l’écrit jamais. Le titulaire voit avec qui le projet est partagé (nom et adresse) et retire un
  partage d’un geste ; la ligne dit « Partagé avec n personnes ».

Chaque geste envoie un mail au destinataire, dans sa langue (`mail_copie`, `mail_partage`) ; un mail qui ne part pas ne défait pas
le geste, et la page le dit.

### 2. Le destinataire : un compte actif autre que soi, trouvé par son adresse

On tape l’adresse ; le serveur cherche un compte `actif` (adresse normalisée, ADR-0041 §2) qui n’est pas celui de la session. Aucune
liste des comptes n’est montrée à un utilisateur : l’annuaire du site reste à l’administrateur. Une adresse inconnue se compte par
compte, comme les demandes de mail (`mp` + `cle_compte`, `COURRIER_DEMANDES_LIBRES` libres puis un délai qui double, 429 `limite`) :
on ne fait pas défiler les adresses depuis ce champ. Les refus sont nommés : adresse mal formée (400 `invalide`), aucun compte actif
(404 `introuvable`), sa propre adresse (409 `soi-meme`), déjà partagé (409 `existe`), plus de 50 personnes (409 `etat`).

### 3. Un seul fichier de droits : `data/partages.json`

Les partages en lecture vivent dans `data/partages.json` (`{ format: "editeur-svg/partages", version: 1, partages: [{ proprietaire,
projet, destinataire, le }] }`), la seule source : une entrée exacte y vaut un droit de lecture, rien d’autre n’en donne. Le fichier
se relit à chaque requête et se valide (`partage_valide` : trois identifiants de disque, titulaire différent du destinataire, une
date, aucun champ de plus) ; une entrée mal formée ou en double est écartée, un fichier illisible ou d’un autre format ne donne
**aucun** droit (journalisé) : un fichier abîmé retire des partages, il n’en invente jamais. Toute écriture passe sous un verrou
(`data/partages.verrou`) et d’un seul geste. Le fichier se nettoie de lui-même : un projet mis à la corbeille perd ses partages (le
reprendre ne les rend pas), un compte supprimé perd ceux qu’il donne et ceux qu’il reçoit.

### 4. L’API : `de` ne sert qu’à lire

Les routes de lecture d’un projet prennent un paramètre `de` (le titulaire) : `projet`, `vignette`, et `dupliquer` (qui lit chez le
titulaire et écrit chez soi). Sans l’entrée exacte (titulaire, projet, soi), la réponse est 404 `introuvable`, comme pour un projet qui
n’existe pas. **Aucune écriture ne prend `de`** : `enregistrer`, `renommer`, `supprimer`, `partager`, `envoyer` et `retirer-partage`
visent toujours un projet du compte de la session. Nouvelles routes : `recus`, `partages`, `partager`, `retirer-partage`, `envoyer`,
`quitter-partage` (contrat en tête de `data/inc/entree-api.php`). Lire chez un autre compte passe par `sous_compte_projets`, qui pose
ses projets le temps d’une fonction puis rend la main ; copier lit sous le verrou de la source, puis écrit sous celui de la cible,
l’un après l’autre, jamais l’un dans l’autre (`copier_projet`, que « Dupliquer » emploie aussi).

### 5. Un projet reçu s’ouvre en lecture, ses modifications vont dans une copie

Le site ouvre un projet reçu comme un projet enregistré (fermer sans l’avoir modifié ne demande rien) avec `lecture` dans le travail
ouvert ; le bouton de fin s’appelle « Enregistrer une copie » et la barre le dit à l’ouverture. La première modification le rend
actif : il enregistre un projet **neuf** de la personne (« … (copie) »), puis le travail devient le sien (les enregistrements suivants
l’écrasent, lui). « Enregistrer sous… » garde une copie à tout moment. L’éditeur n’en sait rien : il reçoit un dessin et un libellé,
comme avant (ADR-0010) ; l’embarquement ne change pas.

## Conséquences

- Aucun octet écrit par l’éditeur ne change : le projet copié est le même JSON (nom et dates du serveur exceptés).
- L’administrateur ne voit toujours pas le contenu des projets ; le partage ne lui donne rien de plus.
- Sauvegarder le site, c’est aussi sauvegarder `data/partages.json` (docs/deploiement-php.md).
- Un titulaire suspendu garde ses partages (le projet reste lisible) ; supprimé, ils disparaissent avec ses projets.
- Partager en modification reste à faire : il demanderait de dire qui a enregistré en dernier, et à qui appartient la suppression ;
  la révision ouverte (409) protège déjà de l’écrasement.

## Vérification

`tests/php/unitaires.php` (fichier de droits validé, abîmé, en double ; partager, copier, provenance gardée, nettoyage à la corbeille
et à la suppression d’un compte), `tests/php/http.php` (le lecteur lit et copie mais n’écrit jamais, un tiers ne lit rien même avec
`de`, retirer et quitter ferment l’accès, la copie envoyée arrive avec sa provenance et son mail), `tests/unit/io/serveur.test.ts`
(lecture des fiches, routes et jeton), `tests/e2e/site-partage.e2e.ts` (le panneau au clavier, les mails, « Partagés avec moi »,
l’ouverture en lecture puis « Enregistrer une copie », axe).
