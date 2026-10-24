import { describe, it, expect, vi, afterEach } from 'vitest';
import { convertPixels } from '@visioncortex/vtracer';
import { apercuPretraite, pretraiterSource, traiterImage, type ImageConvertie, type SourceImage } from '../../../src/io/image.js';
import { cleTraitement, TRAITEMENT_DEFAUT, type Traceur, type Traitement } from '../../../src/engine/vectorisation.js';
import { lireDessin } from '../../../src/engine/editionSvg.js';
import { convertirLot, type ImageDuLot, type OutilsLot } from '../../../src/io/lot.js';
import { installerCanvas, pixelsDeDataUrl } from './navigateur-factice.js';
import { logo, logoBruite } from '../engine/images-synthetiques.js';

const chargerTraceur = vi.hoisted(() => vi.fn());
vi.mock('../../../src/io/vtracer.js', () => ({ chargerTraceur }));
const vtracer: Traceur = (rgba, l, h, o) => convertPixels(rgba, l, h, o);

afterEach(() => { vi.unstubAllGlobals(); chargerTraceur.mockReset(); });

const source = (i: { data: Uint8ClampedArray; largeur: number; hauteur: number }): SourceImage => ({ pixels: i.data, largeur: i.largeur, hauteur: i.hauteur });
const avec = (pretraitement: Traitement['pretraitement']): Traitement => ({ ...TRAITEMENT_DEFAUT, ...(pretraitement ? { pretraitement } : {}) });
const fidele = (t: Traitement): Traitement => ({ ...t, vecteurs: { mode: 'fidele', finesse: 'fine' } });
const reussite = (r: ImageConvertie | { erreur: string }): ImageConvertie => { if ('erreur' in r) throw new Error(r.erreur); return r; };

describe('traiterImage avec pretraitement', () => {
  it('debruiter et reduire les couleurs allege le trace d un logo bruite', async () => {
    installerCanvas();
    const brut = reussite(await traiterImage(source(logoBruite()), fidele(avec(undefined)), vtracer));
    const net = reussite(await traiterImage(source(logoBruite()), fidele(avec({ alpha: true, debruitage: 1, couleurs: 4, garderFond: true, lissage: 1 })), vtracer));
    // En mode fidele le grain devient des dizaines de formes ; reduit a quatre couleurs il n'en reste que quelques-unes.
    expect(brut.traces ?? 0).toBeGreaterThan(20);
    expect(net.traces ?? 0).toBeLessThan((brut.traces ?? 0) / 3);
    expect(net.svg.length).toBeLessThan(brut.svg.length);
    expect(net.pretraite?.couleurs).toBeLessThanOrEqual(4); // le blanc enferme dans l'anneau reste une couleur
    expect(net.pretraite?.couleursAvant).toBeGreaterThan(1000);
    expect(brut.pretraite).toBeUndefined();
  });

  it('rend le meme SVG a chaque fois, et ne touche pas la source', async () => {
    installerCanvas();
    const src = source(logoBruite()), avant = Array.from(src.pixels);
    const t = avec({ debruitage: 2, couleurs: 6, lissage: 2, nettete: 1, gamma: 1.2 });
    const a = reussite(await traiterImage(src, t, vtracer)), b = reussite(await traiterImage(src, t, vtracer));
    expect(a.svg).toBe(b.svg);
    expect(Array.from(src.pixels)).toEqual(avant);
  });

  it('agrandi x2 : le SVG garde la taille de la source, le plan la precision doublee, et l editeur l ouvre', async () => {
    installerCanvas();
    const r = reussite(await traiterImage(source(logo(60, 40)), avec({ agrandir: true }), vtracer));
    const racine = /<svg\b[^>]*>/.exec(r.svg)?.[0] ?? '';
    expect(racine).toMatch(/width="60"/);
    expect(racine).toMatch(/height="40"/);
    expect(racine).toMatch(/viewBox="0 0 120 80"/);
    expect(r.pretraite).toMatchObject({ largeur: 120, hauteur: 80, etapes: ['agrandir'] });
    expect('erreur' in lireDessin(r.svg)).toBe(false);
  });

  it('impose au traceur les N couleurs reduites, au-dela de huit', async () => {
    installerCanvas();
    let palette: string[] | undefined;
    const espion: Traceur = (rgba, l, h, o) => { palette = o.palette; return convertPixels(rgba, l, h, o); };
    const bariole: SourceImage = { pixels: new Uint8ClampedArray(30 * 30 * 4), largeur: 30, hauteur: 30 };
    for (let i = 0; i < 900; i++) bariole.pixels.set([(i % 10) * 25, Math.floor(i / 30) * 8, 90, 255], i * 4);
    reussite(await traiterImage(bariole, { ...avec({ couleurs: 12 }), detourer: false }, espion));
    expect(palette?.length).toBeGreaterThan(8);
    expect(palette?.length).toBeLessThanOrEqual(12);
  });

  it('la cle d un traitement distingue le pretraitement et ignore l ordre des champs', () => {
    expect(cleTraitement(avec({ debruitage: 1 }))).not.toBe(cleTraitement(avec(undefined)));
    expect(cleTraitement(avec({ debruitage: 1, couleurs: 4 }))).toBe(cleTraitement(avec({ couleurs: 4, debruitage: 1 })));
  });
});

