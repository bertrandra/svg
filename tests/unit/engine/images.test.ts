// Les images integrees du modele v2 (ADR-0012, annexe 4 partie C, etape 12) : les octets et l'en-tete, la lecture riche (et le
// refus de la lecture plate, inchange), les bornes, les hostiles en mode riche, l'ecriture permise, la transformation, le poids
// d'historique, la descente vers les exporteurs, et l'aller-retour du projet.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  IMAGE_OCTETS_MAX, IMAGES_OCTETS_MAX, MSG_POINTS_IMAGE, decoderBase64, dessinableEnPoints, dimensionsImage, ecrireDessin, ecrireImage, lireAspectImage,
  lireDessin, poidsDessin, rectangleImage, rotation, transformer, transformerFeuille, translation, verifierDessin, verifierDonneesImage,
  type DessinSvg, type Forme, type ImageIntegree
} from '../../../src/engine/editionSvg.js';
import {
  MSG_IMAGE_CONTENU, MSG_IMAGE_ENTETE, MSG_IMAGE_EXTERIEURE, MSG_IMAGE_ILLISIBLE, MSG_IMAGE_LOURDE, MSG_IMAGE_PAS_BASE64, MSG_IMAGE_SVG,
  MSG_IMAGES_LOURDES, MSG_IMAGE_UNITE, msgImagePixels, msgImageType, msgTypeCorrige
} from '../../../src/engine/edition/fonctions/images.js';
import { aplatirPour, CAPACITES_PLAT, type Capacites } from '../../../src/engine/aplatir.js';
import { perteImages } from '../../../src/engine/descente/images.js';
import { CAPACITES_DXF, CAPACITES_EPS, CAPACITES_PDF, CAPACITES_PRODUCTION, CAPACITES_SVG_DECOUPE } from '../../../src/export/capacites.js';
import { lireImageProjet } from '../../../src/model/projetV2/image.js';
import { imageDuProjet, imageProjet, refusImagesProjet } from '../../../src/engine/projetV2/image.js';
import { nettoyerSvg } from '../../../src/util/svg.js';
import { violationsEcriture, violationsNettoyage } from '../securite/invariants.js';

