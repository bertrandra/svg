// L'apercu « forme / ligne » d'une police (ADR-0021) : le meme texte, rendu deux fois par le moteur, tel que la lame le
// decouperait (des lettres pleines) et tel que le stylo le tracerait (des lignes, sans aucun remplissage). Une police a
// contour donne au stylo un double trait (le pourtour de chaque lettre) ; une police a trait donne a la lame des traits
// epaissis par l'outil « contour en forme » existant. Le verdict est un constat neutre, jamais un refus. Pur.

import { boiteChemin, type Boite, type Chemin, type DessinSvg } from '../editionSvg.js';
import { etendreTraits } from '../contours.js';
import type { NaturePolice } from '../../model/polices.js';

export interface Apercu {
  /** Le trace a dessiner, dans le repere du texte compose. */
  readonly d: Chemin;
  /** Vrai : un fond plein, sans trait ; faux : un trait, sans fond. */
  readonly plein: boolean;
  /** Le verdict, court et neutre, dit sous le rendu et dans son texte alternatif. */
  readonly verdict: string;
}

export interface Apercus { readonly forme: Apercu; readonly ligne: Apercu; readonly boite: Boite | null }

/** Les deux verdicts d'une nature de police : ce que la decoupe, puis le stylo, en feront. */
export function verdictsApercu(nature: NaturePolice): { forme: string; ligne: string } {
  return nature === 'trait'
    ? { forme: 'Police à trait : épaissie pour la découpe.', ligne: 'Une seule ligne : idéale au stylo.' }
    : { forme: 'Lettres pleines : la lame suit leur pourtour.', ligne: 'Au stylo : lettres creuses, double trait.' };
}

/**
 * Les deux apercus d'un texte compose (`d`, ses contours ou ses traces) d'une nature donnee. `epaisseur` est celle du trait
 * (la largeur du stylo, ou le trait d'une police a trait) : c'est elle que la forme de decoupe d'une police a trait epaissit.
 */
export function apercusTexte(d: Chemin, nature: NaturePolice, epaisseur: number): Apercus {
  const v = verdictsApercu(nature), boite = boiteChemin(d);
  if (nature === 'contour') return { forme: { d, plein: true, verdict: v.forme }, ligne: { d, plein: false, verdict: v.ligne }, boite };
  // La forme de decoupe d'une police a trait : ses traits epaissis, comme le ferait « Contour en forme » sur la toile.
  const vb: DessinSvg['vb'] = boite ? [boite.x, boite.y, Math.max(boite.l, 1), Math.max(boite.h, 1)] : [0, 0, 1, 1];
  const seul: DessinSvg = { vb, formes: [{ id: 'f1', d, remplissage: null, contour: '#000000', epaisseur, opacite: 1, regle: 'nonzero', visible: true, verrouille: false, bout: 'round' }] };
  const r = etendreTraits(seul, ['f1'], { lisser: true });
  const epaissi = r.etendus ? r.dessin.formes.flatMap(f => f.d) : d;
  return { forme: { d: epaissi, plein: r.etendus > 0, verdict: v.forme }, ligne: { d, plein: false, verdict: v.ligne }, boite };
}
