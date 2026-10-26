// L'etat des regles et des reperes (ADR-0038), et celui des panneaux de repetition : ce que la toile, les menus, le clavier et
// les panneaux se partagent. Un contexte a part plutot qu'un champ de plus dans l'interface de l'editeur : rien de ce qui suit
// ne s'ecrit dans le SVG, sauf les reperes eux-memes, qui vivent dans le dessin (et passent donc par l'historique).
//
// Les verbes lisent l'etat du moment par une reference (comme creerActions.ts) : ils ne changent jamais d'identite.

import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { ajouterRepere, deplacerRepere, effacerReperes, nombreReperes, supprimerRepere, type AxeRepere, type DessinSvg } from '../engine/editionSvg.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { texteValeur, uniteRegle, type UniteRegle } from './graduations.js';
import { pluriel } from '../util/texte.js';
import { bornerLiens, LIENS_DEFAUT, type OptionsLiens } from '../engine/preparation.js';

/** Un repere designe : son axe et sa valeur (au millieme, celle du dessin). */
export interface RepereDesigne { readonly axe: AxeRepere; readonly valeur: number }

/** Le panneau flottant ouvert sur la toile : les reperes, ou une repetition de la selection. */
/** `feuille` : dupliquer la selection sur la feuille du tapis, en contexte Cricut (ADR-0039) ; `liens` : les liens des ilots (ADR-0040). */
export type PanneauOutils = 'reperes' | 'grille' | 'radiale' | 'symetrie' | 'feuille' | 'liens' | null;

export interface EtatRegles {
  /** Les regles en haut et a gauche de la toile (un reglage de la session, cache par defaut). */
  readonly regles: boolean;
  /** Les reperes se dessinent (et attirent) ; masques, ils restent dans le document. */
  readonly reperesVisibles: boolean;
  /** Verrouilles : ils ne se prennent plus a la souris (ils attirent toujours). */
  readonly verrouilles: boolean;
  /** Le repere choisi d'un clic : Suppr le retire, les fleches le deplacent, Entree ouvre son champ. */
  readonly choisi: RepereDesigne | null;
  /** Le repere qu'on tire depuis une regle, avant qu'il soit pose : il se dessine, il n'est pas encore dans le dessin. */
  readonly tirage: RepereDesigne | null;
  readonly panneau: PanneauOutils;
  /** Le repere dont le champ doit prendre le focus a l'ouverture du panneau des reperes (double-clic, Entree). */
  readonly focusRepere: RepereDesigne | null;
  /** L'unite des regles et des champs : celle du profil de production, sinon celle du plan. */
  readonly unite: UniteRegle;
  /** La valeur d'un repere qu'on tire ou qu'on glisse, ecrite pres du pointeur (en px depuis le coin de la toile). */
  readonly etiquette: EtiquetteRepere | null;
  /** Les reglages des liens des ilots (ADR-0040) : de la session, jamais ecrits ; 2 mm et 3 par ilot au depart. */
  readonly liens: OptionsLiens;
}

export interface EtiquetteRepere { readonly x: number; readonly y: number; readonly texte: string }

export interface ActionsRegles {
  basculerRegles: () => void;
  basculerReperes: () => void;
  basculerVerrou: () => void;
  effacer: () => void;
  ajouter: (axe: AxeRepere, valeur: number) => void;
  /**
   * Deplace un repere. Un glisser part toujours du meme dessin (`base`, celui d'avant le geste) et fond ses pas par sa `cle` en
   * une entree d'historique ; sans base, le dessin du moment.
   */
  deplacer: (r: RepereDesigne, valeur: number, geste?: { readonly base: DessinSvg; readonly cle: string }) => void;
  /** Retire un repere (d'un glisser hors de la toile : depuis la base du geste, dans sa meme entree). */
  supprimer: (r: RepereDesigne, geste?: { readonly base: DessinSvg; readonly cle: string }) => void;
  choisir: (r: RepereDesigne | null) => void;
  poserTirage: (r: RepereDesigne | null) => void;
  ouvrir: (p: PanneauOutils, focus?: RepereDesigne | null) => void;
  poserEtiquette: (e: EtiquetteRepere | null) => void;
  poserLiens: (o: OptionsLiens) => void;
}

const ContexteEtat = createContext<EtatRegles | null>(null);
const ContexteVerbes = createContext<ActionsRegles | null>(null);

export const useRegles = (): EtatRegles => {
  const v = useContext(ContexteEtat);
  if (!v) throw new Error('useRegles : appelé hors d’un éditeur (FournisseurRegles).');
  return v;
};
export const useActionsRegles = (): ActionsRegles => {
  const v = useContext(ContexteVerbes);
  if (!v) throw new Error('useActionsRegles : appelé hors d’un éditeur (FournisseurRegles).');
  return v;
};
/** Les reperes caches ou absents n'attirent pas : ce que les aimants des gestes doivent savoir (sans fournisseur : visibles). */
export const useReperesActifs = (): boolean => useContext(ContexteEtat)?.reperesVisibles ?? true;

