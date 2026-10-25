// Ce que montre une ligne de « Toutes les polices » (ADR-0026) : le nom dessine dans sa propre fonte quand on l'a deja (une
// fonte livree, deposee ou telechargee dans la session), sinon l'apercu prepare de l'annexe, sinon le nom ecrit dans la police
// de l'interface. Rien ici ne telecharge : une police qu'on n'a pas ne se dessine que par l'annexe, un fichier voisin.
//
// Chaque apercu se calcule une fois (ADR-0008) : par police (une fonte lue est un objet stable de la session) et par annexe.

import { decoderApercu, type AnnexeApercus, type TraceApercu } from '../model/apercusPolices.js';
import { tracerNom } from '../engine/texte/apercuNom.js';
import type { Police } from '../io/polices.js';

/** L'apercu d'une ligne : un trace et sa peinture (plein, ou au trait pour une police a trait unique), ou le nom ecrit. */
export type ApercuLigne =
  | { readonly source: 'disponible' | 'prepare'; readonly trace: TraceApercu; readonly plein: boolean }
  | { readonly source: 'nom' };

const parPolice = new WeakMap<Police, Map<string, TraceApercu | null>>();
const parAnnexe = new WeakMap<AnnexeApercus, Map<string, TraceApercu | null>>();

/** Le nom dessine dans une police chargee, calcule une fois par police et par nom ; null s'il ne se dessine pas. */
export function apercuDePolice(p: Police, nom: string): TraceApercu | null {
  let m = parPolice.get(p);
  if (!m) { m = new Map(); parPolice.set(p, m); }
  if (!m.has(nom)) {
    let t: TraceApercu | null;
    // Une fonte deposee peut etre etrange : un apercu qui ne se calcule pas laisse le nom ecrit, il ne casse pas la liste.
    try { t = tracerNom(nom, p.glyphes); } catch { t = null; }
    m.set(nom, t);
  }
  return m.get(nom) ?? null;
}

/** L'apercu prepare d'une famille (par sa cle `depot:id`), decode une fois ; null s'il manque ou ne se decode pas. */
export function apercuPrepare(a: AnnexeApercus, cle: string): TraceApercu | null {
  let m = parAnnexe.get(a);
  if (!m) { m = new Map(); parAnnexe.set(a, m); }
  if (!m.has(cle)) {
    const code = a.apercus.get(cle);
    m.set(cle, code === undefined ? null : decoderApercu(code));
  }
  return m.get(cle) ?? null;
}

/**
 * L'apercu d'une ligne : la police disponible d'abord (le vrai fichier, deja lu), puis l'apercu prepare de la famille, puis
 * le nom ecrit. `police` est la fonte chargee de la ligne (ou d'une variante de sa famille), `cle` la cle de la famille dans
 * l'index (absente pour une fonte livree ou deposee).
 */
export function choisirApercu(nom: string, police: Police | null, cle: string | null, annexe: AnnexeApercus | null): ApercuLigne {
  if (police) {
    const t = apercuDePolice(police, nom);
    if (t) return { source: 'disponible', trace: t, plein: police.nature !== 'trait' };
  }
  if (cle && annexe) {
    const t = apercuPrepare(annexe, cle);
    if (t) return { source: 'prepare', trace: t, plein: true };
  }
  return { source: 'nom' };
}
