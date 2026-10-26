// Le point d'entree du site PHP (ADR-0030) : tout est dans src/site et en dessous ; index.php pose le conteneur et son jeton.
import { demarrerSite } from '../../src/site/demarrer.js';

const conteneur = document.getElementById('site');
if (conteneur) demarrerSite(conteneur);