const B64 = {
  png1: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mM4IacBAALAAQ/kvVIVAAAAAElFTkSuQmCC',
  png43: 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAGUlEQVR42mMQ0VhwQk4DQjLAWSIaCxiQZQDf+wt9qZvCzAAAAABJRU5ErkJggg==',
  gif32: 'R0lGODdhAwACAIEAACigPAAAAAAAAAAAACwAAAAAAwACAAAIBgABCBwYEAA7',
  webpVP8L: 'UklGRh4AAABXRUJQVlA4TBEAAAAvBIAAAAdQ2sKXov+BiOh/AAA=',
  webpVP8: 'UklGRjgAAABXRUJQVlA4ICwAAACQAQCdASoFAAMAAsBMJaACdLoAA5gA/u0q3/0Yf/hh/+GH99L+rsT4UFgAAA==',
  webpVP8X: 'UklGRlwAAABXRUJQVlA4WAoAAAAQAAAABgAAAQAAQUxQSAoAAAABB1DAiAhERP8DVlA4ICwAAACQAQCdASoHAAIAAsBMJaACdLoAA5gA/u0q3/0Yf/hh/+GH99L+rsT4UFgAAA=='
};
const V2 = resolve(__dirname, '../../fixtures/svg/v2');
const HOSTILE = resolve(__dirname, '../../fixtures/hostile');
const lire = (dossier: string, nom: string): string => readFileSync(resolve(dossier, nom), 'utf8');
const octets = (b64: string): Uint8Array => new Uint8Array(Buffer.from(b64, 'base64'));
const SVG = (corps: string, vb = '0 0 100 100') => '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="' + vb + '">' + corps + '</svg>';
const erreur = (r: ReturnType<typeof lireDessin>): string => ('erreur' in r ? r.erreur : '');
const riche = (svg: string): DessinSvg => { const r = lireDessin(svg, { modele: 'riche' }); if ('erreur' in r) throw new Error(r.erreur); return r.dessin; };
const png = (b64 = B64.png1) => 'data:image/png;base64,' + b64;
const jpeg = (): string => {
  const m = /data:image\/jpeg;base64,([^"]+)"/.exec(lire(V2, 'images-type-corrige.attendu.svg'));
  return (m?.[1] ?? '');
};

describe('les octets et l en-tete d une image', () => {
  it('decode le base64 comme Buffer, et refuse un texte qui n en est pas', () => {
    const t = new Uint8Array(300).map((_, i) => (i * 37 + 11) & 0xff);
    for (let n = 1; n < 40; n++) expect(Array.from(decoderBase64(Buffer.from(t.subarray(0, n)).toString('base64')) ?? []), String(n)).toEqual(Array.from(t.subarray(0, n)));
    for (const faux of ['', 'abc', 'ab=c', 'a=bc', '====', 'ab-_', 'abcé', 'ab c']) expect(decoderBase64(faux), faux).toBeNull();
  });

  it('lit la nature et les dimensions dans l en-tete de chaque format', () => {
    expect(dimensionsImage(octets(B64.png1))).toEqual({ nature: 'png', l: 1, h: 1 });
    expect(dimensionsImage(octets(B64.png43))).toEqual({ nature: 'png', l: 4, h: 3 });
    expect(dimensionsImage(octets(jpeg()))).toEqual({ nature: 'jpeg', l: 6, h: 4 });
    expect(dimensionsImage(octets(B64.gif32))).toEqual({ nature: 'gif', l: 3, h: 2 });
    expect(dimensionsImage(octets(B64.webpVP8L))).toEqual({ nature: 'webp', l: 5, h: 3 });
    expect(dimensionsImage(octets(B64.webpVP8))).toEqual({ nature: 'webp', l: 5, h: 3 });
    expect(dimensionsImage(octets(B64.webpVP8X))).toEqual({ nature: 'webp', l: 7, h: 2 });
  });

  it('rend null sans dimensions lisibles, et termine sur un en-tete piege', () => {
    for (const o of [[], [0x89, 0x50], [0xff, 0xd8, 0xff], [0xff, 0xd8, ...Array<number>(10_000).fill(0xff)], [0x42, 0x4d, ...Array<number>(60).fill(0)], Array.from('<svg/>', c => c.charCodeAt(0))]) {
      expect(dimensionsImage(new Uint8Array(o))).toBeNull();
    }
    // Un GIF de 0 x 0 n'a pas de dimensions.
    expect(dimensionsImage(new Uint8Array([...Array.from('GIF89a', c => c.charCodeAt(0)), 0, 0, 0, 0, 0, 0, 0]))).toBeNull();
  });
});

describe('la verification des donnees d une image', () => {
  it('rend les donnees ecrites : le type d apres les octets, sans blanc', () => {
    const v = verifierDonneesImage('  DATA:image/PNG;base64,' + B64.png43.slice(0, 20) + '\n ' + B64.png43.slice(20) + ' ');
    expect(v).toEqual({ donnees: png(B64.png43), nature: 'png', l: 4, h: 3, octets: Buffer.from(B64.png43, 'base64').length });
    expect(verifierDonneesImage('data:image/png;base64,' + jpeg())).toMatchObject({ nature: 'jpeg', annonce: 'png', donnees: 'data:image/jpeg;base64,' + jpeg() });
    expect(verifierDonneesImage('data:image/jpg;base64,' + jpeg())).not.toHaveProperty('annonce');
  });

  it('refuse en nommant : adresse, SVG, type, base64, contenu, en-tete, poids, pixels', () => {
    const refus = (a: string) => { const v = verifierDonneesImage(a); return 'refus' in v ? v.refus : ''; };
    expect(refus('https://exemple.invalid/p.png')).toBe(MSG_IMAGE_EXTERIEURE);
    expect(refus('javascript:alert(1)')).toBe(MSG_IMAGE_EXTERIEURE);
    expect(refus('data:image/svg+xml;base64,PHN2Zy8+')).toBe(MSG_IMAGE_SVG);
    expect(refus('data:image/png;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64'))).toBe(MSG_IMAGE_SVG);
    expect(refus('data:image/bmp;base64,Qk0=')).toBe(msgImageType('image/bmp'));
    expect(refus('data:text/html"onload=x;base64,AAAA')).toBe(msgImageType('text/html"onload=x'));
    expect(msgImageType('text/html"onload=x')).not.toContain('onload');
    expect(refus('data:image/png,%89PNG')).toBe(MSG_IMAGE_PAS_BASE64);
    expect(refus('data:image/png;base64,AAA')).toBe(MSG_IMAGE_ILLISIBLE);
    expect(refus('data:image/png;base64,' + Buffer.from('bonjour, ceci n’est pas une image').toString('base64'))).toBe(MSG_IMAGE_CONTENU);
    expect(refus('data:image/png;base64,' + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]).toString('base64'))).toBe(MSG_IMAGE_ENTETE);
    expect(refus('data:image/png;base64,' + 'A'.repeat(Math.ceil((IMAGE_OCTETS_MAX + 3) / 3) * 4))).toBe(MSG_IMAGE_LOURDE);
    const bombe = Buffer.from(B64.png1, 'base64');
    bombe.writeUInt32BE(65000, 16); bombe.writeUInt32BE(65000, 20);
    expect(refus(png(bombe.toString('base64')))).toBe(msgImagePixels(65000, 65000));
    // 8 000 x 8 000 tient, une ligne de plus non.
    bombe.writeUInt32BE(8000, 16); bombe.writeUInt32BE(8000, 20);
    expect('refus' in verifierDonneesImage(png(bombe.toString('base64')))).toBe(false);
    bombe.writeUInt32BE(8001, 20);
    expect(refus(png(bombe.toString('base64')))).toBe(msgImagePixels(8000, 8001));
  });

  it('lit l aspect sous sa forme courte, le defaut absent', () => {
    expect(lireAspectImage(undefined)).toBeUndefined();
    expect(lireAspectImage('xMidYMid meet')).toBeUndefined();
    expect(lireAspectImage(' defer  xMinYMax   slice ')).toBe('xMinYMax slice');
    expect(lireAspectImage('none')).toBe('none');
    expect(lireAspectImage('xMinYMin meet')).toBe('xMinYMin');
    for (const faux of ['xminymin', 'none slice meet', 'url(#a)', 'xMidYMid fill']) expect(lireAspectImage(faux), faux).toBeUndefined();
  });
});

