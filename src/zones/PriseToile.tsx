// Prendre une forme sur la toile (ADR-0029) : le clic et le survol passent par le meme calcul pur (engine/prise.ts), avec
// une tolerance en pixels d'ecran plus large au doigt. `usePrise` sert aux gestes (Gestes.ts) ; `SurvolToile`, pose dans la
// toile au-dessus des formes, suit le pointeur : le curseur « deplacer » (attribut `data-prise` du fond `FondPrise`, pose sous
// les formes, lu par editeur.css) et le lisere de la forme qu'un clic prendrait, ou de celle que le doigt touche.

import { memo, useEffect, useRef, useState, type RefObject } from 'react';
import type { Forme } from '../engine/editionSvg.js';
import { genreDeForme, numeroDeForme } from '../engine/description.js';
import { candidates, formeDessous, optionsPrise, zoneDePrise, type OptionsPrise } from '../engine/prise.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { useSaisie } from './contexteSaisie.js';
import type { Vue } from './typesEditeur.js';

/** Ce qu'il faut d'un evenement de pointeur (ou de souris, pour le double-clic : pas de `pointerType`, c'est une souris). */
interface Pointage { clientX: number; clientY: number; pointerType?: string; altKey?: boolean }

/** « Forme du dessous, 2 sur 3 : rectangle 4. » : ce que dit Alt+clic, qui ne se voit pas toujours (forme cachee dessous). */
export const phraseDessous = (f: Forme, rang: number, total: number): string =>
  'Forme du dessous, ' + rang + ' sur ' + total + ' : ' + genreDeForme(f) + ' ' + numeroDeForme(f) + '.';

/** Les formes que le pointeur peut prendre, la meilleure d'abord : le seul calcul du clic et du survol. */
function idsSous(svg: SVGSVGElement | null, formes: readonly Forme[], vue: Vue, contours: boolean, e: Pointage): string[] {
  const r = svg?.getBoundingClientRect();
  if (!r) return [];
  const o: OptionsPrise = optionsPrise(vue.zoom, e.pointerType === 'touch', contours);
  return candidates(formes, (e.clientX - r.left - vue.x) / vue.zoom, (e.clientY - r.top - vue.y) / vue.zoom, o).map(c => c.id);
}

/**
 * La forme prise par Alt+clic, par toile : un appui au meme endroit (a la tolerance pres) la reprend tant qu'elle est choisie,
 * sans quoi la tirer reprendrait celle du dessus. Le clic et le survol la lisent tous deux : le lisere ne ment pas.
 */
const dessous = new WeakMap<SVGSVGElement, { readonly id: string; readonly x: number; readonly y: number }>();

/** La forme qu'un appui sans Alt prend parmi `ids` : celle d'un Alt+clic tout proche, encore choisie, sinon la meilleure. */
function priseSansAlt(svg: SVGSVGElement | null, ids: readonly string[], sel: readonly string[], e: Pointage): string | null {
  const d = svg ? dessous.get(svg) : undefined;
  const pres = !!d && sel.includes(d.id) && ids.includes(d.id) && Math.hypot(e.clientX - d.x, e.clientY - d.y) <= optionsPrise(1, e.pointerType === 'touch').tolerance;
  return pres && d ? d.id : ids[0] ?? null;
}

/** La prise des gestes : la forme sous le pointeur, ou, avec Alt, celle du dessous de la selection (dite a voix haute). */
export function usePrise(svgRef: RefObject<SVGSVGElement | null>) {
  const mo = useDessin(), ui = useInterface(), ac = useActions();
  const sous = (e: Pointage): string[] => idsSous(svgRef.current, mo.dessin.formes, ui.vues.vue, ui.contours, e);
  return {
    /** La forme qu'un double-clic vise : la meilleure, sans cycle. */
    viser: (e: Pointage): string | null => sous(e)[0] ?? null,
    /** Toutes les formes que le pointeur peut prendre, la meilleure d'abord (le choix de la forme d'un texte pose, ADR-0031). */
    toutes: (e: Pointage): string[] => sous(e),
    /** La forme qu'un appui prend ; Alt passe a celle du dessous, en boucle. */
    prendre(e: Pointage): string | null {
      const svg = svgRef.current, ids = sous(e);
      if (!e.altKey) {
        const id = priseSansAlt(svg, ids, mo.sel, e);
        if (svg && id !== dessous.get(svg)?.id) dessous.delete(svg);
        return id;
      }
      if (ids.length < 2) return ids[0] ?? null;
      const id = formeDessous(ids, mo.sel), f = mo.dessin.formes.find(x => x.id === id);
      if (!id || !f) return null;
      if (svg) dessous.set(svg, { id, x: e.clientX, y: e.clientY });
      ac.annoncer(phraseDessous(f, ids.indexOf(id) + 1, ids.length));
      return id;
    }
  };
}

/** Ce qui est survole (ou touche) : la forme, et si c'est au doigt (le lisere se montre alors meme sur une forme choisie). */
interface Survol { readonly id: string; readonly doigt: boolean }

/** Les poignees de la surcouche ont leur propre curseur : sur elles, rien n'est survole. */
const SUR_POIGNEE = '[data-coin], [data-rotation], [data-ancre], [data-poignee], [data-depart]';

