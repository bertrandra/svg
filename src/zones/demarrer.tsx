// Monter l'application dans un conteneur. La page autonome l'appelle ; un hote qui ne veut que
// l'editeur importe `EditeurSvg` directement.

import { createRoot } from 'react-dom/client';
import { sonderNavigateur } from '../io/capacites.js';
import { manquantes } from '../util/capacites.js';
import { Application } from './Application.js';
import { PageIncompatible } from './Incompatible.js';

export function demarrer(conteneur: HTMLElement): void {
  // Un navigateur qui manque d'une API de base le dit en francais, au lieu de laisser une page blanche.
  const absentes = manquantes(sonderNavigateur(), 'demarrage');
  createRoot(conteneur).render(absentes.length ? <PageIncompatible manquantes={absentes} /> : <Application />);
}
