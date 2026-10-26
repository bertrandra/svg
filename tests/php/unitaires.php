<?php
// Les fonctions du site, appelees directement sur un dossier de donnees temporaire (ADR-0030) : noms et chemins hostiles, structure
// d'un projet, ecriture atomique, controle de version, corbeille, mot de passe, limitation des essais, polices hors de l'index.

declare(strict_types=1);

require __DIR__ . '/outils.php';

$racine = dossier_temporaire('site-unitaires');
define('SVG_SITE', true);
define('DATA_DIR', $racine . '/data');
define('CONNEXION_ESSAIS_LIBRES', 3);
define('CONNEXION_DELAI_MAX', 900);
define('POLICES_SOURCES', ['jsdelivr' => 'http://127.0.0.1:9/npm/@fontsource/', 'bunny' => 'http://127.0.0.1:9/bunny/', 'gitlab' => 'http://127.0.0.1:9/gitlab/', 'fontshare' => 'http://127.0.0.1:9/wf/']);
mkdir(DATA_DIR, 0700, true);
register_shutdown_function(fn() => effacer($racine));

$sources = dirname(__DIR__, 2) . '/outils/site-php/public/inc';
require $sources . '/amorce.php';
require $sources . '/connexion.php';
require $sources . '/projets.php';
require $sources . '/polices.php';
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
    $f = donnees('projets/essai-atomique.json');
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

test('renommer, dupliquer, supprimer : la fiche suit, la corbeille garde tout', function (): void {
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
    egal(3, count(glob(dossier_projets() . '/corbeille/*-' . $m['id'] . '.*') ?: []), 'les trois fichiers sont dans la corbeille');
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
});

test('le mot de passe se verifie contre son empreinte, jamais en clair', function (): void {
    egal(false, mot_de_passe_pose());
    egal(false, verifier_mot_de_passe(''));
    poser_mot_de_passe('un très long mot de passe');
    $empreinte = trim((string) file_get_contents(fichier_mot_de_passe()));
    egal(false, str_contains($empreinte, 'long mot'), 'jamais en clair');
    affirmer(str_starts_with($empreinte, '$argon2id$') || str_starts_with($empreinte, '$2y$'), 'argon2id ou bcrypt');
    egal(true, verifier_mot_de_passe('un très long mot de passe'));
    egal(false, verifier_mot_de_passe('un très long mot de pass'));
    egal(false, verifier_mot_de_passe(''));
    file_put_contents(fichier_mot_de_passe(), "en clair\n");
    egal(false, mot_de_passe_pose(), 'un fichier en clair n est pas une empreinte');
    egal(false, verifier_mot_de_passe('en clair'));
});

test('les essais de connexion attendent un delai qui double apres les essais libres, puis le plafond', function (): void {
    egal([0, 0, 0, 2, 4, 8, 16], array_map('delai_apres', [0, 1, 2, 3, 4, 5, 6]));
    egal(900, delai_apres(40));
    $t = 1000000;
    $cle = 'essai-delai';
    for ($i = 0; $i < 3; $i++) {
        egal(0, attente_restante($cle, $t), 'essai libre ' . $i);
        noter_essai($cle, false, $t);
    }
    egal(2, attente_restante($cle, $t));
    egal(0, attente_restante($cle, $t + 2));
    noter_essai($cle, false, $t + 2);
    egal(4, attente_restante($cle, $t + 2));
    egal(0, attente_restante('autre-client', $t + 2), 'chaque client a ses essais');
    noter_essai($cle, true, $t + 6);
    egal(0, attente_restante($cle, $t + 6), 'un succes efface les echecs');
    contient('echec client=essai-delai', (string) file_get_contents(donnees('journal/connexions.log')));
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
