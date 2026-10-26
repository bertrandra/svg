// Les gestes a la souris, au stylet ou au doigt sur la toile : deplacer, redimensionner, tourner,
// tracer, pincer, et poser ou deplacer le curseur d'un texte en saisie (ADR-0027). Le calcul est dans le
// coeur pur ; ici, le fil des evenements de pointeur. Une poignee de degrade (ADR-0012, etape 4) se prend
// comme un coin : un arret glisse le long de l'axe, une extremite suit le pointeur (PoigneesDegrade.tsx).

import { useEffect, useRef, useState, type MouseEvent as ME, type PointerEvent as PE, type RefObject } from 'react';
import {
  ajouterForme, boiteDe, boiteForme, deplacer, deplacerAncre, deplacerPoigneeLiee, formeDeBase, PARAMETRES_FORMES_DEFAUT, polygone, redimensionner, regleDeForme, retourner, 
  degradeDe, deplacerExtremite, modifierArret, positionSurAxe,
  type Boite, type Commande, type CoteDegrade, type DessinSvg, type ParametresFormes, type Style
} from '../engine/editionSvg.js';
import { aimanter as aimanterBoite, angleVers, centre, ciblesAimants, tournerAutour } from '../engine/transformations.js';
import { cotesProportionnels, proportionsAuCoin, type Cotes } from '../engine/proportions.js';
import { FORMES, styleDeForme } from './aidesEditeur.js';
import { phraseSelection } from './annonces.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { useSaisie } from './contexteSaisie.js';
import { usePrise } from './PriseToile.js';
import { useReperesActifs } from './contexteRegles.js';
import { effacerReperes as sansReperes } from '../engine/editionSvg.js';
import { useGesteZone } from './GesteZone.js';
import { estOutilZone } from './commandesSelection.js';
import { poigneeDe, poigneesActives, type CiblePoignee } from './PoigneesDegrade.js';
import { effetsAuRepos, PHRASE_EFFETS_AU_REPOS } from './brouillon.js';
import type { ActionsEditeur, Coin, OutilForme, Vue } from './typesEditeur.js';
import { lentilleDe, niveauEdition } from './lentille.js';
import { RAISONS_LENTILLE } from './phrasesContenus.js';

type Geste =
  | { type: 'pan'; x0: number; y0: number; vue: Vue }
  | { type: 'deplacer'; x0: number; y0: number; base: DessinSvg; ids: string[]; b: Boite | null; cle: string; cibles?: Boite[] }
  // `verrouille` : « Conserver les proportions » etait pose a l'appui ; `ref` est alors la proportion a garder (null pour une ligne).
  | { type: 'echelle'; coin: Coin; b: Boite; base: DessinSvg; ids: string[]; cle: string; verrouille: boolean; ref: Cotes | null }
  | { type: 'ancre'; i: number; base: DessinSvg; id: string; cle: string }
  | { type: 'poignee'; i: number; k: 0 | 1; base: DessinSvg; id: string; cle: string }
  | { type: 'tracer'; outil: OutilForme; x0: number; y0: number; base: DessinSvg; cle: string }
  | { type: 'rotation'; centre: readonly [number, number]; angle0: number; base: DessinSvg; ids: string[]; cle: string }
  | { type: 'pincer'; d0: number; cx: number; cy: number; vue: Vue }
  | { type: 'degrade'; cote: CoteDegrade; cible: CiblePoignee; base: DessinSvg; id: string; cle: string }
  | { type: 'saisie' };

/**
 * La forme d'un outil de trace entre son point de depart et le curseur ; Maj impose les proportions (une boite carree, une ligne a
 * 45 degres pres), que le carre et le cercle imposent toujours. Les reglages sont ceux des formes de base (ADR-0033).
 */
export function formeTracee(outil: OutilForme, x0: number, y0: number, x: number, y: number, proportions: boolean, reglages: ParametresFormes = PARAMETRES_FORMES_DEFAUT): Commande[] {
  if (outil === 'ligne') {
    if (proportions) {
      const dx = x - x0, dy = y - y0, a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), r = Math.hypot(dx, dy);
      x = x0 + r * Math.cos(a); y = y0 + r * Math.sin(a);
    }
    return polygone([[x0, y0], [x, y]], false);
  }
  let l = Math.abs(x - x0), h = Math.abs(y - y0);
  if (proportions || outil === 'carre' || outil === 'cercle') { l = h = Math.max(l, h); }
  const bx = x < x0 ? x0 - l : x0, by = y < y0 ? y0 - h : y0;
  return formeDeBase(outil, bx, by, l, h, reglages);
}

