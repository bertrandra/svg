// Les touches de la toile, quand elle a le focus : passer d'une forme ou d'un point a l'autre (Tab,
// PageSuiv, PageReg), et le reticule des outils de trace (fleches pour le deplacer, Entree pour poser).
// Le choix est dans engine/navigation.ts, pur ; ici, seulement le fil des touches.
//
// Une forme a deux coins : Espace (ou Maj+Entree) pose le premier coin au reticule, les fleches deplacent
// l'autre coin (un apercu pointille suit), Espace ou Entree le pose, Echap annule le premier coin. Entree seule,
// sans coin pose, garde son sens d'avant : une forme de taille par defaut au reticule.
//
// Regle de sortie (WCAG 2.1.2) : Tab ne tourne jamais dans la toile. Il parcourt les formes tant qu'une
// est choisie, et au-dela de la derniere (ou avant la premiere) il laisse le navigateur faire : le
// focus quitte la toile. Sans forme choisie, Tab quitte la toile tout de suite. Echap desselectionne.

import type { RefObject } from 'react';
import { ajouterForme, type Commande } from '../engine/editionSvg.js';
import {
  centreVisible, coinsPosables, coteMinimal, coteParDefaut, dansLePlan, deplacerReticule, directionDe, formeVoisine, pasReticule, pointVoisin, type PointPlan, type Sens
} from '../engine/navigation.js';
import { au } from '../util/tableaux.js';
import { styleLigne, FORMES } from './aidesEditeur.js';
import { phraseCoinOppose, phrasePremierCoin, phraseReticule, phraseSelection, PHRASE_COIN_ANNULE, PHRASE_COINS_TROP_PROCHES } from './annonces.js';
import { basculerCurseur, etendreSelection, ouvrirChampTexte } from './ClavierSelection.js';
import { formeTracee } from './Gestes.js';
import type { ActionsEditeur, EtatInterface, ModeleDessin, OutilForme } from './typesEditeur.js';
import type { EtatTexte } from './contexteTexte.js';

export interface ContexteToile { m: ModeleDessin; u: EtatInterface; ac: ActionsEditeur; toile: RefObject<HTMLDivElement | null>; tx?: EtatTexte }

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

/** Ajoute la forme tracee, la choisit et rend la main a l'outil selection : ce que les deux facons de poser au clavier ont en commun. */
function poserTrace(c: ContexteToile, d: Commande[]): void {
  const { m, u, ac } = c, outil = u.outil as OutilForme;
  const r = ajouterForme(m.dessin, d, outil === 'ligne' ? styleLigne(u.style) : u.style);
  if (!r.id) return;
  ac.appliquer(() => r.dessin);
  ac.finir();
  ac.choisir([r.id]);
  ac.poserOutil('selection');
  ac.annoncer(phraseSelection(r.dessin, [r.id], true) + ' Alt et flèches la redimensionnent, Ctrl et flèches la tournent.');
}

/** Une forme au reticule : un carre du quart du plan (une ligne de cette longueur), choisie, prete a redimensionner. */
function poserForme(c: ContexteToile, p: PointPlan): void {
  const { m, u } = c, outil = u.outil as OutilForme, s = coteParDefaut(m.dessin.vb), moitie = s / 2;
  poserTrace(c, outil === 'ligne' ? formeTracee('ligne', p[0] - moitie, p[1], p[0] + moitie, p[1], false) : formeTracee(outil, p[0] - moitie, p[1] - moitie, p[0] + moitie, p[1] + moitie, false));
}

/** Le premier coin pose, ou null : la trace d'un outil de forme ne porte jamais qu'un point, ce coin. */
const premierCoin = (u: EtatInterface): PointPlan | null => (u.trace.length === 1 ? u.trace[0] ?? null : null);

/** Espace ou Maj+Entree : le premier coin, puis (une fois posé) le second, qui pose la forme. */
function deuxCoins(c: ContexteToile): boolean {
  const { m, u, ac } = c, premier = premierCoin(u), p = u.curseur ?? departReticule(c);
  if (!premier) {
    ac.poserTrace([p]);
    ac.poserCurseur(p);
    ac.dire(phrasePremierCoin(p));
    return true;
  }
  if (!coinsPosables(u.outil === 'ligne', premier, p, coteMinimal(m.dessin.vb))) { ac.annoncer(PHRASE_COINS_TROP_PROCHES); return true; }
  const outil = u.outil as OutilForme;
  poserTrace(c, formeTracee(outil, premier[0], premier[1], p[0], p[1], false));
  return true;
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

/** Le reticule d'un outil de trace : les fleches le deplacent, Entree y pose, Espace pose un coin (formes). */
function reticule(c: ContexteToile, e: KeyboardEvent): boolean {
  const { m, u, ac } = c, direction = directionDe(e.key), premier = premierCoin(u);
  if (direction) {
    const grille = u.grille ? u.pas : null;
    const p = deplacerReticule(u.curseur ?? departReticule(c), direction, pasReticule(m.dessin.vb, grille, e.shiftKey), m.dessin.vb);
    const q: PointPlan = [u.aimant(p[0]), u.aimant(p[1])];
    ac.poserCurseur(q);
    ac.annoncer(premier ? phraseCoinOppose(premier, q) : phraseReticule(q));
    return true;
  }
  if (u.outil === 'plume') return plume(c, e);
  if (e.key === 'Escape' && premier) { ac.poserTrace([]); ac.dire(PHRASE_COIN_ANNULE); return true; }
  if (e.key === ' ' || (e.key === 'Enter' && (e.shiftKey || premier))) return deuxCoins(c);
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
  const page = e.key === 'PageDown' ? 1 : e.key === 'PageUp' ? -1 : null;
  if (outil === 'selection' && e.shiftKey && page) return etendreSelection(c, page);
  if (outil === 'selection' && e.key === ' ') return basculerCurseur(c);
  if (parcourt && page) return changerForme(c, page);
  if (outil === 'texte' && e.key === 'Enter') return ouvrirChampTexte(c, c.toile.current?.closest('.editeur-cadre') ?? null);
  if (FORMES.has(outil) || outil === 'plume') return reticule(c, e);
  // Entree sur un texte vivant ouvre sa saisie en place (ADR-0021) ; sur une autre forme, le mode points.
  if (e.key === 'Enter' && outil === 'selection' && c.m.formeSeule?.texte && c.tx) { c.tx.ouvrirSaisie(c.m.formeSeule.id); return true; }
  if (e.key === 'Enter' && outil === 'selection' && c.m.formeSeule) { c.ac.poserOutil('points'); return true; }
  return false;
}
