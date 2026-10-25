// Monter l'application dans un conteneur. La page autonome l'appelle ; un hote qui ne veut que
// l'editeur importe `EditeurSvg` directement.

import { createRoot } from 'react-dom/client';
import { definirOuvertureAdresse } from '../io/adresse.js';
import { sonderNavigateur } from '../io/capacites.js';
import { manquantes } from '../util/capacites.js';
import { Application } from './Application.js';
import { PageIncompatible } from './Incompatible.js';

export function demarrer(conteneur: HTMLElement): void {
  // Un navigateur qui manque d'une API de base le dit en francais, au lieu de laisser une page blanche.
  const absentes = manquantes(sonderNavigateur(), 'demarrage');
  // Ouvrir depuis une adresse (ADR-0036) : la page autonome demande le fichier elle-meme, au seul geste de la personne. Un hote
  // qui embarque l'editeur ne passe pas ici : chez lui, aucun champ d'adresse.
  definirOuvertureAdresse({ qui: 'Votre navigateur va chercher le fichier quand vous choisissez « Ouvrir » ; rien ne part avant.' });
  createRoot(conteneur).render(absentes.length ? <PageIncompatible manquantes={absentes} /> : <Application />);
}
