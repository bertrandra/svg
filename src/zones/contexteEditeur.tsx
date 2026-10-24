// Les trois contextes de l'editeur (voir typesEditeur.ts) et leurs crochets. Un panneau appelle ce
// qu'il lit et rien d'autre : un panneau qui ne prend que `useActions()` ne se redessine jamais
// parce que le dessin ou l'outil a change, puisque les actions ne changent jamais d'identite.

import { createContext, useContext, type ReactNode } from 'react';
import type { ActionsEditeur, EtatInterface, ModeleDessin } from './typesEditeur.js';

const ContexteDessin = createContext<ModeleDessin | null>(null);
const ContexteActions = createContext<ActionsEditeur | null>(null);
const ContexteInterface = createContext<EtatInterface | null>(null);

/** Hors d'un editeur, un crochet ne peut rien rendre de sense : on le dit plutot que de rendre `undefined`. */
function exiger<T>(valeur: T | null, nom: string): T {
  if (valeur === null) throw new Error(nom + ' : appelé hors d’un éditeur (FournisseurEditeur).');
  return valeur;
}

/** Le dessin, la selection, le nuancier, les versions, le presse-papiers. Change a chaque modification. */
export const useDessin = (): ModeleDessin => exiger(useContext(ContexteDessin), 'useDessin');
/** Les verbes. Ne change jamais d'identite pendant la vie d'un editeur. */
export const useActions = (): ActionsEditeur => exiger(useContext(ContexteActions), 'useActions');
/** L'outil, la vue, la grille, les aimants, le tiroir. Change avec l'outil et la vue, pas avec le dessin. */
export const useInterface = (): EtatInterface => exiger(useContext(ContexteInterface), 'useInterface');

export function FournisseurEditeur({ dessin, actions, etat, children }: { dessin: ModeleDessin; actions: ActionsEditeur; etat: EtatInterface; children: ReactNode }) {
  return (
    <ContexteActions.Provider value={actions}>
      <ContexteDessin.Provider value={dessin}>
        <ContexteInterface.Provider value={etat}>{children}</ContexteInterface.Provider>
      </ContexteDessin.Provider>
    </ContexteActions.Provider>
  );
}
