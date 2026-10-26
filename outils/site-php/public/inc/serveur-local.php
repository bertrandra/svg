<?php
// Le routeur du serveur integre de PHP, pour essayer le site sur sa machine (docs/deploiement-php.md, « Essayer en local ») :
//
//   php -S 127.0.0.1:8080 -t public public/inc/serveur-local.php
//
// `php -S` n'applique pas les .htaccess : ce routeur refuse a leur place data/ (mot de passe, projets, sessions), inc/, les reglages
// et les fichiers caches, puis laisse le serveur integre servir le reste. Il ne fait rien ailleurs que sous `php -S` (et inc/ est
// refuse au Web par son .htaccess) : en production, ce sont les .htaccess ou la configuration du serveur qui protegent ces chemins.

declare(strict_types=1);

if (PHP_SAPI !== 'cli-server') {
    http_response_code(404);
    exit;
}

// Le chemin tel que le serveur le resoudra : decode, sans distinction de casse (un systeme de fichiers qui l'ignore servirait DATA/).
$chemin = rawurldecode((string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH));
if (preg_match('#(^|/)(data|inc)(/|$)|(^|/)\.|^/config(\.local)?\.php$#i', str_replace('\\', '/', $chemin)) === 1) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    exit;
}
return false;
