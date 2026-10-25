// La lecture d'une page de PDF en dessin a plat (ADR-0020) : le document, la page choisie, son contenu interprete en formes
// dans le repere du dessin (Y vers le bas, origine en haut a gauche de la boite visible, rotation de la page appliquee), une
// unite du plan valant un point (1/72 de pouce), comme les PDF que l'export ecrit. Ne leve jamais pour un fichier hostile :
// tout refus est une phrase en francais. Le seul signal qui traverse est `FluxEnAttente` (voir limites.ts).

import { IDENTITE, multiplier, translation, type DessinSvg, type Matrice } from '../editionSvg.js';
import { au } from '../../util/tableaux.js';
import { Interprete, donneesOuRien } from './contenu.js';
import { etatInitial, pertesVides, type Contexte } from './etat.js';
import { phrasesPertes } from './ignores.js';
import { FluxEnAttente, LIMITES_PDF, RefusPdf, SyntaxePdf, enFrancais, type Decompression, type DemandeFlux } from './limites.js';
import { estDict, estFlux, estRef, estTableau, type Dict, type Flux } from './objets.js';
import { listerPages, type PagePdf } from './pages.js';
import { fluxDePolice, type PolicesPdf } from './polices.js';
import { phraseRemplacement } from '../../model/polices.js';

/** Les polices lues d'avance au plus pour une page : au-dela, une police se lit a son premier usage. */
const POLICES_MAX = 500;
import { ouvrirDocument, type DocumentPdf } from './structure.js';

export interface OptionsLecturePdf {
  /** La page a lire, a partir de 1 ; la premiere par defaut. */
  readonly page?: number;
  readonly decompresser: Decompression;
  /** De quoi lire les polices et les remplacer ; absent, le texte n'est pas repris (il est compte et dit). */
  readonly polices?: PolicesPdf;
}

/** Une page lue : son dessin, ce qui n'a pas ete repris, le nombre de pages du document et celle qui a ete lue. */
export interface PdfLu {
  readonly dessin: DessinSvg;
  readonly ignores: readonly string[];
  readonly pages: number;
  readonly page: number;
  /** Vrai quand du texte attendait une fonte de remplacement que `polices` n'avait pas encore : la relire avec elles. */
  readonly policesManquantes?: boolean;
}
/** Un refus nomme ; `pages` quand le document s'est ouvert (une autre page peut se lire). */
export type LecturePdf = PdfLu | { readonly erreur: string; readonly pages?: number; readonly policesManquantes?: boolean };

/** Lit une page d'un PDF. */
export function lirePdf(octets: Uint8Array, options: OptionsLecturePdf): LecturePdf {
  let pages: number | undefined;
  const avecPages = (erreur: string): LecturePdf => (pages ? { erreur, pages } : { erreur });
  try {
    const doc = ouvrirDocument(octets, options.decompresser);
    const liste = listerPages(doc);
    if (!liste.length) return { erreur: 'Ce PDF ne contient aucune page.' };
    pages = liste.length;
    const n = options.page ?? 1;
    if (!Number.isInteger(n) || n < 1 || n > liste.length) return avecPages('Ce PDF n’a pas de page ' + n + ' : il en compte ' + enFrancais(liste.length) + '.');
    const lu = lirePage(doc, au(liste, n - 1), options.polices ?? null);
    if ('erreur' in lu) return { ...avecPages(lu.erreur), ...(lu.policesManquantes ? { policesManquantes: true } : {}) };
    return { ...lu, pages: liste.length, page: n };
  } catch (e) {
    if (e instanceof FluxEnAttente) throw e;
    if (e instanceof RefusPdf) return avecPages(e.message);
    if (e instanceof SyntaxePdf) return avecPages('Ce PDF ne se lit pas : ' + e.message + '.');
    // Dernier filet, comme la lecture d'un SVG : une pile qui deborderait malgre les bornes se dit.
    if (e instanceof RangeError) return avecPages('Ce PDF est trop complexe pour être lu (imbrication trop profonde) : simplifiez-le dans votre logiciel.');
    throw e;
  }
}

/** Du repere de la page a celui du dessin : origine au coin de la boite visible, Y retourne, rotation de la page (multiple de 90). */
export function matricePage(boite: readonly [number, number, number, number], rotation: 0 | 90 | 180 | 270): Matrice {
  const l = boite[2] - boite[0], h = boite[3] - boite[1];
  const r: Matrice = rotation === 90 ? [0, 1, 1, 0, 0, 0] : rotation === 180 ? [-1, 0, 0, 1, l, 0] : rotation === 270 ? [0, -1, -1, 0, h, l] : [1, 0, 0, -1, 0, h];
  return multiplier(r, translation(-boite[0], -boite[1]));
}

