// Le point d'entree de la page autonome : tout est dans src/zones (React) et en dessous.
import { demarrer } from '../../src/zones/demarrer.js';

const conteneur = document.getElementById('editeur');
if (conteneur) demarrer(conteneur);
