import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lireDessin, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { couleurPdf } from '../../../src/export/pdf.js';
import { chainePdf, infoPdf, miseEnPage } from '../../../src/export/pdfPage.js';
import { ecrirePdf } from './plats.js';

const MM = 72 / 25.4;
const dessin = (svg: string): DessinSvg => { const r = lireDessin(svg); if ('erreur' in r) throw new Error(r.erreur); return r.dessin; };
const svg = (corps: string, vb = '0 0 100 50') => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '">' + corps + '</svg>';
const latin1 = (o: Uint8Array) => Buffer.from(o).toString('latin1');
const sha = (o: Uint8Array) => createHash('sha256').update(o).digest('hex');

// ---------------------------------------------------------------- un lecteur de PDF independant du writer

interface Pdf { objets: Map<number, string>; page: string; flux: string; boites: Record<string, number[]>; trailer: string }

function lire(o: Uint8Array): Pdf {
  const t = latin1(o);
  expect(t.startsWith('%PDF-1.4\n')).toBe(true);
  expect(t.endsWith('%%EOF\n')).toBe(true);
  // La table xref : chaque decalage pointe sur « N 0 obj », et startxref sur « xref ».
  const sx = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(t)?.[1]);
  expect(t.slice(sx, sx + 5)).toBe('xref\n');
  const taille = Number(/^xref\n0 (\d+)\n/.exec(t.slice(sx))?.[1]);
  const lignes = [...t.slice(sx).matchAll(/^(\d{10}) (\d{5}) ([nf]) \n/gm)];
  expect(lignes.length).toBe(taille);
  const objets = new Map<number, string>();
  lignes.slice(1).forEach((m, i) => {
    const pos = Number(m[1]);
    expect(t.slice(pos, pos + String(i + 1).length + 6)).toBe((i + 1) + ' 0 obj');
    objets.set(i + 1, t.slice(pos, t.indexOf('endobj', pos)));
  });
  const trailer = /trailer\n(<<.*>>)\nstartxref/.exec(t)?.[1] ?? '';
  expect(trailer).toContain('/Size ' + taille);
  const page = [...objets.values()].find(v => /\/Type \/Page /.test(v)) ?? '';
  const flux = /stream\n([\s\S]*)\nendstream/.exec(objets.get(4) ?? '')?.[1] ?? '';
  // /Length est exact.
  expect(Number(/\/Length (\d+)/.exec(objets.get(4) ?? '')?.[1])).toBe(flux.length);
  const boites: Record<string, number[]> = {};
  for (const m of page.matchAll(/\/(MediaBox|CropBox|BleedBox|TrimBox) \[([^\]]*)\]/g)) boites[m[1]!] = m[2]!.trim().split(/\s+/).map(Number);
  return { objets, page, flux, boites, trailer };
}