/** Ajoute la forme tracee par un outil, au style de l'outil (une ligne pour un trait) et a sa regle (l'anneau perce). */
export const ajouterTracee = (base: DessinSvg, outil: OutilForme, d: Commande[], style: Style) => ajouterForme(base, d, styleDeForme(outil, style), regleDeForme(outil));

/**
 * La forme tracee au glisser entre dans l'historique, choisie, et l'outil revient a la selection. Le glisser l'a ajoutee avant de
 * la choisir : on dit qu'elle est posee, son genre et sa taille, comme au clavier (ADR-0033).
 */
function poserFormeTracee(ac: ActionsEditeur, dessin: DessinSvg, id: string, cle: string): void {
  ac.appliquer(() => dessin, cle);
  ac.finir();
  ac.choisir([id]);
  ac.poserOutil('selection');
  ac.annoncer(phraseSelection(dessin, [id], true));
}

/** Les gestes a la souris, au stylet ou au doigt sur la toile. */
/** Espace tenue hors d'un champ : la toile se deplace a la main le temps de l'appui, quel que soit l'outil. */
function useEspace() {
  const espace = useRef(false);
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
  return espace;
}

export function useGestes(svgRef: RefObject<SVGSVGElement | null>) {
  const mo = useDessin(), ac = useActions(), ui = useInterface(), { vues } = ui, prise = usePrise(svgRef), reperesActifs = useReperesActifs();
  const geste = useRef<Geste | null>(null), espace = useEspace();
  const { brouillon, commencer: commencerBrouillon, finir: finirBrouillon } = useBrouillon(ac);
  const gt = useGestesTexte(prise), { sx, garderFocus } = gt;
  // Les pointeurs poses sur la toile : deux doigts pincent la vue, quoi que fasse l'outil.
  const pointeurs = useRef(new Map<number, { x: number; y: number }>());
  // Le cadre et le lasso (ADR-0035) : leur geste vit a part, ici il n'est qu'appele.
  const zone = useGesteZone();
  const { vue } = vues;
  const versDoc = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = svgRef.current?.getBoundingClientRect();
    return r ? [(e.clientX - r.left - vue.x) / vue.zoom, (e.clientY - r.top - vue.y) / vue.zoom] : [0, 0];
  };
  // Le point aimante a la grille : les traces, les points et les poignees s'y posent ; la selection s'y deplace par sa boite.
  const versGrille = (e: { clientX: number; clientY: number }): [number, number] => { const [x, y] = versDoc(e); return [ui.aimant(x), ui.aimant(y)]; };

  const appuyer = (e: PE<SVGSVGElement>) => {
    const t = e.target as Element;
    garderFocus.current = false;
    // Un pointeur deja parti (ou synthetique) refuse la capture : le geste se fait sans elle.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* sans capture, la toile suit quand meme le pointeur tant qu'il la survole */ }
    pointeurs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointeurs.current.size === 2) {
      const [a, b] = [...pointeurs.current.values()];
      if (a && b) {
        if (geste.current && geste.current.type !== 'pan' && 'cle' in geste.current) ac.annulerGeste(geste.current.cle);
        zone.annuler();
        finirBrouillon();
        geste.current = { type: 'pincer', d0: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, vue };
      }
      return;
    }
    const [x, y] = versDoc(e);
    if (e.button === 1 || ui.outil === 'main' || espace.current) { garderFocus.current = !!sx.saisie; geste.current = { type: 'pan', x0: e.clientX, y0: e.clientY, vue }; return; }
    if (sx.choixForme) { sx.viserForme.current?.(prise.toutes(e)); return; } // le choix de la forme d'un texte pose (ADR-0031) : le clic la donne
    if (sx.saisie || ui.outil === 'texte') { geste.current = gt.appuyer(x, y, t, e.shiftKey); return; }
    if (estOutilZone(ui.outil)) { zone.commencer(ui.outil, [x, y], e); return; }
    const pd = poigneeDe(t), pa = poigneesActives(mo, ui); // une poignee de degrade (etape 4) : glisserPoignee
    if (pd && pa) { geste.current = { type: 'degrade', cote: pd.cote, cible: pd.cible, base: mo.dessin, id: pa.forme.id, cle: ac.nouvelleCle() }; return; }
    const rot = t.getAttribute('data-rotation');
    if (rot !== null && mo.boite) { geste.current = { type: 'rotation', centre: centre(mo.boite), angle0: angleVers(centre(mo.boite), [x, y]), base: mo.dessin, ids: mo.sel, cle: ac.nouvelleCle() }; return; }
    if (ui.outil === 'plume') { ac.poserTrace([...ui.trace, versGrille(e)]); return; }
    if (FORMES.has(ui.outil)) { const [gx, gy] = versGrille(e); geste.current = { type: 'tracer', outil: ui.outil as OutilForme, x0: gx, y0: gy, base: mo.dessin, cle: ac.nouvelleCle() }; return; }
    const coin = t.getAttribute('data-coin') as Coin | null, iAncre = t.getAttribute('data-ancre'), poignee = t.getAttribute('data-poignee');
    if (coin && mo.boite) {
      geste.current = { type: 'echelle', coin, b: mo.boite, base: mo.dessin, ids: mo.sel, cle: ac.nouvelleCle(), verrouille: ui.verrouProportions, ref: ac.proportionsDe(mo.sel, mo.boite) };
      return;
    }
    if (mo.formeSeule && iAncre !== null) {
      ac.poserPoint(Number(iAncre));
      geste.current = { type: 'ancre', i: Number(iAncre), base: mo.dessin, id: mo.formeSeule.id, cle: ac.nouvelleCle() };
      return;
    }
    if (mo.formeSeule && poignee) {
      const [i, k] = poignee.split(':').map(Number);
      geste.current = { type: 'poignee', i: i ?? 0, k: k === 1 ? 1 : 0, base: mo.dessin, id: mo.formeSeule.id, cle: ac.nouvelleCle() };
      return;
    }
    // Une forme hors du contexte d'edition fait sortir jusqu'a son niveau (ADR-0012, annexe 6 §2) : elle seule est alors choisie.
    const dedans = prise.prendre(e), id = dedans ?? prise.sortir(e);
    if (id) {
      const sel = dedans ? mo.sel : [];
      const ids = e.shiftKey ? (sel.includes(id) ? sel.filter(s => s !== id) : [...sel, id]) : sel.includes(id) ? sel : [id];
      ac.choisir(ids);
      if (ui.outil === 'points') { ac.poserPoint(null); return; }
      if (ids.includes(id)) geste.current = { type: 'deplacer', x0: x, y0: y, base: mo.dessin, ids, b: boiteDe(mo.dessin, ids), cle: ac.nouvelleCle() };
      return;
    }
    if (ui.outil === 'points' && ui.point !== null) { ac.poserPoint(null); return; }
    zone.commencer('cadre', [x, y], e);
  };

  const bouger = (e: PE<SVGSVGElement>) => {
    const g = geste.current;
    if (pointeurs.current.has(e.pointerId)) pointeurs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!g) { zone.bouger(versDoc(e)); return; }
    if (g.type === 'saisie') { sx.poignee.current?.bouger(versDoc(e)); return; }
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
    if (g.type === 'rotation' || g.type === 'deplacer' || g.type === 'echelle') commencerBrouillon(g.base);
    if (g.type === 'rotation') {
      let a = angleVers(g.centre, [x, y]) - g.angle0;
      if (e.shiftKey) a = Math.round(a / 15) * 15;
      ac.appliquer(() => tournerAutour(g.base, g.ids, a, g.centre), g.cle);
      return;
    }
    if (g.type === 'deplacer') {
      let dx = x - g.x0, dy = y - g.y0;
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      if (g.b) { dx = ui.aimant(g.b.x + dx) - g.b.x; dy = ui.aimant(g.b.y + dy) - g.b.y; }
      if (g.b && ui.aimants && !ui.grille) {
        // Le dessin de depart et la selection ne changent pas pendant le geste : les cibles se calculent une fois.
        // Des reperes masques n'attirent pas (ADR-0038) ; dans un groupe, seuls ses freres attirent (ADR-0012, annexe 6 §2).
        g.cibles ??= ciblesAimants(reperesActifs ? g.base : sansReperes(g.base), g.ids, niveauEdition(ui.contexte));
        const a = aimanterBoite({ ...g.b, x: g.b.x + dx, y: g.b.y + dy }, g.cibles, 6 / vue.zoom);
        dx += a.dx; dy += a.dy;
        ac.poserGuides(a.lignes);
      }
      ac.appliquer(() => deplacer(g.base, g.ids, dx, dy), g.cle);
      return;
    }
    const [gx, gy] = [ui.aimant(x), ui.aimant(y)];
    if (g.type === 'degrade') { ac.appliquer(() => glisserPoignee(g, x, y, gx, gy), g.cle); return; }
    if (g.type === 'echelle') ac.appliquer(() => etirer(g, gx, gy, proportionsAuCoin(g.verrouille, g.ref, g.b, e.shiftKey), mo.dessin.vb), g.cle);
    else if (g.type === 'ancre') ac.appliquer(() => deplacerAncre(g.base, g.id, g.i, gx, gy), g.cle);
    // Une poignee d'un nœud lisse ou symetrique entraine l'autre ; Alt la rompt le temps du geste.
    else if (g.type === 'poignee') ac.appliquer(() => deplacerPoigneeLiee(g.base, g.id, g.i, g.k, gx, gy, e.altKey), g.cle);
    else ac.appliquer(() => ajouterTracee(g.base, g.outil, formeTracee(g.outil, g.x0, g.y0, gx, gy, e.shiftKey, ui.parametres), ui.style).dessin, g.cle);
  };

  const lacher = (e: PE<SVGSVGElement>) => {
    const g = geste.current;
    pointeurs.current.delete(e.pointerId);
    if (g?.type === 'pincer') { if (pointeurs.current.size === 0) geste.current = null; return; }
    geste.current = null;
    finirBrouillon();
    if (ui.guides.length) ac.poserGuides([]);
    if (!g) { zone.lacher(versDoc(e)); return; }
    if (g.type === 'saisie') { sx.poignee.current?.lacher(); return; }
    if (g.type === 'tracer') {
      const [x, y] = versGrille(e);
      const r = ajouterTracee(g.base, g.outil, formeTracee(g.outil, g.x0, g.y0, x, y, e.shiftKey, ui.parametres), ui.style);
      const b = r.id ? boiteDe(r.dessin, [r.id]) : null;
      // Un trace sans surface a l'ecran n'est pas une forme : rien ne reste dans l'historique.
      if (!r.id || !b || (b.l * vue.zoom < 3 && b.h * vue.zoom < 3)) { ac.annulerGeste(g.cle); return; }
      poserFormeTracee(ac, r.dessin, r.id, g.cle);
      return;
    }
    if (g.type !== 'pan') ac.finir();
  };

  const doubleClic = (e: ME<SVGSVGElement>) => { if (ui.outil === 'plume') ac.finirTrace(true); else gt.doubleClic(e, versDoc(e)); };
  return { appuyer, bouger, lacher, doubleClic, sourisBas: gt.sourisBas, zone: zone.zone, brouillon };
}

