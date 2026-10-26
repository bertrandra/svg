<?php
// Les fonctions du site, appelees directement sur un dossier de donnees temporaire (ADR-0030, ADR-0041) : noms et chemins hostiles,
// structure d'un projet, ecriture atomique, controle de version, corbeille ; comptes (validation, unicite, empreinte), installation
// de l'administrateur et migration d'un site d'avant, jetons, sessions, limitation par client et par compte, configuration validee
// (defauts), courrier en mode fichier, client SMTP contre un faux serveur local, langues (t(), couverture du dictionnaire), polices
// hors de l'index.

declare(strict_types=1);

require __DIR__ . '/outils.php';

$racine = dossier_temporaire('site-unitaires');
define('SVG_SITE', true);
define('DATA_DIR', $racine . '/data');
define('CONNEXION_ESSAIS_LIBRES', 3);
define('CONNEXION_DELAI_MAX', 900);
define('COURRIER_TLS_VERIFIER', false);
define('COURRIER_DELAI', 5);
define('POLICES_SOURCES', ['jsdelivr' => 'http://127.0.0.1:9/npm/@fontsource/', 'bunny' => 'http://127.0.0.1:9/bunny/', 'gitlab' => 'http://127.0.0.1:9/gitlab/', 'fontshare' => 'http://127.0.0.1:9/wf/']);
mkdir(DATA_DIR, 0700, true);
register_shutdown_function(fn() => effacer($racine));
ecrire_config(DATA_DIR);
$_SERVER['REMOTE_ADDR'] = '203.0.113.5';
$_SERVER['HTTP_HOST'] = 'essai.local';
$_SERVER['SCRIPT_NAME'] = '/index.php';

$sources = dirname(__DIR__, 2) . '/outils/site-php/data/inc';
require $sources . '/amorce.php';
egal(null, preparer_donnees(), 'data/ se prepare');
ini_set('error_log', $racine . '/erreurs.log');

/** Un projet minimal, comme le client l'envoie (des objets, pas des tableaux associatifs : json_decode(…, false)). */
function projet(string $nom = 'Carte'): object
{
    return json_decode(json_encode([
        'format' => 'editeur-svg/projet', 'version' => 1, 'nom' => $nom,
        'dessin' => ['vb' => [0, 0, 100, 80.5], 'formes' => [['id' => 'f1', 'd' => 'M10 10L90 10L50 70Z', 'remplissage' => '#c81e28', 'contour' => null, 'epaisseur' => 1, 'opacite' => 0.1 + 0.2, 'regle' => 'nonzero', 'visible' => true, 'verrouille' => false]]],
        'production' => ['contexte' => 'generique'], 'nuancier' => [], 'ressources' => ['polices' => [], 'images' => []],
    ]), false);
}

function fichiers_projets(): array
{
    return array_values(array_filter(scandir(dossier_projets()) ?: [], fn($n) => $n[0] !== '.' && $n !== 'corbeille'));
}

