// L'etat du texte vivant dans l'interface (ADR-0022) : le mode de vectorisation choisi, et les fontes chargees (la saisie
// sur la toile a son propre contexte, contexteSaisie.tsx, ADR-0027). Un contexte a part des trois de l'editeur (ADR-0010) : il ne change que
// quand on tape ou qu'on choisit, et seuls les panneaux du texte le lisent. Rien de tout cela n'entre dans l'historique.
//
// S'y ajoutent les polices libres telechargeables (ADR-0025) : l'index (une annexe voisine, chargee a la demande), le
// telechargement d'une police choisie, et les favoris et polices recentes (des conforts du stockage). Le choix d'une police non
// livree vaut demande : c'est le seul geste qui fait partir une requete ; ouvrir la liste, chercher, voir les apercus, jamais.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { policeDeposee, retenirDeposee, toutesLesPolices, type Police } from '../io/polices.js';
import { chargerCatalogue as chargerIndex } from '../io/cataloguePolices.js';
import { chargerApercus as chargerAnnexeApercus } from '../io/apercusPolices.js';
import { cacheNavigateur, oublierAncienConsentement, telechargerVariante } from '../io/policesEnLigne.js';
import type { CataloguePolices, VariantePolice } from '../model/cataloguePolices.js';
import type { AnnexeApercus } from '../model/apercusPolices.js';
import type { ModeVectorisation } from '../engine/texte/vectoriser.js';
import { useStockage } from './contexteStockage.js';

/** Les cles des conforts du stockage : favoris (des familles ou des fontes) et polices recentes (des identifiants de police). */
export const CLE_FAVORIS = 'svg.polices.favoris';
export const CLE_RECENTES = 'svg.polices.recentes';
const FAVORIS_MAX = 100, RECENTES_MAX = 8;
const CLE_ENTREE = /^[a-z0-9][a-z0-9:-]{0,90}$/;

/** Une liste de cles lue du stockage : seulement des chaines de la forme attendue, sans doublon, bornee. */
export function listeDeCles(v: unknown, max: number): string[] {
  return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && CLE_ENTREE.test(x)))].slice(0, max) : [];
}

/** Le resultat d'un telechargement demande : la police (son identifiant), ou une erreur nommee. */
export type ResultatTelechargement = { id: string; police: Police } | { erreur: string };

export interface EtatTexte {
  /** Le mode de vectorisation choisi dans la session ; null : celui du contexte (souder en decoupe Cricut, sinon lettres separees). */
  readonly mode: ModeVectorisation | null;
  readonly poserMode: (m: ModeVectorisation) => void;
  /** Les fontes livrees, deposees et telechargees, ou null tant qu'elles se chargent. */
  readonly polices: readonly Police[] | null;
  readonly erreurPolices: string;
  /** Lit une fonte deposee et la retient pour la session ; rend son identifiant, ou dit pourquoi elle ne se lit pas. */
  readonly deposer: (f: File) => Promise<{ id: string } | { erreur: string }>;
  /** Retient une police lue ailleurs (une police de l'appareil) et l'ajoute a la liste. */
  readonly retenir: (p: Police) => void;
  /** Vrai quand les polices en ligne sont permises (la page ; un hote qui a pose `policesEnLigne: true`). */
  readonly enLigne: boolean;
  /** L'index des polices telechargeables, ou null tant qu'il n'est pas charge (ou s'il ne l'est jamais). */
  readonly catalogue: CataloguePolices | null;
  readonly erreurCatalogue: string;
  readonly chargerCatalogue: () => void;
  /**
   * Les apercus prepares des familles de l'index (ADR-0026), ou null tant qu'ils ne sont pas charges (ou s'ils ne le sont
   * jamais : la liste ecrit alors les noms dans la police de l'interface, et `erreurApercus` le dit).
   */
  readonly apercus: AnnexeApercus | null;
  readonly erreurApercus: string;
  /** Telecharge une variante que la personne vient de choisir : le seul chemin vers le reseau. */
  readonly telecharger: (v: VariantePolice) => Promise<ResultatTelechargement>;
  readonly favoris: readonly string[];
  readonly basculerFavori: (cle: string) => void;
  readonly recentes: readonly string[];
  readonly noterRecente: (id: string) => void;
}

/** L'option de l'editeur : les polices en ligne permises. La page la donne vraie ; un hote, par `policesEnLigne` (faux par defaut). */
export const ContextePolicesEnLigne = createContext(false);

const Contexte = createContext<EtatTexte | null>(null);

