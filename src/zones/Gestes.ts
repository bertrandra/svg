// Les gestes a la souris, au stylet ou au doigt sur la toile : deplacer, redimensionner, tourner,
// tracer, pincer. Le calcul est dans le coeur pur ; ici, le fil des evenements de pointeur.

import { useEffect, useRef, useState, type MouseEvent as ME, type PointerEvent as PE, type RefObject } from 'react';
import {
  ajouterForme, boiteDe, boiteForme, deplacer, deplacerAncre, deplacerPoignee, ellipse, etoile, polygone, rectangle, redimensionner, retourner, seCroisent,
  type Boite, type Commande, type DessinSvg
} from '../engine/editionSvg.js';
import { aimanter as aimanterBoite, angleVers, centre, ciblesAimants, tournerAutour } from '../engine/transformations.js';
import { FORMES } from './BarreOutils.js';
import { styleLigne } from './aidesEditeur.js';
import type { Coin, Edition, OutilForme, Vue, Vues } from './typesEditeur.js';

type Geste =
  | { type: 'pan'; x0: number; y0: number; vue: Vue }
  | { type: 'deplacer'; x0: number; y0: number; base: DessinSvg; ids: string[]; b: Boite | null; cle: string }
  | { type: 'echelle'; coin: Coin; b: Boite; base: DessinSvg; ids: string[]; cle: string }
  | { type: 'cadre'; x0: number; y0: number; ajout: boolean }
  | { type: 'ancre'; i: number; base: DessinSvg; id: string; cle: string }
  | { type: 'poignee'; i: number; k: 0 | 1; base: DessinSvg; id: string; cle: string }
  | { type: 'tracer'; outil: OutilForme; x0: number; y0: number; base: DessinSvg; cle: string }
  | { type: 'rotation'; centre: readonly [number, number]; angle0: number; base: DessinSvg; ids: string[]; cle: string }
  | { type: 'pincer'; d0: number; cx: number; cy: number; vue: Vue };

/** La forme d'un outil de trace entre son point de depart et le curseur ; Maj impose les proportions. */
function formeTracee(outil: OutilForme, x0: number, y0: number, x: number, y: number, proportions: boolean): Commande[] {
  if (outil === 'ligne') {
    if (proportions) {
      const dx = x - x0, dy = y - y0, a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), r = Math.hypot(dx, dy);
      x = x0 + r * Math.cos(a); y = y0 + r * Math.sin(a);
    }
    return polygone([[x0, y0], [x, y]], false);
  }
  let l = Math.abs(x - x0), h = Math.abs(y - y0);
  if (proportions) { l = h = Math.max(l, h); }
  const bx = x < x0 ? x0 - l : x0, by = y < y0 ? y0 - h : y0;
  return outil === 'rectangle' ? rectangle(bx, by, l, h) : outil === 'ellipse' ? ellipse(bx, by, l, h) : etoile(bx, by, l, h);
}

