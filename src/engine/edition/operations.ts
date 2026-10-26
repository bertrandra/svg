// Les operations sur les formes choisies par identifiant : deplacer, retourner, tourner,
// redimensionner, aligner, regler, supprimer, dupliquer, ordonner, masquer. Chacune est pure et
// rend un nouveau dessin, ou le meme objet quand rien ne change (l'historique s'en sert).
//
// Le modele v2 (ADR-0012, etape 1, annexe 3 §2) : une selection peut nommer des groupes. Chaque operation qui doit connaitre l'arbre
// commence par `estPlat` : un dessin plat prend le corps d'avant, sans une ligne commune avec le chemin riche (groupes.ts).

import type { Boite, DessinSvg, Forme, Matrice } from './types.js';
import { reglerTrait, type ReglageTrait } from './trait.js';
import { boiteDe, echelle, facteur, multiplier, rotation, translation } from './geometrie.js';
import { avecFormesPorteuses, relierCopie, suitUneFormeChoisie } from './texteVivant.js';
import { transformerFeuille } from './transformation.js';
import { estPlat, feuillesDe, normaliser, prochainNumero, promouvoir, unites } from './arbre.js';
import { dupliquerNoeuds, groupeDe, montrerSeulementNoeuds, ordonnerNoeuds, reglerGroupes, transformerGroupesDe } from './groupes.js';

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
  if (!estPlat(dessin)) return transformerRiche(dessin, ids, m);
  const k = facteur(m);
  // Un texte vivant suit sa forme : sa matrice de composition prend la transformation (texteVivant.ts). Un texte pose sur une
  // forme (ADR-0031) l'emmene : la forme qui le porte prend la meme transformation, le texte se recompose ensuite sur elle.
  return surFormes(dessin, avecFormesPorteuses(dessin, ids), f => transformerFeuille(f, m, k));
}

/**
 * Le chemin riche : les feuilles des noeuds choisis (et celles des formes qui portent un texte choisi), puis les groupes de la
 * fermeture (annexe 1 §9 : un groupe choisi, ou dont toutes les feuilles le sont), dont la decoupe, le masque et les effets suivent.
 */
function transformerRiche(dessin: DessinSvg, ids: readonly string[], m: Matrice): DessinSvg {
  const fermes = promouvoir(dessin, ids), k = facteur(m);
  const r = surFormes(dessin, avecFormesPorteuses(dessin, feuillesDe(dessin, fermes)), f => transformerFeuille(f, m, k));
  return transformerGroupesDe(r, fermes, m);
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
  if (!estPlat(dessin)) return alignerRiche(dessin, ids, a);
  const [vx, vy, vl, vh] = dessin.vb;
  const ref = ids.length > 1 ? boiteDe(dessin, ids) : { x: vx, y: vy, l: vl, h: vh };
  if (!ref) return dessin;
  let r = dessin;
  for (const id of ids) {
    // Un texte pose sur une forme choisie aussi la suit : l'aligner pour lui-meme deplacerait sa forme une seconde fois.
    if (suitUneFormeChoisie(dessin, id, ids)) continue;
    const b = boiteDe(r, [id]);
    if (!b) continue;
    const dx = a === 'gauche' ? ref.x - b.x : a === 'droite' ? ref.x + ref.l - b.x - b.l : a === 'centreH' ? ref.x + ref.l / 2 - b.x - b.l / 2 : 0;
    const dy = a === 'haut' ? ref.y - b.y : a === 'bas' ? ref.y + ref.h - b.y - b.h : a === 'centreV' ? ref.y + ref.h / 2 - b.y - b.h / 2 : 0;
    r = deplacer(r, [id], dx, dy);
  }
  return r;
}

