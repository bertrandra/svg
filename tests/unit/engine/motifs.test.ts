// Les motifs du modele v2 (ADR-0012, etape 9 ; annexe 8 §1) : la lecture riche d'une peinture `url(#…)` vers un <pattern> (unites de la
// tuile et du contenu, viewBox, transformation, chaine `href`, contenu peint, motifs imbriques), ses refus et ses pertes dites,
// l'ecriture (propre, dedoublonnee, en point fixe : le harnais ecriture-stable-v2.test.ts, plus des motifs tires au hasard), la couleur de
// repli, le motif qui suit sa forme, l'espace d'identifiants a part de la tuile, « Créer un motif depuis la sélection », le nuancier, la
// descente, et le mode plat, qui refuse toujours avec la phrase d'aujourd'hui.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  couleurDeRepliMotif, creerMotif, dupliquer, ecrireDessin, estMotif, lireDessin, MSG_MOTIF, MSG_MOTIFS, prochainNumero,
  REFUS_MOTIFS, rotation, transformer, translation, verifierDessin, type DessinSvg, type Forme, type Matrice, type Motif
} from '../../../src/engine/editionSvg.js';
import { motifs as descenteMotifs, PERTE_MOTIFS } from '../../../src/engine/descente/motifs.js';
import { aplatirPour, CAPACITES_PLAT } from '../../../src/engine/aplatir.js';
import { nuancierDuDessin } from '../../../src/engine/nuancier.js';
import { nettoyerSvg } from '../../../src/util/svg.js';
import { violationsEcriture, violationsNettoyage } from '../securite/invariants.js';
import { CAS } from './v2/cas-motifs.js';

const V2 = resolve(__dirname, '../../fixtures/svg/v2');
const CORPUS = resolve(__dirname, '../../fixtures/svg/corpus');
const SVG = (corps: string) => '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100">' + corps + '</svg>';
const MOTIF = '<defs><pattern id="p" patternUnits="userSpaceOnUse" width="10" height="10"><rect width="5" height="5" fill="#c81e28"/></pattern></defs>';

const lire = (svg: string): ReturnType<typeof lireDessin> => lireDessin(svg, { modele: 'riche' });
const riche = (svg: string): DessinSvg => { const r = lire(svg); if ('erreur' in r) throw new Error(r.erreur); return r.dessin; };
const erreur = (r: ReturnType<typeof lireDessin>): string => ('erreur' in r ? r.erreur : '');
const ignores = (r: ReturnType<typeof lireDessin>): readonly string[] => ('erreur' in r ? [] : r.ignores);
const motifDe = (f: Forme | undefined): Motif => { const p = f?.peintureRemplissage; if (!estMotif(p)) throw new Error('pas de motif'); return p; };
const entrees = [
  ...readdirSync(V2).filter(n => n.startsWith('motifs-') && n.endsWith('.svg') && !n.endsWith('.attendu.svg')).map(n => join(V2, n)),
  join(CORPUS, 'motif-hachures.svg')
];
const forme = (champs: Partial<Forme> = {}): Forme => ({
  id: 'f1', d: [{ c: 'M', p: [10, 10] }, { c: 'L', p: [90, 10] }, { c: 'L', p: [90, 90] }, { c: 'L', p: [10, 90] }, { c: 'Z', p: [] }],
  remplissage: '#000000', contour: null, epaisseur: 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false, ...champs
});

