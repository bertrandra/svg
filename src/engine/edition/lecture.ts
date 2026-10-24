// La lecture d'un SVG en dessin a plat : peintures, feuille <style>, heritage, transformations des
// groupes, formes de base ramenees a des chemins. Ce qui ne se ramene pas a des chemins pleins est
// refuse avec son nom : on n'edite pas un dessin qu'on ne saurait pas reecrire.

import { lireXml, type Noeud } from '../../util/xml.js';
import type { Commande, DessinSvg, Forme, Matrice } from './types.js';
import { IDENTITE } from './types.js';
import { lireChemin } from './chemins.js';
import { facteur, lireTransformation, multiplier, transformerChemin } from './geometrie.js';

const NOMMEES: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00',
  gray: '#808080', grey: '#808080', orange: '#ffa500', purple: '#800080', navy: '#000080', silver: '#c0c0c0'
};

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/** Une peinture en #rrggbb, null pour « none », ou la valeur telle quelle si elle est inconnue. */
export function lirePeinture(v: string): string | null {
  const t = v.trim().toLowerCase();
  if (t === 'none' || t === 'transparent') return null;
  if (t === 'currentcolor') return '#000000';
  let m = /^#([0-9a-f]{3,4})$/.exec(t);
  if (m) return '#' + (m[1] ?? '').slice(0, 3).split('').map(c => c + c).join('');
  m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(t);
  if (m) return '#' + (m[1] ?? '');
  m = /^rgba?\(\s*([\d.]+)(%?)[\s,]+([\d.]+)(%?)[\s,]+([\d.]+)(%?)/.exec(t);
  if (m) {
    const canal = (n: string | undefined, pc: string | undefined) => (pc ? (Number(n) * 255) / 100 : Number(n));
    return '#' + hex2(canal(m[1], m[2])) + hex2(canal(m[3], m[4])) + hex2(canal(m[5], m[6]));
  }
  return NOMMEES[t] ?? t;
}

type Proprietes = Record<string, string>;

function lireDeclarations(t: string): Proprietes {
  const r: Proprietes = {};
  for (const decl of t.split(';')) {
    const k = decl.indexOf(':');
    if (k > 0) r[decl.slice(0, k).trim().toLowerCase()] = decl.slice(k + 1).replace(/!important/i, '').trim();
  }
  return r;
}

/** Les regles de classe d'une feuille <style> : `.a, .b { fill: … }`. Les autres selecteurs sont ignores. */
function lireFeuille(t: string): Map<string, Proprietes> {
  const classes = new Map<string, Proprietes>();
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t.replace(/\/\*[\s\S]*?\*\//g, '')))) {
    const decl = lireDeclarations(m[2] ?? '');
    for (const sel of (m[1] ?? '').split(',').map(s => s.trim())) {
      const c = /^\.([\w-]+)$/.exec(sel);
      if (c?.[1]) classes.set(c[1], { ...(classes.get(c[1]) ?? {}), ...decl });
    }
  }
  return classes;
}

const PROPRIETES = ['fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'fill-rule', 'display', 'visibility', 'clip-path', 'mask', 'filter'];
const HERITEES = ['fill', 'stroke', 'stroke-width', 'fill-rule', 'visibility', 'fill-opacity'];
const IGNORES = new Set(['defs', 'title', 'desc', 'metadata', 'style', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'pattern', 'symbol', 'marker', 'filter']);
const NON_PRIS: Record<string, string> = {
  text: 'du texte (vectorisez-le dans votre logiciel)', image: 'une image', use: 'un clone <use>', foreignObject: 'un objet étranger', svg: 'un SVG imbriqué', switch: 'un aiguillage <switch>'
};

interface Contexte { m: Matrice; heritees: Proprietes; opacite: number }

/** Le dessin d'un SVG, ou ce qui empeche de l'editer. */
export function lireDessin(svg: string): { dessin: DessinSvg } | { erreur: string } {
  const doc = lireXml(svg);
  const racine = doc?.enfants.find(e => e.nom === 'svg');
  if (!racine) return { erreur: 'Ce SVG ne se lit pas.' };
  const vb = (racine.attributs.viewBox ?? '').split(/[\s,]+/).filter(Boolean).map(Number);
  const l = Number.parseFloat(racine.attributs.width ?? ''), h = Number.parseFloat(racine.attributs.height ?? '');
  const plan: [number, number, number, number] | null = vb.length === 4 && vb.every(Number.isFinite) && (vb[2] ?? 0) > 0 && (vb[3] ?? 0) > 0
    ? [vb[0] ?? 0, vb[1] ?? 0, vb[2] ?? 0, vb[3] ?? 0] : l > 0 && h > 0 ? [0, 0, l, h] : null;
  if (!plan) return { erreur: 'Ce SVG n’a ni viewBox ni dimensions.' };
  let feuille = '';
  const ramasser = (n: Noeud) => { if (n.nom === 'style') feuille += n.texte + '\n'; n.enfants.forEach(ramasser); };
  ramasser(racine);
  const classes = lireFeuille(feuille);
  const formes: Forme[] = [];
  const refus = new Set<string>();
  const proprietes = (n: Noeud): Proprietes => {
    const r: Proprietes = {};
    for (const p of PROPRIETES) { const v = n.attributs[p]; if (v !== undefined) r[p] = v; }
    for (const c of (n.attributs.class ?? '').split(/\s+/).filter(Boolean)) Object.assign(r, classes.get(c) ?? {});
    Object.assign(r, lireDeclarations(n.attributs.style ?? ''));
    return r;
  };
  const visiter = (n: Noeud, ctx: Contexte) => {
    if (IGNORES.has(n.nom)) return;
    const pr = proprietes(n);
    if ((pr.display ?? '').trim() === 'none') return;
    const nonPris = NON_PRIS[n.nom];
    if (nonPris) { refus.add(nonPris); return; }
    if ((pr['clip-path'] && pr['clip-path'] !== 'none') || (pr.mask && pr.mask !== 'none')) { refus.add('un masque ou une découpe'); return; }
    if (pr.filter && pr.filter !== 'none') { refus.add('un filtre'); return; }
    const t = n.attributs.transform ? lireTransformation(n.attributs.transform) : IDENTITE;
    if (!t) { refus.add('une transformation illisible'); return; }
    const heritees: Proprietes = { ...ctx.heritees };
    for (const p of HERITEES) if (pr[p] !== undefined && pr[p] !== 'inherit') heritees[p] = pr[p] ?? '';
    const opacite = ctx.opacite * (pr.opacity !== undefined ? Math.max(0, Math.min(1, Number(pr.opacity) || 0)) : 1);
    const m = multiplier(ctx.m, t);
    if (n.nom === 'g' || n.nom === 'a') { n.enfants.forEach(e => visiter(e, { m, heritees, opacite })); return; }
    const d = cheminDeForme(n);
    if (d === undefined) return;
    if ((heritees.visibility ?? '').trim() === 'hidden') return;
    const peinture = (p: string | undefined, defaut: string | null) => (p === undefined ? defaut : lirePeinture(p));
    // Une ligne n'a pas d'aire : seul son contour se voit.
    const remplissage = n.nom === 'line' ? null : peinture(heritees.fill, '#000000');
    const contour = peinture(heritees.stroke, null);
    if ((remplissage && remplissage.startsWith('url(')) || (contour && contour.startsWith('url('))) { refus.add('un dégradé ou un motif'); return; }
    const fo = heritees['fill-opacity'] !== undefined ? Math.max(0, Math.min(1, Number(heritees['fill-opacity']) || 0)) : 1;
    formes.push({
      id: 'f' + (formes.length + 1),
      d: transformerChemin(d, m),
      remplissage,
      contour,
      epaisseur: contour ? (Number.parseFloat(heritees['stroke-width'] ?? '1') || 1) * facteur(m) : 0,
      opacite: Math.round(opacite * fo * 1000) / 1000,
      regle: (heritees['fill-rule'] ?? '').trim() === 'evenodd' ? 'evenodd' : 'nonzero',
      visible: true,
      verrouille: false
    });
  };
  racine.enfants.forEach(e => visiter(e, { m: IDENTITE, heritees: {}, opacite: 1 }));
  if (refus.size) return { erreur: 'Ce SVG contient ' + [...refus].join(', ') + ' : il ne s’édite pas ici. Vectorisez l’image, ou simplifiez-le dans votre logiciel.' };
  if (!formes.length) return { erreur: 'Ce SVG ne contient aucune forme à éditer.' };
  return { dessin: { vb: plan, formes: formes.filter(f => f.d.length > 0) } };
}

const nombreAttr = (n: Noeud, a: string, defaut = 0) => { const v = Number.parseFloat(n.attributs[a] ?? ''); return Number.isFinite(v) ? v : defaut; };

/** Le chemin d'un element de forme, ou undefined si ce n'en est pas un. */
function cheminDeForme(n: Noeud): Commande[] | undefined {
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
