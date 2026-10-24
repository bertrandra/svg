// Le nettoyage d'un trace automatique : poussieres, voisines de meme style, plan de travail.
// Chaque operation garde le rendu, ou dit ce qu'elle retire.

import type { Boite, DessinSvg, Forme } from './types.js';
import { boiteForme, seCroisent, unir } from './geometrie.js';
import { opaciteDuContour, opaciteDuRemplissage } from './opacites.js';
import { memeTrait } from './trait.js';

/** Retirer les formes pleines dont la boite couvre moins de `part` du plan de travail : les poussieres du trace. */
export function retirerPetites(dessin: DessinSvg, part: number): { dessin: DessinSvg; retirees: number } {
  const seuil = dessin.vb[2] * dessin.vb[3] * part;
  const formes = dessin.formes.filter(f => {
    if (f.verrouille || !f.remplissage || f.contour) return true;
    const b = boiteForme(f);
    return !b || b.l * b.h >= seuil;
  });
  const retirees = dessin.formes.length - formes.length;
  return { dessin: retirees ? { ...dessin, formes } : dessin, retirees };
}

const memeStyle = (a: Forme, b: Forme) => a.remplissage === b.remplissage && a.contour === b.contour && a.epaisseur === b.epaisseur && memeTrait(a, b)
  && a.opacite === b.opacite && opaciteDuRemplissage(a) === opaciteDuRemplissage(b) && opaciteDuContour(a) === opaciteDuContour(b) && a.regle === b.regle && a.visible === b.visible && !a.verrouille && !b.verrouille;

/**
 * Reunir en un seul chemin les formes voisines dans l'empilement qui ont le meme style et ne se
 * chevauchent pas : le rendu est identique (rien ne s'intercale, aucun sens de trace n'interfere)
 * et le calque se lit mieux.
 */
export function regrouper(dessin: DessinSvg): { dessin: DessinSvg; reunies: number } {
  const formes: Forme[] = [];
  let boites: Boite[] = [], reunies = 0;
  for (const f of dessin.formes) {
    const precedente = formes[formes.length - 1], b = boiteForme(f);
    if (precedente && b && memeStyle(precedente, f) && boites.every(x => !seCroisent(x, b))) {
      formes[formes.length - 1] = { ...precedente, d: [...precedente.d, ...f.d] };
      boites.push(b);
      reunies++;
      continue;
    }
    formes.push(f);
    boites = b ? [b] : [];
  }
  return { dessin: reunies ? { ...dessin, formes } : dessin, reunies };
}

/** Ramener le plan de travail au dessin visible, avec une marge en part de sa plus grande dimension. */
export function ajusterPlan(dessin: DessinSvg, marge = 0.02): DessinSvg {
  const b = unir(dessin.formes.filter(f => f.visible).map(f => {
    const x = boiteForme(f), e = f.contour ? f.epaisseur / 2 : 0;
    return x && { x: x.x - e, y: x.y - e, l: x.l + 2 * e, h: x.h + 2 * e };
  }));
  if (!b || !(b.l > 0) || !(b.h > 0)) return dessin;
  const m = Math.max(b.l, b.h) * marge;
  return { ...dessin, vb: [b.x - m, b.y - m, b.l + 2 * m, b.h + 2 * m] };
}