export function FournisseurTexte({ children }: { children: ReactNode }) {
  const stockage = useStockage(), enLigne = useContext(ContextePolicesEnLigne);
  const [mode, poserMode] = useState<ModeVectorisation | null>(null);
  const [polices, poserPolices] = useState<readonly Police[] | null>(null);
  const [erreurPolices, poserErreur] = useState('');
  const [demandees, demander] = useState(false);
  const [catalogue, poserCatalogue] = useState<CataloguePolices | null>(null);
  const [erreurCatalogue, poserErreurCatalogue] = useState('');
  const [catalogueDemande, demanderCatalogue] = useState(false);
  const [apercus, poserApercus] = useState<AnnexeApercus | null>(null);
  const [erreurApercus, poserErreurApercus] = useState('');
  const [favoris, poserFavoris] = useState<readonly string[]>(() => listeDeCles(stockage?.lire(CLE_FAVORIS), FAVORIS_MAX));
  const [recentes, poserRecentes] = useState<readonly string[]>(() => listeDeCles(stockage?.lire(CLE_RECENTES), RECENTES_MAX));
  // L'ancien accord par serveur (retire, ADR-0025) ne decide plus de rien : s'il en reste un dans le stockage, il s'efface.
  useEffect(() => { oublierAncienConsentement(stockage); }, [stockage]);
  // Les fontes ne se chargent qu'au premier besoin (polices.js pese plusieurs centaines de Ko) : un panneau du texte le demande.
  useEffect(() => {
    if (!demandees) return;
    let vivant = true;
    toutesLesPolices().then(p => { if (vivant) poserPolices(p); }).catch((e: unknown) => { if (vivant) { poserPolices([]); poserErreur(e instanceof Error ? e.message : String(e)); } });
    return () => { vivant = false; };
  }, [demandees]);
  // L'index ne se charge que si les polices en ligne sont permises et qu'un panneau le demande (le selecteur, une police absente).
  useEffect(() => {
    if (!catalogueDemande || !enLigne) return;
    let vivant = true;
    chargerIndex().then(c => { if (vivant) poserCatalogue(c); }).catch((e: unknown) => { if (vivant) poserErreurCatalogue(e instanceof Error ? e.message : String(e)); });
    // Les apercus prepares, une annexe voisine a part (plus lourde que l'index) : leur absence ne retient pas la liste.
    chargerAnnexeApercus().then(a => { if (vivant) poserApercus(a); }).catch((e: unknown) => { if (vivant) poserErreurApercus(e instanceof Error ? e.message : String(e)); });
    return () => { vivant = false; };
  }, [catalogueDemande, enLigne]);
  const rafraichir = useCallback(async () => poserPolices(await toutesLesPolices()), []);
  const deposer = useCallback(async (f: File) => {
    const r = await policeDeposee(f);
    if ('erreur' in r) return r;
    retenirDeposee(r);
    await rafraichir();
    return { id: r.id };
  }, [rafraichir]);
  const retenir = useCallback((p: Police) => { retenirDeposee(p); void rafraichir(); }, [rafraichir]);
  const telecharger = useCallback(async (v: VariantePolice): Promise<ResultatTelechargement> => {
    // L'option de l'hote, pas un accord de la personne : sans elle, aucune requete.
    if (!enLigne) return { erreur: 'Les polices en ligne ne sont pas permises dans cet éditeur.' };
    const r = await telechargerVariante(v, { cache: cacheNavigateur() });
    if ('erreur' in r) return r;
    await rafraichir();
    return { id: r.id, police: r };
  }, [enLigne, rafraichir]);
  const basculerFavori = useCallback((cle: string) => {
    poserFavoris(avant => {
      const apres = avant.includes(cle) ? avant.filter(c => c !== cle) : [cle, ...avant].slice(0, FAVORIS_MAX);
      stockage?.ecrire(CLE_FAVORIS, apres);
      return apres;
    });
  }, [stockage]);
  const noterRecente = useCallback((id: string) => {
    if (!CLE_ENTREE.test(id) || id.startsWith('u-')) return;
    poserRecentes(avant => {
      if (avant[0] === id) return avant;
      const apres = [id, ...avant.filter(x => x !== id)].slice(0, RECENTES_MAX);
      stockage?.ecrire(CLE_RECENTES, apres);
      return apres;
    });
  }, [stockage]);
  const valeur = useMemo<EtatTexte & { demander: () => void }>(() => ({
    mode, poserMode, polices, erreurPolices, deposer, retenir, demander: () => demander(true),
    enLigne, catalogue, erreurCatalogue, chargerCatalogue: () => demanderCatalogue(true), apercus, erreurApercus, telecharger,
    favoris, basculerFavori, recentes, noterRecente
  }), [mode, polices, erreurPolices, deposer, retenir, enLigne, catalogue, erreurCatalogue, apercus, erreurApercus, telecharger, favoris, basculerFavori, recentes, noterRecente]);
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

const HORS: EtatTexte & { demander: () => void } = {
  mode: null, poserMode: () => undefined,
  polices: null, erreurPolices: '', deposer: () => Promise.resolve({ erreur: 'Aucun éditeur.' }), retenir: () => undefined, demander: () => undefined,
  enLigne: false, catalogue: null, erreurCatalogue: '', chargerCatalogue: () => undefined, apercus: null, erreurApercus: '', telecharger: () => Promise.resolve({ erreur: 'Aucun éditeur.' }),
  favoris: [], basculerFavori: () => undefined, recentes: [], noterRecente: () => undefined
};

/** L'etat du texte ; hors d'un editeur, un etat inerte (un panneau rendu seul dans un test). */
export function useTexte(): EtatTexte {
  return useContext(Contexte) ?? HORS;
}

/** Les fontes, chargees au premier appel : un panneau qui en a besoin les demande en s'affichant. */
export function usePolices(): EtatTexte {
  const c = (useContext(Contexte) ?? HORS) as EtatTexte & { demander: () => void };
  const { demander } = c;
  useEffect(() => { demander(); }, [demander]);
  return c;
}
