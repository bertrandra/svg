// Les degrades du modele v2 (ADR-0012, etape 3) : la resolution des references, la lecture riche (et ce que la lecture plate refuse
// comme avant), la couleur de repli, l'ecriture canonique et dedoublonnee, le point fixe sur des degrades tires au hasard (graine
// imprimee), la transformation qui emmene le degrade, et la specification de l'ecriture sur chaque cas de `v2/cas-degrades.ts`.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ecrireDessin, lireDessin, transformerFeuille, rotation, translation, echelle, verifierDessin, estPlat, couleurDeRepli, poidsArrets,
  lireReference, chaineHref, lireLongueur, lireFraction, definitionDegrade, transformerDegrade, MSG_DEGRADES, CHAINE_HREF_MAX,
  type Degrade, type DessinSvg, type Forme, type Matrice
} from '../../../src/engine/editionSvg.js';
import { analyserXml, type Noeud } from '../../../src/util/xml.js';
import { nettoyerSvg } from '../../../src/util/svg.js';
import { violationsEcriture, violationsNettoyage } from '../securite/invariants.js';
import { CAS } from './v2/cas-degrades.js';

const DOSSIER = resolve(__dirname, '../../fixtures/svg/v2');
const ENTREES = readdirSync(DOSSIER).filter(n => n.startsWith('degrades-') && n.endsWith('.svg') && !n.endsWith('.attendu.svg')).sort();

const riche = (svg: string) => { const r = lireDessin(svg, { modele: 'riche' }); if ('erreur' in r) throw new Error(r.erreur); return r; };
const svg = (corps: string, vb = '0 0 100 100') => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '">' + corps + '</svg>';
const carre: Forme['d'] = [{ c: 'M', p: [0, 0] }, { c: 'L', p: [100, 0] }, { c: 'L', p: [100, 100] }, { c: 'Z', p: [] }];
const forme = (p: Partial<Forme> = {}): Forme => ({ id: 'f1', d: carre, remplissage: '#808080', contour: null, epaisseur: 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false, ...p });
const ARRETS = [{ position: 0, couleur: '#c81e28' }, { position: 1, couleur: '#1f5fb0' }] as const;

describe('la resolution des references', () => {
  it('lit url(#id), ses guillemets, sa couleur de secours, et reconnait un renvoi exterieur', () => {
    expect(lireReference('url(#a)')).toEqual({ genre: 'locale', id: 'a' });
    expect(lireReference(' url( "#Paint0_Linear" ) ')).toEqual({ genre: 'locale', id: 'Paint0_Linear' });
    expect(lireReference("url('#a') red")).toEqual({ genre: 'locale', id: 'a', secours: 'red' });
    expect(lireReference('url(http://x.invalid/a.svg#b)')).toEqual({ genre: 'externe', adresse: 'http://x.invalid/a.svg#b' });
    expect(lireReference('#c81e28')).toBeNull();
  });

  it('suit une chaine href bornee, dit un cycle et un renvoi exterieur, ignore une cible d un autre genre', () => {
    const doc = analyserXml(svg('<linearGradient id="a" href="#b"/><linearGradient id="b" xlink:href="#c"/><linearGradient id="c" href="#r"/><rect id="r"/>'
      + '<linearGradient id="x" href="#y"/><linearGradient id="y" href="#x"/><linearGradient id="e" href="http://x.invalid/#z"/>'));
    if ('erreur' in doc) throw new Error('xml');
    const ids = new Map<string, Noeud>();
    const marcher = (n: Noeud) => { if (n.attributs.id) ids.set(n.attributs.id, n); n.enfants.forEach(marcher); };
    marcher(doc.racine);
    const degrade = (n: Noeud) => n.nom === 'linearGradient';
    const a = chaineHref(ids.get('a') as Noeud, ids, degrade);
    expect('maillons' in a ? a.maillons.map(m => m.attributs.id) : a).toEqual(['a', 'b', 'c']);
    expect(chaineHref(ids.get('x') as Noeud, ids, degrade)).toEqual({ cycle: 'x' });
    expect(chaineHref(ids.get('e') as Noeud, ids, degrade)).toEqual({ externe: 'http://x.invalid/#z' });
    expect(CHAINE_HREF_MAX).toBe(16);
  });

  it('lit une longueur en nombre, pixels ou pourcentage, et une fraction bornee', () => {
    expect(lireLongueur('12.5')).toEqual({ v: 12.5, part: false });
    expect(lireLongueur('3px')).toEqual({ v: 3, part: false });
    expect(lireLongueur('50%')).toEqual({ v: 0.5, part: true });
    expect(lireLongueur('2mm')).toBe('unite');
    expect(lireLongueur('abc')).toBeNull();
    expect(lireLongueur('1e400')).toBeNull();
    expect(lireFraction('150%', 0)).toBe(1);
    expect(lireFraction('-2', 0)).toBe(0);
    expect(lireFraction(undefined, 0.3)).toBe(0.3);
  });
});

