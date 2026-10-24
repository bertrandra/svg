import { describe, it, expect } from 'vitest';
import { lireDessin, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { ecrireEps, texteDsc } from '../../../src/export/eps.js';

const dessin = (svg: string): DessinSvg => { const r = lireDessin(svg); if ('erreur' in r) throw new Error(r.erreur); return r.dessin; };
const PT = 72 / 96;
const svg = (corps: string, vb = '0 0 100 50') => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '">' + corps + '</svg>';

// ---------------------------------------------------------------- un mini interpreteur PostScript independant

type Valeur = number | string | Valeur[] | { proc: string[] };
interface Peinture { op: 'fill' | 'eofill' | 'stroke'; chemin: [number, number][]; couleur: string; largeur: number; bout: number; jonction: number; mitre: number; tirets: number[]; decalage: number }
interface Resultat { moveto: number; lineto: number; curveto: number; closepath: number; peintures: Peinture[]; points: [number, number][]; showpage: number; pile: number; gsave: number; grestore: number }

function jetons(texte: string): string[] {
  const sans = texte.split('\n').filter(l => !l.startsWith('%')).join('\n');
  return sans.match(/\/[^\s{}[\]/]+|[{}[\]]|[^\s{}[\]/]+/g) ?? [];
}

function executer(texte: string): Resultat {
  const t = jetons(texte), dico = new Map<string, string[]>(), pile: Valeur[] = [];
  const r: Resultat = { moveto: 0, lineto: 0, curveto: 0, closepath: 0, peintures: [], points: [], showpage: 0, pile: 0, gsave: 0, grestore: 0 };
  let etat = { chemin: [] as [number, number][], couleur: '0 0 0 rgb', largeur: 1, bout: 0, jonction: 0, mitre: 10, tirets: [] as number[], decalage: 0 };
  const sauvees: (typeof etat)[] = [];
  const depiler = (n: number): number[] => {
    if (pile.length < n) throw new Error('pile vide');
    const v = pile.splice(pile.length - n, n);
    for (const x of v) if (typeof x !== 'number') throw new Error('operande non numerique : ' + JSON.stringify(x));
    return v as number[];
  };
  const ajoute = (x: number, y: number) => { etat.chemin.push([x, y]); r.points.push([x, y]); };
  const peindre = (op: Peinture['op']) => { r.peintures.push({ op, ...etat, chemin: [...etat.chemin], tirets: [...etat.tirets] }); etat.chemin = []; };
  const natif: Record<string, () => void> = {
    newpath: () => { etat.chemin = []; },
    moveto: () => { const [x, y] = depiler(2); ajoute(x!, y!); r.moveto++; },
    lineto: () => { const [x, y] = depiler(2); if (!etat.chemin.length) throw new Error('lineto sans point courant'); ajoute(x!, y!); r.lineto++; },
    curveto: () => { const v = depiler(6); if (!etat.chemin.length) throw new Error('curveto sans point courant'); ajoute(v[0]!, v[1]!); ajoute(v[2]!, v[3]!); ajoute(v[4]!, v[5]!); r.curveto++; },
    closepath: () => { r.closepath++; },
    gsave: () => { sauvees.push({ ...etat, chemin: [...etat.chemin], tirets: [...etat.tirets] }); r.gsave++; },
    grestore: () => { const s = sauvees.pop(); if (!s) throw new Error('grestore sans gsave'); etat = s; r.grestore++; },
    fill: () => peindre('fill'), eofill: () => peindre('eofill'), stroke: () => peindre('stroke'),
    setrgbcolor: () => { etat.couleur = depiler(3).join(' ') + ' rgb'; },
    setcmykcolor: () => { etat.couleur = depiler(4).join(' ') + ' cmyk'; },
    setlinewidth: () => { etat.largeur = depiler(1)[0]!; },
    setlinecap: () => { etat.bout = depiler(1)[0]!; },
    setlinejoin: () => { etat.jonction = depiler(1)[0]!; },
    setmiterlimit: () => { etat.mitre = depiler(1)[0]!; },
    showpage: () => { r.showpage++; },
    bind: () => undefined
  };
  const lancer = (jts: string[]) => {
    for (let i = 0; i < jts.length; i++) {
      const j = jts[i]!;
      if (j === '{') {
        let prof = 1; const corps: string[] = [];
        for (i++; i < jts.length; i++) { if (jts[i] === '{') prof++; else if (jts[i] === '}') { if (--prof === 0) break; } corps.push(jts[i]!); }
        pile.push({ proc: corps });
      } else if (j === '[') pile.push('[');
      else if (j === ']') { const k = pile.lastIndexOf('['); if (k < 0) throw new Error('] sans ['); const a = pile.splice(k).slice(1); pile.push(a); }
      else if (j.startsWith('/')) pile.push(j);
      else if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(j)) pile.push(Number(j));
      else if (j === 'def') {
        const p = pile.pop(), nom = pile.pop();
        if (typeof nom !== 'string' || !p || typeof p !== 'object' || !('proc' in p)) throw new Error('def mal forme');
        dico.set(nom.slice(1), p.proc);
      } else if (j === 'setdash') {
        const decalage = depiler(1)[0]!, a = pile.pop();
        if (!Array.isArray(a) || a.some(v => typeof v !== 'number')) throw new Error('setdash sans tableau');
        etat.tirets = a as number[]; etat.decalage = decalage;
      } else if (dico.has(j)) lancer(dico.get(j)!);
      else if (natif[j]) natif[j]!();
      else throw new Error('operateur inconnu : ' + j);
    }
  };
  lancer(t);
  r.pile = pile.length;
  expect(sauvees.length).toBe(0);
  return r;
}