function lirePage(doc: DocumentPdf, page: PagePdf, polices: PolicesPdf | null): { dessin: DessinSvg; ignores: string[]; policesManquantes?: boolean } | { erreur: string; policesManquantes?: boolean } {
  const [x0, y0, x1, y1] = page.boite, l = x1 - x0, h = y1 - y0;
  if (!(l >= 0.001 && h >= 0.001)) return { erreur: 'Cette page du PDF a une taille nulle.' };
  if (Math.max(Math.abs(x0), Math.abs(y0), Math.abs(x1), Math.abs(y1)) > LIMITES_PDF.coordonnee) return { erreur: 'Cette page du PDF a une taille démesurée.' };
  const contenus = fluxDeContenu(doc, page.dict);
  // Les flux de la page et de ses formulaires sont demandes d'un coup : une seule reprise pour tous (voir io/pdf.ts).
  exiger(doc, [...contenus, ...formulaires(doc, page.ressources, polices !== null)]);
  const ctx: Contexte = {
    doc, page: matricePage(page.boite, page.rotation), formes: [], pertes: pertesVides(),
    calquesEteints: calques(doc), formulairesActifs: new Set(), polices, policesLues: new Map(), remplacements: new Map(), operateurs: 0, segments: 0, formulaires: 0
  };
  new Interprete(ctx, page.ressources, etatInitial(IDENTITE), 0, false).executer(concatener(contenus.map(f => donneesOuRien(ctx, f))));
  ctx.pertes.annotations = annotations(doc, page.dict);
  const ignores = [...phrasesPertes(ctx.pertes), ...[...ctx.remplacements.values()].map(x => phraseRemplacement(x.textes, x.r))];
  const manquantes = ctx.pertes.textesSansPolice > 0;
  if (!ctx.formes.length) {
    return { erreur: 'Cette page du PDF ne contient aucun tracé vectoriel à éditer' + (ignores.length ? ' (non repris : ' + ignores.join(' ; ') + ')' : '') + '.', ...(manquantes ? { policesManquantes: true } : {}) };
  }
  const vb: DessinSvg['vb'] = page.rotation === 90 || page.rotation === 270 ? [0, 0, h, l] : [0, 0, l, h];
  return { dessin: { vb, formes: ctx.formes }, ignores, ...(manquantes ? { policesManquantes: true } : {}) };
}

/** Les flux de contenu d'une page (un flux, ou un tableau de flux qui se lisent bout a bout). */
function fluxDeContenu(doc: DocumentPdf, page: Dict): Flux[] {
  const c = doc.valeur(page, 'Contents');
  if (estFlux(c)) return [c];
  return estTableau(c) ? c.map(x => doc.resoudre(x)).filter(estFlux) : [];
}

/** Les formulaires que la page peut dessiner, sous-formulaires compris (bornes en nombre et en profondeur), et les flux de leurs polices. */
function formulaires(doc: DocumentPdf, ressources: Dict | null, avecPolices: boolean): Flux[] {
  const vus = new Set<number>(), acc: Flux[] = [], polices = new Set<Dict>();
  const visiter = (r: Dict | null, profondeur: number): void => {
    if (profondeur > LIMITES_PDF.profondeurFormulaires) return;
    for (const p of avecPolices ? doc.dict(r, 'Font')?.values() ?? [] : []) {
      const d = doc.resoudre(p);
      if (!estDict(d) || polices.has(d) || polices.size >= POLICES_MAX) continue;
      polices.add(d);
      acc.push(...fluxDePolice(doc, d));
      // Les glyphes Type 3 ont leurs propres ressources (des formulaires, rarement).
      visiter(doc.dict(d, 'Resources'), profondeur + 1);
    }
    const xo = doc.dict(r, 'XObject');
    if (!xo) return;
    for (const v of xo.values()) {
      const x = doc.resoudre(v);
      if (!estFlux(x) || vus.has(x.debut) || doc.valeur(x.dict, 'Subtype') !== 'Form' || vus.size >= LIMITES_PDF.formulaires) continue;
      vus.add(x.debut);
      acc.push(x);
      visiter(doc.dict(x.dict, 'Resources'), profondeur + 1);
    }
  };
  visiter(ressources, 0);
  return acc;
}

/** Decompresse d'avance : chaque flux manquant est demande, tous ensemble. Un refus ici attend l'usage reel du flux. */
function exiger(doc: DocumentPdf, flux: readonly Flux[]): void {
  const demandes: DemandeFlux[] = [];
  for (const f of flux) {
    try { doc.donnees(f); } catch (e) {
      if (e instanceof FluxEnAttente) demandes.push(...e.demandes);
      else if (!(e instanceof RefusPdf || e instanceof SyntaxePdf)) throw e;
    }
  }
  if (demandes.length) throw new FluxEnAttente(demandes);
}

function concatener(morceaux: readonly Uint8Array[]): Uint8Array {
  // Un blanc entre deux flux : un operateur coupe en fin de flux ne se colle pas au suivant (7.8.2).
  const out = new Uint8Array(morceaux.reduce((n, m) => n + m.length + 1, 0));
  let i = 0;
  for (const m of morceaux) { out.set(m, i); i += m.length; out[i++] = 10; }
  return out;
}

/** Les calques eteints a l'ouverture (configuration par defaut, /OCProperties /D). */
function calques(doc: DocumentPdf): (n: number) => boolean {
  const catalogue = doc.resoudre(doc.trailer.get('Root'));
  const d = doc.dict(doc.dict(estDict(catalogue) ? catalogue : null, 'OCProperties'), 'D');
  if (!d) return () => false;
  const refs = (cle: string) => new Set((doc.tableau(d, cle) ?? []).filter(estRef).map(r => r.n));
  const base = doc.valeur(d, 'BaseState') === 'OFF', allumes = refs('ON'), eteints = refs('OFF');
  return n => (base ? !allumes.has(n) : eteints.has(n));
}

/** Les annotations qui se dessinent (commentaires, tampons, champs), hors liens et bulles. */
function annotations(doc: DocumentPdf, page: Dict): number {
  return (doc.tableau(page, 'Annots') ?? []).map(a => doc.resoudre(a)).filter(a => estDict(a) && !['Link', 'Popup'].includes(String(doc.valeur(a, 'Subtype')))).length;
}
