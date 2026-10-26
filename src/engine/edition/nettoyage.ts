// Le nettoyage d'un trace automatique : poussieres, voisines de meme style, plan de travail.
// Chaque operation garde le rendu, ou dit ce qu'elle retire. Un dessin a groupes (ADR-0012, etape 1, annexe 3 §2) prend son chemin
// riche derriere `estPlat` : un dessin plat, celui d'avant.

import type { Boite, DessinSvg, Forme } from './types.js';
import { boiteForme, seCroisent, unir } from './geometrie.js';
import { opaciteDuContour, opaciteDuRemplissage } from './opacites.js';
import { boiteAvecTrait, boiteVisuelle } from './etendue.js';
import { arbreDe, estPlat, normaliser } from './arbre.js';
import { egales } from './groupes.js';
import { memeTrait } from './trait.js';
import { avecOrigines } from './provenance.js';

/** Retirer les formes pleines dont la boite couvre moins de `part` du plan de travail : les poussieres du trace. */
export function retirerPetites(dessin: DessinSvg, part: number): { dessin: DessinSvg; retirees: number } {
  const seuil = dessin.vb[2] * dessin.vb[3] * part;
  const formes = dessin.formes.filter(f => {
    if (f.verrouille || !f.remplissage || f.contour) return true;
    const b = boiteForme(f);
    return !b || b.l * b.h >= seuil;
  });
  const retirees = dessin.formes.length - formes.length;
  // Le chemin riche : un groupe dont toutes les formes sont parties part avec elles (normaliser, arbre.ts).
  if (!estPlat(dessin)) return { dessin: retirees ? normaliser({ ...dessin, formes }) : dessin, retirees };
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
  const riche = !estPlat(dessin);
  // Le chemin riche : jamais deux formes de groupes differents, ni deux peintures ou effets differents, ni un texte ou une image.
  const reunissables = riche ? (a: Forme, b: Forme) => memeStyle(a, b) && memeStyleRiche(a, b) : memeStyle;
  const formes: Forme[] = [];
  let boites: Boite[] = [], reunies = 0;
  for (const f of dessin.formes) {
    const precedente = formes[formes.length - 1], b = boiteForme(f);
    if (precedente && b && reunissables(precedente, f) && boites.every(x => !seCroisent(x, b))) {
      formes[formes.length - 1] = avecOrigines({ ...precedente, d: [...precedente.d, ...f.d] }, f.origine ?? []);
      boites.push(b);
      reunies++;
      continue;
    }
    formes.push(f);
    boites = b ? [b] : [];
  }
  return { dessin: reunies ? { ...dessin, formes } : dessin, reunies };
}

/** Ce que le modele v2 ajoute a « meme style » (annexe 3 §2) : meme parent, memes peintures, memes effets, ni texte ni image. */
const memeStyleRiche = (a: Forme, b: Forme): boolean => a.parent === b.parent && egales(a.peintureRemplissage, b.peintureRemplissage)
  && egales(a.peintureContour, b.peintureContour) && egales(a.effets, b.effets) && !a.texte && !b.texte && !a.image && !b.image;

/**
 * Ramener le plan de travail au dessin visible, avec une marge en part de sa plus grande dimension. La boite de
 * chaque forme compte son contour tel qu'il se peint (`boiteAvecTrait`) : pointes de jonction et bouts carres
 * depassent la demi-epaisseur, et un plan trop juste les couperait.
 */
export function ajusterPlan(dessin: DessinSvg, marge = 0.02): DessinSvg {
  const b = estPlat(dessin) ? unir(dessin.formes.filter(f => f.visible).map(boiteAvecTrait)) : boiteVisibleRiche(dessin);
  if (!b || !(b.l > 0) || !(b.h > 0)) return dessin;
  const m = Math.max(b.l, b.h) * marge;
  return { ...dessin, vb: [b.x - m, b.y - m, b.l + 2 * m, b.h + 2 * m] };
}

/**
 * Le chemin riche d'`ajusterPlan` : les noeuds visibles par heritage (un groupe masque masque ses formes), chacun par sa boite
 * visuelle (etendue.ts : la decoupe d'un groupe la rogne, ses effets l'elargissent).
 */
function boiteVisibleRiche(dessin: DessinSvg): Boite | null {
  const visibles = arbreDe(dessin).racine.filter(n => (n.genre === 'feuille' ? n.forme.visible : n.groupe.visible));
  return unir(visibles.map(n => boiteVisuelle(dessin, n.genre === 'feuille' ? n.forme.id : n.groupe.id)));
}
