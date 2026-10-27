// Les regles de la toile (ADR-0038) : en haut et a gauche, graduees dans les unites du plan, ou en millimetres ou en pouces en
// contexte de production (ADR-0013). On en tire un repere : glisser depuis la regle du haut pose un repere horizontal, depuis
// celle de gauche un vertical ; relache sur la regle, il n'est pas pose. Au clavier, chaque regle est un bouton : Entree pose un
// repere au milieu de la vue et ouvre son champ. Le calcul des traits est pur (graduations.ts) ; ici, le dessin et le geste.

import { useEffect, useRef, useState, type KeyboardEvent as KE, type PointerEvent as PE, type RefObject } from 'react';
import { boiteForme, type AxeRepere } from '../engine/editionSvg.js';
import { useDessin, useInterface } from './contexteEditeur.js';
import { useActionsRegles, useRegles, type RepereDesigne } from './contexteRegles.js';
import { graduations, texteValeur } from './graduations.js';
import { useTactile } from './Vue.js';
import { t } from '../util/i18n.js';

/** L'epaisseur d'une regle : la cible de 24 px a la souris, 40 au doigt (DESIGN.md). */
export const epaisseurRegle = (tactile: boolean): number => (tactile ? 40 : 24);

/** La taille de la toile, suivie quand elle change (fenetre, tiroir, rotation). */
export function useTailleToile(toile: RefObject<HTMLDivElement | null>): { l: number; h: number } {
  const [taille, poserTaille] = useState({ l: 0, h: 0 });
  useEffect(() => {
    const el = toile.current;
    if (!el) return;
    const lire = () => poserTaille(t => (t.l === el.clientWidth && t.h === el.clientHeight ? t : { l: el.clientWidth, h: el.clientHeight }));
    lire();
    // Sans ResizeObserver (docs/navigateurs.md), la regle se remesure au redimensionnement de la fenetre seulement.
    if (typeof ResizeObserver !== 'function') { window.addEventListener('resize', lire); return () => window.removeEventListener('resize', lire); }
    const o = new ResizeObserver(lire);
    o.observe(el);
    return () => o.disconnect();
  }, [toile]);
  return taille;
}

/**
 * La valeur d'un repere tire, aimantee : a la grille quand elle est active ; sinon, avec les aimants, aux bords et aux centres des
 * formes visibles et du plan dans son axe, a six pixels d'ecran pres. Telle quelle sans aimant.
 */
export function useAimantRepere(): (axe: AxeRepere, v: number) => number {
  const { dessin } = useDessin(), ui = useInterface();
  return (axe, v) => {
    if (ui.grille) return ui.aimant(v);
    if (!ui.aimants) return v;
    const seuil = 6 / ui.vues.vue.zoom, [x, y, l, h] = dessin.vb;
    let meilleur = v, ecart = seuil;
    const essayer = (c: number) => { const d = Math.abs(c - v); if (d <= ecart) { ecart = d; meilleur = c; } };
    for (const c of axe === 'h' ? [y, y + h / 2, y + h] : [x, x + l / 2, x + l]) essayer(c);
    for (const f of dessin.formes) {
      const b = f.visible ? boiteForme(f) : null;
      if (b) for (const c of axe === 'h' ? [b.y, b.y + b.h / 2, b.y + b.h] : [b.x, b.x + b.l / 2, b.x + b.l]) essayer(c);
    }
    return meilleur;
  };
}

/**
 * Une regle : ses traits en SVG et ses libelles, le tout decoratif : la prise qui la recouvre se nomme pour les lecteurs d'ecran.
 */
function Graduation({ axe, longueur, epaisseur, origine }: { axe: AxeRepere; longueur: number; epaisseur: number; origine: number }) {
  const ui = useInterface(), rg = useRegles();
  const traits = graduations(longueur, origine, ui.vues.vue.zoom, rg.unite);
  const horizontale = axe === 'h';
  return (
    <div className="regle-graduation" aria-hidden="true">
      <svg className="regle-traits" width={horizontale ? longueur : epaisseur} height={horizontale ? epaisseur : longueur} focusable="false">
        {traits.map(t => {
          const long = t.majeur ? epaisseur * 0.55 : epaisseur * 0.25, p = Math.round(t.px) + 0.5;
          return horizontale
            ? <line key={t.px} x1={p} x2={p} y1={epaisseur} y2={epaisseur - long} />
            : <line key={t.px} y1={p} y2={p} x1={epaisseur} x2={epaisseur - long} />;
        })}
      </svg>
      {/* Le libelle s'ecrit par la feuille (`content: attr(data-texte)`) : decoratif, il n'est ni lu ni audite comme un texte (un « 0 »
          seul est trop court pour qu'un audit de contraste tranche) ; sa paire encre douce sur panneau tient 4,5:1 par le registre. */}
      {traits.filter(t => t.majeur).map(t => <span key={'l' + t.px} className="regle-libelle" data-texte={t.texte} style={horizontale ? { left: t.px } : { top: t.px }} />)}
    </div>
  );
}

