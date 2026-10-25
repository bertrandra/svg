<?php
// Les projets du site (ADR-0030), dans data/projets : pour chacun, son JSON natif (`<id>.json`), sa fiche (`<id>.meta.json` : nom,
// dates, revision, taille) et, facultative, sa vignette (`<id>.svg`). L'identifiant sur le disque est tire au hasard (16 chiffres
// hexadecimaux) : un nom affiche n'est jamais un chemin. Chaque ecriture passe sous un verrou (`flock`) et d'un seul geste (un
// fichier temporaire puis `rename`) ; ecraser un projet demande la revision qu'on a ouverte, pour ne pas ecraser le travail d'un
// autre onglet. Supprimer met le projet dans data/projets/corbeille.

declare(strict_types=1);

defined('SVG_SITE') || exit;

const FORMAT_PROJET = 'editeur-svg/projet';
const MOTIF_ID = '/^[a-f0-9]{16}$/';
const JSON_PROJET = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR;
/** Ce que la validation du serveur borne (le client valide chaque champ ; ici, la structure minimale et le format). */
const FORMES_MAX = 200000;
const NOM_MAX = 120;

function dossier_projets(): string
{
    return donnees('projets');
}

/** Le chemin d'un fichier de projet ; un identifiant mal forme ne fabrique jamais de chemin. */
function chemin_projet(string $id, string $suffixe): string
{
    if (!preg_match(MOTIF_ID, $id) || !in_array($suffixe, ['.json', '.meta.json', '.svg'], true)) {
        throw new InvalidArgumentException('identifiant de projet invalide');
    }
    return dossier_projets() . '/' . $id . $suffixe;
}

function id_valide(mixed $id): bool
{
    return is_string($id) && preg_match(MOTIF_ID, $id) === 1;
}

function maintenant_iso(): string
{
    return gmdate('Y-m-d\TH:i:s\Z');
}

/** Execute `$faire` sous le verrou des projets : une ecriture a la fois. */
function avec_verrou(callable $faire): mixed
{
    $v = fopen(dossier_projets() . '/.verrou', 'c');
    if ($v === false) {
        throw new RuntimeException('verrou des projets impossible');
    }
    try {
        flock($v, LOCK_EX);
        return $faire();
    } finally {
        flock($v, LOCK_UN);
        fclose($v);
    }
}

/**
 * Le nom d'un projet tel qu'on le montre : sans caractere de controle ni de mise en forme bidirectionnelle, sans barre (un nom n'est
 * jamais un chemin), sans points en tete, blancs resserres, 120 caracteres au plus, « Sans titre » s'il ne reste rien. La meme regle
 * que le client (src/model/projet.ts, `nomDeProjet`).
 */
function nom_propre(mixed $brut): string
{
    $t = is_string($brut) ? $brut : '';
    if (!mb_check_encoding($t, 'UTF-8')) {
        $t = mb_convert_encoding($t, 'UTF-8', 'UTF-8');
    }
    $t = preg_replace('/[\x{0000}-\x{001F}\x{007F}-\x{009F}\x{200B}-\x{200F}\x{2028}-\x{202E}\x{2066}-\x{2069}\x{FEFF}]/u', '', $t) ?? '';
    $t = str_replace(['/', '\\'], '-', $t);
    $t = trim(preg_replace('/\s+/u', ' ', $t) ?? '');
    $t = trim(ltrim($t, '.'));
    $t = trim(mb_substr($t, 0, NOM_MAX));
    return $t === '' ? 'Sans titre' : $t;
}

function est_nombre(mixed $v): bool
{
    return (is_int($v) || is_float($v)) && is_finite((float) $v);
}

/**
 * La structure minimale d'un projet et son format : de quoi refuser un JSON qui n'est pas un projet de l'editeur, sans refaire la
 * validation complete du client (qui refuse un champ mal forme en le nommant). Rend la raison du refus, ou null.
 */
function projet_invalide(mixed $p): ?string
{
    if (!is_object($p)) {
        return 'ce n’est pas un objet JSON';
    }
    if (($p->format ?? null) !== FORMAT_PROJET) {
        return 'ce n’est pas un projet de l’éditeur (format)';
    }
    if (!is_int($p->version ?? null) || $p->version < 1 || $p->version > 1000) {
        return 'sa version est illisible';
    }
    if (!is_string($p->nom ?? null)) {
        return 'il n’a pas de nom';
    }
    $d = $p->dessin ?? null;
    if (!is_object($d) || !is_array($d->vb ?? null) || count($d->vb) !== 4 || !array_is_list($d->vb)) {
        return 'son plan de travail est illisible';
    }
    foreach ($d->vb as $v) {
        if (!est_nombre($v)) {
            return 'son plan de travail est illisible';
        }
    }
    if (!is_array($d->formes ?? null) || !array_is_list($d->formes) || count($d->formes) > FORMES_MAX) {
        return 'ses formes sont illisibles';
    }
    foreach ($d->formes as $f) {
        if (!is_object($f) || !is_string($f->id ?? null) || !is_string($f->d ?? null)) {
            return 'une forme est illisible';
        }
    }
    if (!is_object($p->production ?? null) || !is_string($p->production->contexte ?? null)) {
        return 'son contexte de production est illisible';
    }
    if (!is_array($p->nuancier ?? null) || !is_object($p->ressources ?? null) || !is_array($p->ressources->polices ?? null) || !is_array($p->ressources->images ?? null)) {
        return 'son nuancier ou ses ressources sont illisibles';
    }
    return null;
}

