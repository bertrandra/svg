// La vue sur le plan de travail (zoom, defilement, molette) et le pointeur tactile.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { DessinSvg } from '../engine/editionSvg.js';
import type { Vue, Vues } from './typesEditeur.js';

/** Vrai quand le pointeur principal est un doigt : les poignees de la toile grossissent. */
export function useTactile(): boolean {
  const [t, poserT] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const m = window.matchMedia('(pointer: coarse)');
    const suivre = () => poserT(m.matches);
    m.addEventListener('change', suivre);
    return () => m.removeEventListener('change', suivre);
  }, []);
  return t;
}

/** La vue sur le plan de travail : zoom, defilement, ajustement a l'ecran, molette. */
export function useVue(toile: RefObject<HTMLDivElement | null>, svgRef: RefObject<SVGSVGElement | null>, vb: DessinSvg['vb']): Vues {
  const [vue, poserVue] = useState<Vue>({ zoom: 1, x: 0, y: 0 });
  const ajuster = useCallback(() => {
    const el = toile.current;
    if (!el) return;
    const [x, y, l, h] = vb, W = el.clientWidth, H = el.clientHeight;
    const zoom = Math.max(0.01, Math.min(W / l, H / h) * 0.88);
    poserVue({ zoom, x: (W - l * zoom) / 2 - x * zoom, y: (H - h * zoom) / 2 - y * zoom });
  }, [toile, vb]);
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
  return useMemo(() => ({ vue, poserVue, ajuster, zoomer, centrer100 }), [vue, ajuster, zoomer, centrer100]);
}