/** Le nom d'un repere : « Repère horizontal à 40 mm ». */
export const nomRepere = (r: RepereDesigne, u: UniteRegle): string => 'Repère ' + (r.axe === 'h' ? 'horizontal' : 'vertical') + ' à ' + texteValeur(r.valeur, u);

/** La valeur que le dessin garde pour un repere pose a `v` : le millieme, comme reperes.ts. */
const auMillieme = (v: number): number => { const r = Number(v.toFixed(3)); return Object.is(r, -0) ? 0 : r; };

export function FournisseurRegles({ children }: { children: ReactNode }) {
  const mo = useDessin(), ac = useActions(), ui = useInterface();
  const [regles, poserRegles] = useState(false);
  const [reperesVisibles, poserVisibles] = useState(true);
  const [verrouilles, poserVerrouilles] = useState(false);
  const [choisi, poserChoisi] = useState<RepereDesigne | null>(null);
  const [tirage, poserTirage] = useState<RepereDesigne | null>(null);
  const [panneau, poserPanneau] = useState<PanneauOutils>(null);
  const [focusRepere, poserFocus] = useState<RepereDesigne | null>(null);
  const [etiquette, poserEtiquette] = useState<EtiquetteRepere | null>(null);
  const [liens, poserLiens] = useState<OptionsLiens>(LIENS_DEFAUT);
  const unite = useMemo(() => uniteRegle(ui.profil?.unite ?? null), [ui.profil]);
  // Un repere choisi qui n'existe plus (annule, efface) ne l'est plus.
  const reperes = mo.dessin.reperes;
  const choisiValide = choisi && (choisi.axe === 'h' ? reperes?.h : reperes?.v)?.includes(choisi.valeur) ? choisi : null;
  const moment = useRef({ dessin: mo.dessin, unite, regles, reperesVisibles, verrouilles });
  moment.current = { dessin: mo.dessin, unite, regles, reperesVisibles, verrouilles };

  const [verbes] = useState<ActionsRegles>(() => {
    const lu = () => moment.current;
    const changer = (f: (d: DessinSvg) => DessinSvg, phrase: string, cle: string | null = null) => { ac.appliquer(f, cle); if (phrase) ac.dire(phrase); };
    return {
      basculerRegles: () => { const v = !lu().regles; poserRegles(v); ac.dire(v ? 'Règles affichées : tirez-en un repère.' : 'Règles masquées.'); },
      basculerReperes: () => { const v = !lu().reperesVisibles; poserVisibles(v); if (!v) poserChoisi(null); ac.dire(v ? 'Repères affichés.' : 'Repères masqués : ils restent dans le document, et n’attirent plus.'); },
      basculerVerrou: () => { const v = !lu().verrouilles; poserVerrouilles(v); if (v) poserChoisi(null); ac.dire(v ? 'Repères verrouillés : ils ne se déplacent plus à la souris.' : 'Repères déverrouillés.'); },
      effacer: () => {
        const n = nombreReperes(lu().dessin);
        if (!n) { ac.dire('Aucun repère à effacer.'); return; }
        poserChoisi(null);
        changer(effacerReperes, pluriel(n, 'repère') + ' ' + (n > 1 ? 'effacés' : 'effacé') + ' : Ctrl+Z les fait revenir.');
      },
      ajouter: (axe, valeur) => {
        const { dessin, unite: u } = lu(), apres = ajouterRepere(dessin, axe, valeur);
        if (apres === dessin) { ac.dire('Ce repère existe déjà, ou la valeur ne se lit pas.'); return; }
        const r = { axe, valeur: auMillieme(valeur) };
        poserChoisi(r);
        changer(() => apres, nomRepere(r, u) + ' posé.');
      },
      deplacer: (r, valeur, geste) => {
        const base = geste?.base ?? lu().dessin;
        ac.appliquer(() => deplacerRepere(base, r.axe, r.valeur, valeur), geste?.cle ?? null);
        poserChoisi({ axe: r.axe, valeur: auMillieme(valeur) });
      },
      supprimer: (r, geste) => {
        poserChoisi(null);
        changer(d => supprimerRepere(geste?.base ?? d, r.axe, r.valeur), nomRepere(r, lu().unite) + ' retiré.', geste?.cle ?? null);
      },
      choisir: r => poserChoisi(r),
      poserTirage: r => poserTirage(r),
      ouvrir: (p, focus = null) => { poserPanneau(p); poserFocus(focus); },
      poserEtiquette,
      poserLiens: o => poserLiens(bornerLiens(o))
    };
  });
  const etat = useMemo<EtatRegles>(
    () => ({ regles, reperesVisibles, verrouilles, choisi: choisiValide, tirage, panneau, focusRepere, unite, etiquette, liens }),
    [regles, reperesVisibles, verrouilles, choisiValide, tirage, panneau, focusRepere, unite, etiquette, liens]
  );
  return (
    <ContexteVerbes.Provider value={verbes}>
      <ContexteEtat.Provider value={etat}>{children}</ContexteEtat.Provider>
    </ContexteVerbes.Provider>
  );
}
