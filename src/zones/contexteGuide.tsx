// L'accueil guide dans React (ADR-0019) : la memoire de ce qui a ete vu (pour la page et pour l'editeur) et l'etat de la visite
// (pour l'editeur seulement). Le pur est dans visite.ts ; ici, le stockage injecte, les signaux et les annonces.
//
// La memoire passe par le stockage donne (io/stockage.ts), comme le brouillon et les versions : un confort. Sans lui, ou s'il
// refuse d'ecrire, une memoire de session prend le relais : la visite et les reperes ne reviennent pas avant le rechargement.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { CHOIX_CRICUT_DEFAUT } from '../model/contextes.js';
import { useStockage } from './contexteStockage.js';
import { useActions, useDessin } from './contexteEditeur.js';
import { useTactile, useTelephone } from './Vue.js';
import {
  apresSignal, avecRepere, avecVisite, CLE_GUIDE, fusionner, lireMemoire, MEMOIRE_VIDE, ouvreSeule, phraseEtape, phraseFin, precedente, suivante,
  couleurChangee, type ContexteVisite, type Demarrage, type EtapeVisite, type IdRepere, type MemoireGuide, type Recuperation, type SignalVisite
} from './visite.js';

// ---------------------------------------------------------------------------------------------
// La memoire : une valeur de session (le temps de la page), et des abonnes a prevenir quand elle change. La page et l'editeur
// ont chacun leur fournisseur ; ce qu'un des deux note, l'autre le voit.
// ---------------------------------------------------------------------------------------------

let session: MemoireGuide = MEMOIRE_VIDE;
let revision = 0;
const abonnes = new Set<() => void>();
const abonner = (f: () => void) => { abonnes.add(f); return () => { abonnes.delete(f); }; };
const lireRevision = () => revision;

interface ValeurReperes {
  /** L'accueil guide est demande ici : la page, ou un hote qui l'a active. Sinon, ni repere ni visite. */
  readonly actif: boolean;
  readonly memoire: MemoireGuide;
  readonly noterRepere: (id: IdRepere) => void;
  readonly noterVisite: () => void;
  /** Les reperes dont le moment est venu dans cet arbre (un premier booleen) : ils attendent d'etre vus. */
  readonly rencontres: ReadonlySet<IdRepere>;
  readonly rencontrer: (id: IdRepere) => void;
}

const AUCUNE: ReadonlySet<IdRepere> = new Set();
const SANS_GUIDE: ValeurReperes = { actif: false, memoire: MEMOIRE_VIDE, noterRepere: () => undefined, noterVisite: () => undefined, rencontres: AUCUNE, rencontrer: () => undefined };
const ContexteReperes = createContext<ValeurReperes>(SANS_GUIDE);

/** La memoire du guide pour ses descendants, lue dans le stockage du contexte (useStockage) et dans la session. */
export function FournisseurReperes({ actif, children }: { actif: boolean; children: ReactNode }) {
  const stockage = useStockage();
  const rev = useSyncExternalStore(abonner, lireRevision, lireRevision);
  const memoire = useMemo(() => fusionner(lireMemoire(stockage?.lire<unknown>(CLE_GUIDE)), session), [stockage, rev]);
  const noter = useCallback((f: (m: MemoireGuide) => MemoireGuide) => {
    const avant = session;
    session = f(session);
    // On ecrit par-dessus ce que le stockage a deja (un autre onglet a pu noter autre chose), jamais une memoire perimee.
    const lu = lireMemoire(stockage?.lire<unknown>(CLE_GUIDE));
    const apres = f(lu);
    if (apres !== lu) stockage?.ecrire(CLE_GUIDE, apres);
    // Rien de neuf, rien a redessiner : noter deux fois la meme chose ne relance aucun rendu.
    if (session === avant && apres === lu) return;
    revision++;
    for (const a of abonnes) a();
  }, [stockage]);
  const noterRepere = useCallback((id: IdRepere) => noter(m => avecRepere(m, id)), [noter]);
  const noterVisite = useCallback(() => noter(avecVisite), [noter]);
  const [rencontres, poserRencontres] = useState<ReadonlySet<IdRepere>>(AUCUNE);
  const rencontrer = useCallback((id: IdRepere) => poserRencontres(r => (r.has(id) ? r : new Set([...r, id]))), []);
  const valeur = useMemo<ValeurReperes>(() => ({
    actif, memoire, noterRepere, noterVisite, rencontres, rencontrer
  }), [actif, memoire, noterRepere, noterVisite, rencontres, rencontrer]);
  return <ContexteReperes.Provider value={valeur}>{children}</ContexteReperes.Provider>;
}

export const useReperes = (): ValeurReperes => useContext(ContexteReperes);

/** Un repere de premiere rencontre : visible tant que le guide est actif et qu'on ne l'a pas referme par « Compris ». */
export function useRepere(id: IdRepere): { visible: boolean; compris: () => void } {
  const r = useReperes();
  return { visible: r.actif && !r.memoire.reperes.includes(id), compris: () => r.noterRepere(id) };
}

// ---------------------------------------------------------------------------------------------
// La visite : l'etape du moment, ce qui la fait avancer, ce qu'elle dit.
// ---------------------------------------------------------------------------------------------

/** Ce que la page ou l'hote donne a l'editeur pour le guide (EditeurSvg, prop `guide`). */
export interface OptionsGuide {
  /** Quand la visite s'ouvre d'elle-meme. */
  demarrer?: Demarrage;
  /** Comment la personne recupere son dessin ici. */
  recuperer?: Recuperation;
  /** La page seule : quitter l'editeur pour convertir une image (une des suites de la fin de visite). */
  convertir?: () => void;
}

