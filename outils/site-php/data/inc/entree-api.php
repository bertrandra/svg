<?php
// L'API du site (ADR-0030, ADR-0041) : du JSON, toute route sous session connectee, toute ecriture en POST + JSON + jeton CSRF
// (en-tete X-CSRF) + meme site (Sec-Fetch-Site). Les routes d'administration relisent le role dans le fichier du compte a chaque
// requete (403 `role` sinon). Les projets sont bornes au compte de la session.
//
//   GET  api.php?r=jeton                       { csrf } : le jeton CSRF de la session (apres une reconnexion dans un autre onglet)
//   GET  api.php?r=compte                      { compte: {id, nom, email, langue, role, etat}, site: {nom, langue, inscriptions}, admin?: {enAttente} }
//   POST api.php?r=profil                      { nom?, langue? } → { compte }
//   POST api.php?r=mot-de-passe                { ancien, nouveau } → { ok } ; ferme les autres sessions du compte (ancien faux ou
//                                              nouveau trop court : 400 `invalide`, le message dit lequel)
//   POST api.php?r=deconnexion                 → { ok }
//   GET  api.php?r=projets                     la liste des fiches du compte
//   GET  api.php?r=projet&id=…[&de=…]          le projet (ETag : sa revision) ; avec `de`, celui d'un autre compte qui le partage
//   POST api.php?r=enregistrer[&id=…]          { projet, vignette? } ; par-dessus un projet : If-Match "<revision>"
//   POST api.php?r=renommer&id=…               { nom }
//   POST api.php?r=dupliquer&id=…[&de=…]       avec `de` : une copie, dans ses projets, d'un projet partage avec soi
//   POST api.php?r=supprimer&id=…              a la corbeille du compte (ses partages en lecture disparaissent)
//   GET  api.php?r=vignette&id=…[&de=…]        le SVG de la liste, servi comme une image inerte
//
//   Le partage (ADR-0043) : toute ecriture vise un projet du compte connecte ; `de` ne sert qu'a lire, et seulement si
//   data/partages.json porte l'entree exacte (titulaire, projet, soi) — sinon 404 `introuvable`, comme un projet qui n'existe pas.
//   GET  api.php?r=recus                       { projets: [fiche + proprietaire {id, nom} + partageLe] } : partages avec soi
//   GET  api.php?r=partages&id=…               { partages: [{id, nom, email, le}] } : avec qui ce projet est partage en lecture
//   POST api.php?r=partager&id=…               { email } → { partages, courrier } (mail a la personne ; `courrier` faux s'il n'est
//                                              pas parti) ; deja partage : 409 `existe`
//   POST api.php?r=retirer-partage&id=…        { compte } → { partages }
//   POST api.php?r=envoyer&id=…                { email } → { ok, destinataire {nom}, courrier } : une copie dans ses projets (mail)
//   POST api.php?r=quitter-partage&id=…&de=…   → { ok } : ne plus voir un projet partage avec soi
//   L'adresse du destinataire : un compte actif autre que soi (400 `invalide`, 404 `introuvable`, 409 `soi-meme`) ; les adresses
//   inconnues se comptent par compte (429 `limite`).
//   GET  api.php?r=json&f=…                    une annexe de donnees
//   GET  api.php?r=langue&l=en                 le dictionnaire de l'interface en script d'amorce (ETag, une heure en cache prive ; l autre qu'une
//                                              langue traduite : 400 `invalide` ; dictionnaire non livre : 404 `introuvable`)
//   GET  api.php?r=fonte&f=…                   une fonte livree
//   GET  api.php?r=police&sha=…                une police du catalogue, par l'empreinte sha256 de son fichier
//   POST api.php?r=adresse                     { adresse } : le fichier a cette adresse, que le serveur va chercher (ADR-0036)
//
//   Administrateur seulement :
//   GET  api.php?r=comptes                     { comptes: [{id, nom, email, langue, role, etat, creeLe, confirmeLe?, approuveLe?, derniereConnexion?, projets}] }
//   POST api.php?r=compte-approuver&id=…       → { compte } (mail a la personne)
//   POST api.php?r=compte-refuser&id=…         { raison? } → { compte } (mail)
//   POST api.php?r=compte-suspendre&id=…       → { compte }
//   POST api.php?r=compte-reactiver&id=…       → { compte }
//   POST api.php?r=compte-promouvoir&id=…      → { compte }
//   POST api.php?r=compte-retrograder&id=…     → { compte }
//   POST api.php?r=compte-renvoyer&id=…        → { ok } (le mail de confirmation, de nouveau)
//   POST api.php?r=compte-email&id=…           { email } → { compte }
//   POST api.php?r=compte-supprimer&id=…       → { ok } (ses projets dans data/projets/corbeille-comptes)
//   POST api.php?r=compte-creer                { email, nom, langue, motDePasse } → { compte } (actif d'emblee)
//   GET  api.php?r=reglages                    { reglages (sans le mot de passe SMTP), smtpMotDePassePose, fichier, problemes }
//   POST api.php?r=reglages                    { reglages } → les memes ; un mot de passe SMTP vide = inchange
//   POST api.php?r=courrier-essai              { destinataire? } → { ok } ou l'erreur nommee
//
//   Une erreur : { erreur: code, message } (le message dans la langue de la session). Codes : `session` (401), `csrf` (403), `role`
//   (403), `methode` (405), `invalide` (400, 415), `introuvable` (404), `existe` (409), `etat` (409 : l'action ne vaut pas dans
//   l'etat du compte), `dernier-admin` (409), `soi-meme` (409), `courrier` (502),
//   `limite` (429), `conflit` (409, 428), `trop_gros` (413), `hors_index` (404), `source` (502), `installation` (503), `serveur` (500).

