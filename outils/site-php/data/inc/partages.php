<?php
// Le partage des projets entre comptes (ADR-0043). Deux gestes : envoyer une copie (le projet est recopie dans le dossier de l'autre
// compte, qui en devient le seul titulaire : rien ne relie plus les deux) et partager en lecture (le projet reste dans le dossier de
// son titulaire ; l'autre compte peut l'ouvrir, en voir la vignette et en enregistrer une copie chez lui, jamais l'ecrire). Les
// partages en lecture vivent dans un seul fichier, data/partages.json, la seule source : une entree (titulaire, projet,
// destinataire, date) y vaut un droit de lecture, rien d'autre n'en donne. Le fichier se relit valide a chaque requete ; une entree
// mal formee est ecartee, un fichier illisible ne donne aucun droit (et c'est journalise) : un fichier abime retire des partages,
// il n'en invente jamais. Toute ecriture passe sous un verrou et d'un seul geste (`ecrire_atomique`).

declare(strict_types=1);

defined('SVG_SITE') || exit;

const FORMAT_PARTAGES = 'editeur-svg/partages';
const VERSION_PARTAGES = 1;
/** Au-dela, partager un projet de plus est refuse : la liste du panneau reste lisible et le fichier borne. */
const PARTAGES_PAR_PROJET_MAX = 50;
const PARTAGES_MAX = 20000;

function chemin_partages(): string
{
    return donnees('partages.json');
}

/** Une entree lue : trois identifiants surs (le titulaire n'est pas le destinataire) et une date ; sinon null. */
function partage_valide(mixed $x): ?array
{
    if (!is_array($x) || array_keys($x) !== ['proprietaire', 'projet', 'destinataire', 'le']) {
        return null;
    }
    foreach (['proprietaire', 'projet', 'destinataire'] as $k) {
        if (!is_string($x[$k]) || preg_match(MOTIF_ID, $x[$k]) !== 1) {
            return null;
        }
    }
    if ($x['proprietaire'] === $x['destinataire'] || !date_iso_valide($x['le'])) {
        return null;
    }
    return $x;
}

/**
 * Les partages en lecture, valides. Un fichier absent vaut aucun partage ; un fichier qui n'a pas le bon format, aussi (journalise) ;
 * une entree mal formee ou en double est ecartee. Rend la liste dans l'ordre du fichier.
 */
function lire_partages(): array
{
    $f = chemin_partages();
    if (!is_file($f)) {
        return [];
    }
    $j = json_decode((string) file_get_contents($f), true, 8);
    if (!is_array($j) || ($j['format'] ?? null) !== FORMAT_PARTAGES || ($j['version'] ?? null) !== VERSION_PARTAGES || !is_array($j['partages'] ?? null) || !array_is_list($j['partages'])) {
        error_log('partages : data/partages.json est illisible ; aucun partage en lecture ne vaut tant qu il ne l est pas');
        return [];
    }
    $liste = [];
    $vus = [];
    foreach (array_slice($j['partages'], 0, PARTAGES_MAX) as $x) {
        $p = partage_valide($x);
        $cle = $p === null ? '' : $p['proprietaire'] . $p['projet'] . $p['destinataire'];
        if ($p !== null && !isset($vus[$cle])) {
            $vus[$cle] = true;
            $liste[] = $p;
        }
    }
    return $liste;
}

