<?php
// L'API du site (ADR-0030) : les projets de data/projets, les donnees de data/json, les fontes de data/font, et les polices du
// catalogue que le serveur telecharge et verifie pour le navigateur. Toute route exige la session ; toute ecriture exige en plus
// POST, du JSON et le jeton CSRF de la session (en-tete X-CSRF), et refuse une requete venue d'un autre site.
//
//   GET  api.php?r=jeton                       le jeton CSRF de la session (apres une reconnexion dans un autre onglet)
//   GET  api.php?r=projets                     la liste des fiches
//   GET  api.php?r=projet&id=…                 le projet (ETag : sa revision)
//   POST api.php?r=enregistrer[&id=…]          { projet, vignette? } ; par-dessus un projet : If-Match "<revision>"
//   POST api.php?r=renommer&id=…               { nom }
//   POST api.php?r=dupliquer&id=…
//   POST api.php?r=supprimer&id=…              a la corbeille
//   GET  api.php?r=vignette&id=…               le SVG de la liste, servi comme une image inerte
//   GET  api.php?r=json&f=…                    une annexe de donnees
//   GET  api.php?r=fonte&f=…                   une fonte livree
//   GET  api.php?r=police&sha=…                une police du catalogue, par l'empreinte sha256 de son fichier
//   POST api.php?r=adresse                     { adresse } : le fichier a cette adresse, que le serveur va chercher (ADR-0036)

declare(strict_types=1);

define('SVG_SITE', true);
require __DIR__ . '/inc/amorce.php';
require __DIR__ . '/inc/reponses.php';
require __DIR__ . '/inc/session.php';
require __DIR__ . '/inc/projets.php';
require __DIR__ . '/inc/polices.php';
require __DIR__ . '/inc/adresse.php';

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
    repondre_erreur(503, 'serveur', 'Le site n’est pas encore installé : voir la page d’accueil.');
}
demarrer_session();
if (!est_connecte()) {
    repondre_erreur(401, 'session', 'Votre session a expiré : reconnectez-vous.');
}
$csrfValide = csrf_valide($_SERVER['HTTP_X_CSRF'] ?? null);
// La session n'a plus a s'ecrire : on la relache, pour qu'un telechargement de police ne bloque pas les autres requetes.
session_write_close();

/** Une ecriture : POST, JSON, jeton CSRF, et pas d'un autre site. Rend le corps decode. */
function corps_ecriture(bool $csrfValide, int $max): object
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        repondre_erreur(405, 'methode', 'Cette route n’accepte que POST.', []);
    }
    $site = $_SERVER['HTTP_SEC_FETCH_SITE'] ?? 'same-origin';
    if (!in_array($site, ['same-origin', 'none'], true) || !$csrfValide) {
        repondre_erreur(403, 'csrf', 'Requête refusée : rechargez la page, puis réessayez.');
    }
    if (!str_starts_with(strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? '')), 'application/json')) {
        repondre_erreur(415, 'invalide', 'Le corps doit être du JSON.');
    }
    if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > $max) {
        repondre_erreur(413, 'trop_gros', 'Ce projet dépasse la taille que le serveur accepte.');
    }
    $texte = (string) file_get_contents('php://input', false, null, 0, $max + 1);
    if (strlen($texte) > $max) {
        repondre_erreur(413, 'trop_gros', 'Ce projet dépasse la taille que le serveur accepte.');
    }
    try {
        $corps = json_decode($texte, false, 64, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        repondre_erreur(400, 'invalide', 'Le corps n’est pas du JSON valide.');
    }
    if (!is_object($corps)) {
        repondre_erreur(400, 'invalide', 'Le corps doit être un objet JSON.');
    }
    return $corps;
}

/** L'identifiant d'un projet dans l'adresse, ou un refus. */
function id_demande(): string
{
    $id = $_GET['id'] ?? null;
    if (!id_valide($id)) {
        repondre_erreur(400, 'invalide', 'Identifiant de projet invalide.');
    }
    return $id;
}

$route = $_GET['r'] ?? '';
switch ($route) {
    case 'jeton':
        // Lisible par la seule page du site (meme origine, aucune autorisation CORS) : un autre site ne peut pas le lire.
        repondre_json(200, ['csrf' => jeton_csrf()]);
    case 'projets':
        repondre_json(200, ['projets' => lister_projets()]);
    case 'projet':
        $id = id_demande();
        $meta = lire_meta($id);
        if ($meta === null || !is_file(chemin_projet($id, '.json'))) {
            repondre_erreur(404, 'introuvable', 'Ce projet n’existe plus sur le serveur.');
        }
        servir_fichier(chemin_projet($id, '.json'), 'application/json; charset=utf-8', '"' . $meta['revision'] . '"', 'no-store');
    case 'enregistrer':
        $corps = corps_ecriture($csrfValide, PROJET_OCTETS_MAX + VIGNETTE_OCTETS_MAX + 4096);
        $id = isset($_GET['id']) ? id_demande() : null;
        $attendue = preg_match('/^"?(\d{1,10})"?$/', (string) ($_SERVER['HTTP_IF_MATCH'] ?? ''), $m) === 1 ? (int) $m[1] : null;
        repondre_resultat(enregistrer_projet($id, $corps->projet ?? null, $attendue, $corps->vignette ?? null));
    case 'renommer':
        $corps = corps_ecriture($csrfValide, 8192);
        repondre_resultat(renommer_projet(id_demande(), $corps->nom ?? ''));
    case 'dupliquer':
        corps_ecriture($csrfValide, 8192);
        repondre_resultat(dupliquer_projet(id_demande()));
    case 'supprimer':
        corps_ecriture($csrfValide, 8192);
        repondre_resultat(supprimer_projet(id_demande()));
    case 'vignette':
        $id = id_demande();
        $svg = chemin_projet($id, '.svg');
        if (!is_file($svg)) {
            repondre_erreur(404, 'introuvable', 'Ce projet n’a pas de vignette.');
        }
        // Une image, inerte meme ouverte seule : aucun script, aucune requete, un document sans origine.
        servir_fichier($svg, 'image/svg+xml', '"' . sha1_file($svg) . '"', 'private, max-age=31536000', [
            "Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox",
            'Content-Disposition: inline; filename="vignette.svg"',
        ]);
    case 'json':
        servir_json($_GET['f'] ?? null);
    case 'fonte':
        servir_fonte($_GET['f'] ?? null);
    case 'police':
        servir_police_catalogue($_GET['sha'] ?? null);
    case 'adresse':
        // Une requete que le serveur emet pour la personne : une ecriture (POST, jeton CSRF, meme site), jamais un simple lien.
        servir_adresse(corps_ecriture($csrfValide, 8192));
    default:
        repondre_erreur(404, 'introuvable', 'Route inconnue.');
}