/**
 * Le brouillon des effets (ADR-0012, etape 7-B, brouillon.ts) : pose au premier mouvement d'un glisser, d'un redimensionnement ou
 * d'une rotation sur un dessin a plus de vingt noeuds a effet, retire au relacher ; dit une fois par editeur.
 */
function useBrouillon(ac: ActionsEditeur) {
  const [brouillon, poserBrouillon] = useState(false);
  const enCours = useRef(false), dit = useRef(false);
  const finir = () => { if (enCours.current) { enCours.current = false; poserBrouillon(false); } };
  const commencer = (base: DessinSvg) => {
    if (enCours.current || !effetsAuRepos(base)) return;
    enCours.current = true;
    poserBrouillon(true);
    if (!dit.current) { dit.current = true; ac.dire(PHRASE_EFFETS_AU_REPOS); }
  };
  return { brouillon, commencer, finir };
}

/**
 * Les gestes du texte sur la toile (ADR-0027). Pendant la saisie, un appui dans le texte y pose le curseur (Maj etend la
 * selection, glisser choisit) ; un appui ailleurs termine la saisie, et ne fait rien d'autre. Sans saisie, l'outil Texte rouvre
 * le texte sous le pointeur, curseur a l'endroit du clic, ou commence un texte neuf a ce point.
 */
