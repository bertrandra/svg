import { describe, it, expect, vi, afterEach } from 'vitest';
import { convertPixels } from '@visioncortex/vtracer';
import { apercuDetoure, COTE_MAX, lireSource, resumeConversion, traiterImage, versPng, type ImageConvertie, type SourceImage } from '../../../src/io/image.js';
import { TRACES_MAX, TRAITEMENT_DEFAUT, type Traceur, type Traitement } from '../../../src/engine/vectorisation.js';
import { lireDessin } from '../../../src/engine/editionSvg.js';
import { installerCanvas, installerImage, peindre, pixelsDeDataUrl, type ToileFausse } from './navigateur-factice.js';

// Le chargeur du traceur est remplace : le vrai injecte une balise <script> dans une page (voir
// chargeurTraceur.test.ts pour sa propre logique). Les tests qui veulent un vrai traceur le passent en parametre.
const chargerTraceur = vi.hoisted(() => vi.fn());
vi.mock('../../../src/io/vtracer.js', () => ({ chargerTraceur }));

// Le traceur du paquet tel quel, pour Node : le navigateur prend le meme WebAssembly (ADR-0002).
const vtracer: Traceur = (rgba, l, h, o) => convertPixels(rgba, l, h, o);

afterEach(() => {
  vi.unstubAllGlobals();
  chargerTraceur.mockReset();
});

const ROUGE = [200, 30, 40, 255] as const;
const BLANC = [255, 255, 255, 255] as const;
const TRANSPARENT = [0, 0, 0, 0] as const;
const L = 60, H = 40;

/** Un disque rouge sur fond blanc, le cas type d'un logo depose. */
function disque(): SourceImage {
  return { pixels: peindre(L, H, (x, y) => ((x - 30) ** 2 + (y - 20) ** 2 < 14 ** 2 ? ROUGE : BLANC)), largeur: L, hauteur: H };
}

const sansVecteurs: Traitement = { ...TRAITEMENT_DEFAUT, vecteurs: null };
const avecVecteurs = (surcharge: Partial<Traitement> = {}): Traitement => ({ ...TRAITEMENT_DEFAUT, vecteurs: { mode: 'aplats', finesse: 'normale' }, ...surcharge });

const reussite = (r: ImageConvertie | { erreur: string }): ImageConvertie => {
  if ('erreur' in r) throw new Error(r.erreur);
  return r;
};

describe('apercuDetoure', () => {
  it('rend en PNG l image telle que le detourage la laisserait : le fond transparent, le disque intact', () => {
    installerCanvas();
    const source = disque();
    const rgba = pixelsDeDataUrl(apercuDetoure(source, { detourer: true, tolerance: 0.08, portee: 'bord' }));
    expect(rgba.length).toBe(L * H * 4);
    expect(rgba[3]).toBe(0);
    expect(Array.from(rgba.subarray(((20 * L) + 30) * 4, ((20 * L) + 30) * 4 + 4))).toEqual([200, 30, 40, 255]);
    // La source garde son fond : le detourage se rejoue toujours depuis les pixels d'origine.
    expect(source.pixels[3]).toBe(255);
  });

  it('rend l image telle quelle quand le detourage est coupe', () => {
    installerCanvas();
    const source = disque();
    const rgba = pixelsDeDataUrl(apercuDetoure(source, { detourer: false, tolerance: 0.08, portee: 'bord' }));
    expect(Array.from(rgba)).toEqual(Array.from(source.pixels));
  });

  it('efface le fond ou qu il soit avec la portee « partout », et le garde enferme avec « bord »', () => {
    installerCanvas();
    // Un anneau rouge : le blanc du centre n'est pas relie au bord.
    const anneau: SourceImage = { pixels: peindre(L, H, (x, y) => { const d = (x - 30) ** 2 + (y - 20) ** 2; return d < 14 ** 2 && d > 6 ** 2 ? ROUGE : BLANC; }), largeur: L, hauteur: H };
    const centre = ((20 * L) + 30) * 4 + 3;
    expect(pixelsDeDataUrl(apercuDetoure(anneau, { detourer: true, tolerance: 0.08, portee: 'bord' }))[centre]).toBe(255);
    expect(pixelsDeDataUrl(apercuDetoure(anneau, { detourer: true, tolerance: 0.08, portee: 'partout' }))[centre]).toBe(0);
  });
});

describe('traiterImage, enveloppee', () => {
  it('enveloppe l image detouree dans un SVG que l editeur refuse, en le nommant', async () => {
    installerCanvas();
    const r = reussite(await traiterImage(disque(), sansVecteurs));
    expect(r.matriciel).toBe(true);
    expect(r.traces).toBeNull();
    expect(r.svg).toContain('viewBox="0 0 60 40"');
    expect(r.svg).toMatch(/<image href="data:image\/png;base64,[A-Za-z0-9+/=]+" width="60" height="40"\/>/);
    expect(r.detourage?.fond).toBe('#ffffff');
    expect(r.duree).toBeGreaterThanOrEqual(1);
    const lu = lireDessin(r.svg);
    expect('erreur' in lu && lu.erreur).toContain('une image');
  });

  it('ne dit rien du detourage quand il n a rien retire (bords deja transparents)', async () => {
    installerCanvas();
    const bords = (x: number, y: number) => (x === 0 || y === 0 || x === L - 1 || y === H - 1 ? TRANSPARENT : ROUGE);
    const deja: SourceImage = { pixels: peindre(L, H, bords), largeur: L, hauteur: H };
    const r = reussite(await traiterImage(deja, sansVecteurs));
    expect(r.detourage).toBeNull();
    expect(resumeConversion(r)).toContain('aucun fond à retirer');
  });
});