/**
 * Le fond de la toile, sous les formes : ce que le pointeur touche hors d'une forme, et qui porte le curseur « deplacer » pres
 * d'une forme (dans la tolerance). Sur une forme, le chemin le porte lui-meme (editeur.css). Le curseur ne se pose jamais sur
 * la toile au survol : `cursor` s'herite, et le changer sur la toile recalculait le style de chaque forme (34 ms par passage
 * d'une forme au vide sur 5 000 formes, mesure) ; sur ce fond, qui n'a pas d'enfant, il ne coute rien.
 */
export const FondPrise = memo(function FondPrise() {
  return <rect className="fond-prise" width="100%" height="100%" fill="none" pointerEvents="all" />;
});

/** Le survol de la toile : curseur « deplacer » et lisere, avec l'outil de selection seulement. */
// Le chemin d'une forme vient de la toile (`cheminDe`, memorise par forme), comme pour AlertesToile : sans import de Toile.tsx, pas de cycle.
export const SurvolToile = memo(function SurvolToile({ svgRef, chemin }: { svgRef: RefObject<SVGSVGElement | null>; chemin: (f: Forme) => string }) {
  const mo = useDessin(), ui = useInterface(), { choixForme } = useSaisie();
  const [survol, poserSurvol] = useState<Survol | null>(null);
  // Les ecouteurs sont poses une fois : ils lisent l'etat du dernier rendu.
  const etat = useRef({ formes: mo.dessin.formes, sel: mo.sel, vue: ui.vues.vue, contours: ui.contours, outil: ui.outil });
  etat.current = { formes: mo.dessin.formes, sel: mo.sel, vue: ui.vues.vue, contours: ui.contours, outil: ui.outil };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const fond = () => svg.querySelector('.fond-prise');
    const poser = (s: Survol | null) => {
      if (s) fond()?.setAttribute('data-prise', 'deplacer'); else fond()?.removeAttribute('data-prise');
      poserSurvol(avant => (avant?.id === s?.id && avant?.doigt === s?.doigt ? avant : s));
    };
    const viser = (e: PointerEvent, doigt: boolean): string | null => {
      const { formes, sel, vue, contours, outil } = etat.current;
      const id = outil !== 'selection' || (e.target instanceof Element && e.target.closest(SUR_POIGNEE)) ? null : priseSansAlt(svg, idsSous(svg, formes, vue, contours, e), sel, e);
      poser(id ? { id, doigt } : null);
      return id;
    };
    // Pendant un geste (bouton appuye), le survol ne bouge pas.
    const bouger = (e: PointerEvent) => { if (e.pointerType !== 'touch' && !e.buttons) viser(e, false); };
    // Au doigt, pas de survol : le lisere vient au toucher, et s'en va quand le doigt se leve ou qu'un second pince. A la souris,
    // tirer une forme garde « deplacer » : la toile capture le pointeur et donne son curseur, pose le temps du geste (un seul
    // recalcul de style au debut, un a la fin).
    const appuyer = (e: PointerEvent) => {
      if (e.pointerType === 'touch') { if (e.isPrimary) viser(e, true); else poser(null); return; }
      if (e.button === 0 && viser(e, false)) svg.setAttribute('data-prise', 'deplacer');
    };
    const lacher = (e: PointerEvent) => { svg.removeAttribute('data-prise'); if (e.pointerType === 'touch') poser(null); };
    const quitter = (e: PointerEvent) => { if (e.pointerType !== 'touch' && !e.buttons) poser(null); };
    svg.addEventListener('pointermove', bouger);
    svg.addEventListener('pointerdown', appuyer);
    svg.addEventListener('pointerup', lacher);
    svg.addEventListener('pointercancel', lacher);
    svg.addEventListener('pointerleave', quitter);
    return () => {
      svg.removeEventListener('pointermove', bouger);
      svg.removeEventListener('pointerdown', appuyer);
      svg.removeEventListener('pointerup', lacher);
      svg.removeEventListener('pointercancel', lacher);
      svg.removeEventListener('pointerleave', quitter);
      svg.removeAttribute('data-prise');
    };
  }, [svgRef]);

  // Un autre outil a son propre curseur : le survol s'efface.
  useEffect(() => {
    if (ui.outil === 'selection') return;
    svgRef.current?.querySelector('.fond-prise')?.removeAttribute('data-prise');
    poserSurvol(null);
  }, [ui.outil, svgRef]);

  const f = survol ? mo.dessin.formes.find(x => x.id === survol.id) : undefined;
  // Une forme deja choisie a son trace de selection : le lisere ne s'y ajoute qu'au doigt, pour montrer ce qu'il touche.
  // Pendant le choix de la forme d'un texte (ADR-0031), c'est ce choix qui montre la forme visee.
  if (!survol || !f || !f.visible || f.verrouille || (!survol.doigt && mo.sel.includes(f.id)) || ui.outil !== 'selection' || choixForme) return null;
  const b = zoneDePrise(f, optionsPrise(ui.vues.vue.zoom, survol.doigt, ui.contours));
  return (
    <g pointerEvents="none" aria-hidden="true">
      {b
        ? <><rect className="lisere-survol-fond" x={b.x} y={b.y} width={b.l} height={b.h} /><rect className="lisere-survol" x={b.x} y={b.y} width={b.l} height={b.h} /></>
        : <><path className="lisere-survol-fond" d={chemin(f)} /><path className="lisere-survol" d={chemin(f)} /></>}
    </g>
  );
});
