# ADR-0041 — Les comptes du site : inscription confirmée puis approuvée, sessions par jeton, projets par personne

**Date :** 26 octobre 2026
**Statut :** acceptée (révise l’ADR-0030 §1, §2 et §4 ; le projet JSON, les polices, l’ouverture depuis une adresse ne changent pas)

## Contexte

Demande du propriétaire, du 26 octobre 2026 : « Créer une gestion de user, déplace les fichiers sous public dans data. PHP JSON avec
contrôle de structure pour l’instant et token de session. Self service. Reset password mail. Approbation par admin dans un écran
spécifique et envoi d’un mail en notification. Gestion du profil en haut à droite, une icône. Donc un user admin. Les projets sont
liés à un user. Dans public que ce qui est utile. Un fichier de config dans data/config. Création du user admin à la première
connexion si pas de JSON. » Réponses aux questions posées : les mails partent par `mail()`, ou par SMTP si la configuration en
déclare un ; `public/` garde le strict minimum ; un nouvel utilisateur confirme son adresse par un lien, puis un administrateur
l’approuve.

Jusqu’ici (ADR-0030), le site n’avait qu’un mot de passe, partagé, et des projets sans propriétaire. Il faut des personnes, des
rôles, des états, des mails, sans base de données ni dépendance : un hébergement FTP ordinaire, PHP 8.1, cURL et mbstring.

## Décision

### 1. L’arborescence : `public/` réduit au minimum, le code et les réglages sous `data/`

```
public/                      la racine web, le seul dossier à envoyer par FTP
  index.php                  les pages : installation, connexion, inscription, confirmation, réinitialisation, l’application
  api.php                    l’API (JSON)
  .htaccess                  (comme avant : pas de listage, fichiers cachés refusés)
  assets/  aide/  MENTIONS.txt
  data/                      jamais servi : « Require all denied », réécrit s’il manque, vérifié par HTTP comme avant
    inc/                     TOUT le code PHP (amorce, config, comptes, sessions, courrier, langues, projets, polices, adresse, pages,
                             serveur-local, outils de ligne de commande)
    config/config.json       les réglages (§7), écrits à l’installation, relus et validés à chaque requête
    config/config.local.php  facultatif : les constantes avancées d’avant (ADRESSE_*, POLICES_SOURCES, HTTPS_FORCE…)
    comptes/<id>.json        un compte par fichier (§2)
    sessions/<sha256>.json   les sessions par jeton (§3)
    jetons/<sha256>.json     confirmation d’adresse, réinitialisation (§4)
    projets/<compte>/        les projets de ce compte, sa corbeille dedans (§6)
    projets/corbeille-comptes/  les projets d’un compte supprimé, horodatés
    font/ json/ journal/     comme avant
```

`index.php` et `api.php` ne contiennent que : `$data = is_dir(__DIR__ . '/data') ? __DIR__ . '/data' : __DIR__ . '/../data';
require $data . '/inc/amorce.php';` puis l’appel du point d’entrée. Les deux dispositions de l’ADR-0030 (data/ dedans ou à côté)
restent possibles, `DATA_DIR` n’a plus de raison d’être. `php data/inc/mot-de-passe.php` devient `php data/inc/compte.php` (créer
un administrateur, changer un mot de passe, en ligne de commande). Le routeur `serveur-local.php` refuse `data/` comme avant.

### 2. Les comptes : un fichier JSON par personne, validé à la lecture

`data/comptes/<id>.json`, `id` sur 16 chiffres hexadécimaux tirés au hasard :

```json
{ "format": "editeur-svg/compte", "version": 1, "id": "3f9c…", "email": "Anne@Exemple.org", "emailNormalise": "anne@exemple.org",
  "nom": "Anne", "langue": "fr", "role": "utilisateur", "etat": "actif", "empreinte": "$argon2id$…",
  "creeLe": "…Z", "modifieLe": "…Z", "confirmeLe": "…Z", "approuveLe": "…Z", "approuvePar": "a1b2…", "derniereConnexion": "…Z" }
```