declare(strict_types=1);

defined('SVG_SITE') || exit;

/** Une ecriture : POST, JSON, jeton CSRF, et pas d'un autre site. Rend le corps decode. */
function corps_ecriture(bool $csrfValide, int $max): object
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        repondre_erreur(405, 'methode', t('Cette route n’accepte que POST.'), []);
    }
    $site = $_SERVER['HTTP_SEC_FETCH_SITE'] ?? 'same-origin';
    if (!in_array($site, ['same-origin', 'none'], true) || !$csrfValide) {
        repondre_erreur(403, 'csrf', t('Requête refusée : rechargez la page, puis réessayez.'));
    }
    if (!str_starts_with(strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? '')), 'application/json')) {
        repondre_erreur(415, 'invalide', t('Le corps doit être du JSON.'));
    }
    if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > $max) {
        repondre_erreur(413, 'trop_gros', t('Ce projet dépasse la taille que le serveur accepte.'));
    }
    $texte = (string) file_get_contents('php://input', false, null, 0, $max + 1);
    if (strlen($texte) > $max) {
        repondre_erreur(413, 'trop_gros', t('Ce projet dépasse la taille que le serveur accepte.'));
    }
    try {
        $corps = json_decode($texte, false, 64, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        repondre_erreur(400, 'invalide', t('Le corps n’est pas du JSON valide.'));
    }
    if (!is_object($corps)) {
        repondre_erreur(400, 'invalide', t('Le corps doit être un objet JSON.'));
    }
    return $corps;
}

/** L'identifiant (de projet ou de compte) dans l'adresse, ou un refus. */
function id_demande(): string
{
    $id = $_GET['id'] ?? null;
    if (!id_valide($id)) {
        repondre_erreur(400, 'invalide', t('Identifiant invalide.'));
    }
    return $id;
}

/**
 * Le titulaire d'un projet partage demande en lecture (`de`), ou null pour un projet du compte connecte. Le seul droit est l'entree
 * exacte de data/partages.json : sans elle, le projet est « introuvable », comme s'il n'existait pas (ADR-0043).
 */
function titulaire_demande(array $moi, string $id): ?string
{
    $de = $_GET['de'] ?? null;
    if ($de === null || $de === $moi['id']) {
        return null;
    }
    if (!id_valide($de)) {
        repondre_erreur(400, 'invalide', t('Identifiant invalide.'));
    }
    if (!partage_existe($de, $id, $moi['id']) || lire_compte($de) === null) {
        repondre_erreur(404, 'introuvable', t('Ce projet n’existe plus sur le serveur.'));
    }
    return $de;
}

/** Un projet du compte connecte, ou 404 : on ne partage et on n'envoie que ses propres projets. */
function exiger_projet(string $id): array
{
    $meta = lire_meta($id);
    if ($meta === null) {
        repondre_erreur(404, 'introuvable', t('Ce projet n’existe plus sur le serveur.'));
    }
    return $meta;
}

