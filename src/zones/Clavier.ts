// Les raccourcis clavier de l'editeur.

import { useEffect, useRef } from 'react';
import { ancre, deplacer, deplacerAncre, ordonner } from '../engine/editionSvg.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import type { ActionsEditeur, EtatInterface, ModeleDessin, Outil } from './typesEditeur.js';

const RACCOURCIS_OUTILS: Record<string, Outil> = { v: 'selection', a: 'points', h: 'main', r: 'rectangle', e: 'ellipse', s: 'etoile', l: 'ligne', p: 'plume', t: 'texte' };

/** Les raccourcis, ecoutes sur la fenetre tant que l'editeur est ouvert ; jamais dans un champ. */
export function useClavier() {
  const mo = useDessin(), ac = useActions(), ui = useInterface();
  // L'ecouteur est pose une fois ; il lit le dessin et l'interface du dernier rendu (les actions, elles, sont stables).
  const courant = useRef({ mo, ui });
  courant.current = { mo, ui };
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      const { mo: m, ui: u } = courant.current;
      const cible = e.target as HTMLElement | null;
      const mod = e.ctrlKey || e.metaKey, t = e.key.toLowerCase();
      if (mod && t === 'z') { e.preventDefault(); if (e.shiftKey) ac.refaire(); else ac.defaire(); return; }
      if (mod && t === 'y') { e.preventDefault(); ac.refaire(); return; }
      if (mod && t === 's') { e.preventDefault(); ac.enregistrerTout(); return; }
      if (cible && /^(INPUT|SELECT|TEXTAREA)$/.test(cible.tagName)) { if (e.key === 'Escape') cible.blur(); return; }
      if (mod && t === 'a') { e.preventDefault(); ac.choisir(m.dessin.formes.filter(f => f.visible && !f.verrouille).map(f => f.id)); return; }
      if (mod && t === 'd') { e.preventDefault(); ac.dupliquerSelection(); return; }
      if (mod && t === 'c') { e.preventDefault(); ac.copierSelection(); return; }
      if (mod && t === 'x') { e.preventDefault(); ac.couperSelection(); return; }
      if (mod && t === 'v') { e.preventDefault(); ac.collerPresse(); return; }
      if (mod && t === 'g') { e.preventDefault(); if (e.shiftKey) ac.separerSelection(); else ac.combinerSelection(); return; }
      if (mod && (e.key === ']' || e.key === '[') && m.sel.length) { e.preventDefault(); ac.faire(d => ordonner(d, m.sel, e.key === ']' ? (e.shiftKey ? 'premier' : 'avant') : e.shiftKey ? 'dernier' : 'arriere')); return; }
      if (u.outil === 'plume' && u.trace.length) {
        if (e.key === 'Enter') { e.preventDefault(); ac.finirTrace(true); return; }
        if (e.key === 'Backspace') { e.preventDefault(); ac.poserTrace(u.trace.slice(0, -1)); return; }
        if (e.key === 'Escape') { e.preventDefault(); ac.poserTrace([]); return; }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); ac.supprimerSelection(); return; }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (u.point !== null) ac.poserPoint(null); else if (m.sel.length) ac.choisir([]); else if (u.outil !== 'selection') ac.poserOutil('selection'); else ac.demanderFermeture();
        return;
      }
      if (e.key.startsWith('Arrow')) { e.preventDefault(); pousser(m, u, ac, e.key, e.shiftKey); return; }
      if (mod) return;
      const outil = RACCOURCIS_OUTILS[t];
      if (outil) ac.poserOutil(outil);
      else if (t === 'o') ac.poserContours(v => !v);
      else if (t === 'g') ac.poserGrille(!u.grille);
      else if (t === 'm') ac.poserAimants(!u.aimants);
      else if (t === 'z') ac.zoomerSelection();
      else if (t === 'c') ac.choisirMemeCouleur();
      else if (t === '+' || t === '=') u.vues.zoomer(1.25);
      else if (t === '-') u.vues.zoomer(0.8);
      else if (t === '0') u.vues.ajuster();
      else if (t === '1') u.vues.centrer100();
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [ac]);
}

/** Les fleches : la selection, ou le point choisi, d'un millieme du plan (dix avec Maj). */
function pousser(m: ModeleDessin, u: EtatInterface, ac: ActionsEditeur, touche: string, fort: boolean) {
  const d = m.dessin, pas = ((fort ? 10 : 1) * Math.max(d.vb[2], d.vb[3])) / 1000;
  const dx = touche === 'ArrowLeft' ? -pas : touche === 'ArrowRight' ? pas : 0, dy = touche === 'ArrowUp' ? -pas : touche === 'ArrowDown' ? pas : 0;
  const fs = m.formeSeule, p = u.point;
  if (u.outil === 'points' && fs && p !== null) {
    const c = fs.d[p], a = c ? ancre(c) : null;
    if (a) ac.appliquer(x => deplacerAncre(x, fs.id, p, a[0] + dx, a[1] + dy));
  } else if (m.sel.length) {
    const ids = m.sel;
    ac.appliquer(x => deplacer(x, ids, dx, dy));
  }
}