describe('traiterImage, vectorisee (vtracer reel)', () => {
  it('trace le disque rouge, sans le fond retire, et rend le SVG que l editeur ouvre', async () => {
    installerCanvas();
    const r = reussite(await traiterImage(disque(), avecVecteurs(), vtracer));
    expect(r.matriciel).toBe(false);
    expect(r.traces).toBe(1);
    expect(r.svg).toContain('viewBox="0 0 60 40"');
    expect(r.svg).toMatch(/<path[^>]*fill="#c81e28"/i);
    expect(r.svg).not.toMatch(/fill="#ffffff"/i);
    expect(r.couleurs.map(c => c.hex)).toEqual(['#c81e28']);
    expect(r.detourage?.fond).toBe('#ffffff');
    const lu = lireDessin(r.svg);
    expect('dessin' in lu && lu.dessin.formes.length).toBe(1);
  });

  it('rend le meme SVG au meme calcul, et laisse la source intacte (ADR-0002)', async () => {
    installerCanvas();
    const source = disque();
    const avant = Array.from(source.pixels);
    const a = reussite(await traiterImage(source, avecVecteurs(), vtracer));
    const b = reussite(await traiterImage(source, avecVecteurs(), vtracer));
    expect(b.svg).toBe(a.svg);
    expect(Array.from(source.pixels)).toEqual(avant);
  });

  it('trace aussi le fond quand le detourage est coupe', async () => {
    installerCanvas();
    const r = reussite(await traiterImage(disque(), avecVecteurs({ detourer: false }), vtracer));
    expect(r.detourage).toBeNull();
    expect(r.traces).toBe(2);
    expect(r.svg).toMatch(/fill="#ffffff"/i);
  });

  it('refuse, sans appeler le traceur, une image que le detourage a entierement retiree', async () => {
    installerCanvas();
    const vide: SourceImage = { pixels: peindre(20, 20, () => BLANC), largeur: 20, hauteur: 20 };
    const traceur = vi.fn<Traceur>();
    const r = await traiterImage(vide, avecVecteurs(), traceur);
    expect('erreur' in r && r.erreur).toContain('Rien à tracer');
    expect(traceur).not.toHaveBeenCalled();
    expect(chargerTraceur).not.toHaveBeenCalled();
  });
});

describe('traiterImage, les refus', () => {
  const svgDe = (n: number) => '<svg width="60" height="40">' + '<path d="M0,0 L1,1" fill="#c81e28"/>'.repeat(n) + '</svg>';

  it('dit la raison quand le vectoriseur ne se charge pas', async () => {
    installerCanvas();
    chargerTraceur.mockRejectedValue(new Error('WebAssembly bloque par la page hote'));
    const r = await traiterImage(disque(), avecVecteurs());
    expect('erreur' in r && r.erreur).toContain('ne s’est pas chargé');
    expect('erreur' in r && r.erreur).toContain('WebAssembly bloque par la page hote');
  });

  it('prend le traceur charge a la demande quand on ne lui en passe pas', async () => {
    installerCanvas();
    chargerTraceur.mockResolvedValue(vtracer);
    expect(reussite(await traiterImage(disque(), avecVecteurs())).traces).toBe(1);
    expect(chargerTraceur).toHaveBeenCalledTimes(1);
  });

  it('dit la raison quand le traceur echoue sur l image', async () => {
    installerCanvas();
    const r = await traiterImage(disque(), avecVecteurs(), () => { throw new Error('panic dans vtracer'); });
    expect('erreur' in r && r.erreur).toContain('La vectorisation a échoué');
    expect('erreur' in r && r.erreur).toContain('panic dans vtracer');
  });

  it('refuse une sortie qui n est pas un SVG, et une sortie sans aucun trace', async () => {
    installerCanvas();
    const nonSvg = await traiterImage(disque(), avecVecteurs(), () => 'pas un svg');
    expect('erreur' in nonSvg && nonSvg.erreur).toContain('rien donné de lisible');
    const vide = await traiterImage(disque(), avecVecteurs(), () => svgDe(0));
    expect('erreur' in vide && vide.erreur).toContain('Rien à tracer');
  });

  it('refuse au-dela de ' + TRACES_MAX + ' traces, avec le conseil d un grain plus lisse', async () => {
    installerCanvas();
    const juste = reussite(await traiterImage(disque(), avecVecteurs(), () => svgDe(TRACES_MAX)));
    expect(juste.traces).toBe(TRACES_MAX);
    const trop = await traiterImage(disque(), avecVecteurs(), () => svgDe(TRACES_MAX + 1));
    expect('erreur' in trop && trop.erreur).toContain((TRACES_MAX + 1) + ' tracés');
    expect('erreur' in trop && trop.erreur).toContain('grain plus lisse');
  });

  it('coupe la raison technique a 160 caracteres', async () => {
    installerCanvas();
    const r = await traiterImage(disque(), avecVecteurs(), () => { throw new Error('x'.repeat(500)); });
    const message = 'erreur' in r ? r.erreur : '';
    expect(message).toContain('x'.repeat(160));
    expect(message).not.toContain('x'.repeat(161));
  });
});