describe('apercuPretraite et memo', () => {
  it('rend le PNG de ce que le traceur lira, avec ses couleurs et ses dimensions', () => {
    installerCanvas();
    const src = source(logoBruite(40, 30));
    const a = apercuPretraite(src, { detourer: false, tolerance: 0.08, portee: 'bord', pretraitement: { agrandir: true, couleurs: 4 } });
    expect([a.largeur, a.hauteur]).toEqual([80, 60]);
    expect(a.couleurs).toBeLessThanOrEqual(4);
    expect(a.couleursAvant).toBeGreaterThan(100);
    expect(pixelsDeDataUrl(a.url).length).toBe(80 * 60 * 4);
  });

  it('sans pretraitement, la source est rendue telle quelle, et un meme couple est memorise', () => {
    const src = source(logo());
    expect(pretraiterSource(src, undefined).image.data).toBe(src.pixels);
    const a = pretraiterSource(src, { debruitage: 1 });
    expect(pretraiterSource(src, { debruitage: 1 })).toBe(a);
    expect(pretraiterSource(src, { debruitage: 2 })).not.toBe(a);
  });
});

describe('convertirLot', () => {
  const fichier = (nom: string) => Object.assign(new Blob(['x']), { name: nom });
  const faux = (journal: string[], echoue?: string): OutilsLot => ({
    lire: async f => { journal.push('lire ' + (f as Blob & { name: string }).name); return (f as Blob & { name: string }).name === echoue ? { erreur: 'illisible' } : { pixels: new Uint8ClampedArray(4), largeur: 1, hauteur: 1 }; },
    traiter: async () => ({ svg: '<svg/>', traces: 2, duree: 5, couleurs: [], matriciel: false, detourage: null, source: { pixels: new Uint8ClampedArray(4), largeur: 1, hauteur: 1 }, traitement: TRAITEMENT_DEFAUT }),
    pause: async () => { journal.push('pause'); }
  });

  it('convertit dans l ordre, rend la main entre deux images, et garde le SVG sans les pixels', async () => {
    const journal: string[] = [], vus: ImageDuLot[][] = [];
    const fin = await convertirLot([fichier('a.png'), fichier('b.png')], TRAITEMENT_DEFAUT, l => vus.push([...l]), () => false, undefined, faux(journal));
    expect(journal.filter(j => j !== 'pause')).toEqual(['lire a.png', 'lire b.png']);
    expect(journal.filter(j => j === 'pause').length).toBeGreaterThanOrEqual(4);
    expect(fin.map(i => i.etat)).toEqual(['ok', 'ok']);
    expect(Object.keys(fin[0]?.resultat ?? {}).sort()).toEqual(['duree', 'resume', 'svg', 'traces']);
    // La liste annoncee passe par « en cours » avant « terminee ».
    expect(vus.some(l => l[0]?.etat === 'encours')).toBe(true);
  });

  it('une image qui echoue ne fait pas echouer les autres', async () => {
    const fin = await convertirLot([fichier('a.png'), fichier('mauvaise.png'), fichier('c.png')], TRAITEMENT_DEFAUT, () => undefined, () => false, undefined, faux([], 'mauvaise.png'));
    expect(fin.map(i => i.etat)).toEqual(['ok', 'erreur', 'ok']);
    expect(fin[1]?.erreur).toBe('illisible');
  });

  it('annuler arrete apres l image en cours et marque le reste', async () => {
    let annule = false;
    const journal: string[] = [];
    const outils = faux(journal);
    const fin = await convertirLot([fichier('a.png'), fichier('b.png'), fichier('c.png')], TRAITEMENT_DEFAUT, l => { if (l[0]?.etat === 'ok') annule = true; }, () => annule, undefined, outils);
    expect(fin.map(i => i.etat)).toEqual(['ok', 'annule', 'annule']);
    expect(journal.filter(j => j.startsWith('lire'))).toEqual(['lire a.png']);
  });
});
