// La saisie du texte sur la toile (ADR-0027) : quelle saisie est ouverte (un texte neuf a son point d'insertion, ou un texte
// deja pose), les reglages du prochain texte (que la barre de texte et le panneau partagent avant la premiere lettre), et ce
// que la saisie ouverte fait des gestes de la toile. Un contexte a part des trois de l'editeur (ADR-0010) : rien n'y entre
// dans l'historique ni dans le SVG ; seuls la toile, ses gestes, la barre de texte et les panneaux du texte le lisent.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import type { PointTexte } from '../engine/texte/curseur.js';
import { NOUVEAU_TEXTE, type ReglagesNouveauTexte } from './saisie.js';

/** Une saisie ouverte. `rang` change a chaque ouverture : rouvrir le meme texte repart d'un champ neuf. */
export interface Saisie {
  readonly rang: number;
  /** La forme du texte ; null tant qu'un texte neuf n'a dessine aucune lettre. */
  readonly id: string | null;
  /** Le point d'insertion d'un texte neuf, dans le plan ; null pour un texte deja pose. */
  readonly point: PointTexte | null;
  /** Ou poser le curseur dans un texte deja pose (un clic, un double-clic), dans le plan ; null : a la fin. */
  readonly clic: PointTexte | null;
}

/** Ce que la saisie ouverte fait des gestes de la toile : posee par SaisieTexte, lue par les gestes (Gestes.ts). */
export interface PoigneeSaisie {
  /** Un appui pendant la saisie : vrai s'il tombe dans le texte (le curseur s'y pose, Maj etend la selection). */
  readonly appuyer: (p: PointTexte, etendre: boolean) => boolean;
  readonly bouger: (p: PointTexte) => void;
  readonly lacher: () => void;
  /** Un double-clic dans le texte choisit le mot ; faux s'il tombe dehors. */
  readonly doubleClic: (p: PointTexte) => boolean;
  /** Termine la saisie (le texte reste vivant) ; `focusToile` rend le focus a la toile. */
  readonly terminer: (focusToile: boolean) => void;
}

export interface DemandePanneau { readonly rang: number; readonly polices: boolean }

export interface EtatSaisie {
  readonly saisie: Saisie | null;
  /** Le texte saisi ne dessine rien pour l'instant (vide, ou fait de blancs) : la toile cache sa forme. */
  readonly vide: boolean;
  readonly nouveau: ReglagesNouveauTexte;
  readonly poserNouveau: (r: Partial<ReglagesNouveauTexte>) => void;
  /** Ouvre la saisie d'un texte neuf a ce point du plan. */
  readonly commencer: (p: PointTexte) => void;
  /** Ouvre la saisie d'un texte deja pose, le curseur au point donne (ou a la fin). */
  readonly ouvrir: (id: string, clic?: PointTexte | null) => void;
  /** La saisie a pose (ou perdu) sa forme. */
  readonly lier: (id: string | null) => void;
  readonly poserVide: (v: boolean) => void;
  readonly fermer: () => void;
  readonly poignee: MutableRefObject<PoigneeSaisie | null>;
  /**
   * La demande en attente de montrer le panneau Texte (« Plus d'options », « Toutes les polices » de la barre) : la section du
   * panneau se montre, prend le focus, deplie l'explorateur des polices si `polices`, puis la retire.
   */
  readonly demandePanneau: DemandePanneau | null;
  readonly demanderPanneau: (polices: boolean) => void;
  readonly traiterPanneau: () => void;
}

const Contexte = createContext<EtatSaisie | null>(null);

export function FournisseurSaisie({ children }: { children: ReactNode }) {
  const [saisie, poserSaisie] = useState<Saisie | null>(null);
  const [vide, poserVide] = useState(false);
  const [nouveau, poserNouveauBrut] = useState<ReglagesNouveauTexte>(NOUVEAU_TEXTE);
  const [demandePanneau, poserDemande] = useState<DemandePanneau | null>(null);
  const poignee = useRef<PoigneeSaisie | null>(null);
  const rang = useRef(0);
  // Une saisie qui s'ouvre termine celle d'avant (son texte reste, sa frappe est close).
  const remplacer = useCallback((s: Omit<Saisie, 'rang'>) => {
    poignee.current?.terminer(false);
    rang.current += 1;
    poserVide(s.id === null);
    poserSaisie({ ...s, rang: rang.current });
  }, []);
  const valeur = useMemo<EtatSaisie>(() => ({
    saisie, vide, nouveau, demandePanneau, poignee, poserVide,
    poserNouveau: r => poserNouveauBrut(n => ({ ...n, ...r })),
    commencer: p => remplacer({ id: null, point: p, clic: null }),
    ouvrir: (id, clic = null) => remplacer({ id, point: null, clic }),
    lier: id => poserSaisie(s => (s && s.id !== id ? { ...s, id } : s)),
    fermer: () => { poserSaisie(null); poserVide(false); },
    demanderPanneau: polices => { rang.current += 1; poserDemande({ rang: rang.current, polices }); },
    traiterPanneau: () => poserDemande(null)
  }), [saisie, vide, nouveau, demandePanneau, remplacer]);
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

const HORS: EtatSaisie = {
  saisie: null, vide: false, nouveau: NOUVEAU_TEXTE, poserNouveau: () => undefined, commencer: () => undefined, ouvrir: () => undefined,
  lier: () => undefined, poserVide: () => undefined, fermer: () => undefined, poignee: { current: null }, demandePanneau: null, demanderPanneau: () => undefined, traiterPanneau: () => undefined
};

/** La saisie du texte ; hors d'un editeur, un etat inerte (un panneau rendu seul dans un test). */
export function useSaisie(): EtatSaisie {
  return useContext(Contexte) ?? HORS;
}

/**
 * Sert la demande de la barre (« Plus d'options », « Toutes les polices ») dans le panneau Texte qui s'affiche : la section
 * s'ouvre, se montre et prend le focus (son titre, ou la recherche des polices), puis la demande se retire. Rend le rang a
 * passer a `ChoixPolice` pour deplier l'explorateur (0 : aucun).
 */
export function useDemandePanneau(): number {
  const { demandePanneau: d, traiterPanneau } = useSaisie();
  useEffect(() => {
    if (!d) return;
    traiterPanneau();
    // Apres le tiroir, qui prend le focus en s'ouvrant (Cadre.tsx) : on le donne ensuite a ce qu'on vient chercher.
    window.setTimeout(() => {
      const panneau = document.querySelector<HTMLElement>('.editeur-inspecteur'), section = panneau?.querySelector<HTMLDetailsElement>('details.section-texte');
      if (section) section.open = true;
      const cible = d.polices ? panneau?.querySelector<HTMLElement>('.explorateur-polices input') : section?.querySelector<HTMLElement>('summary') ?? panneau?.querySelector<HTMLElement>('.panneau-texte textarea');
      cible?.focus({ preventScroll: true });
      cible?.scrollIntoView({ block: 'nearest' });
    }, 60);
  }, [d, traiterPanneau]);
  return d?.polices ? d.rang : 0;
}