- `role` : `admin` ou `utilisateur`. `langue` : `fr` ou `en` (ADR-0042), `fr` par défaut.
- `etat` : `a-confirmer` (inscrit, adresse non confirmée) → `en-attente` (adresse confirmée, approbation à venir) → `actif` ;
  `refuse` (par un administrateur) ; `suspendu` (un actif mis de côté, réactivable). Seul `actif` se connecte.
- `compte_valide($x)` refuse tout fichier qui n’a pas exactement cette forme (types, formats, énumérations, 120 caractères au
  plus pour le nom, adresse `filter_var` + domaine) : un fichier illisible est ignoré et journalisé, jamais « lu au mieux ».
- Une adresse est unique, comparée normalisée (minuscules, blancs retirés). Créer un compte passe sous le verrou
  `data/comptes/.verrou`. L’empreinte est `password_hash` (argon2id, bcrypt sinon), dix caractères au moins, comme avant.
- Les projets existants d’un site d’avant (`data/projets/*.json` à plat) sont déplacés dans le dossier du premier administrateur
  à sa création ; `data/pwd`, `data/password` et `data/connexions.json` sont alors supprimés : le mot de passe unique n’existe plus.

### 3. Les sessions : un jeton aléatoire, un fichier, un cookie

Plus de session PHP native. `data/sessions/<sha256(jeton)>.json` : `{ "compte", "creeLe", "vu", "csrf", "marque" }`. Le cookie
`svg_session` porte le jeton (32 octets, 64 hex), `HttpOnly`, `SameSite=Strict`, `Secure` en HTTPS, chemin du script. Une session
expire après `SESSION_INACTIVITE` sans requête (2 h) ; le ménage se fait une fois sur cent requêtes. `marque` est un condensé de
l’empreinte du mot de passe du compte : changer le mot de passe ferme toutes ses sessions, sauf celle qui le change (rouverte).
Le jeton CSRF reste celui d’avant (64 hex, en-tête `X-CSRF` ou champ `csrf`, comparé en temps constant). Un visiteur non connecté a
aussi une session (anonyme : `compte` vide), pour que les formulaires portent un jeton CSRF ; elle devient connectée à la connexion
(nouveau jeton de session, nouveau CSRF : pas de fixation).

### 4. Le circuit d’une personne

| Étape | Qui | Ce qui se passe |
|---|---|---|
| Première visite | n’importe qui, tant qu’aucun `data/comptes/*.json` n’existe | page « Créer le compte administrateur » : adresse, nom, mot de passe ×2, langue, nom du site, adresse d’expédition des mails. Sous verrou : écrit `config.json` (§7) s’il manque, le compte (`admin`, `actif`), migre les projets d’avant, ouvre la session. Dès qu’un compte existe, cette route n’existe plus. |
| Inscription | un visiteur, si `inscriptions.ouvertes` (vrai par défaut) | adresse, nom, mot de passe ×2, langue → compte `a-confirmer` + mail de confirmation (lien `index.php?confirmer=<jeton>`, 48 h). La réponse est la même que l’adresse soit libre ou prise (« Si cette adresse n’a pas déjà un compte, un message vient de partir ») : on n’énumère pas les comptes. Limitée par client comme la connexion. |
| Confirmation | la personne, par le lien | `a-confirmer` → `en-attente` ; mail à chaque administrateur actif, dans sa langue (« Nouvelle demande : Anne, anne@exemple.org ; approuvez-la dans l’écran Comptes ») ; page « Adresse confirmée : un administrateur doit encore approuver votre compte ; vous recevrez un mail ». Un lien expiré ou déjà employé le dit, et propose de renvoyer le mail. |
| Approbation | un administrateur, écran « Comptes » (§5) | `en-attente` → `actif`, mail à la personne (« Votre compte est ouvert : connectez-vous ») ; ou `refuse`, mail aussi (une raison facultative, d’une ligne). |
| Connexion | un compte `actif` | adresse + mot de passe. Refus générique « Adresse ou mot de passe incorrect » ; `a-confirmer` : « Confirmez d’abord votre adresse » avec « Renvoyer le mail » ; `en-attente` : « Votre compte attend l’approbation d’un administrateur » ; `refuse`/`suspendu` : « Ce compte n’a pas accès au site ». Limitation des essais par client ET par compte (le même barème qu’avant), journal `connexions.log` sans adresse ni mot de passe. |
| Mot de passe oublié | n’importe qui | adresse → si un compte `actif` ou `en-attente` la porte, mail avec lien `index.php?reinitialiser=<jeton>` (1 h, usage unique) ; même réponse sinon. Le lien ouvre un formulaire (mot de passe ×2) ; poser le mot de passe ferme les autres sessions. |
| Profil | la personne connectée, icône en haut à droite (§5) | nom, langue, mot de passe (l’ancien + le nouveau ×2), déconnexion ; l’adresse ne se change pas dans cette version (un administrateur la change, ou on recrée le compte). |

