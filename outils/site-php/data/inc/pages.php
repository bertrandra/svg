<?php
// Les pages HTML du site (ADR-0030, ADR-0041 §5) : celles d'avant la connexion (installation de l'administrateur, connexion,
// inscription, « mail envoye », confirmation, mot de passe oublie, reinitialisation, en attente), rendues par le serveur, qui marchent
// sans script, dans la langue de la personne (un selecteur FR / EN en haut a droite, par cookie), sous le jeton CSRF de la session
// anonyme ; puis l'application. Les styles sont ceux de la page autonome (assets/site.css : jetons, base, page, editeur, et ceux du
// site) ; aucune couleur n'est ecrite ici ; le texte passe par t().

declare(strict_types=1);

defined('SVG_SITE') || exit;

/** Une page complete : en-tetes de securite poses par l'appelant, `$corps` deja echappe. */
function rendre_page(string $titre, string $corps, int $statut = 200, string $script = ''): never
{
    http_response_code($statut);
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    echo '<!doctype html>' . "\n" . '<html lang="' . h(langue_courante()) . '">' . "\n" . '<meta charset="utf-8">' . "\n"
        . '<meta name="viewport" content="width=device-width, initial-scale=1">' . "\n"
        . '<meta name="referrer" content="no-referrer">' . "\n"
        . '<title>' . h($titre) . '</title>' . "\n"
        . '<link rel="stylesheet" href="assets/site.css">' . "\n"
        . $corps . "\n" . $script;
    exit;
}

function titre_page(string $page): string
{
    return $page . ' · ' . reglage('site.nom');
}

/** Le selecteur de langue des pages d'avant la connexion : un lien par langue, qui garde la page courante (cookie, sans script). */
function selecteur_langue(): string
{
    $html = '<nav class="site-langue" aria-label="' . h(t('Langue')) . '">';
    foreach (LANGUES as $l) {
        $q = $_GET;
        $q['langue'] = $l;
        $courante = $l === langue_courante();
        $html .= '<a lang="' . $l . '" href="index.php?' . h(http_build_query($q)) . '"' . ($courante ? ' aria-current="true"' : '') . '>' . h(nom_langue($l)) . '</a>';
    }
    return $html . '</nav>';
}

