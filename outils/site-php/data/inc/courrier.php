<?php
// Les mails du site (ADR-0041 §7 et §8) : texte brut UTF-8, sujet encode, liens en clair, dans la langue du destinataire. Trois
// modes, regles dans config.json (courrier.mode) : `mail` (la fonction de l'hebergeur), `smtp` (le client minimal ci-dessous :
// connexion, STARTTLS ou SSL implicite, AUTH PLAIN ou LOGIN, delais bornes, rien d'autre), `fichier` (les tests : chaque message
// ecrit dans data/journal/courrier/<horodatage>.eml, rien ne part). Aucun secret n'entre dans un journal : ni mot de passe SMTP, ni
// lien d'un mail.

declare(strict_types=1);

defined('SVG_SITE') || exit;

/** Un en-tete en UTF-8 (sujet, nom d'expediteur), encode en base64 quand il sort de l'ASCII. */
function entete_encode(string $texte): string
{
    $propre = preg_replace('/[\r\n\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/', ' ', $texte) ?? '';
    return preg_match('/^[\x20-\x7e]*$/', $propre) === 1 ? $propre : '=?UTF-8?B?' . base64_encode($propre) . '?=';
}

/** Une adresse de courrier sure dans un en-tete : la forme deja validee, sans retour a la ligne possible. */
function adresse_sure(string $email): string
{
    return preg_replace('/[\s<>,;"\\\\]/', '', $email) ?? '';
}

/** La source du message (en-tetes puis corps), prete pour SMTP ou pour un fichier. Rend ['entetes' => [...], 'corps' => texte]. */
function composer_message(string $a, string $sujet, string $corps, string $de, string $nomDe): array
{
    $corpsPropre = str_replace(["\r\n", "\r"], "\n", $corps);
    $entetes = [
        'Date: ' . gmdate('D, d M Y H:i:s') . ' +0000',
        'From: ' . ($nomDe === '' ? adresse_sure($de) : entete_encode($nomDe) . ' <' . adresse_sure($de) . '>'),
        'To: ' . adresse_sure($a),
        'Subject: ' . entete_encode($sujet),
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: quoted-printable',
        'Auto-Submitted: auto-generated',
        'X-Mailer: editeur-svg-site',
    ];
    return ['entetes' => $entetes, 'corps' => quoted_printable_encode($corpsPropre)];
}

/**
 * Envoie un mail selon le mode regle. Rend null quand il est parti (ou ecrit, en mode fichier), sinon la phrase de l'erreur (pour
 * l'administrateur : elle ne porte aucun secret).
 */
function envoyer_courrier(string $a, string $sujet, string $corps): ?string
{
    if (!email_valide($a)) {
        return t('L’adresse du destinataire n’est pas valide.');
    }
    $de = (string) reglage('courrier.expediteur');
    $mode = (string) reglage('courrier.mode');
    if ($de === '' && $mode !== 'fichier') {
        return t('Aucune adresse d’expédition n’est réglée (Réglages du site).');
    }
    $m = composer_message($a, $sujet, $corps, $de === '' ? 'no-reply@localhost' : $de, (string) reglage('courrier.nom'));
    $erreur = match ($mode) {
        'fichier' => courrier_fichier($m),
        'smtp' => smtp_envoyer(reglage('courrier.smtp'), $de, $a, implode("\r\n", $m['entetes']) . "\r\n\r\n" . $m['corps']),
        default => courrier_mail($a, $sujet, $m, $de),
    };
    journaliser('courrier', 'mode=' . $mode . ' resultat=' . ($erreur === null ? 'ok' : 'echec') . ' destinataire=' . substr(hash('sha256', email_normalise($a)), 0, 12));
    if ($erreur !== null) {
        error_log('courrier : ' . $erreur);
    }
    return $erreur;
}

/** Le mode des tests : le message entier dans un fichier .eml, rien ne part. */
function courrier_fichier(array $m): ?string
{
    $d = donnees('journal/courrier');
    if (!is_dir($d) && !@mkdir($d, 0750, true) && !is_dir($d)) {
        return 'le dossier data/journal/courrier ne se cree pas';
    }
    // Horodate a la microseconde : deux messages de la meme seconde gardent leur ordre.
    $t = microtime(true);
    $nom = $d . '/' . gmdate('Ymd\THis', (int) $t) . sprintf('.%06dZ', (int) round(($t - floor($t)) * 1e6)) . '-' . bin2hex(random_bytes(4)) . '.eml';
    ecrire_atomique($nom, implode("\r\n", $m['entetes']) . "\r\n\r\n" . $m['corps'] . "\r\n", 0640);
    return null;
}

