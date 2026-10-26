// Les corps d'avant l'etape 1 du modele v2 (ADR-0012, groupes : le moteur) des fonctions dont l'etape a change le corps pour leur
// donner un chemin riche derriere `estPlat` (annexe 3 §1). Recopies tels quels ; ils ne servent qu'a la loi du dessin plat et
// disparaissent a la bascule (etape 14). `transformer`, `dupliquer`, `coller`, `inserer` et `modifier` ont deja les leurs
// (operations.ts, recopies a l'etape 0).

import clipping, { type MultiPolygon } from 'polygon-clipping';
import type { Alignement, Boite, Chemin, DessinSvg, Forme, Ordre, Style, Visibilites } from '../../../../src/engine/editionSvg.js';
import { avecOrigines, originesDe } from '../../../../src/engine/editionSvg.js';
import { boiteForme, seCroisent, translation, unir } from '../../../../src/engine/edition/geometrie.js';
import { surFormes } from '../../../../src/engine/edition/operations.js';
import { reglerTrait, memeTrait, type ReglageTrait } from '../../../../src/engine/edition/trait.js';
import { suitUneFormeChoisie } from '../../../../src/engine/edition/texteVivant.js';
import { opaciteDuContour, opaciteDuRemplissage } from '../../../../src/engine/edition/opacites.js';
import { boiteAvecTrait } from '../../../../src/engine/edition/etendue.js';
import { cheminDeRegion, cheminLisseDeRegion, regionDeForme, toleranceBooleen, type Booleen, type OptionsBooleen } from '../../../../src/engine/booleens.js';
import { transformerAncien } from './operations.js';

// ---------------------------------------------------------------- geometrie.ts

export function boiteDeAncien(dessin: DessinSvg, ids: readonly string[]): Boite | null {
  const voulus = new Set(ids);
  return unir(dessin.formes.filter(f => voulus.has(f.id)).map(boiteForme));
}

// ---------------------------------------------------------------- operations.ts

export function prochainIdAncien(dessin: DessinSvg): number {
  return dessin.formes.reduce((m, f) => Math.max(m, Number(/^f(\d+)$/.exec(f.id)?.[1] ?? 0)), 0) + 1;
}

const deplacerAncien = (dessin: DessinSvg, ids: readonly string[], dx: number, dy: number): DessinSvg =>
  dx === 0 && dy === 0 ? dessin : transformerAncien(dessin, ids, translation(dx, dy));

export function alignerAncien(dessin: DessinSvg, ids: readonly string[], a: Alignement): DessinSvg {
  const [vx, vy, vl, vh] = dessin.vb;
  const ref = ids.length > 1 ? boiteDeAncien(dessin, ids) : { x: vx, y: vy, l: vl, h: vh };
  if (!ref) return dessin;
  let r = dessin;
  for (const id of ids) {
    if (suitUneFormeChoisie(dessin, id, ids)) continue;
    const b = boiteDeAncien(r, [id]);
    if (!b) continue;
    const dx = a === 'gauche' ? ref.x - b.x : a === 'droite' ? ref.x + ref.l - b.x - b.l : a === 'centreH' ? ref.x + ref.l / 2 - b.x - b.l / 2 : 0;
    const dy = a === 'haut' ? ref.y - b.y : a === 'bas' ? ref.y + ref.h - b.y - b.h : a === 'centreV' ? ref.y + ref.h / 2 - b.y - b.h / 2 : 0;
    r = deplacerAncien(r, [id], dx, dy);
  }
  return r;
}

export const modifierTraitAncien = (dessin: DessinSvg, ids: readonly string[], r: ReglageTrait): DessinSvg => surFormes(dessin, ids, f => reglerTrait(f, r));

export function supprimerAncien(dessin: DessinSvg, ids: readonly string[]): DessinSvg {
  const voulus = new Set(ids);
  const formes = dessin.formes.filter(f => !voulus.has(f.id));
  return formes.length === dessin.formes.length ? dessin : { ...dessin, formes };
}

export function ordonnerAncien(dessin: DessinSvg, ids: readonly string[], o: Ordre): DessinSvg {
  const voulus = new Set(ids);
  const choisies = dessin.formes.filter(f => voulus.has(f.id)), autres = dessin.formes.filter(f => !voulus.has(f.id));
  if (!choisies.length) return dessin;
  const meme = (t: readonly Forme[]) => t.every((f, i) => f === dessin.formes[i]);
  if (o === 'premier' || o === 'dernier') {
    const t = o === 'premier' ? [...autres, ...choisies] : [...choisies, ...autres];
    return meme(t) ? dessin : { ...dessin, formes: t };
  }
  const t = [...dessin.formes];
  if (o === 'avant') {
    for (let i = t.length - 2; i >= 0; i--) {
      const a = t[i], b = t[i + 1];
      if (a && b && voulus.has(a.id) && !voulus.has(b.id)) { t[i] = b; t[i + 1] = a; }
    }
  } else {
    for (let i = 1; i < t.length; i++) {
      const a = t[i - 1], b = t[i];
      if (a && b && voulus.has(b.id) && !voulus.has(a.id)) { t[i - 1] = b; t[i] = a; }
    }
  }
  return meme(t) ? dessin : { ...dessin, formes: t };
}

export function montrerSeulementAncien(dessin: DessinSvg, ids: readonly string[]): DessinSvg {
  const voulus = new Set(ids);
  let change = false;
  const formes = dessin.formes.map(f => {
    const visible = voulus.has(f.id);
    if (f.visible === visible) return f;
    change = true;
    return { ...f, visible };
  });
  return change ? { ...dessin, formes } : dessin;
}

