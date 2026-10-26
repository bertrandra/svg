// La vue sur le plan de travail (zoom, defilement, molette) et le pointeur tactile.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { DessinSvg } from '../engine/editionSvg.js';
import type { Vue, Vues } from './typesEditeur.js';

/** Vrai tant que la requete de media est vraie ; elle se relit quand elle change (rotation, redimensionnement, pointeur branche). */
function useMedia(requete: string): boolean {
  // Hors navigateur (le rendu des tests, renderToStaticMarkup), aucune requete ne vaut.
  const [v, poserV] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(requete).matches);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const m = window.matchMedia(requete);
    const suivre = () => poserV(m.matches);
    suivre();
    m.addEventListener('change', suivre);
    return () => m.removeEventListener('change', suivre);
  }, [requete]);
  return v;
}

/** Vrai quand le pointeur principal est un doigt : les poignees de la toile grossissent. */
export function useTactile(): boolean {
  return useMedia('(pointer: coarse)');
}

/**
 * Vrai quand le pointeur principal survole finement (une souris, un stylet) : l'arbre des calques n'y dessine les boutons d'une ligne
 * qu'a la ligne active, survolee, ou dont l'etat n'est pas celui de repos (ArbreCalques.tsx). Faux au doigt et hors navigateur.
 */
export function useSurvolFin(): boolean {
  return useMedia('(hover: hover) and (pointer: fine)');
}

/**
 * La largeur sous laquelle la barre se resserre (outils, couleurs et historique seuls, le reste dans « Plus », Enregistrer en bas).
 * Elle doit rester egale a la requete `max-width` du meme nom dans editeur.css.
 */
export const LARGEUR_TELEPHONE = 640;

/** Vrai sur un ecran de telephone (`LARGEUR_TELEPHONE`). */
export function useTelephone(): boolean {
  return useMedia('(max-width: ' + LARGEUR_TELEPHONE + 'px)');
}

/**
 * Vrai quand la rangee de la selection doit se resserrer (BarreSelection.tsx) : sur un telephone, ou au doigt jusqu'a une tablette
 * en paysage, ou ses vingt-cinq gestes de 40 px ne tiennent pas sur une ligne. A la souris dans une fenetre etroite, elle defile.
 */
export function useRangeeCompacte(): boolean {
  return useMedia('(max-width: ' + LARGEUR_TELEPHONE + 'px), (pointer: coarse) and (max-width: 1200px)');
}

/** La vue sur le plan de travail : zoom, defilement, ajustement a l'ecran, molette. */
export function useVue(toile: RefObject<HTMLDivElement | null>, svgRef: RefObject<SVGSVGElement | null>, vb: DessinSvg['vb']): Vues {
  const [vue, poserVue] = useState<Vue>({ zoom: 1, x: 0, y: 0 });
  // Une boite du plan a 88 % de la toile, centree : ce que fait « Ajuster » pour le dessin, et pour le tapis d'une Cricut.
  const cadrer = useCallback((b: { readonly x: number; readonly y: number; readonly l: number; readonly h: number }) => {
    const el = toile.current;
    if (!el || !(b.l > 0) || !(b.h > 0)) return;
    const W = el.clientWidth, H = el.clientHeight;
    const zoom = Math.max(0.01, Math.min(W / b.l, H / b.h) * 0.88);
    poserVue({ zoom, x: (W - b.l * zoom) / 2 - b.x * zoom, y: (H - b.h * zoom) / 2 - b.y * zoom });
  }, [toile]);
  const ajuster = useCallback(() => { const [x, y, l, h] = vb; cadrer({ x, y, l, h }); }, [cadrer, vb]);
  const premier = useRef(true);
  useLayoutEffect(() => { if (premier.current) { premier.current = false; ajuster(); } }, [ajuster]);
  const zoomer = useCallback((f: number, cx?: number, cy?: number) => {
    poserVue(v => {
      const el = toile.current, px = cx ?? (el ? el.clientWidth / 2 : 0), py = cy ?? (el ? el.clientHeight / 2 : 0);
      const zoom = Math.max(0.02, Math.min(64, v.zoom * f)), k = zoom / v.zoom;
      return { zoom, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    });
  }, [toile]);
  const centrer100 = useCallback(() => {
    const el = toile.current;
    if (!el) return;
    const [x, y, l, h] = vb;
    poserVue({ zoom: 1, x: (el.clientWidth - l) / 2 - x, y: (el.clientHeight - h) / 2 - y });
  }, [toile, vb]);
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const roue = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.shiftKey && !e.ctrlKey && !e.metaKey) poserVue(v => ({ ...v, x: v.x - e.deltaY }));
      else zoomer(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', roue, { passive: false });
    return () => el.removeEventListener('wheel', roue);
  }, [svgRef, zoomer]);
  // Un objet stable tant que rien ne change : il entre dans le contexte de l'interface.
  return useMemo(() => ({ vue, poserVue, ajuster, zoomer, centrer100, cadrer }), [vue, ajuster, zoomer, centrer100, cadrer]);
}
