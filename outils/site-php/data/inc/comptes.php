<?php
// Les comptes du site (ADR-0041 §2) : un fichier JSON par personne dans data/comptes/<id>.json, valide a la lecture (un fichier qui
// n'a pas exactement la forme attendue est ignore et journalise, jamais lu « au mieux »). Une adresse est unique, comparee
// normalisee ; creer un compte passe sous le verrou data/comptes/.verrou. Le mot de passe n'existe qu'en empreinte (`password_hash`,
// argon2id quand PHP l'a, bcrypt sinon), dix caracteres au moins. Le premier administrateur se cree a l'installation : il recoit les
// projets d'un site d'avant, et le mot de passe unique (data/pwd, data/password, data/connexions.json) disparait.

declare(strict_types=1);

defined('SVG_SITE') || exit;

const FORMAT_COMPTE = 'editeur-svg/compte';
const VERSION_COMPTE = 1;
const ROLES = ['admin', 'utilisateur'];
const ETATS = ['a-confirmer', 'en-attente', 'actif', 'refuse', 'suspendu'];
const MOT_DE_PASSE_LONGUEUR_MIN = 10;
const NOM_COMPTE_MAX = 120;
/** Les dates facultatives d'un compte, dans l'ordre d'ecriture. */
const DATES_COMPTE = ['confirmeLe', 'approuveLe', 'derniereConnexion'];

function dossier_comptes(): string
{
    return donnees('comptes');
}

/** Le chemin du fichier d'un compte ; un identifiant mal forme ne fabrique jamais de chemin. */
function chemin_compte(string $id): string
{
    if (!preg_match(MOTIF_ID, $id)) {
        throw new InvalidArgumentException('identifiant de compte invalide');
    }
    return dossier_comptes() . '/' . $id . '.json';
}

function id_compte_valide(mixed $id): bool
{
    return is_string($id) && preg_match(MOTIF_ID, $id) === 1;
}

/** Une adresse telle qu'on la compare : minuscules, blancs retires. */
function email_normalise(string $email): string
{
    return mb_strtolower(preg_replace('/\s+/u', '', $email) ?? '');
}

function date_iso_valide(mixed $d): bool
{
    return is_string($d) && preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/', $d) === 1;
}

/** Vrai quand le texte est une empreinte que PHP reconnait. */
function empreinte_valide(mixed $h): bool
{
    return is_string($h) && $h !== '' && strlen($h) <= 255 && password_get_info($h)['algoName'] !== 'unknown';
}

/**
 * Le nom d'une personne tel qu'on le garde : sans caractere de controle ni de mise en forme bidirectionnelle, blancs resserres,
 * 120 caracteres au plus ; null s'il ne reste rien.
 */
function nom_compte_propre(mixed $brut): ?string
{
    if (!is_string($brut) || !mb_check_encoding($brut, 'UTF-8')) {
        return null;
    }
    $t = preg_replace('/[\x{0000}-\x{001F}\x{007F}-\x{009F}\x{200B}-\x{200F}\x{2028}-\x{202E}\x{2066}-\x{2069}\x{FEFF}]/u', '', $brut) ?? '';
    $t = trim(preg_replace('/\s+/u', ' ', $t) ?? '');
    return $t === '' || mb_strlen($t) > NOM_COMPTE_MAX ? null : $t;
}

/** La raison de refuser un mot de passe propose, ou null s'il convient. */
function mot_de_passe_refuse(mixed $mot): ?string
{
    if (!is_string($mot) || !mb_check_encoding($mot, 'UTF-8')) {
        return t('Le mot de passe n’est pas en UTF-8');
    }
    if (mb_strlen($mot) < MOT_DE_PASSE_LONGUEUR_MIN) {
        return t('Le mot de passe doit compter au moins {n} caractères', ['n' => MOT_DE_PASSE_LONGUEUR_MIN]);
    }
    if (strlen($mot) > 1024) {
        return t('Le mot de passe est trop long');
    }
    return null;
}

/** L'algorithme d'empreinte du moment : argon2id quand PHP le connait, bcrypt sinon. */
function algorithme_empreinte(): string|int|null
{
    return defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_BCRYPT;
}

