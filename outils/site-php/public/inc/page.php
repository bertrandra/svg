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

/** Le formulaire de connexion, avec son erreur quand il y en a une (liee au champ, lue tout de suite). */
function page_connexion(string $erreur = '', string $info = '', int $statut = 200): never
{
    $idErreur = $erreur !== '' ? ' aria-describedby="erreur-connexion" aria-invalid="true"' : '';
    $corps = '<main class="accueil connexion">'
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

/** L'application : le conteneur, son jeton CSRF et l'avertissement de l'administrateur s'il y en a un, puis le script. */
function page_application(string $avertissement): never
{
    $corps = ($avertissement !== '' ? '<p class="message site-avertissement" role="alert">' . h($avertissement) . '</p>' : '')
        . '<div id="site" data-csrf="' . h(jeton_csrf()) . '" data-api="api.php" data-assets="assets/">'
        . '<main class="accueil"><p class="message">Chargement de l’éditeur… Si ce message reste affiché, JavaScript est désactivé ou ce navigateur est trop ancien : utilisez une version récente de Chrome, Edge, Firefox ou Safari.</p></main>'
        . '</div>';
    rendre_page('Mes projets · Éditeur SVG', $corps, 200, '<script src="assets/site.js" defer></script>' . "\n");
}