const bornes = (pts: [number, number][]) => ({ x0: Math.min(...pts.map(p => p[0])), y0: Math.min(...pts.map(p => p[1])), x1: Math.max(...pts.map(p => p[0])), y1: Math.max(...pts.map(p => p[1])) });
const entete = (eps: string, cle: string) => (new RegExp('^%%' + cle + ': (.*)$', 'm').exec(eps) ?? [])[1];

describe('ecrireEps : structure DSC', () => {
  const d = dessin(svg('<path d="M10 10h40v20h-40z" fill="#c81e28"/><path d="M60 5Q80 40 95 5" fill="none" stroke="#000000" stroke-width="4"/>'));
  const { eps } = ecrireEps(d, { titre: 'Mon dessin é' });

  it('commence par la ligne magique EPSF, finit par %%EOF, et ne contient que de l\'ASCII 7 bits', () => {
    expect(eps.startsWith('%!PS-Adobe-3.0 EPSF-3.0\n')).toBe(true);
    expect(eps.endsWith('%%EOF\n')).toBe(true);
    expect([...eps].every(c => c.charCodeAt(0) < 128)).toBe(true);
    expect(eps.split('\n').every(l => l.length <= 255)).toBe(true);
  });

  it('ordonne les en-tetes : BoundingBox avant EndComments, prologue puis page, showpage a la fin', () => {
    const i = (m: string) => eps.indexOf(m);
    expect(i('%%BoundingBox:')).toBeGreaterThan(0);
    expect(i('%%HiResBoundingBox:')).toBeGreaterThan(0);
    expect(i('%%EndComments')).toBeGreaterThan(i('%%BoundingBox:'));
    expect(i('%%EndComments')).toBeGreaterThan(i('%%HiResBoundingBox:'));
    expect(i('%%BeginProlog')).toBeGreaterThan(i('%%EndComments'));
    expect(i('%%EndProlog')).toBeGreaterThan(i('%%BeginProlog'));
    expect(i('%%Page: 1 1')).toBeGreaterThan(i('%%EndProlog'));
    expect(i('showpage')).toBeGreaterThan(i('%%Page: 1 1'));
    expect(entete(eps, 'LanguageLevel')).toBe('2');
    expect(entete(eps, 'Title')).toBe('Mon dessin e');
  });

  it('rend toujours les memes octets', () => {
    expect(ecrireEps(d).eps).toBe(ecrireEps(d).eps);
    expect(texteDsc('Été à Noël\n!')).toBe('Ete a Noel_!');
  });
});