function empreinte_mot_de_passe(string $mot): string
{
    return password_hash($mot, algorithme_empreinte());
}

/**
 * Le compte, s'il a exactement la forme attendue : types, formats, enumerations, nom borne, adresse valide, dates ISO ; rend le
 * compte reconstruit dans l'ordre des champs, ou null. Un champ inconnu n'entre pas.
 */
function compte_valide(mixed $x): ?array
{
    if (!is_array($x) || ($x['format'] ?? null) !== FORMAT_COMPTE || ($x['version'] ?? null) !== VERSION_COMPTE) {
        return null;
    }
    if (!id_compte_valide($x['id'] ?? null) || !email_valide($x['email'] ?? null) || ($x['emailNormalise'] ?? null) !== email_normalise($x['email'])) {
        return null;
    }
    $nom = $x['nom'] ?? null;
    if (!is_string($nom) || nom_compte_propre($nom) !== $nom) {
        return null;
    }
    if (!langue_valide($x['langue'] ?? null) || !in_array($x['role'] ?? null, ROLES, true) || !in_array($x['etat'] ?? null, ETATS, true)) {
        return null;
    }
    if (!empreinte_valide($x['empreinte'] ?? null) || !date_iso_valide($x['creeLe'] ?? null) || !date_iso_valide($x['modifieLe'] ?? null)) {
        return null;
    }
    $c = [
        'format' => FORMAT_COMPTE, 'version' => VERSION_COMPTE, 'id' => $x['id'], 'email' => $x['email'], 'emailNormalise' => $x['emailNormalise'],
        'nom' => $nom, 'langue' => $x['langue'], 'role' => $x['role'], 'etat' => $x['etat'], 'empreinte' => $x['empreinte'],
        'creeLe' => $x['creeLe'], 'modifieLe' => $x['modifieLe'],
    ];
    foreach (DATES_COMPTE as $d) {
        if (array_key_exists($d, $x)) {
            if (!date_iso_valide($x[$d])) {
                return null;
            }
            $c[$d] = $x[$d];
        }
    }
    if (array_key_exists('approuvePar', $x)) {
        if (!id_compte_valide($x['approuvePar'])) {
            return null;
        }
        $c['approuvePar'] = $x['approuvePar'];
    }
    return $c;
}

/** Le compte, valide, ou null (un fichier illisible est journalise, jamais lu au mieux). */
function lire_compte(string $id): ?array
{
    if (!id_compte_valide($id)) {
        return null;
    }
    $f = chemin_compte($id);
    if (!is_file($f)) {
        return null;
    }
    $c = compte_valide(lire_json($f, 4));
    if ($c === null) {
        error_log('comptes : ' . $id . '.json est illisible ou mal forme, il est ignore');
    }
    return $c;
}

