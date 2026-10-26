// Le point d'entree du site PHP (ADR-0030) : index.php sert la page avec le jeton CSRF de la session, et ce module branche les
// annexes de donnees, les polices et le traceur sur le serveur avant de monter l'ecran « Projets ». La page autonome n'appelle jamais
// ceci : ses annexes restent des scripts voisins et ses polices viennent de leurs serveurs.

import { createRoot } from 'react-dom/client';
import { definirOuvertureAdresse } from '../io/adresse.js';
import { definirBaseAnnexes, definirSourceDonnees } from '../io/annexes.js';
import { sonderNavigateur } from '../io/capacites.js';
import { definirServeurPolices } from '../io/policesEnLigne.js';
import { creerServeur, lireCompte, lireSite } from '../io/serveur.js';
import { manquantes } from '../util/capacites.js';
import { t } from '../util/i18n.js';
import { PageIncompatible } from '../zones/Incompatible.js';
import { DOCUMENTATIONS_LIVREES, definirDocumentation } from '../zones/documentation.js';
import { Site } from './Site.js';

/** Un attribut JSON de la page, lu sans lever : null s'il manque ou ne se lit pas. */
function jsonDe(attribut: string | undefined): unknown {
  if (!attribut) return null;
  try { return JSON.parse(attribut) as unknown; } catch { return null; }
}

export function demarrerSite(conteneur: HTMLElement): void {
  const absentes = manquantes(sonderNavigateur(), 'demarrage');
  const racine = createRoot(conteneur);
  if (absentes.length) { racine.render(<PageIncompatible manquantes={absentes} />); return; }
  const csrf = conteneur.dataset['csrf'] ?? '';
  // La personne connectee et le site (ADR-0041) : la page les donne en JSON, valides sans lever. Un attribut illisible ne bloque
  // rien : l'application s'ouvre sans le menu du profil, avec la deconnexion d'avant, et le dit.
  const compte = lireCompte(jsonDe(conteneur.dataset['compte']));
  const site = lireSite(jsonDe(conteneur.dataset['site']));
  const avertissement = compte ? undefined : t('La page n’a pas pu dire qui est connecté : le menu du profil n’est pas disponible. Rechargez la page ; si cela persiste, reconnectez-vous.');
  // La langue du compte : preparerLangue(compte.langue), pose a l'integration (ADR-0042). Les textes poses ci-dessous chez les
  // modules d'io sont des accesseurs : ils se lisent dans la langue du moment ou on les montre, quel que soit l'ordre d'ici.
  const serveur = creerServeur({ api: conteneur.dataset['api'] ?? 'api.php', csrf });
  // Le traceur (du code) reste un script, servi avec la page sous assets/ ; les donnees viennent de data/json par l'API.
  definirBaseAnnexes(conteneur.dataset['assets'] ?? 'assets/');
  definirSourceDonnees(serveur.donnees);
  // Une police du catalogue se demande au site, qui la sert de data/font ou la telecharge et la verifie la premiere fois.
  definirServeurPolices({ adresse: serveur.adressePolice, get nom() { return t('le site'); } });
  // Ouvrir depuis une adresse (ADR-0036) : le serveur va chercher le fichier, avec ses protections ; le navigateur ne contacte que
  // le site. L'administrateur peut l'eteindre (`ADRESSE_OUVERTURE`) et permettre `http://` (`ADRESSE_HTTP`), que index.php annonce.
  definirOuvertureAdresse(conteneur.dataset['adresse'] === '0' ? null : {
    serveur: serveur.telechargerAdresse, http: conteneur.dataset['adresseHttp'] === '1', get qui() { return t('Le site va chercher le fichier quand vous choisissez « Ouvrir ».'); }
  });
  // Les documentations sont servies avec la page, dans public/aide/ : le menu Aide de l'editeur les ouvre.
  definirDocumentation(DOCUMENTATIONS_LIVREES);
  racine.render(<Site serveur={serveur} csrf={csrf} compte={compte} site={site} {...(avertissement ? { avertissement } : {})} />);
}