/** Le compte connecte doit etre administrateur : son role se relit dans son fichier, jamais dans la session. */
function exiger_admin(): array
{
    $c = compte_connecte();
    if ($c === null || ($c['role'] ?? '') !== 'admin') {
        repondre_erreur(403, 'role', t('Cette action est réservée à un administrateur.'));
    }
    return $c;
}

function refus(int $statut, string $code, string $message): array
{
    return ['statut' => $statut, 'erreur' => $code, 'message' => $message];
}

/** Une action d'administration sur un compte (ADR-0041 §5) ; rend ['compte' => …], ['ok' => true] ou un refus nomme. */
function action_compte(string $action, string $id, object $corps, array $admin): array
{
    $c = lire_compte($id);
    if ($c === null) {
        return refus(404, 'introuvable', t('Ce compte n’existe pas.'));
    }
    $soiMeme = $c['id'] === $admin['id'];
    $dernierAdmin = $c['role'] === 'admin' && $c['etat'] === 'actif' && count(admins_actifs()) <= 1;
    $etatAttendu = fn(array $etats): ?array => in_array($c['etat'], $etats, true) ? null : refus(409, 'etat', t('Cette action ne vaut pas dans l’état actuel du compte ({etat}).', ['etat' => $c['etat']]));
    switch ($action) {
        case 'approuver':
            $r = $etatAttendu(['en-attente']);
            if ($r !== null) {
                return $r;
            }
            $c = modifier_compte($id, ['etat' => 'actif', 'approuveLe' => maintenant_iso(), 'approuvePar' => $admin['id']]) ?? $c;
            journaliser('comptes', 'approuve id=' . $id . ' par=' . $admin['id']);
            mail_approbation($c);
            return ['compte' => compte_public($c, true)];
        case 'refuser':
            $r = $etatAttendu(['en-attente']);
            if ($r !== null) {
                return $r;
            }
            $raison = is_string($corps->raison ?? null) ? (texte_borne($corps->raison, 300) ?? '') : '';
            $c = modifier_compte($id, ['etat' => 'refuse']) ?? $c;
            journaliser('comptes', 'refuse id=' . $id . ' par=' . $admin['id']);
            mail_refus($c, $raison);
            return ['compte' => compte_public($c, true)];
        case 'suspendre':
            if ($soiMeme) {
                return refus(409, 'soi-meme', t('Vous ne pouvez pas faire cela sur votre propre compte.'));
            }
            if ($dernierAdmin) {
                return refus(409, 'dernier-admin', t('C’est le dernier administrateur actif : le site en garde toujours un.'));
            }
            $r = $etatAttendu(['actif']);
            if ($r !== null) {
                return $r;
            }
            $c = modifier_compte($id, ['etat' => 'suspendu']) ?? $c;
            journaliser('comptes', 'suspendu id=' . $id . ' par=' . $admin['id']);
            return ['compte' => compte_public($c, true)];
        case 'reactiver':
            $r = $etatAttendu(['suspendu', 'refuse']);
            if ($r !== null) {
                return $r;
            }
            $c = modifier_compte($id, ['etat' => 'actif', 'approuveLe' => $c['approuveLe'] ?? maintenant_iso(), 'approuvePar' => $admin['id']]) ?? $c;
            journaliser('comptes', 'reactive id=' . $id . ' par=' . $admin['id']);
            return ['compte' => compte_public($c, true)];
        case 'promouvoir':
            $r = $etatAttendu(['actif']);
            if ($r !== null) {
                return $r;
            }
            if ($c['role'] === 'admin') {
                return refus(409, 'etat', t('Ce compte est déjà administrateur.'));
            }
            $c = modifier_compte($id, ['role' => 'admin']) ?? $c;
            journaliser('comptes', 'promu id=' . $id . ' par=' . $admin['id']);
            return ['compte' => compte_public($c, true)];
        case 'retrograder':
            if ($soiMeme) {
                return refus(409, 'soi-meme', t('Vous ne pouvez pas faire cela sur votre propre compte.'));
            }
            if ($c['role'] !== 'admin') {
                return refus(409, 'etat', t('Ce compte n’est pas administrateur.'));
            }
            if ($dernierAdmin) {
                return refus(409, 'dernier-admin', t('C’est le dernier administrateur actif : le site en garde toujours un.'));
            }
            $c = modifier_compte($id, ['role' => 'utilisateur']) ?? $c;
            journaliser('comptes', 'retrograde id=' . $id . ' par=' . $admin['id']);
            return ['compte' => compte_public($c, true)];
        case 'renvoyer':
            $r = $etatAttendu(['a-confirmer']);
            if ($r !== null) {
                return $r;
            }
            $erreur = mail_confirmation($c);
            return $erreur === null ? ['ok' => true] : refus(502, 'courrier', $erreur);
        case 'email':
            $email = is_string($corps->email ?? null) ? trim($corps->email) : '';
            if (!email_valide($email)) {
                return refus(400, 'invalide', t('Cette adresse de courrier n’est pas valide.'));
            }
            return avec_verrou_comptes(function () use ($id, $email, $admin): array {
                $autre = compte_par_email($email);
                if ($autre !== null && $autre['id'] !== $id) {
                    return refus(409, 'existe', t('Un compte porte déjà cette adresse.'));
                }
                $c = modifier_compte_sous_verrou($id, ['email' => $email, 'emailNormalise' => email_normalise($email)]);
                if ($c === null) {
                    return refus(404, 'introuvable', t('Ce compte n’existe pas.'));
                }
                journaliser('comptes', 'adresse changee id=' . $id . ' par=' . $admin['id']);
                return ['compte' => compte_public($c, true)];
            });
        case 'supprimer':
            if ($soiMeme) {
                return refus(409, 'soi-meme', t('Vous ne pouvez pas faire cela sur votre propre compte.'));
            }
            if ($dernierAdmin) {
                return refus(409, 'dernier-admin', t('C’est le dernier administrateur actif : le site en garde toujours un.'));
            }
            supprimer_compte($id);
            journaliser('comptes', 'supprime id=' . $id . ' par=' . $admin['id']);
            return ['ok' => true];
    }
    return refus(404, 'introuvable', t('Route inconnue.'));
}

