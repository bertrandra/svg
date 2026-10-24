// Le stockage de l'editeur, par un contexte : la page ou l'hote le donne, l'editeur ne le cherche
// jamais lui-meme. Sans fournisseur (ou avec null), il n'y a pas de stockage et tout marche sans.

import { createContext, useContext, type ReactNode } from 'react';
import type { Stockage } from '../io/stockage.js';

const ContexteStockage = createContext<Stockage | null>(null);

export function FournisseurStockage({ stockage, children }: { stockage: Stockage | null; children: ReactNode }) {
  return <ContexteStockage.Provider value={stockage}>{children}</ContexteStockage.Provider>;
}

/** Le stockage donne a cet editeur (ou a cette page), ou null s'il n'y en a pas. */
export const useStockage = (): Stockage | null => useContext(ContexteStockage);