/** La fonction mail() de PHP (sendmail de l'hebergeur), avec l'expediteur d'enveloppe quand c'est permis. */
function courrier_mail(string $a, string $sujet, array $m, string $de): ?string
{
    $entetes = array_values(array_filter($m['entetes'], fn(string $e): bool => !str_starts_with($e, 'To: ') && !str_starts_with($e, 'Subject: ')));
    $ok = @mail(adresse_sure($a), entete_encode($sujet), $m['corps'], implode("\r\n", $entetes), '-f' . adresse_sure($de));
    return $ok ? null : t('La fonction mail() du serveur a refusé le message : vérifiez le courrier de l’hébergement, ou réglez un serveur SMTP.');
}

/** Lit une reponse SMTP (plusieurs lignes possibles) : rend [code, texte] ; code 0 si la connexion ne repond plus. */
function smtp_lire($s): array
{
    $texte = '';
    while (true) {
        $ligne = fgets($s, 2048);
        if ($ligne === false) {
            return [0, $texte];
        }
        $texte .= $ligne;
        if (preg_match('/^(\d{3})([ -])/', $ligne, $m) === 1 && $m[2] === ' ') {
            return [(int) $m[1], $texte];
        }
        if (strlen($texte) > 32768) {
            return [0, $texte];
        }
    }
}

/** Envoie une commande et attend un des codes attendus ; rend null, ou la phrase de l'erreur (la commande y est nommee, jamais un secret). */
function smtp_commande($s, string $commande, array $attendus, string $nom): ?string
{
    fwrite($s, $commande . "\r\n");
    [$code, $texte] = smtp_lire($s);
    if (!in_array($code, $attendus, true)) {
        return 'SMTP ' . $nom . ' : ' . ($code === 0 ? 'pas de réponse' : trim(preg_replace('/\s+/', ' ', $texte) ?? '')) ;
    }
    return null;
}

/**
 * Le client SMTP minimal : connexion (SSL implicite si `securite` = ssl), EHLO, STARTTLS si demande (refuse par le serveur : on
 * s'arrete, rien ne part en clair), AUTH PLAIN ou LOGIN si un utilisateur est regle, MAIL FROM, RCPT TO, DATA, QUIT. Delais bornes
 * par COURRIER_DELAI. Rend null quand le serveur a accepte le message, sinon la phrase de l'erreur.
 */