/** Pourquoi l'etape a change : apres un geste, l'annonce attend que la phrase du geste (la selection) ait ete dite. */
type Cause = 'depart' | 'geste' | 'bouton';

interface ValeurVisite {
  readonly etape: EtapeVisite | null;
  readonly contexte: ContexteVisite;
  readonly convertir: (() => void) | null;
  readonly demarrer: () => void;
  readonly quitter: (terminee: boolean) => void;
  readonly suivant: () => void;
  readonly precedent: () => void;
  readonly signaler: (s: SignalVisite) => void;
}

const ContexteDeVisite = createContext<ValeurVisite | null>(null);

/** La visite de cet editeur, ou null hors d'un editeur qui l'a. */
export const useVisite = (): ValeurVisite | null => useContext(ContexteDeVisite);

/** Prevenir la visite d'un geste fait (un telechargement, un enregistrement) ; sans visite, ne fait rien. */
export function useSignalVisite(): (s: SignalVisite) => void {
  const v = useContext(ContexteDeVisite);
  return v ? v.signaler : rien;
}
const rien = (): void => undefined;

/** Les delais avant de dire une etape : la phrase d'un geste (« Forme 2 sélectionnée… ») passe d'abord. */
const DELAI_ANNONCE: Readonly<Record<Cause, number>> = { depart: 600, geste: 1200, bouton: 0 };

export function FournisseurVisite({ options, children }: { options: OptionsGuide | null; children: ReactNode }) {
  const mo = useDessin(), ac = useActions(), reperes = useReperes(), telephone = useTelephone(), doigt = useTactile();
  const [etat, poserEtat] = useState<{ etape: EtapeVisite | null; cause: Cause }>({ etape: null, cause: 'depart' });
  const etape = etat.etape;
  const recuperation = options?.recuperer ?? 'telecharger';
  const contexte = useMemo<ContexteVisite>(() => ({ telephone, doigt, selection: mo.sel.length > 0, recuperation }), [telephone, doigt, mo.sel.length, recuperation]);
  const lecture = useRef(contexte);
  lecture.current = contexte;
  const { noterVisite } = reperes;

  const demarrer = useCallback(() => { noterVisite(); poserEtat({ etape: 'choisir', cause: 'depart' }); }, [noterVisite]);
  const quitter = useCallback((terminee: boolean) => {
    poserEtat(e => (e.etape ? { etape: null, cause: 'bouton' } : e));
    ac.annoncer(phraseFin(terminee, lecture.current.telephone));
  }, [ac]);
  const suivant = useCallback(() => poserEtat(e => (e.etape ? { etape: suivante(e.etape), cause: 'bouton' } : e)), []);
  const precedent = useCallback(() => poserEtat(e => (e.etape ? { etape: precedente(e.etape), cause: 'bouton' } : e)), []);
  const signaler = useCallback((s: SignalVisite) => poserEtat(e => {
    if (!e.etape) return e;
    const apres = apresSignal(e.etape, s);
    return apres === e.etape ? e : { etape: apres, cause: 'geste' };
  }), []);

  // Une fois, a l'ouverture de l'editeur : la page qui l'a demandee, ou l'hote qui l'a activee et qui ne l'a jamais vue.
  const depart = useRef(reperes.actif && !!options && ouvreSeule(options.demarrer ?? 'jamais', reperes.memoire.visite));
  useEffect(() => {
    if (!depart.current) return;
    depart.current = false;
    demarrer();
  }, [demarrer]);

  useObservation(etape, signaler);

  // Chaque etape se dit dans la region vocale de l'editeur, apres la phrase du geste qui l'a amenee.
  useEffect(() => {
    if (!etape) return;
    const t = setTimeout(() => ac.annoncer(phraseEtape(etape, lecture.current)), DELAI_ANNONCE[etat.cause]);
    return () => clearTimeout(t);
  }, [etape, etat.cause, ac]);

  const convertir = options?.convertir ?? null;
  const valeur = useMemo<ValeurVisite | null>(
    () => (reperes.actif && options ? { etape, contexte, convertir, demarrer, quitter, suivant, precedent, signaler } : null),
    [reperes.actif, options, etape, contexte, convertir, demarrer, quitter, suivant, precedent, signaler]
  );
  return <ContexteDeVisite.Provider value={valeur}>{children}</ContexteDeVisite.Provider>;
}

/**
 * Ce que la visite lit du dessin : une selection qui apparait (etape 1), une couleur qui change (etape 2), une annulation
 * (etape 3). Les references sont prises a l'entree dans l'etape : un etat d'avant la visite ne la fait pas avancer.
 */
function useObservation(etape: EtapeVisite | null, signaler: (s: SignalVisite) => void): void {
  const mo = useDessin();
  const entree = useRef<{ etape: EtapeVisite | null; sel: readonly string[]; dessin: typeof mo.dessin; futur: number }>({ etape: null, sel: mo.sel, dessin: mo.dessin, futur: mo.h.futur.length });
  useEffect(() => {
    const e = entree.current;
    if (e.etape !== etape) { entree.current = { etape, sel: mo.sel, dessin: mo.dessin, futur: mo.h.futur.length }; return; }
    if (etape === 'choisir' && mo.sel.length && mo.sel !== e.sel) signaler('selection');
    else if (etape === 'couleur' && couleurChangee(e.dessin, mo.dessin)) signaler('couleur');
    else if (etape === 'annuler' && mo.h.futur.length > e.futur) signaler('annule');
  }, [etape, mo.sel, mo.dessin, mo.h.futur.length, signaler]);
}

/** Le choix du contexte Cricut par defaut : la suite « Préparer pour une Cricut » de la fin de visite. */
export const CHOIX_CRICUT = { contexte: 'cricut' as const, ...CHOIX_CRICUT_DEFAUT };
