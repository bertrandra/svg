import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ecrireChemin, ecrireDessin, lireChemin, lireDessin, sousChemins, type Chemin, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { cheminCompact, svgExporte, tailleRacine } from '../../../src/export/svgs.js';
import { svgDecoupe } from './plats.js';

const DOSSIER = resolve(__dirname, '../../fixtures/svg');
const dessin = (svg: string): DessinSvg => { const r = lireDessin(svg); if ('erreur' in r) throw new Error(r.erreur); return r.dessin; };
const svg = (corps: string, vb = '0 0 200 100') => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '">' + corps + '</svg>';
const racine = (s: string) => /^<svg[^>]*>/.exec(s)?.[0] ?? '';

describe('svgExporte : les octets d\'avant ne bougent pas', () => {
  const fixtures = readdirSync(DOSSIER).filter(f => f.endsWith('.svg') && !f.includes('.attendu.')).map(f => ({ f, r: lireDessin(readFileSync(resolve(DOSSIER, f), 'utf8')) })).filter(x => !('erreur' in x.r));

  it('sans options, ecrit exactement ecrireDessin a 3 decimales, sur toutes les fixtures lisibles', () => {
    expect(fixtures.length).toBeGreaterThan(20);
    for (const { f, r } of fixtures) {
      const d = (r as { dessin: DessinSvg }).dessin;
      expect(svgExporte(d), f).toBe(ecrireDessin(d, 3));
      expect(svgExporte(d, {}), f).toBe(ecrireDessin(d, 3));
      expect(svgExporte(d, { precision: 3, taille: null, optimise: false }), f).toBe(ecrireDessin(d, 3));
    }
  });

  it('ne change pas le SVG de decoupe d\'avant sans taille', () => {
    const d = dessin(svg('<path d="M0 0h5v5h-5z" fill="#c81e28"/>', '0 0 20 10'));
    expect(svgDecoupe(d)).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10" width="20mm" height="10mm"><path d="M0 0L5 0L5 5L0 5Z" fill="none" stroke="#ff0000" stroke-width="0.25" stroke-linejoin="round"/></svg>');
    expect(svgDecoupe(d, '#ff0000', 0.25, 3, null)).toBe(svgDecoupe(d));
  });
});

describe('svgExporte : precision', () => {
  const d = dessin(svg('<path d="M1.23456 2.34567L10.98765 3.45678" fill="none" stroke="#000"/>'));
  it('ecrit de 1 a 4 decimales, 3 par defaut, et borne les valeurs absurdes', () => {
    const chemin = (p?: number) => /<path d="([^"]*)"/.exec(svgExporte(d, p === undefined ? {} : { precision: p }))![1];
    expect(chemin(1)).toBe('M1.2 2.3L11 3.5');
    expect(chemin(2)).toBe('M1.23 2.35L10.99 3.46');
    expect(chemin()).toBe('M1.235 2.346L10.988 3.457');
    expect(chemin(4)).toBe('M1.2346 2.3457L10.9877 3.4568');
    expect(chemin(0)).toBe(chemin(1));
    expect(chemin(9)).toBe(chemin(4));
  });
});

describe('svgExporte : taille physique', () => {
  const d = dessin(svg('<path d="M0 0h200v100h-200z" fill="#c81e28"/>'));
  it('ecrit width et height dans l\'unite voulue et garde le viewBox : le dessin se met a l\'echelle', () => {
    expect(racine(svgExporte(d, { taille: { largeur: 100, unite: 'mm' } }))).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="100mm" height="50mm">');
    expect(racine(svgExporte(d, { taille: { largeur: 4, unite: 'in' } }))).toContain('width="4in" height="2in"');
    expect(racine(svgExporte(d, { taille: { largeur: 300, unite: 'px' } }))).toContain('width="300px" height="150px"');
    // Seule la balise racine change.
    const a = svgExporte(d, { taille: { largeur: 100, unite: 'mm' } }), b = svgExporte(d);
    expect(a.slice(racine(a).length)).toBe(b.slice(racine(b).length));
  });

  it('une taille invalide est ignoree, et ne touche que la balise racine d\'un SVG qui porte une attribution', () => {
    expect(svgExporte(d, { taille: { largeur: -3, unite: 'mm' } })).toBe(ecrireDessin(d, 3));
    expect(svgExporte(d, { taille: { largeur: Number.NaN, unite: 'mm' } })).toBe(ecrireDessin(d, 3));
    // Ce que l'ecriture ajoute apres la balise racine (une attribution de licence) traverse intact, meme avec des attributs lookalike.
    const avec = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="200" height="100"><metadata><rdf:RDF xmlns:rdf="x"><cc:license width="1" height="2"/></rdf:RDF></metadata><path d="M0 0"/></svg>';
    const sortie = tailleRacine(avec, { largeur: 50, unite: 'mm' }, [0, 0, 200, 100]);
    expect(racine(sortie)).toContain('width="50mm" height="25mm"');
    expect(sortie.slice(racine(sortie).length)).toBe(avec.slice(racine(avec).length));
    expect(sortie).toContain('<cc:license width="1" height="2"/>');
  });

  it('met aussi a la taille un SVG de decoupe', () => {
    expect(svgDecoupe(d, '#ff0000', 0.25, 3, { largeur: 10.5, unite: 'in' })).toContain('width="10.5in" height="5.25in"');
    expect(svgDecoupe(d, '#ff0000', 0.25, 3, { largeur: 100, unite: 'mm' })).toContain('viewBox="0 0 200 100" width="100mm" height="50mm"');
  });
});

