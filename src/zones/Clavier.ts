// Les raccourcis clavier de l'editeur. Les touches propres a la toile (Tab, PageSuiv, reticule des
// outils de trace) sont dans ClavierToile.ts ; ici, ce qui vaut partout : outils, presse-papiers,
// historique, fleches (deplacer, Alt : redimensionner, Ctrl : tourner), Echap.

import { useEffect, useRef, type RefObject } from 'react';
import { ancre, boiteDe, deplacer, deplacerAncre, redimensionner } from '../engine/editionSvg.js';
import { boiteRedimensionnee, coteMinimal, directionDe, pasDeplacement, type Direction } from '../engine/navigation.js';
import { tournerAutour } from '../engine/transformations.js';
import { phrasePoint, phrasePosition, phraseRotation, phraseTaille } from './annonces.js';
import { toucheToile } from './ClavierToile.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { useVisite } from './contexteGuide.js';
import { empiler } from './empilement.js';
import { useSaisie } from './contexteSaisie.js';
import { useActionsTexte } from './actionsTexte.js';
import { operationsApplicables } from '../engine/preparation.js';
import type { ActionsEditeur, EtatInterface, ModeleDessin, Outil } from './typesEditeur.js';
import { toucheSelection } from './commandesSelection.js';

const RACCOURCIS_OUTILS: Record<string, Outil> = { v: 'selection', a: 'points', h: 'main', r: 'rectangle', e: 'ellipse', s: 'etoile', l: 'ligne', p: 'plume', t: 'texte', f: 'cadre', q: 'lasso' };

/** Un cran de rotation au clavier : quinze degres, un seul avec Maj. */
const CRAN_ROTATION = 15;

/** Les raccourcis, ecoutes sur la fenetre tant que l'editeur est ouvert ; jamais dans un champ. */
export function useClavier(toile: RefObject<HTMLDivElement | null>) {
  const mo = useDessin(), ac = useActions(), ui = useInterface(), vi = useVisite(), sx = useSaisie(), at = useActionsTexte();
  // L'ecouteur est pose une fois ; il lit le dessin et l'interface du dernier rendu (les actions, elles, sont stables).
  const courant = useRef({ mo, ui, vi, sx, at });
  courant.current = { mo, ui, vi, sx, at };
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      const { mo: m, ui: u, vi: v, sx: x, at: a } = courant.current;
      // Une touche qu'un controle a deja prise (une fleche qui ouvre un menu) n'est plus celle de la toile.
      if (e.defaultPrevented) return;
      const cible = e.target as HTMLElement | null;
      const mod = e.ctrlKey || e.metaKey, t = e.key.toLowerCase();
      if (mod && t === 'z') { e.preventDefault(); if (e.shiftKey) ac.refaire(); else ac.defaire(); return; }
      if (mod && t === 'y') { e.preventDefault(); ac.refaire(); return; }
      // Ctrl+S garde le travail (le brouillon) et le dit ; il ne ferme jamais l'editeur : fermer reste un geste a part (le bouton de
      // fin, Echap). Il fermait la page sur sa fiche, et l'habitude de Ctrl+S toutes les minutes ejectait de l'editeur.
      if (mod && t === 's') { e.preventDefault(); ac.garderBrouillon(); return; }
      if (cible && /^(INPUT|SELECT|TEXTAREA)$/.test(cible.tagName)) { if (e.key === 'Escape') cible.blur(); return; }
      // Un menu ouvert garde ses fleches : elles le parcourent, elles ne deplacent pas la selection derriere lui.
      if (cible?.closest('.menu-panneau') && e.key !== 'Escape') return;
      // La bulle de la visite garde ses touches (Tab, Entree, Echap) : une fleche n'y deplace pas la forme choisie derriere elle.
      if (cible?.closest('.bulle-visite')) return;
      if (mod && t === 'a') { e.preventDefault(); ac.choisir(m.dessin.formes.filter(f => f.visible && !f.verrouille).map(f => f.id)); return; }
      if (mod && t === 'd') { e.preventDefault(); ac.dupliquerSelection(); return; }
      if (mod && t === 'c') { e.preventDefault(); ac.copierSelection(); return; }
      if (mod && t === 'x') { e.preventDefault(); ac.couperSelection(); return; }
      if (mod && t === 'v') { e.preventDefault(); ac.collerPresse(); return; }
      // Ctrl+Maj+O : vectoriser le texte choisi, dans le mode du moment (ADR-0022 ; le raccourci des logiciels de dessin).
      if (mod && e.shiftKey && t === 'o') { e.preventDefault(); void a.vectoriser(a.mode); return; }
      if (mod && t === 'g') { e.preventDefault(); if (e.shiftKey) ac.separerSelection(); else ac.combinerSelection(); return; }
      if (mod && (e.key === ']' || e.key === '[') && m.sel.length) { e.preventDefault(); empiler(ac, m.dessin, m.sel, e.key === ']' ? (e.shiftKey ? 'premier' : 'avant') : e.shiftKey ? 'dernier' : 'arriere'); return; }
      if (cible?.closest('.editeur-svg-toile') && toucheToile(e, { m, u, ac, toile, sx: x })) { e.preventDefault(); return; }
      if (u.outil === 'plume' && u.trace.length) {
        if (e.key === 'Enter') { e.preventDefault(); ac.finirTrace(true); return; }
        if (e.key === 'Backspace') { e.preventDefault(); ac.poserTrace(u.trace.slice(0, -1)); return; }
        if (e.key === 'Escape') { e.preventDefault(); ac.poserTrace([]); return; }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); ac.supprimerSelection(); return; }
      if (e.key === 'Escape') { e.preventDefault(); echapper(m, u, ac, v); return; }
      const direction = directionDe(e.key);
      if (direction) { e.preventDefault(); fleche(m, u, ac, direction, e); return; }
      if (mod) return;
      // Les commandes de selection (ADR-0035) : I inverse, Y le meme type, Alt+C le meme contour, Alt+Maj+X ou E ce qui est a couper ou a ecrire.
      if (toucheSelection(e, m, u, ac)) { e.preventDefault(); return; }
      // En contexte Cricut qui coupe ou ecrit (ADR-0028) : Maj+X range la selection a couper, Maj+E a ecrire, Maj+O montre ou retire
      // l'apercu de la machine. Ailleurs ces touches gardent leur sens (Maj+E reste l'ellipse, Maj+O la vue contours).
      if (e.shiftKey && !e.altKey && u.profil && operationsApplicables(u.profil.procede)) {
        if (t === 'x' || t === 'e') { e.preventDefault(); ac.poserOperation(t === 'x' ? 'decoupe' : 'ecriture'); return; }
        if (t === 'o') { e.preventDefault(); ac.poserApercuMachine(a => !a); return; }
      }
      const outil = RACCOURCIS_OUTILS[t];
      if (outil) ac.poserOutil(outil);
      else if (t === 'o') ac.poserContours(v => !v);
      else if (t === 'g') ac.poserGrille(!u.grille);
      else if (t === 'm') ac.poserAimants(!u.aimants);
      else if (t === 'z') ac.zoomerSelection();
      else if (t === 'c') ac.choisirMemeCouleur();
      else if (t === '+' || t === '=') u.vues.zoomer(1.25);
      else if (t === '-') u.vues.zoomer(0.8);
      else if (t === '0') ac.ajuster();
      else if (t === 'd') ac.ajusterAuDessin();
      else if (t === '1') u.vues.centrer100();
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [ac, toile]);
}

