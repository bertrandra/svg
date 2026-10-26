<?php
// Un faux serveur SMTP pour les tests du client de courrier (inc/courrier.php, ADR-0041 §7) : lance dans son processus par
// unitaires.php, il ecoute sur un port libre de la boucle locale (ecrit dans le fichier donne), accepte UNE connexion, joue le
// dialogue selon le mode, note chaque commande recue dans le journal (JSON, une ligne par commande ; jamais le contenu d'AUTH en
// clair : il est note tel que recu, en base64, par le test qui le decode), puis s'arrete.
//
//   php faux-smtp.php <fichier du port> <journal> <mode> [certificat PEM]
//
//   modes : clair            EHLO, AUTH PLAIN et LOGIN proposes, MAIL, RCPT, DATA acceptes
//           starttls-refuse  STARTTLS repondu 454 : le client doit s'arreter sans rien envoyer
//           starttls-ok      STARTTLS accepte (220), TLS serveur avec le certificat, puis le dialogue en clair chiffre
//           auth-echec       AUTH repondu 535
//           rcpt-refuse      RCPT TO repondu 550

declare(strict_types=1);

[, $fichierPort, $journal, $mode] = $argv + [null, null, null, 'clair'];
$cert = $argv[4] ?? null;

$contexte = stream_context_create($cert !== null ? ['ssl' => ['local_cert' => $cert, 'verify_peer' => false, 'allow_self_signed' => true]] : []);
$serveur = stream_socket_server('tcp://127.0.0.1:0', $no, $err, STREAM_SERVER_BIND | STREAM_SERVER_LISTEN, $contexte);
if ($serveur === false) {
    fwrite(STDERR, "faux-smtp : $err\n");
    exit(1);
}
$nom = (string) stream_socket_get_name($serveur, false);
file_put_contents($fichierPort, substr($nom, strrpos($nom, ':') + 1));

$noter = function (string $commande) use ($journal): void {
    file_put_contents($journal, json_encode($commande) . "\n", FILE_APPEND);
};

$c = @stream_socket_accept($serveur, 20);
if ($c === false) {
    exit(1);
}
stream_set_timeout($c, 10);
$ecrire = fn(string $l) => fwrite($c, $l . "\r\n");
$ecrire('220 faux.essai ESMTP');
$tls = false;
$enData = false;
$donnees = '';
while (($ligne = fgets($c, 65536)) !== false) {
    $ligne = rtrim($ligne, "\r\n");
    if ($enData) {
        if ($ligne === '.') {
            $enData = false;
            $noter('DATA:' . base64_encode($donnees));
            $ecrire('250 Queued');
        } else {
            $donnees .= $ligne . "\r\n";
        }
        continue;
    }
    $noter($ligne);
    $mot = strtoupper(strtok($ligne, ' ') ?: '');
    if ($mot === 'EHLO' || $mot === 'HELO') {
        $ecrire('250-faux.essai');
        if ($mode !== 'starttls-ok' || $tls) {
            $ecrire('250-AUTH PLAIN LOGIN');
        } else {
            $ecrire('250-STARTTLS');
        }
        if ($mode === 'starttls-refuse') {
            $ecrire('250-STARTTLS');
        }
        $ecrire('250 8BITMIME');
    } elseif ($mot === 'STARTTLS') {
        if ($mode === 'starttls-ok' && $cert !== null) {
            $ecrire('220 Go ahead');
            if (@stream_socket_enable_crypto($c, true, STREAM_CRYPTO_METHOD_TLS_SERVER) !== true) {
                $noter('TLS-ECHEC');
                break;
            }
            $tls = true;
        } else {
            $ecrire('454 TLS not available');
        }
    } elseif ($mot === 'AUTH') {
        if ($mode === 'auth-echec') {
            $ecrire('535 Authentication failed');
        } elseif (stripos($ligne, 'AUTH LOGIN') === 0) {
            $ecrire('334 VXNlcm5hbWU6');
            $u = rtrim((string) fgets($c, 4096), "\r\n");
            $noter('LOGIN-UTILISATEUR:' . $u);
            $ecrire('334 UGFzc3dvcmQ6');
            $p = rtrim((string) fgets($c, 4096), "\r\n");
            $noter('LOGIN-MOT-DE-PASSE:' . $p);
            $ecrire('235 Authenticated');
        } else {
            $ecrire('235 Authenticated');
        }
    } elseif ($mot === 'MAIL') {
        $ecrire('250 OK');
    } elseif ($mot === 'RCPT') {
        $ecrire($mode === 'rcpt-refuse' ? '550 No such user' : '250 OK');
    } elseif ($mot === 'DATA') {
        $enData = true;
        $donnees = '';
        $ecrire('354 End data with <CR><LF>.<CR><LF>');
    } elseif ($mot === 'QUIT') {
        $ecrire('221 Bye');
        break;
    } else {
        $ecrire('500 Unknown');
    }
}
fclose($c);
