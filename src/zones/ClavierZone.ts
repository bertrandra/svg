// Le cadre et le lasso au clavier (ADR-0035, ADR-0011), quand la toile a le focus et que l'outil Cadre ou Lasso est pris. Le
// reticule des outils de trace sert de pointeur : les fleches le deplacent (Maj : dix fois plus loin).
//
// - Cadre, comme une forme a deux coins : Espace ou Entree pose le premier coin au reticule ; les fleches deplacent l'autre (un
//   apercu montre le cadre et les formes qu'il prendra, la region vocale dit combien) ; Entree ou Espace prend les formes du cadre,
//   Maj et Entree les ajoute a la selection ; Echap annule le premier coin.
// - Lasso, comme la plume : Espace pose un point au reticule, Retour arriere retire le dernier ; Entree ferme le lasso (trois
//   points au moins) et prend les formes, Maj et Entree les ajoute ; Echap abandonne les points.
//
// Les points vivent dans la trace de l'interface, comme le premier coin d'une forme : changer d'outil les oublie. Le calcul est pur
// (engine/selection.ts) ; ici, le fil des touches.

import { deplacerReticule, directionDe, pasReticule, type PointPlan } from '../engine/navigation.js';
import { appliquerZone, noeudsDansZone, type EffetZone, type Zone } from '../engine/selection.js';
import { nombreFr } from '../engine/description.js';
import { pluriel } from '../util/texte.js';
import { phraseCoinOppose, phraseReticule } from './annonces.js';
import { phraseZone } from './commandesSelection.js';
import { zoneDe } from './GesteZone.js';
import type { ContexteToile } from './ClavierToile.js';
import type { OutilZone } from './typesEditeur.js';

// Au niveau du contexte d'edition (ADR-0012, annexe 6 §2) ; un dessin plat : ses formes, comme avant.
const dansLaZone = (c: ContexteToile, z: Zone): string[] => noeudsDansZone(c.m.dessin, c.u.contexte?.groupe ?? null, z, { regle: c.u.regleZone, contours: c.u.contours });

/** Ce que la zone prendrait, dit apres la position : « 3 formes à prendre. » */
function aPrendre(c: ContexteToile, outil: OutilZone, points: readonly PointPlan[]): string {
  const z = zoneDe(outil, points);
  const n = z ? dansLaZone(c, z).length : 0;
  return n ? ' ' + pluriel(n, 'forme') + ' à prendre.' : ' Aucune forme à prendre.';
}

/** Prend les formes de la zone, selon l'effet, et le dit ; la trace est oubliee, le reticule reste. */
function prendre(c: ContexteToile, outil: OutilZone, points: readonly PointPlan[], effet: EffetZone): void {
  const { m, ac } = c, z = zoneDe(outil, points);
  const apres = appliquerZone(m.sel, z ? dansLaZone(c, z) : [], effet);
  ac.choisir(apres);
  ac.poserPoint(null);
  ac.poserTrace([]);
  ac.annoncer(phraseZone(outil, effet, m.sel, apres));
}

/** Le premier coin du cadre vient d'etre pose. */
const phrasePremierCoinCadre = (p: PointPlan): string =>
  'Premier coin du cadre posé à ' + nombreFr(p[0]) + ', ' + nombreFr(p[1]) + '. Flèches : déplacer l’autre coin. Entrée : prendre les formes du cadre ; Maj et Entrée : les ajouter. Échap : annuler.';

/** Les touches du cadre et du lasso. Vrai quand la touche est traitee ; `depart` dit ou le reticule apparait. */
export function toucheZone(c: ContexteToile, e: KeyboardEvent, depart: () => PointPlan): boolean {
  const { m, u, ac } = c, outil = u.outil as OutilZone, trace = u.trace, direction = directionDe(e.key);
  if (direction) {
    const p = deplacerReticule(u.curseur ?? depart(), direction, pasReticule(m.dessin.vb, u.grille ? u.pas : null, e.shiftKey), m.dessin.vb);
    const q: PointPlan = [u.aimant(p[0]), u.aimant(p[1])];
    ac.poserCurseur(q);
    const premier = trace[0];
    if (outil === 'cadre' && premier && trace.length === 1) ac.annoncer(phraseCoinOppose(premier, q) + aPrendre(c, outil, [premier, q]));
    else if (outil === 'lasso' && trace.length >= 2) ac.annoncer(phraseReticule(q) + aPrendre(c, outil, [...trace, q]));
    else ac.annoncer(phraseReticule(q));
    return true;
  }
  if (e.key === 'Escape' && trace.length) { ac.poserTrace([]); ac.dire(outil === 'cadre' ? 'Premier coin annulé : l’outil reste pris.' : 'Lasso abandonné : l’outil reste pris.'); return true; }
  const p = u.curseur ?? depart(), effet: EffetZone = e.shiftKey ? 'ajouter' : 'remplacer';
  if (outil === 'cadre') {
    if (e.key !== ' ' && e.key !== 'Enter') return false;
    const premier = trace[0];
    if (!premier || trace.length !== 1) { ac.poserTrace([p]); ac.poserCurseur(p); ac.dire(phrasePremierCoinCadre(p)); return true; }
    prendre(c, outil, [premier, p], effet);
    return true;
  }
  if (e.key === ' ') {
    ac.poserTrace([...trace, p]);
    ac.poserCurseur(p);
    ac.annoncer('Point ' + (trace.length + 1) + ' du lasso posé. ' + phraseReticule(p) + (trace.length + 1 < 3 ? ' Il en faut trois pour fermer.' : ' Entrée ferme le lasso.'));
    return true;
  }
  if (e.key === 'Backspace' && trace.length) { ac.poserTrace(trace.slice(0, -1)); ac.annoncer(pluriel(trace.length - 1, 'point') + ' dans le lasso.'); return true; }
  if (e.key !== 'Enter') return false;
  // Le reticule compte comme dernier point s'il a bouge depuis le dernier point pose.
  const dernier = trace[trace.length - 1];
  const points = u.curseur && (!dernier || dernier[0] !== u.curseur[0] || dernier[1] !== u.curseur[1]) ? [...trace, u.curseur] : [...trace];
  if (points.length < 3) { ac.annoncer('Posez au moins trois points (Espace) avant de fermer le lasso.'); return true; }
  prendre(c, outil, points, effet);
  return true;
}