/** La vignette d'un projet : le SVG que l'editeur ecrit (un <svg> et des <path>), refuse au moindre element ou attribut actif. */
function vignette_sure(mixed $svg): bool
{
    if (!is_string($svg) || $svg === '' || strlen($svg) > VIGNETTE_OCTETS_MAX || !mb_check_encoding($svg, 'UTF-8')) {
        return false;
    }
    if (!str_starts_with($svg, '<svg xmlns="http://www.w3.org/2000/svg"') || !str_ends_with($svg, '</svg>')) {
        return false;
    }
    return preg_match('/<\s*(script|foreignobject|iframe|image|use|style|a\b|animate|set\b)|<[!?]|\bon[a-z]+\s*=|javascript:|href|url\s*\(|@import/i', $svg) !== 1;
}

/** Le projet, ses champs du serveur (nom, dates) en tete dans l'ordre du format, le reste tel qu'il est venu. */
function projet_ordonne(object $p, string $nom, string $creeLe, string $modifieLe): object
{
    $o = new stdClass();
    $o->format = $p->format;
    $o->version = $p->version;
    $o->nom = $nom;
    $o->creeLe = $creeLe;
    $o->modifieLe = $modifieLe;
    foreach (get_object_vars($p) as $k => $v) {
        if (!in_array($k, ['format', 'version', 'nom', 'creeLe', 'modifieLe'], true)) {
            $o->{$k} = $v;
        }
    }
    return $o;
}

/** La fiche d'un projet, ou null : seuls des champs de la bonne forme sont crus. */
function lire_meta(string $id): ?array
{
    $f = chemin_projet($id, '.meta.json');
    if (!is_file($f)) {
        return null;
    }
    $m = json_decode((string) file_get_contents($f), true);
    if (!is_array($m) || ($m['id'] ?? null) !== $id || !is_string($m['nom'] ?? null) || !is_int($m['revision'] ?? null) || !is_string($m['creeLe'] ?? null) || !is_string($m['modifieLe'] ?? null)) {
        return null;
    }
    return ['id' => $id, 'nom' => $m['nom'], 'creeLe' => $m['creeLe'], 'modifieLe' => $m['modifieLe'], 'revision' => $m['revision'], 'taille' => (int) ($m['taille'] ?? 0), 'vignette' => is_file(chemin_projet($id, '.svg'))];
}

/** Les fiches de tous les projets, le plus recemment modifie d'abord. */
function lister_projets(): array
{
    $liste = [];
    foreach (scandir(dossier_projets()) ?: [] as $nom) {
        if (preg_match('/^([a-f0-9]{16})\.meta\.json$/', $nom, $m) === 1) {
            $meta = lire_meta($m[1]);
            if ($meta !== null) {
                $liste[] = $meta;
            }
        }
    }
    usort($liste, fn(array $a, array $b): int => strcmp($b['modifieLe'], $a['modifieLe']) ?: strcmp($a['nom'], $b['nom']));
    return $liste;
}

function nouvel_id(): string
{
    do {
        $id = bin2hex(random_bytes(8));
    } while (is_file(chemin_projet($id, '.meta.json')));
    return $id;
}

/** Ecrit le projet, sa vignette et sa fiche (dans cet ordre : la fiche dit le projet present). Rend la fiche. */
function ecrire_projet(string $id, object $projet, array $meta, mixed $vignette, bool $garderVignette = false): array
{
    $texte = json_encode($projet, JSON_PROJET);
    if (strlen($texte) > PROJET_OCTETS_MAX) {
        throw new LengthException('projet trop gros');
    }
    ecrire_atomique(chemin_projet($id, '.json'), $texte);
    $svg = chemin_projet($id, '.svg');
    if (vignette_sure($vignette)) {
        ecrire_atomique($svg, (string) $vignette);
    } elseif (!$garderVignette && is_file($svg)) {
        // Une vignette absente ou refusee ne laisse pas l'ancienne mentir sur le nouveau dessin.
        @unlink($svg);
    }
    $meta['taille'] = strlen($texte);
    $meta['vignette'] = is_file($svg);
    ecrire_atomique(chemin_projet($id, '.meta.json'), json_encode($meta, JSON_PROJET));
    return $meta;
}

/**
 * Enregistre un projet : neuf (`$id` null), ou par-dessus la revision `$attendue`. Rend ['meta' => …], ou ['statut', 'erreur',
 * 'message', 'meta'?] : 400 projet invalide, 404 projet disparu, 428 revision manquante, 409 revision depassee, 413 trop gros.
 */