/** L'en-tete des pages d'avant la connexion : le nom du site, une phrase. */
function entete_accueil(string $phrase): string
{
    return selecteur_langue() . '<header class="tete"><h1>' . h(reglage('site.nom')) . '</h1>' . ($phrase !== '' ? '<p>' . h($phrase) . '</p>' : '') . '</header>';
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

function jeton_html(): string
{
    return '<input type="hidden" name="csrf" value="' . h(jeton_csrf()) . '">';
}

/** Un champ de formulaire : son libelle, l'entree, et l'erreur liee quand elle le concerne. */
function champ_html(string $id, string $nom, string $libelle, string $type, string $valeur = '', string $attributs = '', string $erreurId = ''): string
{
    $lie = $erreurId !== '' ? ' aria-describedby="' . h($erreurId) . '" aria-invalid="true"' : '';
    return '<label class="champ" for="' . h($id) . '"><span>' . h($libelle) . '</span></label>'
        . '<input id="' . h($id) . '" name="' . h($nom) . '" type="' . h($type) . '" value="' . h($valeur) . '"' . ($attributs !== '' ? ' ' . $attributs : '') . $lie . '>';
}

/** Le choix de la langue du compte. */
function choix_langue_html(string $valeur): string
{
    $html = '<label class="champ" for="langue"><span>' . h(t('Langue')) . '</span></label><select id="langue" name="langue">';
    foreach (LANGUES as $l) {
        $html .= '<option value="' . $l . '"' . ($l === $valeur ? ' selected' : '') . '>' . h(nom_langue($l)) . '</option>';
    }
    return $html . '</select>';
}

function erreur_html(string $id, string $erreur): string
{
    return $erreur !== '' ? '<p class="message" role="alert" id="' . h($id) . '">' . h($erreur) . '</p>' : '';
}

function info_html(string $info): string
{
    return $info !== '' ? '<p class="message neutre" role="status">' . h($info) . '</p>' : '';
}

/** Les liens secondaires sous une carte (inscription, mot de passe oublie, retour). */
function liens_html(array $liens): string
{
    if ($liens === []) {
        return '';
    }
    $html = '<p class="liens-secondaires">';
    foreach ($liens as $href => $texte) {
        $html .= '<a href="' . h($href) . '">' . h($texte) . '</a>';
    }
    return $html . '</p>';
}

/** Les champs communs a l'installation et a l'inscription : adresse, nom, mot de passe x2, langue. */
function champs_personne_html(array $v, string $erreurId): string
{
    return champ_html('email', 'email', t('Adresse de courrier'), 'email', (string) ($v['email'] ?? ''), 'autocomplete="email" required autofocus', $erreurId)
        . champ_html('nom', 'nom', t('Votre nom'), 'text', (string) ($v['nom'] ?? ''), 'autocomplete="name" maxlength="' . NOM_COMPTE_MAX . '" required', $erreurId)
        . '<p class="aide" id="regle-mot-de-passe">' . h(t('{n} caractères au moins.', ['n' => MOT_DE_PASSE_LONGUEUR_MIN])) . '</p>'
        . champ_html('mot-de-passe', 'mot_de_passe', t('Mot de passe'), 'password', '', 'autocomplete="new-password" minlength="' . MOT_DE_PASSE_LONGUEUR_MIN . '" required', trim($erreurId . ' regle-mot-de-passe'))
        . champ_html('confirmation', 'confirmation', t('Le même, de nouveau'), 'password', '', 'autocomplete="new-password" minlength="' . MOT_DE_PASSE_LONGUEUR_MIN . '" required', $erreurId)
        . choix_langue_html(langue_valide($v['langue'] ?? null) ? $v['langue'] : langue_courante());
}

/** La premiere visite (ADR-0041 §4) : creer le compte administrateur, le nom du site et l'adresse d'expedition des mails. */
function page_installation_admin(array $v = [], string $erreur = '', int $statut = 200): never
{
    $erreurId = $erreur !== '' ? 'erreur-installation' : '';
    $corps = '<main class="accueil connexion">'
        . entete_accueil(t('Première visite : ce site n’a pas encore d’administrateur. Créez son compte maintenant ; il approuvera les inscriptions et réglera le site.'))
        . '<form class="carte-connexion" method="post" action="index.php" aria-labelledby="titre-installation">'
        . '<h2 id="titre-installation">' . h(t('Créer le compte administrateur')) . '</h2>'
        . '<input type="hidden" name="action" value="installer">' . jeton_html()
        . erreur_html('erreur-installation', $erreur)
        . champs_personne_html($v, $erreurId)
        . champ_html('site-nom', 'site_nom', t('Nom du site'), 'text', (string) ($v['site_nom'] ?? reglage('site.nom')), 'maxlength="120"')
        . champ_html('expediteur', 'expediteur', t('Adresse d’expédition des mails'), 'email', (string) ($v['expediteur'] ?? ''), 'autocomplete="off"')
        . '<p class="aide">' . h(t('Les mails (confirmation d’adresse, approbation, mot de passe oublié) partent de cette adresse, par la fonction mail() de l’hébergeur ; un serveur SMTP se règle ensuite dans « Réglages du site ». Vide, votre adresse est prise.')) . '</p>'
        . '<div class="actions"><button type="submit" class="primaire">' . h(t('Créer le compte et entrer')) . '</button></div>'
        . '<p class="aide">' . h(t('Tant que ce compte n’est pas créé, n’importe quel visiteur pourrait le faire : ne tardez pas. En ligne de commande, dans le dossier du site : php data/inc/compte.php --admin')) . '</p>'
        . '</form></main>';
    rendre_page(titre_page(t('Installation')), $corps, $statut);
}

/**
 * Le formulaire de connexion, avec son erreur quand il y en a une (liee au champ, lue tout de suite) ; « Renvoyer le mail » quand
 * l'adresse n'est pas confirmee ; les liens vers l'inscription (si elle est ouverte) et le mot de passe oublie.
 */
function page_connexion(string $erreur = '', string $info = '', int $statut = 200, array $avertissements = [], string $email = '', bool $renvoyer = false): never
{
    $lie = $erreur !== '' ? ' aria-describedby="erreur-connexion" aria-invalid="true"' : '';
    $corps = avertissements_html($avertissements)
        . '<main class="accueil connexion">'
        . entete_accueil(t('Ce site est réservé : connectez-vous pour retrouver vos projets.'))
        . info_html($info)
        . '<form class="carte-connexion" method="post" action="index.php">'
        . '<input type="hidden" name="action" value="connexion">' . jeton_html()
        . erreur_html('erreur-connexion', $erreur)
        . '<label class="champ" for="email"><span>' . h(t('Adresse de courrier')) . '</span></label>'
        . '<input id="email" name="email" type="email" value="' . h($email) . '" autocomplete="username" required autofocus' . $lie . '>'
        . '<label class="champ" for="mot-de-passe"><span>' . h(t('Mot de passe')) . '</span></label>'
        . '<input id="mot-de-passe" name="mot_de_passe" type="password" autocomplete="current-password" required' . $lie . '>'
        . '<div class="actions"><button type="submit" class="primaire">' . h(t('Se connecter')) . '</button></div>'
        . '</form>';
    if ($renvoyer && $email !== '') {
        $corps .= '<form class="carte-connexion" method="post" action="index.php"><input type="hidden" name="action" value="renvoyer">' . jeton_html()
            . '<input type="hidden" name="email" value="' . h($email) . '">'
            . '<p>' . h(t('Vous n’avez pas reçu le message ? Vérifiez vos courriers indésirables, ou demandez-en un nouveau.')) . '</p>'
            . '<div class="actions"><button type="submit">' . h(t('Renvoyer le mail de confirmation')) . '</button></div></form>';
    }
    $liens = [];
    if (reglage('inscriptions.ouvertes')) {
        $liens['index.php?inscription'] = t('Créer un compte');
    }
    $liens['index.php?oublie'] = t('Mot de passe oublié ?');
    $corps .= liens_html($liens) . '</main>';
    rendre_page(titre_page(t('Connexion')), $corps, $statut);
}

/** L'inscription (ADR-0041 §4) : adresse, nom, mot de passe x2, langue. */
function page_inscription(array $v = [], string $erreur = '', int $statut = 200): never
{
    $erreurId = $erreur !== '' ? 'erreur-inscription' : '';
    $corps = '<main class="accueil connexion">'
        . entete_accueil(t('Créez votre compte : vous confirmerez votre adresse par le lien reçu, puis un administrateur approuvera votre demande.'))
        . '<form class="carte-connexion" method="post" action="index.php" aria-labelledby="titre-inscription">'
        . '<h2 id="titre-inscription">' . h(t('Créer un compte')) . '</h2>'
        . '<input type="hidden" name="action" value="inscription">' . jeton_html()
        . erreur_html('erreur-inscription', $erreur)
        . champs_personne_html($v, $erreurId)
        . '<div class="actions"><button type="submit" class="primaire">' . h(t('Créer mon compte')) . '</button></div>'
        . '</form>'
        . liens_html(['index.php' => t('J’ai déjà un compte : me connecter')])
        . '</main>';
    rendre_page(titre_page(t('Créer un compte')), $corps, $statut);
}

/** Le mot de passe oublie : l'adresse seulement ; la reponse est la meme que l'adresse soit connue ou non. */
function page_oublie(string $erreur = '', string $email = '', int $statut = 200): never
{
    $lie = $erreur !== '' ? 'erreur-oublie' : '';
    $corps = '<main class="accueil connexion">'
        . entete_accueil(t('Indiquez votre adresse : si un compte la porte, vous recevrez un lien pour choisir un nouveau mot de passe.'))
        . '<form class="carte-connexion" method="post" action="index.php" aria-labelledby="titre-oublie">'
        . '<h2 id="titre-oublie">' . h(t('Mot de passe oublié')) . '</h2>'
        . '<input type="hidden" name="action" value="oublie">' . jeton_html()
        . erreur_html('erreur-oublie', $erreur)
        . champ_html('email', 'email', t('Adresse de courrier'), 'email', $email, 'autocomplete="username" required autofocus', $lie)
        . '<div class="actions"><button type="submit" class="primaire">' . h(t('Envoyer le lien')) . '</button></div>'
        . '</form>'
        . liens_html(['index.php' => t('Retour à la connexion')])
        . '</main>';
    rendre_page(titre_page(t('Mot de passe oublié')), $corps, $statut);
}

/** Le formulaire du nouveau mot de passe, ouvert par le lien du mail (le jeton reste dans le formulaire, jamais dans un cookie). */
function page_reinitialisation(string $jeton, string $erreur = '', int $statut = 200): never
{
    $lie = $erreur !== '' ? 'erreur-reinitialisation regle-mot-de-passe' : 'regle-mot-de-passe';
    $corps = '<main class="accueil connexion">'
        . entete_accueil(t('Choisissez votre nouveau mot de passe.'))
        . '<form class="carte-connexion" method="post" action="index.php" aria-labelledby="titre-reinitialisation">'
        . '<h2 id="titre-reinitialisation">' . h(t('Nouveau mot de passe')) . '</h2>'
        . '<input type="hidden" name="action" value="reinitialiser">' . jeton_html()
        . '<input type="hidden" name="jeton" value="' . h($jeton) . '">'
        . erreur_html('erreur-reinitialisation', $erreur)
        . '<p class="aide" id="regle-mot-de-passe">' . h(t('{n} caractères au moins.', ['n' => MOT_DE_PASSE_LONGUEUR_MIN])) . '</p>'
        . champ_html('mot-de-passe', 'mot_de_passe', t('Mot de passe'), 'password', '', 'autocomplete="new-password" minlength="' . MOT_DE_PASSE_LONGUEUR_MIN . '" required autofocus', $lie)
        . champ_html('confirmation', 'confirmation', t('Le même, de nouveau'), 'password', '', 'autocomplete="new-password" minlength="' . MOT_DE_PASSE_LONGUEUR_MIN . '" required', $lie)
        . '<div class="actions"><button type="submit" class="primaire">' . h(t('Enregistrer le mot de passe')) . '</button></div>'
        . '</form></main>';
    rendre_page(titre_page(t('Nouveau mot de passe')), $corps, $statut);
}

/** Une page qui ne fait que dire (mail envoye, adresse confirmee, lien expire…), avec ses liens. */
function page_message(string $titre, string $texte, array $liens = [], int $statut = 200, string $formulaire = ''): never
{
    $corps = '<main class="accueil connexion">'
        . entete_accueil('')
        . '<section class="carte-connexion" aria-labelledby="titre-message"><h2 id="titre-message">' . h($titre) . '</h2>'
        . '<p role="status">' . h($texte) . '</p>' . $formulaire . '</section>'
        . liens_html($liens)
        . '</main>';
    rendre_page(titre_page($titre), $corps, $statut);
}

/** Un lien de confirmation expire ou deja employe : le dire, et proposer de renvoyer le mail. */
function page_confirmation_expiree(): never
{
    $formulaire = '<form method="post" action="index.php" class="renvoyer"><input type="hidden" name="action" value="renvoyer">' . jeton_html()
        . champ_html('email', 'email', t('Adresse de courrier'), 'email', '', 'autocomplete="email" required')
        . '<div class="actions"><button type="submit" class="primaire">' . h(t('Renvoyer le mail de confirmation')) . '</button></div></form>';
    page_message(t('Lien expiré'), t('Ce lien de confirmation a expiré ou a déjà servi. Indiquez votre adresse pour en recevoir un nouveau.'), ['index.php' => t('Retour à la connexion')], 410, $formulaire);
}

/** Ce que l'administrateur doit encore faire (data/ absent ou non inscriptible). Personne n'entre. */
function page_probleme(string $phrase): never
{
    $corps = '<main class="accueil connexion">'
        . '<header class="tete"><h1>Éditeur SVG</h1><p>' . h(t('L’installation du site n’est pas terminée.')) . '</p></header>'
        . '<section class="carte-connexion" aria-labelledby="titre-installation"><h2 id="titre-installation">' . h(t('Pour l’administrateur')) . '</h2>'
        . '<p>' . h($phrase) . '</p>'
        . '<p class="aide">' . h(t('Le guide d’installation est dans docs/deploiement-php.md.')) . '</p>'
        . '</section></main>';
    rendre_page('Installation · Éditeur SVG', $corps, 503);
}

/** L'application : le conteneur, son jeton CSRF, le compte et le site en JSON, les avertissements s'il y en a, puis le script. */
function page_application(array $avertissements, array $compte): never
{
    $json = fn(array $x): string => h(json_encode($x, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '{}');
    $corps = avertissements_html($avertissements)
        . '<div id="site" data-csrf="' . h(jeton_csrf()) . '" data-api="api.php" data-assets="assets/" data-adresse="' . (ADRESSE_OUVERTURE ? '1' : '0') . '" data-adresse-http="' . (ADRESSE_HTTP ? '1' : '0') . '"'
        . ' data-compte="' . $json(compte_public($compte)) . '" data-site="' . $json(site_public()) . '">'
        . '<main class="accueil"><p class="message">' . h(t('Chargement de l’éditeur… Si ce message reste affiché, JavaScript est désactivé ou ce navigateur est trop ancien : utilisez une version récente de Chrome, Edge, Firefox ou Safari.')) . '</p></main>'
        . '</div>';
    rendre_page(titre_page(t('Mes projets')), $corps, 200, '<script src="assets/site.js" defer></script>' . "\n");
}