describe('la lecture', () => {
  it('le mode plat refuse chaque entree avec la phrase d aujourd hui ; le mode riche les ouvre sans rien perdre d autre', () => {
    for (const chemin of entrees) {
      const texte = readFileSync(chemin, 'utf8');
      expect(erreur(lireDessin(texte)), chemin).toContain('un dégradé ou un motif');
      const r = lire(texte);
      expect(erreur(r), chemin).toBe('');
      if ('erreur' in r) continue;
      expect(verifierDessin(r.dessin), chemin).toEqual([]);
      expect(r.dessin.formes.some(f => estMotif(f.peintureRemplissage) || estMotif(f.peintureContour)), chemin).toBe(true);
    }
  });

  it('chaque cas s ecrit propre (specification de l ecriture, nettoyage stable)', () => {
    for (const c of CAS) {
      const d = c.dessin ? c.dessin() : riche(readFileSync(join(V2, (c.entree ?? '') + '.svg'), 'utf8'));
      const e = ecrireDessin(c.operation ? c.operation(d) : d, 3);
      expect(violationsEcriture(e), c.nom).toEqual([]);
      expect(violationsNettoyage(e), c.nom).toEqual([]);
    }
  });

  it('les unites : la tuile en parts de la boite (le defaut), le contenu en unites de boite, les pourcentages du plan', () => {
    const d = riche(readFileSync(join(V2, 'motifs-boite.svg'), 'utf8'));
    expect(motifDe(d.formes[0])).toMatchObject({ x: 10, y: 20, l: 40, h: 50 });
    const losanges = motifDe(d.formes[1]);
    expect(losanges).toMatchObject({ x: 190, y: 10, l: 20, h: 30 });
    expect(losanges.contenu.formes[0]?.d[0]).toEqual({ c: 'M', p: [10, 0] });
    const pourcent = riche(SVG('<defs><pattern id="p" patternUnits="userSpaceOnUse" x="10%" width="25%" height="10"><rect width="5" height="5"/></pattern></defs><rect width="100" height="100" fill="url(#p)"/>'));
    expect(motifDe(pourcent.formes[0])).toMatchObject({ x: 10, y: 0, l: 25, h: 10 });
  });

  it('la transformation de la forme et le patternTransform se composent ; une translation deplace la tuile', () => {
    const d = riche(SVG(MOTIF.replace('width="10"', 'width="10" patternTransform="rotate(90)"') + '<g transform="translate(5 0)"><rect width="50" height="50" fill="url(#p)"/></g>'));
    const m = motifDe(d.formes[0]).matrice ?? [];
    expect(m.map(v => Math.round(v * 1e9) / 1e9)).toEqual([0, 1, -1, 0, 5, 0]);
    const seul = riche(SVG(MOTIF + '<g transform="translate(5 3)"><rect width="50" height="50" fill="url(#p)"/></g>'));
    expect(motifDe(seul.formes[0])).toMatchObject({ x: 5, y: 3 });
    expect(motifDe(seul.formes[0]).matrice).toBeUndefined();
  });

  it('la chaine href : le contenu et les unites herites, la taille surchargee, href avant xlink:href', () => {
    const d = riche(readFileSync(join(V2, 'motifs-href.svg'), 'utf8'));
    const [base, large, tourne] = d.formes.map(motifDe);
    expect(large?.l).toBe(24);
    expect(large?.contenu.formes.map(f => f.d)).toEqual(base?.contenu.formes.map(f => f.d));
    expect(tourne?.matrice).toBeDefined();
  });

  it('le contenu herite de l endroit ou le <pattern> est ecrit, pas de la forme qu il peint', () => {
    const d = riche(SVG('<defs fill="#1f5fb0"><pattern id="p" patternUnits="userSpaceOnUse" width="10" height="10"><rect width="5" height="5"/></pattern></defs><g fill="#c81e28"><rect width="50" height="50" fill="url(#p)"/></g>'));
    expect(motifDe(d.formes[0]).contenu.formes[0]?.remplissage).toBe('#1f5fb0');
  });

  it('une tuile qui deborde se dit ; la tuile est rognee (le navigateur le fait)', () => {
    const r = lire(readFileSync(join(V2, 'motifs-ignores.svg'), 'utf8'));
    expect(ignores(r)).toContain(MSG_MOTIFS.debord);
    expect(ignores(lire(SVG(MOTIF + '<rect width="50" height="50" fill="url(#p)"/>')))).toEqual([]);
  });

  it('la couleur de repli : la moyenne OKLab de ce que peint la tuile, ponderee par la surface et l opacite', () => {
    const d = riche(SVG(MOTIF + '<rect width="50" height="50" fill="url(#p)"/>'));
    expect(d.formes[0]?.remplissage).toBe('#c81e28');
    const deux = riche(SVG('<defs><pattern id="p" patternUnits="userSpaceOnUse" width="10" height="10"><rect width="9" height="10" fill="#ffffff"/><rect x="9" width="1" height="10" fill="#000000"/></pattern></defs><rect width="50" height="50" fill="url(#p)"/>'));
    const r = deux.formes[0]?.remplissage ?? '';
    expect(r).not.toBe('#ffffff');
    expect(Number.parseInt(r.slice(1, 3), 16)).toBeGreaterThan(200);
    expect(couleurDeRepliMotif({ formes: [forme({ remplissage: null })] })).toBe('#000000');
  });

  it('mille formes au meme motif partagent la peinture ; fond et trait aussi', () => {
    const d = riche(SVG(MOTIF + '<rect width="50" height="50" fill="url(#p)" stroke="url(#p)"/><rect x="50" width="50" height="50" fill="url(#p)"/>'));
    expect(d.formes[0]?.peintureRemplissage).toBe(d.formes[0]?.peintureContour);
    expect(d.formes[0]?.peintureRemplissage).toBe(d.formes[1]?.peintureRemplissage);
    expect(ecrireDessin(d, 3).match(/<pattern /g)).toHaveLength(1);
  });

  it('refuse en le nommant : renvoi exterieur, unite inconnue, transformation illisible, boite plate, tuile vide, image', () => {
    expect(erreur(lire(SVG('<defs><pattern id="p" href="autre.svg#q" width="10" height="10"/></defs><rect width="50" height="50" fill="url(#p)"/>')))).toContain(REFUS_MOTIFS.externe);
    expect(erreur(lire(SVG(MOTIF.replace('width="10"', 'width="10mm"') + '<rect width="50" height="50" fill="url(#p)"/>')))).toContain(REFUS_MOTIFS.unite);
    expect(erreur(lire(SVG(MOTIF.replace('width="10"', 'width="10" patternTransform="tourne(3)"') + '<rect width="50" height="50" fill="url(#p)"/>')))).toContain(REFUS_MOTIFS.transformation);
    expect(erreur(lire(SVG(MOTIF.replace('width="10"', 'width="10" patternTransform="scale(0)"') + '<rect width="50" height="50" fill="url(#p)"/>')))).toContain(REFUS_MOTIFS.transformation);
    expect(erreur(lire(SVG('<defs><pattern id="p" width="0.5" height="0.5"><rect width="5" height="5"/></pattern></defs><path d="M0 0L50 0" stroke="url(#p)"/>')))).toContain(REFUS_MOTIFS.vide);
    expect(erreur(lire(SVG('<defs><pattern id="p" width="10" height="10" patternUnits="userSpaceOnUse" viewBox="0 0 0 10"><rect width="5" height="5"/></pattern></defs><rect width="50" height="50" fill="url(#p)"/>')))).toContain(REFUS_MOTIFS.vide);
    expect(erreur(lire(SVG('<defs><pattern id="p" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="5" height="5" display="none"/></pattern></defs><rect width="50" height="50" fill="url(#p)"/>')))).toContain(REFUS_MOTIFS.vide);
    // Une reference vers rien reste aux degrades : rien n'est peint, et c'est dit.
    expect(erreur(lire(SVG('<rect width="50" height="50" fill="url(#rien)" stroke="#000"/>')))).toBe('');
  });

  it('un motif dans une tuile est lu ; une tuile qui se peint d elle-meme est un cycle', () => {
    const d = riche(readFileSync(join(V2, 'motifs-imbriques.svg'), 'utf8'));
    const tuile = motifDe(d.formes[0]).contenu;
    expect(tuile.formes.some(f => estMotif(f.peintureRemplissage))).toBe(true);
    expect(tuile.formes.some(f => f.peintureRemplissage?.genre === 'lineaire')).toBe(true);
    expect(erreur(lire(SVG('<defs><pattern id="p" patternUnits="userSpaceOnUse" width="10" height="10"><rect width="5" height="5" fill="url(#p)"/></pattern></defs><rect width="50" height="50" fill="url(#p)"/>')))).toContain(REFUS_MOTIFS.cycle);
  });
});