/** Les reglages recus par l'API : complets, valides champ par champ (un champ refuse est nomme), le mot de passe SMTP vide garde l'ancien. */
function ecrire_reglages(object $corps): array
{
    $recus = json_decode(json_encode($corps->reglages ?? null), true);
    if (!is_array($recus)) {
        return refus(400, 'invalide', t('Le corps doit porter les réglages.'));
    }
    $recus['format'] = FORMAT_CONFIG;
    $recus['version'] = VERSION_CONFIG;
    $actuel = config_lire()['config'];
    if (!isset($recus['courrier']['smtp']['motDePasse']) || $recus['courrier']['smtp']['motDePasse'] === '') {
        $recus['courrier']['smtp']['motDePasse'] = $actuel['courrier']['smtp']['motDePasse'];
    }
    $v = config_valide($recus, true);
    if ($v['problemes'] !== []) {
        return refus(400, 'invalide', t('Réglages refusés : {champs}.', ['champs' => implode(', ', $v['problemes'])]));
    }
    config_ecrire($v['config']);
    journaliser('comptes', 'reglages ecrits');
    return config_publique();
}

function entree_api(): never
{
    set_exception_handler(function (Throwable $e): void {
        error_log('api : ' . $e::class . ' : ' . $e->getMessage() . ' (' . $e->getFile() . ':' . $e->getLine() . ')');
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
            header('Cache-Control: no-store');
        }
        echo '{"erreur":"serveur","message":"Le serveur a rencontré une erreur."}';
    });
    entetes_securite();
    $probleme = preparer_donnees();
    if ($probleme !== null) {
        error_log('api : ' . $probleme);
        repondre_erreur(503, 'installation', 'Le site n’est pas encore installé : voir la page d’accueil.');
    }
    demarrer_session();
    $compte = compte_connecte();
    langue_courante(langue_de_la_requete($compte));
    if (!comptes_existent()) {
        repondre_erreur(503, 'installation', t('Le site n’a pas encore d’administrateur : voir la page d’accueil.'));
    }
    if ($compte === null) {
        repondre_erreur(401, 'session', t('Votre session a expiré : reconnectez-vous.'));
    }
    $csrfValide = csrf_valide($_SERVER['HTTP_X_CSRF'] ?? null);
    definir_compte_projets($compte['id']);

    $route = $_GET['r'] ?? '';
    switch ($route) {
        case 'jeton':
            // Lisible par la seule page du site (meme origine, aucune autorisation CORS) : un autre site ne peut pas le lire.
            repondre_json(200, ['csrf' => jeton_csrf()]);
        case 'compte':
            $r = ['compte' => compte_public($compte), 'site' => site_public()];
            if ($compte['role'] === 'admin') {
                $r['admin'] = ['enAttente' => count(array_filter(lister_comptes(), fn(array $c): bool => $c['etat'] === 'en-attente'))];
            }
            repondre_json(200, $r);
        case 'profil':
            $corps = corps_ecriture($csrfValide, 8192);
            $champs = [];
            if (isset($corps->nom)) {
                $nom = nom_compte_propre($corps->nom);
                if ($nom === null) {
                    repondre_erreur(400, 'invalide', t('Indiquez votre nom (120 caractères au plus).'));
                }
                $champs['nom'] = $nom;
            }
            if (isset($corps->langue)) {
                if (!langue_valide($corps->langue)) {
                    repondre_erreur(400, 'invalide', t('Choisissez une langue.'));
                }
                $champs['langue'] = $corps->langue;
            }
            $c = $champs === [] ? $compte : (modifier_compte($compte['id'], $champs) ?? $compte);
            repondre_json(200, ['compte' => compte_public($c)]);
        case 'mot-de-passe':
            $corps = corps_ecriture($csrfValide, 8192);
            $ancien = is_string($corps->ancien ?? null) ? $corps->ancien : '';
            if (!password_verify($ancien, $compte['empreinte'])) {
                repondre_erreur(400, 'invalide', t('L’ancien mot de passe est incorrect.'));
            }
            $refus = mot_de_passe_refuse($corps->nouveau ?? null);
            if ($refus !== null) {
                repondre_erreur(400, 'invalide', $refus . '.');
            }
            $c = poser_mot_de_passe_compte($compte['id'], (string) $corps->nouveau) ?? $compte;
            garder_seule_session($c);
            journaliser('connexions', 'mot de passe change compte=' . $c['id']);
            repondre_json(200, ['ok' => true]);
        case 'deconnexion':
            corps_ecriture($csrfValide, 8192);
            fermer_session();
            repondre_json(200, ['ok' => true]);
        case 'projets':
            repondre_json(200, ['projets' => lister_projets()]);
        case 'projet':
            $id = id_demande();
            $de = titulaire_demande($compte, $id);
            if ($de !== null) {
                definir_compte_projets($de);
            }
            $meta = lire_meta($id);
            if ($meta === null || !is_file(chemin_projet($id, '.json'))) {
                repondre_erreur(404, 'introuvable', t('Ce projet n’existe plus sur le serveur.'));
            }
            servir_fichier(chemin_projet($id, '.json'), 'application/json; charset=utf-8', '"' . $meta['revision'] . '"', 'no-store');
        case 'enregistrer':
            $corps = corps_ecriture($csrfValide, PROJET_OCTETS_MAX + VIGNETTE_OCTETS_MAX + 4096);
            $id = isset($_GET['id']) ? id_demande() : null;
            // Un mandataire peut affaiblir l'etiquette (`W/"3"`) : la revision y est la meme.
            $attendue = preg_match('/^(?:W\/)?"?(\d{1,10})"?$/', (string) ($_SERVER['HTTP_IF_MATCH'] ?? ''), $m) === 1 ? (int) $m[1] : null;
            repondre_resultat(enregistrer_projet($id, $corps->projet ?? null, $attendue, $corps->vignette ?? null));
        case 'renommer':
            $corps = corps_ecriture($csrfValide, 8192);
            repondre_resultat(renommer_projet(id_demande(), $corps->nom ?? ''));
        case 'dupliquer':
            corps_ecriture($csrfValide, 8192);
            $id = id_demande();
            $de = titulaire_demande($compte, $id);
            repondre_resultat($de === null ? dupliquer_projet($id) : copier_projet($de, $id, $compte['id'], fn(string $nom): string => $nom . ' ' . t('(copie)')));
        case 'supprimer':
            corps_ecriture($csrfValide, 8192);
            repondre_resultat(supprimer_projet(id_demande()));
        case 'vignette':
            $id = id_demande();
            $de = titulaire_demande($compte, $id);
            if ($de !== null) {
                definir_compte_projets($de);
            }
            $svg = chemin_projet($id, '.svg');
            if (!is_file($svg)) {
                repondre_erreur(404, 'introuvable', t('Ce projet n’a pas de vignette.'));
            }
            // Une image, inerte meme ouverte seule : aucun script, aucune requete, un document sans origine.
            servir_fichier($svg, 'image/svg+xml', '"' . sha1_file($svg) . '"', 'private, max-age=31536000', [
                "Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox",
                'Content-Disposition: inline; filename="vignette.svg"',
            ]);
        case 'recus':
            repondre_json(200, ['projets' => projets_recus($compte['id'])]);
        case 'partages':
            $id = id_demande();
            exiger_projet($id);
            repondre_json(200, ['partages' => personnes_du_partage($compte['id'], $id)]);
        case 'partager':
        case 'envoyer':
            $corps = corps_ecriture($csrfValide, 8192);
            $id = id_demande();
            exiger_projet($id);
            $d = destinataire_du_partage($corps->email ?? null, $compte);
            if (!isset($d['compte'])) {
                repondre_resultat($d);
            }
            repondre_resultat($route === 'partager' ? partager_en_lecture($id, $compte, $d['compte']) : envoyer_copie($id, $compte, $d['compte']));
        case 'retirer-partage':
            $corps = corps_ecriture($csrfValide, 8192);
            $id = id_demande();
            exiger_projet($id);
            $autre = $corps->compte ?? null;
            if (!id_compte_valide($autre) || !retirer_partage($compte['id'], $id, $autre)) {
                repondre_erreur(404, 'introuvable', t('Ce partage n’existe plus.'));
            }
            journaliser('partages', 'retire projet=' . $id . ' de=' . $compte['id'] . ' a=' . $autre);
            repondre_json(200, ['partages' => personnes_du_partage($compte['id'], $id)]);
        case 'quitter-partage':
            corps_ecriture($csrfValide, 8192);
            $id = id_demande();
            $de = $_GET['de'] ?? null;
            if (!id_valide($de) || !retirer_partage($de, $id, $compte['id'])) {
                repondre_erreur(404, 'introuvable', t('Ce partage n’existe plus.'));
            }
            journaliser('partages', 'quitte projet=' . $id . ' de=' . $de . ' a=' . $compte['id']);
            repondre_json(200, ['ok' => true]);
        case 'json':
            servir_json($_GET['f'] ?? null);
        case 'langue':
            servir_langue($_GET['l'] ?? null);
        case 'fonte':
            servir_fonte($_GET['f'] ?? null);
        case 'police':
            servir_police_catalogue($_GET['sha'] ?? null);
        case 'adresse':
            // Une requete que le serveur emet pour la personne : une ecriture (POST, jeton CSRF, meme site), jamais un simple lien.
            servir_adresse(corps_ecriture($csrfValide, 8192));
        case 'comptes':
            exiger_admin();
            repondre_json(200, ['comptes' => array_map(fn(array $c): array => compte_public($c, true), lister_comptes())]);
        case 'compte-creer':
            $admin = exiger_admin();
            $corps = corps_ecriture($csrfValide, 8192);
            $r = creer_compte($corps->email ?? null, $corps->nom ?? null, $corps->motDePasse ?? null, $corps->langue ?? null, 'utilisateur', 'actif');
            if (isset($r['erreur'])) {
                repondre_erreur($r['erreur'] === 'existe' ? 409 : 400, $r['erreur'] === 'existe' ? 'existe' : 'invalide', $r['message']);
            }
            journaliser('comptes', 'cree par admin id=' . $r['compte']['id'] . ' par=' . $admin['id']);
            repondre_json(200, ['compte' => compte_public($r['compte'], true)]);
        case 'reglages':
            exiger_admin();
            if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
                repondre_json(200, config_publique());
            }
            repondre_resultat(ecrire_reglages(corps_ecriture($csrfValide, 65536)));
        case 'courrier-essai':
            $admin = exiger_admin();
            $corps = corps_ecriture($csrfValide, 8192);
            $a = is_string($corps->destinataire ?? null) && trim($corps->destinataire) !== '' ? trim($corps->destinataire) : $admin['email'];
            if (!email_valide($a)) {
                repondre_erreur(400, 'invalide', t('Cette adresse de courrier n’est pas valide.'));
            }
            $erreur = mail_essai($a, $admin['langue']);
            if ($erreur !== null) {
                repondre_erreur(502, 'courrier', $erreur);
            }
            repondre_json(200, ['ok' => true]);
    }
    if (preg_match('/^compte-(approuver|refuser|suspendre|reactiver|promouvoir|retrograder|renvoyer|email|supprimer)$/', (string) $route, $m) === 1) {
        $admin = exiger_admin();
        $corps = corps_ecriture($csrfValide, 8192);
        repondre_resultat(action_compte($m[1], id_demande(), $corps, $admin));
    }
    repondre_erreur(404, 'introuvable', t('Route inconnue.'));
}