function smtp_envoyer(array $smtp, string $de, string $a, string $message): ?string
{
    $hote = (string) ($smtp['hote'] ?? '');
    if ($hote === '') {
        return t('Aucun serveur SMTP n’est réglé (Réglages du site).');
    }
    $port = (int) ($smtp['port'] ?? 587);
    $securite = (string) ($smtp['securite'] ?? 'starttls');
    $contexte = stream_context_create(['ssl' => [
        'verify_peer' => COURRIER_TLS_VERIFIER, 'verify_peer_name' => COURRIER_TLS_VERIFIER, 'allow_self_signed' => !COURRIER_TLS_VERIFIER,
        'peer_name' => $hote, 'SNI_enabled' => true,
    ]]);
    $s = @stream_socket_client(($securite === 'ssl' ? 'ssl://' : 'tcp://') . $hote . ':' . $port, $no, $err, COURRIER_DELAI, STREAM_CLIENT_CONNECT, $contexte);
    if ($s === false) {
        return 'SMTP connexion : ' . $hote . ':' . $port . ' ne répond pas (' . $err . ')';
    }
    stream_set_timeout($s, COURRIER_DELAI);
    try {
        [$code] = smtp_lire($s);
        if ($code !== 220) {
            return 'SMTP accueil : code ' . $code;
        }
        $moi = preg_match('/^[A-Za-z0-9.\-]+$/', (string) ($_SERVER['SERVER_NAME'] ?? '')) === 1 ? $_SERVER['SERVER_NAME'] : 'localhost';
        $ehlo = function () use ($s, $moi): array|string {
            fwrite($s, 'EHLO ' . $moi . "\r\n");
            [$code, $texte] = smtp_lire($s);
            return $code === 250 ? explode("\n", $texte) : 'SMTP EHLO : ' . ($code === 0 ? 'pas de réponse' : 'code ' . $code);
        };
        $capacites = $ehlo();
        if (is_string($capacites)) {
            return $capacites;
        }
        if ($securite === 'starttls') {
            $e = smtp_commande($s, 'STARTTLS', [220], 'STARTTLS');
            if ($e !== null) {
                return $e . ' — ' . t('le serveur refuse STARTTLS ; rien n’est envoyé en clair');
            }
            $methode = STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | (defined('STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT') ? STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT : 0);
            if (@stream_socket_enable_crypto($s, true, $methode) !== true) {
                return 'SMTP STARTTLS : ' . t('la négociation TLS a échoué (certificat ou protocole)');
            }
            $capacites = $ehlo();
            if (is_string($capacites)) {
                return $capacites;
            }
        }
        $utilisateur = (string) ($smtp['utilisateur'] ?? '');
        if ($utilisateur !== '') {
            $auth = '';
            foreach ($capacites as $ligne) {
                if (preg_match('/^250[ -]AUTH\s+(.*)$/i', trim($ligne), $m) === 1) {
                    $auth = strtoupper($m[1]);
                }
            }
            $motDePasse = (string) ($smtp['motDePasse'] ?? '');
            if ($auth === '' || str_contains($auth, 'PLAIN')) {
                $e = smtp_commande($s, 'AUTH PLAIN ' . base64_encode("\0" . $utilisateur . "\0" . $motDePasse), [235], 'AUTH PLAIN');
            } elseif (str_contains($auth, 'LOGIN')) {
                $e = smtp_commande($s, 'AUTH LOGIN', [334], 'AUTH LOGIN')
                    ?? smtp_commande($s, base64_encode($utilisateur), [334], 'AUTH LOGIN (utilisateur)')
                    ?? smtp_commande($s, base64_encode($motDePasse), [235], 'AUTH LOGIN (mot de passe)');
            } else {
                $e = 'SMTP AUTH : ' . t('le serveur ne propose ni PLAIN ni LOGIN');
            }
            if ($e !== null) {
                return $e;
            }
        }
        $e = smtp_commande($s, 'MAIL FROM:<' . adresse_sure($de) . '>', [250], 'MAIL FROM')
            ?? smtp_commande($s, 'RCPT TO:<' . adresse_sure($a) . '>', [250, 251], 'RCPT TO')
            ?? smtp_commande($s, 'DATA', [354], 'DATA');
        if ($e !== null) {
            return $e;
        }
        // Le point seul termine le message : une ligne qui commence par un point en recoit un second (RFC 5321, 4.5.2).
        $donnees = preg_replace('/^\./m', '..', str_replace(["\r\n", "\n"], ["\n", "\r\n"], $message)) ?? $message;
        $e = smtp_commande($s, $donnees . "\r\n.", [250], 'message');
        if ($e !== null) {
            return $e;
        }
        // La reponse au QUIT se lit avant de fermer : une fermeture brusque d'un flux TLS peut perdre la commande.
        fwrite($s, "QUIT\r\n");
        smtp_lire($s);
        return null;
    } finally {
        fclose($s);
    }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Les mails du circuit (ADR-0041 §4), chacun dans la langue de son destinataire.
// ---------------------------------------------------------------------------------------------------------------------------------

function signature_mail(string $langue): string
{
    return "\n\n-- \n" . reglage('site.nom') . ' — ' . adresse_site();
}

/** Le mail de confirmation d'adresse, avec son lien (48 h). */
function mail_confirmation(array $compte): ?string
{
    $l = $compte['langue'];
    $jeton = creer_jeton('confirmation', $compte['id'], JETON_CONFIRMATION_DUREE);
    $lien = adresse_site() . 'index.php?confirmer=' . $jeton;
    $corps = t('Bonjour {nom},', ['nom' => $compte['nom']], $l) . "\n\n"
        . t('Pour confirmer votre adresse et terminer votre inscription sur {site}, ouvrez ce lien (valable 48 heures) :', ['site' => reglage('site.nom')], $l) . "\n\n"
        . $lien . "\n\n"
        . t('Un administrateur approuvera ensuite votre compte ; vous recevrez un message quand il sera ouvert.', [], $l) . "\n\n"
        . t('Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.', [], $l)
        . signature_mail($l);
    return envoyer_courrier($compte['email'], t('Confirmez votre adresse — {site}', ['site' => reglage('site.nom')], $l), $corps);
}

/** Le mail a chaque administrateur actif : une nouvelle demande attend. */
function mails_nouvelle_demande(array $compte): void
{
    foreach (admins_actifs() as $admin) {
        $l = $admin['langue'];
        $corps = t('Bonjour {nom},', ['nom' => $admin['nom']], $l) . "\n\n"
            . t('Nouvelle demande : {personne} ({email}) a confirmé son adresse et attend votre approbation.', ['personne' => $compte['nom'], 'email' => $compte['email']], $l) . "\n\n"
            . t('Approuvez-la ou refusez-la dans l’écran Comptes :', [], $l) . "\n\n" . adresse_site()
            . signature_mail($l);
        envoyer_courrier($admin['email'], t('Nouvelle demande de compte : {personne}', ['personne' => $compte['nom']], $l), $corps);
    }
}

/** Le mail a la personne : son compte est ouvert. */
function mail_approbation(array $compte): ?string
{
    $l = $compte['langue'];
    $corps = t('Bonjour {nom},', ['nom' => $compte['nom']], $l) . "\n\n"
        . t('Votre compte sur {site} est ouvert : connectez-vous avec votre adresse et votre mot de passe.', ['site' => reglage('site.nom')], $l) . "\n\n" . adresse_site()
        . signature_mail($l);
    return envoyer_courrier($compte['email'], t('Votre compte est ouvert — {site}', ['site' => reglage('site.nom')], $l), $corps);
}

/** Le mail a la personne : sa demande est refusee, avec la raison si l'administrateur en a donne une. */
function mail_refus(array $compte, string $raison): ?string
{
    $l = $compte['langue'];
    $corps = t('Bonjour {nom},', ['nom' => $compte['nom']], $l) . "\n\n"
        . t('Votre demande de compte sur {site} n’a pas été acceptée.', ['site' => reglage('site.nom')], $l)
        . ($raison !== '' ? "\n\n" . t('Raison donnée : {raison}', ['raison' => $raison], $l) : '')
        . signature_mail($l);
    return envoyer_courrier($compte['email'], t('Votre demande de compte — {site}', ['site' => reglage('site.nom')], $l), $corps);
}

/** Le mail de reinitialisation du mot de passe, avec son lien (1 h, usage unique). */
function mail_reinitialisation(array $compte): ?string
{
    $l = $compte['langue'];
    $jeton = creer_jeton('reinitialisation', $compte['id'], JETON_REINITIALISATION_DUREE);
    $lien = adresse_site() . 'index.php?reinitialiser=' . $jeton;
    $corps = t('Bonjour {nom},', ['nom' => $compte['nom']], $l) . "\n\n"
        . t('Pour choisir un nouveau mot de passe sur {site}, ouvrez ce lien (valable 1 heure, une seule fois) :', ['site' => reglage('site.nom')], $l) . "\n\n"
        . $lien . "\n\n"
        . t('Si vous n’avez rien demandé, ignorez ce message : votre mot de passe ne change pas.', [], $l)
        . signature_mail($l);
    return envoyer_courrier($compte['email'], t('Réinitialiser votre mot de passe — {site}', ['site' => reglage('site.nom')], $l), $corps);
}

/** Le mail d'essai de l'ecran « Reglages du site ». */
function mail_essai(string $a, string $langue): ?string
{
    $corps = t('Ce message d’essai confirme que {site} peut envoyer du courrier.', ['site' => reglage('site.nom')], $langue) . signature_mail($langue);
    return envoyer_courrier($a, t('Message d’essai — {site}', ['site' => reglage('site.nom')], $langue), $corps);
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Les mails du partage (ADR-0043), dans la langue du destinataire.
// ---------------------------------------------------------------------------------------------------------------------------------

/** Le mail a la personne qui recoit une copie : elle est deja dans ses projets. */
function mail_copie(array $destinataire, array $expediteur, string $projet): ?string
{
    $l = $destinataire['langue'];
    $corps = t('Bonjour {nom},', ['nom' => $destinataire['nom']], $l) . "\n\n"
        . t('{personne} vous a envoyé une copie du projet « {projet} ». Elle est dans vos projets sur {site} : elle vous appartient, vous pouvez la modifier sans rien changer à l’original.', ['personne' => $expediteur['nom'], 'projet' => $projet, 'site' => reglage('site.nom')], $l) . "\n\n" . adresse_site()
        . signature_mail($l);
    return envoyer_courrier($destinataire['email'], t('{personne} vous envoie « {projet} » — {site}', ['personne' => $expediteur['nom'], 'projet' => $projet, 'site' => reglage('site.nom')], $l), $corps);
}

/** Le mail a la personne avec qui un projet est partage en lecture. */
function mail_partage(array $destinataire, array $proprietaire, string $projet): ?string
{
    $l = $destinataire['langue'];
    $corps = t('Bonjour {nom},', ['nom' => $destinataire['nom']], $l) . "\n\n"
        . t('{personne} partage avec vous le projet « {projet} », en lecture. Vous le trouverez sur {site}, sous « Partagés avec moi » : vous pouvez l’ouvrir, le télécharger ou en garder une copie dans vos projets.', ['personne' => $proprietaire['nom'], 'projet' => $projet, 'site' => reglage('site.nom')], $l) . "\n\n" . adresse_site()
        . signature_mail($l);
    return envoyer_courrier($destinataire['email'], t('{personne} partage « {projet} » avec vous — {site}', ['personne' => $proprietaire['nom'], 'projet' => $projet, 'site' => reglage('site.nom')], $l), $corps);
}
