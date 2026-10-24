// Les touches de la toile, quand elle a le focus : passer d'une forme ou d'un point a l'autre (Tab,
// PageSuiv, PageReg), et le reticule des outils de trace (fleches pour le deplacer, Entree pour poser).
// Le choix est dans engine/navigation.ts, pur ; ici, seulement le fil des touches.
//
// Regle de sortie (WCAG 2.1.2) : Tab ne tourne jamais dans la toile. Il parcourt les formes tant qu'une
// est choisie, et au-dela de la derniere (ou avant la premiere) il laisse le navigateur faire : le
// focus quitte la toile. Sans forme choisie, Tab quitte la toile tout de suite. Echap desselectionne.

import type { RefObject } from 'react';
import { ajouterForme } from '../engine/editionSvg.js';
import {
  centreVisible, coteParDefaut, dansLePlan, deplacerReticule, directionDe, formeVoisine, pasReticule, pointVoisin, type PointPlan, type Sens
} from '../engine/navigation.js';
import { au } from '../util/tableaux.js';
import { styleLigne, FORMES } from './aidesEditeur.js';
import { phraseReticule, phraseSelection } from './annonces.js';
import { formeTracee } from './Gestes.js';
import type { ActionsEditeur, EtatInterface, ModeleDessin, OutilForme } from './typesEditeur.js';

export interface ContexteToile { m: ModeleDessin; u: EtatInterface; ac: ActionsEditeur; toile: RefObject<HTMLDivElement | null> }

/** Tab et Maj+Tab : la forme (ou le point, en mode points) suivante. Faux quand le focus doit quitter la toile. */
function tabuler({ m, u, ac }: ContexteToile, sens: Sens): boolean {
  if (u.outil === 'points' && m.formeSeule) {
    const i = pointVoisin(m.formeSeule.d, u.point, sens);
    if (i === null) return false;
    ac.poserPoint(i);
    return true;
  }
  if (!m.sel.length) return false;
  const id = formeVoisine(m.dessin, m.sel, sens, false);
  if (id === null) return false;
  ac.choisir([id]);
  ac.poserPoint(null);
  return true;
}

/** PageSuiv et PageReg : la forme suivante ou precedente, en boucle, meme sans rien de choisi. */
function changerForme({ m, ac }: ContexteToile, sens: Sens): boolean {
  const id = formeVoisine(m.dessin, m.sel, sens, true);
  if (id === null) { ac.annoncer('Aucune forme à choisir : elles sont toutes masquées ou verrouillées.'); return true; }
  ac.choisir([id]);
  ac.poserPoint(null);
  return true;
}

/** Ou le reticule apparait : au dernier point du trace en cours, sinon au centre de la partie visible du plan. */
function departReticule({ m, u, toile }: ContexteToile): PointPlan {
  const vb = m.dessin.vb;
  if (u.outil === 'plume' && u.trace.length) return au(u.trace, u.trace.length - 1);
  const el = toile.current;
  const centre: PointPlan = el ? centreVisible(u.vues.vue, el.clientWidth, el.clientHeight) : [vb[0] + vb[2] / 2, vb[1] + vb[3] / 2];
  const p = dansLePlan(centre, vb);
  return [u.aimant(p[0]), u.aimant(p[1])];
}

/** Une forme au reticule : un carre du quart du plan (une ligne de cette longueur), choisie, prete a redimensionner. */
function poserForme(c: ContexteToile, p: PointPlan): void {
  const { m, u, ac } = c, outil = u.outil as OutilForme, s = coteParDefaut(m.dessin.vb), moitie = s / 2;
  const d = outil === 'ligne' ? formeTracee('ligne', p[0] - moitie, p[1], p[0] + moitie, p[1], false) : formeTracee(outil, p[0] - moitie, p[1] - moitie, p[0] + moitie, p[1] + moitie, false);
  const r = ajouterForme(m.dessin, d, outil === 'ligne' ? styleLigne(u.style) : u.style);
  if (!r.id) return;
  ac.appliquer(() => r.dessin);
  ac.finir();
  ac.choisir([r.id]);
  ac.poserOutil('selection');
  ac.annoncer(phraseSelection(r.dessin, [r.id], true) + ' Alt et flèches la redimensionnent, Ctrl et flèches la tournent.');
}

/** La plume au clavier : Entree pose un point, Maj+Entree termine. Sans reticule deplace, Entree garde son sens d'avant (fermer). */
function plume(c: ContexteToile, e: KeyboardEvent): boolean {
  const { u, ac } = c;
  if (e.key !== 'Enter') return false;
  if (e.shiftKey) {
    if (u.trace.length < 2) ac.annoncer('Il faut au moins deux points pour terminer le tracé.');
    else ac.finirTrace(true);
    return true;
  }
  if (!u.curseur && u.trace.length) return false;
  const p = u.curseur ?? departReticule(c);
  ac.poserTrace([...u.trace, p]);
  ac.poserCurseur(p);
  ac.annoncer('Point ' + (u.trace.length + 1) + ' posé. ' + phraseReticule(p));
  return true;
}

/** Le reticule d'un outil de trace : les fleches le deplacent, Entree y pose. */
function reticule(c: ContexteToile, e: KeyboardEvent): boolean {
  const { m, u, ac } = c, direction = directionDe(e.key);
  if (direction) {
    const grille = u.grille ? u.pas : null;
    const p = deplacerReticule(u.curseur ?? departReticule(c), direction, pasReticule(m.dessin.vb, grille, e.shiftKey), m.dessin.vb);
    const q: PointPlan = [u.aimant(p[0]), u.aimant(p[1])];
    ac.poserCurseur(q);
    ac.annoncer(phraseReticule(q));
    return true;
  }
  if (u.outil === 'plume') return plume(c, e);
  if (e.key !== 'Enter') return false;
  poserForme(c, u.curseur ?? departReticule(c));
  return true;
}

/**
 * Les touches propres a la toile. Vrai quand la touche est traitee (l'appelant en retient l'effet par defaut).
 * Les combinaisons avec Ctrl, Alt ou Meta ne sont pas d'ici : elles ont leurs raccourcis.
 */
export function toucheToile(e: KeyboardEvent, c: ContexteToile): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const { outil } = c.u, parcourt = outil === 'selection' || outil === 'points';
  if (parcourt && e.key === 'Tab') return tabuler(c, e.shiftKey ? -1 : 1);
  if (parcourt && (e.key === 'PageDown' || e.key === 'PageUp')) return changerForme(c, e.key === 'PageDown' ? 1 : -1);
  if (FORMES.has(outil) || outil === 'plume') return reticule(c, e);
  if (e.key === 'Enter' && outil === 'selection' && c.m.formeSeule) { c.ac.poserOutil('points'); return true; }
  return false;
}
