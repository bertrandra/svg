// Ce qui se dessine sur la toile : les formes, la grille, et la surcouche (selection, poignees, trace).

import { memo, type ReactNode } from 'react';
import { ancre, attributsTrait, depart, ecrireChemin, opaciteDuContour, opaciteDuRemplissage, type Boite, type DessinSvg, type Forme } from '../engine/editionSvg.js';
import type { Coin, Edition } from './typesEditeur.js';

const cacheChemins = new WeakMap<Forme, string>();
function cheminDe(f: Forme): string {
  let d = cacheChemins.get(f);
  if (d === undefined) { d = ecrireChemin(f.d, 3); cacheChemins.set(f, d); }
  return d;
}

/** Le style du trait en proprietes React (stroke-dasharray devient strokeDasharray) : la meme liste que l'ecriture du SVG. */
const traitReact = (f: Forme): Record<string, string> =>
  Object.fromEntries(attributsTrait(f).map(([k, v]) => [k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()), v]));

export const Calque = memo(function Calque({ f, contours }: { f: Forme; contours: boolean }) {
  if (!f.visible) return null;
  const pe = f.verrouille ? 'none' : contours ? 'all' : f.remplissage ? 'visiblePainted' : 'stroke';
  return contours
    ? <path data-id={f.id} className="trace-contour" d={cheminDe(f)} fill="none" fillRule={f.regle} pointerEvents={pe} />
    : <path data-id={f.id} d={cheminDe(f)} fill={f.remplissage ?? 'none'} fillRule={f.regle} fillOpacity={f.remplissage && opaciteDuRemplissage(f) < 1 ? opaciteDuRemplissage(f) : undefined} stroke={f.contour ?? undefined}
      strokeWidth={f.contour ? f.epaisseur : undefined} strokeOpacity={f.contour && opaciteDuContour(f) < 1 ? opaciteDuContour(f) : undefined} {...traitReact(f)} opacity={f.opacite < 1 ? f.opacite : undefined} pointerEvents={pe} />;
});

/** La grille, en lignes fines a l'ecran quel que soit le zoom. */
export function Grille({ vb, pas }: { vb: DessinSvg['vb']; pas: number }) {
  const [x, y, l, h] = vb, ox = x % pas, oy = y % pas;
  return (
    <>
      <defs>
        <pattern id="grille-editeur" patternUnits="userSpaceOnUse" x={ox} y={oy} width={pas} height={pas}>
          <path className="grille" d={`M${pas} 0L0 0L0 ${pas}`} fill="none" />
        </pattern>
      </defs>
      <rect x={x} y={y} width={l} height={h} fill="url(#grille-editeur)" pointerEvents="none" />
    </>
  );
}

/** Ce qui se dessine par-dessus : selection, boite et coins, points et poignees, cadre, trace en cours. */
export function surcouche(ed: Edition, unite: number, cadre: Boite | null, tactile: boolean): ReactNode[] {
  const r: ReactNode[] = [];
  // Au doigt, les poignees grossissent : une cible de 8 px ne se touche pas.
  const px = unite * (tactile ? 1.8 : 1);
  // Une forme par identifiant, une fois : `find` pour chaque forme choisie coute n x m (5000 x 5000 = 60 ms).
  const parId = new Map<string, Forme>();
  if (ed.sel.length) for (const x of ed.dessin.formes) if (!parId.has(x.id)) parId.set(x.id, x);
  for (const id of ed.sel) {
    const f = parId.get(id);
    if (f) r.push(<path key={'s' + id} className="trace-choisi" d={cheminDe(f)} pointerEvents="none" />);
  }
  const b = ed.boite;
  if (b && ed.outil === 'selection') {
    r.push(<rect key="boite" className="boite-choisie" x={b.x} y={b.y} width={b.l} height={b.h} pointerEvents="none" />);
    const coins: [Coin, number, number][] = [['nw', b.x, b.y], ['ne', b.x + b.l, b.y], ['sw', b.x, b.y + b.h], ['se', b.x + b.l, b.y + b.h]];
    for (const [c, cx, cy] of coins) r.push(<rect key={c} data-coin={c} className={'coin coin-' + c} x={cx - 4 * px} y={cy - 4 * px} width={8 * px} height={8 * px} />);
    // La poignee de rotation, au-dessus du milieu du bord haut.
    r.push(<line key="lien-rot" className="lien-poignee" x1={b.x + b.l / 2} y1={b.y} x2={b.x + b.l / 2} y2={b.y - 22 * px} pointerEvents="none" />);
    r.push(<circle key="rot" data-rotation="1" className="poignee-rotation" cx={b.x + b.l / 2} cy={b.y - 22 * px} r={5 * px} />);
  }
  for (const [i, g] of ed.guides.entries()) {
    r.push(g.axe === 'x'
      ? <line key={'g' + i} className="guide" x1={g.valeur} y1={g.de} x2={g.valeur} y2={g.a} pointerEvents="none" />
      : <line key={'g' + i} className="guide" x1={g.de} y1={g.valeur} x2={g.a} y2={g.valeur} pointerEvents="none" />);
  }
  const fs = ed.formeSeule, p = ed.point;
  if (ed.outil === 'points' && fs) {
    const d = fs.d;
    const c = p !== null ? d[p] : undefined, a = c ? ancre(c) : null;
    if (c && a && p !== null) {
      const lien = (cle: string, x1: number, y1: number, x2: number, y2: number, i: number, k: 0 | 1) => {
        r.push(<line key={'l' + cle} className="lien-poignee" x1={x1} y1={y1} x2={x2} y2={y2} pointerEvents="none" />);
        r.push(<circle key={'p' + cle} data-poignee={i + ':' + k} className="poignee" cx={x2} cy={y2} r={4 * px} />);
      };
      if (c.c === 'C') lien('a', a[0], a[1], c.p[2] ?? 0, c.p[3] ?? 0, p, 1);
      if (c.c === 'Q') { const [x0, y0] = depart(d, p); lien('q', x0, y0, c.p[0] ?? 0, c.p[1] ?? 0, p, 0); }
      const s = d[p + 1];
      if (s?.c === 'C') lien('b', a[0], a[1], s.p[0] ?? 0, s.p[1] ?? 0, p + 1, 0);
    }
    d.forEach((x, i) => {
      const q = ancre(x);
      if (q) r.push(<rect key={'a' + i} data-ancre={i} className={'ancre' + (i === p ? ' ancre-choisie' : '')} x={q[0] - 3.5 * px} y={q[1] - 3.5 * px} width={7 * px} height={7 * px} />);
    });
  }
  if (ed.trace.length) {
    r.push(<polyline key="trace" className="trace-en-cours" points={ed.trace.map(q => q[0] + ',' + q[1]).join(' ')} pointerEvents="none" />);
    ed.trace.forEach((q, i) => r.push(<rect key={'t' + i} className={'ancre' + (i === 0 ? ' ancre-choisie' : '')} x={q[0] - 3.5 * px} y={q[1] - 3.5 * px} width={7 * px} height={7 * px} pointerEvents="none" />));
  }
  if (cadre) r.push(<rect key="cadre" className="cadre-selection" x={cadre.x} y={cadre.y} width={cadre.l} height={cadre.h} pointerEvents="none" />);
  return r;
}
