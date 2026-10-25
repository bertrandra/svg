// Ce qui se dessine sur la toile : les formes, la grille, et la surcouche (selection, poignees, trace).

import { memo, type ReactNode } from 'react';
import { ancre, attributsTrait, depart, ecrireChemin, opaciteDuContour, opaciteDuRemplissage, type Boite, type DessinSvg, type Forme } from '../engine/editionSvg.js';
import { FORMES } from './aidesEditeur.js';
import { formeTracee } from './Gestes.js';
import type { Coin, EtatInterface, ModeleDessin, OutilForme } from './typesEditeur.js';

const cacheChemins = new WeakMap<Forme, string>();
export function cheminDe(f: Forme): string {
  let d = cacheChemins.get(f);
  if (d === undefined) { d = ecrireChemin(f.d, 3); cacheChemins.set(f, d); }
  return d;
}

/** Le style du trait en proprietes React (stroke-dasharray devient strokeDasharray) : la meme liste que l'ecriture du SVG. */
const traitReact = (f: Forme): Record<string, string> =>
  Object.fromEntries(attributsTrait(f).map(([k, v]) => [k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()), v]));

export const Calque = memo(function Calque({ f, contours, masquee = false }: { f: Forme; contours: boolean; masquee?: boolean }) {
  // Masquee : le texte en saisie ne dessine rien pour l'instant (vide, ou fait de blancs), ses contours d'avant ne se montrent pas.
  if (!f.visible || masquee) return null;
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

/**
 * Ce qui se dessine par-dessus : selection, boite et coins, points et poignees, cadre, trace en cours. Pendant la saisie d'un
 * texte (`saisie`), ni selection ni poignees : la saisie dessine son cadre et son curseur (SaisieTexte.tsx).
 */
export function surcouche(mo: ModeleDessin, ui: EtatInterface, unite: number, cadre: Boite | null, tactile: boolean, saisie = false): ReactNode[] {
  const r: ReactNode[] = [];
  if (saisie) return r;
  // Au doigt, les poignees grossissent : une cible de 8 px ne se touche pas.
  const px = unite * (tactile ? 1.8 : 1);
  // Une forme par identifiant, une fois : `find` pour chaque forme choisie coute n x m (5000 x 5000 = 60 ms).
  const parId = new Map<string, Forme>();
  if (mo.sel.length) for (const x of mo.dessin.formes) if (!parId.has(x.id)) parId.set(x.id, x);
  for (const id of mo.sel) {
    const f = parId.get(id);
    if (f) r.push(<path key={'s' + id} className="trace-choisi" d={cheminDe(f)} pointerEvents="none" />);
  }
  // Le curseur de la selection au clavier (Maj+Page suivante, Espace) : un anneau a deux tons, lisible sur tout dessin.
  const focale = ui.focale && ui.focale.sel === mo.sel ? mo.dessin.formes.find(x => x.id === ui.focale?.id) : undefined;
  if (focale && focale.visible) {
    r.push(<path key="focale-fond" className="focale-fond" d={cheminDe(focale)} pointerEvents="none" />);
    r.push(<path key="focale" className="focale" d={cheminDe(focale)} pointerEvents="none" />);
  }
  const b = mo.boite;
  if (b && ui.outil === 'selection') {
    r.push(<rect key="boite" className="boite-choisie" x={b.x} y={b.y} width={b.l} height={b.h} pointerEvents="none" />);
    const coins: [Coin, number, number][] = [['nw', b.x, b.y], ['ne', b.x + b.l, b.y], ['sw', b.x, b.y + b.h], ['se', b.x + b.l, b.y + b.h]];
    for (const [c, cx, cy] of coins) r.push(<rect key={c} data-coin={c} className={'coin coin-' + c} x={cx - 4 * px} y={cy - 4 * px} width={8 * px} height={8 * px} />);
    // La poignee de rotation, au-dessus du milieu du bord haut.
    r.push(<line key="lien-rot" className="lien-poignee" x1={b.x + b.l / 2} y1={b.y} x2={b.x + b.l / 2} y2={b.y - 22 * px} pointerEvents="none" />);
    r.push(<circle key="rot" data-rotation="1" className="poignee-rotation" cx={b.x + b.l / 2} cy={b.y - 22 * px} r={5 * px} />);
  }
  for (const [i, g] of ui.guides.entries()) {
    r.push(g.axe === 'x'
      ? <line key={'g' + i} className="guide" x1={g.valeur} y1={g.de} x2={g.valeur} y2={g.a} pointerEvents="none" />
      : <line key={'g' + i} className="guide" x1={g.de} y1={g.valeur} x2={g.a} y2={g.valeur} pointerEvents="none" />);
  }
  const fs = mo.formeSeule, p = ui.point;
  if (ui.outil === 'points' && fs) {
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
  // Une forme a deux coins au clavier : le premier coin est pose (la trace n'a que lui), l'apercu va jusqu'au reticule.
  const [coin1] = ui.trace;
  if (FORMES.has(ui.outil) && ui.trace.length === 1 && coin1 && ui.curseur) {
    const d = formeTracee(ui.outil as OutilForme, coin1[0], coin1[1], ui.curseur[0], ui.curseur[1], false, ui.parametres);
    r.push(<path key="apercu" className="trace-en-cours" d={ecrireChemin(d, 3)} pointerEvents="none" />);
  }
  if (ui.trace.length) {
    r.push(<polyline key="trace" className="trace-en-cours" points={ui.trace.map(q => q[0] + ',' + q[1]).join(' ')} pointerEvents="none" />);
    ui.trace.forEach((q, i) => r.push(<rect key={'t' + i} className={'ancre' + (i === 0 ? ' ancre-choisie' : '')} x={q[0] - 3.5 * px} y={q[1] - 3.5 * px} width={7 * px} height={7 * px} pointerEvents="none" />));
  }
  if (ui.curseur && (FORMES.has(ui.outil) || ui.outil === 'plume' || ui.outil === 'texte')) {
    // Le reticule du clavier : deux traits et un point, de taille fixe a l'ecran quel que soit le zoom.
    const [cx, cy] = ui.curseur, t = 12 * px;
    r.push(
      <g key="reticule" className="reticule" pointerEvents="none">
        <line x1={cx - t} y1={cy} x2={cx + t} y2={cy} />
        <line x1={cx} y1={cy - t} x2={cx} y2={cy + t} />
        <circle cx={cx} cy={cy} r={3 * px} />
      </g>
    );
  }
  if (cadre) r.push(<rect key="cadre" className="cadre-selection" x={cadre.x} y={cadre.y} width={cadre.l} height={cadre.h} pointerEvents="none" />);
  return r;
}