// ---------------------------------------------------------------- assemblage.ts

export function combinerAncien(dessin: DessinSvg, ids: readonly string[]): { dessin: DessinSvg; id: string | null } {
  const voulus = new Set(ids);
  const choisies = dessin.formes.filter(f => voulus.has(f.id) && !f.verrouille);
  const haute = choisies[choisies.length - 1];
  if (!haute || choisies.length < 2) return { dessin, id: null };
  const unie: Forme = avecOrigines({ ...haute, d: choisies.flatMap(f => f.d) }, originesDe(choisies));
  const formes = dessin.formes.filter(f => !voulus.has(f.id) || f.verrouille || f === haute).map(f => (f === haute ? unie : f));
  return { dessin: { ...dessin, formes }, id: unie.id };
}

// ---------------------------------------------------------------- nettoyage.ts

export function retirerPetitesAncien(dessin: DessinSvg, part: number): { dessin: DessinSvg; retirees: number } {
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

export function regrouperAncien(dessin: DessinSvg): { dessin: DessinSvg; reunies: number } {
  const formes: Forme[] = [];
  let boites: Boite[] = [], reunies = 0;
  for (const f of dessin.formes) {
    const precedente = formes[formes.length - 1], b = boiteForme(f);
    if (precedente && b && memeStyle(precedente, f) && boites.every(x => !seCroisent(x, b))) {
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

export function ajusterPlanAncien(dessin: DessinSvg, marge = 0.02): DessinSvg {
  const b = unir(dessin.formes.filter(f => f.visible).map(boiteAvecTrait));
  if (!b || !(b.l > 0) || !(b.h > 0)) return dessin;
  const m = Math.max(b.l, b.h) * marge;
  return { ...dessin, vb: [b.x - m, b.y - m, b.l + 2 * m, b.h + 2 * m] };
}

// ---------------------------------------------------------------- isolement.ts

export const visibilitesDeAncien = (dessin: DessinSvg): Visibilites => new Map(dessin.formes.map(f => [f.id, f.visible]));

export function restaurerVisibilitesAncien(dessin: DessinSvg, avant: Visibilites): DessinSvg {
  let change = false;
  const formes = dessin.formes.map(f => {
    const v = avant.get(f.id);
    if (v === undefined || v === f.visible) return f;
    change = true;
    return { ...f, visible: v };
  });
  return change ? { ...dessin, formes } : dessin;
}

export function visibilitesConformesAncien(dessin: DessinSvg, ref: Visibilites): boolean {
  return dessin.formes.every(f => { const v = ref.get(f.id); return v === undefined || v === f.visible; });
}

// ---------------------------------------------------------------- formes.ts

export function ajouterFormeAncien(dessin: DessinSvg, d: Chemin, style: Style, regle: Forme['regle'] = 'nonzero'): { dessin: DessinSvg; id: string | null } {
  if (!d.length) return { dessin, id: null };
  const id = 'f' + prochainIdAncien(dessin);
  const contour = style.contour, remplissage = style.remplissage ?? (contour ? null : '#000000');
  const forme: Forme = { id, d, remplissage, contour, epaisseur: contour ? style.epaisseur || 1 : 0, opacite: 1, regle, visible: true, verrouille: false };
  return { dessin: { ...dessin, formes: [...dessin.formes, forme] }, id };
}

// ---------------------------------------------------------------- booleens.ts

const pleine = (f: Forme) => f.remplissage !== null;

export function appliquerBooleenAncien(dessin: DessinSvg, ids: readonly string[], op: Booleen, tolerance = toleranceBooleen(dessin), options: OptionsBooleen = {}): { dessin: DessinSvg; id: string | null; erreur?: string } {
  const voulus = new Set(ids);
  const choisies = dessin.formes.filter(f => voulus.has(f.id) && !f.verrouille && f.visible);
  if (choisies.length < 2) return { dessin, id: null, erreur: 'Choisissez au moins deux formes visibles et déverrouillées.' };
  if (!choisies.every(pleine)) return { dessin, id: null, erreur: 'Une forme sans remplissage n’a pas d’aire : donnez-lui une couleur, ou retirez-la de la sélection.' };
  const regions = choisies.map(f => regionDeForme(f, tolerance));
  const [premiere, ...autres] = regions;
  if (!premiere) return { dessin, id: null };
  let resultat: MultiPolygon;
  if (op === 'union') resultat = clipping.union(premiere, ...autres);
  else if (op === 'intersection') resultat = clipping.intersection(premiere, ...autres);
  else if (op === 'soustraction') resultat = clipping.difference(premiere, ...autres);
  else resultat = clipping.xor(premiere, ...autres);
  const courbe = options.lisser === true && choisies.some(f => f.d.some(c => c.c === 'C' || c.c === 'Q'));
  const d = courbe ? cheminLisseDeRegion(resultat, tolerance) : cheminDeRegion(resultat);
  const basse = choisies[0];
  if (!basse) return { dessin, id: null };
  if (!d.length) {
    return { dessin: { ...dessin, formes: dessin.formes.filter(f => !voulus.has(f.id) || f.verrouille || !f.visible) }, id: null };
  }
  const forme: Forme = avecOrigines({ ...basse, id: 'f' + prochainIdAncien(dessin), d, regle: 'nonzero' }, originesDe(choisies));
  const formes = dessin.formes.flatMap(f => (f === basse ? [forme] : voulus.has(f.id) && !f.verrouille && f.visible ? [] : [f]));
  return { dessin: { ...dessin, formes }, id: forme.id };
}