/**
 * Echap, du plus proche au plus lointain : la confirmation, le tiroir, le point, la selection, l'outil, la visite guidee, puis
 * l'editeur. La visite vient juste avant la fermeture : Echap puis Tab quittent toujours la toile, meme pendant la visite.
 */
function echapper(m: ModeleDessin, u: EtatInterface, ac: ActionsEditeur, v: ReturnType<typeof useVisite>) {
  if (u.quitter) ac.continuerEdition();
  else if (u.tiroir) ac.poserTiroir(null);
  else if (u.point !== null) ac.poserPoint(null);
  else if (m.sel.length) ac.choisir([]);
  else if (u.outil !== 'selection') ac.poserOutil('selection');
  else if (v?.etape) v.quitter(false);
  else ac.demanderFermeture();
}

/** Les fleches : Alt redimensionne, Ctrl tourne (gauche, droite), sinon on pousse la selection ou le point. */
function fleche(m: ModeleDessin, u: EtatInterface, ac: ActionsEditeur, direction: Direction, e: KeyboardEvent) {
  const mod = e.ctrlKey || e.metaKey;
  if (e.altKey && !mod && m.sel.length) etirer(m, ac, direction, e.shiftKey);
  else if (mod && !e.altKey && m.sel.length && (direction === 'gauche' || direction === 'droite')) {
    const degres = (direction === 'droite' ? 1 : -1) * (e.shiftKey ? 1 : CRAN_ROTATION);
    const apres = tournerAutour(m.dessin, m.sel, degres);
    ac.appliquer(() => apres);
    ac.annoncer(phraseRotation(degres));
  } else pousser(m, u, ac, direction, e.shiftKey);
}

/** Alt et fleches : droite et bas agrandissent la selection, gauche et haut la reduisent, le coin haut gauche reste. */
function etirer(m: ModeleDessin, ac: ActionsEditeur, direction: Direction, fort: boolean) {
  const b = boiteDe(m.dessin, m.sel), vb = m.dessin.vb;
  if (!b) return;
  const cible = boiteRedimensionnee(b, direction, pasDeplacement(vb, fort), coteMinimal(vb));
  if (cible === b) { ac.annoncer('Taille minimale atteinte.'); return; }
  const apres = redimensionner(m.dessin, m.sel, cible);
  ac.appliquer(() => apres);
  ac.annoncer(phraseTaille(apres, m.sel));
}

/** Les fleches : la selection, ou le point choisi, d'un millieme du plan (dix avec Maj). */
function pousser(m: ModeleDessin, u: EtatInterface, ac: ActionsEditeur, direction: Direction, fort: boolean) {
  const d = m.dessin, pas = pasDeplacement(d.vb, fort);
  const dx = direction === 'gauche' ? -pas : direction === 'droite' ? pas : 0, dy = direction === 'haut' ? -pas : direction === 'bas' ? pas : 0;
  const fs = m.formeSeule, p = u.point;
  if (u.outil === 'points' && fs && p !== null) {
    const c = fs.d[p], a = c ? ancre(c) : null;
    if (!a) return;
    const apres = deplacerAncre(d, fs.id, p, a[0] + dx, a[1] + dy);
    ac.appliquer(() => apres);
    const f = apres.formes.find(x => x.id === fs.id);
    if (f) ac.annoncer(phrasePoint(f, p));
  } else if (m.sel.length) {
    const ids = m.sel, apres = deplacer(d, ids, dx, dy);
    ac.appliquer(() => apres);
    ac.annoncer(phrasePosition(apres, ids));
  }
}
