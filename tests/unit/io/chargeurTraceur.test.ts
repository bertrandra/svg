import { describe, it, expect, vi } from 'vitest';
import { createContext, runInContext } from 'node:vm';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { convertPixels } from '@visioncortex/vtracer';
import { fabriquerChargeur, FICHIER_VTRACER, messageIntrouvable, type Amenees, type FabriqueTraceur } from '../../../src/io/vtracer.js';
import { optionsTraceur, svgDuTraceur, type OptionsTraceur, type Traceur } from '../../../src/engine/vectorisation.js';

const traceurFactice: Traceur = () => '<svg/>';

/** Un navigateur simule : le script « arrive » (ou non) et pose sa fabrique quand on l'injecte. */
function navigateurSimule(arrive: boolean, fabrique: FabriqueTraceur = async () => traceurFactice) {
  let posee: FabriqueTraceur | undefined;
  const injecter = vi.fn(async () => { if (arrive) posee = fabrique; return arrive; });
  const amenees: Amenees = { injecter, lire: () => posee };
  return { amenees, injecter };
}

describe('le chargeur du traceur', () => {
  it('n ajoute le script qu une fois, meme demande plusieurs fois a la suite', async () => {
    const { amenees, injecter } = navigateurSimule(true);
    const c = fabriquerChargeur(amenees);
    expect(c.pret()).toBe(false);
    const [a, b] = await Promise.all([c.charger(), c.charger()]);
    expect(a).toBe(b);
    await c.charger();
    expect(injecter).toHaveBeenCalledTimes(1);
    expect(injecter).toHaveBeenCalledWith(FICHIER_VTRACER);
    expect(c.pret()).toBe(true);
  });

  it('ne rajoute rien quand la fabrique est deja sur la fenetre', async () => {
    const injecter = vi.fn(async () => true);
    const c = fabriquerChargeur({ injecter, lire: () => async () => traceurFactice });
    expect(await c.charger()).toBe(traceurFactice);
    expect(injecter).not.toHaveBeenCalled();
  });

  it('dit ou poser vtracer.js quand le fichier est introuvable, et repart de rien a l essai suivant', async () => {
    let present = false;
    let posee: FabriqueTraceur | undefined;
    const injecter = vi.fn(async () => { if (present) posee = async () => traceurFactice; return present; });
    const c = fabriquerChargeur({ injecter, lire: () => posee });
    await expect(c.charger()).rejects.toThrow(messageIntrouvable());
    expect(messageIntrouvable()).toContain('vtracer.js');
    expect(messageIntrouvable()).toContain('même dossier');
    expect(c.pret()).toBe(false);
    present = true;
    expect(await c.charger()).toBe(traceurFactice);
    expect(injecter).toHaveBeenCalledTimes(2);
  });

  it('refuse un script arrive sans fabrique', async () => {
    const c = fabriquerChargeur({ injecter: async () => true, lire: () => undefined });
    await expect(c.charger()).rejects.toThrow(/ne contient pas le traceur/);
  });

  it('nomme un WebAssembly refuse par le navigateur, sans garder l echec', async () => {
    let refuse = true;
    const { amenees } = navigateurSimule(true, async () => { if (refuse) throw new Error('CSP bloque wasm'); return traceurFactice; });
    const c = fabriquerChargeur(amenees);
    await expect(c.charger()).rejects.toThrow(/ne démarre pas.*CSP bloque wasm/);
    refuse = false;
    expect(await c.charger()).toBe(traceurFactice);
  });
});

// Le script tel que la page le charge : compile par scripts/vtracer.mjs, execute dans un contexte qui
// n'a que `window`, comme une balise <script>. Il doit rendre, octet pour octet, le SVG du paquet.
describe('dist/vtracer.js', () => {
  const pixels = (l: number, h: number): Uint8Array => {
    const p = new Uint8Array(l * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) {
      let c = [255, 255, 255, 255];
      if ((x - 30) ** 2 + (y - 30) ** 2 < 22 ** 2) c = [200, 30, 40, 255];
      if (x > 60 && x < 95 && y > 15 && y < 50) c = [20, 40, 160, 255];
      p.set(c, (y * l + x) * 4);
    }
    return p;
  };

  it('pose la fabrique sur la fenetre et trace exactement comme le paquet', async () => {
    const module = (await import(pathToFileURL(resolve(__dirname, '../../../scripts/vtracer.mjs')).href)) as { compilerVtracer: () => Promise<string> };
    const texte = await module.compilerVtracer();
    const fenetre: { __vtracerSvg?: FabriqueTraceur } = {};
    const contexte = createContext({ window: fenetre, WebAssembly, TextDecoder, TextEncoder, console });
    runInContext(texte, contexte);
    expect(typeof fenetre.__vtracerSvg).toBe('function');
    const traceur = await (fenetre.__vtracerSvg as FabriqueTraceur)();
    const l = 100, h = 60, rgba = pixels(l, h);
    const reglages: OptionsTraceur[] = [
      optionsTraceur('aplats', 'normale', ['#c81e28', '#1428a0', '#ffffff']),
      optionsTraceur('trait', 'fine'),
      optionsTraceur('fidele', 'lisse'),
      optionsTraceur('aplats', 'normale', ['#c81e28', '#1428a0', '#ffffff'], { courbes: 'polygon', simplify: 3 })
    ];
    for (const o of reglages) {
      expect(svgDuTraceur(traceur(rgba, l, h, o))).toBe(svgDuTraceur(convertPixels(rgba, l, h, o)));
    }
  }, 30000);
});