Les jetons (`data/jetons/<sha256(jeton)>.json` : `{ "usage": "confirmation" | "reinitialisation", "compte", "expire", "creeLe" }`)
ne sont jamais rangés en clair ; un jeton consommé est supprimé ; les jetons expirés partent au ménage des sessions.

### 5. Les écrans

- **Avant la connexion** : des pages rendues par PHP (comme aujourd’hui), qui marchent sans script, dans la langue de la personne
  (§8) : installation, connexion, inscription, « mail envoyé », confirmation, mot de passe oublié, réinitialisation. Un sélecteur
  FR / EN en haut à droite de ces pages (cookie `svg_langue`).
- **Après** : l’application React (`src/site`). En haut à droite de l’écran « Mes projets », une **icône de profil** (initiales du
  nom dans un rond) ouvre un menu : le nom et l’adresse, « Mon profil… » (nom, langue, mot de passe), « Comptes » (admin
  seulement), « Réglages du site » (admin), « Se déconnecter ». Le même menu est une rubrique de « Plus » sur un téléphone.
- **« Comptes »** (admin) : un écran à part, trois onglets : *En attente* (les `en-attente`, « Approuver » plein, « Refuser » avec
  raison), *Actifs* (suspendre, promouvoir administrateur / rétrograder, supprimer, changer l’adresse), *Autres* (`a-confirmer` :
  renvoyer le mail ; `refuse`, `suspendu` : réactiver, supprimer). Chaque ligne : nom, adresse, langue, dates, nombre de projets. On ne
  rétrograde ni ne supprime jamais le dernier administrateur actif, ni soi-même.
- **« Réglages du site »** (admin) : le formulaire de `config.json` (§7), avec « Envoyer un mail d’essai ».

### 6. Les projets par compte

`data/projets/<compte>/` porte les projets d’un compte, `corbeille/` dedans ; toute route de projets est bornée au compte de la
session (un identifiant d’un autre compte est « introuvable », pas « interdit »). Supprimer un compte déplace son dossier entier
dans `data/projets/corbeille-comptes/<horodatage>-<compte>/`. Un administrateur ne voit pas les projets des autres dans
l’interface ; il en voit le nombre.

### 7. La configuration : `data/config/config.json`

```json
{ "format": "editeur-svg/config", "version": 1,
  "site": { "nom": "Éditeur SVG", "langue": "fr", "adresse": "https://exemple.org/svg/" },
  "inscriptions": { "ouvertes": true },
  "courrier": { "expediteur": "no-reply@exemple.org", "nom": "Éditeur SVG", "mode": "mail",
                "smtp": { "hote": "", "port": 587, "securite": "starttls", "utilisateur": "", "motDePasse": "" } },
  "sessions": { "inactivite": 7200 } }
```