describe('svgExporte : optimise', () => {
  const sousChemin = (c: Chemin) => ecrireChemin(c, 4);
  const empreinte = (d: DessinSvg) => d.formes.flatMap(f => sousChemins(f.d).map(s => [f.remplissage, f.contour, f.epaisseur, f.opacite, f.regle, sousChemin(s)].join('|')));

  it('regroupe les formes voisines de meme style sans changer ce qui est peint, et pese moins', () => {
    const corps = Array.from({ length: 30 }, (_, i) => '<path d="M' + (i * 6) + ' 0h4v4h-4z" fill="#336699"/>').join('') + '<path d="M0 50h10v10z" fill="#ff0000"/>';
    const d = dessin(svg(corps));
    const plein = svgExporte(d), optimise = svgExporte(d, { optimise: true });
    expect(optimise.length).toBeLessThan(plein.length * 0.5);
    expect((optimise.match(/<path/g) ?? []).length).toBe(2);
    expect(empreinte(dessin(optimise))).toEqual(empreinte(d));
    expect(racine(optimise)).toBe(racine(plein));
  });

  it('relit les memes points que l\'ecriture absolue, a chaque precision', () => {
    // Un chemin tordu, deterministe : droites, courbes, deux sous-chemins, une fermeture.
    const cmds: string[] = ['M3.14159 2.71828'];
    let s = 12345;
    const alea = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s / 0x7fffffff) * 200 - 50; };
    for (let i = 0; i < 400; i++) cmds.push(['L', 'C', 'Q', 'H', 'V'][i % 5]! + [alea(), alea(), alea(), alea(), alea(), alea()].slice(0, [2, 6, 4, 1, 1][i % 5]).map(v => v.toFixed(5)).join(' '));
    cmds.push('Z', 'M7 7', 'L7 7', 'L8.5 7', 'L8.5 9', 'Z');
    const d = lireChemin(cmds.join(' '));
    for (const p of [1, 2, 3, 4]) {
      const compact = cheminCompact(d, p), attendu = lireChemin(ecrireChemin(d, p));
      const relu = lireChemin(compact);
      expect(relu.map(c => c.c)).toEqual(attendu.map(c => c.c));
      relu.forEach((c, i) => c.p.forEach((v, k) => expect(Math.abs(v - attendu[i]!.p[k]!), 'precision ' + p + ' commande ' + i).toBeLessThan(10 ** -p / 100)));
      expect(compact.length).toBeLessThan(ecrireChemin(d, p).length);
      expect(compact).not.toMatch(/--|\.\d*\.\d*\.|\s{2}|[a-z]\s|\s[a-z]/i);
    }
  });

  it('ecrit h et v pour les droites, omet la lettre qui se repete et colle les negatifs', () => {
    expect(cheminCompact(lireChemin('M10 10L20 10L20 25L18 24L16 22.5Z'), 3)).toBe('M10 10h10v15l-2-1-2-1.5z');
    expect(cheminCompact(lireChemin('M0.5 0.5L0.25 0.5'), 3)).toBe('M.5.5h-.25');
    expect(cheminCompact(lireChemin('M0 0Z M5 5L6 6'), 3)).toBe('M0 0zm5 5l1 1');
    expect(cheminCompact([], 3)).toBe('');
  });
});