describe('les identifiants d une tuile', () => {
  it('forment un espace a part : une tuile partagee ne fait pas de doublon, un doublon dans la tuile se voit', () => {
    const d = riche(SVG(MOTIF + '<rect width="50" height="50" fill="url(#p)"/><rect x="50" width="50" height="50" fill="url(#p)"/>'));
    const copie = dupliquer(d, d.formes.map(f => f.id), 10, 0).dessin;
    expect(verifierDessin(copie)).toEqual([]);
    const tuile = motifDe(d.formes[0]).contenu;
    // Un numero neuf ne reprend jamais celui d'une feuille de tuile.
    const idsTuile = tuile.formes.map(f => Number(f.id.slice(1)));
    expect(prochainNumero(d, 'f')).toBeGreaterThan(Math.max(...idsTuile));
    const abime: Motif = { ...motifDe(d.formes[0]), contenu: { formes: [...tuile.formes, ...tuile.formes] } };
    expect(verifierDessin({ ...d, formes: [{ ...forme(), peintureRemplissage: abime }] }).join(' ')).toContain('I1');
  });
});

describe('la transformation', () => {
  it('une translation deplace la tuile, le reste compose la matrice ; le contenu reste le meme objet', () => {
    const d = riche(SVG(MOTIF + '<rect width="50" height="50" fill="url(#p)" stroke="url(#p)"/>'));
    const avant = motifDe(d.formes[0]);
    const deplace = transformer(d, ['f2'], translation(3, 4));
    expect(motifDe(deplace.formes[0])).toMatchObject({ x: avant.x + 3, y: avant.y + 4 });
    expect(motifDe(deplace.formes[0]).contenu).toBe(avant.contenu);
    const tourne = transformer(d, ['f2'], rotation(30, 25, 25));
    const m = motifDe(tourne.formes[0]);
    expect(m.matrice).toBeDefined();
    expect(m.contenu).toBe(avant.contenu);
    expect(tourne.formes[0]?.peintureContour).toBe(tourne.formes[0]?.peintureRemplissage);
  });
});

