import { describe, it, expect } from 'vitest';
import { lireDessin, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { ecrireDxf, indexAci, nomCalque } from '../../../src/export/dxf.js';
import { polylignes } from '../../../src/export/aplatissement.js';
import { lireChemin } from '../../../src/engine/editionSvg.js';

const dessin = (svg: string): DessinSvg => { const r = lireDessin(svg); if ('erreur' in r) throw new Error(r.erreur); return r.dessin; };
const K = 25.4 / 96;

// ---------------------------------------------------------------- un lecteur DXF independant du writer

interface Groupe { code: number; valeur: string }
interface Polyline { calque: string; ferme: boolean; sommets: { x: number; y: number; calque: string }[]; seqend: boolean }
interface Lu {
  groupes: Groupe[];
  sections: string[];
  entete: Map<string, Groupe[]>;
  calques: { nom: string; couleur: number }[];
  declareCalques: number;
  types: string[];
  polylines: Polyline[];
  fin: string;
}

function lire(txt: string): Lu {
  const lignes = txt.split(/\r?\n/);
  expect(lignes[lignes.length - 1]).toBe('');
  lignes.pop();
  expect(lignes.length % 2).toBe(0);
  const groupes: Groupe[] = [];
  for (let i = 0; i < lignes.length; i += 2) {
    const code = lignes[i]!;
    expect(code).toMatch(/^ *\d+$/);
    groupes.push({ code: Number(code), valeur: lignes[i + 1]! });
  }
  const sections: string[] = [], entete = new Map<string, Groupe[]>(), calques: { nom: string; couleur: number }[] = [];
  const types: string[] = [], polylines: Polyline[] = [];
  let declareCalques = -1, i = 0;
  const lireJusqua = (fin: string, quand: (g: Groupe, idx: number) => void) => {
    for (; i < groupes.length; i++) {
      const g = groupes[i]!;
      if (g.code === 0 && g.valeur === fin) return;
      quand(g, i);
    }
    throw new Error('section jamais fermee : ' + fin);
  };
  while (i < groupes.length) {
    const g = groupes[i]!;
    if (g.code === 0 && g.valeur === 'EOF') break;
    expect(g).toEqual({ code: 0, valeur: 'SECTION' });
    const nom = groupes[++i]!;
    expect(nom.code).toBe(2);
    sections.push(nom.valeur);
    i++;
    if (nom.valeur === 'HEADER') {
      let courant = '';
      lireJusqua('ENDSEC', gr => { if (gr.code === 9) { courant = gr.valeur; entete.set(courant, []); } else entete.get(courant)!.push(gr); });
    } else if (nom.valeur === 'TABLES') {
      let table = '', attendNom = false, cal: { nom: string; couleur: number } | null = null;
      lireJusqua('ENDSEC', gr => {
        if (gr.code === 0) {
          attendNom = gr.valeur === 'TABLE';
          cal = gr.valeur === 'LAYER' ? { nom: '', couleur: 0 } : null;
          if (cal) calques.push(cal);
        } else if (gr.code === 2 && attendNom) { table = gr.valeur; attendNom = false; }
        else if (table === 'LAYER' && cal && gr.code === 2) cal.nom = gr.valeur;
        else if (table === 'LAYER' && cal && gr.code === 62) cal.couleur = Number(gr.valeur);
        else if (table === 'LAYER' && !cal && gr.code === 70) declareCalques = Number(gr.valeur);
      });
    } else if (nom.valeur === 'ENTITIES') {
      let p: Polyline | null = null, v: { x: number; y: number; calque: string } | null = null;
      lireJusqua('ENDSEC', gr => {
        if (gr.code === 0) {
          types.push(gr.valeur);
          if (gr.valeur === 'POLYLINE') { p = { calque: '', ferme: false, sommets: [], seqend: false }; polylines.push(p); v = null; }
          else if (gr.valeur === 'VERTEX') { v = { x: NaN, y: NaN, calque: '' }; p!.sommets.push(v); }
          else if (gr.valeur === 'SEQEND') { p!.seqend = true; v = null; }
          return;
        }
        if (v) { if (gr.code === 10) v.x = Number(gr.valeur); else if (gr.code === 20) v.y = Number(gr.valeur); else if (gr.code === 8) v.calque = gr.valeur; }
        else if (p && !p.seqend) { if (gr.code === 8) p.calque = gr.valeur; else if (gr.code === 70) p.ferme = (Number(gr.valeur) & 1) === 1; }
      });
    }
    expect(groupes[i]).toEqual({ code: 0, valeur: 'ENDSEC' });
    i++;
  }
  return { groupes, sections, entete, calques, declareCalques, types, polylines, fin: groupes[groupes.length - 1]!.valeur };
}

const point = (l: Lu, nom: string) => { const g = l.entete.get(nom)!; return { x: Number(g.find(x => x.code === 10)!.valeur), y: Number(g.find(x => x.code === 20)!.valeur) }; };
const bbox = (l: Lu) => {
  const s = l.polylines.flatMap(p => p.sommets);
  return { x0: Math.min(...s.map(p => p.x)), y0: Math.min(...s.map(p => p.y)), x1: Math.max(...s.map(p => p.x)), y1: Math.max(...s.map(p => p.y)) };
};

const RECT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><path d="M10 5h40v20h-40z" fill="#ff0000"/></svg>';

describe('ecrireDxf : structure', () => {
  it('ecrit les quatre sections dans l\'ordre, finit par EOF, et des groupes bien formes', () => {
    const l = lire(ecrireDxf(dessin(RECT)));
    expect(l.sections).toEqual(['HEADER', 'TABLES', 'ENTITIES']);
    expect(l.fin).toBe('EOF');
    expect(l.entete.get('$ACADVER')![0]).toEqual({ code: 1, valeur: 'AC1009' });
    expect(l.types.filter(t => t === 'POLYLINE').length).toBe(l.types.filter(t => t === 'SEQEND').length);
    // Chaque POLYLINE a ses VERTEX puis SEQEND : jamais d'entite hors de ce schema en R12.
    expect(new Set(l.types)).toEqual(new Set(['POLYLINE', 'VERTEX', 'SEQEND']));
    for (const p of l.polylines) expect(p.seqend).toBe(true);
  });

  it('declare le calque 0 et un calque par couleur, nommes COULEUR_RRGGBB, avec le nombre juste', () => {
    const l = lire(ecrireDxf(dessin('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h5v5z" fill="#ff0000"/><path d="M5 5h5v5z" fill="none" stroke="#0000ff"/><path d="M1 1h2v2z" fill="#ff0000"/></svg>')));
    expect(l.calques.map(c => c.nom)).toEqual(['0', 'COULEUR_0000FF', 'COULEUR_FF0000']);
    expect(l.declareCalques).toBe(3);
    expect(l.calques.map(c => c.couleur)).toEqual([7, 5, 1]);
    // Les entites referencent des calques declares.
    for (const p of l.polylines) { expect(l.calques.map(c => c.nom)).toContain(p.calque); for (const s of p.sommets) expect(s.calque).toBe(p.calque); }
    expect(l.polylines.map(p => p.calque)).toEqual(['COULEUR_FF0000', 'COULEUR_0000FF', 'COULEUR_FF0000']);
  });

  it('prefere la couleur du contour a celle du remplissage, et saute les formes masquees ou sans peinture', () => {
    const d = dessin('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h5v5z" fill="#ff0000" stroke="#00ff00"/><path d="M5 5h5v5z" fill="none" stroke="none"/></svg>');
    const l = lire(ecrireDxf({ ...d, formes: [...d.formes, { ...d.formes[0]!, id: 'x', visible: false }] }));
    expect(l.polylines.map(p => p.calque)).toEqual(['COULEUR_00FF00']);
  });

  it('un dessin vide est un fichier valide', () => {
    const l = lire(ecrireDxf({ vb: [0, 0, 10, 10], formes: [] }));
    expect(l.polylines).toEqual([]);
    expect(point(l, '$EXTMIN')).toEqual({ x: 0, y: 0 });
    expect(point(l, '$EXTMAX')).toEqual({ x: 0, y: 0 });
    expect(l.sections).toEqual(['HEADER', 'TABLES', 'ENTITIES']);
  });

  it('rend les memes octets deux fois', () => {
    expect(ecrireDxf(dessin(RECT))).toBe(ecrireDxf(dessin(RECT)));
  });
});

describe('ecrireDxf : geometrie', () => {
  it('retourne l\'axe Y, met le dessin dans [0, L] x [0, H] en millimetres a 96 au pouce, et ferme le rectangle', () => {
    const l = lire(ecrireDxf(dessin(RECT)));
    expect(l.polylines.length).toBe(1);
    const p = l.polylines[0]!;
    expect(p.ferme).toBe(true);
    // Un seul rectangle ferme : 4 sommets, aucun doublon du premier a la fin.
    expect(p.sommets.length).toBe(4);
    const b = bbox(l);
    expect(b.x0).toBeCloseTo(10 * K, 4); expect(b.x1).toBeCloseTo(50 * K, 4);
    // Le plan fait 50 de haut : y = 5..25 devient 45..25 apres le retournement.
    expect(b.y0).toBeCloseTo(25 * K, 4); expect(b.y1).toBeCloseTo(45 * K, 4);
    expect(point(l, '$EXTMIN').x).toBeCloseTo(b.x0, 4); expect(point(l, '$EXTMIN').y).toBeCloseTo(b.y0, 4);
    expect(point(l, '$EXTMAX').x).toBeCloseTo(b.x1, 4); expect(point(l, '$EXTMAX').y).toBeCloseTo(b.y1, 4);
    // Le sommet du haut a l'ecran (y = 5) est le plus haut du CAD.
    expect(Math.max(...p.sommets.map(s => s.y))).toBeCloseTo(45 * K, 4);
    expect(l.entete.get('$INSUNITS')![0]).toEqual({ code: 70, valeur: '4' });
  });

  it('respecte l\'unite : pouces a 1/96, et millimetres a une taille donnee', () => {
    const pouces = lire(ecrireDxf(dessin(RECT), { unite: 'in' }));
    expect(bbox(pouces).x1).toBeCloseTo(50 / 96, 4);
    expect(pouces.entete.get('$INSUNITS')![0]!.valeur).toBe('1');
    expect(pouces.entete.get('$MEASUREMENT')![0]!.valeur).toBe('0');
    // 100 de large dans le plan voulus a 200 mm : un facteur 2 mm par unite.
    const taille = lire(ecrireDxf(dessin(RECT), { unite: 'mm', taille: { largeur: 200, unite: 'mm' } }));
    expect(bbox(taille).x0).toBeCloseTo(20, 4); expect(bbox(taille).x1).toBeCloseTo(100, 4);
    expect(bbox(taille).y1 - bbox(taille).y0).toBeCloseTo(40, 4);
    const enPx = lire(ecrireDxf(dessin(RECT), { taille: { largeur: 96, unite: 'px' } }));
    expect(bbox(enPx).x1).toBeCloseTo(0.5 * 25.4, 4);
  });

  it('garde un trace ouvert ouvert, et ferme celui qui revient a son point de depart sans Z', () => {
    const l = lire(ecrireDxf(dessin('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M0 0L10 0L10 10" fill="none" stroke="#000000"/><path d="M0 0L10 0L10 10L0 0" fill="none" stroke="#000000"/><path d="M2 2h4v4h-4z M8 8h2v2h-2z" fill="#000000"/></svg>')));
    expect(l.polylines.map(p => [p.ferme, p.sommets.length])).toEqual([[false, 3], [true, 3], [true, 4], [true, 4]]);
  });

  it('aplatit un cercle a la tolerance : les sommets sont sur le cercle, l\'aire et la boite tiennent a la tolerance pres', () => {
    const tol = 0.01, r = 40, cx = 50, cy = 50;
    const d = dessin('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#123456"/></svg>');
    const l = lire(ecrireDxf(d, { tolerance: tol, taille: { largeur: 100, unite: 'mm' } }));
    const p = l.polylines[0]!;
    expect(p.ferme).toBe(true);
    // 1 unite = 1 mm ici : le cercle est r = 40 mm centre en (50, 50). Le dessin le lit en 4 cubiques, qui
    // s'ecartent elles-memes du cercle de 2,7e-4 r (soit 0,011 mm) : les sommets sont sur ces cubiques.
    for (const s of p.sommets) expect(Math.abs(Math.hypot(s.x - cx, s.y - cy) - r)).toBeLessThan(0.0003 * r);
    let aire = 0;
    p.sommets.forEach((s, i) => { const t = p.sommets[(i + 1) % p.sommets.length]!; aire += s.x * t.y - t.x * s.y; });
    expect(Math.abs(Math.abs(aire) / 2 - Math.PI * r * r)).toBeLessThan(2 * Math.PI * r * tol + 0.001 * r * r);
    const b = bbox(l);
    for (const v of [b.x0 - (cx - r), b.y0 - (cy - r), (cx + r) - b.x1, (cy + r) - b.y1]) { expect(v).toBeGreaterThanOrEqual(-1e-6); expect(v).toBeLessThan(tol + 1e-6); }
    // Plus la tolerance est fine, plus il y a de sommets.
    expect(lire(ecrireDxf(d, { tolerance: 0.001 })).polylines[0]!.sommets.length).toBeGreaterThan(lire(ecrireDxf(d, { tolerance: 0.1 })).polylines[0]!.sommets.length);
  });
});

describe('polylignes', () => {
  it('ne s\'ecarte d\'une cubique que de la tolerance', () => {
    const d = lireChemin('M0 0C0 100 100 100 100 0');
    const tol = 0.05, pl = polylignes(d, tol)[0]!;
    const vrai = (t: number): [number, number] => [3 * (1 - t) * t * t * 100 + t ** 3 * 100, 3 * (1 - t) ** 2 * t * 100 + 3 * (1 - t) * t * t * 100];
    // Distance de chaque point de la vraie courbe au polyline : sous la tolerance.
    const dist = (px: number, py: number) => {
      let m = Infinity;
      for (let i = 0; i + 1 < pl.points.length; i++) {
        const [ax, ay] = pl.points[i]!, [bx, by] = pl.points[i + 1]!, dx = bx - ax, dy = by - ay;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
        m = Math.min(m, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
      }
      return m;
    };
    for (let t = 0; t <= 1; t += 1 / 997) { const [x, y] = vrai(t); expect(dist(x, y)).toBeLessThanOrEqual(tol); }
    expect(pl.ferme).toBe(false);
    expect(pl.points[0]).toEqual([0, 0]);
    expect(pl.points[pl.points.length - 1]).toEqual([100, 0]);
  });

  it('traite les quadratiques, les sous-chemins apres Z et les M isoles', () => {
    expect(polylignes(lireChemin('M0 0Q5 10 10 0Z L5 5'), 0.1).map(p => [p.ferme, p.points.length > 2])).toEqual([[true, true], [false, false]]);
    expect(polylignes(lireChemin('M5 5M0 0L1 1'), 0.1).length).toBe(1);
  });
});

describe('palette ACI et noms de calque', () => {
  it('connait les index fixes et la palette generee', () => {
    expect(indexAci('#ff0000')).toBe(1);
    expect(indexAci('#ffff00')).toBe(2);
    expect(indexAci('#00ff00')).toBe(3);
    expect(indexAci('#00ffff')).toBe(4);
    expect(indexAci('#0000ff')).toBe(5);
    expect(indexAci('#ff00ff')).toBe(6);
    expect(indexAci('#000000')).toBe(7);
    expect(indexAci('#ffffff')).toBe(7);
    expect(indexAci('#a50000')).toBe(12);
    expect(indexAci('#ff3f00')).toBe(20);
    expect(indexAci('#333333')).toBe(250);
    expect(nomCalque('#00ff7a')).toBe('COULEUR_00FF7A');
  });
});
