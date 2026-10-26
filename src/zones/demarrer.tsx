// Monter l'application dans un conteneur. La page autonome l'appelle ; un hote qui ne veut que
// l'editeur importe `EditeurSvg` directement.

import { createRoot } from 'react-dom/client';
import { definirOuvertureAdresse } from '../io/adresse.js';
import { sonderNavigateur } from '../io/capacites.js';
import { preparerLangue } from '../io/langue.js';
import { stockageNavigateur } from '../io/stockage.js';
import { manquantes } from '../util/capacites.js';
import { Application } from './Application.js';
import { DOCUMENTATIONS_LIVREES, definirDocumentation } from './documentation.js';
import { PageIncompatible } from './Incompatible.js';
import { definirChangementLangue, garderLangue, langueRetenue } from './langue.js';
import { t } from '../util/i18n.js';

export function demarrer(conteneur: HTMLElement): void {
  // Un navigateur qui manque d'une API de base le dit en francais, au lieu de laisser une page blanche.
  const absentes = manquantes(sonderNavigateur(), 'demarrage');
  if (absentes.length) { createRoot(conteneur).render(<PageIncompatible manquantes={absentes} />); return; }
  // Ouvrir depuis une adresse (ADR-0036) : la page autonome demande le fichier elle-meme, au seul geste de la personne. Un hote
  // qui embarque l'editeur ne passe pas ici : chez lui, aucun champ d'adresse.
  // Les documentations (guide complet, mode Cricut) sont livrees a cote de la page, dans aide/ : le menu Aide les ouvre.
  definirDocumentation(DOCUMENTATIONS_LIVREES);
  // La langue (ADR-0042) : le reglage garde dans ce navigateur, le francais sans lui. Le dictionnaire anglais se charge avant le
  // premier rendu, et changer de langue ecrit le reglage puis recharge la page (le brouillon survit au rechargement).
  const stockage = stockageNavigateur();
  definirChangementLangue(l => { garderLangue(stockage, l); location.reload(); });
  void preparerLangue(langueRetenue(stockage)).then(() => {
    // Apres la langue : la phrase du champ d'adresse se traduit a ce moment-la, et la page ne la montre qu'une fois rendue.
    definirOuvertureAdresse({ qui: t('Votre navigateur va chercher le fichier quand vous choisissez « Ouvrir » ; rien ne part avant.') });
    createRoot(conteneur).render(<Application />);
  });
}