describe('le point fixe sur des motifs tires au hasard', () => {
  it('tuiles, matrices et contenus quelconques se relisent et se reecrivent a l identique', () => {
    const graine = 20261027;
    let x = graine;
    const hasard = () => { x = (Math.imul(x, 1103515245) + 12345) >>> 0; return x / 2 ** 32; };
    const n = (a: number, b: number) => a + (b - a) * hasard();
    const couleur = () => '#' + Math.floor(hasard() * 0xffffff).toString(16).padStart(6, '0');
    for (let k = 0; k < 200; k++) {
      const l = n(0.5, 40), h = n(0.5, 40);
      const contenu = { formes: Array.from({ length: 1 + Math.floor(hasard() * 3) }, (_, i) => forme({
        id: 'f' + (i + 1), d: [{ c: 'M', p: [n(-5, l), n(-5, h)] }, { c: 'L', p: [n(-5, l), n(-5, h)] }, { c: 'L', p: [n(-5, l), n(-5, h)] }, { c: 'Z', p: [] }],
        remplissage: couleur(), ...(hasard() < 0.5 ? { contour: couleur(), epaisseur: n(0.1, 3) } : {}), ...(hasard() < 0.3 ? { opacite: Math.round(hasard() * 100) / 100 } : {})
      })) };
      const matrice: Matrice | undefined = hasard() < 0.7 ? [n(-3, 3), n(-3, 3), n(-3, 3), n(-3, 3), n(-200, 200), n(-200, 200)] : undefined;
      const motif: Motif = { genre: 'motif', x: n(-50, 50), y: n(-50, 50), l, h, ...(matrice ? { matrice } : {}), contenu };
      const d: DessinSvg = { vb: [0, 0, 100, 100], formes: [forme({ id: 'f9', peintureRemplissage: motif, remplissage: couleurDeRepliMotif(contenu) })] };
      for (const precision of [2, 3]) {
        const e = ecrireDessin(d, precision);
        const relu = lire(e);
        if ('erreur' in relu) {
          // Une matrice presque degeneree, une fois arrondie, peut le devenir : refusee en le nommant, jamais ecrite en Infinity.
          expect(relu.erreur, 'graine ' + graine + ', tirage ' + k).toContain(REFUS_MOTIFS.transformation);
          continue;
        }
        expect(ecrireDessin(relu.dessin, precision), 'graine ' + graine + ', tirage ' + k + ' : ' + e).toBe(e);
        expect(relu.ignores, 'graine ' + graine + ', tirage ' + k).toEqual([]);
      }
    }
  });
});

