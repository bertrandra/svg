// Les operations sur les formes choisies par identifiant : deplacer, retourner, tourner,
// redimensionner, aligner, regler, supprimer, dupliquer, ordonner, masquer. Chacune est pure et
// rend un nouveau dessin, ou le meme objet quand rien ne change (l'historique s'en sert).

import type { Boite, DessinSvg, Forme, Matrice } from './types.js';
import { echellerTrait, reglerTrait, type ReglageTrait } from './trait.js';
import { boiteDe, echelle, facteur, multiplier, rotation, transformerChemin, translation } from './geometrie.js';

export function surFormes(dessin: DessinSvg, ids: readonly string[], f: (forme: Forme) => Forme): DessinSvg {
  const voulus = new Set(ids);
  let change = false;
  const formes = dessin.formes.map(x => {
    if (!voulus.has(x.id)) return x;
    const y = f(x);
    if (y !== x) change = true;
    return y;
  });
  return change ? { ...dessin, formes } : dessin;
}

export function transformer(dessin: DessinSvg, ids: readonly string[], m: Matrice): DessinSvg {
  const k = facteur(m);
  return surFormes(dessin, ids, f => ({ ...echellerTrait(f, k), d: transformerChemin(f.d, m) }));
}

export const deplacer = (dessin: DessinSvg, ids: readonly string[], dx: number, dy: number): DessinSvg =>
  dx === 0 && dy === 0 ? dessin : transformer(dessin, ids, translation(dx, dy));

/** Retourner la selection autour du centre de sa boite. */
export function retourner(dessin: DessinSvg, ids: readonly string[], axe: 'h' | 'v'): DessinSvg {
  const b = boiteDe(dessin, ids);
  if (!b) return dessin;
  return transformer(dessin, ids, axe === 'h' ? echelle(-1, 1, b.x + b.l / 2, 0) : echelle(1, -1, 0, b.y + b.h / 2));
}

export function tourner(dessin: DessinSvg, ids: readonly string[], degres: number): DessinSvg {
  const b = boiteDe(dessin, ids);
  if (!b) return dessin;
  return transformer(dessin, ids, rotation(degres, b.x + b.l / 2, b.y + b.h / 2));
}

/** Donner a la selection une boite nouvelle, a partir de son coin haut gauche. */
export function redimensionner(dessin: DessinSvg, ids: readonly string[], cible: Boite): DessinSvg {
  const b = boiteDe(dessin, ids);
  if (!b || !(cible.l > 0) || !(cible.h > 0)) return dessin;
  const sx = b.l > 0 ? cible.l / b.l : 1, sy = b.h > 0 ? cible.h / b.h : 1;
  return transformer(dessin, ids, multiplier(translation(cible.x - b.x, cible.y - b.y), echelle(sx, sy, b.x, b.y)));
}

export type Alignement = 'gauche' | 'centreH' | 'droite' | 'haut' | 'centreV' | 'bas';

/** Aligner chaque forme sur la boite de la selection, ou sur le plan de travail pour une seule. */
export function aligner(dessin: DessinSvg, ids: readonly string[], a: Alignement): DessinSvg {
  const [vx, vy, vl, vh] = dessin.vb;
  const ref = ids.length > 1 ? boiteDe(dessin, ids) : { x: vx, y: vy, l: vl, h: vh };
  if (!ref) return dessin;
  let r = dessin;
  for (const id of ids) {
    const b = boiteDe(r, [id]);
    if (!b) continue;
    const dx = a === 'gauche' ? ref.x - b.x : a === 'droite' ? ref.x + ref.l - b.x - b.l : a === 'centreH' ? ref.x + ref.l / 2 - b.x - b.l / 2 : 0;
    const dy = a === 'haut' ? ref.y - b.y : a === 'bas' ? ref.y + ref.h - b.y - b.h : a === 'centreV' ? ref.y + ref.h / 2 - b.y - b.h / 2 : 0;
    r = deplacer(r, [id], dx, dy);
  }
  return r;
}

export type Reglage = Partial<Pick<Forme, 'remplissage' | 'contour' | 'epaisseur' | 'opacite' | 'opaciteRemplissage' | 'opaciteContour' | 'regle' | 'visible' | 'verrouille'>>;

export function modifier(dessin: DessinSvg, ids: readonly string[], r: Reglage): DessinSvg {
  return surFormes(dessin, ids, f => {
    const champs = Object.keys(r) as (keyof Reglage)[];
    if (champs.every(k => f[k] === r[k])) return f;
    const g = { ...f, ...r } as Forme;
    // Un trait qui apparait prend une epaisseur visible ; un trait deja la garde, zero compris (un trait invisible reste a l'utilisateur).
    return g.contour && !f.contour && !(g.epaisseur > 0) ? { ...g, epaisseur: 1 } : g;
  });
}

/** Regler le style du trait (pointilles, bout, jonction, limite de pointe) des formes choisies ; le meme dessin si rien ne change. */
export const modifierTrait = (dessin: DessinSvg, ids: readonly string[], r: ReglageTrait): DessinSvg => surFormes(dessin, ids, f => reglerTrait(f, r));

export function supprimer(dessin: DessinSvg, ids: readonly string[]): DessinSvg {
  const voulus = new Set(ids);
  const formes = dessin.formes.filter(f => !voulus.has(f.id));
  return formes.length === dessin.formes.length ? dessin : { ...dessin, formes };
}

export function prochainId(dessin: DessinSvg): number {
  return dessin.formes.reduce((m, f) => Math.max(m, Number(/^f(\d+)$/.exec(f.id)?.[1] ?? 0)), 0) + 1;
}

/** Copier la selection juste au-dessus de chaque original, decalee ; rend les nouveaux identifiants. */
export function dupliquer(dessin: DessinSvg, ids: readonly string[], dx = 0, dy = 0): { dessin: DessinSvg; ids: string[] } {
  const voulus = new Set(ids);
  let n = prochainId(dessin);
  const nouveaux: string[] = [];
  const formes: Forme[] = [];
  for (const f of dessin.formes) {
    formes.push(f);
    if (!voulus.has(f.id)) continue;
    const id = 'f' + n++;
    nouveaux.push(id);
    formes.push({ ...f, id, verrouille: false, d: dx || dy ? transformerChemin(f.d, translation(dx, dy)) : f.d });
  }
  return { dessin: nouveaux.length ? { ...dessin, formes } : dessin, ids: nouveaux };
}

export type Ordre = 'premier' | 'avant' | 'arriere' | 'dernier';

/** Changer la place des formes dans l'empilement ; `premier` est le premier plan, en haut. */
export function ordonner(dessin: DessinSvg, ids: readonly string[], o: Ordre): DessinSvg {
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

/** N'afficher que ces formes : toutes les autres se masquent. */
export function montrerSeulement(dessin: DessinSvg, ids: readonly string[]): DessinSvg {
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