/** Ecrit un compte (valide d'abord : un compte mal forme ne s'ecrit pas), d'un seul geste. */
function ecrire_compte(array $compte): array
{
    $c = compte_valide($compte);
    if ($c === null) {
        throw new InvalidArgumentException('compte mal forme');
    }
    ecrire_atomique(chemin_compte($c['id']), json_encode($c, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n", 0640);
    return $c;
}

/** Tous les comptes lisibles, les plus anciens d'abord. */
function lister_comptes(): array
{
    $liste = [];
    foreach (scandir(dossier_comptes()) ?: [] as $nom) {
        if (preg_match('/^([a-f0-9]{16})\.json$/', $nom, $m) === 1) {
            $c = lire_compte($m[1]);
            if ($c !== null) {
                $liste[] = $c;
            }
        }
    }
    usort($liste, fn(array $a, array $b): int => strcmp($a['creeLe'], $b['creeLe']) ?: strcmp($a['id'], $b['id']));
    return $liste;
}

/** Vrai des qu'un fichier de compte existe, lisible ou non : la route d'installation n'existe plus. */
function comptes_existent(): bool
{
    foreach (scandir(dossier_comptes()) ?: [] as $nom) {
        if (preg_match('/^[a-f0-9]{16}\.json$/', $nom) === 1) {
            return true;
        }
    }
    return false;
}

function compte_par_email(string $email): ?array
{
    $n = email_normalise($email);
    if ($n === '') {
        return null;
    }
    foreach (lister_comptes() as $c) {
        if ($c['emailNormalise'] === $n) {
            return $c;
        }
    }
    return null;
}

/** Les administrateurs actifs : ceux qui recoivent les demandes et qu'on ne peut pas tous retirer. */
function admins_actifs(): array
{
    return array_values(array_filter(lister_comptes(), fn(array $c): bool => $c['role'] === 'admin' && $c['etat'] === 'actif'));
}

function nouvel_id_compte(): string
{
    do {
        $id = bin2hex(random_bytes(8));
    } while (file_exists(chemin_compte($id)));
    return $id;
}

/** Execute `$faire` sous le verrou des comptes : une creation ou un changement d'adresse a la fois. */
function avec_verrou_comptes(callable $faire): mixed
{
    return sous_verrou(dossier_comptes() . '/.verrou', $faire);
}

/** Le mot de passe essaye est-il celui du compte ? En temps constant ; une empreinte d'un algorithme ancien se refait au passage. */
function verifier_mot_de_passe_compte(array $compte, string $essai): bool
{
    $ok = password_verify($essai, $compte['empreinte']);
    if ($ok && password_needs_rehash($compte['empreinte'], algorithme_empreinte())) {
        try {
            poser_mot_de_passe_compte($compte['id'], $essai);
        } catch (Throwable $e) {
            error_log('comptes : empreinte non refaite (' . $e->getMessage() . ')');
        }
    }
    return $ok;
}

/** Change des champs d'un compte (relu sous verrou), pose `modifieLe`, reecrit. Rend le compte, ou null s'il a disparu. */
function modifier_compte(string $id, array $champs): ?array
{
    return avec_verrou_comptes(fn(): ?array => modifier_compte_sous_verrou($id, $champs));
}

/** Le travail de modifier_compte, pour un appelant qui tient deja le verrou (un second flock sur le meme fichier bloquerait). */
function modifier_compte_sous_verrou(string $id, array $champs): ?array
{
    $c = lire_compte($id);
    if ($c === null) {
        return null;
    }
    foreach ($champs as $k => $v) {
        if ($v === null) {
            unset($c[$k]);
        } else {
            $c[$k] = $v;
        }
    }
    $c['modifieLe'] = maintenant_iso();
    return ecrire_compte($c);
}

/** Pose un nouveau mot de passe (deja juge) sur un compte. Rend le compte. */
function poser_mot_de_passe_compte(string $id, string $mot): ?array
{
    return modifier_compte($id, ['empreinte' => empreinte_mot_de_passe($mot)]);
}

/** La marque de l'empreinte d'un compte, portee par ses sessions : un condense, jamais l'empreinte. */
function marque_compte(array $compte): string
{
    return substr(hash('sha256', 'session:' . $compte['empreinte']), 0, 32);
}

/**
 * Les champs d'un compte nouveau, juges : rend ['compte' => …] pret a ecrire (sans verifier l'unicite), ou ['erreur' => code,
 * 'message' => phrase]. Codes : `email`, `nom`, `mot-de-passe`, `langue`.
 */
function preparer_compte(mixed $email, mixed $nom, mixed $mot, mixed $langue, string $role, string $etat): array
{
    $email = is_string($email) ? trim($email) : '';
    if (!email_valide($email)) {
        return ['erreur' => 'email', 'message' => t('Cette adresse de courrier n’est pas valide.')];
    }
    $nomPropre = nom_compte_propre($nom);
    if ($nomPropre === null) {
        return ['erreur' => 'nom', 'message' => t('Indiquez votre nom (120 caractères au plus).')];
    }
    $refus = mot_de_passe_refuse($mot);
    if ($refus !== null) {
        return ['erreur' => 'mot-de-passe', 'message' => $refus . '.'];
    }
    $langue = langue_valide($langue) ? $langue : null;
    if ($langue === null) {
        return ['erreur' => 'langue', 'message' => t('Choisissez une langue.')];
    }
    $maintenant = maintenant_iso();
    return ['compte' => [
        'format' => FORMAT_COMPTE, 'version' => VERSION_COMPTE, 'id' => '', 'email' => $email, 'emailNormalise' => email_normalise($email),
        'nom' => $nomPropre, 'langue' => $langue, 'role' => $role, 'etat' => $etat, 'empreinte' => empreinte_mot_de_passe((string) $mot),
        'creeLe' => $maintenant, 'modifieLe' => $maintenant,
    ]];
}

/**
 * Cree un compte sous verrou, l'adresse revue unique au moment d'ecrire. Rend ['compte' => …] ou ['erreur' => 'existe', …] (ou le
 * refus d'un champ).
 */
function creer_compte(mixed $email, mixed $nom, mixed $mot, mixed $langue, string $role = 'utilisateur', string $etat = 'a-confirmer'): array
{
    $p = preparer_compte($email, $nom, $mot, $langue, $role, $etat);
    if (isset($p['erreur'])) {
        return $p;
    }
    return avec_verrou_comptes(function () use ($p): array {
        if (compte_par_email($p['compte']['email']) !== null) {
            return ['erreur' => 'existe', 'message' => t('Un compte porte déjà cette adresse.')];
        }
        $c = $p['compte'];
        $c['id'] = nouvel_id_compte();
        if ($c['etat'] === 'actif') {
            $c['confirmeLe'] = $c['creeLe'];
            $c['approuveLe'] = $c['creeLe'];
        }
        journaliser('comptes', 'cree id=' . $c['id'] . ' role=' . $c['role'] . ' etat=' . $c['etat']);
        return ['compte' => ecrire_compte($c)];
    });
}

/**
 * L'installation (ADR-0041 §4, premiere visite) : sous verrou, tant qu'aucun compte n'existe, ecrit config.json s'il manque, cree
 * l'administrateur (actif), migre les projets d'un site d'avant dans son dossier, supprime le mot de passe unique. `$site` :
 * ['nom', 'expediteur'] facultatifs. Rend ['compte' => …] ou ['erreur' => …] (`existe` quand un compte existe deja).
 */
function installer_administrateur(mixed $email, mixed $nom, mixed $mot, mixed $langue, array $site = []): array
{
    $p = preparer_compte($email, $nom, $mot, $langue, 'admin', 'actif');
    if (isset($p['erreur'])) {
        return $p;
    }
    return avec_verrou_comptes(function () use ($p, $site): array {
        if (comptes_existent()) {
            return ['erreur' => 'existe', 'message' => t('Le site a déjà un administrateur : connectez-vous.')];
        }
        if (!config_lire()['fichier']) {
            $brut = CONFIG_DEFAUTS;
            $brut['site']['langue'] = $p['compte']['langue'];
            $nomSite = texte_borne($site['nom'] ?? '', 120);
            if ($nomSite !== null && $nomSite !== '') {
                $brut['site']['nom'] = $nomSite;
                $brut['courrier']['nom'] = $nomSite;
            }
            $expediteur = is_string($site['expediteur'] ?? null) ? trim($site['expediteur']) : '';
            $brut['courrier']['expediteur'] = email_valide($expediteur) ? $expediteur : $p['compte']['email'];
            if (is_string($site['mode'] ?? null) && in_array($site['mode'], MODES_COURRIER, true)) {
                $brut['courrier']['mode'] = $site['mode'];
            }
            config_ecrire(config_valide($brut)['config']);
        }
        $c = $p['compte'];
        $c['id'] = nouvel_id_compte();
        $c['confirmeLe'] = $c['creeLe'];
        $c['approuveLe'] = $c['creeLe'];
        $c = ecrire_compte($c);
        $migres = migrer_projets_vers($c['id']);
        foreach (['pwd', 'password', 'connexions.json', '.verrou-mot-de-passe', 'journal/password-restant.txt', 'journal/verification-http.json'] as $ancien) {
            if (is_file(donnees($ancien))) {
                @unlink(donnees($ancien));
            }
        }
        journaliser('comptes', 'administrateur installe id=' . $c['id'] . ' projets-migres=' . $migres);
        return ['compte' => $c];
    });
}

/**
 * Les projets d'un site d'avant (data/projets/*.json a plat, et sa corbeille) partent dans le dossier du compte donne. Rend le
 * nombre de fichiers deplaces.
 */
function migrer_projets_vers(string $compteId): int
{
    $racine = donnees('projets');
    $cible = $racine . '/' . $compteId;
    $n = 0;
    foreach (scandir($racine) ?: [] as $f) {
        if (preg_match('/^[a-f0-9]{16}\.(json|meta\.json|svg)$/', $f) === 1) {
            if (!is_dir($cible) && !@mkdir($cible, 0750, true) && !is_dir($cible)) {
                throw new RuntimeException('dossier des projets du compte impossible');
            }
            if (rename($racine . '/' . $f, $cible . '/' . $f)) {
                $n++;
            }
        }
    }
    $corbeille = $racine . '/corbeille';
    if (is_dir($corbeille)) {
        $cibleCorbeille = $cible . '/corbeille';
        if (!is_dir($cibleCorbeille) && !@mkdir($cibleCorbeille, 0750, true) && !is_dir($cibleCorbeille)) {
            throw new RuntimeException('corbeille du compte impossible');
        }
        foreach (scandir($corbeille) ?: [] as $f) {
            if ($f !== '.' && $f !== '..' && $f[0] !== '.' && is_file($corbeille . '/' . $f) && rename($corbeille . '/' . $f, $cibleCorbeille . '/' . $f)) {
                $n++;
            }
        }
        @rmdir($corbeille);
    }
    return $n;
}

/** Le nombre de projets d'un compte (ses fiches). */
function nombre_projets(string $compteId): int
{
    $d = donnees('projets/' . $compteId);
    if (!is_dir($d)) {
        return 0;
    }
    return count(array_filter(scandir($d) ?: [], fn(string $f): bool => preg_match('/^[a-f0-9]{16}\.meta\.json$/', $f) === 1));
}

/** Ce que l'API dit d'un compte a son titulaire, ou a un administrateur (`$complet`) : jamais l'empreinte. */
function compte_public(array $c, bool $complet = false): array
{
    $p = ['id' => $c['id'], 'nom' => $c['nom'], 'email' => $c['email'], 'langue' => $c['langue'], 'role' => $c['role'], 'etat' => $c['etat']];
    if ($complet) {
        $p['creeLe'] = $c['creeLe'];
        foreach (DATES_COMPTE as $d) {
            if (isset($c[$d])) {
                $p[$d] = $c[$d];
            }
        }
        $p['projets'] = nombre_projets($c['id']);
    }
    return $p;
}

/**
 * Supprime un compte : son dossier de projets entier part dans data/projets/corbeille-comptes/<horodatage>-<id>/ (le fichier du
 * compte dedans, `compte.json`), ses sessions et ses jetons sont effaces. Rend vrai si le compte existait.
 */
function supprimer_compte(string $id): bool
{
    return avec_verrou_comptes(function () use ($id): bool {
        $c = lire_compte($id);
        if ($c === null) {
            return false;
        }
        $cible = donnees('projets/corbeille-comptes/' . gmdate('Ymd\THis\Z') . '-' . $id);
        if (!@mkdir($cible, 0750, true) && !is_dir($cible)) {
            throw new RuntimeException('corbeille des comptes impossible');
        }
        $projets = donnees('projets/' . $id);
        if (is_dir($projets)) {
            foreach (scandir($projets) ?: [] as $f) {
                if ($f !== '.' && $f !== '..' && !rename($projets . '/' . $f, $cible . '/' . $f)) {
                    throw new RuntimeException('corbeille des comptes : ' . $f);
                }
            }
            @rmdir($projets);
        }
        if (!rename(chemin_compte($id), $cible . '/compte.json')) {
            throw new RuntimeException('corbeille des comptes : le compte');
        }
        fermer_sessions_du_compte($id);
        supprimer_jetons_du_compte($id);
        journaliser('comptes', 'supprime id=' . $id);
        return true;
    });
}