describe('creer un motif depuis la selection', () => {
  const dessin = (): DessinSvg => riche('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120"><rect width="200" height="120" fill="#f1faee"/>'
    + '<circle cx="20" cy="20" r="8" fill="#e63946"/><rect x="30" y="12" width="14" height="16" fill="#457b9d"/>'
    + '<g><rect x="100" y="60" width="10" height="10" fill="#000"/></g></svg>');

  it('la selection devient la tuile (sa boite visuelle, son contenu au coin) et quitte le dessin ; la cible garde sa place', () => {
    const r = creerMotif(dessin(), ['f2', 'f3'], 'f1');
    expect(r.erreur).toBeUndefined();
    expect(r.id).toBe('f1');
    expect(r.dessin.formes.map(f => f.id)).toEqual(['f1', 'f4']);
    const m = motifDe(r.dessin.formes[0]);
    expect(m).toMatchObject({ x: 12, y: 12, l: 32, h: 16 });
    expect(m.contenu.formes.map(f => f.id)).toEqual(['f2', 'f3']);
    expect(m.contenu.formes[1]?.d[0]).toEqual({ c: 'M', p: [18, 0] });
    expect(r.dessin.formes[0]?.remplissage).toBe(couleurDeRepliMotif(m.contenu));
    expect(verifierDessin(r.dessin)).toEqual([]);
  });

  it('sans cible, un rectangle neuf de trois tuiles sur trois, a la place du plus haut element choisi, dans son groupe', () => {
    const r = creerMotif(dessin(), ['f2', 'f4']);
    expect(r.erreur).toBeUndefined();
    const neuf = r.dessin.formes.find(f => f.id === r.id);
    expect(neuf?.parent).toBe('g1');
    expect(r.dessin.formes.map(f => f.id)).toEqual(['f1', 'f3', r.id]);
    const m = motifDe(neuf);
    expect(neuf?.d[0]).toEqual({ c: 'M', p: [m.x - m.l, m.y - m.h] });
    expect(verifierDessin(r.dessin)).toEqual([]);
  });

  it('dit pourquoi il ne s applique pas : rien de choisi, une image, une cible invalide, une cible dans la selection', () => {
    const d = dessin();
    expect(creerMotif(d, []).erreur).toBe(MSG_MOTIF.selection);
    expect(creerMotif(d, ['f2'], 'f2').erreur).toBe(MSG_MOTIF.cible);
    expect(creerMotif(d, ['f2'], 'f9').erreur).toBe(MSG_MOTIF.cible);
    expect(creerMotif(d, ['g1'], 'f4').erreur).toBe(MSG_MOTIF.cible);
    expect(creerMotif(d, ['f2'], 'f1').dessin).not.toBe(d);
    expect(creerMotif(d, []).dessin).toBe(d);
    const image = riche(readFileSync(join(V2, 'images-png.svg'), 'utf8'));
    expect(creerMotif(image, image.formes.map(f => f.id)).erreur).toBe(MSG_MOTIF.image);
  });
});

describe('le nuancier et la descente', () => {
  it('le nuancier lit les couleurs de la tuile, jamais la couleur de repli', () => {
    const d = riche(SVG('<defs><pattern id="p" patternUnits="userSpaceOnUse" width="10" height="10"><rect width="10" height="10" fill="#1f5fb0"/><rect width="5" height="5" fill="#c81e28"/></pattern></defs><rect width="50" height="50" fill="url(#p)"/>'));
    const teintes = nuancierDuDessin(d).teintes.map(t => t.hex);
    expect(teintes).toEqual(['#1f5fb0', '#c81e28']);
    expect(teintes).not.toContain(d.formes[0]?.remplissage);
  });

  it('la descente rend la couleur de repli et le dit ; natif garde le motif ; une forme masquee part sans phrase', () => {
    const d = riche(readFileSync(join(V2, 'motifs-plan.svg'), 'utf8'));
    const plat = aplatirPour(d, CAPACITES_PLAT);
    expect(plat.pertes).toEqual([PERTE_MOTIFS]);
    expect(plat.dessin.formes.map(f => f.remplissage)).toEqual(d.formes.map(f => f.remplissage));
    expect(plat.dessin.formes.every(f => f.peintureRemplissage === undefined)).toBe(true);
    expect(descenteMotifs.descendre(d, 'natif').dessin).toBe(d);
    const masque = { ...d, formes: d.formes.map(f => ({ ...f, visible: false })) };
    expect(aplatirPour(masque, CAPACITES_PLAT).pertes).toEqual([]);
  });

  it('ce qui s ecrit passe le nettoyage tel quel', () => {
    const e = ecrireDessin(riche(readFileSync(join(V2, 'motifs-imbriques.svg'), 'utf8')), 3);
    expect(nettoyerSvg(e)?.svg).toBe(e);
  });
});