/** Les regles et le geste qui en tire un repere. `toile` : le conteneur de la toile, dont le coin haut gauche est l'origine de la vue. */
export function Regles({ toile }: { toile: RefObject<HTMLDivElement | null> }) {
  const rg = useRegles(), arg = useActionsRegles(), ui = useInterface();
  const taille = useTailleToile(toile), tactile = useTactile(), e = epaisseurRegle(tactile);
  const aimanter = useAimantRepere();
  const tir = useRef<{ axe: AxeRepere; id: number } | null>(null);
  const poserEtiquette = arg.poserEtiquette;
  // Echap pendant un tirage l'abandonne : rien n'est pose.
  useEffect(() => {
    const touche = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && tir.current) { tir.current = null; arg.poserTirage(null); poserEtiquette(null); } };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [arg, poserEtiquette]);
  // L'etiquette d'un repere qu'on glisse se montre meme sans regles.
  const etiquette = rg.etiquette ? <span className="etiquette-repere" style={{ left: rg.etiquette.x, top: rg.etiquette.y }} aria-hidden="true">{rg.etiquette.texte}</span> : null;
  if (!rg.regles) return etiquette;
  const { vue } = ui.vues;

  const plan = (ev: { clientX: number; clientY: number }, axe: AxeRepere): number => {
    const r = toile.current?.getBoundingClientRect();
    if (!r) return 0;
    return axe === 'h' ? (ev.clientY - r.top - vue.y) / vue.zoom : (ev.clientX - r.left - vue.x) / vue.zoom;
  };
  /** Vrai quand le pointeur est sur la toile, hors des regles : la ou un repere tire se pose. */
  const surLaToile = (ev: { clientX: number; clientY: number }): boolean => {
    const r = toile.current?.getBoundingClientRect();
    return !!r && ev.clientX > r.left + e && ev.clientX < r.right && ev.clientY > r.top + e && ev.clientY < r.bottom;
  };
  const appuyer = (axe: AxeRepere) => (ev: PE<HTMLDivElement>) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch { /* sans capture, le geste suit tant que le pointeur reste sur la regle */ }
    tir.current = { axe, id: ev.pointerId };
  };
  const bouger = (ev: PE<HTMLDivElement>) => {
    const t = tir.current;
    if (!t || t.id !== ev.pointerId) return;
    const valeur = aimanter(t.axe, plan(ev, t.axe)), dedans = surLaToile(ev);
    arg.poserTirage(dedans ? { axe: t.axe, valeur } : null);
    const r = toile.current?.getBoundingClientRect();
    poserEtiquette(dedans && r ? { x: ev.clientX - r.left, y: ev.clientY - r.top, texte: texteValeur(valeur, rg.unite) } : null);
  };
  const lacher = (ev: PE<HTMLDivElement>) => {
    const t = tir.current;
    if (!t || t.id !== ev.pointerId) return;
    tir.current = null;
    arg.poserTirage(null);
    poserEtiquette(null);
    if (ev.type === 'pointerup' && surLaToile(ev)) arg.ajouter(t.axe, aimanter(t.axe, plan(ev, t.axe)));
  };
  /** Entree ou Espace sur une regle : un repere au milieu de la vue, et son champ, pour le poser a une valeur exacte. */
  const clavier = (axe: AxeRepere) => (ev: KE<HTMLDivElement>) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault();
    const milieu = axe === 'h' ? (taille.h / 2 - vue.y) / vue.zoom : (taille.l / 2 - vue.x) / vue.zoom;
    const valeur: RepereDesigne = { axe, valeur: Number(milieu.toFixed(3)) };
    arg.ajouter(axe, valeur.valeur);
    arg.ouvrir('reperes', valeur);
  };
  const regle = (axe: AxeRepere) => (
    <div className={'regle regle-' + axe} style={axe === 'h' ? { left: e, height: e } : { top: e, width: e }}
      onPointerDown={appuyer(axe)} onPointerMove={bouger} onPointerUp={lacher} onPointerCancel={lacher}>
      {/* La prise : ce que le clavier atteint et ce que lisent les lecteurs d'ecran, sans texte a elle ; la graduation se pose
          dessus (sans pointeur), pour que ses libelles aient la regle pour fond, et non un element qui les recouvre. */}
      <div className="regle-prise" role="button" tabIndex={0} onKeyDown={clavier(axe)}
        aria-label={axe === 'h' ? t('Règle horizontale : glissez vers la toile pour tirer un repère horizontal, ou Entrée pour en poser un au milieu de la vue') : t('Règle verticale : glissez vers la toile pour tirer un repère vertical, ou Entrée pour en poser un au milieu de la vue')}
        title={axe === 'h' ? t('Glissez vers la toile : un repère horizontal') : t('Glissez vers la toile : un repère vertical')} />
      <Graduation axe={axe} longueur={Math.max(0, (axe === 'h' ? taille.l : taille.h) - e)} epaisseur={e} origine={(axe === 'h' ? vue.x : vue.y) - e} />
    </div>
  );
  return (
    <>
      {regle('h')}
      {regle('v')}
      {/* Le coin : l'unite des regles, ecrite une fois (vide pour les unites du plan). */}
      <div className="regle-coin" style={{ width: e, height: e }} aria-hidden="true">{rg.unite.nom ? t(rg.unite.nom) : ''}</div>
      {etiquette}
    </>
  );
}
