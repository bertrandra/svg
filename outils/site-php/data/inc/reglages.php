<?php
// Les reglages du site (ADR-0041 §7) : data/config/config.json, ecrit a l'installation de l'administrateur, modifie dans l'ecran
// « Reglages du site », relu et valide a chaque requete. Chaque champ a son defaut : un fichier absent ou illisible vaut les defauts,
// un champ mal forme vaut son defaut et c'est dit (`problemes`). Le mot de passe SMTP n'est jamais renvoye par l'API.

declare(strict_types=1);

defined('SVG_SITE') || exit;

const FORMAT_CONFIG = 'editeur-svg/config';
const VERSION_CONFIG = 1;
const LANGUES = ['fr', 'en'];
const MODES_COURRIER = ['mail', 'smtp', 'fichier'];
const SECURITES_SMTP = ['aucune', 'starttls', 'ssl'];

/** Les defauts, dans l'ordre d'ecriture du fichier. */
const CONFIG_DEFAUTS = [
    'format' => FORMAT_CONFIG,
    'version' => VERSION_CONFIG,
    'site' => ['nom' => 'Éditeur SVG', 'langue' => 'fr', 'adresse' => ''],
    'inscriptions' => ['ouvertes' => true],
    'courrier' => ['expediteur' => '', 'nom' => 'Éditeur SVG', 'mode' => 'mail', 'smtp' => ['hote' => '', 'port' => 587, 'securite' => 'starttls', 'utilisateur' => '', 'motDePasse' => '']],
    'sessions' => ['inactivite' => SESSION_INACTIVITE],
];

function fichier_config(): string
{
    return donnees('config/config.json');
}

/** Un texte court (sans caractere de controle), ou null. */
function texte_borne(mixed $v, int $max): ?string
{
    if (!is_string($v) || !mb_check_encoding($v, 'UTF-8') || preg_match('/[\x00-\x1f\x7f]/', $v) === 1 || mb_strlen($v) > $max) {
        return null;
    }
    return trim($v);
}

/** Une adresse de courrier bien formee (filter_var, avec un domaine qui porte un point), 254 caracteres au plus. */
function email_valide(mixed $v): bool
{
    return is_string($v) && strlen($v) <= 254 && filter_var($v, FILTER_VALIDATE_EMAIL) !== false && preg_match('/@[^@]+\.[^@.]+$/', $v) === 1;
}

/**
 * Valide une configuration champ par champ : rend ['config' => la configuration complete, 'problemes' => les champs refuses, remplaces
 * par leur defaut]. Un champ absent prend son defaut sans etre un probleme ; `$strict` fait de tout champ absent un probleme aussi
 * (l'ecriture par l'API). Un champ inconnu n'entre jamais.
 */
