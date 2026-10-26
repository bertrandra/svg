<?php
// Les sessions du site (ADR-0041 §3) : plus de session PHP native. Un jeton aleatoire (32 octets, 64 hex) dans le cookie
// `svg_session` (HttpOnly, SameSite=Strict, Secure en HTTPS, chemin du script), un fichier data/sessions/<sha256(jeton)>.json
// { compte, creeLe, vu, csrf, marque, avis? }. Un visiteur non connecte a aussi une session (anonyme, `compte` vide) pour que les
// formulaires portent un jeton CSRF ; la connexion en ouvre une nouvelle (nouveau jeton, nouveau CSRF : pas de fixation). Une session
// expire apres `sessions.inactivite` sans requete ; `marque` est un condense de l'empreinte du mot de passe : la changer ferme les
// autres sessions du compte ; un compte suspendu ou supprime perd ses sessions a la requete suivante. Le menage se fait une fois sur
// cent requetes. Le jeton CSRF (64 hex, en-tete X-CSRF ou champ csrf) se compare en temps constant.

declare(strict_types=1);

defined('SVG_SITE') || exit;

const COOKIE_SESSION = 'svg_session';
const MOTIF_JETON = '/^[a-f0-9]{64}$/';

/** Le chemin du cookie : le dossier du script (le site peut vivre dans un sous-dossier). */
function chemin_cookie(): string
{
    $d = str_replace('\\', '/', dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/')));
    return rtrim($d, '/') . '/';
}

function inactivite_session(): int
{
    return (int) reglage('sessions.inactivite');
}

/** Le fichier d'une session, par son jeton (range hache : le disque ne porte jamais le jeton). */
function chemin_session(string $jeton): string
{
    return donnees('sessions/' . hash('sha256', $jeton) . '.json');
}

/** La session de la requete (posee par demarrer_session), avec son jeton en clair sous `jeton` ; `$effacer` l'oublie (les tests). */
function session_courante(?array $poser = null, bool $effacer = false): ?array
{
    static $session = null;
    if ($effacer) {
        $session = null;
    } elseif ($poser !== null) {
        $session = $poser;
    }
    return $session;
}

/** Le compte connecte, relu dans son fichier a chaque requete (le role et l'etat s'y lisent, jamais dans la session). */
function compte_connecte(?array $poser = null, bool $effacer = false): ?array
{
    static $compte = null;
    if ($effacer) {
        $compte = null;
    } elseif ($poser !== null) {
        $compte = $poser;
    }
    return $compte;
}

function session_lisible(mixed $s): bool
{
    return is_array($s) && is_string($s['compte'] ?? null) && ($s['compte'] === '' || id_compte_valide($s['compte']))
        && is_int($s['creeLe'] ?? null) && is_int($s['vu'] ?? null) && is_string($s['csrf'] ?? null) && preg_match(MOTIF_JETON, $s['csrf']) === 1
        && is_string($s['marque'] ?? null) && (!isset($s['avis']) || is_string($s['avis']));
}

function ecrire_session(array $s): void
{
    $jeton = $s['jeton'];
    unset($s['jeton']);
    ecrire_atomique(chemin_session($jeton), json_encode($s, JSON_UNESCAPED_SLASHES), 0640);
}

function poser_cookie_session(string $jeton): void
{
    setcookie(COOKIE_SESSION, $jeton, ['expires' => 0, 'path' => chemin_cookie(), 'secure' => est_https(), 'httponly' => true, 'samesite' => 'Strict']);
    $_COOKIE[COOKIE_SESSION] = $jeton;
}

/** Une session neuve (anonyme si `$compteId` est vide), ecrite et posee dans le cookie. */
function creer_session(string $compteId = '', string $marque = '', ?string $avis = null): array
{
    $jeton = bin2hex(random_bytes(32));
    $s = ['jeton' => $jeton, 'compte' => $compteId, 'creeLe' => time(), 'vu' => time(), 'csrf' => bin2hex(random_bytes(32)), 'marque' => $marque];
    if ($avis !== null) {
        $s['avis'] = $avis;
    }
    ecrire_session($s);
    poser_cookie_session($jeton);
    session_courante($s);
    return $s;
}

/**
 * Lit la session du cookie ; une session absente, expiree, d'un compte disparu, non actif ou au mot de passe change est remplacee par
 * une session anonyme qui porte l'avis a montrer (`expiree`, `change`, `acces`).
 */
function demarrer_session(): void
{
    if (session_courante() !== null) {
        return;
    }
    compte_connecte(null, true);
    $jeton = $_COOKIE[COOKIE_SESSION] ?? null;
    $s = is_string($jeton) && preg_match(MOTIF_JETON, $jeton) === 1 ? lire_json(chemin_session($jeton), 3) : null;
    if (mt_rand(1, 100) === 1) {
        menage_sessions();
    }
    if (!session_lisible($s)) {
        creer_session();
        return;
    }
    $s['jeton'] = $jeton;
    $maintenant = time();
    $avis = null;
    if ($maintenant - $s['vu'] > inactivite_session()) {
        $avis = $s['compte'] === '' ? '' : 'expiree';
    } elseif ($s['compte'] !== '') {
        $compte = lire_compte($s['compte']);
        if ($compte === null || $compte['etat'] !== 'actif') {
            $avis = 'acces';
        } elseif (!hash_equals(marque_compte($compte), $s['marque'])) {
            $avis = 'change';
        } else {
            compte_connecte($compte);
        }
    }
    if ($avis !== null) {
        @unlink(chemin_session($jeton));
        creer_session('', '', $avis === '' ? null : $avis);
        return;
    }
    $s['vu'] = $maintenant;
    ecrire_session($s);
    session_courante($s);
}

function est_connecte(): bool
{
    return compte_connecte() !== null;
}

function jeton_csrf(): string
{
    return (string) (session_courante()['csrf'] ?? '');
}

/** Le jeton recu est-il celui de la session ? En temps constant ; un jeton absent ou vide ne vaut jamais. */
function csrf_valide(mixed $jeton): bool
{
    $attendu = jeton_csrf();
    return is_string($jeton) && $attendu !== '' && hash_equals($attendu, $jeton);
}

/** L'avis que porte la session (session expiree, mot de passe change, acces retire), pris une fois. */
function prendre_avis(): string
{
    $s = session_courante();
    if ($s === null || !isset($s['avis'])) {
        return '';
    }
    $avis = $s['avis'];
    unset($s['avis']);
    ecrire_session($s);
    session_courante($s);
    return $avis;
}

/** La connexion reussie : l'ancienne session (anonyme) disparait, une nouvelle nait, connectee ; la date de connexion est notee. */
function ouvrir_session_connectee(array $compte): void
{
    $ancienne = session_courante();
    if ($ancienne !== null) {
        @unlink(chemin_session($ancienne['jeton']));
    }
    creer_session($compte['id'], marque_compte($compte));
    compte_connecte(modifier_compte($compte['id'], ['derniereConnexion' => maintenant_iso()]) ?? $compte);
}

/** La deconnexion : le fichier efface, le cookie aussi. */
function fermer_session(): void
{
    $s = session_courante();
    if ($s !== null) {
        @unlink(chemin_session($s['jeton']));
    }
    setcookie(COOKIE_SESSION, '', ['expires' => time() - 3600, 'path' => chemin_cookie(), 'secure' => est_https(), 'httponly' => true, 'samesite' => 'Strict']);
    unset($_COOKIE[COOKIE_SESSION]);
    compte_connecte(null, true);
    session_courante(['jeton' => '', 'compte' => '', 'creeLe' => 0, 'vu' => 0, 'csrf' => '', 'marque' => '']);
}

/**
 * Efface toutes les sessions d'un compte (sauf celle dont on donne le jeton) : a la suppression du compte. Un mot de passe change
 * ou un acces retire n'ont pas besoin d'elle : la marque et l'etat sont relus a chaque requete, et la session suivante dit pourquoi.
 * Rend le nombre effacees.
 */
function fermer_sessions_du_compte(string $id, ?string $saufJeton = null): int
{
    $garder = $saufJeton === null ? '' : hash('sha256', $saufJeton) . '.json';
    $n = 0;
    $d = donnees('sessions');
    foreach (scandir($d) ?: [] as $f) {
        if (preg_match('/^[a-f0-9]{64}\.json$/', $f) !== 1 || $f === $garder) {
            continue;
        }
        $s = lire_json($d . '/' . $f, 3);
        if (is_array($s) && ($s['compte'] ?? null) === $id && @unlink($d . '/' . $f)) {
            $n++;
        }
    }
    return $n;
}

/**
 * Apres un changement de mot de passe par la personne elle-meme : sa session suit la nouvelle empreinte ; les autres, qui portent
 * l'ancienne marque, se ferment a leur requete suivante en disant pourquoi (demarrer_session).
 */
function garder_seule_session(array $compte): void
{
    $s = session_courante();
    if ($s === null || $s['jeton'] === '') {
        return;
    }
    $s['marque'] = marque_compte($compte);
    ecrire_session($s);
    session_courante($s);
}

/** Le menage : les sessions inactives et les jetons expires partent. */
function menage_sessions(): void
{
    $d = donnees('sessions');
    $limite = time() - inactivite_session();
    foreach (scandir($d) ?: [] as $f) {
        if (preg_match('/^[a-f0-9]{64}\.json$/', $f) !== 1) {
            continue;
        }
        $s = lire_json($d . '/' . $f, 3);
        if (!is_array($s) || (int) ($s['vu'] ?? 0) < $limite) {
            @unlink($d . '/' . $f);
        }
    }
    menage_jetons();
}
