// Les raccourcis clavier de l'editeur.

import { useEffect, useRef } from 'react';
import { ancre, deplacer, deplacerAncre, ordonner } from '../engine/editionSvg.js';
import type { Edition, Outil, Vues } from './typesEditeur.js';

interface Commandes {
  defaire: () => void; refaire: () => void;
  poserContours: (f: (c: boolean) => boolean) => void; demanderFermeture: () => void; vues: Vues;
}

const RACCOURCIS_OUTILS: Record<string, Outil> = { v: 'selection', a: 'points', h: 'main', r: 'rectangle', e: 'ellipse', s: 'etoile', l: 'ligne', p: 'plume', t: 'texte' };

/** Les raccourcis, ecoutes sur la fenetre tant que l'editeur est ouvert ; jamais dans un champ. */
export function useClavier(ed: Edition, c: Commandes) {
  const courant = useRef({ ed, c });
  courant.current = { ed, c };
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      const { ed: x, c: k } = courant.current;
      const cible = e.target as HTMLElement | null;
      const mod = e.ctrlKey || e.metaKey, t = e.key.toLowerCase();
      if (mod && t === 'z') { e.preventDefault(); if (e.shiftKey) k.refaire(); else k.defaire(); return; }
      if (mod && t === 'y') { e.preventDefault(); k.refaire(); return; }
      if (mod && t === 's') { e.preventDefault(); x.enregistrerTout(); return; }
      if (cible && /^(INPUT|SELECT|TEXTAREA)$/.test(cible.tagName)) { if (e.key === 'Escape') cible.blur(); return; }
      if (mod && t === 'a') { e.preventDefault(); x.choisir(x.dessin.formes.filter(f => f.visible && !f.verrouille).map(f => f.id)); return; }
      if (mod && t === 'd') { e.preventDefault(); x.dupliquerSelection(); return; }
      if (mod && t === 'c') { e.preventDefault(); x.copierSelection(); return; }
      if (mod && t === 'x') { e.preventDefault(); x.couperSelection(); return; }
      if (mod && t === 'v') { e.preventDefault(); x.collerPresse(); return; }
      if (mod && t === 'g') { e.preventDefault(); if (e.shiftKey) x.separerSelection(); else x.combinerSelection(); return; }
      if (mod && (e.key === ']' || e.key === '[') && x.sel.length) { e.preventDefault(); x.faire(d => ordonner(d, x.sel, e.key === ']' ? (e.shiftKey ? 'premier' : 'avant') : e.shiftKey ? 'dernier' : 'arriere')); return; }
      if (x.outil === 'plume' && x.trace.length) {
        if (e.key === 'Enter') { e.preventDefault(); x.finirTrace(true); return; }
        if (e.key === 'Backspace') { e.preventDefault(); x.poserTrace(x.trace.slice(0, -1)); return; }
        if (e.key === 'Escape') { e.preventDefault(); x.poserTrace([]); return; }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); x.supprimerSelection(); return; }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (x.point !== null) x.poserPoint(null); else if (x.sel.length) x.choisir([]); else if (x.outil !== 'selection') x.poserOutil('selection'); else k.demanderFermeture();
        return;
      }
      if (e.key.startsWith('Arrow')) { e.preventDefault(); pousser(x, e.key, e.shiftKey); return; }
      if (mod) return;
      const outil = RACCOURCIS_OUTILS[t];
      if (outil) x.poserOutil(outil);
      else if (t === 'o') k.poserContours(v => !v);
      else if (t === 'g') x.poserGrille(!x.grille);
      else if (t === 'm') x.poserAimants(!x.aimants);
      else if (t === 'z') x.zoomerSelection();
      else if (t === '+' || t === '=') k.vues.zoomer(1.25);
      else if (t === '-') k.vues.zoomer(0.8);
      else if (t === '0') k.vues.ajuster();
      else if (t === '1') k.vues.centrer100();
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, []);
}

/** Les fleches : la selection, ou le point choisi, d'un millieme du plan (dix avec Maj). */
function pousser(ed: Edition, touche: string, fort: boolean) {
  const d = ed.dessin, pas = ((fort ? 10 : 1) * Math.max(d.vb[2], d.vb[3])) / 1000;
  const dx = touche === 'ArrowLeft' ? -pas : touche === 'ArrowRight' ? pas : 0, dy = touche === 'ArrowUp' ? -pas : touche === 'ArrowDown' ? pas : 0;
  const fs = ed.formeSeule, p = ed.point;
  if (ed.outil === 'points' && fs && p !== null) {
    const c = fs.d[p], a = c ? ancre(c) : null;
    if (a) ed.appliquer(x => deplacerAncre(x, fs.id, p, a[0] + dx, a[1] + dy));
  } else if (ed.sel.length) {
    const ids = ed.sel;
    ed.appliquer(x => deplacer(x, ids, dx, dy));
  }
}