function useGestesTexte(prise: ReturnType<typeof usePrise>) {
  const mo = useDessin(), ac = useActions(), ui = useInterface(), sx = useSaisie();
  // Un appui qui sert la saisie : le focus doit rester dans son champ, la toile ne le prend pas (souris enfoncee).
  const garderFocus = useRef(false);
  /** Le texte vivant sous le pointeur : la forme touchee, sinon le plus haut dont la boite contient le point (entre deux lettres). */
  const texteSous = (cible: Element, x: number, y: number): string | null => {
    const id = cible.getAttribute('data-id'), touchee = id ? mo.dessin.formes.find(f => f.id === id) : undefined;
    if (touchee?.texte && !touchee.verrouille) return touchee.id;
    const dedans = mo.dessin.formes.filter(f => { const b = f.texte && f.visible && !f.verrouille ? boiteForme(f) : null; return !!b && x >= b.x && x <= b.x + b.l && y >= b.y && y <= b.y + b.h; });
    return dedans[dedans.length - 1]?.id ?? null;
  };
  /** L'appui : le geste qui suit (glisser pour choisir des caracteres), ou aucun. */
  const appuyer = (x: number, y: number, cible: Element, etendre: boolean): Geste | null => {
    const p = sx.poignee.current;
    if (sx.saisie) {
      if (p?.appuyer([x, y], etendre)) { garderFocus.current = true; return { type: 'saisie' }; }
      p?.terminer(true);
      return null;
    }
    garderFocus.current = true;
    const sous = texteSous(cible, x, y);
    if (sous) sx.ouvrir(sous, [x, y]); else sx.commencer([x, y]);
    return null;
  };
  /**
   * Le double-clic : dans une saisie, il choisit le mot. A l'outil selection, un texte vivant se retape sur la toile, le curseur
   * au point du clic ; un groupe d'un dessin riche s'ouvre (on y entre, et ce qui est sous le pointeur y est choisi, ADR-0012
   * annexe 6 §2) ; une autre forme passe en mode points. Le calcul du clic (PriseToile), pas la cible du DOM : la capture
   * du pointeur fait de la toile celle du double-clic.
   */
  const doubleClic = (e: ME<SVGSVGElement>, p: readonly [number, number]) => {
    if (sx.saisie) { sx.poignee.current?.doubleClic(p); return; }
    const id = prise.viser(e);
    if (!id || ui.outil !== 'selection') return;
    if (mo.dessin.groupes && Object.prototype.hasOwnProperty.call(mo.dessin.groupes, id)) {
      if (!ac.entrerGroupe(id)) return;
      const dedans = prise.viserDans(e, id);
      if (dedans) ac.choisir([dedans]);
      return;
    }
    ac.choisir([id]);
    const f = mo.dessin.formes.find(x => x.id === id);
    // Dans une decoupe ou un masque (paquet 8-D), un texte ne se retape pas, et ses points le vectoriseraient : on dit pourquoi.
    if (f?.texte && lentilleDe(ui.contexte)) { ac.dire(RAISONS_LENTILLE.texte); return; }
    if (f?.texte && !f.verrouille) sx.ouvrir(id, p); else ac.poserOutil('points');
  };
  /** La souris enfoncee donnerait le focus a la toile : pendant la saisie, il reste dans son champ. */
  const sourisBas = (e: ME<SVGSVGElement>) => { if (garderFocus.current) { e.preventDefault(); garderFocus.current = false; } };
  return { sx, garderFocus, appuyer, doubleClic, sourisBas };
}

