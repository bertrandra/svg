// L'etat du texte vivant dans l'interface (ADR-0022) : la saisie en place ouverte (sur quelle forme), le mode de
// vectorisation choisi, et les fontes chargees. Un contexte a part des trois de l'editeur (ADR-0010) : il ne change que
// quand on tape ou qu'on choisit, et seuls les panneaux du texte le lisent. Rien de tout cela n'entre dans l'historique.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { policeDeposee, retenirDeposee, toutesLesPolices, type Police } from '../io/polices.js';
import type { ModeVectorisation } from '../engine/texte/vectoriser.js';

export interface EtatTexte {
  /** La forme dont le texte se saisit en place sur la toile, ou null. */
  readonly saisie: string | null;
  readonly ouvrirSaisie: (id: string) => void;
  readonly fermerSaisie: () => void;
  /** Le mode de vectorisation choisi dans la session ; null : celui du contexte (souder en decoupe Cricut, sinon lettres separees). */
  readonly mode: ModeVectorisation | null;
  readonly poserMode: (m: ModeVectorisation) => void;
  /** Les fontes livrees et deposees, ou null tant qu'elles se chargent. */
  readonly polices: readonly Police[] | null;
  readonly erreurPolices: string;
  /** Lit une fonte deposee et la retient pour la session ; rend son identifiant, ou dit pourquoi elle ne se lit pas. */
  readonly deposer: (f: File) => Promise<{ id: string } | { erreur: string }>;
}

const Contexte = createContext<EtatTexte | null>(null);

export function FournisseurTexte({ children }: { children: ReactNode }) {
  const [saisie, poserSaisie] = useState<string | null>(null);
  const [mode, poserMode] = useState<ModeVectorisation | null>(null);
  const [polices, poserPolices] = useState<readonly Police[] | null>(null);
  const [erreurPolices, poserErreur] = useState('');
  const [demandees, demander] = useState(false);
  // Les fontes ne se chargent qu'au premier besoin (polices.js pese plusieurs centaines de Ko) : un panneau du texte le demande.
  useEffect(() => {
    if (!demandees) return;
    let vivant = true;
    toutesLesPolices().then(p => { if (vivant) poserPolices(p); }).catch((e: unknown) => { if (vivant) { poserPolices([]); poserErreur(e instanceof Error ? e.message : String(e)); } });
    return () => { vivant = false; };
  }, [demandees]);
  const deposer = useCallback(async (f: File) => {
    const r = await policeDeposee(f);
    if ('erreur' in r) return r;
    retenirDeposee(r);
    poserPolices(await toutesLesPolices());
    return { id: r.id };
  }, []);
  const valeur = useMemo<EtatTexte & { demander: () => void }>(() => ({
    saisie, ouvrirSaisie: id => { demander(true); poserSaisie(id); }, fermerSaisie: () => poserSaisie(null),
    mode, poserMode, polices, erreurPolices, deposer, demander: () => demander(true)
  }), [saisie, mode, polices, erreurPolices, deposer]);
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

const HORS: EtatTexte & { demander: () => void } = {
  saisie: null, ouvrirSaisie: () => undefined, fermerSaisie: () => undefined, mode: null, poserMode: () => undefined,
  polices: null, erreurPolices: '', deposer: () => Promise.resolve({ erreur: 'Aucun éditeur.' }), demander: () => undefined
};

/** L'etat du texte ; hors d'un editeur, un etat inerte (un panneau rendu seul dans un test). */
export function useTexte(): EtatTexte {
  return useContext(Contexte) ?? HORS;
}

/** Les fontes, chargees au premier appel : un panneau qui en a besoin les demande en s'affichant. */
export function usePolices(): Pick<EtatTexte, 'polices' | 'erreurPolices' | 'deposer'> {
  const c = (useContext(Contexte) ?? HORS) as EtatTexte & { demander: () => void };
  const { demander } = c;
  useEffect(() => { demander(); }, [demander]);
  return c;
}