/** Le chemin riche : chaque UNITE (un groupe en bloc, annexe 3 §2) s'aligne sur la boite de la selection, ou sur le plan seule. */
function alignerRiche(dessin: DessinSvg, ids: readonly string[], a: Alignement): DessinSvg {
  const us = unites(dessin, ids).filter(id => groupeDe(dessin, id) !== undefined || dessin.formes.some(f => f.id === id));
  const [vx, vy, vl, vh] = dessin.vb;
  const ref = us.length > 1 ? boiteDe(dessin, us) : { x: vx, y: vy, l: vl, h: vh };
  if (!ref) return dessin;
  const feuilles = feuillesDe(dessin, us);
  let r = dessin;
  for (const id of us) {
    if (suitUneFormeChoisie(dessin, id, feuilles)) continue;
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
  if (!estPlat(dessin)) return modifierRiche(dessin, ids, r);
  return surFormes(dessin, ids, f => reglerForme(f, r));
}

/** Une forme reglee ; la meme si rien ne change. */
function reglerForme(f: Forme, r: Reglage): Forme {
  const champs = Object.keys(r) as (keyof Reglage)[];
  // Choisir une couleur unie remplace la peinture non unie du meme cote (ADR-0012, annexe 3 §2) ; une forme plate n'en a pas.
  const retireFond = r.remplissage !== undefined && f.peintureRemplissage !== undefined, retireTrait = r.contour !== undefined && f.peintureContour !== undefined;
  if (!retireFond && !retireTrait && champs.every(k => f[k] === r[k])) return f;
  const g = sansPeintures({ ...f, ...r } as Forme, retireFond, retireTrait);
  // Un trait qui apparait prend une epaisseur visible ; un trait deja la garde, zero compris (un trait invisible reste a l'utilisateur).
  return g.contour && !f.contour && !(g.epaisseur > 0) ? { ...g, epaisseur: 1 } : g;
}

/**
 * Le chemin riche (annexe 3 §2) : sur une feuille choisie, tout le reglage ; sur un groupe choisi, la visibilite, le verrou et
 * l'opacite vont au groupe (ils s'heritent sans s'ecrire dans les enfants), la peinture a toutes ses feuilles.
 */
function modifierRiche(dessin: DessinSvg, ids: readonly string[], r: Reglage): DessinSvg {
  const groupes = ids.filter(id => groupeDe(dessin, id) !== undefined);
  if (!groupes.length) return surFormes(dessin, ids, f => reglerForme(f, r));
  const { visible, verrouille, opacite, ...peinture } = r;
  const directes = new Set(ids.filter(id => !groupes.includes(id)));
  const dessous = new Set(feuillesDe(dessin, groupes).filter(id => !directes.has(id)));
  const aPeindre = Object.keys(peinture).length > 0;
  const feuilles = surFormes(dessin, [...directes, ...(aPeindre ? dessous : [])], f => reglerForme(f, directes.has(f.id) ? r : peinture));
  return reglerGroupes(feuilles, groupes, { ...(visible !== undefined ? { visible } : {}), ...(verrouille !== undefined ? { verrouille } : {}), ...(opacite !== undefined ? { opacite } : {}) });
}

/** La forme sans sa peinture non unie de fond et/ou de contour. */
function sansPeintures(f: Forme, fond: boolean, trait: boolean): Forme {
  if (!fond && !trait) return f;
  const { peintureRemplissage, peintureContour, ...reste } = f;
  return {
    ...reste,
    ...(peintureRemplissage && !fond ? { peintureRemplissage } : {}),
    ...(peintureContour && !trait ? { peintureContour } : {})
  };
}

/** Regler le style du trait (pointilles, bout, jonction, limite de pointe) des formes choisies ; le meme dessin si rien ne change. */
export const modifierTrait = (dessin: DessinSvg, ids: readonly string[], r: ReglageTrait): DessinSvg =>
  surFormes(dessin, estPlat(dessin) ? ids : feuillesDe(dessin, ids), f => reglerTrait(f, r));

export function supprimer(dessin: DessinSvg, ids: readonly string[]): DessinSvg {
  // Le chemin riche : un groupe part avec ses feuilles ; les groupes devenus vides partent avec eux (normaliser, arbre.ts).
  if (!estPlat(dessin)) return supprimerRiche(dessin, ids);
  const voulus = new Set(ids);
  const formes = dessin.formes.filter(f => !voulus.has(f.id));
  return formes.length === dessin.formes.length ? dessin : { ...dessin, formes };
}

function supprimerRiche(dessin: DessinSvg, ids: readonly string[]): DessinSvg {
  const voulus = new Set(feuillesDe(dessin, ids));
  const formes = dessin.formes.filter(f => !voulus.has(f.id));
  return formes.length === dessin.formes.length ? dessin : normaliser({ ...dessin, formes });
}

export function prochainId(dessin: DessinSvg): number {
  // Le chemin riche : un seul espace de numeros par dessin, contenus imbriques compris (arbre.ts).
  if (!estPlat(dessin)) return prochainNumero(dessin, 'f');
  return dessin.formes.reduce((m, f) => Math.max(m, Number(/^f(\d+)$/.exec(f.id)?.[1] ?? 0)), 0) + 1;
}

/** Copier la selection juste au-dessus de chaque original, decalee ; rend les nouveaux identifiants. */
export function dupliquer(dessin: DessinSvg, ids: readonly string[], dx = 0, dy = 0): { dessin: DessinSvg; ids: string[] } {
  // Le chemin riche : un groupe se copie avec son sous-arbre, juste au-dessus de lui dans son parent (groupes.ts).
  if (!estPlat(dessin)) return dupliquerNoeuds(dessin, ids, dx, dy);
  const voulus = new Set(ids);
  let n = prochainId(dessin);
  const nouveaux: string[] = [];
  const formes: Forme[] = [];
  const copies = new Map<string, string>();
  for (const f of dessin.formes) {
    formes.push(f);
    if (!voulus.has(f.id)) continue;
    const id = 'f' + n++;
    nouveaux.push(id);
    copies.set(f.id, id);
    formes.push(dx || dy ? { ...transformerFeuille(f, translation(dx, dy), 1), id, verrouille: false } : { ...f, id, verrouille: false });
  }
  // Un texte pose copie avec sa forme se pose sur la copie de la forme (ADR-0031) ; copie seul, il redevient libre.
  const neuves = new Set(nouveaux);
  return { dessin: nouveaux.length ? { ...dessin, formes: formes.map(f => (neuves.has(f.id) ? relierCopie(f, copies) : f)) } : dessin, ids: nouveaux };
}

export type Ordre = 'premier' | 'avant' | 'arriere' | 'dernier';

/** Changer la place des formes dans l'empilement ; `premier` est le premier plan, en haut. */
export function ordonner(dessin: DessinSvg, ids: readonly string[], o: Ordre): DessinSvg {
  // Le chemin riche : chaque noeud parmi ses freres, jamais hors de son parent (groupes.ts).
  if (!estPlat(dessin)) return ordonnerNoeuds(dessin, ids, o);
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
  // Le chemin riche : les noeuds choisis et leurs ancetres se montrent, leurs descendants gardent leur etat (groupes.ts).
  if (!estPlat(dessin)) return montrerSeulementNoeuds(dessin, ids);
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
