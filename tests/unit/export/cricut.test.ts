// Les exports pour Cricut (ADR-0013) : le SVG de decoupe (unites physiques, remplissages pleins, une couche par
// couleur, aucun trait ni opacite, trous dans un seul <path>, octets stables, relecture idempotente) et Print Then
// Cut (fond perdu d'aire attendue, ligne de coupe egale a la silhouette exterieure unie, archive complete).

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import clipping from 'polygon-clipping';
import { regionDeForme, toleranceBooleen } from '../../../src/engine/booleens.js';
import { aireDeRegion } from '../../../src/engine/contour/region.js';
import { ecrireDessin, lireDessin, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { resoudreProfil, silhouetteDe, type ProfilProduction } from '../../../src/engine/preparation.js';
import { svgCricut } from '../../../src/export/cricut.js';
import { archivePrintThenCut, modeDEmploi, printThenCut, FORMES_MAX_PRINT_THEN_CUT, type FichiersPrintThenCut } from '../../../src/export/printThenCut.js';
import { CHOIX_CRICUT_DEFAUT, type ChoixMachine } from '../../../src/model/contextes.js';
import { nettoyerSvg } from '../../../src/util/svg.js';
import { au } from '../../../src/util/tableaux.js';
import { violationsNettoyage } from '../securite/invariants.js';

const DOSSIER = resolve(__dirname, '../../fixtures/svg');
const lire = (svg: string): DessinSvg => { const r = lireDessin(svg); if ('erreur' in r) throw new Error(r.erreur); return r.dessin; };
const fixture = (nom: string): DessinSvg => lire(readFileSync(resolve(DOSSIER, nom + '.svg'), 'utf8'));
const svg = (corps: string, vb = '0 0 480 288') => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '">' + corps + '</svg>';
const profil = (choix: Partial<ChoixMachine> = {}): ProfilProduction => {
  const p = resoudreProfil({ contexte: 'cricut', ...CHOIX_CRICUT_DEFAUT, ...choix });
  if (!p) throw new Error('profil');
  return p;
};
const MAKER = profil(), PTC = profil({ procede: 'imprimer-decouper' });
const racine = (s: string) => /^<svg[^>]*>/.exec(s)?.[0] ?? '';
const exporter = (d: DessinSvg, p = MAKER): string => { const r = svgCricut(d, p); if ('erreur' in r) throw new Error(r.erreur); return r.svg; };
const ptc = (d: DessinSvg, p = PTC): FichiersPrintThenCut => { const r = printThenCut(d, p); if ('erreur' in r) throw new Error(r.erreur); return r; };

describe('le SVG pour Cricut', () => {
  it('pose une taille physique : des pouces a 96 unites par pouce, jamais un px nu', () => {
    const s = exporter(fixture('cricut'));
    expect(racine(s)).toContain(' width="5in" height="3in"');
    expect(racine(s)).toContain(' viewBox="0 0 480 288"');
    expect(racine(exporter(fixture('cricut'), profil({ unite: 'mm' })))).toContain(' width="127mm" height="76.2mm"');
  });

  it('n ecrit que des remplissages pleins : aucun trait, aucune opacite', () => {
    const s = exporter(fixture('cricut'));
    expect(s).not.toMatch(/stroke|opacity/);
    expect(s.match(/<path /g)).toHaveLength(3);
    for (const m of s.matchAll(/fill="([^"]*)"/g)) expect(m[1]).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('garde un trou dans le meme <path> que sa forme, et compte une couche par couleur', () => {
    const r = svgCricut(fixture('cricut'), MAKER);
    if ('erreur' in r) throw new Error(r.erreur);
    expect(r.couches).toBe(2);
    const anneau = /<path d="([^"]*)" fill="#1428a0"\/>/.exec(r.svg)?.[1] ?? '';
    expect(anneau.match(/M/g)).toHaveLength(2);
  });

  it('porte la marque du contexte, que la relecture retrouve, et se relit puis se reecrit a l identique', () => {
    const s = exporter(fixture('cricut'));
    expect(racine(s)).toContain('data-ed-contexte="cricut" data-ed-machine="maker" data-ed-tapis="12x12" data-ed-materiau="papier-cartonne" data-ed-procede="decoupe" data-ed-unite="in"');
    const r = lireDessin(s);
    if ('erreur' in r) throw new Error(r.erreur);
    expect(r.production?.machine).toBe('maker');
    expect(exporter(r.dessin)).toBe(s);
  });

  it('ecrit les memes octets deux fois, et passe le nettoyage sans changer', () => {
    const d = fixture('cricut');
    expect(exporter(d)).toBe(exporter(d));
    const s = exporter(d);
    expect(nettoyerSvg(s)?.svg).toBe(s);
    expect(violationsNettoyage(s)).toEqual([]);
  });

  it('refuse un trait, une transparence ou une piece trop grande, en le nommant', () => {
    const trait = svgCricut(lire(svg('<path d="M10 10H100V100H10Z" fill="#c81e28" stroke="#000" stroke-width="4"/>')), MAKER);
    expect('erreur' in trait && trait.erreur).toMatch(/^Corrigez d’abord.*contour/);
    expect('erreur' in trait ? trait.constats.map(c => c.code) : []).toEqual(['trait']);
    const transparente = svgCricut(lire(svg('<path d="M10 10H100V100H10Z" fill="#c81e28" opacity="0.5"/>')), MAKER);
    expect('erreur' in transparente ? transparente.constats.map(c => c.code) : []).toEqual(['opacite']);
    const grande = svgCricut(lire(svg('<path d="M0 0H1200V96H0Z" fill="#000"/>', '0 0 1300 1300')), MAKER);
    expect('erreur' in grande ? grande.constats.map(c => c.code) : []).toEqual(['piece-trop-grande']);
  });

  it('laisse de cote, et compte, une forme visible sans fond ni trait', () => {
    const r = svgCricut(lire(svg('<path d="M10 10H100V100H10Z" fill="#c81e28"/><path d="M200 10H300V100H200Z" fill="none" stroke="#000" stroke-width="0"/>')), MAKER);
    expect('erreur' in r ? r.erreur : r.laissees).toBe(1);
    expect('erreur' in r ? '' : r.svg.match(/<path /g)).toHaveLength(1);
  });

  it('ne change rien a un dessin sans contexte : l ecriture Generique reste ecrireDessin', () => {
    const d = fixture('cricut');
    expect(ecrireDessin(d, 3)).not.toContain('data-ed-');
    expect(ecrireDessin(d, 3)).toContain(' width="480" height="288"');
  });
});