/** Les gestes a la souris, au stylet ou au doigt sur la toile. */
export function useGestes(ed: Edition, vues: Vues, svgRef: RefObject<SVGSVGElement | null>) {
  const geste = useRef<Geste | null>(null), espace = useRef(false);
  // Les pointeurs poses sur la toile : deux doigts pincent la vue, quoi que fasse l'outil.
  const pointeurs = useRef(new Map<number, { x: number; y: number }>());
  const [cadre, poserCadre] = useState<Boite | null>(null);
  useEffect(() => {
    const bas = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === ' ' && !(t && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(t.tagName))) { espace.current = true; e.preventDefault(); }
    };
    const haut = (e: KeyboardEvent) => { if (e.key === ' ') espace.current = false; };
    window.addEventListener('keydown', bas);
    window.addEventListener('keyup', haut);
    return () => { window.removeEventListener('keydown', bas); window.removeEventListener('keyup', haut); };
  }, []);
  const { vue } = vues;
  const versDoc = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = svgRef.current?.getBoundingClientRect();
    return r ? [(e.clientX - r.left - vue.x) / vue.zoom, (e.clientY - r.top - vue.y) / vue.zoom] : [0, 0];
  };
  // Le point aimante a la grille : les traces, les points et les poignees s'y posent ; la selection s'y deplace par sa boite.
  const versGrille = (e: { clientX: number; clientY: number }): [number, number] => { const [x, y] = versDoc(e); return [ed.aimant(x), ed.aimant(y)]; };

  const appuyer = (e: PE<SVGSVGElement>) => {
    const t = e.target as Element;
    // Un pointeur deja parti (ou synthetique) refuse la capture : le geste se fait sans elle.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* sans capture, la toile suit quand meme le pointeur tant qu'il la survole */ }
    pointeurs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointeurs.current.size === 2) {
      const [a, b] = [...pointeurs.current.values()];
      if (a && b) {
        if (geste.current && geste.current.type !== 'pan' && geste.current.type !== 'cadre' && 'cle' in geste.current) ed.annulerGeste(geste.current.cle);
        geste.current = { type: 'pincer', d0: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, vue };
      }
      return;
    }
    const [x, y] = versDoc(e);
    if (e.button === 1 || ed.outil === 'main' || espace.current) { geste.current = { type: 'pan', x0: e.clientX, y0: e.clientY, vue }; return; }
    const rot = t.getAttribute('data-rotation');
    if (rot !== null && ed.boite) { geste.current = { type: 'rotation', centre: centre(ed.boite), angle0: angleVers(centre(ed.boite), [x, y]), base: ed.dessin, ids: ed.sel, cle: ed.nouvelleCle() }; return; }
    if (ed.outil === 'plume') { ed.poserTrace([...ed.trace, versGrille(e)]); return; }
    if (FORMES.has(ed.outil)) { const [gx, gy] = versGrille(e); geste.current = { type: 'tracer', outil: ed.outil as OutilForme, x0: gx, y0: gy, base: ed.dessin, cle: ed.nouvelleCle() }; return; }
    const coin = t.getAttribute('data-coin') as Coin | null, iAncre = t.getAttribute('data-ancre'), poignee = t.getAttribute('data-poignee');
    if (coin && ed.boite) { geste.current = { type: 'echelle', coin, b: ed.boite, base: ed.dessin, ids: ed.sel, cle: ed.nouvelleCle() }; return; }
    if (ed.formeSeule && iAncre !== null) {
      ed.poserPoint(Number(iAncre));
      geste.current = { type: 'ancre', i: Number(iAncre), base: ed.dessin, id: ed.formeSeule.id, cle: ed.nouvelleCle() };
      return;
    }
    if (ed.formeSeule && poignee) {
      const [i, k] = poignee.split(':').map(Number);
      geste.current = { type: 'poignee', i: i ?? 0, k: k === 1 ? 1 : 0, base: ed.dessin, id: ed.formeSeule.id, cle: ed.nouvelleCle() };
      return;
    }
    const id = t.getAttribute('data-id');
    if (id) {
      const sel = ed.sel;
      const ids = e.shiftKey ? (sel.includes(id) ? sel.filter(s => s !== id) : [...sel, id]) : sel.includes(id) ? sel : [id];
      ed.choisir(ids);
      if (ed.outil === 'points') { ed.poserPoint(null); return; }
      if (ids.includes(id)) geste.current = { type: 'deplacer', x0: x, y0: y, base: ed.dessin, ids, b: boiteDe(ed.dessin, ids), cle: ed.nouvelleCle() };
      return;
    }
    if (ed.outil === 'points' && ed.point !== null) { ed.poserPoint(null); return; }
    geste.current = { type: 'cadre', x0: x, y0: y, ajout: e.shiftKey };
    poserCadre({ x, y, l: 0, h: 0 });
  };

  const bouger = (e: PE<SVGSVGElement>) => {
    const g = geste.current;
    if (pointeurs.current.has(e.pointerId)) pointeurs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!g) return;
    if (g.type === 'pincer') {
      const [a, b] = [...pointeurs.current.values()];
      if (!a || !b) return;
      const r = svgRef.current?.getBoundingClientRect(), ox = r?.left ?? 0, oy = r?.top ?? 0;
      const d = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), k = Math.max(0.02, Math.min(64, g.vue.zoom * (d / g.d0))) / g.vue.zoom;
      const mx = (a.x + b.x) / 2 - ox, my = (a.y + b.y) / 2 - oy, px = g.cx - ox, py = g.cy - oy;
      vues.poserVue({ zoom: g.vue.zoom * k, x: mx - (px - g.vue.x) * k, y: my - (py - g.vue.y) * k });
      return;
    }
    if (g.type === 'pan') { vues.poserVue({ ...g.vue, x: g.vue.x + e.clientX - g.x0, y: g.vue.y + e.clientY - g.y0 }); return; }
    const [x, y] = versDoc(e);
    if (g.type === 'rotation') {
      let a = angleVers(g.centre, [x, y]) - g.angle0;
      if (e.shiftKey) a = Math.round(a / 15) * 15;
      ed.appliquer(() => tournerAutour(g.base, g.ids, a, g.centre), g.cle);
      return;
    }
    if (g.type === 'deplacer') {
      let dx = x - g.x0, dy = y - g.y0;
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      if (g.b) { dx = ed.aimant(g.b.x + dx) - g.b.x; dy = ed.aimant(g.b.y + dy) - g.b.y; }
      if (g.b && ed.aimants && !ed.grille) {
        const a = aimanterBoite({ ...g.b, x: g.b.x + dx, y: g.b.y + dy }, ciblesAimants(g.base, g.ids), 6 / vue.zoom);
        dx += a.dx; dy += a.dy;
        ed.poserGuides(a.lignes);
      }
      ed.appliquer(() => deplacer(g.base, g.ids, dx, dy), g.cle);
      return;
    }
    const [gx, gy] = [ed.aimant(x), ed.aimant(y)];
    if (g.type === 'echelle') ed.appliquer(() => etirer(g, gx, gy, e.shiftKey, ed.dessin.vb), g.cle);
    else if (g.type === 'cadre') poserCadre({ x: Math.min(g.x0, x), y: Math.min(g.y0, y), l: Math.abs(x - g.x0), h: Math.abs(y - g.y0) });
    else if (g.type === 'ancre') ed.appliquer(() => deplacerAncre(g.base, g.id, g.i, gx, gy), g.cle);
    else if (g.type === 'poignee') ed.appliquer(() => deplacerPoignee(g.base, g.id, g.i, g.k, gx, gy), g.cle);
    else ed.appliquer(() => ajouterForme(g.base, formeTracee(g.outil, g.x0, g.y0, gx, gy, e.shiftKey), g.outil === 'ligne' ? styleLigne(ed.style) : ed.style).dessin, g.cle);
  };

  const lacher = (e: PE<SVGSVGElement>) => {
    const g = geste.current;
    pointeurs.current.delete(e.pointerId);
    if (g?.type === 'pincer') { if (pointeurs.current.size === 0) geste.current = null; return; }
    geste.current = null;
    if (ed.guides.length) ed.poserGuides([]);
    if (!g) return;
    if (g.type === 'tracer') {
      const [x, y] = versGrille(e);
      const r = ajouterForme(g.base, formeTracee(g.outil, g.x0, g.y0, x, y, e.shiftKey), g.outil === 'ligne' ? styleLigne(ed.style) : ed.style);
      const b = r.id ? boiteDe(r.dessin, [r.id]) : null;
      // Un trace sans surface a l'ecran n'est pas une forme : rien ne reste dans l'historique.
      if (!r.id || !b || (b.l * vue.zoom < 3 && b.h * vue.zoom < 3)) { ed.annulerGeste(g.cle); return; }
      ed.appliquer(() => r.dessin, g.cle);
      ed.finir();
      ed.choisir([r.id]);
      ed.poserOutil('selection');
      return;
    }
    if (g.type !== 'cadre') { if (g.type !== 'pan') ed.finir(); return; }
    const [x, y] = versDoc(e);
    const c = { x: Math.min(g.x0, x), y: Math.min(g.y0, y), l: Math.abs(x - g.x0), h: Math.abs(y - g.y0) };
    poserCadre(null);
    if (c.l * vue.zoom < 3 && c.h * vue.zoom < 3) { if (!g.ajout) ed.choisir([]); return; }
    const pris = ed.dessin.formes.filter(f => { const b = boiteForme(f); return f.visible && !f.verrouille && !!b && seCroisent(b, c); }).map(f => f.id);
    ed.choisir(g.ajout ? [...new Set([...ed.sel, ...pris])] : pris);
  };

  const doubleClic = (e: ME<SVGSVGElement>) => {
    if (ed.outil === 'plume') { ed.finirTrace(true); return; }
    // La capture du pointeur fait de la toile la cible du double-clic : on lit la forme sous le curseur.
    const id = document.elementFromPoint(e.clientX, e.clientY)?.getAttribute('data-id');
    if (id && ed.outil === 'selection') { ed.choisir([id]); ed.poserOutil('points'); }
  };
  return { appuyer, bouger, lacher, doubleClic, cadre };
}

/** Tirer un coin : le coin oppose reste fixe ; passer de l'autre cote d'un bord retourne la selection. */
function etirer(g: Extract<Geste, { type: 'echelle' }>, x: number, y: number, proportions: boolean, vb: DessinSvg['vb']): DessinSvg {
  const b = g.b, fixeX = g.coin.endsWith('w') ? b.x + b.l : b.x, fixeY = g.coin.startsWith('n') ? b.y + b.h : b.y;
  let l = Math.abs(x - fixeX), h = Math.abs(y - fixeY);
  if (proportions && b.l > 0 && b.h > 0) { const k = Math.max(l / b.l, h / b.h); l = b.l * k; h = b.h * k; }
  const min = Math.max(vb[2], vb[3]) / 1000;
  l = Math.max(min, l); h = Math.max(min, h);
  let d = redimensionner(g.base, g.ids, { x: x < fixeX ? fixeX - l : fixeX, y: y < fixeY ? fixeY - h : fixeY, l, h });
  if ((x < fixeX) !== g.coin.endsWith('w')) d = retourner(d, g.ids, 'h');
  if ((y < fixeY) !== g.coin.startsWith('n')) d = retourner(d, g.ids, 'v');
  return d;
}
