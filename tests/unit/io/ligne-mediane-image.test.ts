import { describe, it, expect, vi, afterEach } from 'vitest';
import { resumeConversion, traiterImage, type ImageConvertie, type SourceImage } from '../../../src/io/image.js';
import { TRAITEMENT_DEFAUT, type Traitement } from '../../../src/engine/vectorisation.js';
import { lireDessin } from '../../../src/engine/editionSvg.js';
import { installerCanvas, peindre } from './navigateur-factice.js';

// La ligne mediane dans la voie « Convertir une image » (ADR-0021) : elle passe par le meme traitement que vtracer
// (pretraitement, detourage, taille), mais ne charge jamais le traceur.

const chargerTraceur = vi.hoisted(() => vi.fn());
vi.mock('../../../src/io/vtracer.js', () => ({ chargerTraceur }));

afterEach(() => { vi.unstubAllGlobals(); chargerTraceur.mockReset(); });

const NOIR = [10, 10, 10, 255] as const, BLANC = [255, 255, 255, 255] as const;
/** Une croix au trait de 5 px sur fond blanc. */
function croix(): SourceImage {
  return { pixels: peindre(80, 60, (x, y) => (Math.abs(x - 40) <= 2 && y >= 10 && y < 50) || (Math.abs(y - 30) <= 2 && x >= 15 && x < 65) ? NOIR : BLANC), largeur: 80, hauteur: 60 };
}
const mediane = (surcharge: Partial<Traitement> = {}): Traitement => ({ ...TRAITEMENT_DEFAUT, vecteurs: { mode: 'mediane', finesse: 'normale' }, ...surcharge });
const reussite = (r: ImageConvertie | { erreur: string }): ImageConvertie => { if ('erreur' in r) throw new Error(r.erreur); return r; };

describe('traiterImage en ligne mediane', () => {
  it('trace sans charger vtracer, et le resume dit « une ligne au milieu du trait »', async () => {
    installerCanvas();
    const r = reussite(await traiterImage(croix(), mediane()));
    expect(chargerTraceur).not.toHaveBeenCalled();
    expect(r.traces).toBe(2);
    expect(r.matriciel).toBe(false);
    expect(r.ligne?.epaisseur).toBeGreaterThanOrEqual(4);
    expect(resumeConversion(r)).toMatch(/^fond #FFFFFF retiré depuis le bord \(\d+ %\) · 2 tracés · une ligne au milieu du trait · 1 Ko$/);
    const lu = lireDessin(r.svg);
    if ('erreur' in lu) throw new Error(lu.erreur);
    expect(lu.dessin.formes.every(f => f.remplissage === null && f.contour === '#000000')).toBe(true);
  });

  it('lit le meme trait detoure ou non : le fond est la couleur du bord', async () => {
    installerCanvas();
    const avec = reussite(await traiterImage(croix(), mediane()));
    const sans = reussite(await traiterImage(croix(), mediane({ detourer: false })));
    expect(sans.svg).toBe(avec.svg);
  });

  it('agrandie x2, garde la taille de l image d origine et la precision doublee', async () => {
    installerCanvas();
    const r = reussite(await traiterImage(croix(), mediane({ pretraitement: { agrandir: true } })));
    expect(r.svg).toMatch(/viewBox="0 0 160 120" width="80" height="60"/);
    expect(r.traces).toBe(2);
  });

  it('dit pourquoi elle refuse une image sans trait', async () => {
    installerCanvas();
    const vide: SourceImage = { pixels: peindre(20, 20, () => BLANC), largeur: 20, hauteur: 20 };
    expect(await traiterImage(vide, mediane({ detourer: false }))).toEqual({ erreur: expect.stringContaining('Aucun trait trouvé') });
    expect(chargerTraceur).not.toHaveBeenCalled();
  });
});