describe('la couleur de repli et la part des arrets', () => {
  it('partage les intervalles par moitie, ce qui deborde revient aux extremes', () => {
    expect(poidsArrets([{ position: 0.2, couleur: '#000000' }, { position: 0.6, couleur: '#ffffff' }])).toEqual([0.4, 0.6]);
    expect(poidsArrets([{ position: 0, couleur: '#000000' }, { position: 0.5, couleur: '#808080' }, { position: 1, couleur: '#ffffff' }])).toEqual([0.25, 0.5, 0.25]);
    const p = poidsArrets([{ position: 0.1, couleur: '#000000' }, { position: 0.1, couleur: '#ffffff' }, { position: 0.9, couleur: '#ff0000' }]);
    expect(p.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
  });

  it('moyenne OKLab ponderee par la part et l opacite : un arret transparent ne colore presque rien', () => {
    expect(couleurDeRepli([{ position: 0, couleur: '#c81e28' }, { position: 1, couleur: '#c81e28' }])).toBe('#c81e28');
    const noirBlanc = couleurDeRepli([{ position: 0, couleur: '#000000' }, { position: 1, couleur: '#ffffff' }]);
    expect(noirBlanc).toMatch(/^#([0-9a-f]{2})\1\1$/);
    expect(couleurDeRepli([{ position: 0, couleur: '#c81e28' }, { position: 1, couleur: '#1f5fb0', opacite: 0 }])).toBe('#c81e28');
    expect(couleurDeRepli([{ position: 0, couleur: '#000000', opacite: 0 }, { position: 1, couleur: '#ffffff', opacite: 0 }])).toBe(noirBlanc);
  });
});

describe('la lecture', () => {
  it('chaque entree v2 des degrades se lit en riche, bien formee, et la lecture plate la refuse avec la phrase d aujourd hui', () => {
    expect(ENTREES.length).toBeGreaterThanOrEqual(12);
    for (const nom of ENTREES) {
      const texte = readFileSync(resolve(DOSSIER, nom), 'utf8');
      const r = riche(texte);
      expect(verifierDessin(r.dessin), nom).toEqual([]);
      expect(estPlat(r.dessin), nom).toBe(false);
      const plat = lireDessin(texte);
      expect('erreur' in plat ? plat.erreur : '', nom).toContain('un dégradé ou un motif');
    }
  });

  it('dit ce qu un navigateur ne peint pas, et la couleur de repli prend la place de la couleur', () => {
    const r = riche(readFileSync(resolve(DOSSIER, 'degrades-references.svg'), 'utf8'));
    expect(r.ignores).toEqual([MSG_DEGRADES.reference, MSG_DEGRADES.sansArret]);
    const l = riche(readFileSync(resolve(DOSSIER, 'degrades-lineaire.svg'), 'utf8'));
    const f = l.dessin.formes[0];
    expect(f?.remplissage).toBe(couleurDeRepli(f?.peintureRemplissage && 'arrets' in f.peintureRemplissage ? f.peintureRemplissage.arrets : []));
  });

  it('partage le meme objet entre les formes au meme degrade, posees pareil', () => {
    const d = riche(readFileSync(resolve(DOSSIER, 'degrades-partage.svg'), 'utf8')).dessin;
    const [a, b, c, e, g] = d.formes;
    expect(a?.peintureRemplissage).toBe(b?.peintureRemplissage);
    expect(b?.peintureRemplissage).toBe(c?.peintureRemplissage);
    expect(e?.peintureRemplissage).not.toBe(g?.peintureRemplissage);
  });

  it('un motif passe a sa fonctionnalite en riche (etape 9), un espace colorimetrique se dit, un arret en recul vaut le precedent', () => {
    const motif = lireDessin(svg('<pattern id="p" width="1" height="1"><rect width="5" height="5"/></pattern><rect width="10" height="10" fill="url(#p)"/>'), { modele: 'riche' });
    expect('erreur' in motif ? motif.erreur : motif.dessin.formes[0]?.peintureRemplissage?.genre).toBe('motif');
    const lin = riche(svg('<linearGradient id="g" color-interpolation="linearRGB"><stop offset="0.6" stop-color="#000"/><stop offset="0.2" stop-color="#fff"/></linearGradient><rect width="10" height="10" fill="url(#g)"/>'));
    expect(lin.ignores).toContain(MSG_DEGRADES.interpolation);
    const p = lin.dessin.formes[0]?.peintureRemplissage;
    expect(p && 'arrets' in p ? p.arrets.map(x => x.position) : []).toEqual([0.6, 0.6]);
  });

  it('le corpus d acceptation (annexe 7 §7) s ouvre sans refus, avec la liste d ignores declaree', () => {
    const IGNORES: Readonly<Record<string, readonly string[]>> = { 'figma-degrade': [], 'sketch-degrade-pourcent': [], 'inkscape-degrade-chaine': [] };
    for (const [nom, attendus] of Object.entries(IGNORES)) {
      const r = riche(readFileSync(resolve(DOSSIER, '../corpus', nom + '.svg'), 'utf8'));
      expect(r.ignores, nom).toEqual(attendus);
      expect(r.dessin.formes.every(f => f.peintureRemplissage), nom).toBe(true);
    }
  });

  it('un degrade herite d un degrade de l autre genre ses arrets et ses unites, pas ses coordonnees', () => {
    const d = riche(svg('<radialGradient id="r" gradientUnits="userSpaceOnUse" cx="5" spreadMethod="repeat"><stop offset="0" stop-color="#c81e28"/><stop offset="1" stop-color="#1f5fb0"/></radialGradient>'
      + '<linearGradient id="l" href="#r" x2="40"/><rect width="80" height="10" fill="url(#l)"/>', '0 0 80 10')).dessin;
    expect(d.formes[0]?.peintureRemplissage).toEqual({ genre: 'lineaire', x1: 0, y1: 0, x2: 40, y2: 0, arrets: [...ARRETS], etalement: 'repeat' });
  });
});

describe('l ecriture', () => {
  it('chaque cas des degrades s ecrit dans la specification de l ecriture et passe le nettoyage sans changer', () => {
    for (const c of CAS) {
      const depart = c.dessin ? c.dessin() : riche(readFileSync(resolve(DOSSIER, (c.entree ?? '') + '.svg'), 'utf8')).dessin;
      const e = ecrireDessin(c.operation ? c.operation(depart) : depart, 3);
      expect(violationsEcriture(e), c.nom).toEqual([]);
      expect(violationsNettoyage(e), c.nom).toEqual([]);
      expect(nettoyerSvg(e)?.svg, c.nom).toBe(e);
    }
  });

  it('cinq mille formes au meme degrade n ecrivent qu une definition ; deux dessins au meme degrade ecrivent le meme identifiant', () => {
    const degrade: Degrade = { genre: 'lineaire', x1: 0, y1: 0, x2: 100, y2: 0, arrets: [...ARRETS] };
    const formes = Array.from({ length: 5000 }, (_, i) => forme({ id: 'f' + (i + 1), peintureRemplissage: degrade, d: carre.map(c => ({ c: c.c, p: c.p.map(v => v + i) })) }));
    const e = ecrireDessin({ vb: [0, 0, 6000, 6000], formes }, 3);
    expect(e.match(/<linearGradient /g)?.length).toBe(1);
    const autre = ecrireDessin({ vb: [0, 0, 10, 10], formes: [forme({ peintureRemplissage: { ...degrade } })] }, 3);
    const id = /id="(ed-d-[0-9a-f]{14})"/.exec(e)?.[1];
    expect(id).toBeDefined();
    expect(autre).toContain('id="' + id + '"');
  });

  it('une forme plate s ecrit comme avant, meme a cote d une forme a degrade', () => {
    const plate = forme({ id: 'f2', remplissage: '#123456' });
    const d: DessinSvg = { vb: [0, 0, 100, 100], formes: [forme({ peintureRemplissage: { genre: 'radial', cx: 50, cy: 50, r: 40, arrets: [...ARRETS] } }), plate] };
    const seule = ecrireDessin({ vb: [0, 0, 100, 100], formes: [plate] }, 3);
    const corps = /<path [^>]*\/>$/.exec(seule.replace('</svg>', ''))?.[0] ?? '';
    expect(ecrireDessin(d, 3)).toContain(corps);
  });

  it('le point fixe sur des degrades tires au hasard (lineaires, radiaux, matrices quelconques, etalements)', () => {
    const graine = 20261026;
    let x = graine;
    const hasard = () => { x = (Math.imul(x, 1103515245) + 12345) >>> 0; return x / 2 ** 32; };
    const n = (a: number, b: number) => a + (b - a) * hasard();
    for (let k = 0; k < 400; k++) {
      const arrets = Array.from({ length: 2 + Math.floor(hasard() * 4) }, () => ({ position: Math.round(hasard() * 1000) / 1000, couleur: '#' + Math.floor(hasard() * 0xffffff).toString(16).padStart(6, '0'), ...(hasard() < 0.3 ? { opacite: Math.round(hasard() * 100) / 100 } : {}) })).sort((a, b) => a.position - b.position);
      const matrice: Matrice | undefined = hasard() < 0.7 ? [n(-3, 3), n(-3, 3), n(-3, 3), n(-3, 3), n(-200, 200), n(-200, 200)] : undefined;
      const commun = { arrets, ...(matrice ? { matrice } : {}), ...(hasard() < 0.3 ? { etalement: hasard() < 0.5 ? 'reflect' as const : 'repeat' as const } : {}) };
      const degrade: Degrade = hasard() < 0.5
        ? { genre: 'lineaire', x1: n(-100, 100), y1: n(-100, 100), x2: n(-100, 100), y2: n(-100, 100), ...commun }
        : { genre: 'radial', cx: n(-100, 100), cy: n(-100, 100), r: n(0.5, 100), ...(hasard() < 0.5 ? { fx: n(-100, 100), fy: n(-100, 100), fr: n(0, 10) } : {}), ...commun };
      const d: DessinSvg = { vb: [0, 0, 100, 100], formes: [forme({ peintureRemplissage: degrade, contour: '#000000', epaisseur: 2, peintureContour: degrade })] };
      for (const precision of [2, 3]) {
        const e = ecrireDessin(d, precision);
        const relu = riche(e);
        expect(ecrireDessin(relu.dessin, precision), 'graine ' + graine + ', tirage ' + k + ' : ' + e).toBe(e);
        expect(relu.ignores, 'graine ' + graine + ', tirage ' + k).toEqual([]);
      }
    }
  });

  it('un lineaire se ramene toujours au plan sans matrice ; un radial sous une similitude aussi', () => {
    const lin: Degrade = { genre: 'lineaire', x1: 0, y1: 0, x2: 1, y2: 1, arrets: [...ARRETS], matrice: [160, 0, 0, 80, 10, 20] };
    expect(definitionDegrade(lin, 3).attributs).toBe(' gradientUnits="userSpaceOnUse" x1="10" y1="20" x2="74" y2="148"');
    const rad: Degrade = { genre: 'radial', cx: 0, cy: 0, r: 1, arrets: [...ARRETS], matrice: rotation(30, 0, 0).map((v, i) => (i < 4 ? v * 28 : i === 4 ? 80 : 60)) as unknown as Matrice };
    expect(definitionDegrade(rad, 3).attributs).toBe(' gradientUnits="userSpaceOnUse" cx="80" cy="60" r="28"');
  });
});

describe('la transformation', () => {
  it('un deplacement deplace les coordonnees ; le reste compose la matrice ; un degrade partage le reste', () => {
    const degrade: Degrade = { genre: 'radial', cx: 50, cy: 50, r: 40, fx: 40, arrets: [...ARRETS] };
    expect(transformerDegrade(degrade, translation(10, -5))).toEqual({ ...degrade, cx: 60, cy: 45, fx: 50 });
    expect(transformerDegrade(degrade, translation(0, 0))).toBe(degrade);
    const m = echelle(2, 1, 0, 0);
    expect(transformerDegrade(degrade, m)).toEqual({ ...degrade, matrice: m });
    const f = transformerFeuille(forme({ peintureRemplissage: degrade, contour: '#000000', epaisseur: 1, peintureContour: degrade }), rotation(45, 50, 50));
    expect(f.peintureRemplissage).toBe(f.peintureContour);
    expect(f.peintureRemplissage && 'matrice' in f.peintureRemplissage ? f.peintureRemplissage.matrice : null).toEqual(rotation(45, 50, 50));
    const plate = forme();
    expect(transformerFeuille(plate, rotation(45)).peintureRemplissage).toBeUndefined();
  });
});