describe('ecrireEps : trace', () => {
  it('ecrit un moveto/lineto/closepath par commande, les quadratiques en curveto, et un interpreteur le relit', () => {
    const d = dessin(svg('<path d="M10 10h40v20h-40z" fill="#c81e28"/><path d="M60 5Q80 40 95 5C95 0 90 0 85 0" fill="none" stroke="#000000" stroke-width="4"/>'));
    const r = executer(ecrireEps(d).eps);
    expect(r.moveto).toBe(2);
    expect(r.lineto).toBe(3);
    expect(r.curveto).toBe(2);
    expect(r.closepath).toBe(1);
    expect(r.showpage).toBe(1);
    expect(r.pile).toBe(0);
    expect(r.gsave).toBe(r.grestore);
    expect(r.peintures.map(p => p.op)).toEqual(['fill', 'stroke']);
  });

  it('calcule le cadre sur l\'encre, trait compris : le dessin s\'y inscrit exactement', () => {
    const d = dessin(svg('<path d="M10 10h40v20h-40z" fill="#c81e28" stroke="#000000" stroke-width="6"/>'));
    const res = ecrireEps(d);
    // Le rectangle 40 x 20 plus un demi-trait (3) de chaque cote : 46 x 26, a 0,75 pt par unite.
    expect(entete(res.eps, 'HiResBoundingBox')).toBe('0 0 ' + (46 * PT) + ' ' + (26 * PT));
    expect(entete(res.eps, 'BoundingBox')).toBe('0 0 35 20');
    expect(res.cadre).toEqual([0, 0, 34.5, 19.5]);
    const pts = executer(res.eps).points, b = bornes(pts);
    // Le chemin occupe le cadre moins la demi-epaisseur de chaque cote, et il est en haut a droite de l'origine.
    expect(b.x0).toBeCloseTo(3 * PT, 3); expect(b.y0).toBeCloseTo(3 * PT, 3);
    expect(b.x1).toBeCloseTo((46 - 3) * PT, 3); expect(b.y1).toBeCloseTo((26 - 3) * PT, 3);
  });

  it('cadre un trait a pointes : une jonction en pointe depasse du chemin plus que la demi-epaisseur', () => {
    const d = dessin(svg('<path d="M10 40L50 40L30 10" fill="none" stroke="#000000" stroke-width="8" stroke-linejoin="miter" stroke-miterlimit="10"/>'));
    const h = (entete(ecrireEps(d).eps, 'HiResBoundingBox') ?? '').split(' ').map(Number);
    // Sans la pointe, la boite serait (40 + 8) x (30 + 8). La pointe du sommet (50, 40), d'angle aigu, sort
    // a x = 50 + 4 / sin(theta/2) * cos(...) = 57,5 : la largeur passe de 48 a 51,5.
    expect(h[2]).toBeGreaterThan(51 * PT);
    expect(h[2]).toBeLessThan(52 * PT);
    expect(h[3]).toBeGreaterThanOrEqual(38 * PT - 0.002);
  });

  it('inscrit les courbes dans le cadre : tous les points echantillonnes de la vraie courbe y sont', () => {
    const d = dessin(svg('<path d="M10 40C10 -20 90 -20 90 40" fill="#3366cc" stroke="#000000" stroke-width="2"/>', '0 0 100 50'));
    const res = ecrireEps(d), [, , w, h] = res.cadre;
    // La vraie courbe, refaite ici de zero : y de Bezier cubique entre 40, -20, -20, 40 (le plan est retourne).
    const ymin = Math.min(...Array.from({ length: 1001 }, (_, i) => { const t = i / 1000; return (1 - t) ** 3 * 40 + 3 * (1 - t) ** 2 * t * -20 + 3 * (1 - t) * t * t * -20 + t ** 3 * 40; }));
    // Le haut de l'encre est le sommet de la courbe moins la demi-epaisseur ; le bas, y = 40 plus la demi-epaisseur.
    expect(h).toBeGreaterThanOrEqual((40 + 1 - (ymin - 1)) * PT - 0.002);
    expect(h).toBeLessThan((40 + 1 - (ymin - 1)) * PT + 0.01);
    expect(w).toBeGreaterThanOrEqual(82 * PT - 0.002);
  });

  it('ecrit le style de trait : epaisseur, bout, jonction, limite de pointe et pointilles, mis a l\'echelle', () => {
    const d = dessin(svg('<path d="M10 10L60 10L60 40" fill="none" stroke="#102030" stroke-width="4" stroke-linecap="square" stroke-linejoin="miter" stroke-miterlimit="6" stroke-dasharray="8 4" stroke-dashoffset="2"/><path d="M0 45h50" fill="none" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="bevel"/><path d="M0 0h5" fill="none" stroke="#000000" stroke-width="1"/>'));
    const [a, b, c] = executer(ecrireEps(d).eps).peintures;
    expect(a).toMatchObject({ op: 'stroke', largeur: 4 * PT, bout: 2, jonction: 0, mitre: 6, decalage: 2 * PT });
    expect(a!.tirets.map(v => Number(v.toFixed(3)))).toEqual([6, 3]);
    expect(a!.couleur).toBe([16 / 255, 32 / 255, 48 / 255].map(v => Number(v.toFixed(3))).join(' ') + ' rgb');
    expect(b).toMatchObject({ bout: 1, jonction: 2 });
    expect(b!.tirets).toEqual([]);
    // Le defaut du modele : bout plat, jonction ronde.
    expect(c).toMatchObject({ bout: 0, jonction: 1 });
  });

  it('remplit en pair-impair (eofill) ou selon le sens (fill), et remplit avant de contourner', () => {
    const d = dessin(svg('<path d="M0 0h50v50h-50zM10 10h30v30h-30z" fill="#ff0000" fill-rule="evenodd"/><path d="M0 0h20v20h-20z" fill="#00ff00" stroke="#0000ff" stroke-width="2"/>'));
    const p = executer(ecrireEps(d).eps).peintures;
    expect(p.map(x => x.op)).toEqual(['eofill', 'fill', 'stroke']);
    expect(p[1]!.couleur).toBe('0 1 0 rgb');
    expect(p[2]!.couleur).toBe('0 0 1 rgb');
    // Le contour reprend le meme chemin que le remplissage.
    expect(p[2]!.chemin).toEqual(p[1]!.chemin);
  });

  it('n\'ecrit ni les formes masquees, ni un trait d\'epaisseur nulle, ni une forme sans peinture', () => {
    const base = dessin(svg('<path d="M0 0h10v10z" fill="#000000"/><path d="M0 0h10v10z" fill="none" stroke="#000000" stroke-width="0"/><path d="M5 5h10v10z" fill="none" stroke="none"/>'));
    const r = executer(ecrireEps({ ...base, formes: [...base.formes, { ...base.formes[0]!, id: 'm', visible: false }] }).eps);
    expect(r.peintures.length).toBe(1);
  });
});