/** Un interpreteur de contenu PDF : matrice courante, pile q/Q, traces peints (points transformes dans la page). */
interface Trace { op: string; pts: [number, number][]; couleur: string; largeur: number }
function interpreter(flux: string): { traces: Trace[]; profondeur: number } {
  const jets = flux.split(/\s+/).filter(Boolean), pile: number[] = [], traces: Trace[] = [];
  type M = [number, number, number, number, number, number];
  let ctm: M = [1, 0, 0, 1, 0, 0], chemin: [number, number][] = [], couleur = '', largeur = 1, prof = 0;
  const ctms: { m: M; c: string; w: number }[] = [];
  const app = (x: number, y: number): [number, number] => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]];
  const mul = (a: M, b: M): M => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];
  const prendre = (n: number) => pile.splice(pile.length - n, n);
  const peindre = (op: string) => { traces.push({ op, pts: chemin, couleur, largeur }); chemin = []; };
  for (const j of jets) {
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(j)) { pile.push(Number(j)); continue; }
    if (j.startsWith('/')) { pile.length = 0; continue; }
    const p = pile.length;
    switch (j) {
      case 'q': ctms.push({ m: ctm, c: couleur, w: largeur }); prof++; break;
      case 'Q': { const s = ctms.pop(); if (!s) throw new Error('Q sans q'); ctm = s.m; couleur = s.c; largeur = s.w; prof--; break; }
      case 'cm': { const v = prendre(6) as M; ctm = mul(v, ctm); break; }
      case 'm': case 'l': { const [x, y] = prendre(2); chemin.push(app(x!, y!)); break; }
      case 'c': { const v = prendre(6); chemin.push(app(v[0]!, v[1]!), app(v[2]!, v[3]!), app(v[4]!, v[5]!)); break; }
      case 're': { const [x, y, w, h] = prendre(4); chemin.push(app(x!, y!), app(x! + w!, y! + h!)); break; }
      case 'h': break;
      case 'W': break;
      case 'n': chemin = []; break;
      case 'S': case 'f': case 'f*': case 'B': case 'B*': peindre(j); break;
      case 'w': largeur = (prendre(1)[0] ?? 1) * Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2])); break;
      case 'rg': case 'RG': case 'k': case 'K': case 'g': case 'G': couleur = prendre(p).join(' ') + ' ' + j; break;
      case 'gs': break;
      case 'J': case 'j': case 'M': prendre(1); break;
      case 'd': pile.length = 0; break;
      default: throw new Error('operateur PDF inconnu : ' + j);
    }
  }
  return { traces, profondeur: prof };
}

const bornes = (pts: [number, number][]) => ({ x0: Math.min(...pts.map(p => p[0])), y0: Math.min(...pts.map(p => p[1])), x1: Math.max(...pts.map(p => p[0])), y1: Math.max(...pts.map(p => p[1])) });

describe('ecrirePdf : les octets d\'avant ne bougent pas', () => {
  // Les empreintes ont ete calculees avec le writer d'avant les options (commit ed5ca1b).
  const OR: Record<string, string> = {
    'trait-pointilles': '745538f7c4bca914eb1e533d9c44de05bc81c025dc9eb3d845eafaae611c7822',
    peintures: '3e8aba79456105538c506c3e756fce159c66c117c65b9fb22b4e35b05a0a43d6',
    'evenodd-opacite': '5cc7b891de8fccec472fb39d6ffec900179f5bbcba716217776067ace81ba441',
    elements: '814bec9ee7b72a69fc8f520bcd25625d94665e91499c9a647f95e5f3ddc2b968',
    booleens: '551fbcfe5e7377a3f4caaa39717ba2b5f02353bf5bd723426e8fbd5446e24740',
    arcs: '22f47cd8f8615018b8a91b0af65feeb009ff218668a848d579df59fe4187f01e'
  };
  for (const [nom, empreinte] of Object.entries(OR)) {
    it('rend le meme PDF pour ' + nom + ', sans options ou avec des options neutres', () => {
      const d = dessin(readFileSync(resolve(__dirname, '../../fixtures/svg/' + nom + '.svg'), 'utf8'));
      expect(sha(ecrirePdf(d))).toBe(empreinte);
      expect(sha(ecrirePdf(d, {}))).toBe(empreinte);
      expect(sha(ecrirePdf(d, { cmjn: false, page: 'dessin', marge: 0, fondPerdu: 0, reperes: false, taille: null }))).toBe(empreinte);
    });
  }
});

