// Monter l'application dans un conteneur. La page autonome l'appelle ; un hote qui ne veut que
// l'editeur importe `EditeurSvg` directement.

import { createRoot } from 'react-dom/client';
import { Application } from './Application.js';

export function demarrer(conteneur: HTMLElement): void {
  createRoot(conteneur).render(<Application />);
}