describe('ecrireEps : couleur et opacite', () => {
  const rouge = dessin(svg('<path d="M0 0h10v10h-10z" fill="#ff0000" opacity="0.5"/><path d="M20 0h10v10h-10z" fill="#000000"/>'));

  it('aplatit l\'opacite sur du blanc par defaut, et le dit', () => {
    const res = ecrireEps(rouge);
    expect(executer(res.eps).peintures.map(p => p.couleur)).toEqual(['1 0.5 0.5 rgb', '0 0 0 rgb']);
    expect(res.avertissements.length).toBe(1);
    expect(res.avertissements[0]).toMatch(/1 forme translucide.*aplatie sur du blanc/);
  });

  it('peut ignorer l\'opacite, avec un avertissement qui le dit', () => {
    const res = ecrireEps(rouge, { opacite: 'ignorer' });
    expect(executer(res.eps).peintures[0]!.couleur).toBe('1 0 0 rgb');
    expect(res.avertissements[0]).toMatch(/ignorée/);
  });

  it('n\'avertit de rien quand tout est opaque', () => {
    expect(ecrireEps(dessin(svg('<path d="M0 0h10v10z" fill="#123456"/>'))).avertissements).toEqual([]);
  });

  it('ecrit du CMJN naif : le noir pur reste « 0 0 0 1 », le blanc « 0 0 0 0 », et l\'avertit', () => {
    const d = dessin(svg('<path d="M0 0h10v10z" fill="#000000"/><path d="M20 0h10v10z" fill="#ffffff"/><path d="M40 0h10v10z" fill="#ff0000"/><path d="M60 0h10v10z" fill="#808080"/>'));
    const res = ecrireEps(d, { cmjn: true });
    expect(executer(res.eps).peintures.map(p => p.couleur)).toEqual(['0 0 0 1 cmyk', '0 0 0 0 cmyk', '0 1 1 0 cmyk', '0 0 0 0.498 cmyk']);
    expect(res.avertissements.join(' ')).toMatch(/CMJN naïf/);
    expect(res.eps.split('%%Page')[1]).not.toMatch(/ rgb/);
  });
});

describe('ecrireEps : taille', () => {
  it('met a l\'echelle les coordonnees, l\'epaisseur et le cadre sur la largeur voulue', () => {
    const d = dessin(svg('<path d="M0 0h100v50h-100z" fill="#000000" stroke="#ff0000" stroke-width="10"/>'));
    // Le plan fait 100 de large + 10 de trait = 110 ; on veut 220 pt de large pour le plan (100) : 2,2 pt/unite.
    const res = ecrireEps(d, { taille: { largeur: (100 * 2.2) / 72, unite: 'in' } });
    const k = 2.2;
    expect(res.cadre[2]).toBeCloseTo(110 * k, 2);
    expect(res.cadre[3]).toBeCloseTo(60 * k, 2);
    expect(executer(res.eps).peintures[1]!.largeur).toBeCloseTo(10 * k, 3);
  });

  it('un dessin sans encre prend le cadre du plan', () => {
    const res = ecrireEps({ vb: [0, 0, 100, 50], formes: [] });
    expect(res.cadre).toEqual([0, 0, 75, 37.5]);
    expect(entete(res.eps, 'BoundingBox')).toBe('0 0 75 38');
  });
});