describe('la lecture des images', () => {
  it('la lecture plate refuse chaque fixture v2 d images avec la phrase d aujourd hui', () => {
    const entrees = readdirSync(V2).filter(n => /^images-.*\.svg$/.test(n));
    expect(entrees.length).toBeGreaterThanOrEqual(16);
    for (const n of entrees) expect(erreur(lireDessin(lire(V2, n))), n).toMatch(/contient une image[ ,:]/);
  });

  it('une image devient une feuille : son rectangle en d, ni fond ni contour, et l invariant tient', () => {
    const d = riche(lire(V2, 'images-png.svg'));
    expect(verifierDessin(d)).toEqual([]);
    expect(d.formes.map(f => [f.id, f.image ? 'image' : 'chemin'])).toEqual([['f1', 'chemin'], ['f2', 'image'], ['f3', 'image'], ['f4', 'chemin']]);
    const [f2, f3] = [d.formes[1], d.formes[2]];
    expect(f2).toMatchObject({ remplissage: null, contour: null, epaisseur: 0, opacite: 1, visible: true, verrouille: false });
    expect(f2?.image).toEqual({ donnees: png(B64.png43), x: 10, y: 20, l: 40, h: 30, aspect: 'none' });
    expect(f2?.d).toEqual([{ c: 'M', p: [10, 20] }, { c: 'L', p: [50, 20] }, { c: 'L', p: [50, 50] }, { c: 'L', p: [10, 50] }, { c: 'Z', p: [] }]);
    expect(f3?.opacite).toBe(0.5);
  });

  it('la transformation de l element et de ses ancetres se compose en matrice', () => {
    const d = riche(SVG('<g transform="translate(10 0)"><image transform="rotate(90)" href="' + png() + '" width="2" height="1"/></g>'));
    expect(d.formes[0]?.image?.matrice?.map(v => Math.round(v * 1e9) / 1e9)).toEqual([0, 1, -1, 0, 10, 0]);
    expect(d.formes[0]?.d.map(c => c.p.map(v => Math.round(v * 1e9) / 1e9))).toEqual([[10, 0], [10, 2], [9, 2], [9, 0], []]);
  });

  it('dit le type corrige, et ne dit rien quand il n y a rien a dire', () => {
    const r = lireDessin(lire(V2, 'images-type-corrige.svg'), { modele: 'riche' });
    expect('ignores' in r ? r.ignores : []).toEqual([msgTypeCorrige('png', 'jpeg')]);
    const p = lireDessin(lire(V2, 'images-png.svg'), { modele: 'riche' });
    expect('ignores' in p ? p.ignores : null).toEqual([]);
  });

  it('l enveloppe « image telle quelle » du convertisseur s ouvre en riche', () => {
    const d = riche(lire(V2, 'images-enveloppe.svg'));
    expect(d.formes).toHaveLength(1);
    expect(d.formes[0]?.image).toEqual({ donnees: png(B64.png43), x: 0, y: 0, l: 4, h: 3 });
  });

  it('une image masquee, cachee, de taille nulle ou ecrasee ne se lit pas ; un clone <use> se deplie', () => {
    const img = (a = '') => '<image href="' + png() + '" width="5" height="5"' + a + '/>';
    const chemin = '<path d="M0 0h1v1h-1z"/>';
    for (const a of [' display="none"', ' visibility="hidden"', ' width="0"', ' height="-3"', ' transform="scale(0 1)"']) {
      expect(riche(SVG(chemin + img(a).replace(/ (width|height)="5"(?=.*\1=)/, ''))).formes.filter(f => f.image), a).toEqual([]);
    }
    const d = riche(SVG('<defs><image id="i" href="' + png() + '" width="5" height="5"/></defs><use href="#i" x="10"/><use href="#i" x="20"/>'));
    expect(d.formes.map(f => f.image?.matrice?.[4])).toEqual([10, 20]);
  });

  it('refuse une image a masque comme une forme, enveloppe une image a decoupe dans un groupe (etape 5), et refuse une unite qu on ne calcule pas', () => {
    expect(erreur(lireDessin(SVG('<image href="' + png() + '" width="5" height="5" mask="url(#m)"/>'), { modele: 'riche' }))).toContain('un masque ou une découpe');
    const decoupee = riche(SVG('<defs><clipPath id="c"><rect width="3" height="3"/></clipPath></defs><image href="' + png() + '" width="5" height="5" clip-path="url(#c)"/>'));
    expect(decoupee.formes.map(f => [!!f.image, f.parent])).toEqual([[true, 'g1']]);
    expect(decoupee.groupes?.g1?.decoupe?.contenu.formes).toHaveLength(1);
    expect(erreur(lireDessin(SVG('<image href="' + png() + '" width="5mm" height="5"/>'), { modele: 'riche' }))).toContain(MSG_IMAGE_UNITE);
  });

  it('borne les octets de toutes les images d un dessin, clones compris, sans depasser son budget', () => {
    const lourde = 'data:image/png;base64,' + B64.png43.slice(0, -2) + 'A'.repeat(Math.floor((IMAGE_OCTETS_MAX - 1000) / 3) * 4) + '==';
    const v = verifierDonneesImage(lourde);
    expect('refus' in v ? v.refus : 'ok').toBe('ok');
    const svg = SVG('<defs><image id="i" href="' + lourde + '" width="5" height="5"/></defs>' + '<use href="#i"/>'.repeat(5) + '<path d="M0 0h1v1h-1z"/>');
    const t0 = performance.now();
    expect(erreur(lireDessin(svg, { modele: 'riche' }))).toContain(MSG_IMAGES_LOURDES);
    expect(IMAGES_OCTETS_MAX / IMAGE_OCTETS_MAX).toBe(4);
    const geante = SVG('<image href="data:image/png;base64,' + 'A'.repeat(3 * IMAGE_OCTETS_MAX) + '" width="5" height="5"/>');
    expect(erreur(lireDessin(geante, { modele: 'riche' }))).toContain(MSG_IMAGE_LOURDE);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

describe('les hostiles d images en mode riche', () => {
  const ATTENDUS: Readonly<Record<string, readonly string[]>> = {
    'v2-images-bombe-pixels.svg': [msgImagePixels(65000, 65000), msgImagePixels(65535, 65535), msgImagePixels(16777216, 16777216)],
    'v2-images-octets-mensongers.svg': [MSG_IMAGE_CONTENU, MSG_IMAGE_SVG, MSG_IMAGE_ENTETE],
    'v2-images-adresses-actives.svg': [MSG_IMAGE_EXTERIEURE, msgImageType('text/html'), MSG_IMAGE_PAS_BASE64, MSG_IMAGE_SVG],
    'v2-images-base64-abime.svg': [MSG_IMAGE_ILLISIBLE],
    'v2-images-jpeg-segments-pieges.svg': [MSG_IMAGE_ENTETE]
  };

  it('chaque fichier v2-images-* a ses phrases attendues', () => {
    expect(readdirSync(HOSTILE).filter(n => n.startsWith('v2-images-')).sort()).toEqual(Object.keys(ATTENDUS).sort());
  });

  for (const [nom, phrases] of Object.entries(ATTENDUS)) {
    it(nom + ' : refuse en riche, brut et apres nettoyage, en nommant', () => {
      const brut = lire(HOSTILE, nom);
      const e = erreur(lireDessin(brut, { modele: 'riche' }));
      for (const p of phrases) expect(e, p).toContain(p);
      const net = nettoyerSvg(brut);
      if (net) expect(erreur(lireDessin(net.svg, { modele: 'riche' }))).not.toBe('');
    });
  }
});

describe('l ecriture des images', () => {
  const entrees = readdirSync(V2).filter(n => /^images-.*\.svg$/.test(n) && !n.endsWith('.attendu.svg'));

  it('chaque ecriture passe la specification de l ecriture, le nettoyage la laisse intacte', () => {
    for (const n of [...entrees, ...readdirSync(V2).filter(x => /^images-.*\.attendu\.svg$/.test(x))]) {
      const e = ecrireDessin(riche(lire(V2, n)), 3);
      expect(violationsEcriture(e), n).toEqual([]);
      expect(violationsNettoyage(e), n).toEqual([]);
      expect(nettoyerSvg(e)?.svg, n).toBe(e);
    }
  });

  it('pose xmlns:xlink seulement s il y a une image, et la specification refuse un attribut libre sur une image', () => {
    const e = ecrireDessin(riche(lire(V2, 'images-png.svg')), 3);
    expect(e.startsWith('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox=')).toBe(true);
    expect(violationsEcriture(e.replace('<image ', '<image onload="x" '))).toContain('onload refuse par le modele v2 : x');
    expect(violationsEcriture(e.replace(/xlink:href="data:image\/png;base64,/, 'xlink:href="https://x/'))[0]).toMatch(/^xlink:href refuse par le modele v2 : https/);
  });

  it('n ecrit rien d une image dont les donnees ou l aspect ne sont pas de la forme lue', () => {
    const f: Forme = { id: 'f1', d: [], remplissage: null, contour: null, epaisseur: 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false, image: { donnees: png(), x: 0, y: 0, l: 1, h: 1 } };
    expect(ecrireImage(f, 3)).toContain('<image xlink:href="data:image/png;base64,');
    for (const image of [
      { donnees: 'https://exemple.invalid/p.png', x: 0, y: 0, l: 1, h: 1 }, { donnees: png() + '" onload="x', x: 0, y: 0, l: 1, h: 1 },
      { donnees: png(), x: 0, y: 0, l: 1, h: 1, aspect: 'none" onload="x' }, { donnees: png(), x: Number.NaN, y: 0, l: 1, h: 1 }
    ]) expect(ecrireImage({ ...f, image }, 3)).toBe('');
    const { image: _i, ...chemin } = f;
    void _i;
    expect(ecrireImage(chemin, 3)).toBeNull();
  });

  it('plie une matrice qui, arrondie, n est qu une translation et une echelle permise ; garde les autres', () => {
    const f = (image: ImageIntegree): Forme => ({ id: 'f1', d: rectangleImage(image), remplissage: null, contour: null, epaisseur: 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false, image });
    const base = { donnees: png(), x: 1, y: 2, l: 10, h: 5 };
    expect(ecrireImage(f({ ...base, matrice: [2, 1e-9, 0, 2, 3, 4] }), 3)).toMatch(/ x="5" y="8" width="20" height="10"\/>$/);
    expect(ecrireImage(f({ ...base, matrice: [2, 0, 0, 3, 0, 0] }), 3)).toContain(' transform="matrix(2 0 0 3 0 0)"');
    expect(ecrireImage(f({ ...base, matrice: [2, 0, 0, 3, 0, 0], aspect: 'none' }), 3)).toMatch(/ x="2" y="6" width="20" height="15" preserveAspectRatio="none"\/>$/);
    expect(ecrireImage(f({ ...base, matrice: [-1, 0, 0, 1, 0, 0] }), 3)).toContain(' transform="matrix(-1 0 0 1 0 0)"');
  });
});

describe('les images et les operations', () => {
  const d = riche(lire(V2, 'images-png.svg'));
  const img = d.formes[1] as Forme;

  it('la transformation compose la matrice et rend exactement le rectangle', () => {
    const m = rotation(30, 5, 5);
    const t = transformerFeuille(img, m);
    expect(t.image?.matrice).toEqual(m);
    expect(t.d).toEqual(rectangleImage(t.image as ImageIntegree));
    // Aller puis revenir : la matrice redevient l'identite exacte, et disparait.
    const r = transformer(transformer(d, ['f2'], translation(3, 4)), ['f2'], translation(-3, -4)).formes[1];
    expect(r?.image).toEqual(img.image);
  });

  it('pese dans l historique : 50 par image et ses octets par 10 000', () => {
    const n = (img.image?.donnees.length ?? 0) * 0.75;
    expect(poidsDessin(d)).toBe(4 + 2 * 50 + Math.round(n / 10000) + Math.round(((d.formes[2]?.image?.donnees.length ?? 0) * 0.75) / 10000));
  });

  it('les points d une image ne se modifient pas, ceux d un chemin si', () => {
    expect(dessinableEnPoints(img)).toBe(false);
    expect(dessinableEnPoints(d.formes[0] as Forme)).toBe(true);
    expect(MSG_POINTS_IMAGE).toMatch(/^Les points d’une image ne se modifient pas/);
  });
});

describe('la descente des images', () => {
  const d = riche(lire(V2, 'images-png.svg'));

  it('chaque exporteur de traces abandonne les images et le dit ; le reste est intact', () => {
    for (const c of [CAPACITES_PLAT, CAPACITES_SVG_DECOUPE, CAPACITES_PDF, CAPACITES_DXF, CAPACITES_EPS, CAPACITES_PRODUCTION]) {
      const r = aplatirPour(d, c);
      expect(r.dessin.formes.map(f => f.id)).toEqual(['f1', 'f4']);
      expect(r.pertes).toEqual([perteImages(2)]);
      expect(r.dessin.formes[0]).toBe(d.formes[0]);
    }
    expect(perteImages(1)).toBe('une image (ce format ne porte que des tracés : elle n’est pas exportée)');
  });

  it('une image masquee part sans perte dite ; un exporteur natif la garde (etape 13)', () => {
    const masquee: DessinSvg = { ...d, formes: d.formes.map(f => (f.image ? { ...f, visible: false } : f)) };
    expect(aplatirPour(masquee, CAPACITES_PDF).pertes).toEqual([]);
    const natif: Capacites = { ...CAPACITES_PDF, images: 'natif' };
    // Natif : la regle la laisse ; le filet la retire tant qu'aucun exporteur ne sait l'ecrire (DessinPlat reste plat).
    expect(aplatirPour(d, natif).pertes).toEqual(['les images']);
  });
});

describe('le projet porte l image', () => {
  const d = riche(lire(V2, 'images-rotation.svg'));

  it('l aller-retour est exact, a pleine precision, et le SVG ecrit est le meme', () => {
    for (const f of d.formes) {
      const img = f.image as ImageIntegree;
      const p = imageProjet(img);
      const json = JSON.parse(JSON.stringify(p)) as unknown;
      const lu = lireImageProjet(json);
      if ('erreur' in lu) throw new Error(lu.erreur);
      expect(lu.image).toEqual(p);
      const r = imageDuProjet(lu.image);
      if ('erreur' in r) throw new Error(r.erreur);
      expect(r.image).toEqual(img);
      expect(r.d).toEqual(f.d);
    }
    const rouvert: DessinSvg = { ...d, formes: d.formes.map(f => { const r = imageDuProjet(imageProjet(f.image as ImageIntegree)); return 'erreur' in r ? f : { ...f, image: r.image, d: r.d }; }) };
    expect(ecrireDessin(rouvert, 3)).toBe(ecrireDessin(d, 3));
  });

  it('refuse une image de projet mal formee, ou dont les octets mentent', () => {
    const p = imageProjet(d.formes[0]?.image as ImageIntegree);
    const err = (v: unknown) => { const r = lireImageProjet(v); return 'erreur' in r ? r.erreur : ''; };
    expect(err(null)).not.toBe('');
    expect(err({ ...p, donnees: 'https://exemple.invalid/p.png' })).toContain('les données d’une image');
    expect(err({ ...p, donnees: png().slice(0, -1) })).toContain('les données d’une image');
    expect(err({ ...p, l: 0 })).toContain('la taille');
    expect(err({ ...p, x: Number.POSITIVE_INFINITY })).toContain('la position');
    expect(err({ ...p, matrice: [0, 0, 0, 0, 1, 1] })).toContain('écrase le plan');
    expect(err({ ...p, aspect: 'xMidYMid' })).toContain('l’aspect');
    const svgEnPng = { ...p, donnees: 'data:image/png;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64') };
    expect('erreur' in lireImageProjet(svgEnPng)).toBe(false);
    const r = imageDuProjet(svgEnPng);
    expect('erreur' in r ? r.erreur : '').toBe('Ce projet contient ' + MSG_IMAGE_SVG + '.');
    const corrige = imageDuProjet({ ...p, donnees: 'data:image/png;base64,' + jpeg() });
    expect('erreur' in corrige ? corrige.erreur : '').toContain('type annoncé');
    expect(refusImagesProjet([{ octets: IMAGES_OCTETS_MAX }])).toBeNull();
    expect(refusImagesProjet([{ octets: IMAGES_OCTETS_MAX }, { octets: 1 }])).toContain('16 Mo');
  });
});
