// Le corps d'avant le paquet 2-D (ADR-0012, annexe 7 §3, « loi du dessin plat ») de `genreDeForme` (engine/description.ts) : une
// image integree se dit desormais « image PNG » et non par le cadre de son chemin (« rectangle »). Recopie tel quel, avec ses aides
// privees ; il ne sert qu'a la loi du dessin plat et disparait a la bascule (etape 14).

import { ancre, boiteForme, estEllipseChemin, reconnaitreFormeDeBase, type Chemin, type Forme } from '../../../../src/engine/editionSvg.js';

const proche = (a: number, b: number, tolerance: number): boolean => Math.abs(a - b) <= tolerance;
const points = (d: Chemin): [number, number][] => d.flatMap(c => { const a = ancre(c); return a ? [a] : []; });

function estRectangle(d: Chemin, tol: number): boolean {
  if (d.some(c => c.c !== 'M' && c.c !== 'L' && c.c !== 'Z')) return false;
  let p = points(d);
  const [p0, dernier] = [p[0], p[p.length - 1]];
  if (p.length === 5 && p0 && dernier && proche(p0[0], dernier[0], tol) && proche(p0[1], dernier[1], tol)) p = p.slice(0, 4);
  if (p.length !== 4) return false;
  return p.every((a, i) => {
    const b = p[(i + 1) % 4];
    return !!b && (proche(a[0], b[0], tol) || proche(a[1], b[1], tol));
  });
}

const estEllipse = (f: Forme, tol: number): boolean => estEllipseChemin(f.d, tol);

function estEtoile(d: Chemin): boolean {
  const p = points(d);
  if (p.length !== 10 || d.some(c => c.c !== 'M' && c.c !== 'L' && c.c !== 'Z')) return false;
  const centre = [p.reduce((s, a) => s + a[0], 0) / p.length, p.reduce((s, a) => s + a[1], 0) / p.length] as const;
  const r = p.map(a => Math.hypot(a[0] - centre[0], a[1] - centre[1]));
  const pairs = r.filter((_, i) => i % 2 === 0), impairs = r.filter((_, i) => i % 2 === 1);
  const moy = (t: number[]) => t.reduce((s, v) => s + v, 0) / t.length;
  const [mp, mi] = [moy(pairs), moy(impairs)];
  return mp > 0 && mi > 0 && Math.abs(mp - mi) > 0.2 * Math.max(mp, mi)
    && pairs.every(v => proche(v, mp, 0.1 * mp)) && impairs.every(v => proche(v, mi, 0.1 * mi));
}

export function genreDeFormeAncien(f: Forme): string {
  if (f.texte) { const t = f.texte.texte.replace(/\s+/g, ' ').trim(); return 'texte « ' + (t.length > 30 ? t.slice(0, 29) + '…' : t) + ' »'; }
  const b = boiteForme(f);
  if (!b) return 'tracé vide';
  const tol = Math.max(b.l, b.h) * 0.002 + 1e-9;
  const d = f.d, ferme = d.some(c => c.c === 'Z');
  const courbe = d.some(c => c.c === 'C' || c.c === 'Q');
  if (!courbe) {
    const n = points(d).length;
    if (!ferme) return n === 2 ? 'ligne' : 'ligne brisée';
    if (estRectangle(d, tol)) return proche(b.l, b.h, tol) ? 'carré' : 'rectangle';
    if (estEtoile(d)) return 'étoile';
    if (n === 3) return 'triangle';
    return reconnaitreFormeDeBase(d) ?? 'polygone à ' + n + ' sommets';
  }
  if (ferme && estEllipse(f, tol)) return proche(b.l, b.h, tol) ? 'cercle' : 'ellipse';
  return reconnaitreFormeDeBase(d) ?? (ferme ? 'tracé courbe' : 'courbe');
}