Validé à la lecture (`config_valide`), chaque champ avec son défaut : un fichier absent ou illisible vaut les défauts, et l’écran
« Réglages du site » le dit. `site.adresse` sert aux liens des mails (sinon l’adresse de la requête). `courrier.mode` : `mail`
(la fonction de l’hébergeur), `smtp` (le client minimal de `inc/courrier.php` : connexion, STARTTLS ou SSL implicite, AUTH LOGIN ou
PLAIN, délais bornés), ou `fichier` (les tests : chaque message écrit dans `data/journal/courrier/<horodatage>.eml`, rien ne part).
Le mot de passe SMTP n’est jamais renvoyé par l’API (le formulaire le laisse vide pour « inchangé »). Les constantes avancées
d’avant restent dans `inc/config.php` et `data/config/config.local.php`.

### 8. La langue des pages PHP et des mails

`inc/langues.php` : `t('phrase française')` rend la phrase dans la langue courante, d’après un tableau `fr → en` ; la langue est
celle du compte connecté, sinon le cookie `svg_langue`, sinon `site.langue`. Un mail part dans la langue de son destinataire.
Les sujets et corps sont du texte brut UTF-8 (`Content-Type: text/plain; charset=utf-8`, sujets encodés), les liens en clair.

### 9. Sécurité

Les en-têtes d’avant ; jetons de session et de mail rangés hachés, comparés en temps constant ; réponses qui n’énumèrent pas les
comptes ; limitation des essais ; mots de passe jamais journalisés ; `data/` jamais servi ; les pages avant connexion sous CSRF
de la session anonyme ; les écritures de l’API sous CSRF et `Sec-Fetch-Site` ; l’API admin vérifie le rôle à chaque requête (le
rôle se lit dans le fichier du compte, pas dans la session). Un compte suspendu ou supprimé perd ses sessions à la requête suivante.

### 10. Tests

`tests/php/unitaires.php` : validation des comptes et de la config, jetons, sessions, courrier en mode fichier, SMTP contre un
faux serveur local, migration. `tests/php/http.php` : installation de l’administrateur, inscription → mail (fichier) → confirmation
→ mail aux admins → approbation → connexion → projets bornés au compte → réinitialisation → profil → limitation → en-têtes →
`data/` et `data/inc/` jamais servis → suppression d’un compte. `tests/e2e/site-php.e2e.ts` : les écrans React (profil, admin).

## Conséquences

- Un site d’avant se met à jour en envoyant le nouveau `public/` : à la première visite, la page demande l’administrateur, reprend
  les projets, et le mot de passe unique disparaît. `docs/deploiement-php.md` le dit.
- Le JSON pour les comptes tient tant que le site reste petit (quelques dizaines de personnes) : chaque lecture de la liste parcourt
  le dossier. Une base viendra par une autre ADR si le besoin apparaît ; les structures validées en sont déjà le schéma.
- Sans mail qui part (hébergement sans `mail()`, SMTP non réglé), l’inscription en libre-service ne fonctionne pas : l’écran
  « Réglages du site » a « Envoyer un mail d’essai », et l’administrateur peut créer un compte à la main (écran Comptes,
  « Créer un compte… », état `actif` d’emblée, mot de passe provisoire à changer).

## Alternatives écartées

- **SQLite** : disponible presque partout, mais la demande dit « JSON pour l’instant » ; la validation stricte garde la porte ouverte.
- **Les sessions PHP natives** : elles ne portent pas un jeton qu’on puisse relire et révoquer par compte ; un fichier par jeton le fait.
- **Approuver sans confirmer l’adresse** : un administrateur approuverait des adresses qui n’existent pas, et la réinitialisation ne
  marcherait pas ; la confirmation coûte un clic.