describe('lireSource', () => {
  it('garde une image petite a sa taille', async () => {
    installerCanvas();
    installerImage({ largeur: 120, hauteur: 80 });
    const s = await lireSource(new Blob(['x']));
    expect('erreur' in s).toBe(false);
    if ('erreur' in s) return;
    expect([s.largeur, s.hauteur]).toEqual([120, 80]);
    expect(s.pixels.length).toBe(120 * 80 * 4);
    expect(Array.from(s.pixels.subarray(0, 4))).toEqual([200, 30, 40, 255]);
  });

  it('reduit une grande image a ' + COTE_MAX + ' sur son grand cote, proportions gardees', async () => {
    installerCanvas();
    installerImage({ largeur: 4000, hauteur: 1000 });
    const s = await lireSource(new Blob(['x']));
    expect('erreur' in s).toBe(false);
    if ('erreur' in s) return;
    expect([s.largeur, s.hauteur]).toEqual([COTE_MAX, 256]);
  });

  it('ne rend jamais une dimension nulle', async () => {
    installerCanvas();
    installerImage({ largeur: 10000, hauteur: 3 });
    const s = await lireSource(new Blob(['x']));
    expect('erreur' in s ? null : [s.largeur, s.hauteur]).toEqual([COTE_MAX, 1]);
  });

  it('dit quels formats se deposent quand l image ne se lit pas', async () => {
    installerCanvas();
    installerImage({ largeur: 1, hauteur: 1, erreur: true });
    const s = await lireSource(new Blob(['x']));
    expect('erreur' in s && s.erreur).toContain('PNG, un JPG, un GIF ou un WebP');
  });
});

describe('versPng', () => {
  it('rend un PNG a la largeur voulue, la hauteur suivant le plan', async () => {
    const { toiles } = installerCanvas();
    installerImage({ largeur: 200, hauteur: 100 });
    const png = await versPng('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"/>', 300);
    expect(png.type).toBe('image/png');
    const t = toiles[toiles.length - 1] as ToileFausse;
    expect([t.width, t.height]).toEqual([300, 150]);
    expect(t.dessins).toEqual([{ l: 300, h: 150 }]);
  });

  it('arrondit la largeur et garde au moins un pixel', async () => {
    const { toiles } = installerCanvas();
    installerImage({ largeur: 400, hauteur: 10 });
    await versPng('<svg/>', 0.2);
    const t = toiles[toiles.length - 1] as ToileFausse;
    expect([t.width, t.height]).toEqual([1, 1]);
  });

  it('echoue en le disant quand le navigateur refuse le rendu', async () => {
    installerCanvas({ refuseBlob: true });
    installerImage({ largeur: 10, hauteur: 10 });
    await expect(versPng('<svg/>', 10)).rejects.toThrow('rendu refusé');
  });
});

describe('resumeConversion', () => {
  const base: ImageConvertie = {
    svg: 'x'.repeat(4096), couleurs: [], matriciel: false, detourage: null, source: disque(), traitement: TRAITEMENT_DEFAUT, traces: 3, duree: 1
  };

  it('dit le fond retire, le nombre de traces et le poids', () => {
    const r = resumeConversion({ ...base, detourage: { fond: '#ffffff', retires: 1000, part: 0.417 } });
    expect(r).toBe('fond #FFFFFF retiré depuis le bord (42 %) · 3 tracés vectoriels · 4 Ko');
  });

  it('dit « partout » pour la portee globale', () => {
    const r = resumeConversion({ ...base, traitement: { ...TRAITEMENT_DEFAUT, portee: 'partout' }, detourage: { fond: '#00ff00', retires: 5, part: 0.01 } });
    expect(r).toContain('fond #00FF00 retiré partout (1 %)');
  });

  it('distingue « rien a retirer » de « fond garde »', () => {
    expect(resumeConversion(base)).toContain('aucun fond à retirer');
    expect(resumeConversion({ ...base, traitement: { ...TRAITEMENT_DEFAUT, detourer: false } })).toContain('fond gardé');
  });

  it('met au singulier un seul trace, et dit l image enveloppee', () => {
    expect(resumeConversion({ ...base, traces: 1 })).toContain('1 tracé vectoriel ·');
    const enveloppee = resumeConversion({ ...base, traces: null, matriciel: true, svg: 'x'.repeat(10) });
    expect(enveloppee).toContain('image enveloppée');
    expect(enveloppee.endsWith('1 Ko')).toBe(true);
  });
});