describe('ecrirePdf : page, marge et taille', () => {
  const d = dessin(svg('<path d="M0 0h100v50h-100z" fill="#c81e28"/>'));

  it('ecrit un PDF bien forme (xref, longueur) a chaque combinaison', () => {
    for (const o of [{}, { cmjn: true }, { page: 'A4' as const }, { marge: 10 }, { fondPerdu: 3, reperes: true }, { taille: { largeur: 50, unite: 'mm' as const } }]) {
      const p = lire(ecrirePdf(d, o));
      expect(interpreter(p.flux).profondeur).toBe(0);
    }
  });

  it('ajoute une marge autour du dessin sur la page', () => {
    const p = lire(ecrirePdf(d, { marge: 10 }));
    expect(p.boites['MediaBox']).toEqual([0, 0, Number((100 + 20 * MM).toFixed(3)), Number((50 + 20 * MM).toFixed(3))]);
    expect(p.boites['TrimBox']).toBeUndefined();
    const b = bornes(interpreter(p.flux).traces[0]!.pts);
    expect(b.x0).toBeCloseTo(10 * MM, 2); expect(b.y0).toBeCloseTo(10 * MM, 2);
    expect(b.x1).toBeCloseTo(10 * MM + 100, 2);
  });

  it('met le dessin a la taille voulue : 50 mm de large font 141,732 pt, traits compris', () => {
    const e = dessin(svg('<path d="M0 0h100v50h-100z" fill="#c81e28" stroke="#000000" stroke-width="10"/>'));
    const p = lire(ecrirePdf(e, { taille: { largeur: 50, unite: 'mm' } }));
    expect(p.boites['MediaBox']![2]).toBeCloseTo(50 * MM, 2);
    expect(p.boites['MediaBox']![3]).toBeCloseTo(25 * MM, 2);
    const t = interpreter(p.flux).traces;
    expect(bornes(t[0]!.pts).x1).toBeCloseTo(50 * MM, 2);
    expect(t[0]!.largeur).toBeCloseTo(10 * 0.5 * MM, 3);
  });

  it('ajuste le dessin a une page A4, tournee comme lui, centre dans les marges', () => {
    const p = lire(ecrirePdf(d, { page: 'A4', marge: 10 }));
    const [, , w, h] = p.boites['MediaBox']!;
    expect(w).toBeCloseTo(297 * MM, 2); expect(h).toBeCloseTo(210 * MM, 2);
    const b = bornes(interpreter(p.flux).traces[0]!.pts);
    // Il touche les marges a gauche et a droite (rapport 2:1 plus large que la page utile) et reste centre.
    expect(b.x0).toBeCloseTo(10 * MM, 1); expect(b.x1).toBeCloseTo(w! - 10 * MM, 1);
    expect((b.y0 + b.y1) / 2).toBeCloseTo(h! / 2, 1);
    expect((b.x1 - b.x0) / (b.y1 - b.y0)).toBeCloseTo(2, 3);
  });

  it('sait les formats A3, Letter et personnalise, et se rabat sur le plan si la page est absurde', () => {
    expect(lire(ecrirePdf(d, { page: 'A3' })).boites['MediaBox']![2]).toBeCloseTo(420 * MM, 2);
    expect(lire(ecrirePdf(d, { page: 'Letter' })).boites['MediaBox']![2]).toBeCloseTo(279.4 * MM, 2);
    const perso = lire(ecrirePdf(d, { page: { largeur: 100, hauteur: 200 } })).boites['MediaBox']!;
    expect(perso[2]).toBeCloseTo(200 * MM, 2); expect(perso[3]).toBeCloseTo(100 * MM, 2);
    expect(lire(ecrirePdf(d, { page: { largeur: -5, hauteur: 0 } })).boites['MediaBox']).toEqual([0, 0, 100, 50]);
  });
});

