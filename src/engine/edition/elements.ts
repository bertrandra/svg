// Les elements de forme d'un SVG (path, rect, circle, ellipse, line, polyline, polygon) ramenes a un chemin
// absolu. Un nom qui n'en est pas un rend undefined. Pur.

import type { Noeud } from '../../util/xml.js';
import type { Commande } from './types.js';
import { lireChemin } from './chemins.js';

const nombreAttr = (n: Noeud, a: string, defaut = 0) => { const v = Number.parseFloat(n.attributs[a] ?? ''); return Number.isFinite(v) ? v : defaut; };

/** Le chemin d'un element de forme, ou undefined si ce n'en est pas un. */
export function cheminDeForme(n: Noeud): Commande[] | undefined {
  switch (n.nom) {
    case 'path': return lireChemin(n.attributs.d ?? '');
    case 'rect': {
      const x = nombreAttr(n, 'x'), y = nombreAttr(n, 'y'), l = nombreAttr(n, 'width'), h = nombreAttr(n, 'height');
      if (!(l > 0 && h > 0)) return [];
      let rx = nombreAttr(n, 'rx', NaN), ry = nombreAttr(n, 'ry', NaN);
      if (Number.isNaN(rx)) rx = Number.isNaN(ry) ? 0 : ry;
      if (Number.isNaN(ry)) ry = rx;
      rx = Math.min(rx, l / 2); ry = Math.min(ry, h / 2);
      if (!(rx > 0 && ry > 0)) return lireChemin(`M${x} ${y}H${x + l}V${y + h}H${x}Z`);
      return lireChemin(`M${x + rx} ${y}H${x + l - rx}A${rx} ${ry} 0 0 1 ${x + l} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + l - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`);
    }
    case 'circle':
    case 'ellipse': {
      const cx = nombreAttr(n, 'cx'), cy = nombreAttr(n, 'cy');
      const rx = n.nom === 'circle' ? nombreAttr(n, 'r') : nombreAttr(n, 'rx'), ry = n.nom === 'circle' ? rx : nombreAttr(n, 'ry');
      if (!(rx > 0 && ry > 0)) return [];
      return lireChemin(`M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`);
    }
    case 'line': return lireChemin(`M${nombreAttr(n, 'x1')} ${nombreAttr(n, 'y1')}L${nombreAttr(n, 'x2')} ${nombreAttr(n, 'y2')}`);
    case 'polyline':
    case 'polygon': {
      const p = (n.attributs.points ?? '').trim();
      return p ? lireChemin('M' + p + (n.nom === 'polygon' ? 'Z' : '')) : [];
    }
    default: return undefined;
  }
}
