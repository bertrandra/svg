// Assembler et defaire : inserer un dessin dans un autre, combiner des formes en une seule, separer
// un chemin en ses sous-chemins, coller des formes copiees.

import type { Boite, Chemin, Commande, DessinSvg, Forme } from './types.js';
import { boiteForme, echelle, multiplier, transformerChemin, translation, unir } from './geometrie.js';
import { prochainId } from './operations.js';
import { echellerTrait } from './trait.js';
import { avecOrigines, originesDe } from './provenance.js';
import { avecTexteTransforme, relierCopies } from './texteVivant.js';

/**
 * Insere les formes visibles d'un autre dessin au premier plan, ramenees dans la boite cible en
 * gardant leurs proportions, centrees ; rend les identifiants nouveaux.
 */
export function inserer(dessin: DessinSvg, autre: DessinSvg, cible: Boite): { dessin: DessinSvg; ids: string[] } {
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

/**
 * Reunir les formes choisies en une seule, au style et a la place de la plus haute dans
 * l'empilement : un chemin a plusieurs sous-chemins, que la regle pair-impair sait creuser.
 */
export function combiner(dessin: DessinSvg, ids: readonly string[]): { dessin: DessinSvg; id: string | null } {
  const voulus = new Set(ids);
  const choisies = dessin.formes.filter(f => voulus.has(f.id) && !f.verrouille);
  const haute = choisies[choisies.length - 1];
  if (!haute || choisies.length < 2) return { dessin, id: null };
  // La forme unie descend de toutes les autres : elle garde leurs origines, pas seulement celles de la plus haute.
  const unie: Forme = avecOrigines({ ...haute, d: choisies.flatMap(f => f.d) }, originesDe(choisies));
  const formes = dessin.formes.filter(f => !voulus.has(f.id) || f.verrouille || f === haute).map(f => (f === haute ? unie : f));
  return { dessin: { ...dessin, formes }, id: unie.id };
}

/** Les sous-chemins d'un chemin : chacun commence a un M. */
export function sousChemins(d: Chemin): Chemin[] {
  const r: Commande[][] = [];
  for (const c of d) {
    if (c.c === 'M' || !r.length) r.push([]);
    r[r.length - 1]?.push(c);
  }
  return r.filter(s => s.length > 1);
}

/** Separer une forme en une forme par sous-chemin, a sa place dans l'empilement ; rend les identifiants. */
export function separer(dessin: DessinSvg, id: string): { dessin: DessinSvg; ids: string[] } {
  const forme = dessin.formes.find(f => f.id === id);
  const parts = forme ? sousChemins(forme.d) : [];
  if (!forme || parts.length < 2) return { dessin, ids: forme ? [forme.id] : [] };
  let n = prochainId(dessin);
  const nouvelles: Forme[] = parts.map((d, i) => ({ ...forme, id: i === 0 ? forme.id : 'f' + n++, d }));
  const ids = nouvelles.map(f => f.id);
  return { dessin: { ...dessin, formes: dessin.formes.flatMap(f => (f.id === id ? nouvelles : [f])) }, ids };
}

/** Coller des formes copiees, au premier plan, decalees ; rend les identifiants nouveaux. */
export function coller(dessin: DessinSvg, formes: readonly Forme[], dx = 0, dy = 0): { dessin: DessinSvg; ids: string[] } {
  let n = prochainId(dessin);
  const ids: string[] = [], copies = new Map<string, string>();
  const copiees = formes.map(f => {
    const id = 'f' + n++;
    ids.push(id);
    copies.set(f.id, id);
    return dx || dy ? avecTexteTransforme({ ...f, id, verrouille: false, visible: true, d: transformerChemin(f.d, translation(dx, dy)) }, f, translation(dx, dy)) : { ...f, id, verrouille: false, visible: true };
  });
  // Un texte pose colle avec sa forme se pose sur la copie de la forme (ADR-0031) ; colle seul, il redevient libre.
  const nouvelles = relierCopies(copiees, copies);
  return { dessin: nouvelles.length ? { ...dessin, formes: [...dessin.formes, ...nouvelles] } : dessin, ids };
}