function ecrire_partages(array $liste): void
{
    $texte = json_encode(['format' => FORMAT_PARTAGES, 'version' => VERSION_PARTAGES, 'partages' => array_values($liste)], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    ecrire_atomique(chemin_partages(), $texte . "\n", 0640);
}

/** Lit les partages sous le verrou, les passe a `$changer` qui rend [resultat, nouvelle liste ou null] ; ecrit si la liste change. */
function avec_partages(callable $changer): mixed
{
    return sous_verrou(donnees('partages.verrou'), function () use ($changer): mixed {
        [$resultat, $nouvelle] = $changer(lire_partages());
        if ($nouvelle !== null) {
            ecrire_partages($nouvelle);
        }
        return $resultat;
    });
}

/** Les partages d'un projet de ce titulaire. */
function partages_du_projet(string $proprietaire, string $projet): array
{
    return array_values(array_filter(lire_partages(), fn(array $p): bool => $p['proprietaire'] === $proprietaire && $p['projet'] === $projet));
}

/** Le seul controle d'acces d'une lecture partagee : une entree exacte (titulaire, projet, destinataire). */
function partage_existe(string $proprietaire, string $projet, string $destinataire): bool
{
    foreach (lire_partages() as $p) {
        if ($p['proprietaire'] === $proprietaire && $p['projet'] === $projet && $p['destinataire'] === $destinataire) {
            return true;
        }
    }
    return false;
}

/** Ajoute un partage ; rend 'ajoute', 'existe' ou 'plein'. */
function ajouter_partage(string $proprietaire, string $projet, string $destinataire): string
{
    return avec_partages(function (array $liste) use ($proprietaire, $projet, $destinataire): array {
        $duProjet = 0;
        foreach ($liste as $p) {
            if ($p['proprietaire'] === $proprietaire && $p['projet'] === $projet) {
                if ($p['destinataire'] === $destinataire) {
                    return ['existe', null];
                }
                $duProjet++;
            }
        }
        if ($duProjet >= PARTAGES_PAR_PROJET_MAX || count($liste) >= PARTAGES_MAX) {
            return ['plein', null];
        }
        $liste[] = ['proprietaire' => $proprietaire, 'projet' => $projet, 'destinataire' => $destinataire, 'le' => maintenant_iso()];
        return ['ajoute', $liste];
    });
}

/** Retire les partages pour lesquels `$retirer` rend vrai ; rend le nombre d'entrees retirees. */
function retirer_partages(callable $retirer): int
{
    return avec_partages(function (array $liste) use ($retirer): array {
        $restants = array_values(array_filter($liste, fn(array $p): bool => !$retirer($p)));
        $n = count($liste) - count($restants);
        return [$n, $n > 0 ? $restants : null];
    });
}

function retirer_partage(string $proprietaire, string $projet, string $destinataire): bool
{
    return retirer_partages(fn(array $p): bool => $p['proprietaire'] === $proprietaire && $p['projet'] === $projet && $p['destinataire'] === $destinataire) > 0;
}

/** Un projet mis a la corbeille n'est plus partage. */
function retirer_partages_du_projet(string $proprietaire, string $projet): int
{
    return retirer_partages(fn(array $p): bool => $p['proprietaire'] === $proprietaire && $p['projet'] === $projet);
}

/** Un compte supprime ne partage plus rien et ne recoit plus rien. */
function retirer_partages_du_compte(string $id): int
{
    return retirer_partages(fn(array $p): bool => $p['proprietaire'] === $id || $p['destinataire'] === $id);
}

/** Le nombre de partages de chaque projet d'un titulaire : [projet => n]. */
function nombre_partages_par_projet(string $proprietaire): array
{
    $n = [];
    foreach (lire_partages() as $p) {
        if ($p['proprietaire'] === $proprietaire) {
            $n[$p['projet']] = ($n[$p['projet']] ?? 0) + 1;
        }
    }
    return $n;
}

/** Ce que le titulaire voit d'un partage : la personne (nom, adresse, qu'il a lui-meme tapee) et la date. */
function partage_public(array $p): ?array
{
    $c = lire_compte($p['destinataire']);
    return $c === null ? null : ['id' => $c['id'], 'nom' => $c['nom'], 'email' => $c['email'], 'le' => $p['le']];
}

/** Les personnes avec qui ce projet est partage, pour le panneau du titulaire (un compte disparu n'y figure pas). */
function personnes_du_partage(string $proprietaire, string $projet): array
{
    return array_values(array_filter(array_map('partage_public', partages_du_projet($proprietaire, $projet))));
}

/**
 * Les projets partages avec ce compte, du plus recemment modifie au plus ancien : la fiche du projet, lue dans le dossier de son
 * titulaire, et le titulaire (id, nom). Un titulaire ou un projet disparus ne sont pas listes.
 */
function projets_recus(string $destinataire): array
{
    $liste = [];
    foreach (lire_partages() as $p) {
        if ($p['destinataire'] !== $destinataire) {
            continue;
        }
        $titulaire = lire_compte($p['proprietaire']);
        $meta = $titulaire === null ? null : sous_compte_projets($p['proprietaire'], fn(): ?array => lire_meta($p['projet']));
        if ($meta !== null) {
            unset($meta['recuDe']);
            $liste[] = $meta + ['proprietaire' => ['id' => $titulaire['id'], 'nom' => $titulaire['nom']], 'partageLe' => $p['le']];
        }
    }
    usort($liste, fn(array $a, array $b): int => strcmp($b['modifieLe'], $a['modifieLe']) ?: strcmp($a['nom'], $b['nom']));
    return $liste;
}

/**
 * Le compte a qui l'on partage, d'apres l'adresse tapee : un compte actif autre que soi. Rend ['compte' => …] ou un refus nomme
 * (adresse mal formee 400, aucun compte actif 404, soi-meme 409). Les adresses inconnues se comptent par compte (`limite`, 429) :
 * on ne fait pas defiler l'annuaire du site depuis ce champ.
 */
function destinataire_du_partage(mixed $email, array $moi): array
{
    $email = is_string($email) ? trim($email) : '';
    if (!email_valide($email)) {
        return ['statut' => 400, 'erreur' => 'invalide', 'message' => t('Cette adresse de courrier n’est pas valide.')];
    }
    $cle = 'mp' . cle_compte($moi['id']);
    $attente = attente_restante($cle, time());
    if ($attente > 0) {
        return ['statut' => 429, 'erreur' => 'limite', 'message' => t('Patientez {n} secondes avant de réessayer.', ['n' => $attente])];
    }
    $c = compte_par_email($email);
    if ($c === null || $c['etat'] !== 'actif') {
        noter_essai($cle, false, time());
        return ['statut' => 404, 'erreur' => 'introuvable', 'message' => t('Aucun compte actif ne porte cette adresse sur ce site.')];
    }
    if ($c['id'] === $moi['id']) {
        return ['statut' => 409, 'erreur' => 'soi-meme', 'message' => t('C’est votre propre adresse.')];
    }
    noter_essai($cle, true, time());
    return ['compte' => $c];
}

/** Envoie une copie d'un projet du compte connecte a un autre compte, qui recoit un mail. */
function envoyer_copie(string $id, array $moi, array $destinataire): array
{
    $r = copier_projet($moi['id'], $id, $destinataire['id'], fn(string $nom): string => $nom, $moi['nom']);
    if (!isset($r['meta'])) {
        return $r;
    }
    journaliser('partages', 'copie projet=' . $id . ' de=' . $moi['id'] . ' a=' . $destinataire['id']);
    $erreur = mail_copie($destinataire, $moi, $r['meta']['nom']);
    return ['ok' => true, 'destinataire' => ['nom' => $destinataire['nom']], 'courrier' => $erreur === null];
}

/** Partage en lecture un projet du compte connecte avec un autre compte, qui recoit un mail. Rend la liste des personnes. */
function partager_en_lecture(string $id, array $moi, array $destinataire): array
{
    $meta = lire_meta($id);
    if ($meta === null) {
        return ['statut' => 404, 'erreur' => 'introuvable', 'message' => t('Ce projet n’existe plus sur le serveur.')];
    }
    $etat = ajouter_partage($moi['id'], $id, $destinataire['id']);
    if ($etat === 'existe') {
        return ['statut' => 409, 'erreur' => 'existe', 'message' => t('Ce projet est déjà partagé avec {nom}.', ['nom' => $destinataire['nom']])];
    }
    if ($etat === 'plein') {
        return ['statut' => 409, 'erreur' => 'etat', 'message' => t('Ce projet est déjà partagé avec {n} personnes : retirez-en une avant d’en ajouter.', ['n' => PARTAGES_PAR_PROJET_MAX])];
    }
    journaliser('partages', 'lecture projet=' . $id . ' de=' . $moi['id'] . ' a=' . $destinataire['id']);
    $erreur = mail_partage($destinataire, $moi, $meta['nom']);
    return ['partages' => personnes_du_partage($moi['id'], $id), 'courrier' => $erreur === null];
}