function config_valide(mixed $x, bool $strict = false): array
{
    $d = CONFIG_DEFAUTS;
    $problemes = [];
    $x = is_array($x) ? $x : [];
    $lire = function (string $chemin, callable $juge, array $source, mixed $defaut) use (&$problemes, $strict): mixed {
        $cles = explode('.', $chemin);
        $v = $source;
        foreach ($cles as $c) {
            if (!is_array($v) || !array_key_exists($c, $v)) {
                if ($strict) {
                    $problemes[] = $chemin;
                }
                return $defaut;
            }
            $v = $v[$c];
        }
        $r = $juge($v);
        if ($r === null) {
            $problemes[] = $chemin;
            return $defaut;
        }
        return $r;
    };
    $texte = fn(int $max, bool $vide = true): callable => fn(mixed $v): ?string => ($t = texte_borne($v, $max)) === null || (!$vide && $t === '') ? null : $t;
    $choix = fn(array $permis): callable => fn(mixed $v): ?string => is_string($v) && in_array($v, $permis, true) ? $v : null;
    $bool = fn(mixed $v): ?bool => is_bool($v) ? $v : null;
    $entier = fn(int $min, int $max): callable => fn(mixed $v): ?int => is_int($v) && $v >= $min && $v <= $max ? $v : null;
    $adresse = fn(mixed $v): ?string => ($t = texte_borne($v, 300)) === null || ($t !== '' && preg_match('#^https?://[^\s/]+(/[^\s]*)?$#', $t) !== 1) ? null : $t;
    $email = fn(mixed $v): ?string => is_string($v) && (trim($v) === '' || email_valide(trim($v))) ? trim($v) : null;
    if ($strict && (($x['format'] ?? FORMAT_CONFIG) !== FORMAT_CONFIG || ($x['version'] ?? VERSION_CONFIG) !== VERSION_CONFIG)) {
        $problemes[] = 'format';
    }
    $c = [
        'format' => FORMAT_CONFIG,
        'version' => VERSION_CONFIG,
        'site' => [
            'nom' => $lire('site.nom', $texte(120, false), $x, $d['site']['nom']),
            'langue' => $lire('site.langue', $choix(LANGUES), $x, $d['site']['langue']),
            'adresse' => $lire('site.adresse', $adresse, $x, $d['site']['adresse']),
        ],
        'inscriptions' => ['ouvertes' => $lire('inscriptions.ouvertes', $bool, $x, $d['inscriptions']['ouvertes'])],
        'courrier' => [
            'expediteur' => $lire('courrier.expediteur', $email, $x, $d['courrier']['expediteur']),
            'nom' => $lire('courrier.nom', $texte(120), $x, $d['courrier']['nom']),
            'mode' => $lire('courrier.mode', $choix(MODES_COURRIER), $x, $d['courrier']['mode']),
            'smtp' => [
                'hote' => $lire('courrier.smtp.hote', fn(mixed $v): ?string => ($t = texte_borne($v, 253)) === null || ($t !== '' && preg_match('/^[A-Za-z0-9.\-]+$/', $t) !== 1) ? null : $t, $x, ''),
                'port' => $lire('courrier.smtp.port', $entier(1, 65535), $x, $d['courrier']['smtp']['port']),
                'securite' => $lire('courrier.smtp.securite', $choix(SECURITES_SMTP), $x, $d['courrier']['smtp']['securite']),
                'utilisateur' => $lire('courrier.smtp.utilisateur', $texte(200), $x, ''),
                'motDePasse' => $lire('courrier.smtp.motDePasse', fn(mixed $v): ?string => is_string($v) && strlen($v) <= 500 && mb_check_encoding($v, 'UTF-8') ? $v : null, $x, ''),
            ],
        ],
        'sessions' => ['inactivite' => $lire('sessions.inactivite', $entier(1, 30 * 86400), $x, $d['sessions']['inactivite'])],
    ];
    return ['config' => $c, 'problemes' => $problemes];
}

/**
 * La configuration en vigueur, lue une fois par requete : ['config', 'problemes', 'fichier' => le fichier existe et se lit].
 * `$relire` force une nouvelle lecture (apres une ecriture).
 */
function config_lire(bool $relire = false): array
{
    static $cache = null;
    if ($cache !== null && !$relire) {
        return $cache;
    }
    $f = fichier_config();
    $brut = lire_json($f, 8);
    if ($brut === null) {
        $cache = ['config' => CONFIG_DEFAUTS, 'problemes' => is_file($f) ? ['fichier'] : [], 'fichier' => false];
        if (is_file($f)) {
            error_log('config : data/config/config.json est illisible, les defauts s appliquent');
        }
        return $cache;
    }
    $v = config_valide($brut);
    $cache = ['config' => $v['config'], 'problemes' => $v['problemes'], 'fichier' => true];
    if ($v['problemes'] !== []) {
        error_log('config : champs refuses, remplaces par leur defaut : ' . implode(', ', $v['problemes']));
    }
    return $cache;
}

/** Un reglage par son chemin pointe (`site.nom`, `courrier.smtp.port`). */
function reglage(string $chemin): mixed
{
    $v = config_lire()['config'];
    foreach (explode('.', $chemin) as $c) {
        if (!is_array($v) || !array_key_exists($c, $v)) {
            throw new InvalidArgumentException('reglage inconnu : ' . $chemin);
        }
        $v = $v[$c];
    }
    return $v;
}

/** Ecrit la configuration (complete et validee) d'un seul geste, puis la relit. */
function config_ecrire(array $config): void
{
    ecrire_atomique(fichier_config(), json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n", 0640);
    config_lire(true);
}

/** La configuration telle que l'API la rend : sans le mot de passe SMTP, avec le fait qu'il soit pose. */
function config_publique(): array
{
    $c = config_lire();
    $config = $c['config'];
    $pose = $config['courrier']['smtp']['motDePasse'] !== '';
    unset($config['courrier']['smtp']['motDePasse']);
    return ['reglages' => $config, 'smtpMotDePassePose' => $pose, 'fichier' => $c['fichier'], 'problemes' => $c['problemes']];
}

/** Ce que la page montre au script : le nom du site, sa langue, l'ouverture des inscriptions. */
function site_public(): array
{
    return ['nom' => reglage('site.nom'), 'langue' => reglage('site.langue'), 'inscriptions' => reglage('inscriptions.ouvertes')];
}
