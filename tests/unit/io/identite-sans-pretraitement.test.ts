import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { convertPixels } from '@visioncortex/vtracer';
import { traiterImage, type SourceImage } from '../../../src/io/image.js';
import { TRAITEMENT_DEFAUT, type Traceur, type Traitement } from '../../../src/engine/vectorisation.js';
import { installerCanvas } from './navigateur-factice.js';
import { logo, logoBruite, photo } from '../engine/images-synthetiques.js';

// Sans aucun pretraitement touche, la sortie est celle d'avant l'atelier de pretraitement, a l'octet :
// ces empreintes ont ete relevees sur le depot AVANT d'y ajouter le pretraitement. Les changer est un
// evenement de version majeure (CLAUDE.md), jamais une correction.

const chargerTraceur = vi.hoisted(() => vi.fn());
vi.mock('../../../src/io/vtracer.js', () => ({ chargerTraceur }));
const vtracer: Traceur = (rgba, l, h, o) => convertPixels(rgba, l, h, o);

afterEach(() => { vi.unstubAllGlobals(); chargerTraceur.mockReset(); });

const source = (i: { data: Uint8ClampedArray; largeur: number; hauteur: number }): SourceImage => ({ pixels: i.data, largeur: i.largeur, hauteur: i.hauteur });
const sha = (t: string) => createHash('sha256').update(t).digest('hex').slice(0, 16);

const IMAGES: Record<string, () => SourceImage> = { logo: () => source(logo()), bruite: () => source(logoBruite()), photo: () => source(photo()) };
const TRAITEMENTS: Record<string, Traitement> = {
  aplats: TRAITEMENT_DEFAUT,
  trait: { ...TRAITEMENT_DEFAUT, vecteurs: { mode: 'trait', finesse: 'fine' } },
  fidele: { ...TRAITEMENT_DEFAUT, vecteurs: { mode: 'fidele', finesse: 'lisse' } },
  gardeFond: { ...TRAITEMENT_DEFAUT, detourer: false, vecteurs: { mode: 'aplats', finesse: 'normale', fins: { couleursMax: 3, courbes: 'polygon' } } },
  enveloppe: { ...TRAITEMENT_DEFAUT, vecteurs: null }
};

const EMPREINTES: Record<string, string> = {
  'logo/aplats': 'd11f49646ad7ffe2',
  'logo/trait': '3b3b7b841473cf0e',
  'logo/fidele': '024fe07f015e69d1',
  'logo/gardeFond': '17eb904c22b8b024',
  'logo/enveloppe': 'e787669c94febe05',
  'bruite/aplats': 'f7be481e4baec52b',
  'bruite/trait': '09678dc85062b242',
  'bruite/fidele': 'e31d854eb1d9d945',
  'bruite/gardeFond': 'dd6da9a194bc7b40',
  'bruite/enveloppe': '4d4e1007bc85a322',
  'photo/aplats': '3244cf1a1c82e9fd',
  'photo/trait': '651625d8fda5b463',
  'photo/fidele': 'dd8e54be4b6710db',
  'photo/gardeFond': '527da93a1bc05c59',
  'photo/enveloppe': '1d2280e12fb0b719'
};

describe('sortie sans pretraitement', () => {
  for (const [ni, image] of Object.entries(IMAGES)) {
    for (const [nt, t] of Object.entries(TRAITEMENTS)) {
      it(`${ni} / ${nt} rend le meme SVG qu avant`, async () => {
        installerCanvas();
        const r = await traiterImage(image(), t, vtracer);
        const svg = 'erreur' in r ? 'erreur:' + r.erreur : r.svg;
        if (process.env['RELEVER_EMPREINTES']) console.log(`  '${ni}/${nt}': '${sha(svg)}',`);
        else expect(sha(svg)).toBe(EMPREINTES[`${ni}/${nt}`]);
      });
    }
  }
});
