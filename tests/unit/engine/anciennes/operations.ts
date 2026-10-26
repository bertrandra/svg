// Les corps d'avant le modele v2 des fonctions que l'etape 0 a fait passer par ses points d'extension (ADR-0012, annexe 7 §3) :
// `transformer`, `dupliquer`, `inserer`, `coller` (la transformation d'une feuille passe par `transformerFeuille`), `modifier` (une
// couleur unie retire la peinture non unie du meme cote) et `refusDe` (il consulte ce que les fonctionnalites prennent en charge). Recopies tels quels ; ils ne servent qu'a la loi du dessin plat et
// disparaissent a la bascule (etape 14). Une etape qui change le corps d'une autre fonction y recopie d'abord l'ancien.

import type { Boite, DessinSvg, Forme, Matrice, Reglage } from '../../../../src/engine/editionSvg.js';
import { boiteForme, echelle, facteur, multiplier, transformerChemin, translation, unir } from '../../../../src/engine/edition/geometrie.js';
import { echellerTrait } from '../../../../src/engine/edition/trait.js';
import { prochainId, surFormes } from '../../../../src/engine/edition/operations.js';
import { avecFormesPorteuses, avecTexteTransforme, relierCopie, relierCopies } from '../../../../src/engine/edition/texteVivant.js';
import type { Proprietes } from '../../../../src/engine/edition/ignores.js';

export function transformerAncien(dessin: DessinSvg, ids: readonly string[], m: Matrice): DessinSvg {
  const k = facteur(m);
  return surFormes(dessin, avecFormesPorteuses(dessin, ids), f => avecTexteTransforme({ ...echellerTrait(f, k), d: transformerChemin(f.d, m) }, f, m));
}

export function dupliquerAncien(dessin: DessinSvg, ids: readonly string[], dx = 0, dy = 0): { dessin: DessinSvg; ids: string[] } {
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
    formes.push(dx || dy ? avecTexteTransforme({ ...f, id, verrouille: false, d: transformerChemin(f.d, translation(dx, dy)) }, f, translation(dx, dy)) : { ...f, id, verrouille: false });
  }
  const neuves = new Set(nouveaux);
  return { dessin: nouveaux.length ? { ...dessin, formes: formes.map(f => (neuves.has(f.id) ? relierCopie(f, copies) : f)) } : dessin, ids: nouveaux };
}

export function insererAncien(dessin: DessinSvg, autre: DessinSvg, cible: Boite): { dessin: DessinSvg; ids: string[] } {
  const visibles = autre.formes.filter(f => f.visible);
  const b = unir(visibles.map(boiteForme));
  if (!b || !(cible.l > 0) || !(cible.h > 0)) return { dessin, ids: [] };
  const k = b.l > 0 && b.h > 0 ? Math.min(cible.l / b.l, cible.h / b.h) : 1;
  const m = multiplier(translation(cible.x + (cible.l - b.l * k) / 2 - b.x * k, cible.y + (cible.h - b.h * k) / 2 - b.y * k), echelle(k, k));
  let n = prochainId(dessin);
  const ids: string[] = [], copies = new Map<string, string>();
  const formes = visibles.map(f => {
    const id = 'f' + n++;
    ids.push(id);
    copies.set(f.id, id);
    return avecTexteTransforme({ ...echellerTrait(f, k), id, verrouille: false, d: transformerChemin(f.d, m) }, f, m);
  });
  return { dessin: { ...dessin, formes: [...dessin.formes, ...relierCopies(formes, copies)] }, ids };
}

export function collerAncien(dessin: DessinSvg, formes: readonly Forme[], dx = 0, dy = 0): { dessin: DessinSvg; ids: string[] } {
  let n = prochainId(dessin);
  const ids: string[] = [], copies = new Map<string, string>();
  const copiees = formes.map(f => {
    const id = 'f' + n++;
    ids.push(id);
    copies.set(f.id, id);
    return dx || dy ? avecTexteTransforme({ ...f, id, verrouille: false, visible: true, d: transformerChemin(f.d, translation(dx, dy)) }, f, translation(dx, dy)) : { ...f, id, verrouille: false, visible: true };
  });
  const nouvelles = relierCopies(copiees, copies);
  return { dessin: nouvelles.length ? { ...dessin, formes: [...dessin.formes, ...nouvelles] } : dessin, ids };
}

export function modifierAncien(dessin: DessinSvg, ids: readonly string[], r: Reglage): DessinSvg {
  return surFormes(dessin, ids, f => {
    const champs = Object.keys(r) as (keyof Reglage)[];
    if (champs.every(k => f[k] === r[k])) return f;
    const g = { ...f, ...r } as Forme;
    return g.contour && !f.contour && !(g.epaisseur > 0) ? { ...g, epaisseur: 1 } : g;
  });
}

export function refusDeAncien(pr: Proprietes): string | null {
  if ((pr['clip-path'] && pr['clip-path'] !== 'none') || (pr.mask && pr.mask !== 'none')) return 'un masque ou une découpe';
  if (pr.filter && pr.filter !== 'none') return 'un filtre';
  return null;
}