/** Glisser une poignee de degrade : un arret prend la position de la projection du pointeur, une extremite le point aimante. */
function glisserPoignee(g: Extract<Geste, { type: 'degrade' }>, x: number, y: number, gx: number, gy: number): DessinSvg {
  const f = g.base.formes.find(v => v.id === g.id), d = f ? degradeDe(f, g.cote) : null;
  if (!d) return g.base;
  if (typeof g.cible === 'number') return modifierArret(g.base, [g.id], g.cote, g.cible, { position: positionSurAxe(d, x, y) });
  return deplacerExtremite(g.base, [g.id], g.cote, g.cible, gx, gy);
}

/** Tirer un coin : le coin oppose reste fixe ; passer de l'autre cote d'un bord retourne la selection. */
function etirer(g: Extract<Geste, { type: 'echelle' }>, x: number, y: number, ref: Cotes | null, vb: DessinSvg['vb']): DessinSvg {
  const b = g.b, fixeX = g.coin.endsWith('w') ? b.x + b.l : b.x, fixeY = g.coin.startsWith('n') ? b.y + b.h : b.y;
  const c = cotesProportionnels(Math.abs(x - fixeX), Math.abs(y - fixeY), ref);
  const min = Math.max(vb[2], vb[3]) / 1000;
  const l = Math.max(min, c.l), h = Math.max(min, c.h);
  let d = redimensionner(g.base, g.ids, { x: x < fixeX ? fixeX - l : fixeX, y: y < fixeY ? fixeY - h : fixeY, l, h });
  if ((x < fixeX) !== g.coin.endsWith('w')) d = retourner(d, g.ids, 'h');
  if ((y < fixeY) !== g.coin.startsWith('n')) d = retourner(d, g.ids, 'v');
  return d;
}
