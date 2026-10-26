<?php
// Les pages HTML du site (ADR-0030) : la connexion, l'installation a finir, et l'application. Les styles sont ceux de la page
// autonome (assets/site.css : les jetons de couleur, les styles de base, la page, l'editeur, et ceux du site), aucune couleur
// n'est ecrite ici ; le texte est en francais, au vouvoiement.

declare(strict_types=1);

defined('SVG_SITE') || exit;

/** Une page complete : en-tetes de securite poses par l'appelant, `$corps` deja echappe. */
function rendre_page(string $titre, string $corps, int $statut = 200, string $script = ''): never
{
    http_response_code($statut);
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    echo '<!doctype html>' . "\n" . '<html lang="fr">' . "\n" . '<meta charset="utf-8">' . "\n"
        . '<meta name="viewport" content="width=device-width, initial-scale=1">' . "\n"
        . '<meta name="referrer" content="no-referrer">' . "\n"
        . '<title>' . h($titre) . '</title>' . "\n"
        . '<link rel="stylesheet" href="assets/site.css">' . "\n"
        . $corps . "\n" . $script;
    exit;
}

/** Les avertissements de l'administrateur, chacun lu tout de suite. */
function avertissements_html(array $avertissements): string
{
    $html = '';
    foreach ($avertissements as $a) {
        if (is_string($a) && $a !== '') {
            $html .= '<p class="message site-avertissement" role="alert">' . h($a) . '</p>';
        }
    }
    return $html;
}

/** Le formulaire de connexion, avec son erreur quand il y en a une (liee au champ, lue tout de suite). */
function page_connexion(string $erreur = '', string $info = '', int $statut = 200, array $avertissements = []): never
{
    $idErreur = $erreur !== '' ? ' aria-describedby="erreur-connexion" aria-invalid="true"' : '';
    $corps = avertissements_html($avertissements)
        . '<main class="accueil connexion">'
        . '<header class="tete"><h1>Éditeur SVG</h1><p>Ce site est réservé : saisissez son mot de passe pour retrouver vos projets.</p></header>'
        . ($info !== '' ? '<p class="message neutre" role="status">' . h($info) . '</p>' : '')
        . '<form class="carte-connexion" method="post" action="index.php">'
        . '<input type="hidden" name="action" value="connexion">'
        . '<input type="hidden" name="csrf" value="' . h(jeton_csrf()) . '">'
        . ($erreur !== '' ? '<p class="message" role="alert" id="erreur-connexion">' . h($erreur) . '</p>' : '')
        . '<label class="champ" for="mot-de-passe"><span>Mot de passe</span></label>'
        . '<input id="mot-de-passe" name="mot_de_passe" type="password" autocomplete="current-password" required autofocus' . $idErreur . '>'
        . '<div class="actions"><button type="submit" class="primaire">Se connecter</button></div>'
        . '</form></main>';
    rendre_page('Connexion · Éditeur SVG', $corps, $statut);
}

/**
 * La premiere visite, tant qu'aucun mot de passe n'est pose : le choisir dans la page (deux saisies identiques, dix caracteres au
 * moins), et, plus discret, les autres voies (data/password par FTP, la ligne de commande).
 */
function page_premier_mot_de_passe(string $erreur = '', int $statut = 200): never
{
    $lie = $erreur !== '' ? ' aria-describedby="erreur-choix regle-choix" aria-invalid="true"' : ' aria-describedby="regle-choix"';
    $corps = '<main class="accueil connexion">'
        . '<header class="tete"><h1>Éditeur SVG</h1><p>Première visite : ce site n’a pas encore de mot de passe. Choisissez-le maintenant ; il protégera vos projets, et vous le saisirez à chaque connexion.</p></header>'
        . '<form class="carte-connexion" method="post" action="index.php" aria-labelledby="titre-choix">'
        . '<h2 id="titre-choix">Choisissez le mot de passe du site</h2>'
        . '<input type="hidden" name="action" value="choisir">'
        . '<input type="hidden" name="csrf" value="' . h(jeton_csrf()) . '">'
        . ($erreur !== '' ? '<p class="message" role="alert" id="erreur-choix">' . h($erreur) . '</p>' : '')
        . '<p class="aide" id="regle-choix">' . MOT_DE_PASSE_LONGUEUR_MIN . ' caractères au moins.</p>'
        . '<label class="champ" for="nouveau-mot-de-passe"><span>Mot de passe</span></label>'
        . '<input id="nouveau-mot-de-passe" name="mot_de_passe" type="password" autocomplete="new-password" minlength="' . MOT_DE_PASSE_LONGUEUR_MIN . '" required autofocus' . $lie . '>'
        . '<label class="champ" for="confirmation-mot-de-passe"><span>Le même, de nouveau</span></label>'
        . '<input id="confirmation-mot-de-passe" name="confirmation" type="password" autocomplete="new-password" minlength="' . MOT_DE_PASSE_LONGUEUR_MIN . '" required' . $lie . '>'
        . '<div class="actions"><button type="submit" class="primaire">Enregistrer le mot de passe</button></div>'
        . '<p class="aide">Tant qu’il n’est pas choisi, n’importe quel visiteur pourrait le faire : ne tardez pas. Vous pouvez aussi le poser sans cette page : créez par FTP un fichier data/password qui contient le mot de passe, puis rechargez la page (le site en garde l’empreinte et supprime le fichier) ; ou, en ligne de commande dans le dossier du site : php inc/mot-de-passe.php</p>'
        . '</form></main>';
    rendre_page('Premier mot de passe · Éditeur SVG', $corps, $statut);
}

/** Ce que l'administrateur doit encore faire : la phrase, et la commande quand il y en a une. Personne n'entre. */
function page_installation(string $phrase, string $commande = ''): never
{
    $corps = '<main class="accueil connexion">'
        . '<header class="tete"><h1>Éditeur SVG</h1><p>L’installation du site n’est pas terminée.</p></header>'
        . '<section class="carte-connexion" aria-labelledby="titre-installation"><h2 id="titre-installation">Pour l’administrateur</h2>'
        . '<p>' . h($phrase) . '</p>'
        . ($commande !== '' ? '<pre class="code-integration" tabindex="0"><code>' . h($commande) . '</code></pre>' : '')
        . '<p class="aide">Le guide d’installation est dans docs/deploiement-php.md.</p>'
        . '</section></main>';
    rendre_page('Installation · Éditeur SVG', $corps, 503);
}

/** L'application : le conteneur, son jeton CSRF et les avertissements de l'administrateur s'il y en a, puis le script. */
function page_application(array $avertissements): never
{
    $corps = avertissements_html($avertissements)
        . '<div id="site" data-csrf="' . h(jeton_csrf()) . '" data-api="api.php" data-assets="assets/" data-adresse="' . (ADRESSE_OUVERTURE ? '1' : '0') . '" data-adresse-http="' . (ADRESSE_HTTP ? '1' : '0') . '">'
        . '<main class="accueil"><p class="message">Chargement de l’éditeur… Si ce message reste affiché, JavaScript est désactivé ou ce navigateur est trop ancien : utilisez une version récente de Chrome, Edge, Firefox ou Safari.</p></main>'
        . '</div>';
    rendre_page('Mes projets · Éditeur SVG', $corps, 200, '<script src="assets/site.js" defer></script>' . "\n");
}