describe('ecrirePdf : fond perdu et reperes de coupe', () => {
  const d = dessin(svg('<path d="M0 0h100v50h-100z" fill="#c81e28"/><path d="M-20 10h5" fill="none" stroke="#000" stroke-width="1"/>'));
  const o = { fondPerdu: 3, reperes: true };
  const p = lire(ecrirePdf(d, o));
  const [mx0, my0, mx1, my1] = p.boites['MediaBox']!, [tx0, ty0, tx1, ty1] = p.boites['TrimBox']!, [bx0, by0, bx1, by1] = p.boites['BleedBox']!;

  it('ecrit les quatre boites, emboitees : Trim dans Bleed dans Media = Crop', () => {
    expect(p.boites['CropBox']).toEqual(p.boites['MediaBox']);
    expect(mx0).toBe(0); expect(my0).toBe(0);
    expect(bx0).toBeCloseTo(tx0! - 3 * MM, 2); expect(by0).toBeCloseTo(ty0! - 3 * MM, 2);
    expect(bx1).toBeCloseTo(tx1! + 3 * MM, 2); expect(by1).toBeCloseTo(ty1! + 3 * MM, 2);
    expect(mx0! <= bx0! && my0! <= by0! && bx1! <= mx1! && by1! <= my1!).toBe(true);
    // La page finie est le plan : 100 x 50 pt.
    expect(tx1! - tx0!).toBeCloseTo(100, 2); expect(ty1! - ty0!).toBeCloseTo(50, 2);
    // Les reperes ont 6 mm de plus que le fond perdu de chaque cote.
    expect(tx0).toBeCloseTo(9 * MM, 2);
    expect(mx1! - tx1!).toBeCloseTo(9 * MM, 2);
  });

  it('place le dessin dans la page finie, et le coupe au fond perdu', () => {
    const t = interpreter(p.flux).traces;
    const b = bornes(t[0]!.pts);
    expect(b.x0).toBeCloseTo(tx0!, 2); expect(b.y1).toBeCloseTo(ty1!, 2);
    expect(p.flux).toMatch(/q\n[\d. ]+ re W n\nq/);
    const [cx, cy, cw, ch] = /([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re W n/.exec(p.flux)!.slice(1).map(Number);
    expect([cx, cy, cx! + cw!, cy! + ch!].map(v => Number(v!.toFixed(2)))).toEqual([bx0, by0, bx1, by1].map(v => Number(v!.toFixed(2))));
  });

  it('trace huit reperes, hors du fond perdu, dans la page, de 5 mm', () => {
    const marques = interpreter(p.flux).traces.filter(t => t.op === 'S' && t.couleur === '0 G');
    expect(marques.length).toBe(8);
    for (const m of marques) {
      expect(m.pts.length).toBe(2);
      const [[ax, ay], [bx, by]] = m.pts as [[number, number], [number, number]];
      expect(Math.hypot(bx - ax, by - ay)).toBeCloseTo(5 * MM, 2);
      for (const [x, y] of m.pts) {
        expect(x >= mx0! - 1e-6 && x <= mx1! + 1e-6 && y >= my0! - 1e-6 && y <= my1! + 1e-6).toBe(true);
        // Hors du BleedBox : au moins un cote est franchi, d'au moins 1 mm.
        const dehors = Math.max(bx0! - x, x - bx1!, by0! - y, y - by1!);
        expect(dehors).toBeGreaterThanOrEqual(1 * MM - 1e-3);
      }
      // Un repere est aligne sur un bord de la page finie : sa ligne passe par x = Trim ou y = Trim.
      const surBord = [tx0, tx1].some(v => Math.abs(ax - v!) < 1e-6 && Math.abs(bx - v!) < 1e-6) || [ty0, ty1].some(v => Math.abs(ay - v!) < 1e-6 && Math.abs(by - v!) < 1e-6);
      expect(surBord).toBe(true);
    }
  });

  it('coupe le trace qui deborde du plan : rien ne sort du fond perdu, pas de trait dans la zone des reperes', () => {
    // Le dessin ci-dessus a un trait en x = -20..-15 (hors plan) : il est hors du BleedBox, donc masque par le clip.
    expect(p.flux.indexOf('re W n')).toBeLessThan(p.flux.indexOf('-20'));
    expect(interpreter(p.flux).profondeur).toBe(0);
  });

  it('fond perdu seul : la page grandit du fond perdu, sans reperes', () => {
    const q = lire(ecrirePdf(d, { fondPerdu: 3 }));
    expect(q.boites['MediaBox']![2]).toBeCloseTo(100 + 6 * MM, 2);
    expect(q.boites['BleedBox']).toEqual(q.boites['MediaBox']);
    expect(interpreter(q.flux).traces.filter(t => t.couleur === '0 G').length).toBe(0);
  });

  it('les reperes en CMJN sont en repere « 1 1 1 1 K »', () => {
    const q = lire(ecrirePdf(d, { reperes: true, cmjn: true }));
    expect(interpreter(q.flux).traces.filter(t => t.couleur === '1 1 1 1 K').length).toBe(8);
  });
});

describe('ecrirePdf : CMJN', () => {
  it('ecrit k/K et jamais rg/RG, le noir pur en « 0 0 0 1 k », sans changer la geometrie', () => {
    const d = dessin(svg('<path d="M0 0h10v10z" fill="#000000"/><path d="M20 0h10v10z" fill="#ff0000" stroke="#00ff00" stroke-width="2"/><path d="M40 0h10v10z" fill="#ffffff" stroke="#000000"/>'));
    const rvb = lire(ecrirePdf(d)).flux, cmjn = lire(ecrirePdf(d, { cmjn: true })).flux;
    expect(cmjn).toContain('0 0 0 1 k');
    expect(cmjn).toContain('0 1 1 0 k');
    expect(cmjn).toContain('1 0 1 0 K');
    expect(cmjn).toContain('0 0 0 0 k');
    expect(cmjn).toContain('0 0 0 1 K');
    expect(cmjn).not.toMatch(/ r?g\b| RG\b/);
    // Mis a part les operateurs de couleur, le flux est le meme.
    const sansCouleur = (f: string) => f.split('\n').filter(l => !/ (rg|RG|k|K)$/.test(l)).join('\n');
    expect(sansCouleur(cmjn)).toBe(sansCouleur(rvb));
    expect(couleurPdf('#808080', false, true)).toBe('0 0 0 0.498 k');
    expect(couleurPdf('rien', true, true)).toBe('0 0 0 1 K');
  });
});

describe('ecrirePdf : metadonnees', () => {
  const d = dessin(svg('<path d="M0 0h10v10z" fill="#000000"/>'));
  it('ecrit le titre et le producteur dans le dictionnaire /Info, sans date', () => {
    const p = lire(ecrirePdf(d, { titre: 'Mon dessin', producteur: 'Atelier (test)' }));
    expect(p.objets.get(5)).toContain('<< /Title (Mon dessin) /Producer (Atelier \\(test\\)) >>');
    expect(p.trailer).toContain('/Info 5 0 R');
    expect(latin1(ecrirePdf(d, { titre: 'x' }))).not.toMatch(/CreationDate|ModDate/);
    expect(lire(ecrirePdf(d)).objets.get(5)).toContain('<< /Producer (svg) >>');
  });

  it('ecrit un titre accentue en UTF-16BE, que tout lecteur de PDF relit', () => {
    expect(chainePdf('Noël')).toBe('<FEFF004E006F00EB006C>');
    expect(chainePdf('a\\b(c)')).toBe('(a\\\\b\\(c\\))');
    expect(chainePdf('日本')).toBe('<FEFF65E5672C>');
    expect(infoPdf({ titre: 'Été' })).toBe('<< /Title <FEFF00C9007400E9> /Producer (svg) >>');
  });

  it('rend toujours les memes octets, options comprises', () => {
    const o = { cmjn: true, titre: 'T', page: 'A4' as const, marge: 5, fondPerdu: 3, reperes: true };
    expect(sha(ecrirePdf(d, o))).toBe(sha(ecrirePdf(d, o)));
  });
});

describe('miseEnPage', () => {
  it('rend null quand rien ne change la page', () => {
    expect(miseEnPage([0, 0, 100, 50], {})).toBeNull();
    expect(miseEnPage([0, 0, 100, 50], { marge: -3, fondPerdu: Number.NaN, taille: { largeur: -1, unite: 'mm' } })).toBeNull();
  });
});