/** Un compte actif, cree directement. */
function compte_actif(string $email, string $nom = 'Personne', string $mot = 'un mot de passe correct', string $langue = 'fr', string $role = 'utilisateur'): array
{
    $r = creer_compte($email, $nom, $mot, $langue, $role, 'actif');
    affirmer(isset($r['compte']), 'compte cree : ' . json_encode($r));
    return $r['compte'];
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Les comptes
// ---------------------------------------------------------------------------------------------------------------------------------

test('une adresse se normalise et se valide ; un nom se nettoie, jamais vide', function (): void {
    egal('anne@exemple.org', email_normalise(" Anne@Exemple.ORG\n"));
    egal(true, email_valide('anne@exemple.org'));
    foreach (['anne', 'anne@localhost', '@exemple.org', "anne@exemple.org\n", 'a b@exemple.org', str_repeat('a', 250) . '@e.fr', 42, null] as $e) {
        egal(false, email_valide($e), var_export($e, true));
    }
    egal('Anne Dupont', nom_compte_propre("  Anne \t Dupont\u{202E} "));
    egal(null, nom_compte_propre("\x00\x07"));
    egal(null, nom_compte_propre(''));
    egal(null, nom_compte_propre(str_repeat('é', 121)));
    egal(null, nom_compte_propre(['x']));
    egal(null, nom_compte_propre("ok\xff"));
});

test('un fichier de compte est lu seulement s il a exactement la forme attendue ; un champ inconnu n entre pas', function (): void {
    $bon = [
        'format' => 'editeur-svg/compte', 'version' => 1, 'id' => '0123456789abcdef', 'email' => 'Anne@Exemple.org', 'emailNormalise' => 'anne@exemple.org',
        'nom' => 'Anne', 'langue' => 'fr', 'role' => 'utilisateur', 'etat' => 'actif', 'empreinte' => password_hash('x', PASSWORD_BCRYPT),
        'creeLe' => '2026-10-26T10:00:00Z', 'modifieLe' => '2026-10-26T10:00:00Z', 'confirmeLe' => '2026-10-26T10:00:00Z', 'approuvePar' => 'fedcba9876543210',
    ];
    $c = compte_valide($bon);
    affirmer($c !== null, 'le bon compte passe');
    egal(['format', 'version', 'id', 'email', 'emailNormalise', 'nom', 'langue', 'role', 'etat', 'empreinte', 'creeLe', 'modifieLe', 'confirmeLe', 'approuvePar'], array_keys($c));
    egal(null, compte_valide($bon + ['inconnu' => 1])['inconnu'] ?? null, 'un champ inconnu n entre pas');
    foreach ([
        ['format' => 'autre'], ['version' => 2], ['id' => '../x'], ['email' => 'pas une adresse'], ['emailNormalise' => 'autre@exemple.org'], ['nom' => " Anne"],
        ['nom' => ''], ['langue' => 'de'], ['role' => 'dieu'], ['etat' => 'banni'], ['empreinte' => 'en clair'], ['creeLe' => 'hier'], ['confirmeLe' => 12], ['approuvePar' => 'x'],
    ] as $mutation) {
        egal(null, compte_valide(array_merge($bon, $mutation)), json_encode($mutation));
    }
    foreach (['format', 'id', 'email', 'nom', 'empreinte', 'creeLe'] as $champ) {
        $sans = $bon;
        unset($sans[$champ]);
        egal(null, compte_valide($sans), 'sans ' . $champ);
    }
    egal(null, compte_valide('texte'));
    // Un fichier mal forme sur le disque est ignore et journalise, jamais lu au mieux.
    file_put_contents(chemin_compte('0123456789abcdef'), json_encode(array_merge($bon, ['role' => 'dieu'])));
    egal(null, lire_compte('0123456789abcdef'));
    contient('0123456789abcdef.json est illisible', (string) file_get_contents($racine = (string) ini_get('error_log')));
    unlink(chemin_compte('0123456789abcdef'));
});

test('creer un compte : champs juges, adresse unique (normalisee), empreinte jamais en clair, droits 640', function (): void {
    egal('email', creer_compte('pas une adresse', 'Anne', 'un mot de passe correct', 'fr')['erreur'] ?? null);
    egal('nom', creer_compte('anne@exemple.org', '', 'un mot de passe correct', 'fr')['erreur'] ?? null);
    egal('mot-de-passe', creer_compte('anne@exemple.org', 'Anne', 'court', 'fr')['erreur'] ?? null);
    egal('mot-de-passe', creer_compte('anne@exemple.org', 'Anne', ['x'], 'fr')['erreur'] ?? null);
    egal('langue', creer_compte('anne@exemple.org', 'Anne', 'un mot de passe correct', 'de')['erreur'] ?? null);
    egal(false, comptes_existent());
    $r = creer_compte(' Anne@Exemple.org ', 'Anne', 'un mot de passe correct', 'en');
    $c = $r['compte'] ?? null;
    affirmer($c !== null, json_encode($r));
    egal('Anne@Exemple.org', $c['email']);
    egal('anne@exemple.org', $c['emailNormalise']);
    egal('a-confirmer', $c['etat']);
    egal('utilisateur', $c['role']);
    egal(true, comptes_existent());
    $texte = (string) file_get_contents(chemin_compte($c['id']));
    egal(false, str_contains($texte, 'correct'), 'jamais en clair');
    egal(true, (fileperms(chemin_compte($c['id'])) & 0o077) === 0o040 || (fileperms(chemin_compte($c['id'])) & 0o077) === 0);
    egal('existe', creer_compte('ANNE@exemple.org', 'Autre', 'un mot de passe correct', 'fr')['erreur'] ?? null, 'la meme adresse, en majuscules');
    egal('existe', creer_compte("anne@exemple.org\t", 'Autre', 'un mot de passe correct', 'fr')['erreur'] ?? null);
    egal($c['id'], compte_par_email('ANNE@EXEMPLE.ORG')['id'] ?? null);
    egal(true, verifier_mot_de_passe_compte($c, 'un mot de passe correct'));
    egal(false, verifier_mot_de_passe_compte($c, 'un mot de passe correc'));
    egal(['id', 'nom', 'email', 'langue', 'role', 'etat'], array_keys(compte_public($c)));
    egal(false, isset(compte_public($c, true)['empreinte']));
    supprimer_compte($c['id']);
});

test('l installation : un site d avant (projets a plat, corbeille, data/pwd) migre vers le premier administrateur ; ensuite la route est fermee', function (): void {
    foreach (['pwd' => "\$2y\$10\$x\n", 'password' => "clair\n", 'connexions.json' => '{}'] as $f => $contenu) {
        file_put_contents(donnees($f), $contenu);
    }
    mkdir(donnees('projets/corbeille'), 0750, true);
    file_put_contents(donnees('projets/0123456789abcdef.json'), '{}');
    file_put_contents(donnees('projets/0123456789abcdef.meta.json'), '{}');
    file_put_contents(donnees('projets/0123456789abcdef.svg'), '<svg/>');
    file_put_contents(donnees('projets/corbeille/20260101T000000Z-fedcba9876543210.json'), '{}');
    file_put_contents(donnees('projets/notes.txt'), 'pas un projet');
    unlink(fichier_config());
    egal('mot-de-passe', installer_administrateur('admin@exemple.org', 'Admin', 'court', 'en')['erreur'] ?? null);
    egal(false, comptes_existent(), 'rien n est ecrit sur un refus');
    egal(false, is_file(fichier_config()));
    $r = installer_administrateur('admin@exemple.org', 'Admin', 'un mot de passe assez long', 'en', ['nom' => 'Mon site', 'expediteur' => 'pas une adresse']);
    $a = $r['compte'] ?? null;
    affirmer($a !== null, json_encode($r));
    egal('admin', $a['role']);
    egal('actif', $a['etat']);
    affirmer(isset($a['confirmeLe'], $a['approuveLe']), 'confirme et approuve d emblee');
    $d = donnees('projets/' . $a['id']);
    egal(true, is_file($d . '/0123456789abcdef.json') && is_file($d . '/0123456789abcdef.meta.json') && is_file($d . '/0123456789abcdef.svg'), 'les projets ont migre');
    egal(true, is_file($d . '/corbeille/20260101T000000Z-fedcba9876543210.json'), 'la corbeille aussi');
    egal(false, is_dir(donnees('projets/corbeille')));
    egal(true, is_file(donnees('projets/notes.txt')), 'un fichier etranger reste');
    egal(1, nombre_projets($a['id']));
    foreach (['pwd', 'password', 'connexions.json'] as $f) {
        egal(false, file_exists(donnees($f)), $f . ' supprime : le mot de passe unique n existe plus');
    }
    $config = lire_json(fichier_config());
    egal('Mon site', $config['site']['nom'] ?? null);
    egal('en', $config['site']['langue'] ?? null);
    egal('admin@exemple.org', $config['courrier']['expediteur'] ?? null, 'un expediteur refuse : l adresse de l administrateur');
    egal('mail', $config['courrier']['mode'] ?? null);
    egal('existe', installer_administrateur('autre@exemple.org', 'Autre', 'un mot de passe assez long', 'fr')['erreur'] ?? null, 'la route n existe plus');
    contient('administrateur installe', (string) file_get_contents(donnees('journal/comptes.log')));
    // La configuration des tests reprend (courrier en mode fichier).
    ecrire_config(DATA_DIR);
    config_lire(true);
    unlink(donnees('projets/notes.txt'));
});

test('modifier un compte reecrit son fichier valide, pose modifieLe ; une empreinte ancienne se refait a la verification', function (): void {
    $c = compte_actif('bcrypt@exemple.org');
    $vieille = password_hash('un mot de passe correct', PASSWORD_BCRYPT);
    modifier_compte($c['id'], ['empreinte' => $vieille]);
    $c = lire_compte($c['id']);
    egal(true, verifier_mot_de_passe_compte($c, 'un mot de passe correct'));
    $apres = lire_compte($c['id']);
    if (defined('PASSWORD_ARGON2ID')) {
        affirmer(str_starts_with($apres['empreinte'], '$argon2id$'), 'refaite en argon2id');
        affirmer(marque_compte($apres) !== marque_compte($c), 'la marque suit l empreinte');
    }
    egal(null, modifier_compte('ffffffffffffffff', ['nom' => 'x']));
    try {
        modifier_compte($c['id'], ['role' => 'dieu']);
        affirmer(false, 'un compte mal forme ne s ecrit pas');
    } catch (InvalidArgumentException) {
    }
    egal('utilisateur', lire_compte($c['id'])['role']);
    supprimer_compte($c['id']);
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Les jetons, les sessions, la limitation
// ---------------------------------------------------------------------------------------------------------------------------------

test('un jeton se range hache, sert une fois, expire, et le nouveau remplace l ancien du meme usage', function (): void {
    $c = compte_actif('jeton@exemple.org');
    $j1 = creer_jeton('confirmation', $c['id'], 60);
    egal(64, strlen($j1));
    egal([], glob(donnees('jetons/' . $j1 . '*')) ?: [], 'jamais en clair sur le disque');
    egal(true, is_file(chemin_jeton($j1)));
    egal($c['id'], lire_jeton($j1, 'confirmation')['compte'] ?? null);
    egal(null, lire_jeton($j1, 'reinitialisation'), 'pas pour un autre usage');
    egal(null, lire_jeton(strrev($j1), 'confirmation'));
    egal(null, lire_jeton(['x'], 'confirmation'));
    $j2 = creer_jeton('confirmation', $c['id'], 60);
    egal(null, lire_jeton($j1, 'confirmation'), 'remplace');
    egal($c['id'], consommer_jeton($j2, 'confirmation')['compte'] ?? null);
    egal(null, consommer_jeton($j2, 'confirmation'), 'une seule fois');
    $j3 = creer_jeton('reinitialisation', $c['id'], -1);
    egal(null, lire_jeton($j3, 'reinitialisation'), 'expire');
    egal(false, is_file(chemin_jeton($j3)), 'et supprime');
    $j4 = creer_jeton('reinitialisation', $c['id'], 60);
    supprimer_jetons_du_compte($c['id']);
    egal(null, lire_jeton($j4, 'reinitialisation'));
    try {
        creer_jeton('autre', $c['id'], 60);
        affirmer(false, 'usage inconnu');
    } catch (InvalidArgumentException) {
    }
    supprimer_compte($c['id']);
});

/** Pose le cookie de session comme le navigateur le renverrait, et repart d'une requete neuve (la session precedente oubliee). */
function requete_avec_session(?string $jeton): void
{
    session_courante(null, true);
    compte_connecte(null, true);
    if ($jeton === null) {
        unset($_COOKIE[COOKIE_SESSION]);
    } else {
        $_COOKIE[COOKIE_SESSION] = $jeton;
    }
}

test('les sessions : anonyme avec jeton CSRF, connectee a la connexion, expiree apres l inactivite, fermee si le mot de passe change ou le compte perd l acces', function (): void {
    $c = compte_actif('session@exemple.org');
    requete_avec_session(null);
    demarrer_session_neuve();
    $s = session_courante();
    egal('', $s['compte']);
    egal(1, preg_match('/^[a-f0-9]{64}$/', $s['csrf']));
    egal(true, csrf_valide($s['csrf']));
    egal(false, csrf_valide(strtoupper($s['csrf'])));
    egal(false, csrf_valide(null));
    egal(false, est_connecte());
    $anonyme = $s['jeton'];
    egal(true, is_file(chemin_session($anonyme)));
    egal([], glob(donnees('sessions/' . $anonyme . '*')) ?: [], 'le jeton n est jamais en clair sur le disque');
    // La meme session a la requete suivante.
    requete_avec_session($anonyme);
    demarrer_session_neuve();
    egal($s['csrf'], jeton_csrf());
    // La connexion : nouveau jeton, nouveau CSRF, l'anonyme disparait.
    ouvrir_session_connectee($c);
    $connectee = session_courante();
    affirmer($connectee['jeton'] !== $anonyme && $connectee['csrf'] !== $s['csrf'], 'pas de fixation');
    egal(false, is_file(chemin_session($anonyme)));
    egal(true, est_connecte());
    egal($c['id'], compte_connecte()['id']);
    affirmer(isset(lire_compte($c['id'])['derniereConnexion']), 'la connexion est datee');
    requete_avec_session($connectee['jeton']);
    demarrer_session_neuve();
    egal($c['id'], compte_connecte()['id'] ?? null, 'relue a la requete suivante');
    // Le mot de passe change ailleurs : la session se ferme a la requete suivante, l'avis le dit.
    poser_mot_de_passe_compte($c['id'], 'un autre mot de passe');
    requete_avec_session($connectee['jeton']);
    demarrer_session_neuve();
    egal(false, est_connecte());
    egal('change', prendre_avis());
    egal('', prendre_avis(), 'pris une fois');
    egal(false, is_file(chemin_session($connectee['jeton'])));
    // L'inactivite.
    ouvrir_session_connectee(lire_compte($c['id']));
    $j = session_courante()['jeton'];
    $f = chemin_session($j);
    $vieux = json_decode((string) file_get_contents($f), true);
    $vieux['vu'] = time() - inactivite_session() - 1;
    file_put_contents($f, json_encode($vieux));
    requete_avec_session($j);
    demarrer_session_neuve();
    egal('expiree', prendre_avis());
    egal(false, est_connecte());
    // Le compte suspendu perd sa session.
    ouvrir_session_connectee(lire_compte($c['id']));
    $j = session_courante()['jeton'];
    modifier_compte($c['id'], ['etat' => 'suspendu']);
    requete_avec_session($j);
    demarrer_session_neuve();
    egal('acces', prendre_avis());
    // Une session dont le fichier est altere vaut une session neuve.
    $j = session_courante()['jeton'];
    file_put_contents(chemin_session($j), '{"compte": 42}');
    requete_avec_session($j);
    demarrer_session_neuve();
    affirmer(session_courante()['jeton'] !== $j, 'session neuve');
    supprimer_compte($c['id']);
});

/** demarrer_session, apres requete_avec_session (qui a oublie la session de la requete precedente). */
function demarrer_session_neuve(): void
{
    session_courante(null, true);
    compte_connecte(null, true);
    demarrer_session();
}

test('changer son mot de passe garde sa session, les autres se ferment a leur requete suivante ; supprimer un compte efface tout', function (): void {
    $c = compte_actif('multi@exemple.org');
    requete_avec_session(null);
    demarrer_session_neuve();
    ouvrir_session_connectee($c);
    $mienne = session_courante()['jeton'];
    $autres = [];
    for ($i = 0; $i < 3; $i++) {
        $autres[] = creer_session($c['id'], marque_compte($c))['jeton'];
    }
    $autre = creer_session(compte_actif('voisin@exemple.org')['id'], 'x')['jeton'];
    // La session courante est de nouveau la mienne.
    requete_avec_session($mienne);
    demarrer_session_neuve();
    $c = poser_mot_de_passe_compte($c['id'], 'encore un autre mot de passe');
    garder_seule_session($c);
    requete_avec_session($mienne);
    demarrer_session_neuve();
    egal(true, est_connecte(), 'la mienne reste : la marque a suivi');
    foreach ($autres as $j) {
        requete_avec_session($j);
        demarrer_session_neuve();
        egal(false, est_connecte(), 'les autres sont fermees a leur requete suivante');
        egal('change', prendre_avis(), 'et savent pourquoi');
    }
    egal(true, is_file(chemin_session($autre)), 'pas celle d un autre compte');
    requete_avec_session($mienne);
    demarrer_session_neuve();
    egal(1, fermer_sessions_du_compte($c['id']));
    egal(true, supprimer_compte($c['id']));
    egal(false, supprimer_compte($c['id']));
    $voisin = compte_par_email('voisin@exemple.org');
    supprimer_compte($voisin['id']);
    egal(false, is_file(chemin_session($autre)));
});

test('les essais de connexion attendent un delai qui double apres les essais libres, puis le plafond ; par client et par compte', function (): void {
    egal([0, 0, 0, 2, 4, 8, 16], array_map('delai_apres', [0, 1, 2, 3, 4, 5, 6]));
    egal(900, delai_apres(40));
    $t = 1000000;
    $c = compte_actif('limite@exemple.org', 'Limite', 'le bon mot de passe');
    // Une adresse inconnue : le client est compte, la reponse est generique.
    $r = essayer_connexion('inconnu@exemple.org', 'x', 'c:client-a', $t);
    egal('generique', $r['refus'] ?? null);
    egal(0, $r['suite']);
    // Un mot de passe faux : le client et le compte sont comptes.
    for ($i = 0; $i < 2; $i++) {
        egal('generique', essayer_connexion('limite@exemple.org', 'faux', 'c:client-a', $t)['refus'] ?? null);
    }
    egal(2, essayer_connexion('limite@exemple.org', 'le bon mot de passe', 'c:client-a', $t)['attente'] ?? null, 'le client A attend, meme avec le bon mot de passe');
    egal(2, essayer_connexion('autre@exemple.org', 'x', 'c:client-a', $t)['attente'] ?? null, 'le client A attend pour toute adresse');
    // Le client B vise le meme compte : il herite des deux echecs du compte, et le troisieme le retient aussi.
    egal('generique', essayer_connexion('limite@exemple.org', 'faux', 'c:client-b', $t)['refus'] ?? null);
    egal(2, essayer_connexion('limite@exemple.org', 'le bon mot de passe', 'c:client-b', $t)['attente'] ?? null, 'le compte est retenu pour un autre client');
    egal(true, essayer_connexion('inconnu@exemple.org', 'x', 'c:client-c', $t)['refus'] === 'generique', 'un autre client sur une autre adresse essaie librement');
    // Le delai passe : le bon mot de passe entre, et efface les echecs du client et du compte.
    $r = essayer_connexion('limite@exemple.org', 'le bon mot de passe', 'c:client-b', $t + 3);
    egal(true, $r['ok'] ?? false, json_encode($r));
    egal(0, attente_restante(cle_compte($c['id']), $t + 3));
    egal(0, attente_restante('c:client-b', $t + 3));
    // Les etats : le bon mot de passe, mais pas actif.
    foreach (['a-confirmer' => 'a-confirmer', 'en-attente' => 'en-attente', 'refuse' => 'acces', 'suspendu' => 'acces'] as $etat => $raison) {
        modifier_compte($c['id'], ['etat' => $etat]);
        $r = essayer_connexion('limite@exemple.org', 'le bon mot de passe', 'c:client-d', $t + 10);
        egal($raison, $r['refus'] ?? null, $etat);
        egal($c['id'], $r['compte']['id'] ?? null);
    }
    egal(0, attente_restante('c:client-d', $t + 10), 'un refus par etat n est pas un echec de mot de passe');
    $journal = (string) file_get_contents(donnees('journal/connexions.log'));
    contient('echec client=c:client-a compte=-', $journal);
    contient('refus etat=suspendu', $journal);
    egal(false, str_contains($journal, 'limite@exemple.org') || str_contains($journal, 'bon mot'), 'ni adresse ni mot de passe au journal');
    supprimer_compte($c['id']);
});

// ---------------------------------------------------------------------------------------------------------------------------------
// La configuration et les langues
// ---------------------------------------------------------------------------------------------------------------------------------

test('la configuration se valide champ par champ : un champ refuse vaut son defaut et c est dit ; un fichier illisible vaut les defauts', function (): void {
    $v = config_valide(['site' => ['nom' => 'Mon site', 'langue' => 'de', 'adresse' => 'ftp://x'], 'inscriptions' => ['ouvertes' => 'oui'], 'courrier' => ['mode' => 'pigeon', 'smtp' => ['port' => 70000, 'hote' => 'smtp.exemple.org']], 'sessions' => ['inactivite' => 'longtemps'], 'inconnu' => 1]);
    egal('Mon site', $v['config']['site']['nom']);
    egal('fr', $v['config']['site']['langue']);
    egal('', $v['config']['site']['adresse']);
    egal(true, $v['config']['inscriptions']['ouvertes']);
    egal('mail', $v['config']['courrier']['mode']);
    egal(587, $v['config']['courrier']['smtp']['port']);
    egal('smtp.exemple.org', $v['config']['courrier']['smtp']['hote']);
    egal(['site.langue', 'site.adresse', 'inscriptions.ouvertes', 'courrier.mode', 'courrier.smtp.port', 'sessions.inactivite'], $v['problemes']);
    egal(false, isset($v['config']['inconnu']));
    egal([], config_valide(CONFIG_DEFAUTS, true)['problemes'], 'les defauts complets passent en strict');
    contient('courrier.expediteur', implode(',', config_valide(['site' => ['nom' => 'x']], true)['problemes']), 'en strict, un champ absent est un probleme');
    egal(['format'], array_values(array_intersect(['format'], config_valide(array_merge(CONFIG_DEFAUTS, ['version' => 2]), true)['problemes'])));
    egal('https://exemple.org/svg/', config_valide(['site' => ['adresse' => ' https://exemple.org/svg/ ']])['config']['site']['adresse']);
    // Un fichier illisible : les defauts, et le probleme « fichier ».
    $sauve = (string) file_get_contents(fichier_config());
    file_put_contents(fichier_config(), '{pas du json');
    $c = config_lire(true);
    egal(CONFIG_DEFAUTS['site']['nom'], $c['config']['site']['nom']);
    egal(['fichier'], $c['problemes']);
    egal(false, $c['fichier']);
    egal('mail', reglage('courrier.mode'));
    unlink(fichier_config());
    egal([], config_lire(true)['problemes'], 'absent : les defauts, sans probleme');
    file_put_contents(fichier_config(), $sauve);
    config_lire(true);
    egal('fichier', reglage('courrier.mode'));
    try {
        reglage('site.inconnu');
        affirmer(false, 'reglage inconnu');
    } catch (InvalidArgumentException) {
    }
    $pub = config_publique();
    egal(false, isset($pub['reglages']['courrier']['smtp']['motDePasse']), 'le mot de passe SMTP n est jamais rendu');
    egal(false, $pub['smtpMotDePassePose']);
    egal(['nom' => 'Site d’essai', 'langue' => 'fr', 'inscriptions' => true], site_public());
});

test('t() rend la cle en francais, la traduction en anglais, interpole {valeurs} ; chaque cle du code livre a sa traduction', function () use ($sources): void {
    langue_courante('fr');
    egal('Mot de passe', t('Mot de passe'));
    egal('Patientez 5 secondes avant de réessayer.', t('Patientez {n} secondes avant de réessayer.', ['n' => 5]));
    egal('Password', t('Mot de passe', [], 'en'));
    langue_courante('en');
    egal('Wait 5 seconds before trying again.', t('Patientez {n} secondes avant de réessayer.', ['n' => 5]));
    egal('phrase sans traduction', t('phrase sans traduction'));
    langue_courante('de');
    egal('en', langue_courante(), 'une langue inconnue ne change rien');
    langue_courante('fr');
    // La langue de la requete : le compte, sinon le cookie, sinon le site.
    egal('fr', langue_de_la_requete(null));
    $_COOKIE[COOKIE_LANGUE] = 'en';
    egal('en', langue_de_la_requete(null));
    egal('fr', langue_de_la_requete(['langue' => 'fr']));
    $_COOKIE[COOKIE_LANGUE] = 'xx';
    egal('fr', langue_de_la_requete(null));
    unset($_COOKIE[COOKIE_LANGUE]);
    // La couverture : toute cle t('…') du code a sa traduction, aux memes {valeurs} ; aucune traduction orpheline.
    $cles = [];
    foreach (glob($sources . '/*.php') ?: [] as $f) {
        preg_match_all("/\\bt\\('((?:[^'\\\\]|\\\\.)*)'/", (string) file_get_contents($f), $m);
        foreach ($m[1] as $k) {
            $cles[str_replace("\\'", "'", $k)] = basename($f);
        }
    }
    affirmer(count($cles) > 100, 'des cles trouvees : ' . count($cles));
    $manquantes = array_keys(array_diff_key($cles, TRADUCTIONS_EN));
    egal([], $manquantes, 'cles sans traduction');
    egal([], array_values(array_diff(array_keys(TRADUCTIONS_EN), array_keys($cles))), 'traductions orphelines');
    foreach (TRADUCTIONS_EN as $fr => $en) {
        preg_match_all('/\{[a-z]+\}/', $fr, $a);
        preg_match_all('/\{[a-z]+\}/', $en, $b);
        sort($a[0]);
        sort($b[0]);
        egal($a[0], $b[0], 'valeurs de « ' . $fr . ' »');
        affirmer($en !== $fr || $fr === ' ou ' || preg_match('/^[A-Za-z ]*$/', $fr) === 1, 'traduite : ' . $fr);
    }
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Le courrier : mode fichier, puis SMTP contre un faux serveur
// ---------------------------------------------------------------------------------------------------------------------------------

test('en mode fichier, un mail s ecrit en .eml : texte brut UTF-8, sujet encode, lien en clair, dans la langue du destinataire', function (): void {
    $c = compte_actif('anne@exemple.org', 'Anne Été', 'un mot de passe correct', 'en');
    modifier_compte($c['id'], ['etat' => 'a-confirmer']);
    $c = lire_compte($c['id']);
    egal(null, mail_confirmation($c));
    $m = dernier_mail(DATA_DIR, 'anne@exemple.org');
    affirmer($m !== null, 'un mail ecrit');
    egal('text/plain; charset=utf-8', $m['entetes']['Content-Type']);
    egal('Site d’essai <no-reply@exemple.org>', mb_decode_mimeheader($m['entetes']['From']));
    egal('Confirm your address — Site d’essai', $m['sujet']);
    contient('Hello Anne Été,', $m['corps']);
    contient('http://essai.local/index.php?confirmer=', $m['corps']);
    $jeton = jeton_du_mail($m, 'confirmer');
    egal($c['id'], lire_jeton($jeton, 'confirmation')['compte'] ?? null, 'le lien porte un jeton valide');
    // Les administrateurs, chacun dans sa langue.
    $admin = compte_actif('chef@exemple.org', 'Chef', 'un mot de passe correct', 'fr', 'admin');
    mails_nouvelle_demande($c);
    $m = dernier_mail(DATA_DIR, 'chef@exemple.org');
    contient('Nouvelle demande : Anne Été (anne@exemple.org)', $m['corps'] ?? '');
    contient('Bonjour Chef,', $m['corps'] ?? '');
    mail_refus($c, 'Adresse inconnue de l’association');
    contient('Reason given: Adresse inconnue de l’association', dernier_mail(DATA_DIR, 'anne@exemple.org')['corps'] ?? '');
    mail_reinitialisation($c);
    $m = dernier_mail(DATA_DIR, 'anne@exemple.org');
    egal('Reset your password — Site d’essai', $m['sujet']);
    affirmer(jeton_du_mail($m, 'reinitialiser') !== '', 'un lien de reinitialisation');
    // Un en-tete piege ne fabrique pas de ligne.
    $msg = composer_message("x@exemple.org", "Sujet\r\nBcc: pirate@exemple.org", 'corps', 'de@exemple.org', "Nom\r\nX: y");
    egal([], array_values(array_filter($msg['entetes'], fn(string $e): bool => str_starts_with($e, 'Bcc:') || str_starts_with($e, 'X: y'))), 'aucun en-tete injecte');
    egal(9, count($msg['entetes']));
    contient('Aucune adresse d’expédition', (string) (function () {
        $c = config_lire()['config'];
        $c['courrier']['mode'] = 'smtp';
        $c['courrier']['expediteur'] = '';
        config_ecrire($c);
        try {
            return envoyer_courrier('a@exemple.org', 's', 'c');
        } finally {
            ecrire_config(DATA_DIR);
            config_lire(true);
        }
    })());
    egal(false, str_contains((string) file_get_contents(donnees('journal/courrier.log')), 'anne@exemple.org'), 'le journal ne garde pas l adresse');
    supprimer_compte($c['id']);
    supprimer_compte($admin['id']);
});

/** Lance le faux serveur SMTP dans son processus ; rend [port, journal des commandes]. */
function faux_smtp(string $mode, ?string $cert = null): array
{
    $t = sys_get_temp_dir() . '/faux-smtp-' . bin2hex(random_bytes(4));
    $commande = [PHP_BINARY, __DIR__ . '/faux-smtp.php', $t . '.port', $t . '.log', $mode];
    if ($cert !== null) {
        $commande[] = $cert;
    }
    $p = proc_open($commande, [0 => ['pipe', 'r'], 1 => ['file', $t . '.sortie', 'a'], 2 => ['file', $t . '.sortie', 'a']], $tubes);
    register_shutdown_function(function () use ($p, $t): void {
        proc_terminate($p);
        proc_close($p);
        foreach (['.port', '.log', '.sortie'] as $s) {
            @unlink($t . $s);
        }
    });
    for ($i = 0; $i < 100 && !is_file($t . '.port'); $i++) {
        usleep(50000);
    }
    return [(int) file_get_contents($t . '.port'), $t . '.log'];
}

/** Les commandes que le faux serveur a recues. */
function commandes_smtp(string $journal): array
{
    for ($i = 0; $i < 100 && !is_file($journal); $i++) {
        usleep(50000);
    }
    return array_map(fn(string $l): string => (string) json_decode($l), array_filter(explode("\n", (string) @file_get_contents($journal))));
}

/** Regle le courrier en SMTP vers le faux serveur. */
function regler_smtp(int $port, string $securite, string $utilisateur = '', string $motDePasse = ''): void
{
    $c = config_lire()['config'];
    $c['courrier']['mode'] = 'smtp';
    $c['courrier']['smtp'] = ['hote' => '127.0.0.1', 'port' => $port, 'securite' => $securite, 'utilisateur' => $utilisateur, 'motDePasse' => $motDePasse];
    config_ecrire($c);
}

test('SMTP en clair avec AUTH PLAIN : EHLO, AUTH, MAIL FROM, RCPT TO, DATA (le message entier, points doubles), QUIT', function (): void {
    [$port, $journal] = faux_smtp('clair');
    regler_smtp($port, 'aucune', 'robot', 'secret-smtp');
    egal(null, envoyer_courrier('anne@exemple.org', 'Sujet été', "Bonjour.\n.ligne qui commence par un point\nFin."));
    $c = commandes_smtp($journal);
    affirmer(str_starts_with($c[0] ?? '', 'EHLO '), 'EHLO d abord : ' . json_encode($c));
    egal('AUTH PLAIN ' . base64_encode("\0robot\0secret-smtp"), $c[1] ?? null);
    egal('MAIL FROM:<no-reply@exemple.org>', $c[2] ?? null);
    egal('RCPT TO:<anne@exemple.org>', $c[3] ?? null);
    egal('DATA', $c[4] ?? null);
    $donnees = base64_decode(substr((string) ($c[5] ?? ''), 5));
    contient("Subject: =?UTF-8?B?", $donnees);
    contient('Content-Transfer-Encoding: quoted-printable', $donnees);
    [, $corps] = explode("\r\n\r\n", $donnees, 2);
    contient(".ligne qui commence par un point", quoted_printable_decode($corps));
    egal(false, (bool) preg_match('/^\.[^.]/m', $corps), 'aucune ligne du message ne commence par un point seul (quoted-printable, puis doublage)');
    egal('QUIT', $c[6] ?? null);
    egal(false, str_contains((string) file_get_contents(donnees('journal/courrier.log')) . (string) file_get_contents((string) ini_get('error_log')), 'secret-smtp'), 'le mot de passe SMTP n entre dans aucun journal');
    ecrire_config(DATA_DIR);
    config_lire(true);
});

test('SMTP : STARTTLS refuse par le serveur arrete tout, rien ne part en clair ; AUTH refuse, RCPT refuse, port ferme sont nommes', function (): void {
    [$port, $journal] = faux_smtp('starttls-refuse');
    regler_smtp($port, 'starttls', 'robot', 'secret');
    $e = (string) envoyer_courrier('anne@exemple.org', 'Sujet', 'corps');
    contient('STARTTLS', $e);
    $c = commandes_smtp($journal);
    egal(['EHLO', 'STARTTLS'], array_map(fn(string $l): string => strtok($l, ' ') ?: '', $c), 'rien apres le refus : ' . json_encode($c));
    [$port, $journal] = faux_smtp('auth-echec');
    regler_smtp($port, 'aucune', 'robot', 'secret');
    contient('AUTH', (string) envoyer_courrier('anne@exemple.org', 'Sujet', 'corps'));
    egal(false, in_array('DATA', commandes_smtp($journal), true));
    [$port, $journal] = faux_smtp('rcpt-refuse');
    regler_smtp($port, 'aucune');
    contient('RCPT TO', (string) envoyer_courrier('anne@exemple.org', 'Sujet', 'corps'));
    regler_smtp(9, 'aucune');
    contient('connexion', (string) envoyer_courrier('anne@exemple.org', 'Sujet', 'corps'));
    $c = config_lire()['config'];
    $c['courrier']['smtp']['hote'] = '';
    config_ecrire($c);
    contient('Aucun serveur SMTP', (string) envoyer_courrier('anne@exemple.org', 'Sujet', 'corps'));
    ecrire_config(DATA_DIR);
    config_lire(true);
});

test('SMTP : STARTTLS accepte chiffre la suite (AUTH, puis le message), avec un certificat auto-signe pour l essai', function (): void {
    affirmer(function_exists('openssl_pkey_new'), 'l extension openssl de PHP est requise pour cet essai');
    $cle = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
    $csr = openssl_csr_new(['commonName' => '127.0.0.1'], $cle, ['digest_alg' => 'sha256']);
    $x509 = openssl_csr_sign($csr, null, $cle, 1, ['digest_alg' => 'sha256']);
    openssl_x509_export($x509, $certPem);
    openssl_pkey_export($cle, $clePem);
    $cert = sys_get_temp_dir() . '/faux-smtp-' . bin2hex(random_bytes(4)) . '.pem';
    file_put_contents($cert, $certPem . $clePem);
    register_shutdown_function(fn() => @unlink($cert));
    [$port, $journal] = faux_smtp('starttls-ok', $cert);
    regler_smtp($port, 'starttls', 'robot', 'secret-tls');
    $e = envoyer_courrier('anne@exemple.org', 'Sujet', 'corps chiffré');
    egal(null, $e);
    $c = commandes_smtp($journal);
    $mots = array_map(fn(string $l): string => strtok($l, ' ') ?: '', $c);
    egal(['EHLO', 'STARTTLS', 'EHLO', 'AUTH', 'MAIL', 'RCPT', 'DATA', 'DATA:', 'QUIT'], array_map(fn(string $m): string => str_starts_with($m, 'DATA:') ? 'DATA:' : $m, $mots), json_encode($c));
    affirmer(str_starts_with($c[3], 'AUTH PLAIN '), 'l authentification part apres STARTTLS seulement');
    contient('corps chiffr', quoted_printable_decode(base64_decode(substr($c[7], 5))));
    ecrire_config(DATA_DIR);
    config_lire(true);
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Les projets, bornes au compte
// ---------------------------------------------------------------------------------------------------------------------------------

/** Le compte dont les tests des projets manipulent les projets, cree par le premier d'entre eux (les tests s'enregistrent d'abord, puis courent). */
function proprietaire(): array
{
    return $GLOBALS['proprietaire'] ??= compte_actif('projets@exemple.org');
}

test('les projets vivent dans le dossier du compte ; sans compte pose, aucun chemin ne se fabrique', function (): void {
    try {
        dossier_projets();
        affirmer(false, 'sans compte pose, pas de dossier');
    } catch (LogicException) {
    }
    $proprietaire = proprietaire();
    definir_compte_projets($proprietaire['id']);
    egal(donnees('projets/' . $proprietaire['id']), dossier_projets());
    egal(true, is_dir(dossier_projets() . '/corbeille'));
    try {
        compte_projets('../x');
        affirmer(false, 'compte invalide');
    } catch (InvalidArgumentException) {
    }
});

test('un nom de projet est assaini, jamais un chemin', function (): void {
    egal('Carte de Noël', nom_propre("  Carte \t de\nNoël "));
    egal('-..-etc-passwd', nom_propre('../../etc/passwd'));
    egal('Sans titre', nom_propre('...'));
    egal('Sans titre', nom_propre("\x00\x07"));
    egal('abc d', nom_propre("a\u{202E}b\u{200B}c\u{0085}d"));
    egal('Sans titre', nom_propre(['tableau']));
    egal(120, mb_strlen(nom_propre(str_repeat('é', 300))));
    egal('ok', nom_propre("ok\xff"), 'un octet qui n’est pas de l’UTF-8 part');
});

test('un identifiant hostile ne fabrique jamais de chemin', function (): void {
    foreach (['../0123456789abcdef', '0123456789ABCDEF', '0123456789abcde', "0123456789abcdef\x00", '0123456789abcdef/..', ''] as $id) {
        egal(false, id_valide($id), var_export($id, true));
        try {
            chemin_projet($id, '.json');
            affirmer(false, 'chemin fabrique pour ' . var_export($id, true));
        } catch (InvalidArgumentException) {
        }
    }
    egal(true, id_valide('0123456789abcdef'));
    try {
        chemin_projet('0123456789abcdef', '.php');
        affirmer(false, 'suffixe libre accepte');
    } catch (InvalidArgumentException) {
    }
});

test('la structure minimale et le format d un projet sont verifies', function (): void {
    egal(null, projet_invalide(projet()));
    contient('format', (string) projet_invalide(json_decode('{"format":"autre","version":1}', false)));
    contient('objet', (string) projet_invalide([]));
    $p = projet();
    $p->dessin->vb = [0, 0, 'x', 1];
    contient('plan de travail', (string) projet_invalide($p));
    $p = projet();
    $p->dessin->formes = [['id' => 1]];
    contient('forme', (string) projet_invalide($p));
    $p = projet();
    $p->version = 1.5;
    contient('version', (string) projet_invalide($p));
    $p = projet();
    unset($p->ressources);
    contient('ressources', (string) projet_invalide($p));
});

test('une vignette n est gardee que si elle est le SVG inerte de l editeur', function (): void {
    egal(true, vignette_sure('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0Z" fill="#000"/></svg>'));
    foreach ([
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><path onload="x()"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:x"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><path style="fill:url(http://x)"/></svg>',
        '<!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg"></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject/></svg>',
        '<html><svg xmlns="http://www.w3.org/2000/svg"></svg>',
        str_repeat('x', VIGNETTE_OCTETS_MAX + 1),
        42,
    ] as $v) {
        egal(false, vignette_sure($v), is_string($v) ? mb_substr($v, 0, 60) : 'non texte');
    }
});

test('une vignette a degrade (modele v2, etape 3) est gardee ; toute autre reference reste refusee', function (): void {
    $degrade = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10" data-ed-modele="2"><defs><linearGradient id="ed-d-11f2ea1d7027e8" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="10" y2="0"><stop offset="0" stop-color="#c81e28"/><stop offset="1" stop-color="#1f5fb0" stop-opacity="0.5"/></linearGradient></defs><path d="M0 0L10 0L10 10Z" fill="url(#ed-d-11f2ea1d7027e8)" stroke="url(#ed-d-11f2ea1d7027e8-2)" stroke-width="1"/></svg>';
    egal(true, vignette_sure($degrade));
    foreach ([
        str_replace('url(#ed-d-11f2ea1d7027e8)', 'url(#autre)', $degrade),
        str_replace('url(#ed-d-11f2ea1d7027e8)', 'url(http://x.invalid/#ed-d-11f2ea1d7027e8)', $degrade),
        str_replace('url(#ed-d-11f2ea1d7027e8)', 'url(#ed-d-11f2ea1d7027e8) url(http://x)', $degrade),
        str_replace('="url(#ed-d-11f2ea1d7027e8)"', '="javasurl(#ed-d-11f2ea1d7027e8)cript:"', $degrade),
        str_replace('url(#ed-d-11f2ea1d7027e8)', 'url(#ed-c-11f2ea1d7027e8)', $degrade),
        str_replace('<defs>', '<defs><style>@import url(x)</style>', $degrade),
        str_replace('id="ed-d-11f2ea1d7027e8"', 'id="ed-d-11f2ea1d7027e8" href="http://x"', $degrade),
    ] as $v) {
        egal(false, vignette_sure($v), mb_substr($v, 150, 120));
    }
});

test('enregistrer un projet neuf, puis par-dessus avec la bonne revision ; refuser une revision depassee ou absente', function (): void {
    $r = enregistrer_projet(null, projet('Première'), null, '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0Z"/></svg>');
    affirmer(isset($r['meta']), 'enregistre : ' . json_encode($r));
    $m = $r['meta'];
    egal(1, $m['revision']);
    egal(true, $m['vignette']);
    egal('Première', $m['nom']);
    $relu = json_decode((string) file_get_contents(chemin_projet($m['id'], '.json')), true);
    egal(['format', 'version', 'nom', 'creeLe', 'modifieLe', 'dessin', 'production', 'nuancier', 'ressources'], array_keys($relu));
    egal(0.30000000000000004, $relu['dessin']['formes'][0]['opacite'], 'les nombres gardent leur pleine precision');
    egal(80.5, $relu['dessin']['vb'][3]);

    $ok = enregistrer_projet($m['id'], projet('Deuxième'), 1, null);
    egal(2, $ok['meta']['revision'] ?? null);
    egal(false, $ok['meta']['vignette'], 'une vignette absente efface l ancienne');
    egal($m['creeLe'], $ok['meta']['creeLe']);

    $vieux = enregistrer_projet($m['id'], projet('Autre onglet'), 1, null);
    egal(409, $vieux['statut'] ?? null, 'revision depassee');
    egal(2, $vieux['meta']['revision'] ?? null);
    egal(428, enregistrer_projet($m['id'], projet(), null, null)['statut'] ?? null, 'revision absente');
    egal(404, enregistrer_projet('ffffffffffffffff', projet(), 1, null)['statut'] ?? null, 'projet disparu');
    egal(400, enregistrer_projet(null, json_decode('{"format":"x"}', false), null, null)['statut'] ?? null, 'pas un projet');
    egal('Deuxième', json_decode((string) file_get_contents(chemin_projet($m['id'], '.json')), true)['nom'], 'le refus n a rien ecrit');
});

test('l ecriture est atomique : aucun fichier temporaire ne reste, un lecteur voit l ancien ou le nouveau', function (): void {
    $f = dossier_projets() . '/essai-atomique.json';
    ecrire_atomique($f, str_repeat('a', 100000));
    ecrire_atomique($f, 'nouveau');
    egal('nouveau', file_get_contents($f));
    egal([], array_values(array_filter(scandir(dossier_projets()) ?: [], fn($n) => str_starts_with($n, '.tmp-'))), 'aucun temporaire');
    unlink($f);
    try {
        ecrire_atomique(donnees('absent/x.json'), 'x');
        affirmer(false, 'un dossier absent doit lever');
    } catch (RuntimeException) {
    }
});

test('un projet trop gros est refuse avant d etre ecrit', function (): void {
    $p = projet();
    $p->dessin->formes[0]->d = 'M0 0' . str_repeat('L1 1', (int) (PROJET_OCTETS_MAX / 4));
    $avant = fichiers_projets();
    egal(413, enregistrer_projet(null, $p, null, null)['statut'] ?? null);
    egal($avant, fichiers_projets());
});

test('renommer, dupliquer, supprimer : la fiche suit, la corbeille du compte garde tout', function (): void {
    $m = enregistrer_projet(null, projet('Original'), null, '<svg xmlns="http://www.w3.org/2000/svg"></svg>')['meta'];
    $r = renommer_projet($m['id'], "  Nouveau\u{202E} nom/../ ");
    egal('Nouveau nom-..-', $r['meta']['nom']);
    egal(2, $r['meta']['revision']);
    egal(true, $r['meta']['vignette'], 'renommer garde la vignette');
    egal('Nouveau nom-..-', json_decode((string) file_get_contents(chemin_projet($m['id'], '.json')), true)['nom']);
    $copie = dupliquer_projet($m['id'])['meta'];
    affirmer($copie['id'] !== $m['id'], 'nouvel identifiant');
    egal('Nouveau nom-..- (copie)', $copie['nom']);
    egal(1, $copie['revision']);
    egal(true, $copie['vignette']);
    egal(['ok' => true], supprimer_projet($m['id']));
    egal(null, lire_meta($m['id']));
    egal(3, count(glob(dossier_projets() . '/corbeille/*-' . $m['id'] . '.*') ?: []), 'les trois fichiers sont dans la corbeille du compte');
    egal(404, supprimer_projet($m['id'])['statut'] ?? null);
    $ids = array_column(lister_projets(), 'id');
    affirmer(in_array($copie['id'], $ids, true) && !in_array($m['id'], $ids, true), 'la liste suit');
});

test('une fiche alteree ou un fichier etranger ne sont pas listes', function (): void {
    file_put_contents(dossier_projets() . '/abcdefabcdefabcd.meta.json', '{"id":"autre"}');
    file_put_contents(dossier_projets() . '/..meta.json', '{}');
    file_put_contents(dossier_projets() . '/notes.meta.json', '{}');
    $ids = array_column(lister_projets(), 'id');
    egal(false, in_array('abcdefabcdefabcd', $ids, true));
    egal(false, in_array('autre', $ids, true));
    foreach (['abcdefabcdefabcd.meta.json', '..meta.json', 'notes.meta.json'] as $f) {
        unlink(dossier_projets() . '/' . $f);
    }
});

test('un autre compte ne voit pas ces projets ; supprimer un compte emporte ses projets dans corbeille-comptes, avec le compte', function (): void {
    $proprietaire = proprietaire();
    $ids = array_column(lister_projets(), 'id');
    affirmer(count($ids) > 0, 'des projets existent');
    $autre = compte_actif('autre@exemple.org');
    definir_compte_projets($autre['id']);
    egal([], lister_projets());
    egal(null, lire_meta($ids[0]), 'introuvable pour un autre compte');
    egal(404, supprimer_projet($ids[0])['statut'] ?? null);
    definir_compte_projets($proprietaire['id']);
    egal(count($ids), nombre_projets($proprietaire['id']));
    egal(true, supprimer_compte($proprietaire['id']));
    egal(false, is_dir(donnees('projets/' . $proprietaire['id'])));
    $corbeilles = glob(donnees('projets/corbeille-comptes/*-' . $proprietaire['id'])) ?: [];
    egal(1, count($corbeilles));
    egal(true, is_file($corbeilles[0] . '/compte.json') && is_file($corbeilles[0] . '/' . $ids[0] . '.meta.json') && is_dir($corbeilles[0] . '/corbeille'));
    egal(null, lire_compte($proprietaire['id']));
    supprimer_compte($autre['id']);
});

test('data/.htaccess se reecrit s il manque, a l identique de celui que livre le build', function (): void {
    $f = donnees('.htaccess');
    egal(file_get_contents(dirname(__DIR__, 2) . '/outils/site-php/data/.htaccess'), HTACCESS_DONNEES, 'la constante et le fichier livre');
    @unlink($f);
    egal(null, preparer_donnees());
    egal(HTACCESS_DONNEES, file_get_contents($f));
    contient('Require all denied', HTACCESS_DONNEES);
});

test('une police hors de l index est refusee avant toute requete ; une empreinte mal formee aussi', function (): void {
    file_put_contents(donnees('json/polices-catalogue.json'), json_encode(['format' => 1, 'familles' => [['id' => 'essai', 'nom' => 'Essai', 'depot' => 'fontsource', 'version' => '5.3.0', 'variantes' => [[400, 0, base64_encode(hash('sha256', 'connu', true)), null]]]], 'anciennes' => []]));
    egal(404, police_du_catalogue(base64_encode(hash('sha256', 'inconnu', true)))['statut'] ?? null);
    egal('hors_index', police_du_catalogue(base64_encode(hash('sha256', 'inconnu', true)))['erreur'] ?? null);
    egal(400, police_du_catalogue('../../pwd')['statut'] ?? null);
    egal(400, police_du_catalogue(['x'])['statut'] ?? null);
    contient('refus hors index', (string) file_get_contents(donnees('journal/polices.log')));
    // Une police de l'index dont aucune source ne repond (port 9 ferme) : refusee, rien n'est range.
    egal(502, police_du_catalogue(base64_encode(hash('sha256', 'connu', true)))['statut'] ?? null);
    egal([], array_values(array_diff(scandir(donnees('font/catalogue')) ?: [], ['.', '..'])));
});

test('les adresses d une police se calculent comme dans la page, sans rien fabriquer d un index altere', function (): void {
    $f = ['id' => 'roboto', 'depot' => 'fontsource', 'version' => '5.3.0'];
    egal(['http://127.0.0.1:9/npm/@fontsource/roboto@5.3.0/files/roboto-latin-ext-700-italic.woff', 'http://127.0.0.1:9/bunny/roboto/files/roboto-latin-ext-700-italic.woff'], adresses_fichier($f, [700, 1, 'x', 'y'], 'latin-ext'));
    egal([], adresses_fichier(['id' => '../x', 'depot' => 'fontsource', 'version' => '5.3.0'], [400, 0, 'x', null], 'latin'));
    egal([], adresses_fichier(['id' => 'x', 'depot' => 'fontsource', 'version' => '5.3.0/../..'], [400, 0, 'x', null], 'latin'));
    egal(['http://127.0.0.1:9/gitlab/123/repository/files/fonts%2FA%20B.woff/raw?ref=' . str_repeat('a', 40)], adresses_fichier(['id' => 'x', 'depot' => 'velvetyne', 'version' => str_repeat('a', 40), 'projet' => '123'], [400, 0, 'x', null, 'fonts/A B.woff'], 'complet'));
    egal([], adresses_fichier(['id' => 'x', 'depot' => 'fontshare', 'version' => '1'], [400, 0, 'x', null, '../../etc/passwd'], 'complet'));
});

exit(lancer_tests('Fonctions du site') > 0 ? 1 : 0);