describe('Print Then Cut', () => {
  const d = fixture('print-then-cut');
  const f = ptc(d);
  const tolerance = toleranceBooleen(d), fp = PTC.printThenCut?.fondPerdu ?? 0;
  const regionDe = (s: string) => lire(s).formes.reduce<ReturnType<typeof regionDeForme>>((m, x) => (m.length ? clipping.union(m, regionDeForme(x, tolerance)) : regionDeForme(x, tolerance)), []);

  it('pose les deux fichiers au meme cadre et a la meme taille physique, fond perdu compris', () => {
    expect(racine(f.impression).replace(/ data-ed-[^ >]*/g, '')).toBe(racine(f.coupe).replace(/ data-ed-[^ >]*/g, ''));
    expect(racine(f.coupe)).toContain(' width="3in" height="2in"');
    expect(racine(f.coupe)).toContain('data-ed-procede="imprimer-decouper"');
    expect(f.vb).toEqual([0, 0, 288, 192]);
  });

  it('coupe sur la silhouette exterieure unie : une seule forme, sans trou, de l aire de l union', () => {
    const coupe = lire(f.coupe);
    expect(coupe.formes).toHaveLength(1);
    expect(coupe.formes[0]?.contour).toBeNull();
    const silhouette = silhouetteDe(d, tolerance);
    const ecart = aireDeRegion(clipping.xor(regionDeForme(au(coupe.formes, 0), tolerance), silhouette));
    expect(ecart / aireDeRegion(silhouette)).toBeLessThan(2e-3);
    // Le trou de l'anneau ne se coupe pas : la silhouette n'a que des bords exterieurs.
    expect(silhouette.every(p => p.length === 1)).toBe(true);
  });

  it('prolonge le bord du fond perdu : l impression couvre la silhouette grossie, ni plus ni moins', () => {
    const impression = regionDe(f.impression), silhouette = silhouetteDe(d, tolerance);
    const aireImpression = aireDeRegion(clipping.union(impression, silhouette));
    const s = aireDeRegion(silhouette);
    // Un anneau de largeur fp autour d'un bord de perimetre P ajoute environ P fp (+ pi fp^2 par bord exterieur).
    const perimetre = 2 * Math.PI * 72 + 2 * (84 + 6 + 72 + 6);
    const attendu = s + perimetre * fp + 2 * Math.PI * fp * fp;
    expect(aireImpression / attendu).toBeGreaterThan(0.97);
    expect(aireImpression / attendu).toBeLessThan(1.03);
    // Le trou du dessin ne se remplit pas de fond perdu.
    const trou: [number, number][] = [[90, 90], [102, 90], [102, 102], [90, 102], [90, 90]];
    expect(aireDeRegion(clipping.intersection(impression, [[trou]]))).toBeLessThan(1e-6);
  });

  it('donne au fond perdu la couleur du bord : le trait sombre autour du rectangle, le jaune et le rouge autour du disque', () => {
    const lu = lire(f.impression), originales = d.formes.length;
    const fond = lu.formes.slice(0, lu.formes.length - originales);
    // La ligne sombre est tout entiere dans le disque : elle n'atteint pas le bord, elle n'a pas de fond perdu.
    expect(fond.map(x => x.remplissage)).toEqual(['#f2c14e', '#c81e28', '#15181d']);
    // Puis le dessin tel quel, traits et opacites compris : on imprime ce qu'on voit.
    expect(lu.formes.slice(-originales).map(x => x.contour)).toEqual([null, null, '#15181d', '#15181d']);
  });

  it('refuse une machine sans Print Then Cut, et un dessin trop grand avec son fond perdu', () => {
    const joy = printThenCut(d, profil({ machine: 'joy', tapis: 'joy-4x6' }));
    expect('erreur' in joy && joy.erreur).toMatch(/ne fait pas Print Then Cut/);
    const grand = printThenCut(lire(svg('<path d="M0 0H768V768H0Z" fill="#c81e28"/>', '0 0 800 800')), PTC);
    expect('erreur' in grand ? grand.constats.map(c => c.code) : []).toEqual(['ptc-trop-grand']);
    const nombreuses = Array.from({ length: FORMES_MAX_PRINT_THEN_CUT + 1 }, (_, i) => '<path d="M' + (i % 30) * 10 + ' ' + Math.floor(i / 30) * 10 + 'h5v5h-5z" fill="#000"/>').join('');
    const trop = printThenCut(lire(svg(nombreuses, '0 0 400 400')), PTC);
    expect('erreur' in trop && trop.erreur).toMatch(/au-delà de 400 formes/);
  });

  it('ecrit les memes octets deux fois', () => {
    const autre = ptc(fixture('print-then-cut'));
    expect(autre.impression).toBe(f.impression);
    expect(autre.coupe).toBe(f.coupe);
  });

  it('livre une archive complete et reproductible : mode d emploi, impression, coupe (et le PNG s il est donne)', () => {
    const entrees = (zip: Uint8Array): string[] => {
      const noms: string[] = [];
      const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
      for (let p = 0; v.getUint32(p, true) === 0x04034b50;) {
        const taille = v.getUint32(p + 18, true), ln = v.getUint16(p + 26, true);
        noms.push(new TextDecoder().decode(zip.subarray(p + 30, p + 30 + ln)));
        p += 30 + ln + taille;
      }
      return noms;
    };
    const a = archivePrintThenCut('mon dessin', f, PTC, null);
    expect(archivePrintThenCut('mon dessin', f, PTC, null)).toEqual(a);
    expect(entrees(a)).toEqual(['LISEZMOI.txt', 'mon dessin-impression.svg', 'mon dessin-coupe.svg']);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    expect(entrees(archivePrintThenCut('mon dessin', f, PTC, png))).toEqual(['LISEZMOI.txt', 'mon dessin-impression.png', 'mon dessin-impression.svg', 'mon dessin-coupe.svg']);
    const texte = modeDEmploi('mon dessin', f, PTC, true);
    expect(texte).toContain('3 × 2 po');
    expect(texte).toContain('À VÉRIFIER');
    expect(texte).toContain('300 ppp');
  });
});