function enregistrer_projet(?string $id, mixed $projet, ?int $attendue, mixed $vignette): array
{
    $raison = projet_invalide($projet);
    if ($raison !== null) {
        return ['statut' => 400, 'erreur' => 'invalide', 'message' => 'Le serveur refuse ce projet : ' . $raison . '.'];
    }
    return avec_verrou(function () use ($id, $projet, $attendue, $vignette): array {
        $maintenant = maintenant_iso();
        if ($id === null) {
            $id = nouvel_id();
            $meta = ['id' => $id, 'nom' => '', 'creeLe' => $maintenant, 'modifieLe' => $maintenant, 'revision' => 0];
        } else {
            $meta = lire_meta($id);
            if ($meta === null) {
                return ['statut' => 404, 'erreur' => 'introuvable', 'message' => 'Ce projet n’existe plus sur le serveur.'];
            }
            if ($attendue === null) {
                return ['statut' => 428, 'erreur' => 'conflit', 'message' => 'Écraser un projet demande la version ouverte.', 'meta' => $meta];
            }
            if ($meta['revision'] !== $attendue) {
                return ['statut' => 409, 'erreur' => 'conflit', 'message' => 'Ce projet a été enregistré ailleurs depuis son ouverture.', 'meta' => $meta];
            }
        }
        $nom = nom_propre($projet->nom);
        $meta = ['id' => $id, 'nom' => $nom, 'creeLe' => $meta['creeLe'], 'modifieLe' => $maintenant, 'revision' => $meta['revision'] + 1];
        try {
            return ['meta' => ecrire_projet($id, projet_ordonne($projet, $nom, $meta['creeLe'], $maintenant), $meta, $vignette)];
        } catch (LengthException) {
            return ['statut' => 413, 'erreur' => 'trop_gros', 'message' => 'Ce projet dépasse la taille que le serveur accepte.'];
        }
    });
}

/** Le projet enregistre, decode, ou null. */
function lire_projet(string $id): ?object
{
    $f = chemin_projet($id, '.json');
    if (!is_file($f)) {
        return null;
    }
    try {
        $p = json_decode((string) file_get_contents($f), false, 64, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        return null;
    }
    return is_object($p) ? $p : null;
}

function renommer_projet(string $id, mixed $nomBrut): array
{
    return avec_verrou(function () use ($id, $nomBrut): array {
        $meta = lire_meta($id);
        $projet = $meta === null ? null : lire_projet($id);
        if ($meta === null || $projet === null) {
            return ['statut' => 404, 'erreur' => 'introuvable', 'message' => 'Ce projet n’existe plus sur le serveur.'];
        }
        $nom = nom_propre($nomBrut);
        $maintenant = maintenant_iso();
        $meta = ['id' => $id, 'nom' => $nom, 'creeLe' => $meta['creeLe'], 'modifieLe' => $maintenant, 'revision' => $meta['revision'] + 1];
        return ['meta' => ecrire_projet($id, projet_ordonne($projet, $nom, $meta['creeLe'], $maintenant), $meta, null, true)];
    });
}

function dupliquer_projet(string $id): array
{
    return avec_verrou(function () use ($id): array {
        $meta = lire_meta($id);
        $projet = $meta === null ? null : lire_projet($id);
        if ($meta === null || $projet === null) {
            return ['statut' => 404, 'erreur' => 'introuvable', 'message' => 'Ce projet n’existe plus sur le serveur.'];
        }
        $neuf = nouvel_id();
        $nom = nom_propre($meta['nom'] . ' (copie)');
        $maintenant = maintenant_iso();
        $svg = chemin_projet($id, '.svg');
        $vignette = is_file($svg) ? (string) file_get_contents($svg) : null;
        $copie = ['id' => $neuf, 'nom' => $nom, 'creeLe' => $maintenant, 'modifieLe' => $maintenant, 'revision' => 1];
        return ['meta' => ecrire_projet($neuf, projet_ordonne($projet, $nom, $maintenant, $maintenant), $copie, $vignette)];
    });
}

/** Met le projet a la corbeille (data/projets/corbeille), horodate : rien n'est efface du disque. */
function supprimer_projet(string $id): array
{
    return avec_verrou(function () use ($id): array {
        if (lire_meta($id) === null) {
            return ['statut' => 404, 'erreur' => 'introuvable', 'message' => 'Ce projet n’existe plus sur le serveur.'];
        }
        $prefixe = dossier_projets() . '/corbeille/' . gmdate('Ymd\THis\Z') . '-';
        // La fiche d'abord : sans elle, le projet n'est plus liste, meme si le reste tardait.
        foreach (['.meta.json', '.json', '.svg'] as $suffixe) {
            $f = chemin_projet($id, $suffixe);
            if (is_file($f) && !rename($f, $prefixe . $id . $suffixe)) {
                throw new RuntimeException('corbeille impossible pour ' . $id);
            }
        }
        return ['ok' => true];
    });
}
